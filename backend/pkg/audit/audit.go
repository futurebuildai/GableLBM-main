package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

// Entry represents a single audit log record for a financial operation.
type Entry struct {
	Action     string
	EntityType string
	EntityID   uuid.UUID
	UserID     string
	Changes    map[string]interface{}
}

// Logger writes audit entries to the audit_log table.
type Logger struct {
	db *database.DB
	wg sync.WaitGroup
}

// NewLogger creates a new audit Logger backed by the given database.
func NewLogger(db *database.DB) *Logger {
	return &Logger{db: db}
}

// Log writes an audit entry, extracting user/request info from context.
// It runs asynchronously so it never blocks the calling request.
func (l *Logger) Log(ctx context.Context, entry Entry) {
	// Extract user ID from JWT claims in context
	userID := entry.UserID
	if userID == "" {
		if claims := middleware.ClaimsFromContext(ctx); claims != nil {
			userID = claims.Subject
		}
	}

	// Extract request ID from context
	requestID := middleware.GetRequestID(ctx)

	// Marshal changes to JSON
	var changesJSON []byte
	if entry.Changes != nil {
		var err error
		changesJSON, err = json.Marshal(entry.Changes)
		if err != nil {
			slog.Error("audit: failed to marshal changes", "error", err)
			changesJSON = nil
		}
	}

	// Fire and forget — audit logging should never block the request
	l.wg.Add(1)
	go func() {
		defer l.wg.Done()
		_, err := l.db.Pool.Exec(context.Background(),
			`INSERT INTO audit_log (action, entity_type, entity_id, user_id, changes, request_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			entry.Action, entry.EntityType, entry.EntityID, userID, changesJSON, requestID,
		)
		if err != nil {
			slog.Error("audit: failed to write audit log",
				"action", entry.Action,
				"entity_type", entry.EntityType,
				"entity_id", entry.EntityID,
				"error", err,
			)
		}
	}()
}

// Drain blocks until all in-flight audit log writes have completed.
// Call this during graceful shutdown before closing the database pool.
func (l *Logger) Drain() {
	l.wg.Wait()
}
