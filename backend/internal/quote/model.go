package quote

import (
	"encoding/json"
	"time"

	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

type QuoteState string

const (
	QuoteStateDraft    QuoteState = "DRAFT"
	QuoteStateSent     QuoteState = "SENT"
	QuoteStateAccepted QuoteState = "ACCEPTED"
	QuoteStateRejected QuoteState = "REJECTED"
	QuoteStateExpired  QuoteState = "EXPIRED"
)

type Quote struct {
	ID           uuid.UUID  `json:"id"`
	BranchID     uuid.UUID  `json:"branch_id"`
	CustomerID   uuid.UUID  `json:"customer_id"`
	CustomerName string     `json:"customer_name,omitempty"`
	JobID        *uuid.UUID `json:"job_id,omitempty"`
	State        QuoteState `json:"state"`
	TotalAmount  float64    `json:"total_amount"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// Lifecycle timestamps
	SentAt     *time.Time `json:"sent_at,omitempty"`
	AcceptedAt *time.Time `json:"accepted_at,omitempty"`
	RejectedAt *time.Time `json:"rejected_at,omitempty"`

	// Delivery fields
	DeliveryType  string     `json:"delivery_type"`            // "PICKUP" or "DELIVERY"
	FreightAmount float64    `json:"freight_amount"`
	VehicleID     *uuid.UUID `json:"vehicle_id,omitempty"`
	VehicleName   string     `json:"vehicle_name,omitempty"`

	// Analytics fields
	MarginTotal float64 `json:"margin_total"`
	Source      string  `json:"source"` // "manual" or "ai"

	// Original upload (only for AI-sourced quotes)
	OriginalFile        []byte `json:"-"`                                    // not serialized in list responses
	OriginalFilename    string `json:"original_filename,omitempty"`
	OriginalContentType string `json:"original_content_type,omitempty"`

	// AI parse mapping data (stored as JSONB)
	ParseMap json.RawMessage `json:"parse_map,omitempty"`

	Lines []QuoteLine `json:"lines,omitempty"`
}

type QuoteLine struct {
	ID          uuid.UUID   `json:"id"`
	QuoteID     uuid.UUID   `json:"quote_id"`
	ProductID   uuid.UUID   `json:"product_id"`
	SKU         string      `json:"sku"`
	Description string      `json:"description"`
	Quantity    float64     `json:"quantity"`
	UOM         product.UOM `json:"uom"`
	UnitPrice   float64     `json:"unit_price"`
	UnitCost    float64     `json:"unit_cost"`
	LineTotal   float64     `json:"line_total"`
	CreatedAt   time.Time   `json:"created_at"`
}

// QuoteAnalytics holds aggregated quote analytics data.
type QuoteAnalytics struct {
	TotalQuotes       int     `json:"total_quotes"`
	DraftCount        int     `json:"draft_count"`
	SentCount         int     `json:"sent_count"`
	AcceptedCount     int     `json:"accepted_count"`
	RejectedCount     int     `json:"rejected_count"`
	ExpiredCount      int     `json:"expired_count"`
	ConversionRate    float64 `json:"conversion_rate"`
	AvgMarginAccepted float64 `json:"avg_margin_accepted"`
	AvgMarginRejected float64 `json:"avg_margin_rejected"`
	AvgDaysToClose    float64 `json:"avg_days_to_close"`
	TotalQuoteValue   float64 `json:"total_quote_value"`
	TotalAcceptedValue float64 `json:"total_accepted_value"`
	AISourcedCount    int     `json:"ai_sourced_count"`
	AIConversionRate  float64 `json:"ai_conversion_rate"`
	ManualConversionRate float64 `json:"manual_conversion_rate"`
	TrendData         []QuoteAnalyticsTrend `json:"trend_data"`
}

// QuoteAnalyticsTrend holds daily quote counts for trend charts.
type QuoteAnalyticsTrend struct {
	Date          string `json:"date"`
	Created       int    `json:"created"`
	Accepted      int    `json:"accepted"`
	Rejected      int    `json:"rejected"`
	TotalValue    float64 `json:"total_value"`
	AcceptedValue float64 `json:"accepted_value"`
}
