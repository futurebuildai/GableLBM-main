package order

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// dollarsToInt64Cents converts a float64 dollar amount (from DB NUMERIC scan)
// to int64 cents with rounding.
func dollarsToInt64Cents(dollars float64) int64 {
	return int64(math.Round(dollars * 100))
}

type Repository interface {
	CreateOrder(ctx context.Context, o *Order) error
	GetOrder(ctx context.Context, id uuid.UUID) (*Order, error)
	ListOrders(ctx context.Context) ([]Order, error)
	ListOrdersPaginated(ctx context.Context, limit, offset int) ([]Order, int, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status OrderStatus) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateOrder(ctx context.Context, o *Order) error {
	exec := r.db.GetExecutor(ctx)

	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	now := time.Now()
	o.CreatedAt = now
	o.UpdatedAt = now
	o.Status = StatusDraft // Default to draft if not set

	// Insert Order — DB stores dollars as NUMERIC(19,4), model holds cents.
	// branch_id falls back to system_settings.default_branch_id when the
	// caller hasn't set one (single-branch mode or admin without header).
	queryOrder := `
		INSERT INTO orders (id, customer_id, quote_id, status, total_amount, salesperson_id, created_at, updated_at, branch_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
			COALESCE($9::uuid, (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')))
	`
	totalDollars := float64(o.TotalAmount) / 100.0
	var branchArg any
	if o.BranchID != uuid.Nil {
		branchArg = o.BranchID
	} else if bid := middleware.BranchIDForQuery(ctx); bid != nil {
		branchArg = *bid
		o.BranchID = *bid
	}
	_, err := exec.Exec(ctx, queryOrder,
		o.ID, o.CustomerID, o.QuoteID, o.Status, totalDollars, o.SalespersonID, o.CreatedAt, o.UpdatedAt, branchArg,
	)
	if err != nil {
		return fmt.Errorf("failed to insert order: %w", err)
	}

	// Insert Lines
	queryLine := `
		INSERT INTO order_lines (id, order_id, product_id, quantity, price_each, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	for i := range o.Lines {
		line := &o.Lines[i]
		if line.ID == uuid.Nil {
			line.ID = uuid.New()
		}
		line.OrderID = o.ID
		priceEachDollars := float64(line.PriceEach) / 100.0
		_, err = exec.Exec(ctx, queryLine,
			line.ID, line.OrderID, line.ProductID, line.Quantity, priceEachDollars, now,
		)
		if err != nil {
			return fmt.Errorf("failed to insert order line: %w", err)
		}
	}

	return nil
}

func (r *PostgresRepository) GetOrder(ctx context.Context, id uuid.UUID) (*Order, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	queryOrder := `
		SELECT o.id, o.customer_id, COALESCE(c.name, ''), o.quote_id, o.status, o.total_amount, o.created_at, o.updated_at,
			o.salesperson_id, COALESCE(st.name, ''), o.branch_id
		FROM orders o
		LEFT JOIN customers c ON c.id = o.customer_id
		LEFT JOIN sales_team st ON o.salesperson_id = st.id
		WHERE o.id = $1
		  AND ($2::uuid IS NULL OR o.branch_id = $2)
	`
	var o Order
	var totalAmountDB float64 // DB stores dollars as NUMERIC(19,4)
	err := r.db.GetExecutor(ctx).QueryRow(ctx, queryOrder, id, branchID).Scan(
		&o.ID, &o.CustomerID, &o.CustomerName, &o.QuoteID, &o.Status, &totalAmountDB, &o.CreatedAt, &o.UpdatedAt,
		&o.SalespersonID, &o.SalespersonName, &o.BranchID,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("order not found")
		}
		return nil, fmt.Errorf("failed to get order: %w", err)
	}
	o.TotalAmount = dollarsToInt64Cents(totalAmountDB)

	// Get Lines with product names + cost data for margin/commission
	queryLines := `
		SELECT ol.id, ol.order_id, ol.product_id, COALESCE(p.sku, ''), COALESCE(p.description, ''),
			ol.quantity, ol.price_each,
			COALESCE(p.average_unit_cost, 0), COALESCE(p.commission_rate, 0)
		FROM order_lines ol
		LEFT JOIN products p ON p.id = ol.product_id
		WHERE ol.order_id = $1
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, queryLines, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get order lines: %w", err)
	}
	defer rows.Close()

	var totalCostCents, totalCommissionCents int64
	for rows.Next() {
		var l OrderLine
		var priceEachDB, unitCostDB float64 // DB stores dollars as NUMERIC(19,4)
		if err := rows.Scan(&l.ID, &l.OrderID, &l.ProductID, &l.ProductSKU, &l.ProductName,
			&l.Quantity, &priceEachDB, &unitCostDB, &l.CommissionRate); err != nil {
			return nil, fmt.Errorf("failed to scan order line: %w", err)
		}
		l.PriceEach = dollarsToInt64Cents(priceEachDB)
		l.UnitCost = dollarsToInt64Cents(unitCostDB)

		lineCostCents := int64(math.Round(l.Quantity * float64(l.UnitCost)))
		lineRevenueCents := int64(math.Round(l.Quantity * float64(l.PriceEach)))
		totalCostCents += lineCostCents
		totalCommissionCents += int64(math.Round(float64(lineRevenueCents) * (l.CommissionRate / 100.0)))
		o.Lines = append(o.Lines, l)
	}

	o.TotalCost = totalCostCents
	o.TotalMargin = o.TotalAmount - totalCostCents
	if o.TotalAmount > 0 {
		o.MarginPercent = (float64(o.TotalMargin) / float64(o.TotalAmount)) * 100.0
	}
	o.TotalCommission = totalCommissionCents

	return &o, nil
}

