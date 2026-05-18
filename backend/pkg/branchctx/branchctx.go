// Package branchctx holds the context primitives for branch scoping.
// It is intentionally tiny so it can be imported by lower-level packages
// (e.g. customer) without creating an import cycle with pkg/middleware,
// which itself depends on internal/customer for partner authentication.
package branchctx

import (
	"context"

	"github.com/google/uuid"
)

type contextKey struct{}

// Key is the value used to store *Context in request contexts.
var Key = contextKey{}

// Context describes the branch scoping that applies to a request.
// BranchID is nil when the request is admin/owner-scoped and has elected
// "all branches" by omitting the X-Branch-Id header. Non-admin requests
// always have a non-nil BranchID by the time they reach a handler.
type Context struct {
	BranchID *uuid.UUID
	UserSub  string
	IsAdmin  bool
}

// FromContext returns the branch Context attached to ctx, or nil if the
// branch middleware did not run on this path.
func FromContext(ctx context.Context) *Context {
	bc, _ := ctx.Value(Key).(*Context)
	return bc
}

// IDForQuery returns the *uuid.UUID suitable for the
// "WHERE ($1::uuid IS NULL OR branch_id = $1)" idiom used by branch-scoped
// repositories. Returns nil if no branch context is present.
func IDForQuery(ctx context.Context) *uuid.UUID {
	bc := FromContext(ctx)
	if bc == nil {
		return nil
	}
	return bc.BranchID
}

// With injects a branch Context onto ctx. Used by test helpers and by
// receivers (e.g. A2A) that bypass the HTTP branch middleware.
func With(ctx context.Context, bc *Context) context.Context {
	return context.WithValue(ctx, Key, bc)
}
