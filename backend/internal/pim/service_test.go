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
	updates        []mediaUpdate
}

type mediaUpdate struct {
	id                 uuid.UUID
	url, model, status string
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
	if m.ID == (uuid.UUID{}) {
		m.ID = uuid.New()
	}
	r.created = append(r.created, m)
	return nil
}

func (r *stubPIMRepo) UpdateMediaResult(_ context.Context, id uuid.UUID, url, genModel, _, status string) error {
	r.updates = append(r.updates, mediaUpdate{id: id, url: url, model: genModel, status: status})
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

// --- async generation: the background worker finalizes the placeholder row ---
// generateImageAsync is exercised directly (synchronously) so the assertions are
// deterministic and race-free; in production it runs on a detached goroutine.

var testProduct = &product.Product{Description: "2x4x8 SPF Stud", SKU: "2X4-8", BasePrice: 4.25}

// On an image-GENERATION failure, the worker falls back to an SVG illustration
// (text model) and finalizes the row 'ready' with the SVG data URI.
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
		// Text request (the SVG fallback) → return valid SVG markup with a model echo.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "text-svg-sentinel",
			"choices": []any{map[string]any{"message": map[string]any{
				"content": `<svg viewBox="0 0 400 400" width="400" height="400"></svg>`,
			}}},
		})
	}))
	defer srv.Close()

	repo := &stubPIMRepo{}
	s := newPIMTestService(repo, ai.NewClient("k").WithBaseURL(srv.URL))
	s.generateImageAsync(uuid.New(), testProduct, "photographic", "")

	if len(repo.updates) != 1 {
		t.Fatalf("expected exactly 1 media finalize, got %d", len(repo.updates))
	}
	u := repo.updates[0]
	if u.status != "ready" {
		t.Errorf("status = %q, want ready", u.status)
	}
	if !strings.HasPrefix(u.url, "data:image/svg+xml;base64,") {
		t.Errorf("expected an SVG data URI, got %.40q", u.url)
	}
	if u.model != "text-svg-sentinel" {
		t.Errorf("SVG fallback model = %q, want the echoed text slug", u.model)
	}
}

// Pins invariant #4 at the PIM layer: the worker finalizes the row with the slug
// the image model actually returned (a sentinel distinct from any default so the
// assertion can't pass tautologically), status 'ready'.
func TestPIMGenerateImage_FinalizesWithReturnedModelSlug(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "black-forest-labs/flux:pim-sentinel",
			"choices": []any{map[string]any{"message": map[string]any{
				"images": []any{map[string]any{"image_url": map[string]any{"url": "data:image/png;base64,AAAA"}}},
			}}},
		})
	}))
	defer srv.Close()

	repo := &stubPIMRepo{}
	s := newPIMTestService(repo, ai.NewClient("k").WithBaseURL(srv.URL))
	s.generateImageAsync(uuid.New(), testProduct, "", "")

	if len(repo.updates) != 1 {
		t.Fatalf("expected exactly 1 media finalize, got %d", len(repo.updates))
	}
	if repo.updates[0].model != "black-forest-labs/flux:pim-sentinel" {
		t.Errorf("finalized model = %q, want the echoed slug", repo.updates[0].model)
	}
	if repo.updates[0].status != "ready" {
		t.Errorf("status = %q, want ready", repo.updates[0].status)
	}
}

// GenerateImage returns a 'generating' placeholder immediately (the async win) and
// hard-errors synchronously WITHOUT starting background generation if the
// placeholder insert fails (no wasted AI request).
func TestPIMGenerateImage_PlaceholderInsertFailureSurfaces(t *testing.T) {
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
	if _, err := s.GenerateImage(context.Background(), uuid.New(), "", ""); err == nil || !strings.Contains(err.Error(), "save media") {
		t.Fatalf("placeholder insert failure must surface, got %v", err)
	}
	if got := atomic.LoadInt32(&reqCount); got != 0 {
		t.Errorf("expected 0 AI requests when the placeholder insert fails, got %d", got)
	}
}

func decodeBody(r *http.Request) map[string]any {
	var body map[string]any
	raw, _ := io.ReadAll(r.Body)
	_ = json.Unmarshal(raw, &body)
	return body
}
