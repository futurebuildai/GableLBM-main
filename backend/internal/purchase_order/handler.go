package purchase_order

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
	recSvc  *RecommendationService
}

func NewHandler(service *Service, recSvc *RecommendationService) *Handler {
	return &Handler{service: service, recSvc: recSvc}
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

	mux.HandleFunc("GET /api/v1/purchase-orders", guard(h.HandleListPOs))
	mux.HandleFunc("POST /api/v1/purchase-orders", guard(h.HandleCreatePO))
	mux.HandleFunc("GET /api/v1/purchase-orders/recommendations", guard(h.HandleGetRecommendations))
	mux.HandleFunc("GET /api/v1/purchase-orders/source-summary", guard(h.HandleSourceSummary))
	mux.HandleFunc("GET /api/v1/purchase-orders/{id}", guard(h.HandleGetPO))
	mux.HandleFunc("POST /api/v1/purchase-orders/{id}/submit", guard(h.HandleSubmitPO))
	mux.HandleFunc("POST /api/v1/purchase-orders/{id}/receive", guard(h.HandleReceivePO))
	mux.HandleFunc("POST /api/v1/purchase-orders/reorder-check", guard(h.HandleCreateReorders))
	mux.HandleFunc("POST /api/v1/purchase-orders/refresh-reorder-targets", guard(h.HandleRefreshReorderTargets))
	mux.HandleFunc("GET /api/v1/purchase-orders/reorder-runs", guard(h.HandleListReorderRuns))
	mux.HandleFunc("POST /api/v1/purchase-orders/{id}/freight", guard(h.HandleUploadFreight))
	mux.HandleFunc("POST /api/v1/purchase-orders/{id}/freight/{freightId}/apply", guard(h.HandleApplyFreight))
	mux.HandleFunc("GET /api/v1/purchase-orders/{id}/freight", guard(h.HandleListFreight))
}

