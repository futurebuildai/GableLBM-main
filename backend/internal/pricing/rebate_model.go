package pricing

import (
	"time"

	"github.com/google/uuid"
)

type RebateProgram struct {
	ID          uuid.UUID `json:"id" db:"id"`
	VendorID    uuid.UUID `json:"vendor_id" db:"vendor_id"`
	Name        string    `json:"name" db:"name"`
	ProgramType string    `json:"program_type" db:"program_type"` // VOLUME, GROWTH, PRODUCT_MIX
	StartDate   time.Time `json:"start_date" db:"start_date"`
	EndDate     time.Time `json:"end_date" db:"end_date"`
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`

	Tiers []RebateTier `json:"tiers,omitempty" db:"-"`
}

type RebateTier struct {
	ID        uuid.UUID `json:"id" db:"id"`
	ProgramID uuid.UUID `json:"program_id" db:"program_id"`
	MinVolume int64     `json:"min_volume" db:"min_volume"`
	MaxVolume *int64    `json:"max_volume" db:"max_volume"`
	RebatePct float64   `json:"rebate_pct" db:"rebate_pct"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type RebateClaim struct {
	ID               uuid.UUID  `json:"id" db:"id"`
	ProgramID        uuid.UUID  `json:"program_id" db:"program_id"`
	PeriodStart      time.Time  `json:"period_start" db:"period_start"`
	PeriodEnd        time.Time  `json:"period_end" db:"period_end"`
	QualifyingVolume int64      `json:"qualifying_volume" db:"qualifying_volume"`
	RebateAmount     int64      `json:"rebate_amount" db:"rebate_amount"`
	Status           string     `json:"status" db:"status"` // CALCULATED, CLAIMED, RECEIVED
	ClaimedAt        *time.Time `json:"claimed_at" db:"claimed_at"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
}
