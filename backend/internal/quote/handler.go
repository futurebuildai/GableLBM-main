package quote

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"regexp"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/pagination"
	"github.com/google/uuid"
)

// safeFilename strips any characters that are not alphanumeric, hyphens,
// underscores, or dots to prevent header injection in Content-Disposition.
var unsafeFilenameChars = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

func sanitizeFilename(name string) string {
	return unsafeFilenameChars.ReplaceAllString(name, "_")
}

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/quotes", guard(h.HandleCreateQuote))
	mux.HandleFunc("GET /api/v1/quotes/analytics", guard(h.HandleGetAnalytics))
	mux.HandleFunc("GET /api/v1/quotes", guard(h.HandleListQuotes))
	mux.HandleFunc("GET /api/v1/quotes/{id}", guard(h.HandleGetQuotePath))
	mux.HandleFunc("GET /api/v1/quotes/{id}/file", guard(h.HandleDownloadOriginalFile))
	mux.HandleFunc("PUT /api/v1/quotes/{id}", guard(h.HandleUpdateQuote))
	mux.HandleFunc("PUT /api/v1/quotes/{id}/state", guard(h.HandleUpdateState))
	mux.HandleFunc("POST /api/v1/quotes/{id}/convert", guard(h.HandleConvertToOrder))
}

// createQuoteRequest is the JSON payload for creating a quote.
// It mirrors Quote but accepts original_file as a base64 string.
type createQuoteRequest struct {
	Quote
	OriginalFileB64 string `json:"original_file,omitempty"`
}

func (h *Handler) HandleCreateQuote(w http.ResponseWriter, r *http.Request) {
	var req createQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	q := &req.Quote

	// Decode base64 original file if provided
	if req.OriginalFileB64 != "" {
		data, err := base64.StdEncoding.DecodeString(req.OriginalFileB64)
		if err == nil {
			if len(data) > 5<<20 {
				httputil.RespondError(w, r, "original file exceeds 5MB limit", http.StatusBadRequest, nil)
				return
			}
			q.OriginalFile = data
		}
	}

	if err := h.service.CreateQuote(r.Context(), q); err != nil {
		httputil.RespondError(w, r, "failed to create quote", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(q)
}

func (h *Handler) HandleGetQuotePath(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	q, err := h.service.GetQuote(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get quote", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(q)
}

func (h *Handler) HandleListQuotes(w http.ResponseWriter, r *http.Request) {
	page := pagination.FromRequest(r)
	quotes, total, err := h.service.ListQuotesPaginated(r.Context(), page.Limit, page.Offset)
	if err != nil {
		httputil.RespondError(w, r, "failed to list quotes", http.StatusInternalServerError, err)
		return
	}

	resp := pagination.PagedResponse[Quote]{
		Data:   quotes,
		Total:  total,
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if resp.Data == nil {
		resp.Data = []Quote{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) HandleConvertToOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	q, err := h.service.GetQuote(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Quote not found", http.StatusNotFound, err)
		return
	}

	if q.State != QuoteStateDraft && q.State != QuoteStateSent && q.State != QuoteStateAccepted {
		httputil.RespondError(w, r, "Quote cannot be converted in its current state", http.StatusBadRequest, nil)
		return
	}

	// Build order creation payload from quote
	type OrderLinePayload struct {
		ProductID uuid.UUID `json:"product_id"`
		Quantity  float64   `json:"quantity"`
		PriceEach float64   `json:"price_each"`
	}
	type OrderPayload struct {
		CustomerID uuid.UUID          `json:"customer_id"`
		QuoteID    *uuid.UUID         `json:"quote_id"`
		Lines      []OrderLinePayload `json:"lines"`
	}

	payload := OrderPayload{
		CustomerID: q.CustomerID,
		QuoteID:    &q.ID,
	}
	for _, line := range q.Lines {
		payload.Lines = append(payload.Lines, OrderLinePayload{
			ProductID: line.ProductID,
			Quantity:  line.Quantity,
			PriceEach: line.UnitPrice,
		})
	}

	// Mark quote as ACCEPTED
	if err := h.service.UpdateState(r.Context(), id, QuoteStateAccepted); err != nil {
		httputil.RespondError(w, r, "failed to update quote state", http.StatusInternalServerError, err)
		return
	}

	// Return the order payload - the frontend will POST it to /orders
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

func (h *Handler) HandleUpdateQuote(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	var req createQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	q := &req.Quote
	q.ID = id

	if err := h.service.UpdateQuote(r.Context(), q); err != nil {
		if err.Error() == "only DRAFT quotes can be edited" {
			httputil.RespondError(w, r, "only DRAFT quotes can be edited", http.StatusBadRequest, err)
		} else {
			httputil.RespondError(w, r, "failed to update quote", http.StatusInternalServerError, err)
		}
		return
	}

	// Return updated quote with lines
	updated, err := h.service.GetQuote(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get updated quote", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

func (h *Handler) HandleUpdateState(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	var body struct {
		State QuoteState `json:"state"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.UpdateState(r.Context(), id, body.State); err != nil {
		httputil.RespondError(w, r, "failed to update quote state", http.StatusBadRequest, err)
		return
	}

	// Return updated quote
	q, err := h.service.GetQuote(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get quote after state update", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(q)
}

func (h *Handler) HandleGetAnalytics(w http.ResponseWriter, r *http.Request) {
	analytics, err := h.service.GetAnalytics(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to get quote analytics", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analytics)
}

func (h *Handler) HandleDownloadOriginalFile(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	data, filename, contentType, err := h.service.GetOriginalFile(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "File not found", http.StatusNotFound, err)
		return
	}
	if len(data) == 0 {
		httputil.RespondError(w, r, "No original file stored for this quote", http.StatusNotFound, nil)
		return
	}

	if filename == "" {
		filename = "original-upload"
	}
	filename = sanitizeFilename(filename)

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+filename+"\"")
	w.Write(data)
}
