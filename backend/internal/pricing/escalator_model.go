package pricing

import (
	"time"

	"github.com/google/uuid"
)

// EscalationType defines how price escalation is calculated.
type EscalationType string

const (
	EscalationPercentage EscalationType = "PERCENTAGE"
	EscalationIndexDelta EscalationType = "INDEX_DELTA"
)

// MarketIndex represents a lumber market index (e.g., Random Lengths).
// IndexCode/CommodityKind/Description/IsActive were added in migration 072 to
// support the price-protection taxonomy; older rows are backfilled there.
type MarketIndex struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Source        string    `json:"source"`
	CurrentValue  float64   `json:"current_value"`
	PreviousValue *float64  `json:"previous_value,omitempty"`
	Unit          string    `json:"unit"`
	LastUpdatedAt time.Time `json:"last_updated_at"`
	CreatedAt     time.Time `json:"created_at"`

	IndexCode     string  `json:"index_code"`
	CommodityKind *string `json:"commodity_kind,omitempty"`
	Description   *string `json:"description,omitempty"`
	IsActive      bool    `json:"is_active"`
}

// PriceEscalator links a quote line to an escalation strategy.
// The snapshot-lifecycle fields (BaseIndexRecordedAt … ThresholdPctAtSnapshot)
// were added in migration 072 and freeze the policy/threshold in force when the
// quote was sent, so later customer-policy edits cannot retroactively change a
// live quote's escalation behavior.
type PriceEscalator struct {
	ID             uuid.UUID      `json:"id"`
	QuoteLineID    *uuid.UUID     `json:"quote_line_id,omitempty"`
	MarketIndexID  *uuid.UUID     `json:"market_index_id,omitempty"`
	EscalationType EscalationType `json:"escalation_type"`
	EscalationRate float64        `json:"escalation_rate"`
	BasePrice      float64        `json:"base_price"`
	BaseIndexValue *float64       `json:"base_index_value,omitempty"`
	EffectiveDate  time.Time      `json:"effective_date"`
	ExpirationDate time.Time      `json:"expiration_date"`
	IsActive       bool           `json:"is_active"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`

	BaseIndexRecordedAt    *time.Time `json:"base_index_recorded_at,omitempty"`
	LastCheckedAt          *time.Time `json:"last_checked_at,omitempty"`
	CurrentState           string     `json:"current_state"`
	PolicyAtSnapshot       *string    `json:"policy_at_snapshot,omitempty"`
	ThresholdPctAtSnapshot *float64   `json:"threshold_pct_at_snapshot,omitempty"`
}

// EscalationRequest is the payload for the calculate-escalation endpoint.
type EscalationRequest struct {
	BasePrice      float64        `json:"base_price"`
	EscalationType EscalationType `json:"escalation_type"`
	EscalationRate float64        `json:"escalation_rate"`
	EffectiveDate  string         `json:"effective_date"`
	TargetDate     string         `json:"target_date"`
	MarketIndexID  *uuid.UUID     `json:"market_index_id,omitempty"`
}

// EscalationResult is returned from the escalation calculation.
type EscalationResult struct {
	BasePrice      float64  `json:"base_price"`
	FuturePrice    float64  `json:"future_price"`
	PriceDelta     float64  `json:"price_delta"`
	DeltaPercent   float64  `json:"delta_percent"`
	MonthsOut      int      `json:"months_out"`
	IsStale        bool     `json:"is_stale"`
	StaleDeltaPct  float64  `json:"stale_delta_pct,omitempty"`
	CurrentIndex   *float64 `json:"current_index,omitempty"`
	BaseIndex      *float64 `json:"base_index,omitempty"`
	EscalationType string   `json:"escalation_type"`
	ExpirationDate string   `json:"expiration_date,omitempty"`
	IsExpired      bool     `json:"is_expired"`
}