func (h *Handler) HandleListPOs(w http.ResponseWriter, r *http.Request) {
	pos, err := h.service.ListPOs(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list purchase orders", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pos)
}

type CreatePORequest struct {
	VendorID string         `json:"vendor_id"`
	Lines    []CreatePOLine `json:"lines"`
}

type CreatePOLine struct {
	ProductID   string  `json:"product_id"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	Cost        float64 `json:"cost"`
}

func (h *Handler) HandleCreatePO(w http.ResponseWriter, r *http.Request) {
	var req CreatePORequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	vendorID, err := uuid.Parse(req.VendorID)
	if err != nil {
		httputil.RespondError(w, r, "Invalid vendor_id", http.StatusBadRequest, err)
		return
	}

	lines := make([]CreatePOLineInput, len(req.Lines))
	for i, l := range req.Lines {
		lines[i] = CreatePOLineInput{
			ProductID:   l.ProductID,
			Description: l.Description,
			Quantity:    l.Quantity,
			Cost:        l.Cost,
		}
	}

	po, err := h.service.CreateManualPOFromHandler(r.Context(), vendorID, lines, SourceManual)
	if err != nil {
		httputil.RespondError(w, r, "failed to create purchase order", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(po)
}

func (h *Handler) HandleGetPO(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	po, err := h.service.GetPO(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get purchase order", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(po)
}

func (h *Handler) HandleSubmitPO(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	if err := h.service.SubmitPO(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to submit purchase order", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "submitted"})
}

type ReceiveLineRequest struct {
	LineID      string  `json:"line_id"`
	QtyReceived float64 `json:"qty_received"`
	LocationID  string  `json:"location_id"`
}

type ReceivePORequest struct {
	Lines []ReceiveLineRequest `json:"lines"`
}

func (h *Handler) HandleReceivePO(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID format", http.StatusBadRequest, err)
		return
	}

	var req ReceivePORequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	lines := make([]ReceiveLineInput, len(req.Lines))
	for i, l := range req.Lines {
		lines[i] = ReceiveLineInput{
			LineID:      l.LineID,
			QtyReceived: l.QtyReceived,
			LocationID:  l.LocationID,
		}
	}

	if err := h.service.ReceivePO(r.Context(), id, lines); err != nil {
		httputil.RespondError(w, r, "failed to receive purchase order", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "received"})
}

func (h *Handler) HandleCreateReorders(w http.ResponseWriter, r *http.Request) {
	count, err := h.service.CreateReorders(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to create reorder purchase orders", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"count":  count,
	})
}

// HandleRefreshReorderTargets manually triggers the reorder-target recompute
// (the same logic the scheduler runs on cron). Body: {"dry_run": bool,
// "lookback_days": int} — both optional. Defaults to dry_run=true so the
// curl-once-and-look workflow can't accidentally rewrite the catalog.
func (h *Handler) HandleRefreshReorderTargets(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DryRun       *bool `json:"dry_run"`
		LookbackDays int   `json:"lookback_days"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	dryRun := true
	if req.DryRun != nil {
		dryRun = *req.DryRun
	}
	result, err := h.service.RefreshReorderTargets(r.Context(), dryRun, req.LookbackDays)
	if err != nil {
		httputil.RespondError(w, r, "failed to refresh reorder targets", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HandleListReorderRuns returns the most recent reorder-cron executions
// (refresh_targets and create_reorders) for the operator dashboard.
func (h *Handler) HandleListReorderRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.service.ListReorderRuns(r.Context(), 50)
	if err != nil {
		httputil.RespondError(w, r, "failed to list reorder runs", http.StatusInternalServerError, err)
		return
	}
	if runs == nil {
		runs = []ReorderRun{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(runs)
}

// HandleSourceSummary returns PO counts grouped by source so the purchasing
// dashboard can render the "% replenishments automated" KPI.
func (h *Handler) HandleSourceSummary(w http.ResponseWriter, r *http.Request) {
	counts, err := h.service.GetSourceSummary(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to load PO source summary", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(counts)
}

// HandleGetRecommendations returns AI-driven purchasing recommendations
// based on sales velocity, stock levels, and lead times.
func (h *Handler) HandleGetRecommendations(w http.ResponseWriter, r *http.Request) {
	if h.recSvc == nil {
		httputil.RespondError(w, r, "Recommendation service not configured", http.StatusServiceUnavailable, nil)
		return
	}

	summary, err := h.recSvc.GenerateRecommendations(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to generate purchase recommendations", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

// HandleUploadFreight processes a freight invoice upload for a received PO.
func (h *Handler) HandleUploadFreight(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	poID, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid PO ID", http.StatusBadRequest, err)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		httputil.RespondError(w, r, "File too large or invalid form data", http.StatusBadRequest, err)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httputil.RespondError(w, r, "Missing 'file' field in form data", http.StatusBadRequest, err)
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(io.LimitReader(file, 10<<20))
	if err != nil {
		httputil.RespondError(w, r, "Failed to read uploaded file", http.StatusInternalServerError, err)
		return
	}

	contentType := http.DetectContentType(fileBytes)

	slog.Info("Freight invoice upload",
		"po_id", poID,
		"filename", header.Filename,
		"size_bytes", header.Size,
		"content_type", contentType,
	)

	result, err := h.service.UploadFreightInvoice(r.Context(), poID, fileBytes, contentType, header.Filename)
	if err != nil {
		httputil.RespondError(w, r, "failed to upload freight invoice", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HandleApplyFreight applies a pending freight charge to product costs.
func (h *Handler) HandleApplyFreight(w http.ResponseWriter, r *http.Request) {
	poID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid PO ID", http.StatusBadRequest, err)
		return
	}

	freightID, err := uuid.Parse(r.PathValue("freightId"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid freight charge ID", http.StatusBadRequest, err)
		return
	}

	if err := h.service.ApplyFreightCharge(r.Context(), poID, freightID); err != nil {
		httputil.RespondError(w, r, "failed to apply freight charge", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "applied"})
}

// HandleListFreight returns all freight charges for a PO.
func (h *Handler) HandleListFreight(w http.ResponseWriter, r *http.Request) {
	poID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid PO ID", http.StatusBadRequest, err)
		return
	}

	charges, err := h.service.GetFreightCharges(r.Context(), poID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list freight charges", http.StatusInternalServerError, err)
		return
	}

	if charges == nil {
		charges = []FreightCharge{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(charges)
}
