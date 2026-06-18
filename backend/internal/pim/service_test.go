package pim

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gablelbm/gable/internal/ai"
	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

// --- test doubles ---

type stubProductRepo struct{ p *product.Product }

func (r *stubProductRepo) CreateProduct(context.Context, *product.Product) error { return nil }
func (r *stubProductRepo) GetProduct(context.Context, uuid.UUID) (*product.Product, error) {
	return r.p, nil
}
func (r *stubProductRepo) ListProducts(context.Context) ([]product.Product, error) { return nil, nil }
func (r *stubProductRepo) ListProductsPaginated(context.Context, int, int) ([]product.Product, int, error) {
	return nil, 0, nil
}
func (r *stubProductRepo) ListBelowReorder(context.Context) ([]product.ReorderAlert, error) {
	return nil, nil
}
func (r *stubProductRepo) UpdateAverageCost(context.Context, uuid.UUID, float64) error { return nil }
func (r *stubProductRepo) UpdateMarginRules(context.Context, uuid.UUID, float64, float64) error {
	return nil
}
func (r *stubProductRepo) UpdateReorderTargets(context.Context, uuid.UUID, float64, float64) error {
	return nil
}
func (r *stubProductRepo) UpdateVendor(context.Context, uuid.UUID, *string, *uuid.UUID) error {
	return nil
}

type stubPIMRepo struct {
	createMediaErr error
	created        []*PIMMedia
}

func (r *stubPIMRepo) GetContent(context.Context, uuid.UUID) (*PIMContent, error)  { return nil, nil }
func (r *stubPIMRepo) UpsertContent(context.Context, *PIMContent) error            { return nil }
func (r *stubPIMRepo) ListMedia(context.Context, uuid.UUID) ([]PIMMedia, error)    { return nil, nil }
func (r *stubPIMRepo) DeleteMedia(context.Context, uuid.UUID) error               { return nil }
func (r *stubPIMRepo) SetPrimaryMedia(context.Context, uuid.UUID, uuid.UUID) error { return nil }
func (r *stubPIMRepo) ListCollateral(context.Context, uuid.UUID) ([]PIMCollateral, error) {
	return nil, nil
}
func (r *stubPIMRepo) CreateCollateral(context.Context, *PIMCollateral) error { return nil }
func (r *stubPIMRepo) DeleteCollateral(context.Context, uuid.UUID) error      { return nil }
func (r *stubPIMRepo) CreateMedia(_ context.Context, m *PIMMedia) error {
	if r.createMediaErr != nil {
		return r.createMediaErr
	}
	r.created = append(r.created, m)
	return nil
}

func newPIMTestService(repo Repository, client *ai.Client) *Service {
	prodSvc := product.NewService(&stubProductRepo{p: &product.Product{
		ID:          uuid.New(),
		SKU:         "2X4-8",
		Description: "2x4x8 SPF Stud",
		BasePrice:   4.25,
	}})
	s := NewService(repo, prodSvc)
	if client != nil {
		s.WithAI(client)
	}
	return s
}

// --- degradation: PIM hard-errors on every unavailable-AI path ---

func TestPIMGenerateDescriptions_NilAIHardError(t *testing.T) {
	s := newPIMTestService(&stubPIMRepo{}, nil) // WithAI never called
	if _, err := s.GenerateDescriptions(context.Background(), uuid.New(), "", ""); err == nil {
		t.Fatal("PIM must hard-error when the AI client is unconfigured")
	}
}

func TestPIMGenerateImage_NilAIHardError(t *testing.T) {
	s := newPIMTestService(&stubPIMRepo{}, nil)
	_, err := s.GenerateImage(context.Background(), uuid.New(), "", "")
	if err == nil || !strings.Contains(err.Error(), "no AI configured") {
		t.Fatalf("want hard 'no AI configured' error, got %v", err)
	}
}

func TestPIMGenerateImage_UnconfiguredHardError(t *testing.T) {
	s := newPIMTestService(&stubPIMRepo{}, ai.NewClient("")) // client present, no key
	if _, err := s.GenerateImage(context.Background(), uuid.New(), "", ""); err == nil {
		t.Fatal("unconfigured AI must hard-error (no silent degrade in PIM)")
	}
}

// --- image fallback scope (the over-broad-fallback fix) ---

// On an image-GENERATION failure, GenerateImage falls back to an SVG illustration
// (text model) and persists it.
func TestPIMGenerateImage_FallsBackToSVGOnGenFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := decodeBody(r)
		if _, isImage := body["modalities"]; isImage {
			// Image request → return no image data, forcing a generation error.
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []any{map[string]any{"message": map[string]any{"content": "no image"}}},
			})
			return
		}
		// Text request (the SVG fallback) → return valid SVG markup.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"content": `<svg viewBox="0 0 400 400" width="400" height="400"></svg>`,
			}}},
		})
	}))
	defer srv.Close()

	repo := &stubPIMRepo{}
	s := newPIMTestService(repo, ai.NewClient("k").WithBaseURL(srv.URL))
	media, err := s.GenerateImage(context.Background(), uuid.New(), "photographic", "")
	if err != nil {
		t.Fatalf("expected SVG fallback to succeed, got %v", err)
	}
	if !strings.HasPrefix(media.URL, "data:image/svg+xml;base64,") {
		t.Errorf("expected an SVG data URI, got %.40q", media.URL)
	}
	if len(repo.created) != 1 {
		t.Errorf("expected exactly 1 media persisted, got %d", len(repo.created))
	}
}

// A persistence failure AFTER a successful generation must surface as a real
// error — it must NOT fall back to the SVG path (which would discard the
// generated image and mask the DB error, and fire a second AI request).
func TestPIMGenerateImage_DBFailureDoesNotFallBack(t *testing.T) {
	var reqCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&reqCount, 1)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"images": []any{map[string]any{"image_url": map[string]any{"url": "data:image/png;base64,AAAA"}}},
			}}},
		})
	}))
	defer srv.Close()

	repo := &stubPIMRepo{createMediaErr: errors.New("db down")}
	s := newPIMTestService(repo, ai.NewClient("k").WithBaseURL(srv.URL))
	_, err := s.GenerateImage(context.Background(), uuid.New(), "", "")
	if err == nil || !strings.Contains(err.Error(), "save media") {
		t.Fatalf("DB write failure must surface, got %v", err)
	}
	if got := atomic.LoadInt32(&reqCount); got != 1 {
		t.Errorf("expected exactly 1 AI request (no SVG fallback), got %d", got)
	}
}

func decodeBody(r *http.Request) map[string]any {
	var body map[string]any
	raw, _ := io.ReadAll(r.Body)
	_ = json.Unmarshal(raw, &body)
	return body
}
