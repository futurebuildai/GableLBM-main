package pricing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/gablelbm/gable/internal/quote"
	"github.com/google/uuid"
)

// SnapshotService writes the per-line price_escalators rows at the moment a
// quote transitions DRAFT → SENT. It implements quote.SnapshotService and is
// injected into the quote service via SetSnapshotService in cmd/server/main.go.
//
// Behaviour:
//   - For every commodity-flagged line, resolve the market index (per-product
//     override, else nearest-ancestor category default).
//   - Lines without a resolvable index are skipped with a warn log — never an
//     error, so a single misconfigured SKU does not block the quote from
//     sending.
//   - Customer policy + threshold are frozen into policy_at_snapshot and
//     threshold_pct_at_snapshot. Later customer-policy changes never alter
//     already-sent quotes.
//   - Existing active escalator rows for the same lines are deactivated first,
//     so a quote re-send produces a clean baseline.
//   - The whole batch is inserted in a single transaction (atomic per quote).
type SnapshotService struct {
	escalators EscalatorRepository
	exposure   ExposureRepository
	quoteRepo  quote.QuoteLineReader
	logger     *slog.Logger
}

func NewSnapshotService(escalatorRepo EscalatorRepository, exposureRepo ExposureRepository, quoteRepo quote.QuoteLineReader, logger *slog.Logger) *SnapshotService {
	if logger == nil {
		logger = slog.Default()
	}
	return &SnapshotService{
		escalators: escalatorRepo,
		exposure:   exposureRepo,
		quoteRepo:  quoteRepo,
		logger:     logger,
	}
}

// SnapshotQuoteLines fetches the quote, walks every commodity line, resolves
// the index, and writes price_escalators rows. Then it resets the quote's
// denormalized exposure rollup to OK / 0 / now.
func (s *SnapshotService) SnapshotQuoteLines(ctx context.Context, quoteID uuid.UUID) error {
	q, err := s.quoteRepo.GetQuoteWithLinesAndCustomer(ctx, quoteID)
	if err != nil {
		return fmt.Errorf("snapshot: load quote: %w", err)
	}
	if q == nil {
		return fmt.Errorf("snapshot: quote %s not found", quoteID)
	}

	// Validate policy is one we know how to evaluate. Fall through to the
	// default safe policy (FLAG_FOR_REQUOTE) rather than refusing to send.
	policy := q.CustomerPolicy.Policy
	switch EscalationPolicy(policy) {
	case PolicyAutoEscalate, PolicyFlagForRequote, PolicyRequireAck:
		// ok
	default:
		s.logger.Warn("snapshot: unknown customer policy, defaulting to FLAG_FOR_REQUOTE",
			"quote_id", quoteID, "policy", policy)
		policy = string(PolicyFlagForRequote)
	}
	thresholdPct := q.CustomerPolicy.ThresholdPct
	if thresholdPct <= 0 {
		thresholdPct = 5.0
	}

	now := time.Now()
	var escalators []PriceEscalator
	skipped := 0

	for _, line := range q.Lines {
		if !line.IsCommodity {
			continue
		}

		// Resolve the index — per-product override wins, else category default.
		var indexID *uuid.UUID
		if line.MarketIndexID != nil {
			indexID = line.MarketIndexID
		} else {
			resolved, err := s.exposure.ResolveIndexForProduct(ctx, line.ProductID)
			if err != nil {
				s.logger.Warn("snapshot: resolve index failed; skipping line",
					"quote_id", quoteID, "line_id", line.ID, "product_id", line.ProductID, "err", err)
				skipped++
				continue
			}
			indexID = resolved
		}
		if indexID == nil {
			s.logger.Info("snapshot: no index resolvable for commodity line; skipping",
				"quote_id", quoteID, "line_id", line.ID, "sku", line.SKU)
			skipped++
			continue
		}

		// Fetch the current value of the resolved index.
		idx, err := s.escalators.GetMarketIndex(ctx, *indexID)
		if err != nil {
			s.logger.Warn("snapshot: fetch market index failed; skipping line",
				"quote_id", quoteID, "line_id", line.ID, "index_id", *indexID, "err", err)
			skipped++
			continue
		}
		if idx == nil || !idx.IsActive {
			s.logger.Info("snapshot: resolved index missing or inactive; skipping",
				"quote_id", quoteID, "line_id", line.ID, "index_id", *indexID)
			skipped++
			continue
		}

		baseIndex := idx.CurrentValue
		recordedAt := now
		lineID := line.ID
		escalators = append(escalators, PriceEscalator{
			QuoteLineID:            &lineID,
			MarketIndexID:          indexID,
			EscalationType:         EscalationIndexDelta,
			EscalationRate:         0,
			BasePrice:              line.UnitPrice,
			BaseIndexValue:         &baseIndex,
			BaseIndexRecordedAt:    &recordedAt,
			CurrentState:           string(ExposureStateOK),
			PolicyAtSnapshot:       policy,
			ThresholdPctAtSnapshot: thresholdPct,
			EffectiveDate:          now,
			ExpirationDate:         now.AddDate(0, 1, 0), // legacy field; default 1 month — actual policy controls behaviour
			IsActive:               true,
		})

		// Deactivate any prior escalator rows on this line so the new snapshot
		// becomes the sole active baseline.
		if err := s.exposure.DeactivateEscalatorsForLine(ctx, lineID); err != nil {
			return fmt.Errorf("snapshot: deactivate prior escalators: %w", err)
		}
	}

	if len(escalators) > 0 {
		if err := s.escalators.SnapshotEscalators(ctx, escalators); err != nil {
			return fmt.Errorf("snapshot: insert escalators: %w", err)
		}
	}

	if err := s.quoteRepo.UpdateQuoteExposure(ctx, quoteID, string(ExposureStateOK), 0, now); err != nil {
		return fmt.Errorf("snapshot: update quote exposure rollup: %w", err)
	}

	s.logger.Info("snapshot: quote snapshotted",
		"quote_id", quoteID,
		"escalators_written", len(escalators),
		"lines_skipped", skipped,
	)
	return nil
}

// ErrSnapshotIncomplete is returned by the quote service if it wants to
// distinguish a partial snapshot from a fatal one. Currently unused; kept here
// for future expansion.
var ErrSnapshotIncomplete = errors.New("snapshot incomplete")
