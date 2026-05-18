package purchase_order

import (
	"time"

	"github.com/google/uuid"
)

type FreightCharge struct {
	ID               uuid.UUID           `json:"id"`
	POID             uuid.UUID           `json:"po_id"`
	FilePath         string              `json:"file_path,omitempty"`
	OriginalFilename string              `json:"original_filename,omitempty"`
	CarrierName      string              `json:"carrier_name,omitempty"`
	InvoiceNumber    string              `json:"invoice_number,omitempty"`
	TotalAmountCents int64               `json:"total_amount_cents"`
	AllocationMethod string              `json:"allocation_method"`
	Status           string              `json:"status"`
	AIRawResponse    string              `json:"-"`
	CreatedAt        time.Time           `json:"created_at"`
	Allocations      []FreightAllocation `json:"allocations,omitempty"`
}

type FreightAllocation struct {
	ID              uuid.UUID  `json:"id"`
	FreightChargeID uuid.UUID  `json:"freight_charge_id"`
	POLineID        uuid.UUID  `json:"po_line_id"`
	ProductID       *uuid.UUID `json:"product_id,omitempty"`
	AllocatedCents  int64      `json:"allocated_cents"`
	PerUnitCents    int64      `json:"per_unit_cents"`
	Description     string     `json:"description,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type FreightUploadResponse struct {
	FreightCharge FreightCharge       `json:"freight_charge"`
	Allocations   []FreightAllocation `json:"allocations"`
}

const (
	FreightStatusPending = "PENDING"
	FreightStatusApplied = "APPLIED"
)
