package payment

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// RunPaymentsGateway implements PaymentGateway for the Run Payments API,
// card-NOT-present / keyed-web rail: the PAN is tokenized client-side (Run's
// hosted iframe with the dealer's public key) so only an account_token reaches
// the server (PCI SAQ-A).
//
// Contract VERIFIED against Run's public OpenAPI (docs.runpayments.io) and the
// FutureBuild hardscapeos reference integration:
//   - Charge:        POST {base}/api/v1/charge
//     Auth:          Authorization: Bearer <api_key>  +  mid: <MID> header
//     Body:          {account_token, mid, amount(cents), currency, capture:'Y'|'N', vault:'Y'|'N'}
//     Response:      {result:'A'|'B'|'C', resp_code, resp_text, trans_id, card_type}
//                    A=Approved, B=Retry, C=Declined
//   - Void/refund:   POST {base}/api/v1/void-or-refund
//     Body:          {trans_id, mid, amount(cents), action:'refund'|'void'}
//   - Key refresh:   POST {base}/api/v1/api_keys/refresh  {token: <current api_key>}
//                    → {api_key, public_key, refresh_token}
//                    (the api_key is an EXPIRING JWT: on 401, refresh once + retry)
//
// The CARD-PRESENT rail (Clover terminal / Run Terminal API, device-driven) is a
// separate integration that slots in behind PaymentGateway unchanged when a
// terminal-connected counter workstation is provisioned. This client is the
// keyed-web / card-on-file path.
type RunPaymentsGateway struct {
	// configProvider resolves credentials at call time so keys set in Tech
	// Admin (system_settings) take effect without a restart.
	configProvider func() GatewayConfig
	// onRotate, if set, persists a refreshed api_key (+ refresh token) so the
	// rotation survives the process (the api_key is an expiring JWT).
	onRotate func(apiKey, refreshToken string)
	client   *http.Client
	logger   *slog.Logger
}

// NewRunPaymentsGateway creates a gateway with a static configuration.
func NewRunPaymentsGateway(cfg GatewayConfig, logger *slog.Logger) *RunPaymentsGateway {
	return NewRunPaymentsGatewayDynamic(func() GatewayConfig { return cfg }, logger)
}

// NewRunPaymentsGatewayDynamic creates a gateway that resolves its
// configuration on every call (e.g. from a DB-backed key store).
func NewRunPaymentsGatewayDynamic(provider func() GatewayConfig, logger *slog.Logger) *RunPaymentsGateway {
	return &RunPaymentsGateway{
		configProvider: provider,
		client:         &http.Client{Timeout: 30 * time.Second},
		logger:         logger,
	}
}

// OnKeyRotated registers a callback invoked when the expiring api_key is
// refreshed, so the caller can persist the rotated credential.
func (g *RunPaymentsGateway) OnKeyRotated(fn func(apiKey, refreshToken string)) *RunPaymentsGateway {
	g.onRotate = fn
	return g
}

// resolve returns the current credentials, or an error when the API key, MID,
// or base URL is missing (no guessed host — Run provisions the UAT/prod base).
func (g *RunPaymentsGateway) resolve() (GatewayConfig, error) {
	cfg := g.configProvider()
	if cfg.APIKey == "" {
		return cfg, fmt.Errorf("card processing not configured: set the run_payments_api_key setting (or RUN_PAYMENTS_API_KEY)")
	}
	if cfg.MID == "" {
		return cfg, fmt.Errorf("card processing not configured: set the run_payments_mid setting (the Run merchant MID)")
	}
	if cfg.BaseURL == "" {
		return cfg, fmt.Errorf("card processing not configured: set the run_payments_base_url setting (Run's UAT or production host)")
	}
	return cfg, nil
}

// ----- Run Payments API request/response types (verified schema) -----

