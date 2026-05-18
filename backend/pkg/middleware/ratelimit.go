package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gablelbm/gable/pkg/httputil"
)

const maxVisitors = 100000

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int
	window   time.Duration
}

type visitor struct {
	count       int
	windowStart time.Time
}

// RateLimit returns middleware that enforces a per-IP request limit within a
// sliding window. Requests exceeding the limit receive 429 Too Many Requests.
func RateLimit(requestsPerMinute int) func(http.Handler) http.Handler {
	rl := &rateLimiter{
		visitors: make(map[string]*visitor),
		rate:     requestsPerMinute,
		window:   time.Minute,
	}

	// Cleanup stale entries every 5 minutes
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			rl.mu.Lock()
			now := time.Now()
			for ip, v := range rl.visitors {
				if now.Sub(v.windowStart) > rl.window*2 {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractIP(r)

			rl.mu.Lock()
			now := time.Now()
			v, exists := rl.visitors[ip]
			if !exists || now.Sub(v.windowStart) > rl.window {
				// Fail-open: if visitor map is at capacity, skip tracking and allow through
				if !exists && len(rl.visitors) > maxVisitors {
					rl.mu.Unlock()
					next.ServeHTTP(w, r)
					return
				}
				rl.visitors[ip] = &visitor{count: 1, windowStart: now}
				rl.mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}
			v.count++
			if v.count > rl.rate {
				rl.mu.Unlock()
				httputil.RespondError(w, r, "Too Many Requests", http.StatusTooManyRequests, nil)
				return
			}
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
		})
	}
}

// StrictRateLimit returns middleware that enforces a stricter per-IP request
// limit, intended for sensitive endpoints like login. It maintains its own
// visitor map so counts are independent of the global rate limiter.
func StrictRateLimit(requestsPerMinute int) func(http.Handler) http.Handler {
	return RateLimit(requestsPerMinute)
}

func extractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		// Use leftmost IP -- the original client.
		// X-Forwarded-For: client, proxy1, proxy2
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
