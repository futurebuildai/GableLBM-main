package parsing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gablelbm/gable/internal/ai"
)

// The parsing call-site must ALWAYS degrade silently to the rule-based fallback
// when AI is unavailable — it must never return an error (CLAUDE.md "degrade
// gracefully"). These guard the invariant per the degradation matrix.

// assertFallback verifies the result came from the rule-based fallback list (not
// the AI path and not the raw input), keyed on a marker unique to that list so the
// assertion is falsifiable rather than a bare len>0.
func assertFallback(t *testing.T, items []extractedLine, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("AI unavailable must not error (silent fallback), got %v", err)
	}
	for _, it := range items {
		if strings.Contains(it.rawText, "SPF Stud") {
			return
		}
	}
	t.Fatalf("expected the rule-based fallback list (marker %q), got %d items: %+v", "SPF Stud", len(items), items)
}

func TestExtractItemsWithAI_NilClientFallsBack(t *testing.T) {
	s := NewService(&mockProductRepo{}, nil)
	items, err := s.ExtractItemsWithAI(context.Background(), []byte("anything"), "image/png")
	assertFallback(t, items, err)
}

func TestExtractItemsWithAI_UnconfiguredClientFallsBack(t *testing.T) {
	s := NewService(&mockProductRepo{}, ai.NewClient("")) // no key
	items, err := s.ExtractItemsWithAI(context.Background(), []byte("anything"), "image/png")
	assertFallback(t, items, err)
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
	assertFallback(t, items, err)
}
