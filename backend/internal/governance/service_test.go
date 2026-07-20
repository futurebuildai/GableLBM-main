package governance

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// fakeRepo is an in-memory Repository for unit tests (no DB required).
type fakeRepo struct {
	rfcs map[uuid.UUID]*RFC
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{rfcs: map[uuid.UUID]*RFC{}}
}

func (f *fakeRepo) CreateRFC(_ context.Context, rfc *RFC) error {
	if rfc.ID == uuid.Nil {
		rfc.ID = uuid.New()
	}
	cp := *rfc
	f.rfcs[rfc.ID] = &cp
	return nil
}

func (f *fakeRepo) GetRFC(_ context.Context, id uuid.UUID) (*RFC, error) {
	cp := *f.rfcs[id]
	return &cp, nil
}

func (f *fakeRepo) ListRFCs(_ context.Context) ([]RFC, error) {
	out := make([]RFC, 0, len(f.rfcs))
	for _, r := range f.rfcs {
		out = append(out, *r)
	}
	return out, nil
}

func (f *fakeRepo) UpdateRFC(_ context.Context, rfc *RFC) error {
	cp := *rfc
	f.rfcs[rfc.ID] = &cp
	return nil
}

func TestDraftRFC_GeneratesContentAndPersistsDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, NewTemplateAIProvider())

	rfc, err := svc.DraftRFC(context.Background(), CreateRFCInput{
		Title:            "Add will-call pickup workflow",
		ProblemStatement: "Orders have no pickup path distinct from delivery.",
		ProposedSolution: "Introduce will_call_tickets and a READY_FOR_PICKUP status.",
	})
	if err != nil {
		t.Fatalf("DraftRFC: %v", err)
	}
	if rfc.Status != RFCStatusDraft {
		t.Fatalf("want status draft, got %s", rfc.Status)
	}
	if rfc.Content == "" {
		t.Fatal("want AI-generated content, got empty string")
	}
	if rfc.ID == uuid.Nil {
		t.Fatal("want persisted ID, got nil UUID")
	}
	listed, err := svc.ListRFCs(context.Background())
	if err != nil || len(listed) != 1 {
		t.Fatalf("want 1 listed RFC, got %d (err=%v)", len(listed), err)
	}
}

func TestUpdateRFC_TransitionsStatus(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, NewTemplateAIProvider())
	rfc, err := svc.DraftRFC(context.Background(), CreateRFCInput{Title: "T", ProblemStatement: "P", ProposedSolution: "S"})
	if err != nil {
		t.Fatalf("DraftRFC: %v", err)
	}

	updated, err := svc.UpdateRFC(context.Background(), rfc.ID, UpdateRFCInput{
		Title:            rfc.Title,
		Status:           RFCStatusReview,
		ProblemStatement: rfc.ProblemStatement,
		ProposedSolution: rfc.ProposedSolution,
		Content:          rfc.Content,
	})
	if err != nil {
		t.Fatalf("UpdateRFC: %v", err)
	}
	if updated.Status != RFCStatusReview {
		t.Fatalf("want status review, got %s", updated.Status)
	}
}
