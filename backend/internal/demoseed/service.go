// Package demoseed keeps demo.gablelbm.com stocked with a rolling window of
// FUTURE-dated CONFIRMED orders so date-dependent modules (notably AI_LM, which
// pulls upcoming deliveries by scheduled_delivery_date) always have something to
// plan. It is the COMM-1 pillar-1 nightly fresh-data injection cron.
//
// Service is the single writer for demo orders: it owns the order-creation path
// (reused by both the nightly Scheduler and the integrations demo-seed endpoint
// `POST /api/integration/demo/seed-orders`) so there is exactly ONE place that
// creates seeded orders. It mirrors the auto-reorder feature's shape — gated by
// system_settings keys, one demo_seed_runs observability row per run.
package demoseed

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"strconv"
	"time"

	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Settings keys consumed by the demo-seed scheduler, stored in system_settings.
// An operator flips demo_seed.enabled to "true" to activate the nightly cron.
const (
	settingEnabled    = "demo_seed.enabled"
	settingCron       = "demo_seed.cron"
	settingWindowDays = "demo_seed.window_days"

	// Defaults applied when a setting is absent or blank.
	defaultCron       = "0 0 3 * * *" // 03:00 daily (seconds-precision cron, America/Vancouver)
	defaultWindowDays = 7

	runStatusRunning = "RUNNING"
	runStatusSuccess = "SUCCESS"
	runStatusFailed  = "FAILED"
)

// settingsReader is the minimal interface the service needs to read its
// configuration. Abstracted so unit tests can supply a map without Postgres.
type settingsReader interface {
	Get(ctx context.Context, key string) (string, bool, error)
}

// dbSettingsReader reads directly from the system_settings table. A missing key
// (or any error) is reported as "absent" so a config gap can't crash the cron.
type dbSettingsReader struct {
	db *database.DB
}

func (r *dbSettingsReader) Get(ctx context.Context, key string) (string, bool, error) {
	const q = `SELECT value FROM system_settings WHERE key = $1`
	var v string
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, q, key).Scan(&v); err != nil {
		return "", false, nil //nolint:nilerr
	}
	return v, true, nil
}

// Service is the single writer for demo orders plus the demo_seed_runs
// observability store and settings accessor.
type Service struct {
	db       *database.DB
	orderSvc *order.Service
	settings settingsReader
}

// NewService wires the demo-seed service to its dependencies.
func NewService(db *database.DB, orderSvc *order.Service) *Service {
	return &Service{
		db:       db,
		orderSvc: orderSvc,
		settings: &dbSettingsReader{db: db},
	}
}

// kelownaDeliveryPoints are sensible Okanagan-area delivery coordinates assigned
// round-robin to seeded orders so stops scatter realistically on AI_LM's map.
var kelownaDeliveryPoints = [][2]float64{
	{49.8888, -119.4597}, // Spall Rd, Kelowna
	{49.9201, -119.3950}, // UBCO / Summit Pkwy
	{50.0490, -119.4060}, // Lake Country
	{49.8350, -119.5760}, // Mission Hill, West Kelowna
	{49.8330, -119.6190}, // Boucherie Rd, West Kelowna
	{49.8880, -119.4960}, // Bernard Ave, Kelowna
	{49.9050, -119.4900}, // Knox Mountain Dr, Kelowna
	{49.7730, -119.7280}, // Beach Ave, Peachland
	{50.2530, -119.2750}, // Polson Dr, Vernon
	{49.6000, -119.6800}, // Prairie Valley Rd, Summerland
}

// seedProduct is a catalog product used to build seeded order lines.
type seedProduct struct {
	id    uuid.UUID
	price float64
}

// Execute runs one injection over the rolling window [tomorrow .. tomorrow+N-1]
// where N = the configured window_days. It is idempotent (dates that already
// have seeded CONFIRMED orders are skipped) and writes exactly one
// demo_seed_runs row capturing the outcome. Returns the run id and the total
// number of NEW orders created across the window. Shared by the nightly
// Scheduler tick and the manual admin trigger so both behave identically.
func (s *Service) Execute(ctx context.Context) (runID uuid.UUID, created int, err error) {
	windowDays := s.WindowDays(ctx)

	runID, err = s.StartRun(ctx, windowDays)
	if err != nil {
		return uuid.Nil, 0, err
	}

	status := runStatusSuccess
	errMsg := ""
	defer func() {
		if p := recover(); p != nil {
			status = runStatusFailed
			errMsg = fmt.Sprintf("panic: %v", p)
			err = fmt.Errorf("demoseed: panic: %v", p)
		}
		if ferr := s.FinishRun(ctx, runID, status, created, errMsg); ferr != nil {
			slog.Error("demoseed: failed to finalize run", "run_id", runID, "error", ferr)
		}
	}()

	// Seed each day in the next `windowDays` days. One day's failure aborts the
	// run (the row is stamped FAILED with the partial count) rather than masking
	// a systemic problem like a dead DB pool.
	for d := 1; d <= windowDays; d++ {
		date := time.Now().AddDate(0, 0, d)
		n, serr := s.SeedForDate(ctx, date, 0)
		created += n
		if serr != nil {
			status = runStatusFailed
			errMsg = serr.Error()
			slog.Error("demoseed: injection failed", "date", date.Format("2006-01-02"), "error", serr)
			return runID, created, serr
		}
	}
	slog.Info("demoseed: injection complete", "window_days", windowDays, "orders_created", created)
	return runID, created, nil
}

