package pos

import (
	"time"

	"github.com/google/uuid"
)

// TransactionStatus tracks the lifecycle of a POS transaction.
type TransactionStatus string

const (
	TransactionStatusOpen      TransactionStatus = "OPEN"
	TransactionStatusCompleted TransactionStatus = "COMPLETED"
	TransactionStatusVoided    TransactionStatus = "VOIDED"
	TransactionStatusReturned  TransactionStatus = "RETURNED"
	TransactionStatusHeld      TransactionStatus = "HELD"
)

// POSTransaction represents a retail point-of-sale transaction.
type POSTransaction struct {
	ID          uuid.UUID         `json:"id" db:"id"`
	BranchID    uuid.UUID         `json:"branch_id" db:"branch_id"`
	RegisterID  string            `json:"register_id" db:"register_id"`
	CashierID   uuid.UUID         `json:"cashier_id" db:"cashier_id"`
	CustomerID  *uuid.UUID        `json:"customer_id,omitempty" db:"customer_id"`
	Subtotal    int64             `json:"subtotal" db:"subtotal"`     // Cents
	TaxAmount   int64             `json:"tax_amount" db:"tax_amount"` // Cents
	Total       int64             `json:"total" db:"total"`           // Cents
	Status      TransactionStatus `json:"status" db:"status"`
	CompletedAt *time.Time        `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`

	// Offline sync fields
	SyncedFrom      *string    `json:"synced_from,omitempty" db:"synced_from"`             // nil = live, "offline-v1" = synced
	ClientCreatedAt *time.Time `json:"client_created_at,omitempty" db:"client_created_at"` // original offline timestamp

	// Populated on read
	LineItems []POSLineItem `json:"line_items,omitempty"`
	Tenders   []POSTender   `json:"tenders,omitempty"`
}

// POSLineItem represents a product line within a POS transaction.
type POSLineItem struct {
	ID            uuid.UUID `json:"id" db:"id"`
	TransactionID uuid.UUID `json:"transaction_id" db:"transaction_id"`
	ProductID     uuid.UUID `json:"product_id" db:"product_id"`
	Description   string    `json:"description" db:"description"`
	Quantity      float64   `json:"quantity" db:"quantity"`
	UOM           string    `json:"uom" db:"uom"`
	UnitPrice     int64     `json:"unit_price" db:"unit_price"` // Cents
	LineTotal     int64     `json:"line_total" db:"line_total"` // Cents
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// POSTender represents a payment method applied to a POS transaction.
type POSTender struct {
	ID            uuid.UUID `json:"id" db:"id"`
	TransactionID uuid.UUID `json:"transaction_id" db:"transaction_id"`
	Method        string    `json:"method" db:"method"` // CASH, CARD, CHECK, ACCOUNT
	Amount        int64     `json:"amount" db:"amount"` // Cents
	Reference     string    `json:"reference,omitempty" db:"reference"`
	CardLast4     string    `json:"card_last4,omitempty" db:"card_last4"`
	CardBrand     string    `json:"card_brand,omitempty" db:"card_brand"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// POSRegister represents a physical or virtual POS register.
type POSRegister struct {
	ID         string     `json:"id" db:"id"`
	LocationID *uuid.UUID `json:"location_id,omitempty" db:"location_id"`
	BranchID   *uuid.UUID `json:"branch_id,omitempty" db:"branch_id"` // Derived from locations.branch_id
	Name       string     `json:"name" db:"name"`
	IsActive   bool       `json:"is_active" db:"is_active"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
}

// --- Request/Response Types ---

// AddLineItemRequest is sent when scanning/adding a product to the cart.
type AddLineItemRequest struct {
	ProductID uuid.UUID `json:"product_id"`
	Quantity  float64   `json:"quantity"`
	UOM       string    `json:"uom"`
}

// AddTenderRequest is sent when applying a payment method.
type AddTenderRequest struct {
	Method    string  `json:"method"`
	Amount    float64 `json:"amount"` // Dollars
	Reference string  `json:"reference,omitempty"`
	TokenID   string  `json:"token_id,omitempty"` // For card payments via Run Payments
}

// QuickSearchRequest is the typeahead product search.
type QuickSearchRequest struct {
	Query string `json:"query"` // SKU, description, or barcode
}

// QuickSearchResult is a lightweight product result for POS.
type QuickSearchResult struct {
	ProductID   uuid.UUID `json:"product_id"`
	SKU         string    `json:"sku"`
	Description string    `json:"description"`
	UnitPrice   float64   `json:"unit_price"` // Dollars
	UOM         string    `json:"uom"`
	InStock     float64   `json:"in_stock"`
}

// TransactionSummary is a lightweight view for transaction history.
type TransactionSummary struct {
	ID          uuid.UUID         `json:"id"`
	RegisterID  string            `json:"register_id"`
	Total       int64             `json:"total"`
	Status      TransactionStatus `json:"status"`
	ItemCount   int               `json:"item_count"`
	CompletedAt *time.Time        `json:"completed_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

// --- Offline Sync DTOs ---

// OfflineSyncRequest is a batch of completed transactions from an offline POS.
type OfflineSyncRequest struct {
	BatchID    string               `json:"batch_id"`
	RegisterID string               `json:"register_id"`
	Items      []OfflineTransaction `json:"items"`
}

// OfflineTransaction is a single completed POS transaction captured offline.
type OfflineTransaction struct {
	ClientID        uuid.UUID          `json:"client_id"`                   // client-generated UUID
	RegisterID      string             `json:"register_id"`
	CashierID       uuid.UUID          `json:"cashier_id"`
	CustomerID      *uuid.UUID         `json:"customer_id,omitempty"`
	Items           []AddLineItemRequest `json:"items"`
	Tenders         []AddTenderRequest   `json:"tenders"`
	ClientCreatedAt time.Time          `json:"client_created_at"`
}

// OfflineSyncResponse reports results of a batch sync.
type OfflineSyncResponse struct {
	BatchID        string      `json:"batch_id"`
	SyncedCount    int         `json:"synced_count"`
	DuplicateCount int         `json:"duplicate_count"`
	ErrorCount     int         `json:"error_count"`
	Errors         []SyncError `json:"errors,omitempty"`
}

// SyncError describes a single transaction that failed during sync.
type SyncError struct {
	ClientID string `json:"client_id"`
	Reason   string `json:"reason"`
}

// CatalogProduct is a lightweight product for the offline catalog cache.
type CatalogProduct struct {
	ProductID   uuid.UUID `json:"product_id"`
	SKU         string    `json:"sku"`
	Description string    `json:"description"`
	Price       float64   `json:"price"` // dollars
	UOM         string    `json:"uom"`
	InStock     float64   `json:"in_stock"`
}
