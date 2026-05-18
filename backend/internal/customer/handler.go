package customer

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/pagination"
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

	mux.HandleFunc("GET /api/v1/customers", guard(h.HandleListCustomers))
	mux.HandleFunc("GET /api/v1/customers/{id}", guard(h.HandleGetCustomer))
	mux.HandleFunc("POST /api/v1/customers", guard(h.HandleCreateCustomer))
	mux.HandleFunc("PATCH /api/v1/customers/{id}/salesperson", guard(h.HandleUpdateSalesperson))
	mux.HandleFunc("GET /api/v1/price_levels", guard(h.HandleListPriceLevels))

	// Contact routes
	mux.HandleFunc("GET /api/v1/customers/{customerId}/contacts", guard(h.HandleListContacts))
	mux.HandleFunc("POST /api/v1/customers/{customerId}/contacts", guard(h.HandleCreateContact))
	mux.HandleFunc("GET /api/v1/contacts/{id}", guard(h.HandleGetContact))
	mux.HandleFunc("PUT /api/v1/contacts/{id}", guard(h.HandleUpdateContact))
	mux.HandleFunc("DELETE /api/v1/contacts/{id}", guard(h.HandleDeleteContact))
}

func (h *Handler) HandleGetCustomer(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	c, err := h.service.GetCustomer(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Customer not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) HandleCreateCustomer(w http.ResponseWriter, r *http.Request) {
	var c Customer
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.CreateCustomer(r.Context(), &c); err != nil {
		httputil.RespondError(w, r, "failed to create customer", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) HandleListCustomers(w http.ResponseWriter, r *http.Request) {
	page := pagination.FromRequest(r)
	customers, total, err := h.service.ListCustomersPaginated(r.Context(), page.Limit, page.Offset)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch customers", http.StatusInternalServerError, err)
		return
	}

	resp := pagination.PagedResponse[Customer]{
		Data:   customers,
		Total:  total,
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if resp.Data == nil {
		resp.Data = []Customer{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) HandleListPriceLevels(w http.ResponseWriter, r *http.Request) {
	levels, err := h.service.ListPriceLevels(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch price levels", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(levels)
}

func (h *Handler) HandleUpdateSalesperson(w http.ResponseWriter, r *http.Request) {
	customerID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	var body struct {
		SalespersonID *uuid.UUID `json:"salesperson_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.UpdateSalesperson(r.Context(), customerID, body.SalespersonID); err != nil {
		httputil.RespondError(w, r, "failed to update salesperson", http.StatusInternalServerError, err)
		return
	}

	// Return updated customer
	c, err := h.service.GetCustomer(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to get updated customer", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

// --- Contact Handlers ---

func (h *Handler) HandleListContacts(w http.ResponseWriter, r *http.Request) {
	customerID, err := uuid.Parse(r.PathValue("customerId"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	contacts, err := h.service.ListContactsByCustomer(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch contacts", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(contacts)
}

func (h *Handler) HandleCreateContact(w http.ResponseWriter, r *http.Request) {
	customerID, err := uuid.Parse(r.PathValue("customerId"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	var c Contact
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	c.CustomerID = customerID

	if err := h.service.CreateContact(r.Context(), &c); err != nil {
		httputil.RespondError(w, r, "failed to create contact", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) HandleGetContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid contact ID", http.StatusBadRequest, err)
		return
	}

	c, err := h.service.GetContact(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Contact not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) HandleUpdateContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid contact ID", http.StatusBadRequest, err)
		return
	}

	var c Contact
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	c.ID = id

	if err := h.service.UpdateContact(r.Context(), &c); err != nil {
		httputil.RespondError(w, r, "failed to update contact", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) HandleDeleteContact(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid contact ID", http.StatusBadRequest, err)
		return
	}

	if err := h.service.DeleteContact(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to delete contact", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