// SeedForDate ensures CONFIRMED future-dated orders exist for the given
// scheduled delivery date, reusing order.Service create+confirm so GL/AR posting
// stays consistent. count<=0 seeds one order per demo customer; a positive count
// caps the number of customers seeded. Idempotent: a customer that already has a
// CONFIRMED order on this date is skipped, so re-running adds only what's
// missing. Returns the number of NEW orders created.
//
// This is the SINGLE order-creation writer for demo data — the integrations
// demo-seed endpoint delegates here so there is one source of truth.
func (s *Service) SeedForDate(ctx context.Context, date time.Time, count int) (int, error) {
	if s.orderSvc == nil {
		return 0, fmt.Errorf("demoseed: order service not configured")
	}
	dateStr := date.Format("2006-01-02")

	// Pick lumber products that carry digital-twin geometry (migration 073) so
	// seeded lines render true-to-scale; fall back to any product so the seed
	// still works on a catalog without dimensions.
	lumber, err := s.seedLumberProducts(ctx)
	if err != nil {
		return 0, fmt.Errorf("demoseed: load products: %w", err)
	}
	if len(lumber) == 0 {
		slog.Warn("demoseed: no products available to seed orders")
		return 0, nil
	}

	// Demo customers, deterministic order for stable selection.
	rows, err := s.db.GetExecutor(ctx).Query(ctx, `SELECT id FROM customers ORDER BY name`)
	if err != nil {
		return 0, fmt.Errorf("demoseed: load customers: %w", err)
	}
	var customers []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, fmt.Errorf("demoseed: scan customer: %w", err)
		}
		customers = append(customers, id)
	}
	rows.Close()
	if len(customers) == 0 {
		slog.Warn("demoseed: no demo customers to seed orders for")
		return 0, nil
	}

	limit := count
	if limit <= 0 || limit > len(customers) {
		limit = len(customers)
	}

	created := 0
	for i := 0; i < limit; i++ {
		custID := customers[i]

		// Idempotency: skip a customer that already has a CONFIRMED order on this
		// scheduled date (a leftover DRAFT from a failed confirm does not block a retry).
		var exists bool
		if err := s.db.GetExecutor(ctx).QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id = $1 AND scheduled_delivery_date = $2::date AND status = 'CONFIRMED')`,
			custID, dateStr,
		).Scan(&exists); err != nil {
			slog.Warn("demoseed: idempotency check failed", "customer_id", custID, "error", err)
			continue
		}
		if exists {
			continue
		}

		// 2–4 dimensioned lumber lines per order.
		numLines := 2 + rand.Intn(3)
		var lines []order.OrderLineRequest
		for j := 0; j < numLines; j++ {
			p := lumber[rand.Intn(len(lumber))]
			qty := float64(10 + rand.Intn(40))
			lines = append(lines, order.OrderLineRequest{
				ProductID: p.id,
				Quantity:  qty,
				PriceEach: int64(math.Round(p.price * 100)), // money as int64 cents
			})
		}

		sched := date
		o, err := s.orderSvc.CreateOrder(ctx, order.CreateOrderRequest{
			CustomerID:            custID,
			Lines:                 lines,
			ScheduledDeliveryDate: &sched,
		})
		if err != nil {
			slog.Warn("demoseed: failed to create order", "customer_id", custID, "error", err)
			continue
		}
		// Confirm so AI_LM's CONFIRMED-only pull sees it. A confirm failure (e.g.
		// over credit limit → ON_HOLD) is logged and skipped, not fatal.
		if err := s.orderSvc.ConfirmOrder(ctx, o.ID); err != nil {
			slog.Warn("demoseed: failed to confirm order", "order_id", o.ID, "customer_id", custID, "error", err)
			continue
		}

		// Geolocated delivery stop (route_id NULL — unrouted, awaiting AI_LM
		// dispatch) so the order carries coordinates on the orders pull.
		pt := kelownaDeliveryPoints[i%len(kelownaDeliveryPoints)]
		lat := pt[0] + (rand.Float64()-0.5)*0.02
		lng := pt[1] + (rand.Float64()-0.5)*0.02
		if _, err := s.db.GetExecutor(ctx).Exec(ctx,
			`INSERT INTO deliveries (order_id, stop_sequence, status, latitude, longitude, delivery_instructions)
			 VALUES ($1, 0, 'PENDING', $2, $3, $4)`,
			o.ID, lat, lng, "AI_LM demo upcoming delivery",
		); err != nil {
			slog.Warn("demoseed: failed to create delivery stop", "order_id", o.ID, "error", err)
		}
		created++
	}
	return created, nil
}

// seedLumberProducts returns lumber SKUs that carry digital-twin geometry
// (length/width/height from migration 073), preferring dimensioned products so
// AI_LM's Load Builder renders true-to-scale twins. Falls back to any lumber,
// then any product, so the seed works on a catalog without dimensions.
func (s *Service) seedLumberProducts(ctx context.Context) ([]seedProduct, error) {
	queries := []string{
		`SELECT id, COALESCE(base_price, 0) FROM products
		 WHERE length_in IS NOT NULL AND width_in IS NOT NULL AND height_in IS NOT NULL
		 ORDER BY sku LIMIT 20`,
		`SELECT id, COALESCE(base_price, 0) FROM products WHERE category = 'Lumber' ORDER BY sku LIMIT 20`,
		`SELECT id, COALESCE(base_price, 0) FROM products ORDER BY sku LIMIT 20`,
	}
	for _, q := range queries {
		rows, err := s.db.GetExecutor(ctx).Query(ctx, q)
		if err != nil {
			return nil, err
		}
		var out []seedProduct
		for rows.Next() {
			var p seedProduct
			if err := rows.Scan(&p.id, &p.price); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, p)
		}
		rows.Close()
		if len(out) > 0 {
			return out, nil
		}
	}
	return nil, nil
}

// --- demo_seed_runs observability (migration 079) ----------------------------

// SeedRun records one execution of the demo-seed injection. Lifecycle: insert
// with status=RUNNING on entry; update with finished_at, status, orders_created,
// and error_message on exit. Mirrors purchase_order.ReorderRun.
type SeedRun struct {
	ID            uuid.UUID  `json:"id"`
	StartedAt     time.Time  `json:"started_at"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
	Status        string     `json:"status"`
	OrdersCreated int        `json:"orders_created"`
	WindowDays    int        `json:"window_days"`
	ErrorMessage  string     `json:"error_message,omitempty"`
}

