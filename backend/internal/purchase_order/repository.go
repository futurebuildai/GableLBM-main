package purchase_order

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreatePO(ctx context.Context, po *PurchaseOrder) error {
	// Default to MANUAL if the caller didn't stamp a source. This keeps any
	// pre-existing call site (or future test) safe even before #8 is fully
	// rolled out everywhere.
	if po.Source == "" {
		po.Source = SourceManual
	}
	// branch_id falls back to default when caller hasn't set one.
	var branchArg any
	if po.BranchID != uuid.Nil {
		branchArg = po.BranchID
	} else if bid := middleware.BranchIDForQuery(ctx); bid != nil {
		branchArg = *bid
		po.BranchID = *bid
	}
	query := `
		INSERT INTO purchase_orders (id, vendor_id, status, source, branch_id)
		VALUES ($1, $2, $3, $4,
			COALESCE($5::uuid, (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')))
		RETURNING created_at, updated_at, branch_id
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		po.ID,
		po.VendorID,
		po.Status,
		po.Source,
		branchArg,
	).Scan(&po.CreatedAt, &po.UpdatedAt, &po.BranchID)
}

func (r *Repository) AddPOLine(ctx context.Context, line *PurchaseOrderLine) error {
	query := `
		INSERT INTO purchase_order_lines (id, po_id, product_id, description, quantity, cost, linked_so_line_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		line.ID,
		line.POID,
		line.ProductID,
		line.Description,
		line.Quantity,
		line.Cost,
		line.LinkedSOLineID,
	)
	return err
}

func (r *Repository) GetDraftPOByVendor(ctx context.Context, vendorID *uuid.UUID) (*PurchaseOrder, error) {
	if vendorID == nil {
		return nil, fmt.Errorf("vendor_id required lookup")
	}

	branchID := middleware.BranchIDForQuery(ctx)
	query := `
		SELECT id, vendor_id, status, source, created_at, updated_at, branch_id
		FROM purchase_orders
		WHERE vendor_id = $1 AND status = 'DRAFT'
		  AND ($2::uuid IS NULL OR branch_id = $2)
		LIMIT 1
	`
	var po PurchaseOrder
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, vendorID, branchID).Scan(
		&po.ID,
		&po.VendorID,
		&po.Status,
		&po.Source,
		&po.CreatedAt,
		&po.UpdatedAt,
		&po.BranchID,
	)
	if err != nil {
		return nil, err
	}
	return &po, nil
}

func (r *Repository) ListPOs(ctx context.Context) ([]PurchaseOrder, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `
		SELECT po.id, po.vendor_id, po.status, po.source, po.created_at, po.updated_at, po.branch_id,
		       COUNT(pol.id) AS line_count,
		       COALESCE(SUM(pol.quantity * pol.cost), 0) AS total_cost
		FROM purchase_orders po
		LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
		WHERE ($1::uuid IS NULL OR po.branch_id = $1)
		GROUP BY po.id
		ORDER BY po.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("failed to list POs: %w", err)
	}
	defer rows.Close()

	var pos []PurchaseOrder
	for rows.Next() {
		var po PurchaseOrder
		if err := rows.Scan(
			&po.ID,
			&po.VendorID,
			&po.Status,
			&po.Source,
			&po.CreatedAt,
			&po.UpdatedAt,
			&po.BranchID,
			&po.LineCount,
			&po.TotalCost,
		); err != nil {
			return nil, fmt.Errorf("failed to scan PO: %w", err)
		}
		pos = append(pos, po)
	}
	return pos, nil
}

// GetSourceSummary returns a count of POs grouped by source. Drives the
// "% of replenishments automated" KPI on the purchasing dashboard.
func (r *Repository) GetSourceSummary(ctx context.Context) (map[string]int, error) {
	query := `SELECT source, COUNT(*) FROM purchase_orders GROUP BY source`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query source summary: %w", err)
	}
	defer rows.Close()

	out := make(map[string]int)
	for rows.Next() {
		var source string
		var count int
		if err := rows.Scan(&source, &count); err != nil {
			return nil, fmt.Errorf("failed to scan source summary row: %w", err)
		}
		out[source] = count
	}
	return out, nil
}

func (r *Repository) GetPO(ctx context.Context, id uuid.UUID) (*PurchaseOrder, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `SELECT id, vendor_id, status, source, created_at, updated_at, branch_id FROM purchase_orders WHERE id = $1 AND ($2::uuid IS NULL OR branch_id = $2)`
	var po PurchaseOrder
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id, branchID).Scan(
		&po.ID,
		&po.VendorID,
		&po.Status,
		&po.Source,
		&po.CreatedAt,
		&po.UpdatedAt,
		&po.BranchID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get PO header: %w", err)
	}

	linesQuery := `
		SELECT id, po_id, product_id, description, quantity, COALESCE(qty_received, 0), cost, linked_so_line_id
		FROM purchase_order_lines
		WHERE po_id = $1
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, linesQuery, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get PO lines: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var line PurchaseOrderLine
		if err := rows.Scan(
			&line.ID,
			&line.POID,
			&line.ProductID,
			&line.Description,
			&line.Quantity,
			&line.QtyReceived,
			&line.Cost,
			&line.LinkedSOLineID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan PO line: %w", err)
		}
		po.Lines = append(po.Lines, line)
	}

	return &po, nil
}

