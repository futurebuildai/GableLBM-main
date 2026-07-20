package invoice

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

type Repository interface {
	CreateInvoice(ctx context.Context, inv *Invoice) error
	GetInvoice(ctx context.Context, id uuid.UUID) (*Invoice, error)
	ListInvoices(ctx context.Context) ([]Invoice, error)
	ListInvoicesPaginated(ctx context.Context, limit, offset int) ([]Invoice, int, error)
	UpdateInvoice(ctx context.Context, inv *Invoice) error
	ExistsInvoiceForOrder(ctx context.Context, orderID uuid.UUID) (bool, error)
	SumOpenBalanceCents(ctx context.Context, customerID uuid.UUID) (int64, error)
	GetBranchTaxRate(ctx context.Context, branchID *uuid.UUID) (float64, bool)
	CreateCreditMemo(ctx context.Context, cm *CreditMemo) error
	ListCreditMemos(ctx context.Context, customerID uuid.UUID) ([]CreditMemo, error)
	UpdateCreditMemo(ctx context.Context, cm *CreditMemo) error
}

// OpenInvoiceStatuses is the canonical set of invoice statuses that contribute
// to a customer's outstanding AR balance. The portal, dashboard, reporting, and
// credit-limit surfaces all use this same set so their "current balance" agrees.
// NOTE: this sums full invoice totals and does not yet net partial payments on
// PARTIAL invoices — a known follow-up shared by all those surfaces.
const OpenInvoiceStatuses = "'UNPAID','PARTIAL','OVERDUE'"

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateInvoice(ctx context.Context, inv *Invoice) error {
	exec := r.db.GetExecutor(ctx)

	if inv.ID == uuid.Nil {
		inv.ID = uuid.New()
	}
	now := time.Now()
	inv.CreatedAt = now
	inv.UpdatedAt = now
	if inv.Status == "" {
		inv.Status = InvoiceStatusUnpaid
	}

	// Insert Invoice
	// Convert Cents -> Dollars
	totalAmountFloat := float64(inv.TotalAmount) / 100.0
	subtotalFloat := float64(inv.Subtotal) / 100.0
	taxAmountFloat := float64(inv.TaxAmount) / 100.0

	// branch_id falls back to default when caller hasn't set one.
	var branchArg any
	if inv.BranchID != uuid.Nil {
		branchArg = inv.BranchID
	} else if bid := middleware.BranchIDForQuery(ctx); bid != nil {
		branchArg = *bid
		inv.BranchID = *bid
	}
	queryInv := `
		INSERT INTO invoices (id, order_id, customer_id, status, total_amount, subtotal, tax_rate, tax_amount, payment_terms, due_date, paid_at, created_at, updated_at, branch_id)
		VALUES ($1, NULLIF($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			COALESCE($14::uuid, (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')))
	`
	_, err := exec.Exec(ctx, queryInv,
		inv.ID, inv.OrderID, inv.CustomerID, inv.Status, totalAmountFloat, subtotalFloat, inv.TaxRate, taxAmountFloat, inv.PaymentTerms, inv.DueDate, inv.PaidAt, inv.CreatedAt, inv.UpdatedAt, branchArg,
	)
	if err != nil {
		return fmt.Errorf("failed to insert invoice: %w", err)
	}

	// Insert Lines
	queryLine := `
		INSERT INTO invoice_lines (id, invoice_id, product_id, quantity, price_each, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	for i := range inv.Lines {
		line := &inv.Lines[i]
		if line.ID == uuid.Nil {
			line.ID = uuid.New()
		}
		line.InvoiceID = inv.ID
		// Convert PriceEach (Cents -> Dollars)
		priceEachFloat := float64(line.PriceEach) / 100.0

		_, err = exec.Exec(ctx, queryLine,
			line.ID, line.InvoiceID, line.ProductID, line.Quantity, priceEachFloat, now,
		)
		if err != nil {
			return fmt.Errorf("failed to insert invoice line: %w", err)
		}
	}

	return nil
}

// ExistsInvoiceForOrder reports whether an invoice already exists for the order.
// Used to prevent double-invoicing (an order fulfilled and then delivered would
// otherwise produce two invoices and double the customer's AR).
func (r *PostgresRepository) ExistsInvoiceForOrder(ctx context.Context, orderID uuid.UUID) (bool, error) {
	var exists bool
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM invoices WHERE order_id = $1)`, orderID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check existing invoice for order: %w", err)
	}
	return exists, nil
}

// SumOpenBalanceCents returns the customer's outstanding AR balance, computed
// live from open invoices (the column customers.balance_due is unmaintained).
// total_amount is stored as dollars; convert to cents for the app convention.
func (r *PostgresRepository) SumOpenBalanceCents(ctx context.Context, customerID uuid.UUID) (int64, error) {
	var dollars float64
	query := `SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE customer_id = $1 AND status IN (` + OpenInvoiceStatuses + `)`
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, query, customerID).Scan(&dollars); err != nil {
		return 0, fmt.Errorf("failed to sum open balance: %w", err)
	}
	return int64(math.Round(dollars * 100)), nil
}

