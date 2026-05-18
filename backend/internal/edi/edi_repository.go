package edi

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// TradingPartner represents a vendor-agnostic EDI trading partner configuration.
type TradingPartner struct {
	ID                   uuid.UUID `json:"id" db:"id"`
	Name                 string    `json:"name" db:"name"`
	ISASenderID          string    `json:"isa_sender_id" db:"isa_sender_id"`
	ISASenderQualifier   string    `json:"isa_sender_qualifier" db:"isa_sender_qualifier"`
	ISAReceiverID        string    `json:"isa_receiver_id" db:"isa_receiver_id"`
	ISAReceiverQualifier string    `json:"isa_receiver_qualifier" db:"isa_receiver_qualifier"`
	GSSenderID           string    `json:"gs_sender_id" db:"gs_sender_id"`
	GSReceiverID         string    `json:"gs_receiver_id" db:"gs_receiver_id"`
	EDIVersion           string    `json:"edi_version" db:"edi_version"`
	TransportType        string    `json:"transport_type" db:"transport_type"` // SFTP, AS2, FILE
	TransportConfig      string    `json:"transport_config" db:"transport_config"` // JSON
	SupportedDocuments   []string  `json:"supported_documents" db:"supported_documents"`
	IsActive             bool      `json:"is_active" db:"is_active"`
	Notes                string    `json:"notes" db:"notes"`
	CreatedAt            time.Time `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time `json:"updated_at" db:"updated_at"`
}

// CatalogEntry represents a vendor SKU in the EDI catalog mapped to an internal product.
type CatalogEntry struct {
	ID                uuid.UUID  `json:"id"`
	PartnerID         uuid.UUID  `json:"partner_id"`
	VendorSKU         string     `json:"vendor_sku"`
	InternalProductID *uuid.UUID `json:"internal_product_id,omitempty"`
	Description       string     `json:"description"`
	UnitCost          float64    `json:"unit_cost"`
	UOM               string     `json:"uom"`
	EffectiveDate     *time.Time `json:"effective_date,omitempty"`
	ExpiryDate        *time.Time `json:"expiry_date,omitempty"`
	MinOrderQty       float64    `json:"min_order_qty"`
	PackQty           float64    `json:"pack_qty"`
	SyncedAt          time.Time  `json:"synced_at"`
}

// EDIRepository manages EDI trading partners and catalog entries.
type EDIRepository struct {
	db *database.DB
}

// NewEDIRepository creates a new EDI repository.
func NewEDIRepository(db *database.DB) *EDIRepository {
	return &EDIRepository{db: db}
}

// --- Trading Partner CRUD ---

func (r *EDIRepository) CreatePartner(ctx context.Context, p *TradingPartner) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	p.CreatedAt = time.Now()
	p.UpdatedAt = p.CreatedAt

	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`INSERT INTO edi_trading_partners
			(id, name, isa_sender_id, isa_sender_qualifier, isa_receiver_id, isa_receiver_qualifier,
			 gs_sender_id, gs_receiver_id, edi_version, transport_type, transport_config,
			 supported_documents, is_active, notes, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)`,
		p.ID, p.Name, p.ISASenderID, p.ISASenderQualifier, p.ISAReceiverID, p.ISAReceiverQualifier,
		p.GSSenderID, p.GSReceiverID, p.EDIVersion, p.TransportType, p.TransportConfig,
		p.SupportedDocuments, p.IsActive, p.Notes, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *EDIRepository) GetPartner(ctx context.Context, id uuid.UUID) (*TradingPartner, error) {
	var p TradingPartner
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT id, name, isa_sender_id, isa_sender_qualifier, isa_receiver_id, isa_receiver_qualifier,
			gs_sender_id, gs_receiver_id, edi_version, transport_type, transport_config::text,
			supported_documents, is_active, notes, created_at, updated_at
		FROM edi_trading_partners WHERE id = $1`, id,
	).Scan(
		&p.ID, &p.Name, &p.ISASenderID, &p.ISASenderQualifier, &p.ISAReceiverID, &p.ISAReceiverQualifier,
		&p.GSSenderID, &p.GSReceiverID, &p.EDIVersion, &p.TransportType, &p.TransportConfig,
		&p.SupportedDocuments, &p.IsActive, &p.Notes, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("trading partner not found: %w", err)
	}
	return &p, nil
}

