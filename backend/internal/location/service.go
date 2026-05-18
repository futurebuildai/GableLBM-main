package location

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// CreateLocation validates and persists a new location. Branch rows must be
// root-level (no parent) and carry a Name; physical sub-locations must have a
// parent so the trigger can derive their branch_id.
func (s *Service) CreateLocation(ctx context.Context, loc *Location) error {
	if loc.Code == "" {
		return fmt.Errorf("location code is required")
	}
	if loc.Type == "" {
		return fmt.Errorf("location type is required")
	}

	if loc.Type == LocTypeBranch {
		if loc.ParentID != nil {
			return fmt.Errorf("branch locations must be root-level (parent_id must be empty)")
		}
		if loc.Name == "" {
			return fmt.Errorf("branch name is required")
		}
		if loc.Path == "" {
			loc.Path = loc.Name
		}
	} else if loc.ParentID == nil {
		return fmt.Errorf("non-branch locations require a parent_id")
	}

	// Default active=true unless explicitly false.
	if !loc.Active {
		loc.Active = true
	}

	return s.repo.CreateLocation(ctx, loc)
}

// UpdateLocation persists edits to a location. Type and parent_id are not
// mutable here; create a new row instead.
func (s *Service) UpdateLocation(ctx context.Context, loc *Location) error {
	if loc.ID == uuid.Nil {
		return fmt.Errorf("location id is required")
	}
	if loc.Code == "" {
		return fmt.Errorf("location code is required")
	}
	return s.repo.UpdateLocation(ctx, loc)
}

func (s *Service) DeleteLocation(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteLocation(ctx, id)
}

func (s *Service) GetLocation(ctx context.Context, id uuid.UUID) (*Location, error) {
	return s.repo.GetLocation(ctx, id)
}

func (s *Service) ListLocations(ctx context.Context) ([]Location, error) {
	return s.repo.ListLocations(ctx)
}

func (s *Service) ListBranches(ctx context.Context, includeInactive bool) ([]Location, error) {
	return s.repo.ListBranches(ctx, includeInactive)
}

func (s *Service) GetBranchTree(ctx context.Context, branchID uuid.UUID) ([]Location, error) {
	return s.repo.GetBranchTree(ctx, branchID)
}

func (s *Service) IsBranch(ctx context.Context, id uuid.UUID) (bool, error) {
	return s.repo.IsBranch(ctx, id)
}