// GetBranchTaxRate returns the default sales tax rate configured on a branch
// (locations.default_tax_rate, e.g. 0.12 for BC). branchID may be nil, in which
// case the active branch context — or the system default branch — is used.
// Returns (rate, true) only when a positive rate is found; callers fall back to
// invoice.DefaultTaxRate otherwise. default_tax_rate is a nullable NUMERIC.
func (r *PostgresRepository) GetBranchTaxRate(ctx context.Context, branchID *uuid.UUID) (float64, bool) {
	bid := branchID
	if bid == nil || *bid == uuid.Nil {
		bid = middleware.BranchIDForQuery(ctx)
	}

	var rate *float64
	var err error
	if bid != nil {
		err = r.db.GetExecutor(ctx).QueryRow(ctx,
			`SELECT default_tax_rate FROM locations WHERE id = $1`, *bid).Scan(&rate)
	} else {
		err = r.db.GetExecutor(ctx).QueryRow(ctx,
			`SELECT default_tax_rate FROM locations
			 WHERE id = (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')`).Scan(&rate)
	}
	if err != nil || rate == nil || *rate <= 0 {
		return 0, false
	}
	return *rate, true
}

func (r *PostgresRepository) GetInvoice(ctx context.Context, id uuid.UUID) (*Invoice, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	queryInv := `
		SELECT i.id, i.order_id, i.customer_id, COALESCE(c.name, ''), i.status,
		       i.total_amount, COALESCE(i.subtotal, i.total_amount), COALESCE(i.tax_rate, 0), COALESCE(i.tax_amount, 0),
		       COALESCE(i.payment_terms, 'NET30'),
		       i.due_date, i.paid_at, i.created_at, i.updated_at, i.branch_id
		FROM invoices i
		LEFT JOIN customers c ON c.id = i.customer_id
		WHERE i.id = $1
		  AND ($2::uuid IS NULL OR i.branch_id = $2)
	`
	var inv Invoice
	var totalAmountFloat, subtotalFloat, taxAmountFloat float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, queryInv, id, branchID).Scan(
		&inv.ID, &inv.OrderID, &inv.CustomerID, &inv.CustomerName, &inv.Status,
		&totalAmountFloat, &subtotalFloat, &inv.TaxRate, &taxAmountFloat,
		&inv.PaymentTerms,
		&inv.DueDate, &inv.PaidAt, &inv.CreatedAt, &inv.UpdatedAt, &inv.BranchID,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("invoice not found")
		}
		return nil, fmt.Errorf("failed to get invoice: %w", err)
	}
	inv.TotalAmount = int64(totalAmountFloat*100.0 + 0.5)
	inv.Subtotal = int64(subtotalFloat*100.0 + 0.5)
	inv.TaxAmount = int64(taxAmountFloat*100.0 + 0.5)

	// Get Lines with product names
	queryLines := `
		SELECT il.id, il.invoice_id, il.product_id, COALESCE(p.sku, ''), COALESCE(p.description, ''), il.quantity, il.price_each, il.created_at
		FROM invoice_lines il
		LEFT JOIN products p ON p.id = il.product_id
		WHERE il.invoice_id = $1
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, queryLines, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get invoice lines: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var l InvoiceLine
		var priceEachFloat float64
		if err := rows.Scan(&l.ID, &l.InvoiceID, &l.ProductID, &l.ProductSKU, &l.ProductName, &l.Quantity, &priceEachFloat, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan invoice line: %w", err)
		}
		l.PriceEach = int64(priceEachFloat*100.0 + 0.5)
		inv.Lines = append(inv.Lines, l)
	}

	return &inv, nil
}

func (r *PostgresRepository) ListInvoices(ctx context.Context) ([]Invoice, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `
		SELECT i.id, i.order_id, i.customer_id, COALESCE(c.name, ''), i.status,
		       i.total_amount, COALESCE(i.subtotal, i.total_amount), COALESCE(i.tax_rate, 0), COALESCE(i.tax_amount, 0),
		       COALESCE(i.payment_terms, 'NET30'),
		       i.due_date, i.paid_at, i.created_at, i.updated_at, i.branch_id
		FROM invoices i
		LEFT JOIN customers c ON c.id = i.customer_id
		WHERE ($1::uuid IS NULL OR i.branch_id = $1)
		ORDER BY i.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("failed to list invoices: %w", err)
	}
	defer rows.Close()

	var invoices []Invoice
	for rows.Next() {
		var inv Invoice
		var totalAmountFloat, subtotalFloat, taxAmountFloat float64
		if err := rows.Scan(
			&inv.ID, &inv.OrderID, &inv.CustomerID, &inv.CustomerName, &inv.Status,
			&totalAmountFloat, &subtotalFloat, &inv.TaxRate, &taxAmountFloat,
			&inv.PaymentTerms,
			&inv.DueDate, &inv.PaidAt, &inv.CreatedAt, &inv.UpdatedAt, &inv.BranchID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan invoice: %w", err)
		}
		inv.TotalAmount = int64(totalAmountFloat*100.0 + 0.5)
		inv.Subtotal = int64(subtotalFloat*100.0 + 0.5)
		inv.TaxAmount = int64(taxAmountFloat*100.0 + 0.5)
		invoices = append(invoices, inv)
	}
	return invoices, nil
}

