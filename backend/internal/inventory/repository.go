package inventory

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	GetInventory(ctx context.Context, productID uuid.UUID, locationID *uuid.UUID) (*Inventory, error)
	UpdateInventory(ctx context.Context, inv *Inventory) error
	CreateInventory(ctx context.Context, inv *Inventory) error
	ListInventoryByProduct(ctx context.Context, productID uuid.UUID) ([]Inventory, error)
	ListInventoryByProductAndBranch(ctx context.Context, productID uuid.UUID, branchID *uuid.UUID) ([]Inventory, error)
	LocationBranchID(ctx context.Context, locationID uuid.UUID) (*uuid.UUID, error)
	AllocateStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error
	DeallocateStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error
	FulfillStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error
	RevertFulfillStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error
	ExecuteInTx(ctx context.Context, fn func(context.Context) error) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) ExecuteInTx(ctx context.Context, fn func(context.Context) error) error {
	return r.db.RunInTx(ctx, fn)
}

func (r *PostgresRepository) GetInventory(ctx context.Context, productID uuid.UUID, locationID *uuid.UUID) (*Inventory, error) {
	query := `
		SELECT id, product_id, location_id, location, quantity, allocated, updated_at
		FROM inventory
		WHERE product_id = $1 AND (($2::uuid IS NULL AND location_id IS NULL) OR location_id = $2)
	`
	var inv Inventory
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, productID, locationID).Scan(
		&inv.ID,
		&inv.ProductID,
		&inv.LocationID,
		&inv.Location,
		&inv.Quantity,
		&inv.Allocated,
		&inv.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get inventory: %w", err)
	}

	return &inv, nil
}

func (r *PostgresRepository) CreateInventory(ctx context.Context, inv *Inventory) error {
	query := `
		INSERT INTO inventory (product_id, location_id, location, quantity, allocated)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, updated_at
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, inv.ProductID, inv.LocationID, inv.Location, inv.Quantity, inv.Allocated).Scan(
		&inv.ID,
		&inv.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create inventory: %w", err)
	}
	return nil
}

func (r *PostgresRepository) UpdateInventory(ctx context.Context, inv *Inventory) error {
	query := `
		UPDATE inventory
		SET quantity = $1, allocated = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING updated_at
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, inv.Quantity, inv.Allocated, inv.ID).Scan(&inv.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to update inventory: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ListInventoryByProduct(ctx context.Context, productID uuid.UUID) ([]Inventory, error) {
	query := `
        SELECT i.id, i.product_id, i.location_id, 
               COALESCE(l.path, i.location, '') as location_name, 
               i.quantity, i.allocated, i.updated_at
        FROM inventory i
        LEFT JOIN locations l ON i.location_id = l.id
        WHERE i.product_id = $1
    `
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Inventory
	for rows.Next() {
		var i Inventory
		if err := rows.Scan(&i.ID, &i.ProductID, &i.LocationID, &i.Location, &i.Quantity, &i.Allocated, &i.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

// ListInventoryByProductAndBranch returns inventory rows for a product, optionally
// scoped to a branch via the joined location row's branch_id. When branchID is
// nil, all branches are returned (admin "all branches" semantic).
func (r *PostgresRepository) ListInventoryByProductAndBranch(ctx context.Context, productID uuid.UUID, branchID *uuid.UUID) ([]Inventory, error) {
	query := `
        SELECT i.id, i.product_id, i.location_id,
               COALESCE(l.path, i.location, '') as location_name,
               i.quantity, i.allocated, i.updated_at
        FROM inventory i
        LEFT JOIN locations l ON i.location_id = l.id
        WHERE i.product_id = $1
          AND ($2::uuid IS NULL OR l.branch_id = $2)
    `
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, productID, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Inventory
	for rows.Next() {
		var i Inventory
		if err := rows.Scan(&i.ID, &i.ProductID, &i.LocationID, &i.Location, &i.Quantity, &i.Allocated, &i.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

// LocationBranchID returns the branch_id for a given location row, or nil if
// the location does not have one assigned (e.g. legacy rows or branch rows
// where branch_id is the location itself — caller handles both).
func (r *PostgresRepository) LocationBranchID(ctx context.Context, locationID uuid.UUID) (*uuid.UUID, error) {
	var branch *uuid.UUID
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT branch_id FROM locations WHERE id = $1`, locationID).Scan(&branch)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to resolve location branch: %w", err)
	}
	return branch, nil
}

func (r *PostgresRepository) AllocateStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	query := `
		UPDATE inventory
		SET allocated = allocated + $1, updated_at = NOW()
		WHERE id = $2 AND (quantity - allocated) >= $1
	`
	ct, err := r.db.GetExecutor(ctx).Exec(ctx, query, delta, inventoryID)
	if err != nil {
		return fmt.Errorf("failed to allocate stock: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("insufficient available stock for allocation")
	}
	return nil
}

func (r *PostgresRepository) DeallocateStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	query := `
		UPDATE inventory
		SET allocated = allocated - $1, updated_at = NOW()
		WHERE id = $2 AND allocated >= $1
	`
	ct, err := r.db.GetExecutor(ctx).Exec(ctx, query, delta, inventoryID)
	if err != nil {
		return fmt.Errorf("failed to deallocate stock: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("insufficient allocated stock for deallocation")
	}
	return nil
}

func (r *PostgresRepository) RevertFulfillStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	query := `
		UPDATE inventory
		SET quantity = quantity + $1, allocated = allocated + $1, updated_at = NOW()
		WHERE id = $2
	`
	ct, err := r.db.GetExecutor(ctx).Exec(ctx, query, delta, inventoryID)
	if err != nil {
		return fmt.Errorf("failed to revert fulfillment: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("inventory record not found for revert")
	}
	return nil
}

func (r *PostgresRepository) FulfillStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	query := `
		UPDATE inventory
		SET quantity = quantity - $1, allocated = allocated - $1, updated_at = NOW()
		WHERE id = $2 AND quantity >= $1 AND allocated >= $1
	`
	ct, err := r.db.GetExecutor(ctx).Exec(ctx, query, delta, inventoryID)
	if err != nil {
		return fmt.Errorf("failed to fulfill stock: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("insufficient stock for fulfillment")
	}
	return nil
}
