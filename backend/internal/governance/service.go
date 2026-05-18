package governance

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type CreateRFCInput struct {
	Title            string
	ProblemStatement string
	ProposedSolution string
	AuthorID         *uuid.UUID
}

type UpdateRFCInput struct {
	Title            string
	Status           RFCStatus
	ProblemStatement string
	ProposedSolution string
	Content          string
}

type Service struct {
	repo Repository
	ai   AIProvider
}

func NewService(repo Repository, ai AIProvider) *Service {
	return &Service{repo: repo, ai: ai}
}

func (s *Service) DraftRFC(ctx context.Context, input CreateRFCInput) (*RFC, error) {
	rfc := &RFC{
		Title:            input.Title,
		ProblemStatement: input.ProblemStatement,
		ProposedSolution: input.ProposedSolution,
		AuthorID:         input.AuthorID,
		Status:           RFCStatusDraft,
	}

	content, err := s.ai.GenerateRFC(ctx, input.Title, input.ProblemStatement, input.ProposedSolution)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RFC content: %w", err)
	}
	rfc.Content = content

	if err := s.repo.CreateRFC(ctx, rfc); err != nil {
		return nil, err
	}
	return rfc, nil
}

func (s *Service) GetRFC(ctx context.Context, id uuid.UUID) (*RFC, error) {
	return s.repo.GetRFC(ctx, id)
}

func (s *Service) ListRFCs(ctx context.Context) ([]RFC, error) {
	return s.repo.ListRFCs(ctx)
}

func (s *Service) UpdateRFC(ctx context.Context, id uuid.UUID, input UpdateRFCInput) (*RFC, error) {
	rfc, err := s.repo.GetRFC(ctx, id)
	if err != nil {
		return nil, err
	}

	rfc.Title = input.Title
	rfc.Status = input.Status
	rfc.ProblemStatement = input.ProblemStatement
	rfc.ProposedSolution = input.ProposedSolution
	rfc.Content = input.Content

	if err := s.repo.UpdateRFC(ctx, rfc); err != nil {
		return nil, err
	}
	return rfc, nil
}
