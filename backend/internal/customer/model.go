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
	ID              uuid.UUID `json:"id"`
	PrimaryBranchID uuid.UUID `json:"primary_branch_id"`
	Name            string    `json:"name"`
	AccountNumber   string    `json:"account_number"`
	Email           string    `json:"email,omitempty"`
	Phone           string    `json:"phone,omitempty"`
	Address         string    `json:"address,omitempty"`

	Tier CustomerTier `json:"tier"`

	PriceLevelID *uuid.UUID  `json:"price_level_id,omitempty"`
	PriceLevel   *PriceLevel `json:"price_level,omitempty"` // Joined

	SalespersonID   *uuid.UUID `json:"salesperson_id,omitempty"`
	SalespersonName string     `json:"salesperson_name,omitempty"`

	CreditLimit float64 `json:"credit_limit"`
	BalanceDue  float64 `json:"balance_due"`
	IsActive    bool    `json:"is_active"`

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
