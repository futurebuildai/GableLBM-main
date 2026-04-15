package pricing

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/pkg/httputil"
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
		httputil.RespondError(w, r, "failed to list categories", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *CategoryHandler) HandleCreateCategory(w http.ResponseWriter, r *http.Request) {
	var cat ProductCategory
	if err := json.NewDecoder(r.Body).Decode(&cat); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if cat.Name == "" || cat.Slug == "" || cat.Path == "" {
		httputil.RespondError(w, r, "name, slug, and path are required", http.StatusBadRequest, nil)
		return
	}

	if err := h.service.CreateCategory(r.Context(), &cat); err != nil {
		httputil.RespondError(w, r, "failed to create category", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "Invalid category ID", http.StatusBadRequest, err)
		return
	}

	var cat ProductCategory
	if err := json.NewDecoder(r.Body).Decode(&cat); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	cat.ID = id

	if err := h.service.UpdateCategory(r.Context(), &cat); err != nil {
		httputil.RespondError(w, r, "failed to update category", http.StatusInternalServerError, err)
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
			httputil.RespondError(w, r, "failed to list category rules", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "failed to list category rules", http.StatusInternalServerError, err)
		return
	}
	if rules == nil {
		rules = []CategoryPricingRule{}
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
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := validateCategoryRule(&rule); err != nil {
		httputil.RespondError(w, r, "category rule validation failed", http.StatusBadRequest, err)
		return
	}

	if err := h.service.CreateCategoryRule(r.Context(), &rule); err != nil {
		if strings.Contains(err.Error(), "already exists") {
			httputil.RespondError(w, r, "category rule already exists", http.StatusConflict, err)
		} else {
			httputil.RespondError(w, r, "failed to create category rule", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "Invalid rule ID", http.StatusBadRequest, err)
		return
	}

	var rule CategoryPricingRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	rule.ID = id

	if err := h.service.UpdateCategoryRule(r.Context(), &rule); err != nil {
		httputil.RespondError(w, r, "failed to update category rule", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rule)
}

func (h *CategoryHandler) HandleDeleteCategoryRule(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid rule ID", http.StatusBadRequest, err)
		return
	}

	if err := h.service.DeleteCategoryRule(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to delete category rule", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Matrix ---

func (h *CategoryHandler) HandleGetMatrix(w http.ResponseWriter, r *http.Request) {
	matrix, err := h.service.GetMatrix(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to get pricing matrix", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "product_id is required", http.StatusBadRequest, nil)
		return
	}

	productID, err := uuid.Parse(productIDStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid product_id", http.StatusBadRequest, err)
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
		httputil.RespondError(w, r, "failed to resolve effective price", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "Invalid rule ID", http.StatusBadRequest, err)
		return
	}

	entries, err := h.service.ListAuditEntries(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to list audit entries", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	if len(rules) == 0 {
		httputil.RespondError(w, r, "at least one rule is required", http.StatusBadRequest, nil)
		return
	}
	if len(rules) > 500 {
		httputil.RespondError(w, r, "max 500 rules per batch", http.StatusBadRequest, nil)
		return
	}

	for i := range rules {
		if err := validateCategoryRule(&rules[i]); err != nil {
			httputil.RespondError(w, r, "bulk category rule validation failed", http.StatusBadRequest, err)
			return
		}
	}

	if err := h.service.BulkUpsertRules(r.Context(), rules); err != nil {
		httputil.RespondError(w, r, "failed to bulk upsert category rules", http.StatusInternalServerError, err)
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
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	if len(body.IDs) == 0 {
		httputil.RespondError(w, r, "at least one id is required", http.StatusBadRequest, nil)
		return
	}

	if err := h.service.BulkDeleteRules(r.Context(), body.IDs); err != nil {
		httputil.RespondError(w, r, "failed to bulk delete category rules", http.StatusInternalServerError, err)
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
