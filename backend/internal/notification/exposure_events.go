package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/gablelbm/gable/internal/pricing"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/eventbus"
	"github.com/google/uuid"
)

// ExposureNotifier is the eventbus subscriber that turns lumber-index price
// exposure events into salesperson alerts and customer notices. It is
// registered against the quote.exposure.> subject in cmd/server/main.go.
//
// Routing:
//   - FLAGGED / ESCALATED / ACK_REQUIRED → email the assigned salesperson.
//   - ESCALATED / ACKNOWLEDGED          → email the customer.
//
// Email addresses are resolved from sales_team / customers at handle time.
// Handling is idempotent on the event ID via a bounded seen-cache so a NATS
// redelivery (at-least-once) doesn't double-send.
type ExposureNotifier struct {
	email  EmailService
	db     *database.DB
	logger *slog.Logger

	mu       sync.Mutex
	seen     map[string]struct{}
	seenRing []string
	seenCap  int
}

// NewExposureNotifier builds the subscriber adapter. A nil db disables email
// resolution (handler logs and no-ops), keeping the feature degradable.
func NewExposureNotifier(email EmailService, db *database.DB, logger *slog.Logger) *ExposureNotifier {
	if logger == nil {
		logger = slog.Default()
	}
	return &ExposureNotifier{
		email:   email,
		db:      db,
		logger:  logger,
		seen:    make(map[string]struct{}),
		seenCap: 10000,
	}
}

// markSeen records an event ID and reports whether it was already processed.
// Bounded FIFO eviction keeps the cache from growing without limit.
func (n *ExposureNotifier) markSeen(id string) (already bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if _, ok := n.seen[id]; ok {
		return true
	}
	n.seen[id] = struct{}{}
	n.seenRing = append(n.seenRing, id)
	if len(n.seenRing) > n.seenCap {
		evict := n.seenRing[0]
		n.seenRing = n.seenRing[1:]
		delete(n.seen, evict)
	}
	return false
}

// Handle is the eventbus.Handler. It is idempotent and best-effort: a returned
// error lets a durable backend redeliver, but the seen-cache guards against
// double-sends across redeliveries within this process.
func (n *ExposureNotifier) Handle(ctx context.Context, e eventbus.Event) error {
	if e.EventID != "" && n.markSeen(e.EventID) {
		n.logger.Debug("exposure notifier: duplicate event ignored", "event_id", e.EventID, "subject", e.Subject)
		return nil
	}

	var p pricing.ExposureNotification
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		// A malformed payload will never succeed on redelivery — log and ack.
		n.logger.Error("exposure notifier: bad payload", "event_id", e.EventID, "subject", e.Subject, "err", err)
		return nil
	}

	switch p.EventType {
	case pricing.EventFlagged, pricing.EventEscalated, pricing.EventAckRequired:
		n.notifySalesperson(ctx, p)
	}
	switch p.EventType {
	case pricing.EventEscalated, pricing.EventAcknowledged:
		n.notifyCustomer(ctx, p)
	}
	return nil
}

func (n *ExposureNotifier) notifySalesperson(ctx context.Context, p pricing.ExposureNotification) {
	if p.SalespersonID == nil {
		return
	}
	email := n.lookupEmail(ctx, "sales_team", *p.SalespersonID)
	if email == "" {
		n.logger.Info("exposure notifier: no salesperson email; skipping", "salesperson_id", *p.SalespersonID, "quote_id", p.QuoteID)
		return
	}
	subject := fmt.Sprintf("Price exposure on quote %s — %s", p.QuoteShortID, p.EventType)
	body := salespersonBody(p)
	if err := n.email.SendDeliveryNotification(ctx, email, subject, body); err != nil {
		n.logger.Error("exposure notifier: salesperson email failed", "to", email, "quote_id", p.QuoteID, "err", err)
	}
}

func (n *ExposureNotifier) notifyCustomer(ctx context.Context, p pricing.ExposureNotification) {
	email := n.lookupEmail(ctx, "customers", p.CustomerID)
	if email == "" {
		n.logger.Info("exposure notifier: no customer email; skipping", "customer_id", p.CustomerID, "quote_id", p.QuoteID)
		return
	}
	subject := fmt.Sprintf("Update to your quote %s", p.QuoteShortID)
	body := customerBody(p)
	if err := n.email.SendDeliveryNotification(ctx, email, subject, body); err != nil {
		n.logger.Error("exposure notifier: customer email failed", "to", email, "quote_id", p.QuoteID, "err", err)
	}
}

// lookupEmail resolves an email from a known table (sales_team or customers).
// The table arg is a fixed internal constant, never user input.
func (n *ExposureNotifier) lookupEmail(ctx context.Context, table string, id uuid.UUID) string {
	if n.db == nil {
		return ""
	}
	var query string
	switch table {
	case "sales_team":
		query = `SELECT COALESCE(email, '') FROM sales_team WHERE id = $1`
	case "customers":
		query = `SELECT COALESCE(email, '') FROM customers WHERE id = $1`
	default:
		return ""
	}
	var email string
	if err := n.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(&email); err != nil {
		n.logger.Debug("exposure notifier: email lookup failed", "table", table, "id", id, "err", err)
		return ""
	}
	return email
}

func salespersonBody(p pricing.ExposureNotification) string {
	switch p.EventType {
	case pricing.EventEscalated:
		return fmt.Sprintf(
			"Quote %s for %s auto-escalated on index %s (%.2f%% move). Line price moved from $%.2f to $%.2f. Estimated exposure $%.2f.",
			p.QuoteShortID, p.CustomerName, p.IndexCode, p.DeltaPct, p.OldPrice, p.NewPrice, p.ExposureDollars)
	case pricing.EventAckRequired:
		return fmt.Sprintf(
			"Quote %s for %s requires customer acknowledgment: index %s moved %.2f%% (estimated exposure $%.2f). Shipment is blocked until acknowledged.",
			p.QuoteShortID, p.CustomerName, p.IndexCode, p.DeltaPct, p.ExposureDollars)
	default: // FLAGGED
		return fmt.Sprintf(
			"Quote %s for %s flagged for re-quote: index %s moved %.2f%% (estimated exposure $%.2f).",
			p.QuoteShortID, p.CustomerName, p.IndexCode, p.DeltaPct, p.ExposureDollars)
	}
}

func customerBody(p pricing.ExposureNotification) string {
	switch p.EventType {
	case pricing.EventEscalated:
		return fmt.Sprintf(
			"Due to a %.2f%% move in the %s lumber index since your quote was issued, pricing on quote %s has been adjusted per your price-escalation agreement.",
			p.DeltaPct, p.IndexCode, p.QuoteShortID)
	default: // ACKNOWLEDGED
		return fmt.Sprintf(
			"Thank you — we've recorded your acknowledgment of the current market pricing on quote %s. Your order can now proceed.",
			p.QuoteShortID)
	}
}
