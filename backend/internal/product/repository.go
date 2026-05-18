package product

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository defines the interface for product data access
type Repository interface {
	CreateProduct(ctx context.Context, p *Product) error
	GetProduct(ctx context.Context, id uuid.UUID) (*Product, error)
	ListProducts(ctx context.Context) ([]Product, error)
	ListProductsPaginated(ctx context.Context, limit, offset int) ([]Product, int, error)
	ListBelowReorder(ctx context.Context) ([]ReorderAlert, error)
	UpdateAverageCost(ctx context.Context, id uuid.UUID, avgCost float64) error
	UpdateMarginRules(ctx context.Context, id uuid.UUID, targetMargin float64, commissionRate float64) error
	UpdateReorderTargets(ctx context.Context, id uuid.UUID, reorderPoint, reorderQty float64) error
	UpdateVendor(ctx context.Context, id uuid.UUID, vendorName *string, vendorID *uuid.UUID) error
}

// PostgresRepository implements Repository using pgx
type PostgresRepository struct {
	db *database.DB
}

// NewRepository creates a new PostgresRepository
func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// CreateProduct inserts a new product into the database
func (r *PostgresRepository) CreateProduct(ctx context.Context, p *Product) error {
	query := `
		INSERT INTO products (sku, description, uom_primary, base_price, vendor, vendor_id, upc)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at, average_unit_cost, target_margin, commission_rate`

	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, p.SKU, p.Description, p.UOMPrimary, p.BasePrice, p.Vendor, p.VendorID, p.UPC).Scan(
		&p.ID,
		&p.CreatedAt,
		&p.UpdatedAt,
		&p.AverageUnitCost,
		&p.TargetMargin,
		&p.CommissionRate,
	)

	if err != nil {
		return fmt.Errorf("failed to create product: %w", err)
	}

	return nil
}

// GetProduct retrieves a product by its ID
func (r *PostgresRepository) GetProduct(ctx context.Context, id uuid.UUID) (*Product, error) {
	query := `
		SELECT p.id, p.sku, p.description, p.uom_primary, p.base_price, p.vendor, p.vendor_id, p.upc,
		       COALESCE(p.weight_lbs, 0), COALESCE(p.reorder_point, 0), COALESCE(p.reorder_qty, 0),
		       p.created_at, p.updated_at,
		       COALESCE(SUM(i.quantity), 0) as total_quantity,
		       COALESCE(SUM(i.allocated), 0) as total_allocated,
		       COALESCE(p.average_unit_cost, 0), COALESCE(p.target_margin, 0), COALESCE(p.commission_rate, 0)
		FROM products p
		LEFT JOIN inventory i ON p.id = i.product_id
		WHERE p.id = $1
		GROUP BY p.id`

	var p Product
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&p.ID,
		&p.SKU,
		&p.Description,
		&p.UOMPrimary,
		&p.BasePrice,
		&p.Vendor,
		&p.VendorID,
		&p.UPC,
		&p.WeightLbs,
		&p.ReorderPoint,
		&p.ReorderQty,
		&p.CreatedAt,
		&p.UpdatedAt,
		&p.TotalQuantity,
		&p.TotalAllocated,
		&p.AverageUnitCost,
		&p.TargetMargin,
		&p.CommissionRate,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("product not found")
		}
		return nil, fmt.Errorf("failed to get product: %w", err)
	}

	return &p, nil
}

