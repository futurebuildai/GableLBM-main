package middleware

import (
	"net/http"
	"os"
	"strings"
)

// CORSMiddleware applies CORS headers.
// In production, set CORS_ORIGINS env var to restrict allowed origins (comma-separated).
// Defaults to localhost origins for development.
func CORSMiddleware(next http.Handler) http.Handler {
	allowedOrigins := getAllowedOrigins()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if originAllowed(origin, allowedOrigins) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key, X-Request-ID")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
			w.Header().Set("Access-Control-Max-Age", "86400") // Cache preflight for 24h

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func getAllowedOrigins() []string {
	if env := os.Getenv("CORS_ORIGINS"); env != "" {
		return strings.Split(env, ",")
	}
	// Default: localhost dev origins
	return []string{
		"http://localhost:5173",
		"http://localhost:5174",
		"http://localhost:5175",
		"http://localhost:3000",
	}
}

func originAllowed(origin string, allowed []string) bool {
	if origin == "" {
		return false
	}
	for _, a := range allowed {
		if strings.TrimSpace(a) == origin {
			return true
		}
	}
	return false
}
