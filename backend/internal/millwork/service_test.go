package millwork_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gablelbm/gable/internal/config"
	"github.com/gablelbm/gable/internal/millwork"
	"github.com/gablelbm/gable/pkg/database"
	// Start with testify if available, otherwise switch to stdlib
)

func TestMillworkService_Integration(t *testing.T) {
	// Skip if short mode (unit tests only)
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Load Config & Connect DB
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Configuration error: %v", err)
	}
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	// Setup Service
	repo := millwork.NewRepository(db)
	svc := millwork.NewService(repo)

	// Test Case 1: Create Option
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	category := "test_category"
	req := millwork.CreateOptionRequest{
		Category:        category,
		Name:            "Test Option 1",
		PriceAdjustment: 10.50,
		Attributes:      json.RawMessage(`{"width": 30}`),
	}

	opt, err := svc.CreateOption(ctx, req)
	if err != nil {
		t.Fatalf("Failed to create option: %v", err)
	}

	if opt.ID.String() == "" {
		t.Error(" expected ID to be generated")
	}
	if opt.Name != req.Name {
		t.Errorf("expected name %s, got %s", req.Name, opt.Name)
	}

	// Test Case 2: Get Options
	options, err := svc.GetOptionsByCategory(ctx, category)
	if err != nil {
		t.Fatalf("Failed to get options: %v", err)
	}

	found := false
	for _, o := range options {
		if o.ID == opt.ID {
			found = true
			break
		}
	}
	if !found {
		t.Error("Created option not found in category list")
	}

	// Cleanup (Optional)
	_, _ = db.Pool.Exec(ctx, "DELETE FROM millwork_options WHERE id = $1", opt.ID)
}
