package purchase_order

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gablelbm/gable/internal/ai"
)

// The purchase_order freight call-site degrades OPPOSITELY to parsing: when AI is
// unconfigured it must return a HARD error telling the user to enter the freight
// total manually (never a silent success). extractFreight isolates that contract
// so it can be tested without the DB-backed PO lookup.

const freightManualMsg = "please enter the freight total manually"

func TestExtractFreight_NilClientHardError(t *testing.T) {
	s := &Service{} // aiClient nil
	_, _, err := s.extractFreight(context.Background(), []byte("x"), "application/pdf")
	if err == nil || !strings.Contains(err.Error(), freightManualMsg) {
		t.Fatalf("nil client: want hard %q error, got %v", freightManualMsg, err)
	}
}

func TestExtractFreight_UnconfiguredClientHardError(t *testing.T) {
	s := &Service{aiClient: ai.NewClient("")} // configured object, no key
	_, _, err := s.extractFreight(context.Background(), []byte("x"), "application/pdf")
	if err == nil || !strings.Contains(err.Error(), freightManualMsg) {
		t.Fatalf("unconfigured client: want hard %q error, got %v", freightManualMsg, err)
	}
}

func TestExtractFreight_ConfiguredSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"content": `{"total_amount":245.50,"carrier_name":"ABC Freight","invoice_number":"FR-1"}`,
			}}},
		})
	}))
	defer srv.Close()

	s := &Service{aiClient: ai.NewClient("k").WithBaseURL(srv.URL)}
	res, raw, err := s.extractFreight(context.Background(), []byte("%PDF-1.4"), "application/pdf")
	if err != nil {
		t.Fatalf("configured client should succeed, got %v", err)
	}
	if res.TotalAmount != 245.50 || res.CarrierName != "ABC Freight" || res.InvoiceNumber != "FR-1" {
		t.Errorf("parsed result = %+v", res)
	}
	if raw == "" {
		t.Error("expected raw response to be returned for the audit trail")
	}
}
