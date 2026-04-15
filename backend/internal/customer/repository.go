package customer

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	CreateCustomer(ctx context.Context, c *Customer) error
	GetCustomer(ctx context.Context, id uuid.UUID) (*Customer, error)
	GetCustomerByEmail(ctx context.Context, email string) (*Customer, error)
	ListCustomers(ctx context.Context) ([]Customer, error)
	ListCustomersPaginated(ctx context.Context, limit, offset int) ([]Customer, int, error)

	ListPriceLevels(ctx context.Context) ([]PriceLevel, error)
	GetPriceLevel(ctx context.Context, id uuid.UUID) (*PriceLevel, error)

	UpdateBalance(ctx context.Context, id uuid.UUID, delta float64) error
	UpdateSalesperson(ctx context.Context, customerID uuid.UUID, salespersonID *uuid.UUID) error

	CreateContact(ctx context.Context, c *Contact) error
	GetContact(ctx context.Context, id uuid.UUID) (*Contact, error)
	ListContactsByCustomer(ctx context.Context, customerID uuid.UUID) ([]Contact, error)
	UpdateContact(ctx context.Context, c *Contact) error
	DeleteContact(ctx context.Context, id uuid.UUID) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateCustomer(ctx context.Context, c *Customer) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now

	// Ensure multiplier logic or let DB handle it?
	// DB defaults are good, but if we are passing struct, we should set defaults if not zero.

	query := `
		INSERT INTO customers (
			id, name, account_number, email, phone, address, 
			price_level_id, credit_limit, balance_due, is_active, 
			tier,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		c.ID, c.Name, c.AccountNumber, c.Email, c.Phone, c.Address,
		c.PriceLevelID, c.CreditLimit, c.BalanceDue, c.IsActive,
		c.Tier,
		c.CreatedAt, c.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create customer: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetCustomer(ctx context.Context, id uuid.UUID) (*Customer, error) {
	query := `
		SELECT
			c.id, c.name, c.account_number, c.email, c.phone, c.address,
			c.price_level_id, c.credit_limit, c.balance_due, c.is_active,
			c.tier,
			c.created_at, c.updated_at,
			pl.id, pl.name, pl.multiplier,
			c.salesperson_id, COALESCE(st.name, '')
		FROM customers c
		LEFT JOIN price_levels pl ON c.price_level_id = pl.id
		LEFT JOIN sales_team st ON c.salesperson_id = st.id
		WHERE c.id = $1
	`

	var c Customer
	var pl PriceLevel
	var plID *uuid.UUID
	var plName *string
	var plMult *float64

	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&c.ID, &c.Name, &c.AccountNumber, &c.Email, &c.Phone, &c.Address,
		&c.PriceLevelID, &c.CreditLimit, &c.BalanceDue, &c.IsActive,
		&c.Tier,
		&c.CreatedAt, &c.UpdatedAt,
		&plID, &plName, &plMult,
		&c.SalespersonID, &c.SalespersonName,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("customer not found")
		}
		return nil, fmt.Errorf("failed to get customer: %w", err)
	}

	if plID != nil {
		pl.ID = *plID
		if plName != nil {
			pl.Name = *plName
		}
		if plMult != nil {
			pl.Multiplier = *plMult
		}
		c.PriceLevel = &pl
	}

	return &c, nil
}

func (r *PostgresRepository) GetCustomerByEmail(ctx context.Context, email string) (*Customer, error) {
	query := `
		SELECT
			c.id, c.name, c.account_number, c.email, c.phone, c.address,
			c.price_level_id, c.credit_limit, c.balance_due, c.is_active,
			c.tier,
			c.created_at, c.updated_at,
			pl.id, pl.name, pl.multiplier,
			c.salesperson_id, COALESCE(st.name, '')
		FROM customers c
		LEFT JOIN price_levels pl ON c.price_level_id = pl.id
		LEFT JOIN sales_team st ON c.salesperson_id = st.id
		WHERE c.email = $1
	`

	var c Customer
	var pl PriceLevel
	var plID *uuid.UUID
	var plName *string
	var plMult *float64

	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, email).Scan(
		&c.ID, &c.Name, &c.AccountNumber, &c.Email, &c.Phone, &c.Address,
		&c.PriceLevelID, &c.CreditLimit, &c.BalanceDue, &c.IsActive,
		&c.Tier,
		&c.CreatedAt, &c.UpdatedAt,
		&plID, &plName, &plMult,
		&c.SalespersonID, &c.SalespersonName,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("customer not found")
		}
		return nil, fmt.Errorf("failed to get customer by email: %w", err)
	}

	if plID != nil {
		pl.ID = *plID
		if plName != nil {
			pl.Name = *plName
		}
		if plMult != nil {
			pl.Multiplier = *plMult
		}
		c.PriceLevel = &pl
	}

	return &c, nil
}

func (r *PostgresRepository) ListCustomers(ctx context.Context) ([]Customer, error) {
	query := `
		SELECT
			c.id, c.name, c.account_number, c.email, c.phone, c.address,
			c.price_level_id, c.credit_limit, c.balance_due, c.is_active,
			c.tier,
			c.created_at, c.updated_at,
			pl.id, pl.name, pl.multiplier,
			c.salesperson_id, COALESCE(st.name, '')
		FROM customers c
		LEFT JOIN price_levels pl ON c.price_level_id = pl.id
		LEFT JOIN sales_team st ON c.salesperson_id = st.id
		ORDER BY c.name ASC
	`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list customers: %w", err)
	}
	defer rows.Close()

	var customers []Customer
	for rows.Next() {
		var c Customer
		var pl PriceLevel
		var plID *uuid.UUID
		var plName *string
		var plMult *float64

		if err := rows.Scan(
			&c.ID, &c.Name, &c.AccountNumber, &c.Email, &c.Phone, &c.Address,
			&c.PriceLevelID, &c.CreditLimit, &c.BalanceDue, &c.IsActive,
			&c.Tier,
			&c.CreatedAt, &c.UpdatedAt,
			&plID, &plName, &plMult,
			&c.SalespersonID, &c.SalespersonName,
		); err != nil {
			return nil, fmt.Errorf("failed to scan customer: %w", err)
		}

		if plID != nil {
			pl.ID = *plID
			if plName != nil {
				pl.Name = *plName
			}
			if plMult != nil {
				pl.Multiplier = *plMult
			}
			c.PriceLevel = &pl
		}

		customers = append(customers, c)
	}
	return customers, nil
}

func (r *PostgresRepository) ListCustomersPaginated(ctx context.Context, limit, offset int) ([]Customer, int, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM customers`
	var total int
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count customers: %w", err)
	}

	query := `
		SELECT
			c.id, c.name, c.account_number, c.email, c.phone, c.address,
			c.price_level_id, c.credit_limit, c.balance_due, c.is_active,
			c.tier,
			c.created_at, c.updated_at,
			pl.id, pl.name, pl.multiplier,
			c.salesperson_id, COALESCE(st.name, '')
		FROM customers c
		LEFT JOIN price_levels pl ON c.price_level_id = pl.id
		LEFT JOIN sales_team st ON c.salesperson_id = st.id
		ORDER BY c.name ASC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list customers: %w", err)
	}
	defer rows.Close()

	var customers []Customer
	for rows.Next() {
		var c Customer
		var pl PriceLevel
		var plID *uuid.UUID
		var plName *string
		var plMult *float64

		if err := rows.Scan(
			&c.ID, &c.Name, &c.AccountNumber, &c.Email, &c.Phone, &c.Address,
			&c.PriceLevelID, &c.CreditLimit, &c.BalanceDue, &c.IsActive,
			&c.Tier,
			&c.CreatedAt, &c.UpdatedAt,
			&plID, &plName, &plMult,
			&c.SalespersonID, &c.SalespersonName,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan customer: %w", err)
		}

		if plID != nil {
			pl.ID = *plID
			if plName != nil {
				pl.Name = *plName
			}
			if plMult != nil {
				pl.Multiplier = *plMult
			}
			c.PriceLevel = &pl
		}

		customers = append(customers, c)
	}
	return customers, total, nil
}

func (r *PostgresRepository) ListPriceLevels(ctx context.Context) ([]PriceLevel, error) {
	query := `SELECT id, name, multiplier, created_at, updated_at FROM price_levels ORDER BY name`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list price levels: %w", err)
	}
	defer rows.Close()

	var levels []PriceLevel
	for rows.Next() {
		var l PriceLevel
		if err := rows.Scan(&l.ID, &l.Name, &l.Multiplier, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan price level: %w", err)
		}
		levels = append(levels, l)
	}
	return levels, nil
}

func (r *PostgresRepository) GetPriceLevel(ctx context.Context, id uuid.UUID) (*PriceLevel, error) {
	query := `SELECT id, name, multiplier, created_at, updated_at FROM price_levels WHERE id = $1`
	var l PriceLevel
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(&l.ID, &l.Name, &l.Multiplier, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("price level not found")
		}
		return nil, fmt.Errorf("failed to get price level: %w", err)
	}
	return &l, nil
}

func (r *PostgresRepository) UpdateBalance(ctx context.Context, id uuid.UUID, delta float64) error {
	query := `UPDATE customers SET balance_due = balance_due + $1, updated_at = NOW() WHERE id = $2`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, delta, id)
	if err != nil {
		return fmt.Errorf("failed to update balance: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("customer not found")
	}
	return nil
}

func (r *PostgresRepository) UpdateSalesperson(ctx context.Context, customerID uuid.UUID, salespersonID *uuid.UUID) error {
	query := `UPDATE customers SET salesperson_id = $1, updated_at = NOW() WHERE id = $2`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, salespersonID, customerID)
	if err != nil {
		return fmt.Errorf("failed to update salesperson: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("customer not found")
	}
	return nil
}
