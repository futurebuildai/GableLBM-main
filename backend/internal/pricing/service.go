package pricing

import (
	"context"
	"fmt"
	"math"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/google/uuid"
)

type Service struct {
	repo   Repository
	catSvc *CategoryPricingService
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// WithCategoryPricing enables the category-aware pricing engine.
// When set, step 5 of the waterfall uses category rules instead of hardcoded tier multipliers.
func (s *Service) WithCategoryPricing(catSvc *CategoryPricingService) {
	s.catSvc = catSvc
}

// CalculatePrice implements a 6-level pricing waterfall:
// 1. Contract Price (SKU + Customer specific)
// 2. Job-Level Override (project-specific pricing)
// 3. Promotional/Sale Price (time-bound)
// 4. Quantity Break (volume discount)
// 5. Customer Price Level/Tier
// 6. Base Retail
func (s *Service) CalculatePrice(ctx context.Context, cust *customer.Customer, productID uuid.UUID, basePrice float64) (CalculatedPrice, error) {
	return s.CalculatePriceWithQty(ctx, cust, productID, basePrice, 1, nil)
}

func (s *Service) CalculatePriceWithQty(ctx context.Context, cust *customer.Customer, productID uuid.UUID, basePrice float64, quantity float64, jobID *uuid.UUID) (CalculatedPrice, error) {
	// 1. Check Contract Price (highest priority - specific customer+product agreement)
	contract, err := s.repo.GetContract(ctx, cust.ID, productID)
	if err != nil {
		return CalculatedPrice{}, err
	}
	if contract != nil {
		discountPct := 0.0
		if basePrice > 0 {
			discountPct = (basePrice - contract.ContractPrice) / basePrice * 100
		}
		return CalculatedPrice{
			ProductID:     productID,
			OriginalPrice: basePrice,
			FinalPrice:    contract.ContractPrice,
			DiscountPct:   math.Round(discountPct*100) / 100,
			Source:        SourceContract,
			Details:       "Specific Contract Price",
		}, nil
	}

	// 2-4. Check pricing rules (job override, promotional, quantity break)
	custID := &cust.ID
	rules, err := s.repo.GetMatchingRules(ctx, productID, custID, jobID, quantity)
	if err != nil {
		// Rules table may not exist yet - fall through to tier pricing
		rules = nil
	}

	for _, rule := range rules {
		finalPrice := basePrice
		source := SourceRetail
		details := rule.Name

		switch rule.RuleType {
		case RuleTypeJobOverride:
			source = SourceJobOverride
		case RuleTypePromotional:
			source = SourcePromotional
		case RuleTypeQuantityBreak:
			source = SourceQuantityBreak
		}

		// Apply the rule's pricing adjustment
		if rule.FixedPrice != nil {
			finalPrice = *rule.FixedPrice
		} else if rule.DiscountPct != nil {
			finalPrice = basePrice * (1 - *rule.DiscountPct/100)
		} else if rule.MarkupPct != nil {
			finalPrice = basePrice * (1 + *rule.MarkupPct/100)
		} else {
			continue // No pricing action defined
		}

		// Margin floor protection
		if rule.MarginFloorPct != nil && basePrice > 0 {
			minPrice := basePrice * (1 - *rule.MarginFloorPct/100)
			if finalPrice < minPrice {
				finalPrice = minPrice
				details = fmt.Sprintf("%s (margin floor applied)", details)
			}
		}

		discountPct := 0.0
		if basePrice > 0 {
			discountPct = (basePrice - finalPrice) / basePrice * 100
		}

		return CalculatedPrice{
			ProductID:     productID,
			OriginalPrice: basePrice,
			FinalPrice:    math.Round(finalPrice*100) / 100,
			DiscountPct:   math.Round(discountPct*100) / 100,
			Source:        source,
			Details:       details,
		}, nil
	}

	// 5a. Check Category-Based Pricing (if enabled)
	if s.catSvc != nil {
		resolved, catErr := s.catSvc.ResolveEffectivePrice(ctx, cust.ID, string(cust.Tier), productID)
		if catErr == nil && resolved != nil && resolved.Rule != nil {
			finalPrice := s.catSvc.ApplyRule(resolved.Rule, basePrice, resolved.CostPrice)

			// Margin floor protection
			if resolved.Rule.MarginFloorPct != nil && basePrice > 0 {
				minPrice := basePrice * (1 - *resolved.Rule.MarginFloorPct/100)
				if finalPrice < minPrice {
					finalPrice = minPrice
				}
			}

			discountPct := 0.0
			if basePrice > 0 {
				discountPct = (basePrice - finalPrice) / basePrice * 100
			}

			catSource := SourceCategoryTier
			if resolved.Rule.TargetType == TargetTypeAccount {
				catSource = SourceCategoryAccount
			}

			return CalculatedPrice{
				ProductID:     productID,
				OriginalPrice: basePrice,
				FinalPrice:    math.Round(finalPrice*100) / 100,
				DiscountPct:   math.Round(discountPct*100) / 100,
				Source:        catSource,
				Details:       fmt.Sprintf("%s (%s)", resolved.Rule.CategoryName, resolved.MatchType),
			}, nil
		}
	}

	// 5b. Check Price Level (Tier) — hardcoded fallback when category pricing is disabled or no rule matches
	multiplier := 1.0
	details := ""
	source := SourceRetail

	if cust.PriceLevel != nil {
		multiplier = cust.PriceLevel.Multiplier
		details = fmt.Sprintf("%s (Level)", cust.PriceLevel.Name)
		source = SourceTier
	} else if cust.Tier != "" && cust.Tier != customer.TierRetail {
		switch cust.Tier {
		case customer.TierSilver:
			multiplier = 0.90
			details = "Silver Tier (10%)"
		case customer.TierGold:
			multiplier = 0.85
			details = "Gold Tier (15%)"
		case customer.TierPlatinum:
			multiplier = 0.80
			details = "Platinum Tier (20%)"
		}
		if multiplier < 1.0 {
			source = SourceTier
		}
	}

	if source == SourceTier {
		final := basePrice * multiplier
		discountPct := (1 - multiplier) * 100
		return CalculatedPrice{
			ProductID:     productID,
			OriginalPrice: basePrice,
			FinalPrice:    final,
			DiscountPct:   math.Round(discountPct*100) / 100,
			Source:        SourceTier,
			Details:       details,
		}, nil
	}

	// 6. Retail
	return CalculatedPrice{
		ProductID:     productID,
		OriginalPrice: basePrice,
		FinalPrice:    basePrice,
		DiscountPct:   0,
		Source:        SourceRetail,
		Details:       "Base Retail Price",
	}, nil
}

func (s *Service) CreateRule(ctx context.Context, rule *PricingRule) error {
	return s.repo.CreateRule(ctx, rule)
}

func (s *Service) ListRules(ctx context.Context) ([]PricingRule, error) {
	return s.repo.ListRules(ctx)
}