func (r *PostgresRepository) ListInvoicesPaginated(ctx context.Context, limit, offset int) ([]Invoice, int, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	// Get total count
	countQuery := `SELECT COUNT(*) FROM invoices WHERE ($1::uuid IS NULL OR branch_id = $1)`
	var total int
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery, branchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count invoices: %w", err)
	}

	query := `
		SELECT i.id, i.order_id, i.customer_id, COALESCE(c.name, ''), i.status,
		       i.total_amount, COALESCE(i.subtotal, i.total_amount), COALESCE(i.tax_rate, 0), COALESCE(i.tax_amount, 0),
		       COALESCE(i.payment_terms, 'NET30'),
		       i.due_date, i.paid_at, i.created_at, i.updated_at, i.branch_id
		FROM invoices i
		LEFT JOIN customers c ON c.id = i.customer_id
		WHERE ($1::uuid IS NULL OR i.branch_id = $1)
		ORDER BY i.created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list invoices: %w", err)
	}
	defer rows.Close()

	var invoices []Invoice
	for rows.Next() {
		var inv Invoice
		var totalAmountFloat, subtotalFloat, taxAmountFloat float64
		if err := rows.Scan(
			&inv.ID, &inv.OrderID, &inv.CustomerID, &inv.CustomerName, &inv.Status,
			&totalAmountFloat, &subtotalFloat, &inv.TaxRate, &taxAmountFloat,
			&inv.PaymentTerms,
			&inv.DueDate, &inv.PaidAt, &inv.CreatedAt, &inv.UpdatedAt, &inv.BranchID,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan invoice: %w", err)
		}
		inv.TotalAmount = int64(totalAmountFloat*100.0 + 0.5)
		inv.Subtotal = int64(subtotalFloat*100.0 + 0.5)
		inv.TaxAmount = int64(taxAmountFloat*100.0 + 0.5)
		invoices = append(invoices, inv)
	}
	return invoices, total, nil
}

func (r *PostgresRepository) UpdateInvoice(ctx context.Context, inv *Invoice) error {
	inv.UpdatedAt = time.Now()
	query := `
		UPDATE invoices
		SET status = $1, paid_at = $2, updated_at = $3
		WHERE id = $4
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, inv.Status, inv.PaidAt, inv.UpdatedAt, inv.ID)
	if err != nil {
		return fmt.Errorf("failed to update invoice: %w", err)
	}
	return nil
}

func (r *PostgresRepository) CreateCreditMemo(ctx context.Context, cm *CreditMemo) error {
	if cm.ID == uuid.Nil {
		cm.ID = uuid.New()
	}
	cm.CreatedAt = time.Now()
	amountFloat := float64(cm.Amount) / 100.0

	query := `
		INSERT INTO credit_memos (id, invoice_id, customer_id, amount, reason, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		cm.ID, cm.InvoiceID, cm.CustomerID, amountFloat, cm.Reason, cm.Status, cm.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create credit memo: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ListCreditMemos(ctx context.Context, customerID uuid.UUID) ([]CreditMemo, error) {
	query := `
		SELECT id, invoice_id, customer_id, amount, reason, status, created_at, applied_at
		FROM credit_memos
		WHERE customer_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list credit memos: %w", err)
	}
	defer rows.Close()

	var memos []CreditMemo
	for rows.Next() {
		var cm CreditMemo
		var amountFloat float64
		if err := rows.Scan(&cm.ID, &cm.InvoiceID, &cm.CustomerID, &amountFloat, &cm.Reason, &cm.Status, &cm.CreatedAt, &cm.AppliedAt); err != nil {
			return nil, fmt.Errorf("failed to scan credit memo: %w", err)
		}
		cm.Amount = int64(amountFloat*100.0 + 0.5)
		memos = append(memos, cm)
	}
	return memos, nil
}

func (r *PostgresRepository) UpdateCreditMemo(ctx context.Context, cm *CreditMemo) error {
	query := `UPDATE credit_memos SET status = $1, applied_at = $2 WHERE id = $3`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, cm.Status, cm.AppliedAt, cm.ID)
	return err
}
