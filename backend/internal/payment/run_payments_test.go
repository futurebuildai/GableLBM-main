package payment

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func testGatewayConfig(baseURL string) GatewayConfig {
	return GatewayConfig{APIKey: "test-api-key", MID: "800000004181", BaseURL: baseURL}
}

// TestRunPaymentsCharge verifies the charge contract: path, mid header, body
// shape, and the A-result → APPROVED mapping.
func TestRunPaymentsCharge(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/charge" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-api-key" {
			t.Errorf("missing/incorrect bearer auth: %s", r.Header.Get("Authorization"))
		}
		if r.Header.Get("mid") != "800000004181" {
			t.Errorf("missing mid header: %s", r.Header.Get("mid"))
		}
		var req runChargeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if req.AccountToken != "tok_abc" || req.MID != "800000004181" || req.Amount != 10000 {
			t.Errorf("unexpected charge body: %+v", req)
		}
		if req.Capture != "Y" || req.Vault != "N" {
			t.Errorf("expected capture=Y vault=N, got %s/%s", req.Capture, req.Vault)
		}
		json.NewEncoder(w).Encode(runResponse{Result: "A", RespCode: "00", TransID: "run_tx_1", CardType: "CREDIT", Amount: 10000})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(testGatewayConfig(srv.URL), slog.Default())
	res, err := gw.Charge(context.Background(), ChargeRequest{TokenID: "tok_abc", AmountCents: 10000, Currency: "USD"})
	if err != nil {
		t.Fatalf("charge: %v", err)
	}
	if res.Status != GatewayStatusApproved || res.TransactionID != "run_tx_1" {
		t.Fatalf("want APPROVED/run_tx_1, got %s/%s", res.Status, res.TransactionID)
	}
}

// TestRunPaymentsChargeDeclined verifies a C-result surfaces as a decline error.
func TestRunPaymentsChargeDeclined(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(runResponse{Result: "C", RespCode: "05", RespText: "Do Not Honor", TransID: "run_tx_2"})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(testGatewayConfig(srv.URL), slog.Default())
	res, err := gw.Charge(context.Background(), ChargeRequest{TokenID: "tok_abc", AmountCents: 10000})
	if err == nil {
		t.Fatal("expected decline error")
	}
	if res == nil || res.Status != GatewayStatusDeclined {
		t.Fatalf("want DECLINED result, got %+v", res)
	}
}

// TestRunPaymentsRefund verifies void-or-refund with action=refund.
func TestRunPaymentsRefund(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/void-or-refund" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		var req runVoidOrRefundRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if req.TransID != "run_tx_1" || req.MID != "800000004181" || req.Amount != 5000 || req.Action != "refund" {
			t.Errorf("unexpected refund body: %+v", req)
		}
		json.NewEncoder(w).Encode(runResponse{Result: "A", TransID: "run_ref_1", Amount: 5000})
	}))
	defer srv.Close()

	gw := NewRunPaymentsGateway(testGatewayConfig(srv.URL), slog.Default())
	res, err := gw.Refund(context.Background(), "run_tx_1", 5000)
	if err != nil {
		t.Fatalf("refund: %v", err)
	}
	if res.Status != GatewayStatusRefunded {
		t.Fatalf("want REFUNDED, got %s", res.Status)
	}
}

// TestRunPaymentsExpiredKeyRefresh verifies the 401 → refresh → retry flow and
// that the rotation callback fires with the new key.
func TestRunPaymentsExpiredKeyRefresh(t *testing.T) {
	var chargeCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/charge":
			chargeCalls++
			if chargeCalls == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if r.Header.Get("Authorization") != "Bearer fresh-key" {
				t.Errorf("retry did not use refreshed key: %s", r.Header.Get("Authorization"))
			}
			json.NewEncoder(w).Encode(runResponse{Result: "A", TransID: "run_tx_3", Amount: 100})
		case "/api/v1/api_keys/refresh":
			json.NewEncoder(w).Encode(runRefreshResponse{APIKey: "fresh-key", RefreshToken: "fresh-refresh"})
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	var rotatedKey string
	gw := NewRunPaymentsGateway(testGatewayConfig(srv.URL), slog.Default()).
		OnKeyRotated(func(apiKey, _ string) { rotatedKey = apiKey })
	res, err := gw.Charge(context.Background(), ChargeRequest{TokenID: "tok_abc", AmountCents: 100})
	if err != nil {
		t.Fatalf("charge after refresh: %v", err)
	}
	if res.TransactionID != "run_tx_3" {
		t.Fatalf("want run_tx_3, got %s", res.TransactionID)
	}
	if rotatedKey != "fresh-key" {
		t.Fatalf("rotation callback not fired with fresh key, got %q", rotatedKey)
	}
}

// TestRunPaymentsUnconfigured verifies a missing key/mid/base errors clearly.
func TestRunPaymentsUnconfigured(t *testing.T) {
	gw := NewRunPaymentsGateway(GatewayConfig{APIKey: "k", MID: "m"}, slog.Default()) // no base URL
	if _, err := gw.Charge(context.Background(), ChargeRequest{TokenID: "t", AmountCents: 1}); err == nil {
		t.Fatal("expected configuration error for missing base URL")
	}
}
