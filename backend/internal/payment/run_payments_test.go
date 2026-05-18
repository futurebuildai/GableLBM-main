package payment

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"log/slog"
)

// TestRunPaymentsCharge tests the charge flow against a mock Run Payments server.
func TestRunPaymentsCharge(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/payments" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("unexpected method: %s", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer test-api-key" {
			t.Errorf("unexpected auth header: %s", r.Header.Get("Authorization"))
		}

		var req runChargeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}
		if req.Amount != 12500 {
			t.Errorf("expected amount 12500, got %d", req.Amount)
		}
		if req.Token != "tok_test_123" {
			t.Errorf("expected token tok_test_123, got %s", req.Token)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runAPIResponse{
			ID:            "run_tx_abc123",
			TransactionID: "run_tx_abc123",
			Status:        "approved",
			AuthCode:      "AUTH456",
			CardLast4:     "4242",
			CardBrand:     "VISA",
			Amount:        12500,
			Currency:      "USD",
		})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(GatewayConfig{
		APIKey:  "test-api-key",
		BaseURL: srv.URL + "/v1",
	}, slog.Default())

	result, err := gw.Charge(context.Background(), ChargeRequest{
		TokenID:     "tok_test_123",
		AmountCents: 12500,
		Currency:    "USD",
		Description: "Test charge",
		InvoiceID:   "inv-001",
	})
	if err != nil {
		t.Fatalf("charge failed: %v", err)
	}

	if result.TransactionID != "run_tx_abc123" {
		t.Errorf("expected tx ID run_tx_abc123, got %s", result.TransactionID)
	}
	if result.Status != GatewayStatusApproved {
		t.Errorf("expected APPROVED, got %s", result.Status)
	}
	if result.CardLast4 != "4242" {
		t.Errorf("expected card last4 4242, got %s", result.CardLast4)
	}
	if result.AuthCode != "AUTH456" {
		t.Errorf("expected auth code AUTH456, got %s", result.AuthCode)
	}
}

// TestRunPaymentsRefund tests the refund flow.
func TestRunPaymentsRefund(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/payments/run_tx_abc123/refund" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		var req runRefundRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}
		if req.Amount != 5000 {
			t.Errorf("expected refund amount 5000, got %d", req.Amount)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runAPIResponse{
			ID:            "run_ref_xyz789",
			TransactionID: "run_ref_xyz789",
			Status:        "refunded",
			Amount:        5000,
		})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(GatewayConfig{
		APIKey:  "test-api-key",
		BaseURL: srv.URL + "/v1",
	}, slog.Default())

	result, err := gw.Refund(context.Background(), "run_tx_abc123", 5000)
	if err != nil {
		t.Fatalf("refund failed: %v", err)
	}

	if result.Status != GatewayStatusRefunded {
		t.Errorf("expected REFUNDED, got %s", result.Status)
	}
	if result.AmountCents != 5000 {
		t.Errorf("expected amount 5000, got %d", result.AmountCents)
	}
}

// TestRunPaymentsVoid tests the void flow.
func TestRunPaymentsVoid(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/payments/run_tx_abc123/void" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runAPIResponse{
			ID:            "run_tx_abc123",
			TransactionID: "run_tx_abc123",
			Status:        "voided",
		})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(GatewayConfig{
		APIKey:  "test-api-key",
		BaseURL: srv.URL + "/v1",
	}, slog.Default())

	result, err := gw.Void(context.Background(), "run_tx_abc123")
	if err != nil {
		t.Fatalf("void failed: %v", err)
	}

	if result.Status != GatewayStatusVoided {
		t.Errorf("expected VOIDED, got %s", result.Status)
	}
}

// TestRunPaymentsDeclined tests handling of a declined charge.
func TestRunPaymentsDeclined(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runAPIResponse{
			ID:      "run_tx_declined",
			Status:  "declined",
			Message: "Insufficient funds",
		})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(GatewayConfig{
		APIKey:  "test-api-key",
		BaseURL: srv.URL + "/v1",
	}, slog.Default())

	result, err := gw.Charge(context.Background(), ChargeRequest{
		TokenID:     "tok_bad_card",
		AmountCents: 100000,
	})
	if err != nil {
		t.Fatalf("should not error on decline: %v", err)
	}

	if result.Status != GatewayStatusDeclined {
		t.Errorf("expected DECLINED, got %s", result.Status)
	}
}

// TestRunPaymentsAPIError tests handling of gateway HTTP errors.
func TestRunPaymentsAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "internal server error"}`))
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(GatewayConfig{
		APIKey:  "test-api-key",
		BaseURL: srv.URL + "/v1",
	}, slog.Default())

	_, err := gw.Charge(context.Background(), ChargeRequest{
		TokenID:     "tok_test",
		AmountCents: 1000,
	})
	if err == nil {
		t.Fatal("expected error on 500 response")
	}
}
