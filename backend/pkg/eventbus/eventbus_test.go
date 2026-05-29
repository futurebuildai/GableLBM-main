package eventbus

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestSubjectMatch(t *testing.T) {
	cases := []struct {
		pattern, subject string
		want             bool
	}{
		{"quote.exposure.flagged", "quote.exposure.flagged", true},
		{"quote.exposure.flagged", "quote.exposure.escalated", false},
		{"quote.exposure.>", "quote.exposure.flagged", true},
		{"quote.exposure.>", "quote.exposure.escalated", true},
		{"quote.exposure.>", "quote.exposure", false}, // ">" needs >=1 trailing token
		{"quote.exposure.>", "quote.exposure.a.b", true},
		{"quote.*.flagged", "quote.exposure.flagged", true},
		{"quote.*.flagged", "quote.exposure.escalated", false},
		{"quote.*", "quote.exposure.flagged", false}, // "*" is exactly one token
		{"quote.exposure", "quote.exposure.flagged", false},
	}
	for _, c := range cases {
		if got := subjectMatch(c.pattern, c.subject); got != c.want {
			t.Errorf("subjectMatch(%q, %q) = %v, want %v", c.pattern, c.subject, got, c.want)
		}
	}
}

func TestInProcessDelivery(t *testing.T) {
	bus := newInProcessBus()
	defer bus.Close(context.Background())

	var mu sync.Mutex
	received := map[string]int{}
	done := make(chan struct{}, 3)

	if err := bus.Subscribe(SubjectExposureAll, "test-all", func(_ context.Context, e Event) error {
		mu.Lock()
		received[e.Subject]++
		mu.Unlock()
		done <- struct{}{}
		return nil
	}); err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	subjects := []string{SubjectExposureFlagged, SubjectExposureEscalated, SubjectExposureCleared}
	for _, s := range subjects {
		if err := bus.Publish(context.Background(), s, json.RawMessage(`{"k":1}`)); err != nil {
			t.Fatalf("publish %s: %v", s, err)
		}
	}

	for i := 0; i < len(subjects); i++ {
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for delivery %d", i)
		}
	}

	mu.Lock()
	defer mu.Unlock()
	for _, s := range subjects {
		if received[s] != 1 {
			t.Errorf("subject %s: got %d deliveries, want 1", s, received[s])
		}
	}
}

func TestInProcessSubjectFiltering(t *testing.T) {
	bus := newInProcessBus()
	defer bus.Close(context.Background())

	got := make(chan string, 4)
	if err := bus.Subscribe(SubjectExposureFlagged, "only-flagged", func(_ context.Context, e Event) error {
		got <- e.Subject
		return nil
	}); err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	_ = bus.Publish(context.Background(), SubjectExposureEscalated, json.RawMessage(`{}`))
	_ = bus.Publish(context.Background(), SubjectExposureFlagged, json.RawMessage(`{}`))

	select {
	case s := <-got:
		if s != SubjectExposureFlagged {
			t.Fatalf("got subject %q, want %q", s, SubjectExposureFlagged)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected flagged delivery")
	}

	// The escalated event must NOT have been delivered to this subscriber.
	select {
	case s := <-got:
		t.Fatalf("unexpected extra delivery: %q", s)
	case <-time.After(100 * time.Millisecond):
	}
}

// TestNewFallback verifies that an empty URL and an unreachable URL both yield
// a working in-process bus (never nil, never a NATS bus).
func TestNewFallback(t *testing.T) {
	empty := New(Config{URL: ""})
	if empty == nil || empty.Backend() != BackendInProcess {
		t.Fatalf("empty URL: want in-process bus, got %#v", empty)
	}
	_ = empty.Close(context.Background())

	// Unreachable port — connect must time out fast and fall back.
	unreachable := New(Config{URL: "nats://127.0.0.1:1", ConnectTimeout: 500 * time.Millisecond})
	if unreachable == nil || unreachable.Backend() != BackendInProcess {
		t.Fatalf("unreachable URL: want in-process fallback, got %#v", unreachable)
	}
	_ = unreachable.Close(context.Background())
}
