package crm

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ActivityType string

const (
	ActivityCall    ActivityType = "CALL"
	ActivityMeeting ActivityType = "MEETING"
	ActivityEmail   ActivityType = "EMAIL"
	ActivityNote    ActivityType = "NOTE"
)

// ValidActivityType returns true if the given ActivityType is one of the known values.
func ValidActivityType(t ActivityType) bool {
	switch t {
	case ActivityCall, ActivityMeeting, ActivityEmail, ActivityNote:
		return true
	default:
		return false
	}
}

type Activity struct {
	ID           uuid.UUID    `json:"id"`
	CustomerID   uuid.UUID    `json:"customer_id"`
	ContactID    *uuid.UUID   `json:"contact_id,omitempty"`
	ActivityType ActivityType `json:"activity_type"`
	Description  string       `json:"description"`
	LoggedBy     *uuid.UUID   `json:"logged_by,omitempty"`
	ActivityDate time.Time    `json:"activity_date"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

// Repository

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, a *Activity) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	now := time.Now()
	if a.ActivityDate.IsZero() {
		a.ActivityDate = now
	}
	a.CreatedAt = now
	a.UpdatedAt = now

	query := `
		INSERT INTO crm_activities (id, customer_id, contact_id, activity_type, description, logged_by, activity_date, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		a.ID, a.CustomerID, a.ContactID, a.ActivityType, a.Description, a.LoggedBy, a.ActivityDate, a.CreatedAt, a.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create activity: %w", err)
	}
	return nil
}

func (r *Repository) Get(ctx context.Context, id uuid.UUID) (*Activity, error) {
	query := `
		SELECT id, customer_id, contact_id, activity_type, description, logged_by, activity_date, created_at, updated_at
		FROM crm_activities WHERE id = $1
	`
	var a Activity
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&a.ID, &a.CustomerID, &a.ContactID, &a.ActivityType, &a.Description, &a.LoggedBy, &a.ActivityDate, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("activity not found")
		}
		return nil, fmt.Errorf("failed to get activity: %w", err)
	}
	return &a, nil
}

func (r *Repository) ListByCustomer(ctx context.Context, customerID uuid.UUID) ([]Activity, error) {
	query := `
		SELECT id, customer_id, contact_id, activity_type, description, logged_by, activity_date, created_at, updated_at
		FROM crm_activities
		WHERE customer_id = $1
		ORDER BY activity_date DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list activities: %w", err)
	}
	defer rows.Close()

	var activities []Activity
	for rows.Next() {
		var a Activity
		if err := rows.Scan(
			&a.ID, &a.CustomerID, &a.ContactID, &a.ActivityType, &a.Description, &a.LoggedBy, &a.ActivityDate, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan activity: %w", err)
		}
		activities = append(activities, a)
	}
	return activities, nil
}

func (r *Repository) Update(ctx context.Context, a *Activity) error {
	a.UpdatedAt = time.Now()
	query := `
		UPDATE crm_activities
		SET contact_id = $1, activity_type = $2, description = $3, logged_by = $4, activity_date = $5, updated_at = $6
		WHERE id = $7
	`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		a.ContactID, a.ActivityType, a.Description, a.LoggedBy, a.ActivityDate, a.UpdatedAt, a.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update activity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("activity not found")
	}
	return nil
}

func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, `DELETE FROM crm_activities WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete activity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("activity not found")
	}
	return nil
}
