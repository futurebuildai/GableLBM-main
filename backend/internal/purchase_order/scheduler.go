package purchase_order

import (
	"context"
	"fmt"
	"log"
	"strconv"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/robfig/cron/v3"
)

// Settings keys consumed by the auto-reorder scheduler. Stored in the
// system_settings table (migration 039_system_settings.sql). An operator
// flips reorder.enabled to "true" to activate the cron.
const (
	settingEnabled      = "reorder.enabled"
	settingRefreshCron  = "reorder.refresh_cron"
	settingCreateCron   = "reorder.create_cron"
	settingLookbackDays = "reorder.lookback_days"
	settingDryRun       = "reorder.dry_run"

	// Defaults applied when a setting is absent or blank.
	defaultRefreshCron  = "0 0 1 * * *" // 01:00 daily (seconds-precision cron)
	defaultCreateCron   = "0 0 2 * * *" // 02:00 daily
	defaultLookbackDays = 90
)

const (
	jobRefreshTargets = "refresh_targets"
	jobCreateReorders = "create_reorders"

	runStatusSuccess = "SUCCESS"
	runStatusFailed  = "FAILED"
	runStatusSkipped = "SKIPPED"
)

// settingsReader is the minimal interface the scheduler needs to fetch
// configuration from system_settings. Abstracted so unit tests can supply a
// map without a live Postgres.
type settingsReader interface {
	Get(ctx context.Context, key string) (string, bool, error)
}

// dbSettingsReader is the production implementation of settingsReader,
// reading directly from the system_settings table.
type dbSettingsReader struct {
	db *database.DB
}

func (r *dbSettingsReader) Get(ctx context.Context, key string) (string, bool, error) {
	const q = `SELECT value FROM system_settings WHERE key = $1`
	var v string
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, key).Scan(&v)
	if err != nil {
		// pgx returns pgx.ErrNoRows on missing key; treat any error as "absent"
		// rather than failing the whole scheduler start.
		return "", false, nil //nolint:nilerr
	}
	return v, true, nil
}

// Scheduler runs the two auto-reorder jobs (target refresh + reorder PO
// creation) on cron schedules defined in system_settings. Each tick writes
// a row to reorder_runs for observability.
type Scheduler struct {
	service  *Service
	settings settingsReader
	cron     *cron.Cron
	enabled  bool
	dryRun   bool
	lookback int
}

// NewScheduler wires the scheduler to its dependencies. Call Start to load
// settings and begin scheduling.
func NewScheduler(db *database.DB, svc *Service) *Scheduler {
	return &Scheduler{
		service:  svc,
		settings: &dbSettingsReader{db: db},
		cron:     cron.New(cron.WithSeconds()),
	}
}

// newSchedulerWithSettings is the unit-test entry point — accepts a fake
// settings reader so tests don't need a Postgres.
func newSchedulerWithSettings(svc *Service, sr settingsReader) *Scheduler {
	return &Scheduler{
		service:  svc,
		settings: sr,
		cron:     cron.New(cron.WithSeconds()),
	}
}

// Start reads settings from system_settings; if reorder.enabled != "true"
// the scheduler logs and returns nil without registering any jobs. Otherwise
// it registers the refresh and create jobs and starts the cron engine.
func (s *Scheduler) Start(ctx context.Context) error {
	enabled := s.settingBool(ctx, settingEnabled, false)
	s.enabled = enabled
	if !enabled {
		log.Printf("reorder scheduler: disabled (set %s=true in system_settings to enable)", settingEnabled)
		return nil
	}

	s.dryRun = s.settingBool(ctx, settingDryRun, true)
	s.lookback = s.settingInt(ctx, settingLookbackDays, defaultLookbackDays)

	refreshExpr := s.settingString(ctx, settingRefreshCron, defaultRefreshCron)
	createExpr := s.settingString(ctx, settingCreateCron, defaultCreateCron)

	if _, err := s.cron.AddFunc(refreshExpr, func() { s.runRefresh(context.Background()) }); err != nil {
		return fmt.Errorf("register refresh cron %q: %w", refreshExpr, err)
	}
	if _, err := s.cron.AddFunc(createExpr, func() { s.runCreateReorders(context.Background()) }); err != nil {
		return fmt.Errorf("register create-reorders cron %q: %w", createExpr, err)
	}

	s.cron.Start()
	log.Printf("reorder scheduler: started (dry_run=%v lookback_days=%d refresh=%q create=%q)",
		s.dryRun, s.lookback, refreshExpr, createExpr)
	return nil
}

