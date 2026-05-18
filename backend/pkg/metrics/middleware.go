package metrics

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

// statusWriter wraps http.ResponseWriter to capture the status code.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// HTTPMetrics returns middleware that records Prometheus metrics for each request.
func HTTPMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip metrics endpoint itself to avoid self-referencing noise
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}

		HTTPRequestsInFlight.Inc()
		defer HTTPRequestsInFlight.Dec()

		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()

		next.ServeHTTP(sw, r)

		duration := time.Since(start).Seconds()
		path := normalizePath(r.URL.Path)

		HTTPRequestDuration.WithLabelValues(r.Method, path).Observe(duration)
		HTTPRequestsTotal.WithLabelValues(r.Method, path, fmt.Sprintf("%d", sw.status)).Inc()
	})
}

// normalizePath collapses UUID and numeric path segments to prevent
// high-cardinality label explosion in Prometheus.
// e.g. /api/pos/transactions/550e8400-... → /api/pos/transactions/:id
func normalizePath(path string) string {
	parts := strings.Split(path, "/")
	for i, part := range parts {
		if isIDSegment(part) {
			parts[i] = ":id"
		}
	}
	return strings.Join(parts, "/")
}

// isIDSegment returns true for UUID-like or numeric path segments.
func isIDSegment(s string) bool {
	if s == "" {
		return false
	}
	// UUID format: 8-4-4-4-12 hex chars
	if len(s) == 36 && s[8] == '-' && s[13] == '-' && s[18] == '-' && s[23] == '-' {
		return true
	}
	// Numeric IDs
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}
