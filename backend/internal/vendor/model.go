package vendor

import (
	"time"

	"github.com/google/uuid"
)

type Vendor struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	ContactEmail *string   `json:"contact_email"`
	Phone        *string   `json:"phone"`
	AddressLine1 *string   `json:"address_line1"`
	City         *string   `json:"city"`
	State        *string   `json:"state"`
	Zip          *string   `json:"zip"`
	PaymentTerms string    `json:"payment_terms"`

	// Performance Metrics
	AverageLeadTimeDays float64 `json:"average_lead_time_days"`
	FillRate            float64 `json:"fill_rate"`
	TotalSpendYTD       float64 `json:"total_spend_ytd"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateVendorRequest struct {
	Name         string  `json:"name"`
	ContactEmail *string `json:"contact_email"`
	Phone        *string `json:"phone"`
	PaymentTerms *string `json:"payment_terms"`
}
