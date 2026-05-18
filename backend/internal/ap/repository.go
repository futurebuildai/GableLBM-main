package ap

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Repository handles AP data persistence.
type Repository interface {
	CreateVendorInvoice(ctx context.Context, inv *VendorInvoice) error
	GetVendorInvoice(ctx context.Context, id uuid.UUID) (*VendorInvoice, error)
	ListVendorInvoices(ctx context.Context, vendorID *uuid.UUID, status string) ([]VendorInvoice, error)
	UpdateVendorInvoice(ctx context.Context, inv *VendorInvoice) error

	AddInvoiceLine(ctx context.Context, line *VendorInvoiceLine) error
	GetInvoiceLines(ctx context.Context, invoiceID uuid.UUID) ([]VendorInvoiceLine, error)

	CreatePayment(ctx context.Context, pmt *APPayment) error
	CreatePaymentApplication(ctx context.Context, app *APPaymentApplication) error
	ListPayments(ctx context.Context, vendorID *uuid.UUID) ([]APPayment, error)

	GetAgingSummary(ctx context.Context) ([]APAgingSummary, error)
}

// PostgresRepository implements Repository.
type PostgresRepository struct {
	db *database.DB
}

// NewRepository creates a new AP repository.
func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateVendorInvoice(ctx context.Context, inv *VendorInvoice) error {
	if inv.ID == uuid.Nil {
		inv.ID = uuid.New()
	}
	inv.CreatedAt = time.Now()

	query := `
		INSERT INTO vendor_invoices (id, vendor_id, invoice_number, invoice_date, due_date, po_id,
			subtotal, tax_amount, total, amount_paid, status, notes, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		inv.ID, inv.VendorID, inv.InvoiceNumber, inv.InvoiceDate, inv.DueDate, inv.POID,
		float64(inv.Subtotal)/100.0, float64(inv.TaxAmount)/100.0, float64(inv.Total)/100.0,
		float64(inv.AmountPaid)/100.0, inv.Status, inv.Notes, inv.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create vendor invoice: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetVendorInvoice(ctx context.Context, id uuid.UUID) (*VendorInvoice, error) {
	query := `
		SELECT vi.id, vi.vendor_id, COALESCE(v.name, '') as vendor_name,
			vi.invoice_number, vi.invoice_date, vi.due_date, vi.po_id,
			vi.subtotal, vi.tax_amount, vi.total, vi.amount_paid, vi.status,
			vi.approved_by, vi.approved_at, COALESCE(vi.notes, '') as notes, vi.created_at
		FROM vendor_invoices vi
		LEFT JOIN vendors v ON v.id = vi.vendor_id
		WHERE vi.id = $1
	`
	var inv VendorInvoice
	var subtotal, taxAmount, total, amountPaid float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&inv.ID, &inv.VendorID, &inv.VendorName,
		&inv.InvoiceNumber, &inv.InvoiceDate, &inv.DueDate, &inv.POID,
		&subtotal, &taxAmount, &total, &amountPaid, &inv.Status,
		&inv.ApprovedBy, &inv.ApprovedAt, &inv.Notes, &inv.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get vendor invoice: %w", err)
	}
	inv.Subtotal = int64(subtotal*100.0 + 0.5)
	inv.TaxAmount = int64(taxAmount*100.0 + 0.5)
	inv.Total = int64(total*100.0 + 0.5)
	inv.AmountPaid = int64(amountPaid*100.0 + 0.5)
	return &inv, nil
}

func (r *PostgresRepository) ListVendorInvoices(ctx context.Context, vendorID *uuid.UUID, status string) ([]VendorInvoice, error) {
	query := `
		SELECT vi.id, vi.vendor_id, COALESCE(v.name, '') as vendor_name,
			vi.invoice_number, vi.invoice_date, vi.due_date,
			vi.subtotal, vi.tax_amount, vi.total, vi.amount_paid, vi.status, vi.created_at
		FROM vendor_invoices vi
		LEFT JOIN vendors v ON v.id = vi.vendor_id
		WHERE ($1::uuid IS NULL OR vi.vendor_id = $1)
		  AND ($2 = '' OR vi.status = $2)
		ORDER BY vi.due_date ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, vendorID, status)
	if err != nil {
		return nil, fmt.Errorf("failed to list vendor invoices: %w", err)
	}
	defer rows.Close()

	var invoices []VendorInvoice
	for rows.Next() {
		var inv VendorInvoice
		var subtotal, taxAmount, total, amountPaid float64
		if err := rows.Scan(
			&inv.ID, &inv.VendorID, &inv.VendorName,
			&inv.InvoiceNumber, &inv.InvoiceDate, &inv.DueDate,
			&subtotal, &taxAmount, &total, &amountPaid, &inv.Status, &inv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan vendor invoice: %w", err)
		}
		inv.Subtotal = int64(subtotal*100.0 + 0.5)
		inv.TaxAmount = int64(taxAmount*100.0 + 0.5)
		inv.Total = int64(total*100.0 + 0.5)
		inv.AmountPaid = int64(amountPaid*100.0 + 0.5)
		invoices = append(invoices, inv)
	}
	return invoices, nil
}

