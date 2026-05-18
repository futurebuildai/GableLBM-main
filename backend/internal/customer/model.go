package customer

import (
	"time"

	"github.com/google/uuid"
)

type CustomerTier string

const (
	TierRetail   CustomerTier = "RETAIL"
	TierSilver   CustomerTier = "SILVER"
	TierGold     CustomerTier = "GOLD"
	TierPlatinum CustomerTier = "PLATINUM"
)

type PriceLevel struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	Multiplier float64   `json:"multiplier"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Customer struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	AccountNumber string    `json:"account_number"`
	Email         string    `json:"email,omitempty"`
	Phone         string    `json:"phone,omitempty"`
	Address       string    `json:"address,omitempty"`

	Tier CustomerTier `json:"tier"`

	PriceLevelID *uuid.UUID  `json:"price_level_id,omitempty"`
	PriceLevel   *PriceLevel `json:"price_level,omitempty"` // Joined

	SalespersonID   *uuid.UUID `json:"salesperson_id,omitempty"`
	SalespersonName string     `json:"salesperson_name,omitempty"`

	CreditLimit float64 `json:"credit_limit"`
	BalanceDue  float64 `json:"balance_due"`
	IsActive    bool    `json:"is_active"`

	// Price-escalation policy — what to do when a market index moves above
	// the threshold during an open quote's validity window. Per migration 054.
	// PriceEscalationPolicy is one of FLAG_FOR_REQUOTE (default), AUTO_ESCALATE,
	// REQUIRE_ACK. AUTO_ESCALATE requires a signed agreement (enforced at the
	// DB level via CHECK constraint).
	PriceEscalationPolicy       string     `json:"price_escalation_policy"`
	EscalationThresholdPct      float64    `json:"escalation_threshold_pct"`
	EscalationAgreementSignedAt *time.Time `json:"escalation_agreement_signed_at,omitempty"`
	EscalationAgreementRef      string     `json:"escalation_agreement_ref,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CustomerJob struct {
	ID         uuid.UUID `json:"id"`
	CustomerID uuid.UUID `json:"customer_id"`
	Name       string    `json:"name"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
