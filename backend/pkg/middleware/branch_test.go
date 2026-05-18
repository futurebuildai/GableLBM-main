package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gablelbm/gable/pkg/branchctx"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// newTestMiddleware builds a BranchMiddleware with no DB; suitable for tests
// that don't reach userHasBranch or the admin bootstrap path. The TTL is set
// to one hour and the last-refresh timestamp is bumped to "now" so the
// settings refresher won't try to hit the (nil) DB and clobber the values.
func newTestMiddleware(killSwitch, requireDefault bool) *BranchMiddleware {
	m := &BranchMiddleware{killSwitchTTL: time.Hour}
	m.killSwitch.Store(killSwitch)
	m.requireDefault.Store(requireDefault)
	m.killSwitchAt.Store(time.Now().UnixNano())
	return m
}

// captureHandler records what the middleware ends up injecting into context.
type captureHandler struct {
	bc     *BranchContext
	called bool
}

func (c *captureHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c.called = true
	c.bc = BranchFromContext(r.Context())
	w.WriteHeader(http.StatusOK)
}

func withClaims(r *http.Request, sub string, roles ...string) *http.Request {
	claims := &UserClaims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: sub},
		Roles:            roles,
	}
	if len(roles) > 0 {
		claims.Role = roles[0]
	}
	ctx := context.WithValue(r.Context(), UserContextKey, claims)
	return r.WithContext(ctx)
}

func TestBranchMiddleware_KillSwitchOff(t *testing.T) {
	m := newTestMiddleware(false, true)
	cap := &captureHandler{}
	h := m.Handler(cap)

	tests := []struct {
		name string
		req  *http.Request
	}{
		{"no claims", httptest.NewRequest("GET", "/x", nil)},
		{"admin claims", withClaims(httptest.NewRequest("GET", "/x", nil), "u1", "admin")},
		{"member claims", withClaims(httptest.NewRequest("GET", "/x", nil), "u2", "member")},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cap.called = false
			cap.bc = nil
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, tc.req)
			if !cap.called {
				t.Fatalf("downstream handler was not called")
			}
			if cap.bc == nil {
				t.Fatalf("expected BranchContext to be injected")
			}
			if !cap.bc.IsAdmin {
				t.Errorf("kill-switch off should mark everyone admin; got IsAdmin=false")
			}
			if cap.bc.BranchID != nil {
				t.Errorf("kill-switch off should leave BranchID nil; got %v", *cap.bc.BranchID)
			}
			if rec.Code != http.StatusOK {
				t.Errorf("expected 200, got %d", rec.Code)
			}
		})
	}
}

func TestBranchMiddleware_NoClaimsBypass(t *testing.T) {
	// Dev mode (AUTH_MODE=dev) doesn't inject claims; the middleware must
	// still pass requests through with a nil BranchID so the API is usable.
	m := newTestMiddleware(true, true)
	cap := &captureHandler{}
	h := m.Handler(cap)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/x", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if cap.bc == nil || cap.bc.BranchID != nil {
		t.Fatalf("expected dev-mode request to pass with nil BranchID; got %+v", cap.bc)
	}
}

func TestBranchMiddleware_AdminNoHeader(t *testing.T) {
	m := newTestMiddleware(true, true)
	cap := &captureHandler{}
	h := m.Handler(cap)

	req := withClaims(httptest.NewRequest("GET", "/x", nil), "admin-1", "admin")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("admin should pass without header; got status %d", rec.Code)
	}
	if cap.bc == nil || !cap.bc.IsAdmin {
		t.Fatalf("expected IsAdmin=true; got %+v", cap.bc)
	}
	if cap.bc.BranchID != nil {
		t.Errorf("admin without header should have nil BranchID; got %v", *cap.bc.BranchID)
	}
}

func TestBranchMiddleware_NonAdminMissingHeaderRequired(t *testing.T) {
	m := newTestMiddleware(true, true)
	h := m.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("downstream should not be called")
	}))

	req := withClaims(httptest.NewRequest("GET", "/x", nil), "u1", "member")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when X-Branch-Id missing and required; got %d", rec.Code)
	}
}

func TestBranchMiddleware_NonAdminMissingHeaderNotRequired(t *testing.T) {
	m := newTestMiddleware(true, false)
	cap := &captureHandler{}
	h := m.Handler(cap)

	req := withClaims(httptest.NewRequest("GET", "/x", nil), "u1", "member")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 when header optional; got %d", rec.Code)
	}
	if cap.bc == nil || cap.bc.BranchID != nil {
		t.Errorf("expected nil BranchID when header omitted and not required; got %+v", cap.bc)
	}
}

func TestBranchMiddleware_InvalidHeader(t *testing.T) {
	m := newTestMiddleware(true, true)
	h := m.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("downstream should not be called on invalid header")
	}))

	req := withClaims(httptest.NewRequest("GET", "/x", nil), "admin-1", "admin")
	req.Header.Set("X-Branch-Id", "not-a-uuid")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid UUID; got %d", rec.Code)
	}
}

func TestBranchMiddleware_AdminWithValidHeader(t *testing.T) {
	m := newTestMiddleware(true, true)
	cap := &captureHandler{}
	h := m.Handler(cap)

	branchID := uuid.New()
	req := withClaims(httptest.NewRequest("GET", "/x", nil), "admin-1", "admin")
	req.Header.Set("X-Branch-Id", branchID.String())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("admin with valid header should pass without DB check; got %d", rec.Code)
	}
	if cap.bc == nil || cap.bc.BranchID == nil || *cap.bc.BranchID != branchID {
		t.Fatalf("expected BranchID=%s; got %+v", branchID, cap.bc)
	}
}

func TestBranchIDForQuery_NilContext(t *testing.T) {
	if id := branchctx.IDForQuery(context.Background()); id != nil {
		t.Errorf("expected nil for empty context; got %v", id)
	}
}

func TestBranchIDForQuery_WithBranch(t *testing.T) {
	bid := uuid.New()
	ctx := branchctx.With(context.Background(), &branchctx.Context{BranchID: &bid})
	got := branchctx.IDForQuery(ctx)
	if got == nil || *got != bid {
		t.Errorf("expected %s; got %v", bid, got)
	}
}

func TestBranchIDForQuery_AdminAllBranches(t *testing.T) {
	// Admin scope with no chosen branch — BranchID stays nil.
	ctx := branchctx.With(context.Background(), &branchctx.Context{IsAdmin: true})
	if got := branchctx.IDForQuery(ctx); got != nil {
		t.Errorf("expected nil BranchID for admin all-branches; got %v", got)
	}
}