func (r *EDIRepository) ListPartners(ctx context.Context) ([]TradingPartner, error) {
	rows, err := r.db.GetExecutor(ctx).Query(ctx,
		`SELECT id, name, isa_sender_id, isa_sender_qualifier, isa_receiver_id, isa_receiver_qualifier,
			gs_sender_id, gs_receiver_id, edi_version, transport_type, transport_config::text,
			supported_documents, is_active, notes, created_at, updated_at
		FROM edi_trading_partners ORDER BY name ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var partners []TradingPartner
	for rows.Next() {
		var p TradingPartner
		if err := rows.Scan(
			&p.ID, &p.Name, &p.ISASenderID, &p.ISASenderQualifier, &p.ISAReceiverID, &p.ISAReceiverQualifier,
			&p.GSSenderID, &p.GSReceiverID, &p.EDIVersion, &p.TransportType, &p.TransportConfig,
			&p.SupportedDocuments, &p.IsActive, &p.Notes, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		partners = append(partners, p)
	}
	return partners, nil
}

func (r *EDIRepository) UpdatePartner(ctx context.Context, p *TradingPartner) error {
	p.UpdatedAt = time.Now()
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE edi_trading_partners SET
			name=$2, isa_sender_id=$3, isa_sender_qualifier=$4,
			isa_receiver_id=$5, isa_receiver_qualifier=$6,
			gs_sender_id=$7, gs_receiver_id=$8, edi_version=$9,
			transport_type=$10, transport_config=$11::jsonb,
			supported_documents=$12, is_active=$13, notes=$14, updated_at=$15
		WHERE id=$1`,
		p.ID, p.Name, p.ISASenderID, p.ISASenderQualifier,
		p.ISAReceiverID, p.ISAReceiverQualifier,
		p.GSSenderID, p.GSReceiverID, p.EDIVersion,
		p.TransportType, p.TransportConfig,
		p.SupportedDocuments, p.IsActive, p.Notes, p.UpdatedAt,
	)
	return err
}

// DeletePartner permanently removes a trading partner.
// TODO(P3): Convert to soft delete (SET deleted_at = NOW()) once a migration adds
// a deleted_at column to edi_trading_partners and list/get queries filter on it.
func (r *EDIRepository) DeletePartner(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`DELETE FROM edi_trading_partners WHERE id = $1`, id,
	)
	return err
}

// --- Catalog Entries ---

func (r *EDIRepository) SaveCatalogEntries(ctx context.Context, partnerID uuid.UUID, entries []CatalogEntry) (int, error) {
	count := 0
	for _, e := range entries {
		_, err := r.db.GetExecutor(ctx).Exec(ctx,
			`INSERT INTO edi_catalog_entries
				(id, partner_id, vendor_sku, description, unit_cost, uom, effective_date, expiry_date, min_order_qty, pack_qty, synced_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
			ON CONFLICT (partner_id, vendor_sku) DO UPDATE SET
				description = EXCLUDED.description,
				unit_cost = EXCLUDED.unit_cost,
				uom = EXCLUDED.uom,
				effective_date = EXCLUDED.effective_date,
				expiry_date = EXCLUDED.expiry_date,
				min_order_qty = EXCLUDED.min_order_qty,
				pack_qty = EXCLUDED.pack_qty,
				synced_at = NOW()`,
			uuid.New(), partnerID, e.VendorSKU, e.Description, e.UnitCost, e.UOM,
			e.EffectiveDate, e.ExpiryDate, e.MinOrderQty, e.PackQty,
		)
		if err != nil {
			return count, fmt.Errorf("upsert catalog entry %s: %w", e.VendorSKU, err)
		}
		count++
	}
	return count, nil
}

func (r *EDIRepository) ListCatalogEntries(ctx context.Context, partnerID uuid.UUID, limit int) ([]CatalogEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := r.db.GetExecutor(ctx).Query(ctx,
		`SELECT id, partner_id, vendor_sku, internal_product_id, description, unit_cost, uom,
			effective_date, expiry_date, min_order_qty, pack_qty, synced_at
		FROM edi_catalog_entries WHERE partner_id = $1
		ORDER BY vendor_sku ASC LIMIT $2`, partnerID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []CatalogEntry
	for rows.Next() {
		var e CatalogEntry
		if err := rows.Scan(
			&e.ID, &e.PartnerID, &e.VendorSKU, &e.InternalProductID,
			&e.Description, &e.UnitCost, &e.UOM,
			&e.EffectiveDate, &e.ExpiryDate, &e.MinOrderQty, &e.PackQty, &e.SyncedAt,
		); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *EDIRepository) GetCatalogEntryCount(ctx context.Context, partnerID uuid.UUID) (int, error) {
	var count int
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT COUNT(*) FROM edi_catalog_entries WHERE partner_id = $1`, partnerID,
	).Scan(&count)
	return count, err
}
