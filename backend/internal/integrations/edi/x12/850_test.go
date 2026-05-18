package x12

import (
	"testing"

	"github.com/gablelbm/gable/internal/domain"
	"github.com/google/uuid"
)

func TestGenerate850(t *testing.T) {
	po := domain.POData{
		ID:       uuid.New(),
		PONumber: "PO12345",
		VendorID: uuid.New(),
		Lines: []domain.POlineData{
			{
				LineNumber: 1,
				Quantity:   100,
				Cost:       12.50,
				ItemCode:   "SKU123",
			},
		},
	}

	profile := domain.EDIProfile{
		ISASenderID:   "TESTSENDER",
		ISAReceiverID: "TESTRECEIVER",
		GSSenderID:    "TESTSENDER",
		GSReceiverID:  "TESTRECEIVER",
	}

	content, err := Generate850(po, profile)
	if err != nil {
		t.Fatalf("Failed to generate 850: %v", err)
	}

	t.Logf("Generated 850:\n%s", content)

	// Basic assertions
	if len(content) == 0 {
		t.Error("Generated content is empty")
	}

	// Check for segments
	expectedSegments := []string{"ISA", "GS", "ST*850", "BEG", "PO1", "CTT", "SE", "GE", "IEA"}
	for _, segment := range expectedSegments {
		if !contains(content, segment) {
			t.Errorf("Missing segment: %s", segment)
		}
	}
}

func contains(s, substr string) bool {
	// Simple implementation or use strings package
	for i := 0; i < len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
