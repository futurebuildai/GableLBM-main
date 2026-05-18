package crm

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
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

	mux.HandleFunc("GET /api/v1/customers/{customerId}/activities", guard(h.HandleListActivities))
	mux.HandleFunc("POST /api/v1/customers/{customerId}/activities", guard(h.HandleCreateActivity))
	mux.HandleFunc("GET /api/v1/activities/{id}", guard(h.HandleGetActivity))
	mux.HandleFunc("PUT /api/v1/activities/{id}", guard(h.HandleUpdateActivity))
	mux.HandleFunc("DELETE /api/v1/activities/{id}", guard(h.HandleDeleteActivity))
}

func (h *Handler) HandleListActivities(w http.ResponseWriter, r *http.Request) {
	customerID, err := uuid.Parse(r.PathValue("customerId"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	activities, err := h.repo.ListByCustomer(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch activities", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(activities)
}

func (h *Handler) HandleCreateActivity(w http.ResponseWriter, r *http.Request) {
	customerID, err := uuid.Parse(r.PathValue("customerId"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	var a Activity
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	a.CustomerID = customerID

	if !ValidActivityType(a.ActivityType) {
		httputil.RespondError(w, r, "Invalid activity_type: must be CALL, MEETING, EMAIL, or NOTE", http.StatusBadRequest, nil)
		return
	}

	if err := h.repo.Create(r.Context(), &a); err != nil {
		httputil.RespondError(w, r, "failed to create activity", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(a)
}

func (h *Handler) HandleGetActivity(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid activity ID", http.StatusBadRequest, err)
		return
	}

	a, err := h.repo.Get(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Activity not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a)
}

func (h *Handler) HandleUpdateActivity(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid activity ID", http.StatusBadRequest, err)
		return
	}

	var a Activity
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	a.ID = id

	if !ValidActivityType(a.ActivityType) {
		httputil.RespondError(w, r, "Invalid activity_type: must be CALL, MEETING, EMAIL, or NOTE", http.StatusBadRequest, nil)
		return
	}

	if err := h.repo.Update(r.Context(), &a); err != nil {
		httputil.RespondError(w, r, "failed to update activity", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a)
}

func (h *Handler) HandleDeleteActivity(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid activity ID", http.StatusBadRequest, err)
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to delete activity", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
