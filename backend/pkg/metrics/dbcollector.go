package metrics

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StartDBPoolCollector periodically samples pgxpool stats and updates
// Prometheus gauges. Call this once at startup; it runs in a background
// goroutine and stops when ctx is cancelled.
func StartDBPoolCollector(ctx context.Context, pool *pgxpool.Pool, interval time.Duration) {
	// Capture initial values
	var lastAcquireCount int64

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				stat := pool.Stat()

				DBPoolMaxConns.Set(float64(stat.MaxConns()))
				DBPoolCurrentConns.Set(float64(stat.TotalConns()))
				DBPoolIdleConns.Set(float64(stat.IdleConns()))

				currentAcquires := stat.AcquireCount()
				if currentAcquires > lastAcquireCount {
					DBPoolAcquireCount.Add(float64(currentAcquires - lastAcquireCount))
					lastAcquireCount = currentAcquires
				}

				acquireDur := stat.AcquireDuration()
				if acquireDur > 0 {
					DBPoolAcquireDuration.Observe(acquireDur.Seconds())
				}

				slog.Debug("db pool stats",
					"total", stat.TotalConns(),
					"idle", stat.IdleConns(),
					"acquired", stat.AcquiredConns(),
					"max", stat.MaxConns(),
				)
			}
		}
	}()
}
