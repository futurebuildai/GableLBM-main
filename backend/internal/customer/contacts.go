package customer

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ContactRole string

const (
	RoleBuyer     ContactRole = "Buyer"
	RoleAP        ContactRole = "AP"
	RoleOwner     ContactRole = "Owner"
	RoleSiteSuper ContactRole = "Site Super"
)

type Contact struct {
	ID         uuid.UUID   `json:"id"`
	CustomerID uuid.UUID   `json:"customer_id"`
	FirstName  string      `json:"first_name"`
	LastName   string      `json:"last_name"`
	Title      string      `json:"title,omitempty"`
	Email      string      `json:"email,omitempty"`
	Phone      string      `json:"phone,omitempty"`
	Role       ContactRole `json:"role"`
	IsPrimary  bool        `json:"is_primary"`
	IsActive   bool        `json:"is_active"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
}

func (r *PostgresRepository) CreateContact(ctx context.Context, c *Contact) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now

	query := `
		INSERT INTO customer_contacts (
			id, customer_id, first_name, last_name, title, email, phone, role, is_primary, is_active, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		c.ID, c.CustomerID, c.FirstName, c.LastName, c.Title, c.Email, c.Phone, c.Role, c.IsPrimary, c.IsActive, c.CreatedAt, c.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create contact: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetContact(ctx context.Context, id uuid.UUID) (*Contact, error) {
	query := `
		SELECT id, customer_id, first_name, last_name, title, email, phone, role, is_primary, is_active, created_at, updated_at
		FROM customer_contacts
		WHERE id = $1
	`
	var c Contact
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&c.ID, &c.CustomerID, &c.FirstName, &c.LastName, &c.Title, &c.Email, &c.Phone, &c.Role, &c.IsPrimary, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("contact not found")
		}
		return nil, fmt.Errorf("failed to get contact: %w", err)
	}
	return &c, nil
}

func (r *PostgresRepository) ListContactsByCustomer(ctx context.Context, customerID uuid.UUID) ([]Contact, error) {
	query := `
		SELECT id, customer_id, first_name, last_name, title, email, phone, role, is_primary, is_active, created_at, updated_at
		FROM customer_contacts
		WHERE customer_id = $1
		ORDER BY is_primary DESC, last_name ASC, first_name ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list contacts: %w", err)
	}
	defer rows.Close()

	var contacts []Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(
			&c.ID, &c.CustomerID, &c.FirstName, &c.LastName, &c.Title, &c.Email, &c.Phone, &c.Role, &c.IsPrimary, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan contact: %w", err)
		}
		contacts = append(contacts, c)
	}
	return contacts, nil
}

func (r *PostgresRepository) UpdateContact(ctx context.Context, c *Contact) error {
	c.UpdatedAt = time.Now()
	query := `
		UPDATE customer_contacts
		SET first_name = $1, last_name = $2, title = $3, email = $4, phone = $5, role = $6, is_primary = $7, is_active = $8, updated_at = $9
		WHERE id = $10
	`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		c.FirstName, c.LastName, c.Title, c.Email, c.Phone, c.Role, c.IsPrimary, c.IsActive, c.UpdatedAt, c.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update contact: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("contact not found")
	}
	return nil
}

func (r *PostgresRepository) DeleteContact(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM customer_contacts WHERE id = $1`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete contact: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("contact not found")
	}
	return nil
}
