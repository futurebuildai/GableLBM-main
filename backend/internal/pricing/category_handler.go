package pricing

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/google/uuid"
)

// CategoryHandler handles HTTP requests for category pricing administration.
type CategoryHandler struct {
	service     *CategoryPricingService
	customerSvc *customer.Service
}

// NewCategoryHandler creates a new CategoryHandler.
func NewCategoryHandler(svc *CategoryPricingService, custSvc *customer.Service) *CategoryHandler {
	return &CategoryHandler{service: svc, customerSvc: custSvc}
}

// RegisterCategoryRoutes registers all category pricing routes.
// roleGuard is applied to write endpoints; pass nil in dev mode.
func (h *CategoryHandler) RegisterCategoryRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	// Helper to wrap a handler with the role guard if provided
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	// Category tree management (reads are unguarded)
	mux.HandleFunc("GET /api/v1/pricing/categories", h.HandleListCategories)
	mux.HandleFunc("POST /api/v1/pricing/categories", guard(h.HandleCreateCategory))
	mux.HandleFunc("PUT /api/v1/pricing/categories/{id}", guard(h.HandleUpdateCategory))

	// Category pricing rules CRUD
	mux.HandleFunc("GET /api/v1/pricing/category-rules", h.HandleListCategoryRules)
	mux.HandleFunc("POST /api/v1/pricing/category-rules", guard(h.HandleCreateCategoryRule))
	mux.HandleFunc("PUT /api/v1/pricing/category-rules/{id}", guard(h.HandleUpdateCategoryRule))
	mux.HandleFunc("DELETE /api/v1/pricing/category-rules/{id}", guard(h.HandleDeleteCategoryRule))

	// Bulk operations
	mux.HandleFunc("POST /api/v1/pricing/category-rules/bulk", guard(h.HandleBulkUpsertRules))
	mux.HandleFunc("DELETE /api/v1/pricing/category-rules/bulk", guard(h.HandleBulkDeleteRules))

	// Audit trail
	mux.HandleFunc("GET /api/v1/pricing/category-rules/{id}/audit", h.HandleGetRuleAudit)

	// Matrix view (admin grid)
	mux.HandleFunc("GET /api/v1/pricing/matrix", h.HandleGetMatrix)

	// Resolution preview
	mux.HandleFunc("GET /api/v1/pricing/resolve", h.HandleResolvePreview)
}

// --- Category Endpoints ---

func (h *CategoryHandler) HandleListCategories(w http.ResponseWriter, r *http.Request) {
	view := r.URL.Query().Get("view")

	var result any
	var err error

	if view == "flat" {
		result, err = h.service.ListCategories(r.Context())
	} else {
		result, err = h.service.ListCategoriesTree(r.Context())
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *CategoryHandler) HandleCreateCategory(w http.ResponseWriter, r *http.Request) {
	var cat ProductCategory
	if err := json.NewDecoder(r.Body).Decode(&cat); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if cat.Name == "" || cat.Slug == "" || cat.Path == "" {
		http.Error(w, "name, slug, and path are required", http.StatusBadRequest)
		return
	}

	if err := h.service.CreateCategory(r.Context(), &cat); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cat)
}

func (h *CategoryHandler) HandleUpdateCategory(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid category id", http.StatusBadRequest)
		return
	}

	var cat ProductCategory
	if err := json.NewDecoder(r.Body).Decode(&cat); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	cat.ID = id

	if err := h.service.UpdateCategory(r.Context(), &cat); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cat)
}

// --- Category Pricing Rules Endpoints ---

