package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

// HTTP request metrics
var (
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests processed.",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duration of HTTP requests in seconds.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		},
		[]string{"method", "path"},
	)

	HTTPRequestsInFlight = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "Number of HTTP requests currently being processed.",
		},
	)
)

// DB pool metrics
var (
	DBPoolMaxConns = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "db_pool_max_conns",
			Help: "Maximum number of connections in the pool.",
		},
	)

	DBPoolCurrentConns = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "db_pool_current_conns",
			Help: "Current number of connections in the pool.",
		},
	)

	DBPoolIdleConns = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "db_pool_idle_conns",
			Help: "Number of idle connections in the pool.",
		},
	)

	DBPoolAcquireCount = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "db_pool_acquire_total",
			Help: "Total number of pool connection acquisitions.",
		},
	)

	DBPoolAcquireDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "db_pool_acquire_duration_seconds",
			Help:    "Time spent acquiring connections from the pool.",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		},
	)
)

// Register registers all application metrics with the default Prometheus registry.
func Register() {
	prometheus.MustRegister(
		// HTTP
		HTTPRequestsTotal,
		HTTPRequestDuration,
		HTTPRequestsInFlight,
		// DB pool
		DBPoolMaxConns,
		DBPoolCurrentConns,
		DBPoolIdleConns,
		DBPoolAcquireCount,
		DBPoolAcquireDuration,
	)

	// Go runtime metrics (goroutines, memory, GC)
	prometheus.MustRegister(collectors.NewBuildInfoCollector())
}
