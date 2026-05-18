package pricing

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ExposureState enumerates the current state of quote-level exposure.
type ExposureState string

const (
	ExposureStateOK           ExposureState = "OK"
	ExposureStateFlagged      ExposureState = "FLAGGED"
	ExposureStateEscalated    ExposureState = "ESCALATED"
	ExposureStateAckRequired  ExposureState = "ACK_REQUIRED"
	ExposureStateAcknowledged ExposureState = "ACKNOWLEDGED"
	ExposureStateBlocked      ExposureState = "BLOCKED"
	ExposureStateOverridden   ExposureState = "OVERRIDDEN"
)

// EscalationPolicy is the customer-level policy that determines what happens
// when an index moves above the configured threshold on an open quote.
type EscalationPolicy string

const (
	PolicyAutoEscalate    EscalationPolicy = "AUTO_ESCALATE"
	PolicyFlagForRequote  EscalationPolicy = "FLAG_FOR_REQUOTE"
	PolicyRequireAck      EscalationPolicy = "REQUIRE_ACK"
)

// EventType is the kind of entry written to quote_exposure_events.
type EventType string

const (
	EventDetected     EventType = "DETECTED"
	EventFlagged      EventType = "FLAGGED"
	EventEscalated    EventType = "ESCALATED"
	EventAckRequired  EventType = "ACK_REQUIRED"
	EventAckRequested EventType = "ACK_REQUESTED"
	EventAcknowledged EventType = "ACKNOWLEDGED"
	EventCleared      EventType = "CLEARED"
	EventBlocked      EventType = "BLOCKED"
	EventOverridden   EventType = "OVERRIDDEN"
)

// AckMethod is how the customer acknowledged the exposure.
type AckMethod string

const (
	AckMethodVerbal AckMethod = "VERBAL"
	AckMethodEmail  AckMethod = "EMAIL"
	AckMethodPortal AckMethod = "PORTAL"
)

// MarketIndexHistory is an append-only point on an index's time series.
type MarketIndexHistory struct {
	ID            uuid.UUID `json:"id"`
	MarketIndexID uuid.UUID `json:"market_index_id"`
	Value         float64   `json:"value"`
	RecordedAt    time.Time `json:"recorded_at"`
	RecordedBy    string    `json:"recorded_by,omitempty"`
	Source        string    `json:"source"`
}

