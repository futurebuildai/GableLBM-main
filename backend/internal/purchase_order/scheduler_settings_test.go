package purchase_order

import (
	"context"
	"testing"
)

// fakeSettings is a map-backed settingsReader for unit tests. Missing keys
// return ok=false so the scheduler exercises its default-value paths.
type fakeSettings struct {
	values map[string]string
}

func (f *fakeSettings) Get(_ context.Context, key string) (string, bool, error) {
	v, ok := f.values[key]
	return v, ok, nil
}

// TestScheduler_DisabledByDefault asserts the safety contract: with no
// system_settings rows present, Start() must be a no-op. An operator has to
// flip reorder.enabled=true before the cron registers anything.
func TestScheduler_DisabledByDefault(t *testing.T) {
	s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{}})

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start() with empty settings: want nil err, got %v", err)
	}
	if s.enabled {
		t.Errorf("enabled: want false (missing reorder.enabled), got true")
	}
	if entries := s.cron.Entries(); len(entries) != 0 {
		t.Errorf("cron entries: want 0 when disabled, got %d", len(entries))
	}
}

// TestScheduler_ExplicitDisableNoOp covers the operator path of "I configured
// crons but want to stop runs": setting reorder.enabled=false should keep the
// scheduler dormant even if all other keys are set.
func TestScheduler_ExplicitDisableNoOp(t *testing.T) {
	s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{
		settingEnabled:      "false",
		settingRefreshCron:  "0 0 1 * * *",
		settingCreateCron:   "0 0 2 * * *",
		settingLookbackDays: "60",
		settingDryRun:       "false",
	}})

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start(): %v", err)
	}
	if len(s.cron.Entries()) != 0 {
		t.Errorf("cron entries: want 0 with enabled=false, got %d", len(s.cron.Entries()))
	}
}

// TestScheduler_DefaultsWhenEnabledButOtherwiseBlank pins the default config:
// enabled=true with no other keys set must produce dry_run=true,
// lookback=defaultLookbackDays, and both default cron expressions registered.
func TestScheduler_DefaultsWhenEnabledButOtherwiseBlank(t *testing.T) {
	s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{
		settingEnabled: "true",
	}})

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start(): %v", err)
	}
	// Stop the cron engine — Start() called cron.Start() once enabled.
	defer s.Stop()

	if !s.enabled {
		t.Errorf("enabled: want true, got false")
	}
	if !s.dryRun {
		t.Errorf("dryRun default: want true, got false")
	}
	if s.lookback != defaultLookbackDays {
		t.Errorf("lookback default: want %d, got %d", defaultLookbackDays, s.lookback)
	}
	if got := len(s.cron.Entries()); got != 2 {
		t.Errorf("cron entries: want 2 (refresh + create), got %d", got)
	}
}

// TestScheduler_HonorsExplicitSettings verifies non-default values propagate:
// custom lookback and dry_run=false should land on the Scheduler fields.
func TestScheduler_HonorsExplicitSettings(t *testing.T) {
	s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{
		settingEnabled:      "true",
		settingDryRun:       "false",
		settingLookbackDays: "45",
		settingRefreshCron:  "0 30 1 * * *",
		settingCreateCron:   "0 30 2 * * *",
	}})

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start(): %v", err)
	}
	defer s.Stop()

	if s.dryRun {
		t.Errorf("dryRun: want false (explicit), got true")
	}
	if s.lookback != 45 {
		t.Errorf("lookback: want 45, got %d", s.lookback)
	}
}

// TestScheduler_MalformedCronReturnsError ensures a bad cron expression in
// system_settings surfaces as a startup error instead of silently swallowing
// — otherwise an operator typo would leave auto-reorder dead with no signal.
func TestScheduler_MalformedCronReturnsError(t *testing.T) {
	s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{
		settingEnabled:     "true",
		settingRefreshCron: "this is not a cron expression",
	}})

	err := s.Start(context.Background())
	if err == nil {
		t.Fatalf("Start() with malformed cron: want error, got nil")
	}
}

// TestScheduler_SettingInt_GuardsAgainstZeroAndNegatives verifies the
// settingInt helper falls back to the default when an operator stores a
// nonsensical value like "0" or "-1" — lookback_days=0 would divide by zero
// in the velocity math.
func TestScheduler_SettingInt_GuardsAgainstZeroAndNegatives(t *testing.T) {
	cases := []struct {
		name string
		val  string
	}{
		{"zero", "0"},
		{"negative", "-7"},
		{"not_a_number", "soon"},
		{"empty_string", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{
				settingLookbackDays: tc.val,
			}})
			got := s.settingInt(context.Background(), settingLookbackDays, defaultLookbackDays)
			if got != defaultLookbackDays {
				t.Errorf("settingInt(%q): want default %d, got %d", tc.val, defaultLookbackDays, got)
			}
		})
	}
}

// TestScheduler_SettingBool_FallsBackOnGarbage covers strconv.ParseBool's
// rejected inputs (anything outside 1/0/t/f/true/false) — they should resolve
// to the supplied default rather than panic or surface as false.
func TestScheduler_SettingBool_FallsBackOnGarbage(t *testing.T) {
	s := newSchedulerWithSettings(nil, &fakeSettings{values: map[string]string{
		settingDryRun: "maybe",
	}})
	if got := s.settingBool(context.Background(), settingDryRun, true); !got {
		t.Errorf("settingBool with garbage: want default true, got false")
	}
}
