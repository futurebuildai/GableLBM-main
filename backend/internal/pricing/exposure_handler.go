package pricing

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

// ExposureHandler serves the salesperson/owner exposure endpoints, plus the
// per-quote acknowledge/override/request-ack/escalate-now actions and the
// admin scan trigger.
type ExposureHandler struct {
	scanner  *ExposureScanner
	checker  ExposureChecker
	exposure ExposureRepository
	svc      *ExposureService
}

func NewExposureHandler(scanner *ExposureScanner, checker ExposureChecker, exposure ExposureRepository, svc *ExposureService) *ExposureHandler {
	return &ExposureHandler{scanner: scanner, checker: checker, exposure: exposure, svc: svc}
}

func (h *ExposureHandler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("GET /api/v1/quotes/exposure", guard(h.HandleListExposure))
	mux.HandleFunc("GET /api/v1/quotes/{id}/exposure", guard(h.HandleGetQuoteExposure))
	mux.HandleFunc("POST /api/v1/quotes/{id}/exposure/acknowledge", guard(h.HandleAcknowledge))
	mux.HandleFunc("POST /api/v1/quotes/{id}/exposure/request-ack", guard(h.HandleRequestAck))
	mux.HandleFunc("POST /api/v1/quotes/{id}/exposure/override", guard(h.HandleOverride))
	mux.HandleFunc("POST /api/v1/quotes/{id}/exposure/escalate-now", guard(h.HandleEscalateNow))
	mux.HandleFunc("GET /api/v1/reports/exposure", guard(h.HandleReportExposure))
	mux.HandleFunc("POST /api/v1/admin/exposure-scan", guard(h.HandleAdminScan))
}

// ---------- GET /api/v1/quotes/exposure ----------

func (h *ExposureHandler) HandleListExposure(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ownerParam := q.Get("owner")
	stateParam := q.Get("state")
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	summary := q.Get("summary") == "true"

	role := userRole(r)
	uid := userID(r)

	var spFilter *uuid.UUID
	switch ownerParam {
	case "", "me":
		// Default: scope to caller's book. Non-owner/admin roles MUST have a
		// resolvable salesperson UUID — otherwise fall-through to nil would
		// leak the entire portfolio to anyone signed in with an opaque JWT
		// subject. Owners/admins without a UUID are intentionally allowed
		// (they see everything).
		if uid != uuid.Nil {
			id := uid
			spFilter = &id
		} else if role != "owner" && role != "admin" {
			httputil.RespondError(w, r, "no salesperson context — cannot scope to your book", http.StatusForbidden, nil)
			return
		}
	case "all":
		if role != "owner" && role != "admin" {
			httputil.RespondError(w, r, "owner=all requires owner or admin role", http.StatusForbidden, nil)
			return
		}
		spFilter = nil
	default:
		// Explicit salesperson_id
		id, err := uuid.Parse(ownerParam)
		if err != nil {
			httputil.RespondError(w, r, "invalid owner id", http.StatusBadRequest, err)
			return
		}
		if role == "sales" && id != uid {
			httputil.RespondError(w, r, "cannot view another salesperson's book", http.StatusForbidden, nil)
			return
		}
		spFilter = &id
	}

	var states []string
	if stateParam != "" {
		states = splitCsv(stateParam)
	}

	// Optional finer-grained filters: customer_id, index_code, min_dollars.
	filter := ExposureFilter{
		SalespersonID: spFilter,
		States:        states,
		IndexCode:     q.Get("index_code"),
		Limit:         limit,
		Offset:        offset,
	}
	if cidStr := q.Get("customer_id"); cidStr != "" {
		cid, err := uuid.Parse(cidStr)
		if err != nil {
			httputil.RespondError(w, r, "invalid customer_id", http.StatusBadRequest, err)
			return
		}
		filter.CustomerID = &cid
	}
	if mdStr := q.Get("min_dollars"); mdStr != "" {
		md, err := strconv.ParseFloat(mdStr, 64)
		if err != nil || md < 0 {
			httputil.RespondError(w, r, "invalid min_dollars", http.StatusBadRequest, err)
			return
		}
		filter.MinDollars = md
	}

	rows, err := h.exposure.ListExposureForOwner(r.Context(), filter)
	if err != nil {
		httputil.RespondError(w, r, "failed to list exposure", http.StatusInternalServerError, err)
		return
	}

	if summary {
		total := 0.0
		for _, row := range rows {
			total += row.ExposureDollars
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"count":         len(rows),
			"total_dollars": math.Round(total*100) / 100,
		})
		return
	}

	if rows == nil {
		rows = []ExposureRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": rows,
		"total": len(rows),
	})
}

