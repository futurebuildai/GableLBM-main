package purchase_order

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gablelbm/gable/pkg/middleware"
	jose "github.com/go-jose/go-jose/v4"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A2AReceiver handles inbound A2A webhook events from FB Brain.
// It verifies JWS RS256 detached signatures using Brain's public key,
// enforces idempotency, and creates Purchase Orders from the payload.
type A2AReceiver struct {
	publicKey *rsa.PublicKey
	service   *Service
	pool      *pgxpool.Pool
	logger    *slog.Logger
}

// NewA2AReceiver creates a receiver for inbound A2A purchase order webhooks.
// The publicKey is Brain's RSA public key used to verify JWS detached signatures.
func NewA2AReceiver(publicKey *rsa.PublicKey, service *Service, pool *pgxpool.Pool, logger *slog.Logger) *A2AReceiver {
	return &A2AReceiver{
		publicKey: publicKey,
		service:   service,
		pool:      pool,
		logger:    logger,
	}
}

// --- Inbound webhook types (mirror Brain's a2a.WebhookEvent) ---

// InboundPOWebhook is the standard A2A webhook envelope from FB Brain.
type InboundPOWebhook struct {
	EventType      string          `json:"event_type"`
	Payload        json.RawMessage `json:"payload"`
	TraceID        string          `json:"trace_id"`
	IdempotencyKey string          `json:"idempotency_key"`
	Timestamp      string          `json:"timestamp"`
	Issuer         string          `json:"iss"`
}

// A2APurchaseOrderPayload is the nested payload for "create_purchase_order" events.
type A2APurchaseOrderPayload struct {
	VendorID    string                  `json:"vendor_id"`
	Lines       []A2APurchaseOrderLine  `json:"lines"`
	RequestedBy string                  `json:"requested_by"`
	ProjectID   string                  `json:"project_id"`
	RFQRef      string                  `json:"rfq_ref"`
}

// A2APurchaseOrderLine represents a single line item in an A2A PO.
// F-03: Quantity and Cost are float64 intentionally — they represent unit quantities
// and per-unit prices (e.g. 2.5 sheets at $12.50). These are NOT financial fee fields
// (which use int64 cents in Brain's financial engine). They mirror CreatePOLineInput.
type A2APurchaseOrderLine struct {
	ProductID   string  `json:"product_id"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"` // Unit quantity (e.g. 2.5 sheets), not cents
	Cost        float64 `json:"cost"`     // Per-unit cost in dollars, not cents
}

// ReceiveWebhook processes inbound A2A webhook events from FB Brain.
// POST /api/v1/a2a/purchase-order
//
// Auth: JWS detached signature via X-JWS-Signature header (NO JWT).
func (ar *A2AReceiver) ReceiveWebhook(w http.ResponseWriter, r *http.Request) {
	// 1. Read the raw body (1MB limit)
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		ar.writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "failed to read request body")
		return
	}
	defer r.Body.Close()

	// 2. Extract and validate JWS signature header
	jwsSig := r.Header.Get("X-JWS-Signature")
	if jwsSig == "" {
		ar.writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing X-JWS-Signature header")
		return
	}

	// 3. Extract idempotency key header
	idempotencyKey := r.Header.Get("X-Idempotency-Key")
	if idempotencyKey == "" {
		ar.writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "missing X-Idempotency-Key header")
		return
	}

	// 4. Verify JWS detached signature using Brain's RSA public key
	// Uses the same verification logic as Brain's a2a.Verify() / receiver.go
	if err := ar.verifyJWSSignature(body, jwsSig); err != nil {
		ar.logger.Warn("JWS verification failed",
			"error", err,
			"idempotency_key", idempotencyKey,
		)
		ar.writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid JWS signature")
		return
	}

	// 5. Check idempotency — reject duplicates
	isDuplicate, err := ar.checkIdempotencyKey(r.Context(), idempotencyKey)
	if err != nil {
		ar.logger.Error("idempotency check failed", "error", err)
		ar.writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "idempotency check failed")
		return
	}
	if isDuplicate {
		ar.writeError(w, http.StatusConflict, "DUPLICATE", "idempotency key already processed")
		return
	}

	// 6. Parse the webhook envelope
	var webhook InboundPOWebhook
	if err := json.Unmarshal(body, &webhook); err != nil {
		ar.writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid JSON body")
		return
	}

	// Only process create_purchase_order events
	if webhook.EventType != "create_purchase_order" {
		ar.logger.Warn("unsupported A2A event type",
			"event_type", webhook.EventType,
			"trace_id", webhook.TraceID,
		)
		// Acknowledge but don't process — forward compatibility
		ar.writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	// 7. Parse the PO payload
	var poPayload A2APurchaseOrderPayload
	if err := json.Unmarshal(webhook.Payload, &poPayload); err != nil {
		ar.writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid purchase order payload")
		return
	}

	// 8. Create the PO via the service
	vendorID, err := uuid.Parse(poPayload.VendorID)
	if err != nil {
		ar.writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid vendor_id in payload")
		return
	}

	lines := make([]CreatePOLineInput, len(poPayload.Lines))
	for i, l := range poPayload.Lines {
		lines[i] = CreatePOLineInput{
			ProductID:   l.ProductID,
			Description: l.Description,
			Quantity:    l.Quantity,
			Cost:        l.Cost,
		}
	}

	// A2A webhooks bypass the branch middleware. Resolve brain_inbound_branch_id
	// (falling back to default_branch_id) and inject a BranchContext so the
	// repository CreatePO call stamps the correct branch.
	poCtx := ar.contextWithInboundBranch(r.Context())
	po, err := ar.service.CreateManualPOFromHandler(poCtx, vendorID, lines, SourceA2A)
	if err != nil {
		ar.logger.Error("failed to create PO from A2A webhook",
			"error", err,
			"trace_id", webhook.TraceID,
			"vendor_id", poPayload.VendorID,
		)
		ar.writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create purchase order")
		return
	}

	// 9. Log the webhook for audit trail
	if err := ar.logInboundPO(r.Context(), idempotencyKey, &webhook, po.ID); err != nil {
		ar.logger.Error("failed to log inbound PO webhook", "error", err)
		// Don't fail the request — PO was created successfully
	}

	ar.logger.Info("A2A purchase order created",
		"po_id", po.ID,
		"trace_id", webhook.TraceID,
		"idempotency_key", idempotencyKey,
		"vendor_id", poPayload.VendorID,
		"line_count", len(poPayload.Lines),
	)

	ar.writeJSON(w, http.StatusCreated, map[string]any{
		"status": "created",
		"po_id":  po.ID,
	})
}

