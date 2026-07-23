package deposit

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/gablelbm/gable/internal/account"
	"github.com/gablelbm/gable/internal/gl"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Service manages customer deposits: taking prepayments (DR Cash / CR 2200)
// and applying them against AR (DR 2200 / CR AR + a balance-reducing subledger
// entry). Unlike best-effort POS posting, a deposit's GL leg is REQUIRED and
// atomic with the deposit record — a ledger failure rolls the whole thing back.
type Service struct {
	db      *database.DB
	repo    Repository
	gl      *gl.Service
	account account.Service
	audit   *audit.Logger
	logger  *slog.Logger
}

func NewService(db *database.DB, repo Repository, glSvc *gl.Service, accountSvc account.Service, logger *slog.Logger) *Service {
	return &Service{db: db, repo: repo, gl: glSvc, account: accountSvc, logger: logger}
}

// WithAuditLog attaches an audit logger for the money-moving deposit ops.
func (s *Service) WithAuditLog(l *audit.Logger) *Service {
	s.audit = l
	return s
}

// RecordDeposit takes a customer prepayment: books DR Cash / CR Customer
// Deposits and persists the deposit row, atomically.
func (s *Service) RecordDeposit(ctx context.Context, req RecordDepositRequest) (*CustomerDeposit, error) {
	if req.CustomerID == uuid.Nil {
		return nil, fmt.Errorf("customer_id is required")
	}
	if req.Amount <= 0 {
		return nil, fmt.Errorf("deposit amount must be positive")
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "CASH"
	}

	d := &CustomerDeposit{
		ID:         uuid.New(),
		CustomerID: req.CustomerID,
		BranchID:   req.BranchID,
		Amount:     req.Amount,
		Status:     string(StatusOpen),
		Method:     method,
		Reference:  req.Reference,
		Note:       req.Note,
	}

	err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		glID, err := s.gl.SyncCustomerDeposit(ctx, d.ID, d.Amount)
		if err != nil {
			return fmt.Errorf("failed to post deposit to GL: %w", err)
		}
		if glID != uuid.Nil {
			d.GLEntryID = &glID
		}
		return s.repo.Create(ctx, d)
	})
	if err != nil {
		return nil, err
	}

	d.Remaining = d.Amount - d.AppliedAmount
	if s.audit != nil {
		s.audit.Log(ctx, audit.Entry{
			Action:     "deposit.recorded",
			EntityType: "customer_deposit",
			EntityID:   d.ID,
			Changes: map[string]interface{}{
				"customer_id":  d.CustomerID,
				"amount_cents": d.Amount,
				"method":       d.Method,
			},
		})
	}
	s.logger.Info("customer deposit recorded", "id", d.ID, "customer", d.CustomerID, "amount_cents", d.Amount)
	return d, nil
}

// ApplyDeposit draws a held deposit down against the customer's AR: books
// DR Customer Deposits / CR AR, reduces balance_due (payment-shaped), and
// records the application — all atomically. Applying more than the remaining
// balance, or against a non-open deposit, is rejected.
func (s *Service) ApplyDeposit(ctx context.Context, depositID uuid.UUID, req ApplyDepositRequest) (*DepositApplication, error) {
	if req.Amount <= 0 {
		return nil, fmt.Errorf("apply amount must be positive")
	}
	var app *DepositApplication

	err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		d, err := s.repo.Get(ctx, depositID)
		if err != nil {
			return err
		}
		if d.Status != string(StatusOpen) {
			return fmt.Errorf("deposit %s is not open (status %s)", depositID, d.Status)
		}
		remaining := d.Amount - d.AppliedAmount
		if req.Amount > remaining {
			return fmt.Errorf("apply amount %d cents exceeds remaining deposit %d cents", req.Amount, remaining)
		}

		glID, err := s.gl.ApplyCustomerDeposit(ctx, d.ID, req.Amount)
		if err != nil {
			return err
		}

		// Reduce the customer's balance_due (a deposit applied spends prepaid
		// funds against what they owe — payment-shaped, so negative).
		if s.account != nil {
			if _, err := s.account.PostTransaction(ctx, d.CustomerID, account.TransactionTypePayment, -req.Amount, &d.ID, "Customer deposit applied"); err != nil {
				return fmt.Errorf("failed to post deposit application to subledger: %w", err)
			}
		}

		newApplied := d.AppliedAmount + req.Amount
		newStatus := string(StatusOpen)
		if newApplied >= d.Amount {
			newStatus = string(StatusApplied)
		}
		app = &DepositApplication{
			ID:         uuid.New(),
			DepositID:  d.ID,
			CustomerID: d.CustomerID,
			Amount:     req.Amount,
			InvoiceID:  req.InvoiceID,
		}
		if glID != uuid.Nil {
			app.GLEntryID = &glID
		}
		return s.repo.RecordApplication(ctx, app, newApplied, newStatus)
	})
	if err != nil {
		return nil, err
	}

	if s.audit != nil {
		s.audit.Log(ctx, audit.Entry{
			Action:     "deposit.applied",
			EntityType: "customer_deposit",
			EntityID:   app.DepositID,
			Changes: map[string]interface{}{
				"customer_id":  app.CustomerID,
				"amount_cents": app.Amount,
				"invoice_id":   app.InvoiceID,
			},
		})
	}
	s.logger.Info("customer deposit applied", "deposit", app.DepositID, "customer", app.CustomerID, "amount_cents", app.Amount)
	return app, nil
}

// GetDeposit returns a single deposit.
func (s *Service) GetDeposit(ctx context.Context, id uuid.UUID) (*CustomerDeposit, error) {
	return s.repo.Get(ctx, id)
}

// ListDeposits returns a customer's deposits and their open (unapplied) balance.
func (s *Service) ListDeposits(ctx context.Context, customerID uuid.UUID) ([]CustomerDeposit, int64, error) {
	list, err := s.repo.ListByCustomer(ctx, customerID)
	if err != nil {
		return nil, 0, err
	}
	balance, err := s.repo.OpenBalance(ctx, customerID)
	if err != nil {
		return nil, 0, err
	}
	return list, balance, nil
}