// ---------- GET /api/v1/quotes/{id}/exposure ----------

func (h *ExposureHandler) HandleGetQuoteExposure(w http.ResponseWriter, r *http.Request) {
	quoteID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}

	status, err := h.checker.CheckQuoteExposure(r.Context(), quoteID)
	if err != nil {
		httputil.RespondError(w, r, "failed to load exposure", http.StatusInternalServerError, err)
		return
	}
	events, err := h.exposure.GetEventsByQuote(r.Context(), quoteID)
	if err != nil {
		httputil.RespondError(w, r, "failed to load events", http.StatusInternalServerError, err)
		return
	}
	if events == nil {
		events = []QuoteExposureEvent{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"quote_id":         status.QuoteID,
		"exposure_state":   status.State,
		"exposure_dollars": status.ExposureDollars,
		"last_checked_at":  status.LastCheckedAt,
		"indexes":          status.Indexes,
		"required_action":  status.RequiredAction,
		"events":           events,
	})
}

// ---------- POST acknowledge / request-ack / override / escalate-now ----------

func (h *ExposureHandler) HandleAcknowledge(w http.ResponseWriter, r *http.Request) {
	quoteID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	actor := userIDString(r)
	if actor == "" {
		httputil.RespondError(w, r, "authentication required", http.StatusUnauthorized, nil)
		return
	}
	var req AcknowledgmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}
	ev, err := h.svc.Acknowledge(r.Context(), quoteID, req, actor, userRole(r))
	if err != nil {
		mapServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"event_id":           ev.ID,
		"quote_id":           quoteID,
		"new_exposure_state": "ACKNOWLEDGED",
	})
}

func (h *ExposureHandler) HandleRequestAck(w http.ResponseWriter, r *http.Request) {
	quoteID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	actor := userIDString(r)
	if actor == "" {
		httputil.RespondError(w, r, "authentication required", http.StatusUnauthorized, nil)
		return
	}
	ev, err := h.svc.RequestAck(r.Context(), quoteID, actor, userRole(r))
	if err != nil {
		mapServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"event_id":             ev.ID,
		"salesperson_notified": true,
	})
}

func (h *ExposureHandler) HandleOverride(w http.ResponseWriter, r *http.Request) {
	role := userRole(r)
	if role != "owner" && role != "admin" {
		httputil.RespondError(w, r, "override requires owner or admin role", http.StatusForbidden, nil)
		return
	}
	actor := userIDString(r)
	if actor == "" {
		httputil.RespondError(w, r, "authentication required", http.StatusUnauthorized, nil)
		return
	}
	quoteID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	var req OverrideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}
	ev, err := h.svc.Override(r.Context(), quoteID, req, actor, role)
	if err != nil {
		mapServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"event_id":           ev.ID,
		"new_exposure_state": "OVERRIDDEN",
	})
}

