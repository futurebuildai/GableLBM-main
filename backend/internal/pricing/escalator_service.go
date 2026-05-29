package pricing

import (
	"context"
	"math"
	"time"

	"github.com/google/uuid"
)

// defaultStalenessThresholdPct is the fallback index-movement threshold (in
// percent) used to flag a locked-in price as stale when no per-quote snapshot
// threshold applies. Historically hardcoded at 2%.
const defaultStalenessThresholdPct = 2.0

// EscalatorService handles price escalation calculations and staleness detection.
type EscalatorService struct {
	repo EscalatorRepository
	// stalenessThresholdPct overrides the default 2% movement threshold. The
	// price-protection feature freezes a per-quote threshold at send time; this
	// service-level value is the system default for ad-hoc staleness checks.
	stalenessThresholdPct float64
}

// NewEscalatorService creates a new escalator service.
func NewEscalatorService(repo EscalatorRepository) *EscalatorService {
	return &EscalatorService{repo: repo, stalenessThresholdPct: defaultStalenessThresholdPct}
}

// WithStalenessThreshold overrides the default staleness threshold (percent).
// Values <= 0 are ignored so callers can pass an unset system_settings value
// without disabling staleness detection.
func (s *EscalatorService) WithStalenessThreshold(pct float64) *EscalatorService {
	if pct > 0 {
		s.stalenessThresholdPct = pct
	}
	return s
}

// thresholdPct returns the effective staleness threshold, guarding against a
// zero-valued struct (e.g. constructed without NewEscalatorService).
func (s *EscalatorService) thresholdPct() float64 {
	if s.stalenessThresholdPct > 0 {
		return s.stalenessThresholdPct
	}
	return defaultStalenessThresholdPct
}

// CalculateEscalation computes a future price based on escalation parameters.
func (s *EscalatorService) CalculateEscalation(ctx context.Context, req EscalationRequest) (EscalationResult, error) {
	effectiveDate, err := time.Parse("2006-01-02", req.EffectiveDate)
	if err != nil {
		return EscalationResult{}, err
	}

	targetDate, err := time.Parse("2006-01-02", req.TargetDate)
	if err != nil {
		return EscalationResult{}, err
	}

	result := EscalationResult{
		BasePrice:      req.BasePrice,
		EscalationType: string(req.EscalationType),
	}

	// Check expiration: if target is before effective, return base price
	if targetDate.Before(effectiveDate) || targetDate.Equal(effectiveDate) {
		result.FuturePrice = req.BasePrice
		result.IsExpired = false
		return result, nil
	}

	// Calculate months between effective and target date
	months := monthsBetween(effectiveDate, targetDate)
	result.MonthsOut = months

	switch req.EscalationType {
	case EscalationPercentage:
		// Compound: basePrice * (1 + rate/100) ^ months
		rate := req.EscalationRate / 100.0
		multiplier := math.Pow(1+rate, float64(months))
		result.FuturePrice = math.Round(req.BasePrice*multiplier*100) / 100
		result.PriceDelta = math.Round((result.FuturePrice-req.BasePrice)*100) / 100
		if req.BasePrice > 0 {
			result.DeltaPercent = math.Round((result.PriceDelta/req.BasePrice)*10000) / 100
		}

	case EscalationIndexDelta:
		// Index-based: basePrice * (currentIndex / baseIndex)
		if req.MarketIndexID != nil {
			idx, idxErr := s.repo.GetMarketIndex(ctx, *req.MarketIndexID)
			if idxErr != nil {
				return EscalationResult{}, idxErr
			}
			if idx != nil {
				currentIndex := idx.CurrentValue
				baseIndex := req.EscalationRate // Rate field used as base index value for INDEX_DELTA
				if baseIndex > 0 {
					multiplier := currentIndex / baseIndex
					result.FuturePrice = math.Round(req.BasePrice*multiplier*100) / 100
					result.CurrentIndex = &currentIndex
					result.BaseIndex = &baseIndex
				} else {
					result.FuturePrice = req.BasePrice
				}
				result.PriceDelta = math.Round((result.FuturePrice-req.BasePrice)*100) / 100
				if req.BasePrice > 0 {
					result.DeltaPercent = math.Round((result.PriceDelta/req.BasePrice)*10000) / 100
				}

				// Staleness detection: if index has moved beyond the configured
				// threshold from when the price was set.
				if idx.PreviousValue != nil && *idx.PreviousValue > 0 {
					indexDelta := math.Abs(currentIndex-*idx.PreviousValue) / *idx.PreviousValue * 100
					if indexDelta > s.thresholdPct() {
						result.IsStale = true
						result.StaleDeltaPct = math.Round(indexDelta*100) / 100
					}
				}
			}
		}

	default:
		result.FuturePrice = req.BasePrice
	}

	return result, nil
}

// CheckStaleness compares a locked-in price against the current market index.
func (s *EscalatorService) CheckStaleness(ctx context.Context, baseIndexValue float64, marketIndexID uuid.UUID) (bool, float64, error) {
	idx, err := s.repo.GetMarketIndex(ctx, marketIndexID)
	if err != nil {
		return false, 0, err
	}
	if idx == nil || baseIndexValue <= 0 {
		return false, 0, nil
	}

	// Calculate delta between current index and the base index value
	indexDeltaPct := (idx.CurrentValue - baseIndexValue) / baseIndexValue * 100
	isStale := math.Abs(indexDeltaPct) > s.thresholdPct() // movement beyond threshold = stale

	return isStale, math.Round(indexDeltaPct*100) / 100, nil
}

// ListMarketIndices returns all market indices.
func (s *EscalatorService) ListMarketIndices(ctx context.Context) ([]MarketIndex, error) {
	return s.repo.ListMarketIndices(ctx)
}

// RefreshMarketIndex simulates a mock index update (adds random fluctuation).
func (s *EscalatorService) RefreshMarketIndex(ctx context.Context, idx *MarketIndex, newValue float64) error {
	prev := idx.CurrentValue
	idx.PreviousValue = &prev
	idx.CurrentValue = newValue
	return s.repo.UpdateMarketIndex(ctx, idx)
}

// monthsBetween calculates the number of months between two dates.
func monthsBetween(start, end time.Time) int {
	years := end.Year() - start.Year()
	months := int(end.Month()) - int(start.Month())
	total := years*12 + months
	if total < 0 {
		return 0
	}
	return total
}
