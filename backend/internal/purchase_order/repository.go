package purchase_order

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
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
	query := `
		INSERT INTO purchase_orders (id, vendor_id, status, source)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		po.ID,
		po.VendorID,
		po.Status,
		po.Source,
	).Scan(&po.CreatedAt, &po.UpdatedAt)
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

	query := `
		SELECT id, vendor_id, status, source, created_at, updated_at
		FROM purchase_orders
		WHERE vendor_id = $1 AND status = 'DRAFT'
		LIMIT 1
	`
	var po PurchaseOrder
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, vendorID).Scan(
		&po.ID,
		&po.VendorID,
		&po.Status,
		&po.Source,
		&po.CreatedAt,
		&po.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &po, nil
}

func (r *Repository) ListPOs(ctx context.Context) ([]PurchaseOrder, error) {
	query := `
		SELECT po.id, po.vendor_id, po.status, po.source, po.created_at, po.updated_at,
		       COUNT(pol.id) AS line_count,
		       COALESCE(SUM(pol.quantity * pol.cost), 0) AS total_cost
		FROM purchase_orders po
		LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
		GROUP BY po.id
		ORDER BY po.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
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
	query := `SELECT id, vendor_id, status, source, created_at, updated_at FROM purchase_orders WHERE id = $1`
	var po PurchaseOrder
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&po.ID,
		&po.VendorID,
		&po.Status,
		&po.Source,
		&po.CreatedAt,
		&po.UpdatedAt,
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
