package pricing

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// IndexAdminHandler serves the buyer/admin endpoints for managing market
// indices: applying a new value (with history + scan kickoff), previewing
// impact, editing metadata, and fetching the history time-series.
type IndexAdminHandler struct {
	escalators EscalatorRepository
	exposure   ExposureRepository
	scanner    *ExposureScanner
}

func NewIndexAdminHandler(escalators EscalatorRepository, exposure ExposureRepository, scanner *ExposureScanner) *IndexAdminHandler {
	return &IndexAdminHandler{escalators: escalators, exposure: exposure, scanner: scanner}
}

func (h *IndexAdminHandler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/market-indices/{id}/refresh", guard(h.HandleRefresh))
	mux.HandleFunc("POST /api/v1/market-indices/{id}/refresh/preview", guard(h.HandlePreviewRefresh))
	mux.HandleFunc("PUT /api/v1/market-indices/{id}", guard(h.HandleUpdateMetadata))
	mux.HandleFunc("GET /api/v1/market-indices/{id}/history", guard(h.HandleGetHistory))
}

// HandleRefresh applies a new value, writes a market_index_history row, and
// synchronously kicks the scanner. The scanner itself is bounded by the
// number of active escalators on the index — typically subsecond, but bounded
// by the request timeout in any case.
func (h *IndexAdminHandler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	indexID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}

	var req IndexRefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}
	if req.NewValue <= 0 {
		httputil.RespondError(w, r, "new_value must be > 0", http.StatusBadRequest, nil)
		return
	}
	if req.Source == "" {
		req.Source = "MANUAL"
	}

	idx, err := h.escalators.GetMarketIndex(r.Context(), indexID)
	if err != nil {
		httputil.RespondError(w, r, "failed to load market index", http.StatusInternalServerError, err)
		return
	}
	if idx == nil {
		httputil.RespondError(w, r, "market index not found", http.StatusNotFound, nil)
		return
	}

	// Update market_indices.current_value (and shift previous).
	prev := idx.CurrentValue
	idx.PreviousValue = &prev
	idx.CurrentValue = req.NewValue
	if err := h.escalators.UpdateMarketIndex(r.Context(), idx); err != nil {
		httputil.RespondError(w, r, "failed to update market index", http.StatusInternalServerError, err)
		return
	}

	hist := &MarketIndexHistory{
		MarketIndexID: indexID,
		Value:         req.NewValue,
		Source:        req.Source,
		RecordedBy:    userIDString(r),
	}
	if err := h.exposure.InsertHistory(r.Context(), hist); err != nil {
		httputil.RespondError(w, r, "failed to write history", http.StatusInternalServerError, err)
		return
	}

	// Kick the scanner synchronously. Notes from req are not propagated yet —
	// add to the history.notes column in a follow-up if needed.
	if h.scanner != nil {
		if err := h.scanner.OnMarketIndexUpdated(r.Context(), indexID, hist.ID); err != nil {
			// Don't fail the request — the history row is written and the
			// safety-net cron will re-evaluate. Log via stdlib slog default.
			httputil.RespondError(w, r, "scan kicked but had errors", http.StatusOK, err)
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"market_index": idx,
		"history_id":   hist.ID,
		"scan_kicked":  true,
	})
}

