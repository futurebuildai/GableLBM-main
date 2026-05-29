// Package eventbus provides a thin publish/subscribe seam for decoupled,
// best-effort domain events (currently lumber quote price-exposure events).
//
// It deliberately hides the transport behind small interfaces so that no
// producer or consumer imports nats.go directly. Two backends are available:
//
//   - NATS JetStream (durable, at-least-once) when NATS_URL is configured and
//     reachable at boot.
//   - An in-process worker (fire-and-forget, best-effort) otherwise.
//
// The in-process fallback is intentional: the Digital Ocean demo/staging
// deploys run no NATS service, so the feature must degrade gracefully there
// rather than fail to boot. Publishing is always non-blocking and best-effort;
// callers must NOT depend on delivery for correctness (durable state lives in
// Postgres, the bus only drives side-effects like notifications).
package eventbus

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Subject constants for the quote price-exposure domain. The trailing
// wildcard (SubjectExposureAll) follows NATS token semantics: ">" matches one
// or more trailing tokens. The in-process backend implements the same match.
const (
	SubjectExposureFlagged     = "quote.exposure.flagged"
	SubjectExposureEscalated   = "quote.exposure.escalated"
	SubjectExposureAckRequired = "quote.exposure.ack_required"
	SubjectExposureAcknowledged = "quote.exposure.acknowledged"
	SubjectExposureCleared     = "quote.exposure.cleared"

	// SubjectExposureAll matches every quote.exposure.* subject.
	SubjectExposureAll = "quote.exposure.>"
)

// Backend identifies which transport a Bus is using.
type Backend string

const (
	BackendNATS      Backend = "nats"
	BackendInProcess Backend = "inprocess"
)

// Event is the envelope carried over the bus. EventID is stable per logical
// event and is used for transport-level dedup (NATS Nats-Msg-Id) and for
// idempotent consumer handling. Payload is opaque JSON.
type Event struct {
	EventID    string          `json:"event_id"`
	Subject    string          `json:"subject"`
	OccurredAt time.Time       `json:"occurred_at"`
	Payload    json.RawMessage `json:"payload"`
}

// NewEvent builds an Event with a fresh random EventID. Use this when the
// caller has no natural idempotency key; otherwise prefer NewEventWithID so
// retries collapse to a single logical event.
func NewEvent(subject string, payload json.RawMessage) Event {
	return NewEventWithID(uuid.NewString(), subject, payload)
}

// NewEventWithID builds an Event with a caller-supplied stable ID. The ID
// should be deterministic for a given logical occurrence (e.g. derived from
// the exposure event's idempotency key) so that redeliveries dedup.
func NewEventWithID(id, subject string, payload json.RawMessage) Event {
	return Event{
		EventID:    id,
		Subject:    subject,
		OccurredAt: time.Now().UTC(),
		Payload:    payload,
	}
}

// Handler processes a delivered Event. Returning an error signals the backend
// that delivery failed; durable backends may redeliver up to their configured
// limit. Handlers must be idempotent.
type Handler func(ctx context.Context, e Event) error

// Publisher publishes events. Publish is best-effort and non-blocking: it must
// never block the caller's request path and must not hard-fail when the
// backend is degraded. A returned error is informational (e.g. marshal
// failure) and callers typically log-and-continue.
type Publisher interface {
	Publish(ctx context.Context, subject string, payload json.RawMessage) error
}

// Subscriber registers durable handlers for a subject pattern. durable names
// the consumer (used by JetStream for durable cursors; ignored in-process).
type Subscriber interface {
	Subscribe(pattern, durable string, h Handler) error
}

// Bus is the full event bus surface: publish, subscribe, introspect backend,
// and graceful close.
type Bus interface {
	Publisher
	Subscriber
	// Backend reports the active transport for logging/observability.
	Backend() Backend
	// Close flushes/stops the backend, honoring ctx for shutdown deadlines.
	Close(ctx context.Context) error
}

// Config controls bus construction. An empty URL forces the in-process
// backend. StreamName/Durable are JetStream-specific and ignored in-process.
type Config struct {
	// URL is the NATS server URL (e.g. nats://localhost:4222). Empty selects
	// the in-process backend.
	URL string
	// ConnectTimeout bounds the initial NATS dial so a missing/unhealthy
	// NATS never delays boot. Defaults to 2s when zero.
	ConnectTimeout time.Duration
	// StreamName is the JetStream stream to bind (file-backed). Defaults to
	// "QUOTE_EXPOSURE".
	StreamName string
	// Subjects bound to the stream. Defaults to ["quote.exposure.>"].
	Subjects []string
}
