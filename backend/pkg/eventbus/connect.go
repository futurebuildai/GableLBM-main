package eventbus

import (
	"log/slog"
	"time"
)

const (
	defaultConnectTimeout = 2 * time.Second
	defaultStreamName     = "QUOTE_EXPOSURE"
)

// New constructs a Bus from cfg. It attempts a NATS JetStream connection when
// cfg.URL is set and reachable within the connect timeout; on any failure it
// logs and transparently falls back to the in-process backend so the process
// always boots. The returned Bus is never nil.
func New(cfg Config) Bus {
	if cfg.ConnectTimeout <= 0 {
		cfg.ConnectTimeout = defaultConnectTimeout
	}
	if cfg.StreamName == "" {
		cfg.StreamName = defaultStreamName
	}
	if len(cfg.Subjects) == 0 {
		cfg.Subjects = []string{SubjectExposureAll}
	}

	if cfg.URL == "" {
		slog.Info("eventbus: NATS_URL unset, using in-process backend")
		return newInProcessBus()
	}

	bus, err := newNATSBus(cfg)
	if err != nil {
		slog.Warn("eventbus: NATS unavailable, falling back to in-process backend",
			"url", cfg.URL, "error", err)
		return newInProcessBus()
	}
	slog.Info("eventbus: connected to NATS JetStream", "url", cfg.URL, "stream", cfg.StreamName)
	return bus
}
