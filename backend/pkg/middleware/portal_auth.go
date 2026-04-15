package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// portalContextKey is the key used to store portal claims in context.
type portalContextKeyType string

const PortalClaimsKey portalContextKeyType = "portal_claims"

// PortalClaims holds JWT claims for portal auth.
type PortalClaims struct {
	jwt.RegisteredClaims
	CustomerID     uuid.UUID `json:"customer_id"`
	CustomerUserID uuid.UUID `json:"customer_user_id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Role           string    `json:"role"`
}

// PortalAuthMiddleware validates portal JWTs and injects customer context.
type PortalAuthMiddleware struct {
	jwtSecret []byte
	logger    *slog.Logger
}

// NewPortalAuthMiddleware creates a new portal auth middleware.
func NewPortalAuthMiddleware(jwtSecret []byte, logger *slog.Logger) *PortalAuthMiddleware {
	return &PortalAuthMiddleware{
		jwtSecret: jwtSecret,
		logger:    logger,
	}
}

// Handler returns the middleware handler function.
func (m *PortalAuthMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Extract token — prefer httpOnly cookie, fall back to Authorization header
		var rawToken string

		if cookie, err := r.Cookie("portal_token"); err == nil && cookie.Value != "" {
			rawToken = cookie.Value
		} else {
			authHeader := r.Header.Get("Authorization")
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				rawToken = parts[1]
			}
		}

		if rawToken == "" {
			m.logger.Warn("PortalAuth: No token found in cookie or Authorization header", "path", r.URL.Path)
			httputil.RespondError(w, r, "Unauthorized", http.StatusUnauthorized, nil)
			return
		}

		// 2. Parse and validate JWT (jwt/v5 validates exp claim by default —
		//    expired tokens are rejected automatically with ErrTokenExpired)
		token, err := jwt.ParseWithClaims(rawToken, &PortalClaims{}, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return m.jwtSecret, nil
		})
		if err != nil {
			m.logger.Warn("PortalAuth: Token validation failed", "error", err, "path", r.URL.Path)
			httputil.RespondError(w, r, "Unauthorized", http.StatusUnauthorized, nil)
			return
		}

		claims, ok := token.Claims.(*PortalClaims)
		if !ok || !token.Valid {
			m.logger.Warn("PortalAuth: Invalid token claims", "path", r.URL.Path)
			httputil.RespondError(w, r, "Unauthorized", http.StatusUnauthorized, nil)
			return
		}

		// 3. Verify essential claims
		if claims.CustomerID == uuid.Nil {
			m.logger.Warn("PortalAuth: Missing customer_id in claims", "path", r.URL.Path)
			httputil.RespondError(w, r, "Unauthorized", http.StatusUnauthorized, nil)
			return
		}

		// 4. Inject claims into context
		ctx := context.WithValue(r.Context(), PortalClaimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