// ListProducts retrieves all products
func (r *PostgresRepository) ListProducts(ctx context.Context) ([]Product, error) {
	query := `
		SELECT p.id, p.sku, p.description, p.uom_primary, p.base_price, p.vendor, p.vendor_id, p.upc,
		       COALESCE(p.weight_lbs, 0), COALESCE(p.reorder_point, 0), COALESCE(p.reorder_qty, 0),
		       p.created_at, p.updated_at,
		       COALESCE(SUM(i.quantity), 0) as total_quantity,
		       COALESCE(SUM(i.allocated), 0) as total_allocated,
		       COALESCE(p.average_unit_cost, 0), COALESCE(p.target_margin, 0), COALESCE(p.commission_rate, 0)
		FROM products p
		LEFT JOIN inventory i ON p.id = i.product_id
		GROUP BY p.id
		ORDER BY p.sku ASC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list products: %w", err)
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(
			&p.ID,
			&p.SKU,
			&p.Description,
			&p.UOMPrimary,
			&p.BasePrice,
			&p.Vendor,
			&p.VendorID,
			&p.UPC,
			&p.WeightLbs,
			&p.ReorderPoint,
			&p.ReorderQty,
			&p.CreatedAt,
			&p.UpdatedAt,
			&p.TotalQuantity,
			&p.TotalAllocated,
			&p.AverageUnitCost,
			&p.TargetMargin,
			&p.CommissionRate,
		); err != nil {
			return nil, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row error: %w", err)
	}

	return products, nil
}

// ListProductsPaginated retrieves products with pagination
func (r *PostgresRepository) ListProductsPaginated(ctx context.Context, limit, offset int) ([]Product, int, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM products`
	var total int
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count products: %w", err)
	}

	query := `
		SELECT p.id, p.sku, p.description, p.uom_primary, p.base_price, p.vendor, p.vendor_id, p.upc,
		       COALESCE(p.weight_lbs, 0), COALESCE(p.reorder_point, 0), COALESCE(p.reorder_qty, 0),
		       p.created_at, p.updated_at,
		       COALESCE(SUM(i.quantity), 0) as total_quantity,
		       COALESCE(SUM(i.allocated), 0) as total_allocated,
		       COALESCE(p.average_unit_cost, 0), COALESCE(p.target_margin, 0), COALESCE(p.commission_rate, 0)
		FROM products p
		LEFT JOIN inventory i ON p.id = i.product_id
		GROUP BY p.id
		ORDER BY p.sku ASC
		LIMIT $1 OFFSET $2`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list products: %w", err)
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(
			&p.ID,
			&p.SKU,
			&p.Description,
			&p.UOMPrimary,
			&p.BasePrice,
			&p.Vendor,
			&p.VendorID,
			&p.UPC,
			&p.WeightLbs,
			&p.ReorderPoint,
			&p.ReorderQty,
			&p.CreatedAt,
			&p.UpdatedAt,
			&p.TotalQuantity,
			&p.TotalAllocated,
			&p.AverageUnitCost,
			&p.TargetMargin,
			&p.CommissionRate,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("row error: %w", err)
	}

	return products, total, nil
}

// ListBelowReorder returns products whose current stock is below their reorder point
func (r *PostgresRepository) ListBelowReorder(ctx context.Context) ([]ReorderAlert, error) {
	query := `
		SELECT p.id, p.sku, p.description, p.vendor, p.vendor_id,
		       p.reorder_point, COALESCE(p.reorder_qty, 0),
		       COALESCE(SUM(i.quantity), 0) AS current_stock,
		       p.reorder_point - COALESCE(SUM(i.quantity), 0) AS deficit
		FROM products p
		LEFT JOIN inventory i ON p.id = i.product_id
		WHERE p.reorder_point > 0
		GROUP BY p.id
		HAVING COALESCE(SUM(i.quantity), 0) < p.reorder_point
		ORDER BY (p.reorder_point - COALESCE(SUM(i.quantity), 0)) DESC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list reorder alerts: %w", err)
	}
	defer rows.Close()

	var alerts []ReorderAlert
	for rows.Next() {
		var a ReorderAlert
		if err := rows.Scan(
			&a.ProductID,
			&a.SKU,
			&a.Description,
			&a.Vendor,
			&a.VendorID,
			&a.ReorderPoint,
			&a.ReorderQty,
			&a.CurrentStock,
			&a.Deficit,
		); err != nil {
			return nil, fmt.Errorf("failed to scan reorder alert: %w", err)
		}
		alerts = append(alerts, a)
	}

	return alerts, nil
}

// UpdateVendor writes both vendor (display name) and vendor_id (FK) atomically.
func (r *PostgresRepository) UpdateVendor(ctx context.Context, id uuid.UUID, vendorName *string, vendorID *uuid.UUID) error {
	query := `UPDATE products SET vendor = $1, vendor_id = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, vendorName, vendorID, id)
	return err
}

func (r *PostgresRepository) UpdateAverageCost(ctx context.Context, id uuid.UUID, avgCost float64) error {
	query := `UPDATE products SET average_unit_cost = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, avgCost, id)
	return err
}

func (r *PostgresRepository) UpdateMarginRules(ctx context.Context, id uuid.UUID, targetMargin float64, commissionRate float64) error {
	query := `UPDATE products SET target_margin = $1, commission_rate = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, targetMargin, commissionRate, id)
	return err
}

// UpdateReorderTargets writes the recomputed reorder_point and reorder_qty
// produced by the auto-reorder scheduler's RefreshReorderTargets job.
func (r *PostgresRepository) UpdateReorderTargets(ctx context.Context, id uuid.UUID, reorderPoint, reorderQty float64) error {
	query := `UPDATE products SET reorder_point = $1, reorder_qty = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, reorderPoint, reorderQty, id)
	return err
}