// ProductCategoryIndexDefault maps a product category to its default market index.
type ProductCategoryIndexDefault struct {
	ID            uuid.UUID `json:"id"`
	CategoryID    uuid.UUID `json:"category_id"`
	MarketIndexID uuid.UUID `json:"market_index_id"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// QuoteExposureEvent is a single append-only entry in the exposure ledger.
type QuoteExposureEvent struct {
	ID                   uuid.UUID  `json:"id"`
	QuoteID              uuid.UUID  `json:"quote_id"`
	QuoteLineID          *uuid.UUID `json:"quote_line_id,omitempty"`
	MarketIndexID        *uuid.UUID `json:"market_index_id,omitempty"`
	MarketIndexHistoryID *uuid.UUID `json:"market_index_history_id,omitempty"`
	EventType            EventType  `json:"event_type"`
	BaseIndexValue       *float64   `json:"base_index_value,omitempty"`
	CurrentIndexValue    *float64   `json:"current_index_value,omitempty"`
	DeltaPct             *float64   `json:"delta_pct,omitempty"`
	ExposureDollars      *float64   `json:"exposure_dollars,omitempty"`
	ThresholdPct         *float64   `json:"threshold_pct,omitempty"`
	Policy               string     `json:"policy,omitempty"`
	ActorUserID          string     `json:"actor_user_id,omitempty"`
	ActorRole            string     `json:"actor_role,omitempty"`
	Method               string     `json:"method,omitempty"`
	Notes                string     `json:"notes,omitempty"`
	IdempotencyKey       string     `json:"idempotency_key"`
	CreatedAt            time.Time  `json:"created_at"`
}

// ExposureStatus is the structured payload returned to callers (order, delivery)
// when they need to render a blocker or proceed.
type ExposureStatus struct {
	QuoteID         uuid.UUID     `json:"quote_id"`
	QuoteShortID    string        `json:"quote_short_id,omitempty"`
	State           ExposureState `json:"state"`
	ExposureDollars float64       `json:"exposure_dollars"`
	Indexes         []string      `json:"indexes"`
	SalespersonID   *uuid.UUID    `json:"salesperson_id,omitempty"`
	SalespersonName string        `json:"salesperson_name,omitempty"`
	RequiredAction  string        `json:"required_action,omitempty"`
	LastCheckedAt   *time.Time    `json:"last_checked_at,omitempty"`
}

// ErrUnresolvedExposure is returned by ExposureChecker.RequireClearForOrder
// when the linked quote has ACK_REQUIRED or BLOCKED state. Callers (the order
// handler) translate this into HTTP 409 with code "UNRESOLVED_EXPOSURE".
//
// To avoid forcing other packages to import pricing, the error exposes its
// payload via the UnresolvedExposurePayload() method. Consumers do:
//
//	var ue interface{ UnresolvedExposurePayload() map[string]any }
//	if errors.As(err, &ue) { ... write 409 with ue.UnresolvedExposurePayload() ... }
type ErrUnresolvedExposure struct {
	Status ExposureStatus
}

func (e *ErrUnresolvedExposure) Error() string {
	return fmt.Sprintf("unresolved index exposure on source quote %s (state=%s, $%.2f)",
		e.Status.QuoteID, e.Status.State, e.Status.ExposureDollars)
}

// UnresolvedExposurePayload returns the JSON-serializable body that the order
// handler renders on a 409. Method-based interface keeps the pricing → order
// dependency from inverting.
func (e *ErrUnresolvedExposure) UnresolvedExposurePayload() map[string]any {
	return map[string]any{
		"error": "unresolved index exposure on source quote",
		"code":  "UNRESOLVED_EXPOSURE",
		"exposure": map[string]any{
			"quote_id":          e.Status.QuoteID,
			"quote_short_id":    e.Status.QuoteShortID,
			"state":             e.Status.State,
			"exposure_dollars":  e.Status.ExposureDollars,
			"indexes":           e.Status.Indexes,
			"salesperson_id":    e.Status.SalespersonID,
			"salesperson_name":  e.Status.SalespersonName,
			"required_action":   e.Status.RequiredAction,
			"last_checked_at":   e.Status.LastCheckedAt,
		},
	}
}

// ExposureRow is one row of the salesperson at-risk-quotes table.
type ExposureRow struct {
	QuoteID          uuid.UUID  `json:"quote_id"`
	ShortID          string     `json:"short_id"`
	CustomerID       uuid.UUID  `json:"customer_id"`
	CustomerName     string     `json:"customer_name"`
	SalespersonID    *uuid.UUID `json:"salesperson_id,omitempty"`
	SalespersonName  string     `json:"salesperson_name,omitempty"`
	DaysOpen         int        `json:"days_open"`
	Indexes          []string   `json:"indexes"`
	MaxDeltaPct      float64    `json:"max_delta_pct"`
	ExposureDollars  float64    `json:"exposure_dollars"`
	Policy           string     `json:"policy"`
	ExposureState    string     `json:"exposure_state"`
	AvailableActions []string   `json:"available_actions"`
}

// PortfolioSummary is the owner's rollup across all open exposed quotes.
type PortfolioSummary struct {
	TotalExposureDollars      float64                  `json:"total_exposure_dollars"`
	TotalQuotes               int                      `json:"total_quotes"`
	TotalCustomers            int                      `json:"total_customers"`
	DeltaVsPriorWeekDollars   float64                  `json:"delta_vs_prior_week_dollars"`
	ByCustomer                []PortfolioCustomerRow   `json:"by_customer,omitempty"`
	BySalesperson             []PortfolioSalespersonRow `json:"by_salesperson,omitempty"`
	Trend                     []PortfolioTrendPoint    `json:"trend,omitempty"`
}

type PortfolioCustomerRow struct {
	CustomerID      uuid.UUID `json:"customer_id"`
	CustomerName    string    `json:"customer_name"`
	QuoteCount      int       `json:"quote_count"`
	ExposureDollars float64   `json:"exposure_dollars"`
	TopIndexCode    string    `json:"top_index_code,omitempty"`
	Policy          string    `json:"policy"`
	LastActivityAt  time.Time `json:"last_activity_at"`
}

type PortfolioSalespersonRow struct {
	SalespersonID    uuid.UUID `json:"salesperson_id"`
	SalespersonName  string    `json:"salesperson_name"`
	QuoteCount       int       `json:"quote_count"`
	ExposureDollars  float64   `json:"exposure_dollars"`
	FlaggedCount     int       `json:"flagged_count"`
	AckRequiredCount int       `json:"ack_required_count"`
}

type PortfolioTrendPoint struct {
	Date            string  `json:"date"`
	ExposureDollars float64 `json:"exposure_dollars"`
}

// EscalatorWithContext is the projection the scanner needs: an escalator plus
// the quote/customer/line context required to evaluate exposure and route by
// policy without separate lookups.
type EscalatorWithContext struct {
	Escalator                  PriceEscalator
	QuoteID                    uuid.UUID
	QuoteState                 string
	QuoteShortID               string
	CustomerID                 uuid.UUID
	CustomerName               string
	SalespersonID              *uuid.UUID
	SalespersonName            string
	LineQuantity               float64
	LineUnitPrice              float64
	CustomerAgreementSignedAt  *time.Time
	CustomerAgreementRef       string
}

// Event payload structs published to the notifier (in-process today, NATS-ready).

type FlaggedEvent struct {
	QuoteID         uuid.UUID
	QuoteShortID    string
	SalespersonID   *uuid.UUID
	SalespersonName string
	CustomerName    string
	ExposureDollars float64
	IndexCode       string
	DeltaPct        float64
}

type EscalatedEvent struct {
	QuoteLineID     uuid.UUID
	QuoteID         uuid.UUID
	QuoteShortID    string
	SalespersonID   *uuid.UUID
	SalespersonName string
	CustomerName    string
	CustomerEmail   string
	OldPrice        float64
	NewPrice        float64
	IndexCode       string
	BaseIndex       float64
	CurrentIndex    float64
}

type AckRequiredEvent struct {
	QuoteID         uuid.UUID
	QuoteShortID    string
	SalespersonID   *uuid.UUID
	SalespersonName string
	CustomerName    string
	ExposureDollars float64
	IndexCode       string
}

type ClearedEvent struct {
	QuoteID         uuid.UUID
	QuoteShortID    string
	SalespersonID   *uuid.UUID
	SalespersonName string
	CustomerName    string
}

// AcknowledgmentRequest is the user-supplied payload for the acknowledge endpoint.
type AcknowledgmentRequest struct {
	Method          AckMethod `json:"method"`
	CustomerContact string    `json:"customer_contact,omitempty"`
	Notes           string    `json:"notes"`
}

// OverrideRequest is the owner-only override payload.
type OverrideRequest struct {
	Notes string `json:"notes"`
}

// IndexRefreshRequest is the admin index-update payload.
type IndexRefreshRequest struct {
	NewValue float64 `json:"new_value"`
	Source   string  `json:"source"`
	Notes    string  `json:"notes,omitempty"`
}

// IndexRefreshPreview is the dry-run result before Apply.
type IndexRefreshPreview struct {
	DeltaPct                 float64                  `json:"delta_pct"`
	AffectedQuoteCount       int                      `json:"affected_quote_count"`
	EstimatedExposureDollars float64                  `json:"estimated_exposure_dollars"`
	AffectedCustomerCount    int                      `json:"affected_customer_count"`
	TopCustomers             []IndexRefreshTopCustomer `json:"top_customers,omitempty"`
}

type IndexRefreshTopCustomer struct {
	CustomerID      uuid.UUID `json:"customer_id"`
	CustomerName    string    `json:"customer_name"`
	ExposureDollars float64   `json:"exposure_dollars"`
	QuoteCount      int       `json:"quote_count"`
}