type runChargeRequest struct {
	AccountToken string `json:"account_token"`
	MID          string `json:"mid"`
	Amount       int64  `json:"amount"` // integer cents
	Currency     string `json:"currency"`
	Capture      string `json:"capture"` // 'Y' auth+capture / 'N' auth-only
	Vault        string `json:"vault"`   // 'N' single-charge (no card-on-file)
}

type runVoidOrRefundRequest struct {
	TransID string `json:"trans_id"`
	MID     string `json:"mid"`
	Amount  int64  `json:"amount"`
	Action  string `json:"action"` // 'refund' (money back) | 'void' (same-day reversal)
}

type runRefreshRequest struct {
	Token string `json:"token"` // the current, expiring api_key
}

type runRefreshResponse struct {
	APIKey       string `json:"api_key"`
	PublicKey    string `json:"public_key"`
	RefreshToken string `json:"refresh_token"`
}

// runResponse is the shared A/B/C result envelope for charge + void-or-refund.
type runResponse struct {
	Result   string `json:"result"` // A=Approved, B=Retry, C=Declined
	RespCode string `json:"resp_code"`
	RespText string `json:"resp_text"`
	TransID  string `json:"trans_id"`
	CardType string `json:"card_type"`
	Amount   int64  `json:"amount"`
}

// ----- PaymentGateway implementation -----

// Charge auth+captures a tokenized payment (capture:'Y', vault:'N').
func (g *RunPaymentsGateway) Charge(ctx context.Context, req ChargeRequest) (*GatewayResult, error) {
	cfg, err := g.resolve()
	if err != nil {
		return nil, err
	}
	if req.TokenID == "" {
		return nil, fmt.Errorf("run payments: missing account token (card must be tokenized client-side)")
	}
	currency := req.Currency
	if currency == "" {
		currency = "USD"
	}
	body, _ := json.Marshal(runChargeRequest{
		AccountToken: req.TokenID,
		MID:          cfg.MID,
		Amount:       req.AmountCents,
		Currency:     currency,
		Capture:      "Y",
		Vault:        "N",
	})

	resp, err := g.doAuthed(ctx, cfg, "/api/v1/charge", body)
	if err != nil {
		return nil, fmt.Errorf("run payments charge failed: %w", err)
	}
	return g.toResult(resp), resultError(resp)
}

// Capture is not a separate call in the Run API — charge captures immediately.
func (g *RunPaymentsGateway) Capture(ctx context.Context, gatewayTxID string, amountCents int64) (*GatewayResult, error) {
	return nil, fmt.Errorf("run payments: separate capture is not supported (charge captures immediately)")
}

// Void reverses a same-day capture (action:'void').
func (g *RunPaymentsGateway) Void(ctx context.Context, gatewayTxID string) (*GatewayResult, error) {
	return g.voidOrRefund(ctx, gatewayTxID, 0, "void")
}

// Refund returns money to the card for a settled capture (action:'refund').
func (g *RunPaymentsGateway) Refund(ctx context.Context, gatewayTxID string, amountCents int64) (*GatewayResult, error) {
	return g.voidOrRefund(ctx, gatewayTxID, amountCents, "refund")
}

func (g *RunPaymentsGateway) voidOrRefund(ctx context.Context, gatewayTxID string, amountCents int64, action string) (*GatewayResult, error) {
	cfg, err := g.resolve()
	if err != nil {
		return nil, err
	}
	if gatewayTxID == "" {
		return nil, fmt.Errorf("run payments: missing trans_id for %s", action)
	}
	body, _ := json.Marshal(runVoidOrRefundRequest{
		TransID: gatewayTxID,
		MID:     cfg.MID,
		Amount:  amountCents,
		Action:  action,
	})
	resp, err := g.doAuthed(ctx, cfg, "/api/v1/void-or-refund", body)
	if err != nil {
		return nil, fmt.Errorf("run payments %s failed: %w", action, err)
	}
	result := g.toResult(resp)
	if action == "void" {
		result.Status = GatewayStatusVoided
	} else {
		result.Status = GatewayStatusRefunded
	}
	return result, resultError(resp)
}

