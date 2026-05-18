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
// API docs: https://developer.runpayments.io
//
// Flow:
//  1. Frontend embeds Runner.js to tokenize card data (PCI-compliant)
//  2. Frontend sends token to our backend
//  3. Backend calls Run Payments API with the token to charge/capture/etc.
//  4. Card data never touches our servers
type RunPaymentsGateway struct {
	apiKey  string
	baseURL string
	client  *http.Client
	logger  *slog.Logger
}

// NewRunPaymentsGateway creates a new Run Payments gateway client.
func NewRunPaymentsGateway(cfg GatewayConfig, logger *slog.Logger) *RunPaymentsGateway {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		if cfg.Environment == "production" {
			baseURL = "https://api.runpayments.io/v1"
		} else {
			baseURL = "https://sandbox.runpayments.io/v1"
		}
	}

	return &RunPaymentsGateway{
		apiKey:  cfg.APIKey,
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
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

type runCaptureRequest struct {
	Amount int64 `json:"amount"` // cents
}

type runRefundRequest struct {
	Amount int64  `json:"amount"` // cents
	Reason string `json:"reason,omitempty"`
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

	resp, err := g.doRequest(ctx, "POST", "/payments", body)
	if err != nil {
		return nil, fmt.Errorf("run payments charge failed: %w", err)
	}

	return g.toResult(resp), nil
}

func (g *RunPaymentsGateway) Capture(ctx context.Context, gatewayTxID string, amountCents int64) (*GatewayResult, error) {
	body := runCaptureRequest{
		Amount: amountCents,
	}

	resp, err := g.doRequest(ctx, "POST", fmt.Sprintf("/payments/%s/capture", gatewayTxID), body)
	if err != nil {
		return nil, fmt.Errorf("run payments capture failed: %w", err)
	}

	return g.toResult(resp), nil
}

func (g *RunPaymentsGateway) Void(ctx context.Context, gatewayTxID string) (*GatewayResult, error) {
	resp, err := g.doRequest(ctx, "POST", fmt.Sprintf("/payments/%s/void", gatewayTxID), nil)
	if err != nil {
		return nil, fmt.Errorf("run payments void failed: %w", err)
	}

	result := g.toResult(resp)
	result.Status = GatewayStatusVoided
	return result, nil
}

func (g *RunPaymentsGateway) Refund(ctx context.Context, gatewayTxID string, amountCents int64) (*GatewayResult, error) {
	body := runRefundRequest{
		Amount: amountCents,
	}

	resp, err := g.doRequest(ctx, "POST", fmt.Sprintf("/payments/%s/refund", gatewayTxID), body)
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

	url := g.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+g.apiKey)
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
