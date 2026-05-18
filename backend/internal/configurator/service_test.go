package configurator_test

import (
	"context"
	"testing"
	"time"

	"github.com/gablelbm/gable/internal/config"
	"github.com/gablelbm/gable/internal/configurator"
	"github.com/gablelbm/gable/pkg/database"
)

func TestConfiguratorService_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Configuration error: %v", err)
	}
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	repo := configurator.NewRepository(db)
	svc := configurator.NewService(repo)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Test 1: Get all rules (should have seed data)
	t.Run("GetAllRules", func(t *testing.T) {
		rules, err := svc.GetAllRules(ctx)
		if err != nil {
			t.Fatalf("Failed to get rules: %v", err)
		}
		if len(rules) == 0 {
			t.Error("Expected seed rules to exist, got 0")
		}
		t.Logf("Found %d configurator rules", len(rules))
	})

	// Test 2: Valid SYP + Treatable combination
	t.Run("ValidConfig_SYP_Treatable", func(t *testing.T) {
		resp, err := svc.ValidateConfig(ctx, configurator.ValidateConfigRequest{
			Selections: map[string]string{
				"Species":   "SYP",
				"Treatment": "Treatable",
				"Grade":     "#2",
			},
		})
		if err != nil {
			t.Fatalf("Validation failed: %v", err)
		}
		if !resp.Valid {
			t.Errorf("Expected SYP + Treatable + #2 to be valid, got conflicts: %+v", resp.Conflicts)
		}
	})

	// Test 3: Invalid Douglas Fir + Treatable combination
	t.Run("InvalidConfig_DougFir_Treatable", func(t *testing.T) {
		resp, err := svc.ValidateConfig(ctx, configurator.ValidateConfigRequest{
			Selections: map[string]string{
				"Species":   "Douglas Fir",
				"Treatment": "Treatable",
			},
		})
		if err != nil {
			t.Fatalf("Validation failed: %v", err)
		}
		if resp.Valid {
			t.Error("Expected Douglas Fir + Treatable to be INVALID, but got valid")
		}
		if len(resp.Conflicts) == 0 {
			t.Error("Expected at least one conflict")
		} else {
			t.Logf("Conflict message: %s", resp.Conflicts[0].Message)
		}
	})

	// Test 4: Invalid Cedar + Structural combination
	t.Run("InvalidConfig_Cedar_Structural", func(t *testing.T) {
		resp, err := svc.ValidateConfig(ctx, configurator.ValidateConfigRequest{
			Selections: map[string]string{
				"Species": "Cedar",
				"Grade":   "Structural",
			},
		})
		if err != nil {
			t.Fatalf("Validation failed: %v", err)
		}
		if resp.Valid {
			t.Error("Expected Cedar + Structural to be INVALID")
		}
	})

	// Test 5: Build SKU from valid config
	t.Run("BuildSKU_Valid", func(t *testing.T) {
		resp, err := svc.BuildSKU(ctx, configurator.BuildSKURequest{
			ProductType: "Lumber",
			Selections: map[string]string{
				"Species":    "SYP",
				"Grade":      "#2",
				"Treatment":  "Treatable",
				"Dimensions": "2x6-10",
			},
		})
		if err != nil {
			t.Fatalf("BuildSKU failed: %v", err)
		}
		if resp.SKU == "" {
			t.Error("Expected a non-empty SKU")
		}
		t.Logf("Generated SKU: %s", resp.SKU)
		t.Logf("Description: %s", resp.Description)
	})

	// Test 6: Build SKU with invalid config should fail
	t.Run("BuildSKU_Invalid", func(t *testing.T) {
		_, err := svc.BuildSKU(ctx, configurator.BuildSKURequest{
			ProductType: "Lumber",
			Selections: map[string]string{
				"Species":   "Douglas Fir",
				"Treatment": "Treatable",
			},
		})
		if err == nil {
			t.Error("Expected BuildSKU to fail for invalid config")
		} else {
			t.Logf("Correctly rejected: %s", err.Error())
		}
	})

	// Test 7: Get available options for Grade given Species=SYP
	t.Run("GetAvailableOptions_Grade_ForSYP", func(t *testing.T) {
		options, err := svc.GetAvailableOptions(ctx, configurator.AvailableOptionsRequest{
			AttributeType: "Grade",
			Selections:    map[string]string{"Species": "SYP"},
		})
		if err != nil {
			t.Fatalf("GetAvailableOptions failed: %v", err)
		}
		if len(options) == 0 {
			t.Error("Expected some grade options for SYP")
		}
		for _, opt := range options {
			t.Logf("Grade option: %s (allowed=%v)", opt.Value, opt.Allowed)
		}
	})
}
