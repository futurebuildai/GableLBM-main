package purchase_order

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

func (r *Repository) SaveFreightCharge(ctx context.Context, fc *FreightCharge) error {
	query := `
		INSERT INTO po_freight_charges (id, po_id, file_path, original_filename, carrier_name, invoice_number, total_amount_cents, allocation_method, status, ai_raw_response)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		fc.ID, fc.POID, fc.FilePath, fc.OriginalFilename,
		fc.CarrierName, fc.InvoiceNumber, fc.TotalAmountCents,
		fc.AllocationMethod, fc.Status, fc.AIRawResponse,
	).Scan(&fc.CreatedAt)
}

func (r *Repository) SaveFreightAllocations(ctx context.Context, allocations []FreightAllocation) error {
	for i := range allocations {
		a := &allocations[i]
		query := `
			INSERT INTO po_freight_allocations (id, freight_charge_id, po_line_id, product_id, allocated_cents, per_unit_cents)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING created_at
		`
		if err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
			a.ID, a.FreightChargeID, a.POLineID, a.ProductID,
			a.AllocatedCents, a.PerUnitCents,
		).Scan(&a.CreatedAt); err != nil {
			return fmt.Errorf("failed to save freight allocation: %w", err)
		}
	}
	return nil
}

func (r *Repository) GetFreightCharges(ctx context.Context, poID uuid.UUID) ([]FreightCharge, error) {
	query := `
		SELECT id, po_id, file_path, original_filename, carrier_name, invoice_number,
		       total_amount_cents, allocation_method, status, created_at
		FROM po_freight_charges
		WHERE po_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, poID)
	if err != nil {
		return nil, fmt.Errorf("failed to list freight charges: %w", err)
	}
	defer rows.Close()

	var charges []FreightCharge
	for rows.Next() {
		var fc FreightCharge
		if err := rows.Scan(
			&fc.ID, &fc.POID, &fc.FilePath, &fc.OriginalFilename,
			&fc.CarrierName, &fc.InvoiceNumber, &fc.TotalAmountCents,
			&fc.AllocationMethod, &fc.Status, &fc.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan freight charge: %w", err)
		}
		charges = append(charges, fc)
	}
	return charges, nil
}

func (r *Repository) GetFreightCharge(ctx context.Context, id uuid.UUID) (*FreightCharge, error) {
	query := `
		SELECT id, po_id, file_path, original_filename, carrier_name, invoice_number,
		       total_amount_cents, allocation_method, status, created_at
		FROM po_freight_charges
		WHERE id = $1
	`
	var fc FreightCharge
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&fc.ID, &fc.POID, &fc.FilePath, &fc.OriginalFilename,
		&fc.CarrierName, &fc.InvoiceNumber, &fc.TotalAmountCents,
		&fc.AllocationMethod, &fc.Status, &fc.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("freight charge not found: %w", err)
	}
	return &fc, nil
}

func (r *Repository) GetFreightAllocations(ctx context.Context, freightChargeID uuid.UUID) ([]FreightAllocation, error) {
	query := `
		SELECT fa.id, fa.freight_charge_id, fa.po_line_id, fa.product_id,
		       fa.allocated_cents, fa.per_unit_cents, fa.created_at,
		       COALESCE(pol.description, '')
		FROM po_freight_allocations fa
		LEFT JOIN purchase_order_lines pol ON pol.id = fa.po_line_id
		WHERE fa.freight_charge_id = $1
		ORDER BY fa.created_at
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, freightChargeID)
	if err != nil {
		return nil, fmt.Errorf("failed to list freight allocations: %w", err)
	}
	defer rows.Close()

	var allocs []FreightAllocation
	for rows.Next() {
		var a FreightAllocation
		if err := rows.Scan(
			&a.ID, &a.FreightChargeID, &a.POLineID, &a.ProductID,
			&a.AllocatedCents, &a.PerUnitCents, &a.CreatedAt, &a.Description,
		); err != nil {
			return nil, fmt.Errorf("failed to scan freight allocation: %w", err)
		}
		allocs = append(allocs, a)
	}
	return allocs, nil
}

func (r *Repository) UpdateFreightStatus(ctx context.Context, freightChargeID uuid.UUID, status string) error {
	query := `UPDATE po_freight_charges SET status = $1 WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, status, freightChargeID)
	return err
}