func (r *PostgresRepository) ListOrders(ctx context.Context) ([]Order, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `
		SELECT o.id, o.customer_id, COALESCE(c.name, ''), o.quote_id, o.status, o.total_amount, o.created_at, o.updated_at,
			o.salesperson_id, COALESCE(st.name, ''), o.branch_id
		FROM orders o
		LEFT JOIN customers c ON c.id = o.customer_id
		LEFT JOIN sales_team st ON o.salesperson_id = st.id
		WHERE ($1::uuid IS NULL OR o.branch_id = $1)
		ORDER BY o.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("failed to list orders: %w", err)
	}
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var o Order
		var totalAmountDB float64
		if err := rows.Scan(
			&o.ID, &o.CustomerID, &o.CustomerName, &o.QuoteID, &o.Status, &totalAmountDB, &o.CreatedAt, &o.UpdatedAt,
			&o.SalespersonID, &o.SalespersonName, &o.BranchID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}
		o.TotalAmount = dollarsToInt64Cents(totalAmountDB)
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *PostgresRepository) ListOrdersPaginated(ctx context.Context, limit, offset int) ([]Order, int, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	// Get total count
	countQuery := `SELECT COUNT(*) FROM orders WHERE ($1::uuid IS NULL OR branch_id = $1)`
	var total int
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery, branchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count orders: %w", err)
	}

	query := `
		SELECT o.id, o.customer_id, COALESCE(c.name, ''), o.quote_id, o.status, o.total_amount, o.created_at, o.updated_at,
			o.salesperson_id, COALESCE(st.name, ''), o.branch_id
		FROM orders o
		LEFT JOIN customers c ON c.id = o.customer_id
		LEFT JOIN sales_team st ON o.salesperson_id = st.id
		WHERE ($1::uuid IS NULL OR o.branch_id = $1)
		ORDER BY o.created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list orders: %w", err)
	}
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var o Order
		var totalAmountDB float64
		if err := rows.Scan(
			&o.ID, &o.CustomerID, &o.CustomerName, &o.QuoteID, &o.Status, &totalAmountDB, &o.CreatedAt, &o.UpdatedAt,
			&o.SalespersonID, &o.SalespersonName, &o.BranchID,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan order: %w", err)
		}
		o.TotalAmount = dollarsToInt64Cents(totalAmountDB)
		orders = append(orders, o)
	}
	return orders, total, nil
}

func (r *PostgresRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status OrderStatus) error {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, status, id, branchID)
	if err != nil {
		return fmt.Errorf("failed to update status: %w", err)
	}
	return nil
}