// Stop halts the cron engine. Per robfig/cron docs, in-flight jobs continue
// running until they return; Stop signals "no new ticks".
func (s *Scheduler) Stop() {
	if s.cron != nil {
		s.cron.Stop()
	}
}

// runRefresh executes RefreshReorderTargets and writes a reorder_runs row.
func (s *Scheduler) runRefresh(ctx context.Context) {
	runID, err := s.service.StartReorderRun(ctx, jobRefreshTargets, s.dryRun)
	if err != nil {
		log.Printf("reorder scheduler: failed to record run start: %v", err)
		return
	}

	status := runStatusSuccess
	errMsg := ""
	var updated, skipped int

	defer func() {
		if p := recover(); p != nil {
			status = runStatusFailed
			errMsg = fmt.Sprintf("panic: %v", p)
		}
		if ferr := s.service.FinishReorderRun(ctx, runID, status, 0, updated, skipped, errMsg); ferr != nil {
			log.Printf("reorder scheduler: failed to record run finish: %v", ferr)
		}
	}()

	res, err := s.service.RefreshReorderTargets(ctx, s.dryRun, s.lookback)
	if err != nil {
		status = runStatusFailed
		errMsg = err.Error()
		log.Printf("reorder scheduler: refresh_targets failed: %v", err)
		return
	}
	updated = res.ProductsUpdated
	skipped = res.ProductsSkipped
	log.Printf("reorder scheduler: refresh_targets dry_run=%v updated=%d skipped=%d",
		s.dryRun, updated, skipped)
}

// runCreateReorders executes CreateReorders and writes a reorder_runs row.
// CreateReorders does not have a dry-run mode today (it always writes); when
// reorder.dry_run is true we skip this job entirely to keep the contract
// honest. An operator who wants reorder PO creation must flip dry_run off.
func (s *Scheduler) runCreateReorders(ctx context.Context) {
	if s.dryRun {
		// Record the skip so the operator can see why no POs were created.
		runID, err := s.service.StartReorderRun(ctx, jobCreateReorders, true)
		if err != nil {
			log.Printf("reorder scheduler: failed to record skipped create-reorders: %v", err)
			return
		}
		if ferr := s.service.FinishReorderRun(ctx, runID, runStatusSkipped, 0, 0, 0,
			"dry_run mode — create_reorders does not support previews"); ferr != nil {
			log.Printf("reorder scheduler: failed to finish skipped run: %v", ferr)
		}
		log.Printf("reorder scheduler: create_reorders skipped (dry_run=true)")
		return
	}

	runID, err := s.service.StartReorderRun(ctx, jobCreateReorders, false)
	if err != nil {
		log.Printf("reorder scheduler: failed to record run start: %v", err)
		return
	}

	status := runStatusSuccess
	errMsg := ""
	posCreated := 0

	defer func() {
		if p := recover(); p != nil {
			status = runStatusFailed
			errMsg = fmt.Sprintf("panic: %v", p)
		}
		if ferr := s.service.FinishReorderRun(ctx, runID, status, posCreated, 0, 0, errMsg); ferr != nil {
			log.Printf("reorder scheduler: failed to record run finish: %v", ferr)
		}
	}()

	count, err := s.service.CreateReorders(ctx)
	if err != nil {
		status = runStatusFailed
		errMsg = err.Error()
		log.Printf("reorder scheduler: create_reorders failed: %v", err)
		return
	}
	posCreated = count
	log.Printf("reorder scheduler: create_reorders pos_created=%d", count)
}

// --- settings helpers --------------------------------------------------

func (s *Scheduler) settingString(ctx context.Context, key, def string) string {
	v, ok, err := s.settings.Get(ctx, key)
	if err != nil || !ok || v == "" {
		return def
	}
	return v
}

func (s *Scheduler) settingBool(ctx context.Context, key string, def bool) bool {
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

func (s *Scheduler) settingInt(ctx context.Context, key string, def int) int {
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

