package account

import (
	"context"
	"log/slog"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

type Service interface {
	PostTransaction(ctx context.Context, customerID uuid.UUID, txnType TransactionType, amount int64, referenceID *uuid.UUID, description string) (*CustomerTransaction, error)
	GetAccountSummary(ctx context.Context, customerID uuid.UUID) (*AccountSummary, error)
	GetTransactions(ctx context.Context, customerID uuid.UUID) ([]CustomerTransaction, error)
}

type service struct {
	repo   Repository
	db     *database.DB
	logger *slog.Logger
}

func NewService(repo Repository, db *database.DB, logger *slog.Logger) Service {
	return &service{repo: repo, db: db, logger: logger}
}

func (s *service) PostTransaction(ctx context.Context, customerID uuid.UUID, txnType TransactionType, amount int64, referenceID *uuid.UUID, description string) (*CustomerTransaction, error) {
	var txn *CustomerTransaction

	err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		// 1. Get current balance
		currentBalance, err := s.repo.GetBalance(ctx, customerID)
		if err != nil {
			s.logger.Error("failed to get balance", "error", err, "customer_id", customerID)
			return err
		}

		// 2. Calculate new balance
		newBalance := currentBalance + amount

		// 3. Create Transaction Record
		txn = &CustomerTransaction{
			ID:           uuid.New(),
			CustomerID:   customerID,
			Type:         txnType,
			Amount:       amount,
			BalanceAfter: newBalance,
			ReferenceID:  referenceID,
			Description:  description,
			CreatedAt:    time.Now(),
		}

		if err := s.repo.CreateTransaction(ctx, txn); err != nil {
			s.logger.Error("failed to create transaction", "error", err, "customer_id", customerID)
			return err
		}

		// 4. Update Customer Balance
		if err := s.repo.UpdateCustomerBalance(ctx, customerID, newBalance); err != nil {
			s.logger.Error("failed to update customer balance", "error", err, "customer_id", customerID)
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	s.logger.Info("transaction posted", "customer_id", customerID, "type", txnType, "amount", amount, "new_balance", txn.BalanceAfter)
	return txn, nil
}

func (s *service) GetAccountSummary(ctx context.Context, customerID uuid.UUID) (*AccountSummary, error) {
	balance, err := s.repo.GetBalance(ctx, customerID)
	if err != nil {
		s.logger.Error("failed to get balance for summary", "error", err, "customer_id", customerID)
		return nil, err
	}

	creditLimit, err := s.repo.GetCreditLimit(ctx, customerID)
	if err != nil {
		s.logger.Error("failed to get credit limit for summary", "error", err, "customer_id", customerID)
		return nil, err
	}

	available := creditLimit - balance

	return &AccountSummary{
		CustomerID:      customerID,
		BalanceDue:      balance,
		CreditLimit:     creditLimit,
		AvailableCredit: available,
	}, nil
}

func (s *service) GetTransactions(ctx context.Context, customerID uuid.UUID) ([]CustomerTransaction, error) {
	return s.repo.GetTransactionsByCustomerID(ctx, customerID)
}
