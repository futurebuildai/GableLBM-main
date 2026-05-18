package pricing

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type RebateService interface {
	CreateProgramWithTiers(ctx context.Context, p *RebateProgram, tiers []RebateTier) (*RebateProgram, error)
	GetProgramWithTiers(ctx context.Context, id uuid.UUID) (*RebateProgram, error)
	ListPrograms(ctx context.Context, vendorID *uuid.UUID) ([]RebateProgram, error)

	// In a real application, CalculateClaim would query purchase orders
	// or vendor invoices matching the vendor_id and date range to sum
	// qualifying volume, then map that volume against tiers to compute rebate.
	CalculateClaim(ctx context.Context, programID uuid.UUID, periodStart, periodEnd time.Time, mockVolume int64) (*RebateClaim, error)
	ListClaims(ctx context.Context, programID *uuid.UUID) ([]RebateClaim, error)
}

type rebateService struct {
	repo RebateRepository
}

func NewRebateService(repo RebateRepository) RebateService {
	return &rebateService{repo: repo}
}

func (s *rebateService) CreateProgramWithTiers(ctx context.Context, p *RebateProgram, tiers []RebateTier) (*RebateProgram, error) {
	if err := s.repo.CreateProgram(ctx, p); err != nil {
		return nil, fmt.Errorf("creating program: %w", err)
	}
	if len(tiers) > 0 {
		if err := s.repo.CreateTiers(ctx, p.ID, tiers); err != nil {
			return nil, fmt.Errorf("creating tiers: %w", err)
		}
	}

	// Reload to get complete data
	return s.GetProgramWithTiers(ctx, p.ID)
}

func (s *rebateService) GetProgramWithTiers(ctx context.Context, id uuid.UUID) (*RebateProgram, error) {
	prog, err := s.repo.GetProgram(ctx, id)
	if err != nil {
		return nil, err
	}
	if prog == nil {
		return nil, nil
	}

	tiers, err := s.repo.GetTiersByProgram(ctx, id)
	if err != nil {
		return nil, err
	}
	prog.Tiers = tiers
	return prog, nil
}

func (s *rebateService) ListPrograms(ctx context.Context, vendorID *uuid.UUID) ([]RebateProgram, error) {
	progs, err := s.repo.ListPrograms(ctx, vendorID)
	if err != nil {
		return nil, err
	}

	// Populate tiers for each program for a complete view
	for i := range progs {
		tiers, err := s.repo.GetTiersByProgram(ctx, progs[i].ID)
		if err == nil {
			progs[i].Tiers = tiers
		}
	}

	return progs, nil
}

func (s *rebateService) CalculateClaim(ctx context.Context, programID uuid.UUID, periodStart, periodEnd time.Time, mockVolume int64) (*RebateClaim, error) {
	prog, err := s.GetProgramWithTiers(ctx, programID)
	if err != nil {
		return nil, err
	}
	if prog == nil {
		return nil, fmt.Errorf("program not found")
	}

	// 1. Calculate Qualifying Volume
	// NOTE: In production, we'd query: `SELECT SUM(total) FROM vendor_invoices WHERE vendor_id=? AND invoice_date >= ? AND invoice_date <= ?`
	// Since we don't have the vendor invoice table linked here directly, we accept `mockVolume` for testing logic.
	actualVolume := mockVolume

	// 2. Find correct RebateTier
	applicableRebatePct := 0.0
	for _, tier := range prog.Tiers {
		if actualVolume >= tier.MinVolume && (tier.MaxVolume == nil || actualVolume <= *tier.MaxVolume) {
			applicableRebatePct = tier.RebatePct
			// Could break here, depending on if it's retrospective vs progressive tiering
		}
	}

	// 3. Compute RebateAmount (volume * pct). Convert pct to multiplier (e.g., 0.05 for 5%)
	rebateAmountFloat := float64(actualVolume) * applicableRebatePct
	rebateAmount := int64(rebateAmountFloat)

	// 4. Create Claim Record
	claim := &RebateClaim{
		ProgramID:        prog.ID,
		PeriodStart:      periodStart,
		PeriodEnd:        periodEnd,
		QualifyingVolume: actualVolume,
		RebateAmount:     rebateAmount,
		Status:           "CALCULATED",
	}

	if err := s.repo.CreateClaim(ctx, claim); err != nil {
		return nil, err
	}

	return claim, nil
}

func (s *rebateService) ListClaims(ctx context.Context, programID *uuid.UUID) ([]RebateClaim, error) {
	return s.repo.ListClaims(ctx, programID)
}
