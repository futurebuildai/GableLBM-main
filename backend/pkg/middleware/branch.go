package middleware

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gablelbm/gable/pkg/branchctx"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// BranchContext is an alias for branchctx.Context. The canonical type lives
// in pkg/branchctx so that low-level packages (e.g. internal/customer) can
// read branch context without creating an import cycle through this
// middleware package (which depends on internal/customer for partner auth).
type BranchContext = branchctx.Context

// BranchFromContext returns the BranchContext attached to ctx, or nil if the
// branch middleware did not run on this path (e.g. portal, integration).
func BranchFromContext(ctx context.Context) *BranchContext {
	return branchctx.FromContext(ctx)
}

// BranchIDForQuery returns the *uuid.UUID suitable for the
// "WHERE ($1::uuid IS NULL OR branch_id = $1)" idiom used by branch-scoped
// repositories. Returns nil if no branch context is present.
func BranchIDForQuery(ctx context.Context) *uuid.UUID {
	return branchctx.IDForQuery(ctx)
}

// defaultBranchCache stores the resolved system_settings.default_branch_id
// for the lifetime of the process. Admins changing the default require a
// restart, which matches the kill-switch behavior.
var defaultBranchCache atomic.Value // holds uuid.UUID

// ResolveBranchForWrite returns the branch_id that a write operation should
// stamp onto a new row. It prefers the request's BranchContext, falling back
// to system_settings.default_branch_id. This is the bridge between the
// admin "no header == all branches" read semantic and the requirement that
// every persisted row carry a non-null branch_id.
//
// Returns uuid.Nil and an error only when neither source is available
// (e.g. early in a migration before 059 has run).
func ResolveBranchForWrite(ctx context.Context, db *database.DB) (uuid.UUID, error) {
	if bc := BranchFromContext(ctx); bc != nil && bc.BranchID != nil {
		return *bc.BranchID, nil
	}
	if v, ok := defaultBranchCache.Load().(uuid.UUID); ok && v != uuid.Nil {
		return v, nil
	}
	if db == nil {
		return uuid.Nil, errors.New("no branch in context and no db handle to resolve default")
	}
	var s string
	err := db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT value FROM system_settings WHERE key = 'default_branch_id'`).Scan(&s)
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve default branch: %w", err)
	}
	id, err := uuid.Parse(strings.TrimSpace(s))
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid default_branch_id setting: %w", err)
	}
	defaultBranchCache.Store(id)
	return id, nil
}

// WithBranchContext is a test helper that injects a BranchContext.
func WithBranchContext(ctx context.Context, bc *BranchContext) context.Context {
	return context.WithValue(ctx, branchctx.Key, bc)
}

// BranchMiddleware enforces the multi-branch contract on a request:
//   1. Reads `X-Branch-Id` from the request.
//   2. Validates the header against the `user_locations` join table for
//      non-admin users; rejects with 403 on miss.
//   3. Admin/owner users may omit the header to query across all branches.
//   4. Honors the `multi_branch_enabled` kill switch in `system_settings`:
//      when false (or unset), the middleware behaves as if every request
//      is admin (no header required, no validation).
type BranchMiddleware struct {
	db *database.DB

	// killSwitch is the cached value of `multi_branch_enabled`; refreshed
	// every killSwitchTTL. atomic.Bool so reads on the hot path are lock-free.
	killSwitch     atomic.Bool
	killSwitchAt   atomic.Int64 // unix nanos of last refresh
	killSwitchTTL  time.Duration
	requireDefault atomic.Bool // `default_branch_required`

	// bootstrapped tracks user_subs we have already auto-granted access to
	// the default branch (admin/owner first-login fallback). Values are
	// struct{} sentinels — presence == done.
	bootstrapped sync.Map
}

// NewBranchMiddleware constructs a BranchMiddleware. The kill switch is
// re-read from the DB at most once every 30s.
func NewBranchMiddleware(db *database.DB) *BranchMiddleware {
	bm := &BranchMiddleware{db: db, killSwitchTTL: 30 * time.Second}
	bm.refreshSettings(context.Background())
	return bm
}

// Handler returns the http.Handler wrapper.
func (m *BranchMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		m.maybeRefreshSettings(ctx)

		claims := ClaimsFromContext(ctx)
		isAdmin := claimsHasAnyRole(claims, "admin", "owner")
		userSub := ""
		if claims != nil {
			userSub = claims.Subject
		}

		bc := &BranchContext{UserSub: userSub, IsAdmin: isAdmin}

		// Kill switch off: behave single-branch — every request gets nil
		// BranchID and is treated as admin for downstream filtering.
		if !m.killSwitch.Load() {
			bc.IsAdmin = true
			ctx = context.WithValue(ctx, branchctx.Key, bc)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// First-login fallback: admins/owners with no user_locations rows are
		// auto-granted home access to the default branch so the frontend
		// selector populates and they can target other branches without an
		// out-of-band psql grant. Idempotent and cached per-process.
		if isAdmin && userSub != "" {
			m.maybeBootstrapAdmin(ctx, userSub)
		}

		hdr := strings.TrimSpace(r.Header.Get("X-Branch-Id"))

		if hdr == "" {
			if isAdmin || claims == nil { // dev mode (no claims) is permissive
				ctx = context.WithValue(ctx, branchctx.Key, bc)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			if m.requireDefault.Load() {
				httputil.RespondError(w, r, "X-Branch-Id header required", http.StatusBadRequest, nil)
				return
			}
			ctx = context.WithValue(ctx, branchctx.Key, bc)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		id, err := uuid.Parse(hdr)
		if err != nil {
			httputil.RespondError(w, r, "invalid X-Branch-Id", http.StatusBadRequest, err)
			return
		}

		// Admins may target any branch without an explicit grant.
		if !isAdmin && claims != nil {
			ok, err := m.userHasBranch(ctx, claims.Subject, id)
			if err != nil {
				httputil.RespondError(w, r, "branch access lookup failed", http.StatusInternalServerError, err)
				return
			}
			if !ok {
				httputil.RespondError(w, r, "no access to branch", http.StatusForbidden, nil)
				return
			}
		}

		bc.BranchID = &id
		ctx = context.WithValue(ctx, branchctx.Key, bc)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// maybeBootstrapAdmin grants the given admin/owner sub home access to the
// `default_branch_id` if they currently have zero user_locations rows. The
// result is cached in-process so the DB is hit at most once per sub per
// server run, even if the grant ultimately fails.
func (m *BranchMiddleware) maybeBootstrapAdmin(ctx context.Context, sub string) {
	if m.db == nil {
		return
	}
	if _, done := m.bootstrapped.Load(sub); done {
		return
	}
	// Mark immediately to avoid a thundering herd on first login.
	m.bootstrapped.Store(sub, struct{}{})

	var has bool
	if err := m.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM user_locations WHERE user_sub = $1)`, sub).Scan(&has); err != nil {
		slog.Warn("branch bootstrap: lookup failed", "user_sub", sub, "error", err)
		return
	}
	if has {
		return
	}

	var defaultBranch string
	if err := m.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT value FROM system_settings WHERE key = 'default_branch_id'`).Scan(&defaultBranch); err != nil {
		slog.Warn("branch bootstrap: default_branch_id unavailable", "user_sub", sub, "error", err)
		return
	}
	branchID, err := uuid.Parse(strings.TrimSpace(defaultBranch))
	if err != nil {
		slog.Warn("branch bootstrap: invalid default_branch_id", "user_sub", sub, "value", defaultBranch, "error", err)
		return
	}

	_, err = m.db.GetExecutor(ctx).Exec(ctx,
		`INSERT INTO user_locations (user_sub, branch_id, is_home, granted_by)
		 VALUES ($1, $2, TRUE, 'middleware:bootstrap')
		 ON CONFLICT (user_sub, branch_id) DO NOTHING`,
		sub, branchID)
	if err != nil {
		slog.Warn("branch bootstrap: grant failed", "user_sub", sub, "branch_id", branchID, "error", err)
		return
	}
	slog.Info("branch bootstrap: granted default branch", "user_sub", sub, "branch_id", branchID)
}

func (m *BranchMiddleware) userHasBranch(ctx context.Context, sub string, branchID uuid.UUID) (bool, error) {
	var exists bool
	err := m.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM user_locations WHERE user_sub = $1 AND branch_id = $2)`,
		sub, branchID).Scan(&exists)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return exists, nil
}

