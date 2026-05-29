package quote

import (
	"context"
	"fmt"
	"log"
	"strconv"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/robfig/cron/v3"
)

// Settings keys consumed by the exposure safety-net scheduler. Stored in the
// system_settings table (migration 039_system_settings.sql). An operator flips
// exposure.enabled to "true" to activate the nightly re-evaluation cron.
const (
	settingExposureEnabled  = "exposure.enabled"
	settingExposureScanCron = "exposure.scan_cron"

	// Default applied when the cron setting is absent or blank: 03:00 daily
	// (seconds-precision cron, matches cron.WithSeconds()).
	defaultExposureScanCron = "0 0 3 * * *"
)

// safetyNetScanner is the narrow slice of *pricing.ExposureScanner the
// scheduler needs. Declaring it here (rather than importing pricing) keeps the
// quote package free of an import cycle — pricing already imports quote for the
// snapshot/line-reader interfaces.
type safetyNetScanner interface {
	RunSafetyNet(ctx context.Context) error
}

// exposureSettingsReader is the minimal interface for fetching configuration
// from system_settings. Abstracted so unit tests can supply a map without a
// live Postgres.
type exposureSettingsReader interface {
	Get(ctx context.Context, key string) (string, bool, error)
}

// dbExposureSettingsReader reads directly from the system_settings table.
type dbExposureSettingsReader struct {
	db *database.DB
}

func (r *dbExposureSettingsReader) Get(ctx context.Context, key string) (string, bool, error) {
	const q = `SELECT value FROM system_settings WHERE key = $1`
	var v string
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, q, key).Scan(&v); err != nil {
		// Treat a missing key (or any read error) as "absent" rather than
		// failing the whole scheduler start.
		return "", false, nil //nolint:nilerr
	}
	return v, true, nil
}

// ExposureScheduler re-evaluates open commodity quotes against the latest
// market-index values on a nightly cron. It is a safety-net behind the
// event-driven OnMarketIndexUpdated path: index refreshes are normally handled
// in real time, but a missed event (NATS down, process restart mid-refresh)
// would otherwise leave a quote un-flagged until the next manual refresh. The
// nightly pass closes that gap. Disabled by default.
type ExposureScheduler struct {
	scanner  safetyNetScanner
	settings exposureSettingsReader
	cron     *cron.Cron
	enabled  bool
}

// NewExposureScheduler wires the scheduler to its dependencies. Call Start to
// load settings and begin scheduling.
func NewExposureScheduler(db *database.DB, scanner safetyNetScanner) *ExposureScheduler {
	return &ExposureScheduler{
		scanner:  scanner,
		settings: &dbExposureSettingsReader{db: db},
		cron:     cron.New(cron.WithSeconds()),
	}
}

// Start reads settings from system_settings; if exposure.enabled != "true" the
// scheduler logs and returns nil without registering any jobs. Otherwise it
// registers the safety-net job and starts the cron engine.
func (s *ExposureScheduler) Start(ctx context.Context) error {
	if s.scanner == nil {
		log.Printf("exposure scheduler: no scanner wired; disabled")
		return nil
	}

	enabled := s.settingBool(ctx, settingExposureEnabled, false)
	s.enabled = enabled
	if !enabled {
		log.Printf("exposure scheduler: disabled (set %s=true in system_settings to enable)", settingExposureEnabled)
		return nil
	}

	scanExpr := s.settingString(ctx, settingExposureScanCron, defaultExposureScanCron)
	if _, err := s.cron.AddFunc(scanExpr, func() { s.runSafetyNet(context.Background()) }); err != nil {
		return fmt.Errorf("register exposure safety-net cron %q: %w", scanExpr, err)
	}

	s.cron.Start()
	log.Printf("exposure scheduler: started (scan=%q)", scanExpr)
	return nil
}

// Stop halts the cron engine. Per robfig/cron docs, in-flight jobs continue
// running until they return; Stop only signals "no new ticks".
func (s *ExposureScheduler) Stop() {
	if s.cron != nil {
		s.cron.Stop()
	}
}

// runSafetyNet executes a single nightly re-evaluation pass.
func (s *ExposureScheduler) runSafetyNet(ctx context.Context) {
	defer func() {
		if p := recover(); p != nil {
			log.Printf("exposure scheduler: safety-net panic: %v", p)
		}
	}()
	if err := s.scanner.RunSafetyNet(ctx); err != nil {
		log.Printf("exposure scheduler: safety-net failed: %v", err)
		return
	}
	log.Printf("exposure scheduler: safety-net completed")
}

// --- settings helpers --------------------------------------------------

func (s *ExposureScheduler) settingString(ctx context.Context, key, def string) string {
	v, ok, err := s.settings.Get(ctx, key)
	if err != nil || !ok || v == "" {
		return def
	}
	return v
}

func (s *ExposureScheduler) settingBool(ctx context.Context, key string, def bool) bool {
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
