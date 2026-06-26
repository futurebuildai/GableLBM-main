package demoseed

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/robfig/cron/v3"
)

// schedulerTimezone is where the nightly cron is evaluated. demo.gablelbm.com
// serves a Kelowna, BC dealer, so "~3am PST" means 03:00 America/Vancouver.
const schedulerTimezone = "America/Vancouver"

// Scheduler runs the nightly demo fresh-data injection on a cron schedule
// defined in system_settings. It mirrors purchase_order.Scheduler: gated by
// demo_seed.enabled, configured by demo_seed.cron, and each tick writes a
// demo_seed_runs row (via Service.Execute) for observability.
type Scheduler struct {
	service *Service
	cron    *cron.Cron
	enabled bool
}

// NewScheduler wires the scheduler to the demo-seed service. Call Start to load
// settings and begin scheduling. The cron is evaluated in America/Vancouver so
// the nightly run lands at local 03:00 regardless of the host timezone.
func NewScheduler(svc *Service) *Scheduler {
	loc, err := time.LoadLocation(schedulerTimezone)
	if err != nil {
		log.Printf("demo-seed scheduler: failed to load timezone %q, using UTC: %v", schedulerTimezone, err)
		loc = time.UTC
	}
	return &Scheduler{
		service: svc,
		cron:    cron.New(cron.WithSeconds(), cron.WithLocation(loc)),
	}
}

// Start reads settings from system_settings; if demo_seed.enabled != "true" the
// scheduler logs and returns nil without registering any job. Otherwise it
// registers the nightly injection job and starts the cron engine.
func (s *Scheduler) Start(ctx context.Context) error {
	enabled := s.service.Enabled(ctx)
	s.enabled = enabled
	if !enabled {
		log.Printf("demo-seed scheduler: disabled (set %s=true in system_settings to enable)", settingEnabled)
		return nil
	}

	cronExpr := s.service.CronExpr(ctx)
	if _, err := s.cron.AddFunc(cronExpr, func() { s.runInjection(context.Background()) }); err != nil {
		return fmt.Errorf("register demo-seed cron %q: %w", cronExpr, err)
	}

	s.cron.Start()
	log.Printf("demo-seed scheduler: started (cron=%q window_days=%d tz=%s)",
		cronExpr, s.service.WindowDays(ctx), schedulerTimezone)
	return nil
}

// Stop halts the cron engine. Per robfig/cron docs, an in-flight job continues
// running until it returns; Stop only signals "no new ticks".
func (s *Scheduler) Stop() {
	if s.cron != nil {
		s.cron.Stop()
	}
}

// runInjection runs one injection over the configured rolling window and writes
// a demo_seed_runs row. Service.Execute owns run-row bookkeeping and panic
// recovery, so the tick wrapper just logs the outcome.
func (s *Scheduler) runInjection(ctx context.Context) {
	_, created, err := s.service.Execute(ctx)
	if err != nil {
		log.Printf("demo-seed scheduler: injection failed: %v", err)
		return
	}
	log.Printf("demo-seed scheduler: injection complete orders_created=%d", created)
}
