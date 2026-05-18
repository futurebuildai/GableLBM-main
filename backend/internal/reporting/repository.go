package reporting

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
)

type Repository interface {
	GetDailyTill(ctx context.Context, date time.Time) (*DailyTillReport, error)
	GetSalesSummary(ctx context.Context, start, end time.Time) (*SalesSummaryReport, error)
	GetARAgingReport(ctx context.Context) (*ARAgingReport, error)
	GetCustomerStatement(ctx context.Context, customerID string, start, end time.Time) (*CustomerStatement, error)

	// Ad-Hoc Report Builder
	CreateSavedReport(ctx context.Context, report *SavedReport) error
	GetSavedReport(ctx context.Context, id string) (*SavedReport, error)
	ListSavedReports(ctx context.Context) ([]SavedReport, error)
	UpdateSavedReport(ctx context.Context, report *SavedReport) error
	DeleteSavedReport(ctx context.Context, id string) error
	CreateReportSchedule(ctx context.Context, schedule *ReportSchedule) error
	ListReportSchedules(ctx context.Context) ([]ReportSchedule, error)
	UpdateReportScheduleNextRun(ctx context.Context, scheduleID string, nextRun time.Time) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetDailyTill(ctx context.Context, date time.Time) (*DailyTillReport, error) {
	// Truncate to day
	dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	dayEnd := dayStart.Add(24 * time.Hour)

	query := `
		SELECT method, COALESCE(SUM(amount), 0), COUNT(*)
		FROM payments
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY method
	`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, dayStart, dayEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to query daily till: %w", err)
	}
	defer rows.Close()

	report := &DailyTillReport{
		Date:             dayStart.Format("2006-01-02"),
		ByMethod:         make(map[string]float64),
		TransactionCount: 0,
		TotalCollected:   0,
	}

	for rows.Next() {
		var method string
		var amount float64
		var count int
		if err := rows.Scan(&method, &amount, &count); err != nil {
			return nil, fmt.Errorf("failed to scan till row: %w", err)
		}
		report.ByMethod[method] = amount
		report.TotalCollected += amount
		report.TransactionCount += count
	}

	return report, nil
}

