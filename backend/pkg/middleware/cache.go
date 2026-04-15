package middleware

import "net/http"

// CacheControl sets Cache-Control headers for GET requests matching certain path prefixes.
func CacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			path := r.URL.Path
			switch {
			case hasPrefix(path, "/products", "/pricing/calculate", "/gl/accounts", "/gl/trial-balance"):
				w.Header().Set("Cache-Control", "private, max-age=30") // 30s for relatively stable data
			case hasPrefix(path, "/health", "/healthz"):
				w.Header().Set("Cache-Control", "no-cache")
			}
		}
		next.ServeHTTP(w, r)
	})
}

func hasPrefix(path string, prefixes ...string) bool {
	for _, p := range prefixes {
		if len(path) >= len(p) && path[:len(p)] == p {
			return true
		}
	}
	return false
}
