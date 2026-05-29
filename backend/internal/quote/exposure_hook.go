package quote

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// SnapshotService is the pricing-side interface that fires when a quote
// transitions DRAFT → SENT. Implemented in internal/pricing; injected into
// quote.Service in cmd/server/main.go to avoid a quote → pricing dependency.
//
// SnapshotQuoteLines is best-effort: failures are logged but do not roll
// back the SEND state change, so a transient pricing-module issue can never
// block a salesperson from sending a quote.
type SnapshotService interface {
	SnapshotQuoteLines(ctx context.Context, quoteID uuid.UUID) error
}

// QuoteLineReader is the read-side projection the pricing snapshot service and
// scanner use. Kept narrow to avoid exposing the full quote.Repository to
// pricing.
type QuoteLineReader interface {
	GetQuoteWithLinesAndCustomer(ctx context.Context, quoteID uuid.UUID) (*QuoteForSnapshot, error)
	UpdateQuoteExposure(ctx context.Context, quoteID uuid.UUID, state string, dollars float64, lastCheckedAt time.Time) error
	UpdateLineUnitPrice(ctx context.Context, lineID uuid.UUID, newUnitPrice float64) error
	RecomputeQuoteTotal(ctx context.Context, quoteID uuid.UUID) error
}

// QuoteForSnapshot is the minimal projection of a quote that pricing needs
// at SEND time to snapshot exposure baselines.
type QuoteForSnapshot struct {
	ID             uuid.UUID
	ShortID        string
	CustomerID     uuid.UUID
	CustomerName   string
	SalespersonID  *uuid.UUID
	CustomerPolicy CustomerPolicyForSnapshot
	Lines          []QuoteLineForSnapshot
}

// CustomerPolicyForSnapshot is frozen into the snapshot row so later
// customer-policy changes don't retroactively rewrite exposure semantics.
type CustomerPolicyForSnapshot struct {
	Policy            string
	ThresholdPct      float64
	AgreementSignedAt *time.Time
	AgreementRef      string
}

// QuoteLineForSnapshot carries enough per-line context for pricing to resolve
// the index and write the price_escalators row.
type QuoteLineForSnapshot struct {
	ID            uuid.UUID
	ProductID     uuid.UUID
	SKU           string
	Quantity      float64
	UnitPrice     float64
	IsCommodity   bool
	MarketIndexID *uuid.UUID // resolved by the caller (product override or category default)
}
