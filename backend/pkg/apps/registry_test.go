package apps

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testManifests() map[string]Manifest {
	return map[string]Manifest{
		"gl":       {Key: "gl", Name: "General Ledger", Core: true},
		"invoice":  {Key: "invoice", Name: "Invoicing", Core: true, DependsOn: []string{"gl"}},
		"millwork": {Key: "millwork", Name: "Millwork"},
		"bankrecon": {Key: "bankrecon", Name: "Bank Reconciliation",
			DependsOn: []string{"gl"}},
		"matching": {Key: "matching", Name: "PO Matching",
			DependsOn: []string{"bankrecon"}}, // synthetic chain for testing
	}
}

func allEnabled() map[string]bool {
	return map[string]bool{"gl": true, "invoice": true, "millwork": true, "bankrecon": true, "matching": true}
}

func TestValidateToggle_UnknownKey(t *testing.T) {
	err := validateToggle(testManifests(), allEnabled(), "nope", false)
	if err == nil || !strings.Contains(err.Error(), "unknown app") {
		t.Fatalf("want unknown-app error, got %v", err)
	}
}

func TestValidateToggle_CoreRefusesDisable(t *testing.T) {
	err := validateToggle(testManifests(), allEnabled(), "gl", false)
	if err == nil || !strings.Contains(err.Error(), "core") {
		t.Fatalf("want core-app error, got %v", err)
	}
}

func TestValidateToggle_DisableBlockedByEnabledDependent(t *testing.T) {
	err := validateToggle(testManifests(), allEnabled(), "bankrecon", false)
	depErr, ok := err.(*DependencyError)
	if !ok {
		t.Fatalf("want DependencyError, got %v", err)
	}
	if len(depErr.Blockers) != 1 || depErr.Blockers[0] != "matching" {
		t.Fatalf("want blocker [matching], got %v", depErr.Blockers)
	}
}

func TestValidateToggle_DisableAllowedWhenDependentDisabled(t *testing.T) {
	current := allEnabled()
	current["matching"] = false
	if err := validateToggle(testManifests(), current, "bankrecon", false); err != nil {
		t.Fatalf("want nil, got %v", err)
	}
}

func TestValidateToggle_EnableBlockedByDisabledDep(t *testing.T) {
	current := allEnabled()
	current["bankrecon"] = false
	err := validateToggle(testManifests(), current, "matching", true)
	depErr, ok := err.(*DependencyError)
	if !ok {
		t.Fatalf("want DependencyError, got %v", err)
	}
	if len(depErr.Blockers) != 1 || depErr.Blockers[0] != "bankrecon" {
		t.Fatalf("want blocker [bankrecon], got %v", depErr.Blockers)
	}
}

func TestValidateToggle_EnableIgnoresCoreDeps(t *testing.T) {
	// invoice depends on core gl; core deps never block enabling.
	current := allEnabled()
	current["invoice"] = false
	if err := validateToggle(testManifests(), current, "invoice", true); err != nil {
		t.Fatalf("want nil, got %v", err)
	}
}

func TestGate_DisabledApp404s_EnabledPassesThrough(t *testing.T) {
	reg := NewRegistry(nil, slog.Default())
	// Pre-seed the cache as fresh so IsEnabled never hits a DB.
	reg.disabled = map[string]bool{"millwork": true}
	reg.cachedAt = time.Now()

	mux := http.NewServeMux()
	hit := false
	gr := gatedRouter{key: "millwork", reg: reg, next: mux}
	gr.HandleFunc("GET /api/v1/millwork/options", func(w http.ResponseWriter, r *http.Request) {
		hit = true
	})

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/millwork/options", nil))
	if rec.Code != http.StatusNotFound || hit {
		t.Fatalf("disabled app: want 404 and no handler hit, got %d hit=%v", rec.Code, hit)
	}
	if !strings.Contains(rec.Body.String(), "app_disabled") {
		t.Fatalf("disabled app: want app_disabled code in body, got %s", rec.Body.String())
	}

	// Flip to enabled (fresh cache) and confirm pass-through.
	reg.mu.Lock()
	reg.disabled = map[string]bool{}
	reg.cachedAt = time.Now()
	reg.mu.Unlock()
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/millwork/options", nil))
	if rec.Code != http.StatusOK || !hit {
		t.Fatalf("enabled app: want 200 and handler hit, got %d hit=%v", rec.Code, hit)
	}
}

func TestIsEnabled_FailsOpenWithoutDB(t *testing.T) {
	reg := NewRegistry(nil, slog.Default())
	if !reg.IsEnabled("anything") {
		t.Fatal("registry without DB must fail open")
	}
}