// StartRun inserts a RUNNING row and returns its id.
func (s *Service) StartRun(ctx context.Context, windowDays int) (uuid.UUID, error) {
	const q = `
		INSERT INTO demo_seed_runs (window_days, status)
		VALUES ($1, $2)
		RETURNING id
	`
	var id uuid.UUID
	if err := s.db.GetExecutor(ctx).QueryRow(ctx, q, windowDays, runStatusRunning).Scan(&id); err != nil {
		return uuid.Nil, fmt.Errorf("insert demo_seed_runs: %w", err)
	}
	return id, nil
}

// FinishRun stamps the outcome of a demo-seed-run row.
func (s *Service) FinishRun(ctx context.Context, id uuid.UUID, status string, ordersCreated int, errMsg string) error {
	const q = `
		UPDATE demo_seed_runs
		SET finished_at = now(),
		    status = $2,
		    orders_created = $3,
		    error_message = NULLIF($4, '')
		WHERE id = $1
	`
	_, err := s.db.GetExecutor(ctx).Exec(ctx, q, id, status, ordersCreated, errMsg)
	return err
}

// ListRuns returns the most recent N rows for the operator dashboard.
func (s *Service) ListRuns(ctx context.Context, limit int) ([]SeedRun, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, started_at, finished_at, status, orders_created, window_days,
		       COALESCE(error_message, '')
		FROM demo_seed_runs
		ORDER BY started_at DESC
		LIMIT $1
	`
	rows, err := s.db.GetExecutor(ctx).Query(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("query demo_seed_runs: %w", err)
	}
	defer rows.Close()

	var out []SeedRun
	for rows.Next() {
		var rr SeedRun
		if err := rows.Scan(&rr.ID, &rr.StartedAt, &rr.FinishedAt, &rr.Status,
			&rr.OrdersCreated, &rr.WindowDays, &rr.ErrorMessage); err != nil {
			return nil, fmt.Errorf("scan demo_seed_run: %w", err)
		}
		out = append(out, rr)
	}
	return out, nil
}

// --- settings accessors ------------------------------------------------------

// Enabled reports whether the nightly cron should run (demo_seed.enabled,
// default false).
func (s *Service) Enabled(ctx context.Context) bool {
	return s.settingBool(ctx, settingEnabled, false)
}

// CronExpr returns the configured cron expression (demo_seed.cron, default 03:00).
func (s *Service) CronExpr(ctx context.Context) string {
	return s.settingString(ctx, settingCron, defaultCron)
}

// WindowDays returns the configured rolling-window size (demo_seed.window_days,
// default 7).
func (s *Service) WindowDays(ctx context.Context) int {
	return s.settingInt(ctx, settingWindowDays, defaultWindowDays)
}

func (s *Service) settingString(ctx context.Context, key, def string) string {
	v, ok, err := s.settings.Get(ctx, key)
	if err != nil || !ok || v == "" {
		return def
	}
	return v
}

func (s *Service) settingBool(ctx context.Context, key string, def bool) bool {
	v := s.settingString(ctx, key, "")
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func (s *Service) settingInt(ctx context.Context, key string, def int) int {
	v := s.settingString(ctx, key, "")
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