func (h *CategoryHandler) HandleListCategoryRules(w http.ResponseWriter, r *http.Request) {
	filter := parseCategoryRuleFilter(r)

	// Check for pagination params
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	if limitStr != "" || offsetStr != "" {
		limit, _ := strconv.Atoi(limitStr)
		offset, _ := strconv.Atoi(offsetStr)
		if limit <= 0 {
			limit = 50
		}
		if limit > 200 {
			limit = 200
		}
		if offset < 0 {
			offset = 0
		}

		rules, total, err := h.service.ListCategoryRulesPaginated(r.Context(), filter, limit, offset)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if rules == nil {
			rules = []CategoryPricingRule{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(PaginatedRulesResponse{
			Data:   rules,
			Total:  total,
			Limit:  limit,
			Offset: offset,
		})
		return
	}

	rules, err := h.service.ListCategoryRules(r.Context(), filter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rules)
}

func parseCategoryRuleFilter(r *http.Request) CategoryRuleFilter {
	filter := CategoryRuleFilter{}
	if tt := r.URL.Query().Get("target_type"); tt != "" {
		t := TargetType(tt)
		filter.TargetType = &t
	}
	if tier := r.URL.Query().Get("tier"); tier != "" {
		filter.Tier = tier
	}
	if cidStr := r.URL.Query().Get("customer_id"); cidStr != "" {
		if cid, err := uuid.Parse(cidStr); err == nil {
			filter.CustomerID = &cid
		}
	}
	if catStr := r.URL.Query().Get("category_id"); catStr != "" {
		if catID, err := uuid.Parse(catStr); err == nil {
			filter.CategoryID = &catID
		}
	}
	return filter
}

func (h *CategoryHandler) HandleCreateCategoryRule(w http.ResponseWriter, r *http.Request) {
	var rule CategoryPricingRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := validateCategoryRule(&rule); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateCategoryRule(r.Context(), &rule); err != nil {
		if strings.Contains(err.Error(), "already exists") {
			http.Error(w, err.Error(), http.StatusConflict)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(rule)
}

func (h *CategoryHandler) HandleUpdateCategoryRule(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid rule id", http.StatusBadRequest)
		return
	}

	var rule CategoryPricingRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	rule.ID = id

	if err := h.service.UpdateCategoryRule(r.Context(), &rule); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rule)
}

func (h *CategoryHandler) HandleDeleteCategoryRule(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid rule id", http.StatusBadRequest)
		return
	}

	if err := h.service.DeleteCategoryRule(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Matrix ---

func (h *CategoryHandler) HandleGetMatrix(w http.ResponseWriter, r *http.Request) {
	matrix, err := h.service.GetMatrix(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(matrix)
}

// --- Resolution Preview ---

func (h *CategoryHandler) HandleResolvePreview(w http.ResponseWriter, r *http.Request) {
	productIDStr := r.URL.Query().Get("product_id")
	customerIDStr := r.URL.Query().Get("customer_id")
	tierStr := r.URL.Query().Get("tier")

	if productIDStr == "" {
		http.Error(w, "product_id is required", http.StatusBadRequest)
		return
	}

	productID, err := uuid.Parse(productIDStr)
	if err != nil {
		http.Error(w, "invalid product_id", http.StatusBadRequest)
		return
	}

	customerID := uuid.Nil
	if customerIDStr != "" {
		if cid, err := uuid.Parse(customerIDStr); err == nil {
			customerID = cid
		}
	}

	tier := tierStr
	if tier == "" && customerID != uuid.Nil && h.customerSvc != nil {
		if cust, err := h.customerSvc.GetCustomer(r.Context(), customerID); err == nil && cust != nil {
			tier = string(cust.Tier)
		}
	}
	if tier == "" {
		tier = "RETAIL"
	}

	resolved, err := h.service.ResolveEffectivePrice(r.Context(), customerID, tier, productID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resolved)
}

// --- Audit ---

func (h *CategoryHandler) HandleGetRuleAudit(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid rule id", http.StatusBadRequest)
		return
	}

	entries, err := h.service.ListAuditEntries(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if entries == nil {
		entries = []CategoryPricingAudit{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

// --- Bulk Operations ---

func (h *CategoryHandler) HandleBulkUpsertRules(w http.ResponseWriter, r *http.Request) {
	var rules []CategoryPricingRule
	if err := json.NewDecoder(r.Body).Decode(&rules); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(rules) == 0 {
		http.Error(w, "at least one rule is required", http.StatusBadRequest)
		return
	}
	if len(rules) > 500 {
		http.Error(w, "max 500 rules per batch", http.StatusBadRequest)
		return
	}

	for i := range rules {
		if err := validateCategoryRule(&rules[i]); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	if err := h.service.BulkUpsertRules(r.Context(), rules); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"count": len(rules)})
}

func (h *CategoryHandler) HandleBulkDeleteRules(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs []uuid.UUID `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(body.IDs) == 0 {
		http.Error(w, "at least one id is required", http.StatusBadRequest)
		return
	}

	if err := h.service.BulkDeleteRules(r.Context(), body.IDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Validation ---

func validateCategoryRule(rule *CategoryPricingRule) error {
	if rule.TargetType != TargetTypeAccount && rule.TargetType != TargetTypeTier {
		return errInvalidField("target_type must be ACCOUNT or TIER")
	}
	if rule.TargetType == TargetTypeAccount && (rule.CustomerID == nil || *rule.CustomerID == uuid.Nil) {
		return errInvalidField("customer_id is required for ACCOUNT rules")
	}
	if rule.TargetType == TargetTypeTier && rule.Tier == "" {
		return errInvalidField("tier is required for TIER rules")
	}
	if rule.CategoryID == uuid.Nil {
		return errInvalidField("category_id is required")
	}
	if rule.RuleType != CategoryRuleMarkup && rule.RuleType != CategoryRuleMarkdown &&
		rule.RuleType != CategoryRuleFixed && rule.RuleType != CategoryRuleMargin {
		return errInvalidField("rule_type must be MARKUP, MARKDOWN, FIXED, or MARGIN")
	}
	return nil
}

type validationError struct {
	msg string
}

func (e *validationError) Error() string { return e.msg }

func errInvalidField(msg string) error {
	return &validationError{msg: msg}
}