// ----- HTTP + auth helpers -----

// doAuthed posts an authenticated request. On a 401 (expired api_key JWT) it
// refreshes once, rotates the credential (persisting via onRotate), and retries.
func (g *RunPaymentsGateway) doAuthed(ctx context.Context, cfg GatewayConfig, path string, body []byte) (*runResponse, error) {
	raw, status, err := g.post(ctx, cfg.BaseURL, path, body, cfg.APIKey, cfg.MID)
	if err != nil {
		return nil, err
	}
	if status == http.StatusUnauthorized {
		// Surface Run's 401 reason (error_description) — the api_key is an
		// expiring credential, so this is usually "expired"/"invalid". The
		// body is Run's error envelope, never our key.
		unauth := strings.TrimSpace(string(raw))
		if g.logger != nil {
			g.logger.Warn("Run Payments 401 on charge — api_key rejected", "reason", unauth)
		}
		newKey, newRefresh, rerr := g.refreshAPIKey(ctx, cfg.BaseURL, cfg.APIKey)
		if rerr != nil {
			return nil, fmt.Errorf("authentication failed (api_key rejected: %s); auto-refresh also failed: %w", unauth, rerr)
		}
		if g.onRotate != nil {
			g.onRotate(newKey, newRefresh)
		}
		raw, status, err = g.post(ctx, cfg.BaseURL, path, body, newKey, cfg.MID)
		if err != nil {
			return nil, fmt.Errorf("request failed after refresh: %w", err)
		}
	}
	if status >= 400 {
		return nil, fmt.Errorf("run payments returned status %d: %s", status, string(raw))
	}
	var out runResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("bad response: %w", err)
	}
	return &out, nil
}

// post sends one request. The Bearer api_key is set on the wire but never logged.
func (g *RunPaymentsGateway) post(ctx context.Context, base, path string, body []byte, apiKey, mid string) (raw []byte, status int, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey) // never logged
	req.Header.Set("mid", mid)

	if g.logger != nil {
		g.logger.Info("Run Payments API request", "path", path, "mid", mid)
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, _ = io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return raw, resp.StatusCode, nil
}

// refreshAPIKey exchanges the expiring api_key for a fresh credential set.
func (g *RunPaymentsGateway) refreshAPIKey(ctx context.Context, base, currentKey string) (apiKey, refreshToken string, err error) {
	body, _ := json.Marshal(runRefreshRequest{Token: currentKey})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/v1/api_keys/refresh", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 400 {
		return "", "", fmt.Errorf("status %d", resp.StatusCode)
	}
	var out runRefreshResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", "", fmt.Errorf("bad refresh response: %w", err)
	}
	if out.APIKey == "" {
		return "", "", errors.New("refresh returned no api_key")
	}
	return out.APIKey, out.RefreshToken, nil
}

// toResult maps the A/B/C envelope to the normalized GatewayResult.
func (g *RunPaymentsGateway) toResult(resp *runResponse) *GatewayResult {
	status := GatewayStatusError
	switch resp.Result {
	case "A":
		status = GatewayStatusApproved
	case "C":
		status = GatewayStatusDeclined
	case "B":
		status = GatewayStatusError // retry — no tender state in our model
	}
	return &GatewayResult{
		TransactionID: resp.TransID,
		Status:        status,
		AuthCode:      resp.RespCode,
		CardBrand:     resp.CardType,
		AmountCents:   resp.Amount,
		RawResponse:   map[string]any{"result": resp.Result, "resp_code": resp.RespCode, "resp_text": resp.RespText},
	}
}

// resultError returns a descriptive error for any non-approved outcome.
func resultError(resp *runResponse) error {
	if resp.Result == "A" {
		return nil
	}
	return fmt.Errorf("run payments result %q (%s): %s", resp.Result, resp.RespCode, resp.RespText)
}
