package millwork

import (
	"context"

	"github.com/google/uuid"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) CreateOption(ctx context.Context, req CreateOptionRequest) (*MillworkOption, error) {
	opt := &MillworkOption{
		ID:              uuid.New(),
		Category:        req.Category,
		Name:            req.Name,
		PriceAdjustment: req.PriceAdjustment,
		Attributes:      req.Attributes,
	}

	if err := s.repo.CreateOption(ctx, opt); err != nil {
		return nil, err
	}
	return opt, nil
}

func (s *Service) GetOptionsByCategory(ctx context.Context, category string) ([]MillworkOption, error) {
	return s.repo.GetOptionsByCategory(ctx, category)
}