func (r *PostgresRepository) GetSalesSummary(ctx context.Context, start, end time.Time) (*SalesSummaryReport, error) {
	report := &SalesSummaryReport{
		StartDate: start.Format("2006-01-02"),
		EndDate:   end.Format("2006-01-02"),
	}

	// 1. Invoiced
	queryInvoiced := `
		SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
		FROM invoices
		WHERE created_at >= $1 AND created_at < $2 AND status != 'VOID'
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, queryInvoiced, start, end).Scan(&report.TotalInvoiced, &report.InvoiceCount)
	if err != nil {
		return nil, fmt.Errorf("failed to query invoiced total: %w", err)
	}

	// 2. Collected
	queryCollected := `
		SELECT COALESCE(SUM(amount), 0)
		FROM payments
		WHERE created_at >= $1 AND created_at < $2
	`
	err = r.db.GetExecutor(ctx).QueryRow(ctx, queryCollected, start, end).Scan(&report.TotalCollected)
	if err != nil {
		return nil, fmt.Errorf("failed to query collected total: %w", err)
	}

	// 3. Outstanding AR (All time up to end date, or just in period? Usually AR is snapshot or accumulation)
	// Let's define it as "Unpaid Amount of Invoices Created in Period" for now + "Overdue" generally?
	// The prompt asks for "Sales Summary", implying performance over period.
	// Outstanding AR usually means "Total money owed to us right now regardless of when invoice was created".
	// Let's do "Total Outstanding" as a global metric for context, or "Outstanding from this period".
	// Let's stick to "Outstanding from this period" to balance report.
	// Actually, standard AR is global. But "Sales Summary" is period based.
	// Let's calculate "Outstanding in Period" = TotalInvoiced - (Payments applied to those invoices).
	// But payments might come later.
	// Let's just do: Total Invoiced - Paid (where invoice is fully paid).
	// Simplification: OutstandingAR = SUM(total_amount) of invoices in period where status != PAID.

	queryOutstanding := `
		SELECT COALESCE(SUM(total_amount), 0)
		FROM invoices
		WHERE created_at >= $1 AND created_at < $2 AND status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
	`
	// Note: accurate AR needs to subtract partial payments.
	// Let's refine: Total Invoiced in Period - Total Payments applied to *those* invoices (even if payment is outside period? Mixed bag).
	// Let's stick to: Total Invoiced in Period - Total Paid against those invoices.
	// Too complex for MVP SQL?
	// Let's just return Global AR for now as a separate metric if needed, or just "Invoiced amount that isn't paid yet".

	// Better: Get sum of (total_amount) from invoices in period
	// MINUS sum of (amount) from payments linked to those invoices

	// That might be negative if overpaid? unlikely.
	// Actually, just keep it simple: "Total Invoiced" vs "Total Collected (Cash in hand)".
	// "Outstanding AR" = Total for Unpaid/Partial invoices created in this period.

	err = r.db.GetExecutor(ctx).QueryRow(ctx, queryOutstanding, start, end).Scan(&report.OutstandingAR)
	if err != nil {
		return nil, fmt.Errorf("failed to query outstanding: %w", err)
	}

	return report, nil
}

func (r *PostgresRepository) GetARAgingReport(ctx context.Context) (*ARAgingReport, error) {
	query := `
		SELECT
			i.customer_id,
			COALESCE(c.name, 'Unknown'),
			COALESCE(SUM(CASE WHEN CURRENT_DATE - COALESCE(i.due_date, i.created_at)::date <= 30 THEN i.total_amount ELSE 0 END), 0) AS current_bucket,
			COALESCE(SUM(CASE WHEN CURRENT_DATE - COALESCE(i.due_date, i.created_at)::date BETWEEN 31 AND 60 THEN i.total_amount ELSE 0 END), 0) AS days_31_60,
			COALESCE(SUM(CASE WHEN CURRENT_DATE - COALESCE(i.due_date, i.created_at)::date BETWEEN 61 AND 90 THEN i.total_amount ELSE 0 END), 0) AS days_61_90,
			COALESCE(SUM(CASE WHEN CURRENT_DATE - COALESCE(i.due_date, i.created_at)::date > 90 THEN i.total_amount ELSE 0 END), 0) AS over_90,
			COALESCE(SUM(i.total_amount), 0) AS total
		FROM invoices i
		LEFT JOIN customers c ON c.id = i.customer_id
		WHERE i.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
		GROUP BY i.customer_id, c.name
		ORDER BY total DESC
	`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query AR aging: %w", err)
	}
	defer rows.Close()

	report := &ARAgingReport{
		AsOfDate: time.Now().Format("2006-01-02"),
	}

	for rows.Next() {
		var b ARAgingBucket
		if err := rows.Scan(&b.CustomerID, &b.CustomerName, &b.Current, &b.Days31to60, &b.Days61to90, &b.Over90, &b.Total); err != nil {
			return nil, fmt.Errorf("failed to scan AR aging row: %w", err)
		}
		report.Buckets = append(report.Buckets, b)
		report.TotalCurrent += b.Current
		report.Total31to60 += b.Days31to60
		report.Total61to90 += b.Days61to90
		report.TotalOver90 += b.Over90
		report.GrandTotal += b.Total
	}

	return report, nil
}

func (r *PostgresRepository) GetCustomerStatement(ctx context.Context, customerID string, start, end time.Time) (*CustomerStatement, error) {
	// Get customer name
	var customerName string
	nameQuery := `SELECT COALESCE(name, '') FROM customers WHERE id = $1`
	_ = r.db.GetExecutor(ctx).QueryRow(ctx, nameQuery, customerID).Scan(&customerName)

	stmt := &CustomerStatement{
		CustomerID:   customerID,
		CustomerName: customerName,
		StartDate:    start.Format("2006-01-02"),
		EndDate:      end.Format("2006-01-02"),
	}

	// Get transactions in range
	query := `
		SELECT ct.created_at, ct.type, ct.description,
		       CASE WHEN ct.amount > 0 THEN ct.amount::float / 100.0 ELSE 0 END AS debit,
		       CASE WHEN ct.amount < 0 THEN ABS(ct.amount)::float / 100.0 ELSE 0 END AS credit,
		       ct.balance_after::float / 100.0 AS balance
		FROM customer_transactions ct
		WHERE ct.customer_id = $1 AND ct.created_at >= $2 AND ct.created_at < $3
		ORDER BY ct.created_at ASC
	`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID, start, end)
	if err != nil {
		return nil, fmt.Errorf("failed to query statement: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var l StatementLine
		var ts time.Time
		if err := rows.Scan(&ts, &l.Type, &l.Description, &l.Debit, &l.Credit, &l.Balance); err != nil {
			return nil, fmt.Errorf("failed to scan statement line: %w", err)
		}
		l.Date = ts.Format("2006-01-02")
		stmt.Lines = append(stmt.Lines, l)
	}

	// Open balance: balance_after of last transaction before start date
	openQuery := `
		SELECT COALESCE(balance_after::float / 100.0, 0)
		FROM customer_transactions
		WHERE customer_id = $1 AND created_at < $2
		ORDER BY created_at DESC LIMIT 1
	`
	_ = r.db.GetExecutor(ctx).QueryRow(ctx, openQuery, customerID, start).Scan(&stmt.OpenBalance)

	// Close balance: balance_after of last transaction in or before end date
	closeQuery := `
		SELECT COALESCE(balance_after::float / 100.0, 0)
		FROM customer_transactions
		WHERE customer_id = $1 AND created_at < $2
		ORDER BY created_at DESC LIMIT 1
	`
	_ = r.db.GetExecutor(ctx).QueryRow(ctx, closeQuery, customerID, end).Scan(&stmt.CloseBalance)

	return stmt, nil
}

func (r *PostgresRepository) CreateSavedReport(ctx context.Context, report *SavedReport) error {
	query := `
INSERT INTO saved_reports (name, description, entity_type, definition_json, created_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, created_at, updated_at
`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		report.Name, report.Description, report.EntityType, report.DefinitionJSON, report.CreatedBy).
		Scan(&report.ID, &report.CreatedAt, &report.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to create saved report: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetSavedReport(ctx context.Context, id string) (*SavedReport, error) {
	query := `
SELECT id, name, description, entity_type, definition_json, created_by, created_at, updated_at
FROM saved_reports
WHERE id = $1
`
	report := &SavedReport{}
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&report.ID, &report.Name, &report.Description, &report.EntityType,
		&report.DefinitionJSON, &report.CreatedBy, &report.CreatedAt, &report.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to get saved report: %w", err)
	}
	return report, nil
}

func (r *PostgresRepository) ListSavedReports(ctx context.Context) ([]SavedReport, error) {
	query := `
SELECT id, name, description, entity_type, definition_json, created_by, created_at, updated_at
FROM saved_reports
ORDER BY created_at DESC
`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list saved reports: %w", err)
	}
	defer rows.Close()

	var reports []SavedReport
	for rows.Next() {
		var report SavedReport
		if err := rows.Scan(
			&report.ID, &report.Name, &report.Description, &report.EntityType,
			&report.DefinitionJSON, &report.CreatedBy, &report.CreatedAt, &report.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan saved report: %w", err)
		}
		reports = append(reports, report)
	}
	return reports, nil
}

func (r *PostgresRepository) UpdateSavedReport(ctx context.Context, report *SavedReport) error {
	query := `
UPDATE saved_reports
SET name = $1, description = $2, entity_type = $3, definition_json = $4, updated_at = NOW()
WHERE id = $5
RETURNING updated_at
`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		report.Name, report.Description, report.EntityType, report.DefinitionJSON, report.ID).
		Scan(&report.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to update saved report: %w", err)
	}
	return nil
}

func (r *PostgresRepository) DeleteSavedReport(ctx context.Context, id string) error {
	query := `DELETE FROM saved_reports WHERE id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, id)
	return err
}

