package notification

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"testing"
)

// stubEmail records every email it's asked to send. SendDeliveryNotification
// is the only method exercised by the exposure notifier.
type stubEmail struct {
	mu     sync.Mutex
	sent   []struct{ To, Subject, Body string }
	failErr error
}

func (s *stubEmail) SendInvoice(_ context.Context, _ string, _ string, _ []byte) error { return nil }
func (s *stubEmail) SendDeliveryNotification(_ context.Context, to, subject, body string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failErr != nil {
		return s.failErr
	}
	s.sent = append(s.sent, struct{ To, Subject, Body string }{to, subject, body})
	return nil
}

func newTestNotifier() (*ExposureNotifier, *stubEmail) {
	em := &stubEmail{}
	return NewExposureNotifier(nil, em, slog.Default()), em
}

func TestExposureNotifier_FlaggedRateLimitedToOncePerDay(t *testing.T) {
	n, _ := newTestNotifier()
	ev := ExposureEvent{
		EventType:     ExposureEventFlagged,
		QuoteShortID:  "Q-1",
		SalespersonID: "marcus",
		IndexCode:     "RL_SPF_2X4",
		CustomerName:  "Cascade",
		ExposureDollars: 4200,
		DeltaPct:      7.0,
	}

	// First call records the timestamp into the rate-limit bucket.
	n.Notify(context.Background(), ev)
	// Second call within the 24h window should be a no-op (no panics, no errors).
	n.Notify(context.Background(), ev)

	// We can't directly assert "didn't fire" without an injection point, but
	// rate-limiting state is observable via the bucket map. Confirm one entry.
	if len(n.rateBuckets) != 1 {
		t.Errorf("expected one bucket entry after two FLAGGED calls, got %d", len(n.rateBuckets))
	}
}

func TestExposureNotifier_EscalatedBypassesRateLimit(t *testing.T) {
	// ESCALATED is an outcome notification — must always fire and must trigger
	// the customer-facing email when CustomerEmail is set.
	n, em := newTestNotifier()
	ev := ExposureEvent{
		EventType:     ExposureEventEscalated,
		QuoteShortID:  "Q-2",
		SalespersonID: "marcus",
		IndexCode:     "RL_SPF_2X4",
		CustomerName:  "Cascade",
		CustomerEmail: "ap@cascade.example",
		OldPrice:      6.00,
		NewPrice:      6.42,
	}
	n.Notify(context.Background(), ev)
	n.Notify(context.Background(), ev)

	if len(em.sent) != 2 {
		t.Errorf("ESCALATED must bypass rate-limit; expected 2 emails, got %d", len(em.sent))
	}
	if len(em.sent) > 0 && em.sent[0].To != "ap@cascade.example" {
		t.Errorf("wrong recipient: %q", em.sent[0].To)
	}
}

func TestExposureNotifier_ClearedBypassesRateLimit(t *testing.T) {
	n, _ := newTestNotifier()
	ev := ExposureEvent{
		EventType:     ExposureEventCleared,
		QuoteShortID:  "Q-3",
		SalespersonID: "marcus",
		IndexCode:     "RL_SPF_2X4",
		CustomerName:  "Cascade",
	}
	n.Notify(context.Background(), ev)
	n.Notify(context.Background(), ev)

	// CLEARED should not populate the rate-limit bucket at all
	if len(n.rateBuckets) != 0 {
		t.Errorf("CLEARED must not record rate-limit state; got %d buckets", len(n.rateBuckets))
	}
}

func TestExposureNotifier_EmailFailureIsSwallowed(t *testing.T) {
	// Customer-facing email transport failure must not propagate (best-effort).
	n, em := newTestNotifier()
	em.failErr = errors.New("smtp down")
	ev := ExposureEvent{
		EventType:     ExposureEventEscalated,
		QuoteShortID:  "Q-4",
		SalespersonID: "marcus",
		CustomerEmail: "ap@cascade.example",
	}
	// Should not panic or otherwise blow up.
	n.Notify(context.Background(), ev)
}

func TestExposureNotifier_NoCustomerEmail_OmitsCustomerSend(t *testing.T) {
	n, em := newTestNotifier()
	ev := ExposureEvent{
		EventType:     ExposureEventEscalated,
		QuoteShortID:  "Q-5",
		SalespersonID: "marcus",
		// no CustomerEmail
	}
	n.Notify(context.Background(), ev)
	if len(em.sent) != 0 {
		t.Errorf("must not send when CustomerEmail empty; got %d", len(em.sent))
	}
}

func TestExposureNotifier_AckRequiredRateLimited(t *testing.T) {
	n, _ := newTestNotifier()
	ev := ExposureEvent{
		EventType:     ExposureEventAckRequired,
		QuoteShortID:  "Q-6",
		SalespersonID: "carla",
		IndexCode:     "RL_SPF_2X4",
		CustomerName:  "Patel",
	}
	n.Notify(context.Background(), ev)
	n.Notify(context.Background(), ev)
	// Same as FLAGGED — rate-limited to one per day.
	if len(n.rateBuckets) != 1 {
		t.Errorf("expected one bucket entry, got %d", len(n.rateBuckets))
	}
}

func TestExposureNotifier_DifferentSalespeopleDontShareBucket(t *testing.T) {
	n, _ := newTestNotifier()
	common := ExposureEvent{
		EventType: ExposureEventFlagged,
		IndexCode: "RL_SPF_2X4",
	}
	for _, sp := range []string{"marcus", "alex", "casey"} {
		ev := common
		ev.SalespersonID = sp
		n.Notify(context.Background(), ev)
	}
	if len(n.rateBuckets) != 3 {
		t.Errorf("expected three buckets for three salespeople, got %d", len(n.rateBuckets))
	}
}

func TestExposureNotifier_BucketGCWhenLarge(t *testing.T) {
	// Sanity: the GC code path triggers on >500 entries; we just exercise it
	// without asserting specific timing to avoid time-based flakes.
	n, _ := newTestNotifier()
	for i := 0; i < 600; i++ {
		ev := ExposureEvent{
			EventType:     ExposureEventFlagged,
			SalespersonID: "sp-" + string(rune('A'+i%26)) + "-" + string(rune('a'+(i/26)%26)),
			IndexCode:     "IDX-" + string(rune('a'+i%26)),
		}
		n.Notify(context.Background(), ev)
	}
	// No assertion on exact count — just that the call didn't deadlock or panic.
	if len(n.rateBuckets) == 0 {
		t.Errorf("expected some buckets after 600 calls")
	}
}
