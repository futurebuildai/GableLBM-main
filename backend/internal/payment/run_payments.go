package payment

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// RunPaymentsGateway implements PaymentGateway for the Run Payments API.
// API docs: https://docs.runpayments.io (developer hub) — verified July 2026:
//   - Base URL:  https://javelin.runpayments.io
//   - Auth:      Authorization: Bearer <Payments API Key>
//   - Charge:    POST /api/v1/payments/charge
//   - Refund/Void: POST /api/v1/transactions/void-or-refund
// Sandbox vs production is selected by the API key (test keys from Run
// Merchant); RUN_PAYMENTS_BASE_URL / the run_payments_base_url setting
// overrides the host if Run provisions a dedicated sandbox endpoint.
// The request/response field mapping below is isolated here and marked
// where the public docs don't publish the schema — verify against the
// sandbox on first live test and adjust ONLY this file.
//
// Flow:
//  1. Frontend tokenizes card data via Run's JS (PCI-compliant)
//  2. Frontend sends token to our backend
//  3. Backend calls Run Payments API with the token to charge/refund
//  4. Card data never touches our servers
type RunPaymentsGateway struct {
	// configProvider resolves credentials at call time so keys set in Tech
	// Admin (system_settings) take effect without a restart.
	configProvider func() GatewayConfig
	client         *http.Client
	logger         *slog.Logger
}

const runPaymentsDefaultBaseURL = "https://javelin.runpayments.io"

// NewRunPaymentsGateway creates a gateway with a static configuration.
func NewRunPaymentsGateway(cfg GatewayConfig, logger *slog.Logger) *RunPaymentsGateway {
	return NewRunPaymentsGatewayDynamic(func() GatewayConfig { return cfg }, logger)
}

// NewRunPaymentsGatewayDynamic creates a gateway that resolves its
// configuration on every call (e.g. from a DB-backed key store).
func NewRunPaymentsGatewayDynamic(provider func() GatewayConfig, logger *slog.Logger) *RunPaymentsGateway {
	return &RunPaymentsGateway{
		configProvider: provider,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// resolve returns the current credentials + base URL, or an error when no
// API key is configured (env or Tech Admin).
func (g *RunPaymentsGateway) resolve() (GatewayConfig, error) {
	cfg := g.configProvider()
	if cfg.APIKey == "" {
		return cfg, fmt.Errorf("card processing not configured: set RUN_PAYMENTS_API_KEY or the run_payments_api_key setting")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = runPaymentsDefaultBaseURL
	}
	return cfg, nil
}

// ----- Run Payments API Request/Response types -----

type runChargeRequest struct {
	Token       string `json:"token"`
	Amount      int64  `json:"amount"` // cents
	Currency    string `json:"currency"`
	Description string `json:"description,omitempty"`
	Reference   string `json:"reference,omitempty"`
	Capture     bool   `json:"capture"` // true = auth+capture, false = auth-only
}

// runVoidOrRefundRequest targets POST /api/v1/transactions/void-or-refund.
// Field names are the best public mapping — the docs list the endpoint but
// not its schema; verify on sandbox and adjust here only. Zero Amount = void
// / full reversal; non-zero = (partial) refund of that many cents.
type runVoidOrRefundRequest struct {
	TransactionID string `json:"transaction_id"`
	Amount        int64  `json:"amount,omitempty"` // cents
	Reason        string `json:"reason,omitempty"`
}

type runAPIResponse struct {
	ID            string `json:"id"`
	Status        string `json:"status"` // "approved", "declined", "error"
	AuthCode      string `json:"auth_code"`
	CardLast4     string `json:"card_last4"`
	CardBrand     string `json:"card_brand"`
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency"`
	Message       string `json:"message"`
	ReturnCode    int    `json:"return_code"`
	TransactionID string `json:"transaction_id"`
}

// ----- PaymentGateway Interface Implementation -----

func (g *RunPaymentsGateway) Charge(ctx context.Context, req ChargeRequest) (*GatewayResult, error) {
	currency := req.Currency
	if currency == "" {
		currency = "USD"
	}

	body := runChargeRequest{
		Token:       req.TokenID,
		Amount:      req.AmountCents,
		Currency:    currency,
		Description: req.Description,
		Reference:   req.InvoiceID,
		Capture:     true, // Auth + capture in one step for POS
	}

	resp, err := g.doRequest(ctx, "POST", "/api/v1/payments/charge", body)
	if err != nil {
		return nil, fmt.Errorf("run payments charge failed: %w", err)
	}

	return g.toResult(resp), nil
}

// Capture is not exposed by the documented Run Payments API — the charge
// endpoint authorizes and captures in one step. Kept to satisfy the
// PaymentGateway interface.
func (g *RunPaymentsGateway) Capture(ctx context.Context, gatewayTxID string, amountCents int64) (*GatewayResult, error) {
	return nil, fmt.Errorf("run payments: separate capture is not supported (charge captures immediately)")
}

func (g *RunPaymentsGateway) Void(ctx context.Context, gatewayTxID string) (*GatewayResult, error) {
	body := runVoidOrRefundRequest{TransactionID: gatewayTxID}
	resp, err := g.doRequest(ctx, "POST", "/api/v1/transactions/void-or-refund", body)
	if err != nil {
		return nil, fmt.Errorf("run payments void failed: %w", err)
	}

	result := g.toResult(resp)
	result.Status = GatewayStatusVoided
	return result, nil
}

func (g *RunPaymentsGateway) Refund(ctx context.Context, gatewayTxID string, amountCents int64) (*GatewayResult, error) {
	body := runVoidOrRefundRequest{TransactionID: gatewayTxID, Amount: amountCents}
	resp, err := g.doRequest(ctx, "POST", "/api/v1/transactions/void-or-refund", body)
	if err != nil {
		return nil, fmt.Errorf("run payments refund failed: %w", err)
	}

	result := g.toResult(resp)
	result.Status = GatewayStatusRefunded
	return result, nil
}

// ----- Internal helpers -----

func (g *RunPaymentsGateway) doRequest(ctx context.Context, method, path string, body any) (*runAPIResponse, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}
		reqBody = bytes.NewReader(jsonBytes)
	}

	cfg, err := g.resolve()
	if err != nil {
		return nil, err
	}
	url := cfg.BaseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Accept", "application/json")

	g.logger.Info("Run Payments API request",
		"method", method,
		"path", path,
	)

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("run payments request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		g.logger.Error("Run Payments API error",
			"status", resp.StatusCode,
			"body", string(respBody),
		)
		return nil, fmt.Errorf("run payments returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var apiResp runAPIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	g.logger.Info("Run Payments API response",
		"transaction_id", apiResp.TransactionID,
		"status", apiResp.Status,
	)

	return &apiResp, nil
}

func (g *RunPaymentsGateway) toResult(resp *runAPIResponse) *GatewayResult {
	status := GatewayStatusError
	switch resp.Status {
	case "approved", "captured", "success":
		status = GatewayStatusApproved
	case "declined":
		status = GatewayStatusDeclined
	case "voided":
		status = GatewayStatusVoided
	case "refunded":
		status = GatewayStatusRefunded
	case "pending":
		status = GatewayStatusPending
	}

	txID := resp.TransactionID
	if txID == "" {
		txID = resp.ID
	}

	return &GatewayResult{
		TransactionID: txID,
		Status:        status,
		AuthCode:      resp.AuthCode,
		CardLast4:     resp.CardLast4,
		CardBrand:     resp.CardBrand,
		AmountCents:   resp.Amount,
	}
}
