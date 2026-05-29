package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

// maxDeliver bounds JetStream redelivery attempts before a message is treated
// as poison and terminated (dropped from the work queue).
const maxDeliver = 5

// natsBus is the durable JetStream-backed transport. The stream is file-backed
// with WorkQueue retention so an acked message is removed once the single
// durable consumer has processed it.
type natsBus struct {
	nc  *nats.Conn
	js  nats.JetStreamContext
	cfg Config

	mu   sync.Mutex
	subs []*nats.Subscription
}

func newNATSBus(cfg Config) (*natsBus, error) {
	// RetryOnFailedConnect(false) + a bounded Timeout guarantee that a missing
	// or unhealthy NATS surfaces as an error here (so New() can fall back)
	// rather than blocking boot. MaxReconnects(-1) keeps trying to reconnect
	// in the background once we ARE connected, so transient outages self-heal.
	nc, err := nats.Connect(cfg.URL,
		nats.Timeout(cfg.ConnectTimeout),
		nats.RetryOnFailedConnect(false),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
		nats.Name("gablelbm-eventbus"),
		nats.DisconnectErrHandler(func(_ *nats.Conn, e error) {
			slog.Warn("eventbus(nats): disconnected", "error", e)
		}),
		nats.ReconnectHandler(func(c *nats.Conn) {
			slog.Info("eventbus(nats): reconnected", "url", c.ConnectedUrl())
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}

	js, err := nc.JetStream(nats.PublishAsyncMaxPending(256))
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("jetstream context: %w", err)
	}

	b := &natsBus{nc: nc, js: js, cfg: cfg}
	if err := b.ensureStream(); err != nil {
		nc.Close()
		return nil, err
	}
	return b, nil
}

// ensureStream creates the work-queue stream if it does not already exist.
// Existing streams are left untouched (config drift is not reconciled here).
func (b *natsBus) ensureStream() error {
	if _, err := b.js.StreamInfo(b.cfg.StreamName); err == nil {
		return nil
	}
	_, err := b.js.AddStream(&nats.StreamConfig{
		Name:      b.cfg.StreamName,
		Subjects:  b.cfg.Subjects,
		Storage:   nats.FileStorage,
		Retention: nats.WorkQueuePolicy,
		Discard:   nats.DiscardOld,
		MaxAge:    7 * 24 * time.Hour,
		Duplicates: 10 * time.Minute,
	})
	if err != nil {
		return fmt.Errorf("add stream %q: %w", b.cfg.StreamName, err)
	}
	return nil
}

func (b *natsBus) Backend() Backend { return BackendNATS }

func (b *natsBus) Publish(ctx context.Context, subject string, payload json.RawMessage) error {
	e := NewEvent(subject, payload)
	data, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	// Nats-Msg-Id enables JetStream server-side dedup within the stream's
	// Duplicates window, collapsing accidental double-publishes.
	_, err = b.js.Publish(subject, data, nats.MsgId(e.EventID), nats.Context(ctx))
	if err != nil {
		return fmt.Errorf("publish %q: %w", subject, err)
	}
	return nil
}

func (b *natsBus) Subscribe(pattern, durable string, h Handler) error {
	sub, err := b.js.Subscribe(pattern, func(msg *nats.Msg) {
		var e Event
		if err := json.Unmarshal(msg.Data, &e); err != nil {
			// Unparseable message can never succeed — terminate it.
			slog.Error("eventbus(nats): malformed event, terminating",
				"durable", durable, "error", err)
			_ = msg.Term()
			return
		}
		if err := h(context.Background(), e); err != nil {
			meta, mErr := msg.Metadata()
			if mErr == nil && meta.NumDelivered >= maxDeliver {
				slog.Error("eventbus(nats): poison event, terminating",
					"durable", durable, "subject", e.Subject,
					"event_id", e.EventID, "delivered", meta.NumDelivered, "error", err)
				_ = msg.Term()
				return
			}
			slog.Warn("eventbus(nats): handler error, will redeliver",
				"durable", durable, "subject", e.Subject,
				"event_id", e.EventID, "error", err)
			_ = msg.Nak()
			return
		}
		_ = msg.Ack()
	},
		nats.Durable(durable),
		nats.ManualAck(),
		nats.AckExplicit(),
		nats.MaxDeliver(maxDeliver),
		nats.AckWait(30*time.Second),
		nats.BindStream(b.cfg.StreamName),
	)
	if err != nil {
		return fmt.Errorf("subscribe %q (durable %q): %w", pattern, durable, err)
	}
	b.mu.Lock()
	b.subs = append(b.subs, sub)
	b.mu.Unlock()
	return nil
}

func (b *natsBus) Close(ctx context.Context) error {
	b.mu.Lock()
	subs := make([]*nats.Subscription, len(b.subs))
	copy(subs, b.subs)
	b.mu.Unlock()

	for _, s := range subs {
		_ = s.Drain()
	}
	// Flush any pending async publishes, bounded by ctx.
	if deadline, ok := ctx.Deadline(); ok {
		_ = b.nc.FlushTimeout(time.Until(deadline))
	} else {
		_ = b.nc.Flush()
	}
	b.nc.Close()
	return nil
}
