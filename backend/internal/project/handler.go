package project

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

// Handler provides HTTP endpoints for project management.
type Handler struct {
	svc *Service
}

// NewHandler creates a new project handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes registers the project API endpoints.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/portal/v1/projects", authMw(http.HandlerFunc(h.HandleListProjects)))
	mux.Handle("GET /api/portal/v1/projects/{id}", authMw(http.HandlerFunc(h.HandleGetProject)))
	mux.Handle("POST /api/portal/v1/projects", authMw(http.HandlerFunc(h.HandleCreateProject)))
	mux.Handle("PUT /api/portal/v1/projects/{id}", authMw(http.HandlerFunc(h.HandleUpdateProject)))
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func getCustomerID(r *http.Request) uuid.UUID {
	claims, ok := r.Context().Value(middleware.PortalClaimsKey).(*middleware.PortalClaims)
	if !ok || claims == nil {
		return uuid.Nil
	}
	return claims.CustomerID
}

func (h *Handler) HandleListProjects(w http.ResponseWriter, r *http.Request) {
	customerID := getCustomerID(r)
	projects, err := h.svc.ListProjects(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list projects", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, projects)
}

func (h *Handler) HandleGetProject(w http.ResponseWriter, r *http.Request) {
	customerID := getCustomerID(r)
	idStr := r.PathValue("id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid project id", http.StatusBadRequest, err)
		return
	}

	dashboard, err := h.svc.GetProjectDashboard(r.Context(), projectID, customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to get project dashboard", http.StatusNotFound, err)
		return
	}
	writeJSON(w, dashboard)
}

func (h *Handler) HandleCreateProject(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	customerID := getCustomerID(r)

	var req CreateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	p, err := h.svc.CreateProject(r.Context(), customerID, req)
	if err != nil {
		httputil.RespondError(w, r, "failed to create project", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, p)
}

func (h *Handler) HandleUpdateProject(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	customerID := getCustomerID(r)
	idStr := r.PathValue("id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid project id", http.StatusBadRequest, err)
		return
	}

	var req UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	p, err := h.svc.UpdateProject(r.Context(), projectID, customerID, req)
	if err != nil {
		httputil.RespondError(w, r, "failed to update project", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, p)
}
