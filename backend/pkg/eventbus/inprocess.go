package eventbus

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
)

// inProcessBus is the zero-dependency fallback transport. It fans events out
// to in-memory subscribers via a single buffered worker goroutine.
//
// Semantics (intentionally weaker than JetStream):
//   - Best-effort, at-most-once: if the buffer is full, Publish drops the
//     event (logged) rather than blocking the caller.
//   - No persistence: events are lost on restart. Acceptable because durable
//     state lives in Postgres; the bus only drives side-effects.
//   - Subscriptions registered after an event is published do not see it.
type inProcessBus struct {
	mu          sync.RWMutex
	subscribers []subscription
	queue       chan Event
	wg          sync.WaitGroup
	closeOnce   sync.Once
	done        chan struct{}
}

type subscription struct {
	pattern string
	durable string
	handler Handler
}

const inProcessBuffer = 1024

func newInProcessBus() *inProcessBus {
	b := &inProcessBus{
		queue: make(chan Event, inProcessBuffer),
		done:  make(chan struct{}),
	}
	b.wg.Add(1)
	go b.worker()
	return b
}

func (b *inProcessBus) Backend() Backend { return BackendInProcess }

func (b *inProcessBus) Publish(_ context.Context, subject string, payload json.RawMessage) error {
	e := NewEvent(subject, payload)
	select {
	case b.queue <- e:
		return nil
	default:
		// Send-or-drop: never block a request path on a saturated buffer.
		slog.Warn("eventbus(inprocess): queue full, dropping event",
			"subject", subject, "event_id", e.EventID)
		return nil
	}
}

func (b *inProcessBus) Subscribe(pattern, durable string, h Handler) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.subscribers = append(b.subscribers, subscription{pattern: pattern, durable: durable, handler: h})
	return nil
}

func (b *inProcessBus) worker() {
	defer b.wg.Done()
	for {
		select {
		case <-b.done:
			return
		case e := <-b.queue:
			b.dispatch(e)
		}
	}
}

func (b *inProcessBus) dispatch(e Event) {
	b.mu.RLock()
	subs := make([]subscription, len(b.subscribers))
	copy(subs, b.subscribers)
	b.mu.RUnlock()

	for _, s := range subs {
		if !subjectMatch(s.pattern, e.Subject) {
			continue
		}
		// Each handler gets a fresh background context; the originating
		// request may already be gone by the time the worker runs.
		if err := s.handler(context.Background(), e); err != nil {
			slog.Error("eventbus(inprocess): handler error",
				"durable", s.durable, "subject", e.Subject,
				"event_id", e.EventID, "error", err)
		}
	}
}

func (b *inProcessBus) Close(ctx context.Context) error {
	b.closeOnce.Do(func() { close(b.done) })
	doneCh := make(chan struct{})
	go func() {
		b.wg.Wait()
		close(doneCh)
	}()
	select {
	case <-doneCh:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// subjectMatch implements NATS token-wildcard matching for the subset we use:
//   - "*" matches exactly one token
//   - ">" matches one or more trailing tokens (must be the final token)
//
// Tokens are dot-delimited.
func subjectMatch(pattern, subject string) bool {
	if pattern == subject {
		return true
	}
	pt := strings.Split(pattern, ".")
	st := strings.Split(subject, ".")
	for i, p := range pt {
		if p == ">" {
			// ">" must be the last pattern token and matches >=1 remaining.
			return i == len(pt)-1 && i < len(st)
		}
		if i >= len(st) {
			return false
		}
		if p == "*" {
			continue
		}
		if p != st[i] {
			return false
		}
	}
	return len(pt) == len(st)
}
