package middleware

import (
	"bytes"
	"net/http"
	"sync"
	"time"
)

const (
	// IdempotencyHeader is the HTTP header name for idempotency keys.
	IdempotencyHeader = "X-Idempotency-Key"

	// idempotencyTTL is how long cached responses are kept.
	idempotencyTTL = 24 * time.Hour
)

// cachedResponse stores a previously captured HTTP response.
type cachedResponse struct {
	status  int
	headers http.Header
	body    []byte
	expires time.Time
}

// defaultMaxEntries is the upper bound on cached idempotency responses.
// When exceeded, new entries are silently skipped to prevent unbounded growth.
const defaultMaxEntries = 100000

// idempotencyStore is an in-memory cache for idempotency responses.
type idempotencyStore struct {
	mu         sync.RWMutex
	entries    map[string]*cachedResponse
	maxEntries int
}

func newIdempotencyStore() *idempotencyStore {
	s := &idempotencyStore{
		entries:    make(map[string]*cachedResponse),
		maxEntries: defaultMaxEntries,
	}
	// Background cleanup goroutine
	go s.cleanup()
	return s
}

func (s *idempotencyStore) get(key string) (*cachedResponse, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.entries[key]
	if !ok || time.Now().After(entry.expires) {
		return nil, false
	}
	return entry, true
}

func (s *idempotencyStore) set(key string, resp *cachedResponse) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Prevent unbounded growth — skip caching if at capacity
	if len(s.entries) >= s.maxEntries {
		return
	}
	resp.expires = time.Now().Add(idempotencyTTL)
	s.entries[key] = resp
}

func (s *idempotencyStore) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for k, v := range s.entries {
			if now.After(v.expires) {
				delete(s.entries, k)
			}
		}
		s.mu.Unlock()
	}
}

// idempotencyResponseWriter wraps http.ResponseWriter to capture the response.
type idempotencyResponseWriter struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
	wrote  bool
}

func (w *idempotencyResponseWriter) WriteHeader(code int) {
	if !w.wrote {
		w.status = code
		w.wrote = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *idempotencyResponseWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.status = http.StatusOK
		w.wrote = true
	}
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

func (w *idempotencyResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// Idempotency returns middleware that caches POST/PUT responses keyed by
// the X-Idempotency-Key header. If the same key is seen again within 24
// hours, the cached response is replayed without calling the downstream
// handler. Requests without the header pass through uncached.
func Idempotency() func(http.Handler) http.Handler {
	store := newIdempotencyStore()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only apply to mutating methods
			if r.Method != http.MethodPost && r.Method != http.MethodPut {
				next.ServeHTTP(w, r)
				return
			}

			key := r.Header.Get(IdempotencyHeader)
			if key == "" {
				// No idempotency key — pass through
				next.ServeHTTP(w, r)
				return
			}

			// Check cache
			if cached, ok := store.get(key); ok {
				// Replay cached response
				for k, vals := range cached.headers {
					for _, v := range vals {
						w.Header().Add(k, v)
					}
				}
				w.WriteHeader(cached.status)
				w.Write(cached.body)
				return
			}

			// Wrap response writer to capture output
			crw := &idempotencyResponseWriter{
				ResponseWriter: w,
				status:         http.StatusOK,
			}

			next.ServeHTTP(crw, r)

			// Cache the response — capture relevant headers.
			// Only cache successful responses (2xx) so that error responses
			// are not persisted and the client can retry the request.
			if crw.status >= 200 && crw.status < 300 {
				cachedHeaders := make(http.Header)
				for _, h := range []string{"Content-Type", "Content-Length"} {
					if v := crw.Header().Get(h); v != "" {
						cachedHeaders.Set(h, v)
					}
				}

				bodyBytes := make([]byte, crw.body.Len())
				copy(bodyBytes, crw.body.Bytes())

				store.set(key, &cachedResponse{
					status:  crw.status,
					headers: cachedHeaders,
					body:    bodyBytes,
				})
			}
		})
	}
}
