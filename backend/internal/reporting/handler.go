package reporting

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

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

	mux.HandleFunc("GET /api/v1/reports/daily-till", guard(h.HandleDailyTill))
	mux.HandleFunc("GET /api/v1/reports/sales-summary", guard(h.HandleSalesSummary))
	mux.HandleFunc("GET /api/v1/reports/ar-aging", guard(h.HandleARAgingReport))
	mux.HandleFunc("GET /api/v1/reports/customer-statement/{id}", guard(h.HandleCustomerStatement))
}

func (h *Handler) HandleDailyTill(w http.ResponseWriter, r *http.Request) {
	dateStr := r.URL.Query().Get("date")
	report, err := h.service.GetDailyTill(r.Context(), dateStr)
	if err != nil {
		httputil.RespondError(w, r, "failed to get daily till report", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

func (h *Handler) HandleSalesSummary(w http.ResponseWriter, r *http.Request) {
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	report, err := h.service.GetSalesSummary(r.Context(), start, end)
	if err != nil {
		httputil.RespondError(w, r, "failed to get sales summary report", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

func (h *Handler) HandleARAgingReport(w http.ResponseWriter, r *http.Request) {
	report, err := h.service.GetARAgingReport(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to get AR aging report", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

func (h *Handler) HandleCustomerStatement(w http.ResponseWriter, r *http.Request) {
	customerID := r.PathValue("id")
	if customerID == "" {
		httputil.RespondError(w, r, "customer ID required", http.StatusBadRequest, nil)
		return
	}
	if _, err := uuid.Parse(customerID); err != nil {
		httputil.RespondError(w, r, "invalid customer ID format", http.StatusBadRequest, err)
		return
	}
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	stmt, err := h.service.GetCustomerStatement(r.Context(), customerID, start, end)
	if err != nil {
		httputil.RespondError(w, r, "failed to get customer statement", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stmt)
}

func (h *Handler) RegisterBuilderRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/reporting/builder/preview", guard(h.HandleBuilderPreview))
	mux.HandleFunc("POST /api/v1/reporting/builder/export", guard(h.HandleBuilderExport))
	mux.HandleFunc("POST /api/v1/reporting/save", guard(h.HandleSaveReport))
	mux.HandleFunc("GET /api/v1/reporting/saved", guard(h.HandleListSavedReports))
	mux.HandleFunc("GET /api/v1/reporting/saved/{id}", guard(h.HandleGetSavedReport))
	mux.HandleFunc("PUT /api/v1/reporting/saved/{id}", guard(h.HandleUpdateSavedReport))
	mux.HandleFunc("DELETE /api/v1/reporting/saved/{id}", guard(h.HandleDeleteSavedReport))
}

func (h *Handler) HandleBuilderPreview(w http.ResponseWriter, r *http.Request) {
var req struct {
EntityType string           `json:"entity_type"`
Definition ReportDefinition `json:"definition"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
httputil.RespondError(w, r, "failed to decode report preview request", http.StatusBadRequest, err)
return
}

results, err := h.service.ExecuteReportDefinition(r.Context(), &req.Definition, req.EntityType)
if err != nil {
httputil.RespondError(w, r, "failed to execute report preview", http.StatusInternalServerError, err)
return
}

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(results)
}

func (h *Handler) HandleBuilderExport(w http.ResponseWriter, r *http.Request) {
var req struct {
EntityType string           `json:"entity_type"`
Format     string           `json:"format"` // csv, xlsx
Definition ReportDefinition `json:"definition"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
httputil.RespondError(w, r, "failed to decode report export request", http.StatusBadRequest, err)
return
}

results, err := h.service.ExecuteReportDefinition(r.Context(), &req.Definition, req.EntityType)
if err != nil {
httputil.RespondError(w, r, "failed to execute report export", http.StatusInternalServerError, err)
return
}

var buf bytes.Buffer
var contentType, disposition string

switch req.Format {
case "csv":
contentType = "text/csv"
disposition = `attachment; filename="report.csv"`
if err := ExportCSV(&buf, req.Definition.Columns, results); err != nil {
httputil.RespondError(w, r, "failed to export CSV", http.StatusInternalServerError, err)
return
}
case "xlsx":
contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
disposition = `attachment; filename="report.xlsx"`
if err := ExportXLSX(&buf, req.Definition.Columns, results); err != nil {
httputil.RespondError(w, r, "failed to export XLSX", http.StatusInternalServerError, err)
return
}
default:
httputil.RespondError(w, r, "unsupported format", http.StatusBadRequest, nil)
return
}

w.Header().Set("Content-Type", contentType)
w.Header().Set("Content-Disposition", disposition)
io.Copy(w, &buf)
}

func (h *Handler) HandleSaveReport(w http.ResponseWriter, r *http.Request) {
var report SavedReport
if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
httputil.RespondError(w, r, "failed to decode save report request", http.StatusBadRequest, err)
return
}

// Extract authenticated user identity from JWT claims
if claims := middleware.ClaimsFromContext(r.Context()); claims != nil && claims.Subject != "" {
	report.CreatedBy = claims.Subject
} else {
	report.CreatedBy = "system"
}

if err := h.service.CreateSavedReport(r.Context(), &report); err != nil {
httputil.RespondError(w, r, "failed to save report", http.StatusInternalServerError, err)
return
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(report)
}

func (h *Handler) HandleListSavedReports(w http.ResponseWriter, r *http.Request) {
reports, err := h.service.ListSavedReports(r.Context())
if err != nil {
httputil.RespondError(w, r, "failed to list saved reports", http.StatusInternalServerError, err)
return
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(reports)
}

func (h *Handler) HandleGetSavedReport(w http.ResponseWriter, r *http.Request) {
id := r.PathValue("id")
report, err := h.service.GetSavedReport(r.Context(), id)
if err != nil {
httputil.RespondError(w, r, "failed to get saved report", http.StatusInternalServerError, err)
return
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(report)
}

func (h *Handler) HandleUpdateSavedReport(w http.ResponseWriter, r *http.Request) {
id := r.PathValue("id")
var report SavedReport
if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
httputil.RespondError(w, r, "failed to decode update report request", http.StatusBadRequest, err)
return
}
report.ID = id

if err := h.service.UpdateSavedReport(r.Context(), &report); err != nil {
httputil.RespondError(w, r, "failed to update saved report", http.StatusInternalServerError, err)
return
}
w.WriteHeader(http.StatusOK)
}

func (h *Handler) HandleDeleteSavedReport(w http.ResponseWriter, r *http.Request) {
id := r.PathValue("id")
if err := h.service.DeleteSavedReport(r.Context(), id); err != nil {
httputil.RespondError(w, r, "failed to delete saved report", http.StatusInternalServerError, err)
return
}
w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RegisterBIIntegrationRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("GET /api/v1/reporting/export/{entity}", guard(h.HandleBIEntityExport))
}

func (h *Handler) HandleBIEntityExport(w http.ResponseWriter, r *http.Request) {
entity := r.PathValue("entity")

// Validate entity via existing schemata from builder
_, ok := entitySchemas[entity]
if !ok {
httputil.RespondError(w, r, "Invalid entity requested for BI export", http.StatusBadRequest, nil)
return
}

// Create a "SELECT *" equivalent definition for the BI tool
def := &ReportDefinition{
Columns: []ReportColumn{},
}

for fieldName := range entitySchemas[entity] {
def.Columns = append(def.Columns, ReportColumn{
Field: fieldName,
Label: fieldName,
})
}

// Fetch raw data
results, err := h.service.ExecuteReportDefinition(r.Context(), def, entity)
if err != nil {
httputil.RespondError(w, r, "failed to execute BI entity export", http.StatusInternalServerError, err)
return
}

// Output as structured JSON dump
w.Header().Set("Content-Type", "application/json")
if err := json.NewEncoder(w).Encode(results); err != nil {
httputil.RespondError(w, r, "Failed to encode BI output", http.StatusInternalServerError, err)
}
}