// verifyJWSSignature verifies the detached JWS compact signature against the
// request body using Brain's RSA public key.
func (ar *A2AReceiver) verifyJWSSignature(body []byte, jwsSig string) error {
	jws, err := jose.ParseDetached(jwsSig, body, []jose.SignatureAlgorithm{jose.RS256})
	if err != nil {
		return fmt.Errorf("parsing detached JWS: %w", err)
	}

	_, err = jws.Verify(ar.publicKey)
	if err != nil {
		return fmt.Errorf("verifying JWS signature: %w", err)
	}

	return nil
}

// checkIdempotencyKey returns true if the key has already been processed.
func (ar *A2AReceiver) checkIdempotencyKey(ctx context.Context, key string) (bool, error) {
	var exists bool
	err := ar.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM a2a_inbound_po_log WHERE idempotency_key = $1
		)`, key).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking idempotency key: %w", err)
	}
	return exists, nil
}

// logInboundPO records the inbound webhook for idempotency and audit.
func (ar *A2AReceiver) logInboundPO(ctx context.Context, idempotencyKey string, webhook *InboundPOWebhook, poID uuid.UUID) error {
	_, err := ar.pool.Exec(ctx, `
		INSERT INTO a2a_inbound_po_log (
			idempotency_key, event_type, payload, trace_id, created_po_id, received_at
		) VALUES ($1, $2, $3, $4, $5, $6)`,
		idempotencyKey, webhook.EventType, webhook.Payload,
		webhook.TraceID, poID, time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("logging inbound PO webhook: %w", err)
	}
	return nil
}

// --- HTTP response helpers ---

func (ar *A2AReceiver) writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func (ar *A2AReceiver) writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

// contextWithInboundBranch returns a context with a BranchContext set to the
// brain_inbound_branch_id system setting, falling back to default_branch_id.
// Returns ctx unchanged when neither setting is available (the repository
// then falls back to the SQL-level COALESCE on default_branch_id).
func (ar *A2AReceiver) contextWithInboundBranch(ctx context.Context) context.Context {
	for _, key := range []string{"brain_inbound_branch_id", "default_branch_id"} {
		var s string
		if err := ar.pool.QueryRow(ctx,
			`SELECT value FROM system_settings WHERE key = $1`, key).Scan(&s); err != nil {
			continue
		}
		id, err := uuid.Parse(strings.TrimSpace(s))
		if err != nil {
			continue
		}
		return middleware.WithBranchContext(ctx, &middleware.BranchContext{BranchID: &id, IsAdmin: true})
	}
	return ctx
}

// --- Public key loading utility ---

// LoadBrainPublicKey loads an RSA public key from a PEM file for JWS verification.
func LoadBrainPublicKey(path string) (*rsa.PublicKey, error) {
	pemData, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading Brain public key file: %w", err)
	}

	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in Brain public key file")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parsing Brain public key: %w", err)
	}

	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("Brain public key is not RSA")
	}

	return rsaPub, nil
}
