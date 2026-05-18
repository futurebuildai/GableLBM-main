package pricing

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/product"
	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	service     *Service
	customerSvc *customer.Service
	productSvc  *product.Service
}

func NewHandler(s *Service, c *customer.Service, p *product.Service) *Handler {
	return &Handler{service: s, customerSvc: c, productSvc: p}
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

	mux.HandleFunc("GET /api/v1/pricing/calculate", h.HandleCalculatePrice)
	mux.HandleFunc("POST /api/v1/pricing/rules", guard(h.HandleCreateRule))
	mux.HandleFunc("GET /api/v1/pricing/rules", h.HandleListRules)
}

func (h *Handler) HandleCalculatePrice(w http.ResponseWriter, r *http.Request) {
	customerIDStr := r.URL.Query().Get("customer_id")
	productIDStr := r.URL.Query().Get("product_id")

	if customerIDStr == "" || productIDStr == "" {
		httputil.RespondError(w, r, "customer_id and product_id are required", http.StatusBadRequest, nil)
		return
	}

	customerID, err := uuid.Parse(customerIDStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid customer_id", http.StatusBadRequest, err)
		return
	}

	productID, err := uuid.Parse(productIDStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid product_id", http.StatusBadRequest, err)
		return
	}

	// Optional: quantity for volume pricing
	quantity := 1.0
	if qtyStr := r.URL.Query().Get("quantity"); qtyStr != "" {
		if q, err := strconv.ParseFloat(qtyStr, 64); err == nil && q > 0 {
			quantity = q
		}
	}

	// Optional: job_id for job-level pricing
	var jobID *uuid.UUID
	if jobIDStr := r.URL.Query().Get("job_id"); jobIDStr != "" {
		if jid, err := uuid.Parse(jobIDStr); err == nil {
			jobID = &jid
		}
	}

	cust, err := h.customerSvc.GetCustomer(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to get customer", http.StatusNotFound, err)
		return
	}

	prod, err := h.productSvc.GetProduct(r.Context(), productID)
	if err != nil {
		httputil.RespondError(w, r, "failed to get product", http.StatusNotFound, err)
		return
	}

	priceResult, err := h.service.CalculatePriceWithQty(r.Context(), cust, productID, prod.BasePrice, quantity, jobID)
	if err != nil {
		httputil.RespondError(w, r, "failed to calculate price", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(priceResult)
}

func (h *Handler) HandleCreateRule(w http.ResponseWriter, r *http.Request) {
	var rule PricingRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if rule.Name == "" || rule.RuleType == "" {
		httputil.RespondError(w, r, "name and rule_type are required", http.StatusBadRequest, nil)
		return
	}

	if err := h.service.CreateRule(r.Context(), &rule); err != nil {
		httputil.RespondError(w, r, "failed to create pricing rule", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(rule)
}

func (h *Handler) HandleListRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.service.ListRules(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list pricing rules", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rules)
}