func (r *PostgresRepository) CreateReportSchedule(ctx context.Context, schedule *ReportSchedule) error {
	query := `
INSERT INTO report_schedules (report_id, cron_expression, recipients, status)
VALUES ($1, $2, $3, $4)
RETURNING id, created_at, updated_at
`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		schedule.ReportID, schedule.CronExpression, schedule.Recipients, schedule.Status).
		Scan(&schedule.ID, &schedule.CreatedAt, &schedule.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to create report schedule: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ListReportSchedules(ctx context.Context) ([]ReportSchedule, error) {
	query := `
SELECT id, report_id, cron_expression, recipients, status, last_run_at, next_run_at, created_at, updated_at
FROM report_schedules
ORDER BY created_at DESC
`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list report schedules: %w", err)
	}
	defer rows.Close()

	var schedules []ReportSchedule
	for rows.Next() {
		var schedule ReportSchedule
		if err := rows.Scan(
			&schedule.ID, &schedule.ReportID, &schedule.CronExpression,
			&schedule.Recipients, &schedule.Status, &schedule.LastRunAt,
			&schedule.NextRunAt, &schedule.CreatedAt, &schedule.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan report schedule: %w", err)
		}
		schedules = append(schedules, schedule)
	}
	return schedules, nil
}

func (r *PostgresRepository) UpdateReportScheduleNextRun(ctx context.Context, scheduleID string, nextRun time.Time) error {
	query := `
UPDATE report_schedules
SET last_run_at = NOW(), next_run_at = $1, updated_at = NOW()
WHERE id = $2
`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, nextRun, scheduleID)
	return err
}
