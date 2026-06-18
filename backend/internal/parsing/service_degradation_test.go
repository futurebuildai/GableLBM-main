package parsing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gablelbm/gable/internal/ai"
)

// The parsing call-site must ALWAYS degrade silently to the rule-based fallback
// when AI is unavailable — it must never return an error (CLAUDE.md "degrade
// gracefully"). These guard the invariant per the degradation matrix.

func TestExtractItemsWithAI_NilClientFallsBack(t *testing.T) {
	s := NewService(&mockProductRepo{}, nil)
	items, err := s.ExtractItemsWithAI(context.Background(), []byte("anything"), "image/png")
	if err != nil {
		t.Fatalf("nil client must not error, got %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected rule-based fallback items, got none")
	}
}

func TestExtractItemsWithAI_UnconfiguredClientFallsBack(t *testing.T) {
	s := NewService(&mockProductRepo{}, ai.NewClient("")) // no key
	items, err := s.ExtractItemsWithAI(context.Background(), []byte("anything"), "image/png")
	if err != nil {
		t.Fatalf("unconfigured client must not error, got %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected rule-based fallback items, got none")
	}
}

// TestExtractItemsWithAI_MidCallFailureFallsBack is the riskiest path: AI is
// configured but the call fails mid-flight. The service must swallow the error
// and fall back to the rule-based list, not propagate it.
func TestExtractItemsWithAI_MidCallFailureFallsBack(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "upstream boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := ai.NewClient("test-key").WithBaseURL(srv.URL) // configured, but the call 500s
	s := NewService(&mockProductRepo{}, client)
	items, err := s.ExtractItemsWithAI(context.Background(), []byte("anything"), "image/png")
	if err != nil {
		t.Fatalf("mid-call failure must fall back silently, got %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected rule-based fallback items after AI failure, got none")
	}
}
