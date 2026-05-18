package project

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository defines data access for projects.
type Repository struct {
	db *database.DB
}

// NewRepository creates a new project repository.
func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

// CreateProject creates a new project in the database.
func (r *Repository) CreateProject(ctx context.Context, p Project) error {
	query := `
		INSERT INTO projects (id, customer_id, name, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, p.ID, p.CustomerID, p.Name, p.Status, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to create project: %w", err)
	}
	return nil
}

// GetProject fetches a single project by ID and CustomerID.
func (r *Repository) GetProject(ctx context.Context, id, customerID uuid.UUID) (*Project, error) {
	query := `
		SELECT id, customer_id, name, status, created_at, updated_at
		FROM projects
		WHERE id = $1 AND customer_id = $2
	`
	var p Project
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id, customerID).Scan(
		&p.ID, &p.CustomerID, &p.Name, &p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("project not found")
		}
		return nil, fmt.Errorf("failed to get project: %w", err)
	}
	return &p, nil
}

// ListProjects returns all projects for a customer.
func (r *Repository) ListProjects(ctx context.Context, customerID uuid.UUID) ([]Project, error) {
	query := `
		SELECT id, customer_id, name, status, created_at, updated_at
		FROM projects
		WHERE customer_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}
	defer rows.Close()

	projects := make([]Project, 0)
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.CustomerID, &p.Name, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan project: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, nil
}

// UpdateProject modifies an existing project.
func (r *Repository) UpdateProject(ctx context.Context, p Project) error {
	query := `
		UPDATE projects
		SET name = $1, status = $2, updated_at = NOW()
		WHERE id = $3 AND customer_id = $4
	`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, p.Name, p.Status, p.ID, p.CustomerID)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("project not found")
	}
	return nil
}

// GetProjectEntities fetches associated orders, deliveries, and invoices.
func (r *Repository) GetProjectEntities(ctx context.Context, projectID, customerID uuid.UUID) ([]ProjectItem, []ProjectItem, []ProjectItem, error) {
	orders := make([]ProjectItem, 0)
	deliveries := make([]ProjectItem, 0)
	invoices := make([]ProjectItem, 0)

	// Fetch Orders linked to project
	orderQuery := `
		SELECT id, status, total_amount, created_at
		FROM orders
		WHERE project_id = $1 AND customer_id = $2
		ORDER BY created_at DESC
	`
	oRows, err := r.db.GetExecutor(ctx).Query(ctx, orderQuery, projectID, customerID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to fetch orders: %w", err)
	}
	defer oRows.Close()

	for oRows.Next() {
		item := ProjectItem{Type: "ORDER"}
		if err := oRows.Scan(&item.ID, &item.Status, &item.TotalAmount, &item.CreatedAt); err != nil {
			return nil, nil, nil, fmt.Errorf("scan order: %w", err)
		}
		item.Reference = fmt.Sprintf("Order %s", item.ID.String()[:8])
		orders = append(orders, item)
	}

	// Fetch Deliveries linked via orders
	deliveryQuery := `
		SELECT d.id, d.status, d.created_at, o.id
		FROM deliveries d
		JOIN orders o ON d.order_id = o.id
		WHERE o.project_id = $1 AND o.customer_id = $2
		ORDER BY d.created_at DESC
	`
	dRows, err := r.db.GetExecutor(ctx).Query(ctx, deliveryQuery, projectID, customerID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to fetch deliveries: %w", err)
	}
	defer dRows.Close()

	for dRows.Next() {
		item := ProjectItem{Type: "DELIVERY"}
		var orderID uuid.UUID
		if err := dRows.Scan(&item.ID, &item.Status, &item.CreatedAt, &orderID); err != nil {
			return nil, nil, nil, fmt.Errorf("scan delivery: %w", err)
		}
		item.Reference = fmt.Sprintf("Delivery for Order %s", orderID.String()[:8])
		deliveries = append(deliveries, item)
	}

	// Fetch Invoices linked via orders OR maybe invoices don't link via orders in DB yet, but invoices have order_id.
	invoiceQuery := `
		SELECT i.id, i.status, i.total_amount, i.created_at, o.id
		FROM invoices i
		JOIN orders o ON i.order_id = o.id
		WHERE o.project_id = $1 AND i.customer_id = $2
		ORDER BY i.created_at DESC
	`
	iRows, err := r.db.GetExecutor(ctx).Query(ctx, invoiceQuery, projectID, customerID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to fetch invoices: %w", err)
	}
	defer iRows.Close()

	for iRows.Next() {
		item := ProjectItem{Type: "INVOICE"}
		var orderID uuid.UUID
		if err := iRows.Scan(&item.ID, &item.Status, &item.TotalAmount, &item.CreatedAt, &orderID); err != nil {
			return nil, nil, nil, fmt.Errorf("scan invoice: %w", err)
		}
		item.Reference = fmt.Sprintf("Invoice for Order %s", orderID.String()[:8])
		invoices = append(invoices, item)
	}

	return orders, deliveries, invoices, nil
}
