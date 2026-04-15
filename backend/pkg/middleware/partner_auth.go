package middleware

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/pkg/httputil"
)

// PartnerContextKey is the key used to store the customer in the context
type partnerContextKey string

const CustomerContextKey partnerContextKey = "customer"

type PartnerAuthMiddleware struct {
	repo   customer.Repository
	logger *slog.Logger
}

func NewPartnerAuthMiddleware(repo customer.Repository, logger *slog.Logger) *PartnerAuthMiddleware {
	return &PartnerAuthMiddleware{
		repo:   repo,
		logger: logger,
	}
}

func (m *PartnerAuthMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Get UserClaims from existing AuthMiddleware
		claims, ok := r.Context().Value(UserContextKey).(*UserClaims)
		if !ok || claims == nil {
			m.logger.Warn("PartnerAuth: No user claims found (AuthMiddleware missing?)", "path", r.URL.Path)
			httputil.RespondError(w, r, "Unauthorized", http.StatusUnauthorized, nil)
			return
		}

		// 2. Check if email is present
		if claims.Email == "" {
			m.logger.Warn("PartnerAuth: No email in claims", "path", r.URL.Path)
			httputil.RespondError(w, r, "Unauthorized: No email provided", http.StatusUnauthorized, nil)
			return
		}

		// 3. Lookup Customer by Email
		cust, err := m.repo.GetCustomerByEmail(r.Context(), claims.Email)
		if err != nil {
			m.logger.Warn("PartnerAuth: Customer lookup failed", "email", claims.Email, "error", err)
			httputil.RespondError(w, r, "Forbidden: Not a registered partner", http.StatusForbidden, nil)
			return
		}

		// 4. Check if Active
		if !cust.IsActive {
			m.logger.Warn("PartnerAuth: Customer account inactive", "email", claims.Email)
			httputil.RespondError(w, r, "Forbidden: Account inactive", http.StatusForbidden, nil)
			return
		}

		// 5. Inject Customer into Context
		ctx := context.WithValue(r.Context(), CustomerContextKey, cust)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