func (m *BranchMiddleware) maybeRefreshSettings(ctx context.Context) {
	last := time.Unix(0, m.killSwitchAt.Load())
	if time.Since(last) < m.killSwitchTTL {
		return
	}
	m.refreshSettings(ctx)
}

func (m *BranchMiddleware) refreshSettings(ctx context.Context) {
	enabled := readBoolSetting(ctx, m.db, "multi_branch_enabled", false)
	required := readBoolSetting(ctx, m.db, "default_branch_required", true)
	m.killSwitch.Store(enabled)
	m.requireDefault.Store(required)
	m.killSwitchAt.Store(time.Now().UnixNano())
}

func readBoolSetting(ctx context.Context, db *database.DB, key string, def bool) bool {
	if db == nil {
		return def
	}
	var val string
	err := db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT value FROM system_settings WHERE key = $1`, key).Scan(&val)
	if err != nil {
		return def
	}
	switch strings.ToLower(strings.TrimSpace(val)) {
	case "true", "t", "1", "yes", "on":
		return true
	case "false", "f", "0", "no", "off":
		return false
	default:
		return def
	}
}

// Compose chains middleware in the order given so that the first element is
// the outermost wrapper. `Compose(a, b)(next)` is equivalent to
// `a(b(next))` — a runs first when a request arrives, b runs second.
// Useful for combining a role guard with the branch middleware at module
// registration sites without changing existing RegisterRoutes signatures.
func Compose(mws ...func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		for i := len(mws) - 1; i >= 0; i-- {
			if mws[i] != nil {
				next = mws[i](next)
			}
		}
		return next
	}
}

// claimsHasAnyRole returns true when the JWT claims grant any of the listed
// roles. Mirrors RequireRole's logic but exposed for in-package use.
func claimsHasAnyRole(claims *UserClaims, roles ...string) bool {
	if claims == nil {
		return false
	}
	want := make(map[string]bool, len(roles))
	for _, r := range roles {
		want[r] = true
	}
	if claims.Role != "" && want[claims.Role] {
		return true
	}
	for _, r := range claims.Roles {
		if want[r] {
			return true
		}
	}
	return false
}
