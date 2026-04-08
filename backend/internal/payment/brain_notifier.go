package payment

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// TransactionNotification is the payload sent to FB Brain's financial engine
// when an invoice is marked as paid. Brain uses this to calculate and record
// the ecosystem transaction fee (default 10 bps = 0.10%).
//
// This struct mirrors Brain's financial.TransactionRequest.
type TransactionNotification struct {
	OrgID           string `json:"org_id"`           // Tenant UUID
	TransactionType string `json:"transaction_type"` // "invoice_payment"
	GrossCents      int64  `json:"gross_cents"`      // Invoice total in cents
	CurrencyCode    string `json:"currency_code"`    // "USD"
	FeeBPS          int    `json:"fee_bps"`          // 10 (0.10%) — Brain may override
	ExternalRef     string `json:"external_ref"`     // "gable:invoice:<uuid>"
}

// BrainNotifier sends payment events to FB Brain's financial engine
// for ecosystem fee calculation. Calls are fire-and-forget (async)
// with best-effort delivery and structured logging on failure.
type BrainNotifier struct {
	brainBaseURL   string
	integrationKey string
	httpClient     *http.Client
	logger         *slog.Logger
}

// NewBrainNotifier creates a notifier that sends payment events to Brain.
func NewBrainNotifier(brainBaseURL, integrationKey string, logger *slog.Logger) *BrainNotifier {
	return &BrainNotifier{
		brainBaseURL:   strings.TrimRight(brainBaseURL, "/"),
		integrationKey: integrationKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		logger: logger,
	}
}

// NotifyPayment sends a transaction notification to Brain's financial engine.
// This is designed to be called in a goroutine (fire-and-forget).
// On failure, it logs the error but does not retry — GableLBM's payment
// processing must not be blocked by Brain availability.
func (n *BrainNotifier) NotifyPayment(ctx context.Context, notification TransactionNotification) {
	bodyBytes, err := json.Marshal(notification)
	if err != nil {
		n.logger.Error("failed to marshal brain notification",
			"error", err,
			"external_ref", notification.ExternalRef,
		)
		return
	}

	url := n.brainBaseURL + "/api/v1/financial/transaction"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		n.logger.Error("failed to create brain notification request",
			"error", err,
			"external_ref", notification.ExternalRef,
		)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Integration-Key", n.integrationKey)
	req.Header.Set("X-Tenant-ID", notification.OrgID)

	resp, err := n.httpClient.Do(req)
	if err != nil {
		n.logger.Error("brain financial notification failed",
			"error", err,
			"external_ref", notification.ExternalRef,
			"url", url,
		)
		return
	}
	defer resp.Body.Close()
	// F-07: Drain body before close for HTTP/1.1 connection reuse.
	// The defer runs after this line executes, so the body is fully drained first.
	io.Copy(io.Discard, resp.Body) //nolint:errcheck

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		n.logger.Info("brain financial notification sent",
			"external_ref", notification.ExternalRef,
			"gross_cents", notification.GrossCents,
			"status", resp.StatusCode,
		)
	} else {
		n.logger.Error("brain financial notification rejected",
			"external_ref", notification.ExternalRef,
			"status", resp.StatusCode,
			"url", url,
		)
	}
}

// notifyInvoicePaid is a helper that builds and sends a TransactionNotification
// for a fully-paid invoice. Called from updateInvoiceStatus.
func (n *BrainNotifier) notifyInvoicePaid(orgID string, invoiceID fmt.Stringer, totalAmountCents int64) {
	go n.NotifyPayment(context.Background(), TransactionNotification{
		OrgID:           orgID,
		TransactionType: "invoice_payment",
		GrossCents:      totalAmountCents,
		CurrencyCode:    "USD",
		FeeBPS:          10,
		ExternalRef:     fmt.Sprintf("gable:invoice:%s", invoiceID),
	})
}
