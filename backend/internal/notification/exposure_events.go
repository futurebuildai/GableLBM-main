package notification

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// ExposureEventType identifies what kind of exposure event is being notified.
type ExposureEventType string

const (
	ExposureEventFlagged     ExposureEventType = "FLAGGED"
	ExposureEventEscalated   ExposureEventType = "ESCALATED"
	ExposureEventAckRequired ExposureEventType = "ACK_REQUIRED"
	ExposureEventCleared     ExposureEventType = "CLEARED"
)

// ExposureEvent is the payload the notifier receives from the pricing module.
// The struct is defined here (not in pricing) so the notification package
// stays self-contained, mirroring the DeliveryEvent pattern. The adapter in
// cmd/server/main.go bridges pricing.{Flagged,Escalated,...}Event to this
// shape.
type ExposureEvent struct {
	EventType       ExposureEventType
	QuoteID         string
	QuoteShortID    string
	SalespersonID   string
	SalespersonName string
	CustomerName    string
	CustomerEmail   string
	ExposureDollars float64
	IndexCode       string
	DeltaPct        float64
	OldPrice        float64
	NewPrice        float64
}

// ExposureNotifier sends in-app/email notifications on quote-exposure events.
// Implements rate-limiting per (salesperson, index, event_type) per day to
// avoid alert fatigue (NFR §3.2 — "≤ 1 in-app notification per salesperson
// per index per day"). Best-effort: transport failures are logged but never
// returned to the caller.
type ExposureNotifier struct {
	sms    SMSService
	email  EmailService
	logger *slog.Logger

	mu        sync.Mutex
	rateBuckets map[string]time.Time
}

// NewExposureNotifier creates the notifier. sms can be nil — exposure events
// don't fan out to SMS by default (in-app + email only). email and logger
// must be non-nil.
func NewExposureNotifier(sms SMSService, email EmailService, logger *slog.Logger) *ExposureNotifier {
	if logger == nil {
		logger = slog.Default()
	}
	return &ExposureNotifier{
		sms:         sms,
		email:       email,
		logger:      logger,
		rateBuckets: map[string]time.Time{},
	}
}

// Notify is the single entry point. The event_type determines which template
// is rendered and which channel(s) are used. ESCALATED events generate a
// customer-facing email (when CustomerEmail is set) describing the auto-
// adjusted price.
func (n *ExposureNotifier) Notify(ctx context.Context, event ExposureEvent) {
	if n.rateLimited(event) {
		n.logger.Debug("exposure notification rate-limited",
			"salesperson_id", event.SalespersonID,
			"index", event.IndexCode,
			"type", event.EventType,
		)
		return
	}

	switch event.EventType {
	case ExposureEventFlagged:
		n.sendInternal(ctx, event,
			fmt.Sprintf("Quote %s flagged — %s moved %.2f%%. $%.2f exposure on %s.",
				event.QuoteShortID, event.IndexCode, event.DeltaPct, event.ExposureDollars, event.CustomerName),
		)

	case ExposureEventEscalated:
		n.sendInternal(ctx, event,
			fmt.Sprintf("Quote %s auto-escalated — %s now $%.4f (was $%.4f).",
				event.QuoteShortID, event.IndexCode, event.NewPrice, event.OldPrice),
		)
		if event.CustomerEmail != "" && n.email != nil {
			subject := fmt.Sprintf("Price update on quote %s", event.QuoteShortID)
			body := fmt.Sprintf(
				"Hi %s,\n\nPer your annual escalation agreement, we've adjusted the unit price on quote %s to reflect the latest %s index value.\n\nNew price: $%.4f (was $%.4f).\n\nReply to this email if you have any questions.",
				event.CustomerName, event.QuoteShortID, event.IndexCode, event.NewPrice, event.OldPrice,
			)
			// Reuse SendDeliveryNotification as the generic (to, subject, body)
			// transport — the EmailService interface predates this feature and
			// only exposes that and SendInvoice. A generic Send method is a
			// follow-up cleanup.
			if err := n.email.SendDeliveryNotification(ctx, event.CustomerEmail, subject, body); err != nil {
				n.logger.Warn("exposure: customer escalation email failed", "to", event.CustomerEmail, "err", err)
			}
		}

	case ExposureEventAckRequired:
		n.sendInternal(ctx, event,
			fmt.Sprintf("Quote %s requires customer acknowledgment — $%.2f index exposure on %s before shipment.",
				event.QuoteShortID, event.ExposureDollars, event.CustomerName),
		)

	case ExposureEventCleared:
		n.sendInternal(ctx, event,
			fmt.Sprintf("Quote %s is back in the clear — %s exposure has resolved.",
				event.QuoteShortID, event.CustomerName),
		)

	default:
		n.logger.Warn("exposure: unknown event type", "type", event.EventType)
	}
}

// sendInternal posts a notification destined for the assigned salesperson.
// v1 implementation: log the message; once the in-app notification table is
// available (or migrated to NATS), this is the swap point.
func (n *ExposureNotifier) sendInternal(_ context.Context, event ExposureEvent, body string) {
	n.logger.Info("exposure notification",
		"to_salesperson_id", event.SalespersonID,
		"to_salesperson", event.SalespersonName,
		"quote_id", event.QuoteID,
		"type", event.EventType,
		"body", body,
	)
}

// rateLimited returns true if a similar event was already notified within
// the rate window (24h per salesperson+index+event_type). Cleared/Escalated
// events bypass rate-limiting because they're outcome notifications, not
// noise.
func (n *ExposureNotifier) rateLimited(event ExposureEvent) bool {
	if event.EventType == ExposureEventCleared || event.EventType == ExposureEventEscalated {
		return false
	}
	if event.SalespersonID == "" || event.IndexCode == "" {
		return false
	}
	key := fmt.Sprintf("%s|%s|%s", event.SalespersonID, event.IndexCode, event.EventType)
	now := time.Now()

	n.mu.Lock()
	defer n.mu.Unlock()
	if last, ok := n.rateBuckets[key]; ok && now.Sub(last) < 24*time.Hour {
		return true
	}
	n.rateBuckets[key] = now
	// Garbage-collect stale entries opportunistically.
	if len(n.rateBuckets) > 500 {
		cutoff := now.Add(-48 * time.Hour)
		for k, t := range n.rateBuckets {
			if t.Before(cutoff) {
				delete(n.rateBuckets, k)
			}
		}
	}
	return false
}