func (r *Repository) UpdatePO(ctx context.Context, po *PurchaseOrder) error {
	query := `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, po.Status, po.ID)
	return err
}

func (r *Repository) UpdateLineReceived(ctx context.Context, lineID uuid.UUID, qtyReceived float64) error {
	query := `UPDATE purchase_order_lines SET qty_received = $1 WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, qtyReceived, lineID)
	return err
}

// ReorderRun records one execution of an auto-reorder scheduler job.
// Lifecycle: insert with status=RUNNING on entry; update with finished_at,
// status, counts, and error_message on exit. See migration 056.
type ReorderRun struct {
	ID              uuid.UUID  `json:"id"`
	Job             string     `json:"job"`
	StartedAt       time.Time  `json:"started_at"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	DryRun          bool       `json:"dry_run"`
	Status          string     `json:"status"`
	POsCreated      int        `json:"pos_created"`
	ProductsUpdated int        `json:"products_updated"`
	ProductsSkipped int        `json:"products_skipped"`
	ErrorMessage    string     `json:"error_message,omitempty"`
}

// StartReorderRun inserts a row with status='RUNNING' and returns the row id.
// The scheduler later calls FinishReorderRun to stamp the outcome.
func (r *Repository) StartReorderRun(ctx context.Context, job string, dryRun bool) (uuid.UUID, error) {
	const q = `
		INSERT INTO reorder_runs (job, dry_run, status)
		VALUES ($1, $2, 'RUNNING')
		RETURNING id
	`
	var id uuid.UUID
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, q, job, dryRun).Scan(&id); err != nil {
		return uuid.Nil, fmt.Errorf("insert reorder_runs: %w", err)
	}
	return id, nil
}

// FinishReorderRun stamps the outcome of a reorder-run row.
func (r *Repository) FinishReorderRun(ctx context.Context, id uuid.UUID, status string, posCreated, productsUpdated, productsSkipped int, errMsg string) error {
	const q = `
		UPDATE reorder_runs
		SET finished_at = now(),
		    status = $2,
		    pos_created = $3,
		    products_updated = $4,
		    products_skipped = $5,
		    error_message = NULLIF($6, '')
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, id, status, posCreated, productsUpdated, productsSkipped, errMsg)
	return err
}

// ListReorderRuns returns the most recent N rows for the operator dashboard.
func (r *Repository) ListReorderRuns(ctx context.Context, limit int) ([]ReorderRun, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, job, started_at, finished_at, dry_run, status,
		       pos_created, products_updated, products_skipped,
		       COALESCE(error_message, '')
		FROM reorder_runs
		ORDER BY started_at DESC
		LIMIT $1
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("query reorder_runs: %w", err)
	}
	defer rows.Close()

	var out []ReorderRun
	for rows.Next() {
		var rr ReorderRun
		if err := rows.Scan(&rr.ID, &rr.Job, &rr.StartedAt, &rr.FinishedAt,
			&rr.DryRun, &rr.Status, &rr.POsCreated, &rr.ProductsUpdated,
			&rr.ProductsSkipped, &rr.ErrorMessage); err != nil {
			return nil, fmt.Errorf("scan reorder_run: %w", err)
		}
		out = append(out, rr)
	}
	return out, nil
}
