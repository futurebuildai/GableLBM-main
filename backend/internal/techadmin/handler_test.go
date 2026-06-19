package techadmin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeStore implements settingStore in memory so the admin-settings handler can be
// tested without a *pgxpool.Pool.
type fakeStore struct {
	val     string
	hasDB   bool
	setVal  *string // last value passed to Set (nil if never set)
	deleted bool
}

func (f *fakeStore) Get(context.Context) string         { return f.val }
func (f *fakeStore) HasDBOverride(context.Context) bool { return f.hasDB }
func (f *fakeStore) Set(_ context.Context, v string) error {
	f.setVal = &v
	f.val = v
	f.hasDB = true
	return nil
}
func (f *fakeStore) Delete(context.Context) error {
	f.deleted = true
	f.val = ""
	f.hasDB = false
	return nil
}

// F3/F5: GET surfaces base_url ONLY when it's a DB override, so the UI can tell
// "override set" from "using the default".
func TestGetAISettings_BaseURLOnlyWhenOverridden(t *testing.T) {
	key := &fakeStore{val: "sk-or-abcdefghij1234", hasDB: false} // env key, no DB override
	base := &fakeStore{val: "https://openrouter.ai/api/v1", hasDB: false}
	h := &Handler{aiKeyStore: key, baseURLStore: base}

	rec := httptest.NewRecorder()
	h.GetAISettings(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var resp AISettingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.Configured || resp.Source != "env" {
		t.Errorf("got configured=%v source=%q, want true/env", resp.Configured, resp.Source)
	}
	if resp.BaseURL != "" {
		t.Errorf("base_url must be omitted when not overridden, got %q", resp.BaseURL)
	}

	// With a DB override, the base URL is surfaced.
	h2 := &Handler{aiKeyStore: key, baseURLStore: &fakeStore{val: "https://proxy.internal/v1", hasDB: true}}
	rec2 := httptest.NewRecorder()
	h2.GetAISettings(rec2, httptest.NewRequest(http.MethodGet, "/", nil))
	var resp2 AISettingsResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &resp2)
	if resp2.BaseURL != "https://proxy.internal/v1" {
		t.Errorf("overridden base_url = %q", resp2.BaseURL)
	}
}

func TestSaveAISettings_SetsKeyAndBaseURL(t *testing.T) {
	key, base := &fakeStore{}, &fakeStore{}
	h := &Handler{aiKeyStore: key, baseURLStore: base}
	body := `{"api_key":"sk-or-newkey","base_url":"https://proxy.internal/v1"}`
	rec := httptest.NewRecorder()
	h.SaveAISettings(rec, httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body)
	}
	if key.setVal == nil || *key.setVal != "sk-or-newkey" {
		t.Errorf("api key not saved: %v", key.setVal)
	}
	if base.setVal == nil || *base.setVal != "https://proxy.internal/v1" {
		t.Errorf("base URL not saved: %v", base.setVal)
	}
}

// F6 ordering: an invalid base_url returns 400 and must NOT leave the api_key saved.
func TestSaveAISettings_InvalidBaseURLDoesNotPersistKey(t *testing.T) {
	key, base := &fakeStore{}, &fakeStore{}
	h := &Handler{aiKeyStore: key, baseURLStore: base}
	body := `{"api_key":"sk-or-newkey","base_url":"http://evil.com"}`
	rec := httptest.NewRecorder()
	h.SaveAISettings(rec, httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if key.setVal != nil {
		t.Errorf("api key must NOT be saved when base_url is invalid, got %q", *key.setVal)
	}
}

// F5: an empty base_url clears the override (Delete), it does not persist an empty row.
func TestSaveAISettings_EmptyBaseURLClearsOverride(t *testing.T) {
	key := &fakeStore{}
	base := &fakeStore{val: "https://old.override/v1", hasDB: true}
	h := &Handler{aiKeyStore: key, baseURLStore: base}
	body := `{"api_key":"sk-or-newkey","base_url":""}`
	rec := httptest.NewRecorder()
	h.SaveAISettings(rec, httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !base.deleted {
		t.Error("empty base_url must clear the override via Delete")
	}
	if base.setVal != nil {
		t.Errorf("empty base_url must not Set a value, got %q", *base.setVal)
	}
}

// F5: an omitted base_url leaves the store untouched (no spurious write).
func TestSaveAISettings_OmittedBaseURLLeavesItUntouched(t *testing.T) {
	key := &fakeStore{}
	base := &fakeStore{val: "https://keep.me/v1", hasDB: true}
	h := &Handler{aiKeyStore: key, baseURLStore: base}
	rec := httptest.NewRecorder()
	h.SaveAISettings(rec, httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"api_key":"sk-or-newkey"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if base.setVal != nil || base.deleted {
		t.Errorf("omitted base_url must not touch the store (set=%v deleted=%v)", base.setVal, base.deleted)
	}
}

func TestSaveAISettings_MissingKeyReturns400(t *testing.T) {
	h := &Handler{aiKeyStore: &fakeStore{}, baseURLStore: &fakeStore{}}
	rec := httptest.NewRecorder()
	h.SaveAISettings(rec, httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{}`)))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestDeleteAISettings_ClearsBothStores(t *testing.T) {
	key := &fakeStore{val: "x", hasDB: true}
	base := &fakeStore{val: "y", hasDB: true}
	h := &Handler{aiKeyStore: key, baseURLStore: base}
	rec := httptest.NewRecorder()
	h.DeleteAISettings(rec, httptest.NewRequest(http.MethodDelete, "/", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if !key.deleted || !base.deleted {
		t.Errorf("both stores must be deleted (key=%v base=%v)", key.deleted, base.deleted)
	}
}