func (r *PostgresRepository) UpdateVendorInvoice(ctx context.Context, inv *VendorInvoice) error {
	query := `
		UPDATE vendor_invoices
		SET amount_paid = $2, status = $3, approved_by = $4, approved_at = $5
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		inv.ID, float64(inv.AmountPaid)/100.0, inv.Status, inv.ApprovedBy, inv.ApprovedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update vendor invoice: %w", err)
	}
	return nil
}

func (r *PostgresRepository) AddInvoiceLine(ctx context.Context, line *VendorInvoiceLine) error {
	if line.ID == uuid.Nil {
		line.ID = uuid.New()
	}
	line.CreatedAt = time.Now()

	query := `
		INSERT INTO vendor_invoice_lines (id, invoice_id, description, quantity, unit_price, line_total, gl_account_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		line.ID, line.InvoiceID, line.Description, line.Quantity,
		float64(line.UnitPrice)/100.0, float64(line.LineTotal)/100.0,
		line.GLAccountID, line.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to add invoice line: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetInvoiceLines(ctx context.Context, invoiceID uuid.UUID) ([]VendorInvoiceLine, error) {
	query := `
		SELECT id, invoice_id, description, quantity, unit_price, line_total, gl_account_id, created_at
		FROM vendor_invoice_lines
		WHERE invoice_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, invoiceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get invoice lines: %w", err)
	}
	defer rows.Close()

	var lines []VendorInvoiceLine
	for rows.Next() {
		var line VendorInvoiceLine
		var unitPrice, lineTotal float64
		if err := rows.Scan(
			&line.ID, &line.InvoiceID, &line.Description, &line.Quantity,
			&unitPrice, &lineTotal, &line.GLAccountID, &line.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan invoice line: %w", err)
		}
		line.UnitPrice = int64(unitPrice*100.0 + 0.5)
		line.LineTotal = int64(lineTotal*100.0 + 0.5)
		lines = append(lines, line)
	}
	return lines, nil
}

func (r *PostgresRepository) CreatePayment(ctx context.Context, pmt *APPayment) error {
	if pmt.ID == uuid.Nil {
		pmt.ID = uuid.New()
	}
	pmt.CreatedAt = time.Now()

	query := `
		INSERT INTO ap_payments (id, vendor_id, batch_id, amount, method, check_number, reference, payment_date, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		pmt.ID, pmt.VendorID, pmt.BatchID, float64(pmt.Amount)/100.0,
		pmt.Method, pmt.CheckNumber, pmt.Reference, pmt.PaymentDate, pmt.Status, pmt.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create AP payment: %w", err)
	}
	return nil
}

func (r *PostgresRepository) CreatePaymentApplication(ctx context.Context, app *APPaymentApplication) error {
	if app.ID == uuid.Nil {
		app.ID = uuid.New()
	}
	app.CreatedAt = time.Now()

	query := `
		INSERT INTO ap_payment_applications (id, payment_id, invoice_id, amount, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		app.ID, app.PaymentID, app.InvoiceID, float64(app.Amount)/100.0, app.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create payment application: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ListPayments(ctx context.Context, vendorID *uuid.UUID) ([]APPayment, error) {
	query := `
		SELECT p.id, p.vendor_id, COALESCE(v.name, '') as vendor_name,
			p.amount, p.method, COALESCE(p.check_number, '') as check_number,
			COALESCE(p.reference, '') as reference, p.payment_date, p.status, p.created_at
		FROM ap_payments p
		LEFT JOIN vendors v ON v.id = p.vendor_id
		WHERE ($1::uuid IS NULL OR p.vendor_id = $1)
		ORDER BY p.payment_date DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, vendorID)
	if err != nil {
		return nil, fmt.Errorf("failed to list AP payments: %w", err)
	}
	defer rows.Close()

	var payments []APPayment
	for rows.Next() {
		var pmt APPayment
		var amount float64
		if err := rows.Scan(
			&pmt.ID, &pmt.VendorID, &pmt.VendorName,
			&amount, &pmt.Method, &pmt.CheckNumber,
			&pmt.Reference, &pmt.PaymentDate, &pmt.Status, &pmt.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan AP payment: %w", err)
		}
		pmt.Amount = int64(amount*100.0 + 0.5)
		payments = append(payments, pmt)
	}
	return payments, nil
}

func (r *PostgresRepository) GetAgingSummary(ctx context.Context) ([]APAgingSummary, error) {
	query := `
		SELECT vi.vendor_id, COALESCE(v.name, 'Unknown') as vendor_name,
			COALESCE(SUM(CASE WHEN vi.due_date >= CURRENT_DATE THEN vi.total - vi.amount_paid ELSE 0 END), 0) as current_amt,
			COALESCE(SUM(CASE WHEN vi.due_date < CURRENT_DATE AND vi.due_date >= CURRENT_DATE - 30 THEN vi.total - vi.amount_paid ELSE 0 END), 0) as past_30,
			COALESCE(SUM(CASE WHEN vi.due_date < CURRENT_DATE - 30 AND vi.due_date >= CURRENT_DATE - 60 THEN vi.total - vi.amount_paid ELSE 0 END), 0) as past_60,
			COALESCE(SUM(CASE WHEN vi.due_date < CURRENT_DATE - 60 THEN vi.total - vi.amount_paid ELSE 0 END), 0) as past_90,
			COALESCE(SUM(vi.total - vi.amount_paid), 0) as total
		FROM vendor_invoices vi
		LEFT JOIN vendors v ON v.id = vi.vendor_id
		WHERE vi.status NOT IN ('PAID', 'VOIDED')
		GROUP BY vi.vendor_id, v.name
		ORDER BY total DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get AP aging: %w", err)
	}
	defer rows.Close()

	var summaries []APAgingSummary
	for rows.Next() {
		var s APAgingSummary
		var current, past30, past60, past90, total float64
		if err := rows.Scan(&s.VendorID, &s.VendorName, &current, &past30, &past60, &past90, &total); err != nil {
			return nil, fmt.Errorf("failed to scan aging: %w", err)
		}
		s.Current = int64(current*100.0 + 0.5)
		s.Past30 = int64(past30*100.0 + 0.5)
		s.Past60 = int64(past60*100.0 + 0.5)
		s.Past90 = int64(past90*100.0 + 0.5)
		s.Total = int64(total*100.0 + 0.5)
		summaries = append(summaries, s)
	}
	return summaries, nil
}