func (h *ExposureHandler) HandleEscalateNow(w http.ResponseWriter, r *http.Request) {
	quoteID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	res, err := h.svc.EscalateNowPreview(r.Context(), quoteID)
	if err != nil {
		httputil.RespondError(w, r, "failed to compute preview", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// ---------- GET /api/v1/reports/exposure ----------

func (h *ExposureHandler) HandleReportExposure(w http.ResponseWriter, r *http.Request) {
	summary := r.URL.Query().Get("summary") == "true"
	role := userRole(r)

	var spFilter *uuid.UUID
	if role == "sales" {
		id := userID(r)
		if id != uuid.Nil {
			spFilter = &id
		}
	}

	rollup, err := h.exposure.PortfolioRollup(r.Context(), spFilter)
	if err != nil {
		httputil.RespondError(w, r, "failed to load portfolio rollup", http.StatusInternalServerError, err)
		return
	}
	if rollup == nil {
		rollup = &PortfolioSummary{}
	}
	if summary {
		writeJSON(w, http.StatusOK, map[string]any{
			"total_exposure_dollars": rollup.TotalExposureDollars,
			"total_quotes":           rollup.TotalQuotes,
			"total_customers":        rollup.TotalCustomers,
		})
		return
	}
	writeJSON(w, http.StatusOK, rollup)
}

// ---------- POST /api/v1/admin/exposure-scan ----------

func (h *ExposureHandler) HandleAdminScan(w http.ResponseWriter, r *http.Request) {
	if role := userRole(r); role != "admin" && role != "owner" {
		httputil.RespondError(w, r, "admin scan requires admin or owner role", http.StatusForbidden, nil)
		return
	}
	// Body is optional; we run a full safety-net scan unconditionally.
	if err := h.scanner.RunSafetyNet(r.Context()); err != nil {
		httputil.RespondError(w, r, "scanner failed", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- helpers ----------

func mapServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, errNotesTooShort):
		httputil.RespondError(w, r, err.Error(), http.StatusBadRequest, nil)
	case errors.Is(err, errInvalidAckMethod):
		httputil.RespondError(w, r, err.Error(), http.StatusBadRequest, nil)
	case errors.Is(err, errAlreadyCleared):
		httputil.RespondError(w, r, err.Error(), http.StatusConflict, nil)
	default:
		httputil.RespondError(w, r, "internal server error", http.StatusInternalServerError, err)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func splitCsv(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// devActor is the synthetic actor recorded for write actions in dev mode
// (AUTH_MODE=dev), where no JWT is present. Mirrors the scanner's "system".
const devActor = "dev"

// Dev-mode note: when AUTH_MODE=dev the auth middleware is not mounted, so
// requests reach these handlers with nil claims. In production such requests
// are rejected with 401 upstream (exposure routes are NOT in the public-path
// whitelist), so nil claims here can only mean dev mode. We therefore treat
// the dev caller as a full owner — consistent with the documented dev-mode
// pass-through in which the seeded demo@gable.com user acts as admin/owner.
// This never relaxes production access: in prod, claims are always non-nil.

// userID / userRole / userIDString read JWT claims set by the auth
// middleware. Defensive — empty/zero on missing claims.
func userID(r *http.Request) uuid.UUID {
	claims, _ := r.Context().Value(middleware.UserContextKey).(*middleware.UserClaims)
	if claims == nil {
		return uuid.Nil
	}
	if id, err := uuid.Parse(claims.Subject); err == nil {
		return id
	}
	return uuid.Nil
}

func userIDString(r *http.Request) string {
	claims, _ := r.Context().Value(middleware.UserContextKey).(*middleware.UserClaims)
	if claims == nil {
		return devActor // dev mode (see Dev-mode note above)
	}
	return claims.Subject
}

// userRole returns the effective role for authorization decisions: the
// single-valued "role" claim if present, else the first entry of "roles".
func userRole(r *http.Request) string {
	claims, _ := r.Context().Value(middleware.UserContextKey).(*middleware.UserClaims)
	if claims == nil {
		return "owner" // dev mode (see Dev-mode note above)
	}
	if claims.Role != "" {
		return claims.Role
	}
	if len(claims.Roles) > 0 {
		return claims.Roles[0]
	}
	return ""
}
