package purchase_order

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// SalesVelocity is the per-product sales aggregate the reorder-target refresh
// and recommendation engine rely on. Computed from order_lines over a rolling
// lookback window.
type SalesVelocity struct {
	ProductID     uuid.UUID
	UnitsSold     float64
	DaysWithSales int
}

// VelocityRepository owns the order_lines aggregation query. It is its own
// repo (not folded into Repository) because it crosses module boundaries
// (orders) — keeping it separate makes the cross-module read explicit.
type VelocityRepository struct {
	db *database.DB
}

func NewVelocityRepository(db *database.DB) *VelocityRepository {
	return &VelocityRepository{db: db}
}

// ListSalesVelocity returns net units sold per product over the last
// `lookbackDays` days, excluding cancelled orders. Products with zero sales
// in the window are absent from the result (no zero rows).
func (r *VelocityRepository) ListSalesVelocity(ctx context.Context, lookbackDays int) ([]SalesVelocity, error) {
	if lookbackDays <= 0 {
		lookbackDays = 90
	}
	const q = `
		SELECT
			ol.product_id,
			SUM(ol.quantity)::float8 AS units_sold,
			COUNT(DISTINCT DATE(ol.created_at))::int AS days_with_sales
		FROM order_lines ol
		JOIN orders o ON o.id = ol.order_id
		WHERE ol.product_id IS NOT NULL
		  AND o.status <> 'CANCELLED'
		  AND ol.created_at >= now() - ($1::int * INTERVAL '1 day')
		GROUP BY ol.product_id
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, lookbackDays)
	if err != nil {
		return nil, fmt.Errorf("query sales velocity: %w", err)
	}
	defer rows.Close()

	var out []SalesVelocity
	for rows.Next() {
		var v SalesVelocity
		if err := rows.Scan(&v.ProductID, &v.UnitsSold, &v.DaysWithSales); err != nil {
			return nil, fmt.Errorf("scan sales velocity row: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sales velocity rows: %w", err)
	}
	return out, nil
}
