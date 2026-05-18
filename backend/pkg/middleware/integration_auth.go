package middleware

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// tenantIDKey is the context key for the tenant ID from X-Tenant-ID header.
type tenantIDKey struct{}

// TenantIDFromContext retrieves the tenant ID set by IntegrationAuth middleware.
func TenantIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(tenantIDKey{}).(string)
	return id
}

// IntegrationAuth returns middleware that validates service-to-service calls
// using the X-Integration-Key header. This is used for Brain → GableLBM calls
// that don't carry a user JWT (e.g., A2A webhooks, system notifications).
//
// It also extracts and propagates the X-Tenant-ID header into the request context.
func IntegrationAuth(integrationKey string, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-Integration-Key")
			if key == "" {
				writeIntegrationError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing X-Integration-Key header")
				return
			}

			// Constant-time comparison to prevent timing attacks.
			if subtle.ConstantTimeCompare([]byte(key), []byte(integrationKey)) != 1 {
				logger.Warn("invalid integration key", "path", r.URL.Path)
				writeIntegrationError(w, http.StatusForbidden, "FORBIDDEN", "invalid integration key")
				return
			}

			// Extract optional tenant ID.
			tenantID := r.Header.Get("X-Tenant-ID")

			ctx := r.Context()
			if tenantID != "" {
				ctx = context.WithValue(ctx, tenantIDKey{}, tenantID)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeIntegrationError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
		"meta": map[string]string{
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		},
	})
}
