package config

import "testing"

// Guards the F6 boot fail-closed in Load(): an insecure OPENROUTER_BASE_URL must
// refuse to start, while the secure default and loopback self-host forms boot.
// Without this, silently deleting the validation block in Load() would go uncaught
// (ValidateBaseURL itself is covered in the ai package, but its wiring here is not).

func TestLoad_RejectsInsecureBaseURL(t *testing.T) {
	t.Setenv("FB_BRAIN_ENABLED", "false") // keep the unrelated F-05 check satisfied
	for _, v := range []string{
		"http://evil.com",            // plaintext to a remote host
		"http://127.0.0.1@evil.com",  // userinfo trick
		"ftp://openrouter.ai",        // wrong scheme
	} {
		t.Setenv("OPENROUTER_BASE_URL", v)
		if _, err := Load(); err == nil {
			t.Errorf("Load() must fail closed on OPENROUTER_BASE_URL=%q", v)
		}
	}
}

func TestLoad_AcceptsSecureBaseURLs(t *testing.T) {
	t.Setenv("FB_BRAIN_ENABLED", "false")
	for _, v := range []string{
		"",                             // empty → default applies at runtime
		"https://openrouter.ai/api/v1", // the byte-identical default
		"https://proxy.internal/v1",    // remote https
		"http://localhost:11434/v1",    // self-hosted loopback
	} {
		t.Setenv("OPENROUTER_BASE_URL", v)
		if _, err := Load(); err != nil {
			t.Errorf("Load() with OPENROUTER_BASE_URL=%q: unexpected error %v", v, err)
		}
	}
}
