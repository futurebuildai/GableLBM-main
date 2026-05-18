package account

import (
	"context"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	CreateTransaction(ctx context.Context, txn *CustomerTransaction) error
	GetTransactionsByCustomerID(ctx context.Context, customerID uuid.UUID) ([]CustomerTransaction, error)
	GetBalance(ctx context.Context, customerID uuid.UUID) (int64, error)
	GetCreditLimit(ctx context.Context, customerID uuid.UUID) (int64, error)
	UpdateCustomerBalance(ctx context.Context, customerID uuid.UUID, newBalance int64) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateTransaction(ctx context.Context, txn *CustomerTransaction) error {
	query := `
		INSERT INTO customer_transactions (
			id, customer_id, type, amount, balance_after, reference_id, description, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8
		)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		txn.ID,
		txn.CustomerID,
		txn.Type,
		txn.Amount,
		txn.BalanceAfter,
		txn.ReferenceID,
		txn.Description,
		txn.CreatedAt,
	)
	return err
}

func (r *PostgresRepository) GetTransactionsByCustomerID(ctx context.Context, customerID uuid.UUID) ([]CustomerTransaction, error) {
	query := `
		SELECT id, customer_id, type, amount, balance_after, reference_id, description, created_at
		FROM customer_transactions 
		WHERE customer_id = $1 
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txns []CustomerTransaction
	for rows.Next() {
		var t CustomerTransaction
		if err := rows.Scan(
			&t.ID,
			&t.CustomerID,
			&t.Type,
			&t.Amount,
			&t.BalanceAfter,
			&t.ReferenceID,
			&t.Description,
			&t.CreatedAt,
		); err != nil {
			return nil, err
		}
		txns = append(txns, t)
	}
	return txns, nil
}

func (r *PostgresRepository) GetBalance(ctx context.Context, customerID uuid.UUID) (int64, error) {
	var balanceFloat float64
	query := `SELECT balance_due FROM customers WHERE id = $1 FOR UPDATE`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, customerID).Scan(&balanceFloat)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil // Or error?
		}
		return 0, err
	}
	return int64(balanceFloat * 100), nil
}

func (r *PostgresRepository) GetCreditLimit(ctx context.Context, customerID uuid.UUID) (int64, error) {
	var limitFloat float64
	query := `SELECT credit_limit FROM customers WHERE id = $1`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, customerID).Scan(&limitFloat)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	return int64(limitFloat * 100), nil
}

func (r *PostgresRepository) UpdateCustomerBalance(ctx context.Context, customerID uuid.UUID, newBalance int64) error {
	balanceDecimal := float64(newBalance) / 100.0
	query := `UPDATE customers SET balance_due = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, balanceDecimal, time.Now(), customerID)
	return err
}
