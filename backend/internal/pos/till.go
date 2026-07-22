package pos

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/audit"
	"github.com/google/uuid"
)

// TillSessionStatus is the drawer lifecycle state.
type TillSessionStatus string

const (
	TillSessionOpen   TillSessionStatus = "OPEN"
	TillSessionClosed TillSessionStatus = "CLOSED"
)

// TillSession is one drawer shift on a register: opened with a float,
// accumulates completed-sale tenders, closed with counted totals and an
// over/short figure.
type TillSession struct {
	ID           uuid.UUID         `json:"id" db:"id"`
	RegisterID   string            `json:"register_id" db:"register_id"`
	BranchID     *uuid.UUID        `json:"branch_id,omitempty" db:"branch_id"`
	CashierID    uuid.UUID         `json:"cashier_id" db:"cashier_id"`
	Status       TillSessionStatus `json:"status" db:"status"`
	OpeningFloat int64             `json:"opening_float" db:"opening_float"` // Cents
	OpenedAt     time.Time         `json:"opened_at" db:"opened_at"`
	ClosedAt     *time.Time        `json:"closed_at,omitempty" db:"closed_at"`

	// Set at close (cents keyed by tender method):
	ExpectedByMethod map[string]int64 `json:"expected_by_method,omitempty"`
	CountedByMethod  map[string]int64 `json:"counted_by_method,omitempty"`
	OverShort        *int64           `json:"over_short,omitempty"` // Cents; negative = short
	GLEntryID        *uuid.UUID       `json:"gl_entry_id,omitempty"`
	Notes            string           `json:"notes"`
}

// TillReport is the live (X) or closing (Z) summary for a session.
type TillReport struct {
	Session          TillSession      `json:"session"`
	SaleCount        int              `json:"sale_count"`
	SalesTotal       int64            `json:"sales_total"`        // Cents (completed sales)
	TaxTotal         int64            `json:"tax_total"`          // Cents
	ChangeGiven      int64            `json:"change_given"`       // Cents
	TenderedByMethod map[string]int64 `json:"tendered_by_method"` // Cents, raw tenders
	ExpectedByMethod map[string]int64 `json:"expected_by_method"` // Cents, drawer expectation
}

// OpenTillRequest opens a drawer on a register.
type OpenTillRequest struct {
	RegisterID   string  `json:"register_id"`
	OpeningFloat float64 `json:"opening_float"` // Dollars (wire convention matches tenders)
}

// CloseTillRequest closes the session with counted amounts.
type CloseTillRequest struct {
	CountedByMethod map[string]float64 `json:"counted_by_method"` // Dollars by method
	Notes           string             `json:"notes"`
}

// expectedFromTenders computes what the drawer should hold per method:
// CASH expectation = opening float + cash tendered − change given (change is
// assumed returned from the cash drawer); other methods are informational
// pass-throughs of what was tendered. Pure function for testability.
func expectedFromTenders(openingFloat int64, tendered map[string]int64, changeGiven int64) map[string]int64 {
	expected := make(map[string]int64, len(tendered)+1)
	for m, v := range tendered {
		expected[m] = v
	}
	expected["CASH"] = openingFloat + tendered["CASH"] - changeGiven
	return expected
}

// overShortTotal sums counted − expected across the methods that were
// counted. Methods not counted are skipped (a dealer may only count cash).
func overShortTotal(expected, counted map[string]int64) int64 {
	var total int64
	for method, c := range counted {
		total += c - expected[method]
	}
	return total
}

