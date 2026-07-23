package pos

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ZReport is the immutable end-of-day snapshot generated once when a till
// session closes. Payload is the frozen closing TillReport (never recomputed).
type ZReport struct {
	ID            uuid.UUID       `json:"id"`
	TillSessionID uuid.UUID       `json:"till_session_id"`
	RegisterID    string          `json:"register_id"`
	BranchID      *uuid.UUID      `json:"branch_id,omitempty"`
	OverShort     int64           `json:"over_short"` // cents
	Payload       json.RawMessage `json:"payload"`
	GeneratedAt   time.Time       `json:"generated_at"`
}

// generateZReport persists the frozen Z snapshot for a just-closed session.
// Idempotent: the unique constraint on till_session_id means a re-close (or a
// retry) never produces a second, divergent Z. Best-effort — the close and
// its GL posting have already committed; a snapshot hiccup is logged, not
// fatal (the till_sessions row remains the source of truth).
func (s *Service) generateZReport(ctx context.Context, report *TillReport) {
	sess := report.Session
	payload, err := json.Marshal(report)
	if err != nil {
		s.logger.Error("failed to marshal Z-report payload", "session", sess.ID, "error", err)
		return
	}
	var overShort int64
	if sess.OverShort != nil {
		overShort = *sess.OverShort
	}
	z := &ZReport{
		TillSessionID: sess.ID,
		RegisterID:    sess.RegisterID,
		BranchID:      sess.BranchID,
		OverShort:     overShort,
		Payload:       payload,
	}
	if err := s.repo.CreateZReport(ctx, z); err != nil {
		s.logger.Error("failed to persist Z-report", "session", sess.ID, "error", err)
	}
}

// GetZReport returns the persisted Z snapshot for a session (or an error if
// the session was never closed / has no Z).
func (s *Service) GetZReport(ctx context.Context, sessionID uuid.UUID) (*ZReport, error) {
	return s.repo.GetZReportBySession(ctx, sessionID)
}

// ListZReports returns Z snapshots for a register on a date (both optional).
func (s *Service) ListZReports(ctx context.Context, registerID string, date time.Time) ([]ZReport, error) {
	return s.repo.ListZReports(ctx, registerID, date)
}