// HandlePreviewRefresh runs the same calculation as Refresh but writes
// nothing. Returns the would-be impact (count of affected quotes, total
// estimated exposure, top affected customers).
func (h *IndexAdminHandler) HandlePreviewRefresh(w http.ResponseWriter, r *http.Request) {
	indexID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	var req IndexRefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}
	if req.NewValue <= 0 {
		httputil.RespondError(w, r, "new_value must be > 0", http.StatusBadRequest, nil)
		return
	}

	idx, err := h.escalators.GetMarketIndex(r.Context(), indexID)
	if err != nil {
		httputil.RespondError(w, r, "failed to load market index", http.StatusInternalServerError, err)
		return
	}
	if idx == nil {
		httputil.RespondError(w, r, "market index not found", http.StatusNotFound, nil)
		return
	}

	escalators, err := h.exposure.ListActiveEscalatorsForIndex(r.Context(), indexID)
	if err != nil {
		httputil.RespondError(w, r, "failed to load escalators", http.StatusInternalServerError, err)
		return
	}

	preview := IndexRefreshPreview{}
	if idx.CurrentValue > 0 {
		preview.DeltaPct = (req.NewValue - idx.CurrentValue) / idx.CurrentValue * 100
	}

	perCustomer := map[uuid.UUID]*IndexRefreshTopCustomer{}
	for i := range escalators {
		ewc := &escalators[i]
		pe := &ewc.Escalator
		if pe.BaseIndexValue == nil || *pe.BaseIndexValue <= 0 {
			continue
		}
		ratio := req.NewValue / *pe.BaseIndexValue
		exposure := (ratio - 1.0) * pe.BasePrice * ewc.LineQuantity
		if exposure < 0 {
			exposure = -exposure
		}
		preview.AffectedQuoteCount++
		preview.EstimatedExposureDollars += exposure

		c, ok := perCustomer[ewc.CustomerID]
		if !ok {
			c = &IndexRefreshTopCustomer{
				CustomerID:   ewc.CustomerID,
				CustomerName: ewc.CustomerName,
			}
			perCustomer[ewc.CustomerID] = c
		}
		c.ExposureDollars += exposure
		c.QuoteCount++
	}
	preview.AffectedCustomerCount = len(perCustomer)

	// Top 5 by exposure dollars.
	for _, c := range perCustomer {
		preview.TopCustomers = append(preview.TopCustomers, *c)
	}
	// Simple selection sort to find top 5; small N so no need for sort.Slice.
	for i := 0; i < len(preview.TopCustomers) && i < 5; i++ {
		maxIdx := i
		for j := i + 1; j < len(preview.TopCustomers); j++ {
			if preview.TopCustomers[j].ExposureDollars > preview.TopCustomers[maxIdx].ExposureDollars {
				maxIdx = j
			}
		}
		if maxIdx != i {
			preview.TopCustomers[i], preview.TopCustomers[maxIdx] = preview.TopCustomers[maxIdx], preview.TopCustomers[i]
		}
	}
	if len(preview.TopCustomers) > 5 {
		preview.TopCustomers = preview.TopCustomers[:5]
	}

	writeJSON(w, http.StatusOK, preview)
}

// HandleUpdateMetadata edits an index's display metadata or active flag.
// Value changes go through Refresh.
func (h *IndexAdminHandler) HandleUpdateMetadata(w http.ResponseWriter, r *http.Request) {
	indexID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	var body struct {
		Name        string `json:"name,omitempty"`
		Description string `json:"description,omitempty"`
		IsActive    *bool  `json:"is_active,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}
	idx, err := h.escalators.GetMarketIndex(r.Context(), indexID)
	if err != nil {
		httputil.RespondError(w, r, "failed to load market index", http.StatusInternalServerError, err)
		return
	}
	if idx == nil {
		httputil.RespondError(w, r, "market index not found", http.StatusNotFound, nil)
		return
	}
	isActive := idx.IsActive
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	if err := h.escalators.UpdateMarketIndexMetadata(r.Context(), indexID, body.Name, body.Description, isActive); err != nil {
		httputil.RespondError(w, r, "failed to update", http.StatusInternalServerError, err)
		return
	}
	updated, _ := h.escalators.GetMarketIndex(r.Context(), indexID)
	writeJSON(w, http.StatusOK, updated)
}

// HandleGetHistory returns the time series for chart rendering.
func (h *IndexAdminHandler) HandleGetHistory(w http.ResponseWriter, r *http.Request) {
	indexID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}
	days := 90
	if d := r.URL.Query().Get("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 && n <= 730 {
			days = n
		}
	}
	from := time.Now().AddDate(0, 0, -days)
	to := time.Now()
	points, err := h.exposure.ListHistory(r.Context(), indexID, from, to)
	if err != nil {
		httputil.RespondError(w, r, "failed to load history", http.StatusInternalServerError, err)
		return
	}
	if points == nil {
		points = []MarketIndexHistory{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"market_index_id": indexID,
		"from":            from.UTC(),
		"to":              to.UTC(),
		"points":          points,
	})
}