// OpenTill opens a drawer session for a register.
func (s *Service) OpenTill(ctx context.Context, registerID string, cashierID uuid.UUID, openingFloatCents int64) (*TillSession, error) {
	if registerID == "" {
		return nil, fmt.Errorf("register_id is required")
	}
	if openingFloatCents < 0 {
		return nil, fmt.Errorf("opening float cannot be negative")
	}
	if existing, err := s.repo.GetOpenTillSession(ctx, registerID); err == nil && existing != nil {
		return nil, fmt.Errorf("register %s already has an open till session (opened %s)", registerID, existing.OpenedAt.Format(time.RFC3339))
	}

	session := &TillSession{
		RegisterID:   registerID,
		CashierID:    cashierID,
		Status:       TillSessionOpen,
		OpeningFloat: openingFloatCents,
	}
	if err := s.repo.CreateTillSession(ctx, session); err != nil {
		return nil, err
	}

	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "pos.till.opened",
			EntityType: "till_session",
			EntityID:   session.ID,
			Changes: map[string]interface{}{
				"register_id":         registerID,
				"opening_float_cents": openingFloatCents,
			},
		})
	}
	s.logger.Info("till opened", "register", registerID, "session", session.ID, "float_cents", openingFloatCents)
	return session, nil
}

// CurrentTill returns the open session for a register, or nil.
func (s *Service) CurrentTill(ctx context.Context, registerID string) (*TillSession, error) {
	return s.repo.GetOpenTillSession(ctx, registerID)
}

// TillReport builds the live X-report for a session.
func (s *Service) TillReport(ctx context.Context, sessionID uuid.UUID) (*TillReport, error) {
	session, err := s.repo.GetTillSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	agg, err := s.repo.AggregateTillSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	return &TillReport{
		Session:          *session,
		SaleCount:        agg.SaleCount,
		SalesTotal:       agg.SalesTotal,
		TaxTotal:         agg.TaxTotal,
		ChangeGiven:      agg.ChangeGiven,
		TenderedByMethod: agg.TenderedByMethod,
		ExpectedByMethod: expectedFromTenders(session.OpeningFloat, agg.TenderedByMethod, agg.ChangeGiven),
	}, nil
}

// CloseTill closes the session: computes expected per method from the
// session's completed sales, records counted amounts, and stores over/short.
func (s *Service) CloseTill(ctx context.Context, sessionID uuid.UUID, countedByMethodCents map[string]int64, notes string) (*TillReport, error) {
	report, err := s.TillReport(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if report.Session.Status != TillSessionOpen {
		return nil, fmt.Errorf("till session is not open (status: %s)", report.Session.Status)
	}

	overShort := overShortTotal(report.ExpectedByMethod, countedByMethodCents)
	now := time.Now()
	session := report.Session
	session.Status = TillSessionClosed
	session.ClosedAt = &now
	session.ExpectedByMethod = report.ExpectedByMethod
	session.CountedByMethod = countedByMethodCents
	session.OverShort = &overShort
	session.Notes = notes

	if err := s.repo.CloseTillSession(ctx, &session); err != nil {
		return nil, err
	}
	report.Session = session

	// Post the drawer variance to the GL (best-effort, post-close): a GL
	// hiccup must not block a completed count. A nonzero over/short books a
	// balanced Cash Over/Short entry; the entry is linked back onto the
	// session so the ledger and the till reconcile.
	if s.tillLedger != nil && overShort != 0 {
		if glID, err := s.tillLedger.PostTillOverShort(ctx, sessionID, overShort); err != nil {
			s.logger.Error("CRITICAL: till closed but over/short GL posting failed — reconcile manually",
				"session", sessionID, "over_short_cents", overShort, "error", err)
		} else if glID != uuid.Nil {
			if err := s.repo.SetTillSessionGLEntry(ctx, sessionID, glID); err != nil {
				s.logger.Error("till over/short posted to GL but session link update failed",
					"session", sessionID, "gl_entry_id", glID, "error", err)
			} else {
				session.GLEntryID = &glID
				report.Session = session
			}
		}
	}

	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "pos.till.closed",
			EntityType: "till_session",
			EntityID:   sessionID,
			Changes: map[string]interface{}{
				"register_id":      session.RegisterID,
				"over_short_cents": overShort,
				"sales_total":      report.SalesTotal,
				"sale_count":       report.SaleCount,
			},
		})
	}
	s.logger.Info("till closed", "session", sessionID, "over_short_cents", overShort)
	return report, nil
}
