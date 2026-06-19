package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestStripJSONFence guards the load-bearing fence-strip invariant. Models wrap
// JSON (and SVG) in markdown fences despite instructions not to; downstream
// json.Unmarshal / SVG checks break on the fence characters.
func TestStripJSONFence(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"plain json", `{"a":1}`, `{"a":1}`},
		{"json fence", "```json\n{\"a\":1}\n```", `{"a":1}`},
		{"bare fence", "```\n{\"a\":1}\n```", `{"a":1}`},
		{"surrounding whitespace", "  ```json\n{\"a\":1}\n```  ", `{"a":1}`},
		{"svg in xml fence", "```xml\n<svg></svg>\n```", `<svg></svg>`},
		{"missing closing fence", "```json\n{\"a\":1}", `{"a":1}`},
		{"multiline preserved", "```json\n{\n  \"a\": 1\n}\n```", "{\n  \"a\": 1\n}"},
		{"no fence passthrough", "hello world", "hello world"},
		{"empty", "", ""},
	}
	for _, tc := range cases {
		if got := stripJSONFence(tc.in); got != tc.want {
			t.Errorf("%s: stripJSONFence(%q) = %q, want %q", tc.name, tc.in, got, tc.want)
		}
	}
}

// TestGenerateExtractsContentAndStripsFence verifies the OpenAI-shaped response
// extraction (choices[0].message.content) plus the fence strip and model echo.
func TestGenerateExtractsContentAndStripsFence(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("path = %s, want /chat/completions", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q, want Bearer test-key", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "deepseek/deepseek-chat-v3.1:echo-sentinel",
			"choices": []any{map[string]any{
				"message": map[string]any{"content": "```json\n{\"short\":\"hi\"}\n```"},
			}},
		})
	}))
	defer srv.Close()

	c := NewClient("test-key").WithBaseURL(srv.URL)
	text, model, err := c.Generate(context.Background(), "system", "user", 100)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if text != `{"short":"hi"}` {
		t.Errorf("text = %q, want %q", text, `{"short":"hi"}`)
	}
	// The returned model must be the slug the API ECHOED, not the default we sent —
	// the sentinel differs from defaultModelText so this can't pass tautologically.
	if model != "deepseek/deepseek-chat-v3.1:echo-sentinel" {
		t.Errorf("model = %q, want the echoed slug", model)
	}
}

// TestGenerateImageReturnsDataURI verifies the FLUX/image response extraction at
// choices[0].message.images[0].image_url.url and that modalities is requested.
func TestGenerateImageReturnsDataURI(t *testing.T) {
	var sawModalities []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		sawModalities = req.Modalities
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "black-forest-labs/flux:echo-sentinel",
			"choices": []any{map[string]any{"message": map[string]any{
				"content": "Here is your image.",
				"images": []any{map[string]any{
					"type":      "image_url",
					"image_url": map[string]any{"url": "data:image/png;base64,AAAA"},
				}},
			}}},
		})
	}))
	defer srv.Close()

	c := NewClient("test-key").WithBaseURL(srv.URL)
	uri, model, err := c.GenerateImage(context.Background(), "a red barn", "photographic")
	if err != nil {
		t.Fatalf("GenerateImage: %v", err)
	}
	if uri != "data:image/png;base64,AAAA" {
		t.Errorf("uri = %q", uri)
	}
	// Echoed slug must win over the default we sent (sentinel kept distinct).
	if model != "black-forest-labs/flux:echo-sentinel" {
		t.Errorf("model = %q, want the echoed slug", model)
	}
	if len(sawModalities) != 1 || sawModalities[0] != "image" {
		t.Errorf("modalities = %v, want [image] (FLUX rejects the text modality)", sawModalities)
	}
}

// TestExtractFreightInvoicePDFShape verifies the PDF multimodal translation:
// a `file` content block (data:application/pdf;base64,...) plus the top-level
// file-parser plugin with the mistral-ocr engine — and that fenced JSON parses.
func TestExtractFreightInvoicePDFShape(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "qwen/qwen3-vl-235b-a22b-instruct",
			"choices": []any{map[string]any{"message": map[string]any{
				"content": "```json\n{\"total_amount\":245.50,\"carrier_name\":\"ABC Freight\",\"invoice_number\":\"FR-12345\"}\n```",
			}}},
		})
	}))
	defer srv.Close()

	c := NewClient("test-key").WithBaseURL(srv.URL)
	res, _, err := c.ExtractFreightInvoice(context.Background(), []byte("%PDF-1.4 fake"), "application/pdf")
	if err != nil {
		t.Fatalf("ExtractFreightInvoice: %v", err)
	}
	if res.TotalAmount != 245.50 || res.CarrierName != "ABC Freight" || res.InvoiceNumber != "FR-12345" {
		t.Errorf("parsed result = %+v", res)
	}

	// Verify the request carried the file block + file-parser/mistral-ocr plugin.
	plugins, _ := body["plugins"].([]any)
	if len(plugins) != 1 {
		t.Fatalf("plugins = %v, want one file-parser entry", body["plugins"])
	}
	p0 := plugins[0].(map[string]any)
	if p0["id"] != "file-parser" {
		t.Errorf("plugin id = %v, want file-parser", p0["id"])
	}
	if pdf, ok := p0["pdf"].(map[string]any); !ok || pdf["engine"] != "mistral-ocr" {
		t.Errorf("plugin pdf = %v, want engine mistral-ocr", p0["pdf"])
	}

	parts := messageParts(t, body, 1) // user message content blocks
	first := parts[0].(map[string]any)
	if first["type"] != "file" {
		t.Errorf("content[0].type = %v, want file", first["type"])
	}
	file := first["file"].(map[string]any)
	if fd, _ := file["file_data"].(string); !strings.HasPrefix(fd, "data:application/pdf;base64,") {
		t.Errorf("file_data prefix = %q", fd)
	}
}

// TestExtractFreightInvoiceImageShape verifies image/* → image_url data URI.
func TestExtractFreightInvoiceImageShape(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"content": `{"total_amount":10,"carrier_name":"X","invoice_number":"1"}`,
			}}},
		})
	}))
	defer srv.Close()

	c := NewClient("test-key").WithBaseURL(srv.URL)
	if _, _, err := c.ExtractFreightInvoice(context.Background(), []byte{0xFF, 0xD8}, "image/jpeg"); err != nil {
		t.Fatalf("ExtractFreightInvoice (image): %v", err)
	}
	if body["plugins"] != nil {
		t.Errorf("image upload should carry no plugins, got %v", body["plugins"])
	}
	parts := messageParts(t, body, 1)
	first := parts[0].(map[string]any)
	if first["type"] != "image_url" {
		t.Fatalf("content[0].type = %v, want image_url", first["type"])
	}
	iu := first["image_url"].(map[string]any)
	if u, _ := iu["url"].(string); !strings.HasPrefix(u, "data:image/jpeg;base64,") {
		t.Errorf("image_url.url prefix = %q", u)
	}
}

// TestExtractMaterialListTextNoFenceStrip confirms material-list extraction
// returns the raw model text (the downstream rule-based parser splits on
// newlines) — the asymmetry vs. the freight path, which strips+parses JSON.
func TestExtractMaterialListTextNoFenceStrip(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"content": "50 pcs - 2x4x8 SPF Stud\n25 pcs - 2x6x12 Doug Fir #2",
			}}},
		})
	}))
	defer srv.Close()

	c := NewClient("test-key").WithBaseURL(srv.URL)
	out, err := c.ExtractMaterialList(context.Background(), []byte("some,csv\n1,2"), "text/csv")
	if err != nil {
		t.Fatalf("ExtractMaterialList: %v", err)
	}
	if !strings.Contains(out, "2x4x8 SPF Stud") {
		t.Errorf("output = %q", out)
	}
	// text/csv → a single text block, no plugins.
	if body["plugins"] != nil {
		t.Errorf("text input should carry no plugins, got %v", body["plugins"])
	}
	parts := messageParts(t, body, 1)
	if first := parts[0].(map[string]any); first["type"] != "text" {
		t.Errorf("content[0].type = %v, want text", first["type"])
	}
}

func TestBuildFileContentUnsupported(t *testing.T) {
	if _, _, err := buildFileContent([]byte("x"), "application/zip", "go"); err == nil {
		t.Fatal("expected error for unsupported content type")
	}
}

// TestUnconfiguredClientErrors confirms the no-key backstop (call-sites gate
// first to apply their own degradation behavior).
func TestUnconfiguredClientErrors(t *testing.T) {
	c := NewClient("") // no key
	if c.IsConfigured(context.Background()) {
		t.Fatal("empty-key client should not be configured")
	}
	if _, _, err := c.ExtractFreightInvoice(context.Background(), []byte("x"), "application/pdf"); err == nil {
		t.Error("ExtractFreightInvoice should error with no key")
	}
	if _, err := c.ExtractMaterialList(context.Background(), []byte("x"), "text/plain"); err == nil {
		t.Error("ExtractMaterialList should error with no key")
	}
}

// messageParts returns the content-block array of the message at index i in the
// request body's messages array, failing the test if it is not an array.
func messageParts(t *testing.T, body map[string]any, i int) []any {
	t.Helper()
	msgs, ok := body["messages"].([]any)
	if !ok || len(msgs) <= i {
		t.Fatalf("messages missing index %d: %v", i, body["messages"])
	}
	msg := msgs[i].(map[string]any)
	parts, ok := msg["content"].([]any)
	if !ok {
		t.Fatalf("messages[%d].content is not an array: %v", i, msg["content"])
	}
	return parts
}

// TestSentModelSlugsUseTaskDefaults asserts the model slug actually SENT on the
// wire for each task (not the echoed response model): text→default text, OCR→
// default vision, image→default image. Guards against a task mapping regression.
func TestSentModelSlugsUseTaskDefaults(t *testing.T) {
	var gotModel string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		gotModel = req.Model
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{
				"content": `{"total_amount":1,"carrier_name":"x","invoice_number":"y"}`,
				"images":  []any{map[string]any{"image_url": map[string]any{"url": "data:image/png;base64,AA"}}},
			}}},
		})
	}))
	defer srv.Close()
	c := NewClient("k").WithBaseURL(srv.URL)
	ctx := context.Background()

	if _, _, err := c.Generate(ctx, "s", "u", 10); err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if gotModel != defaultModelText {
		t.Errorf("text slug sent = %q, want %q", gotModel, defaultModelText)
	}

	if _, _, err := c.ExtractFreightInvoice(ctx, []byte{0xFF, 0xD8}, "image/jpeg"); err != nil {
		t.Fatalf("ExtractFreightInvoice: %v", err)
	}
	if gotModel != defaultModelVision {
		t.Errorf("vision slug sent = %q, want %q", gotModel, defaultModelVision)
	}

	if _, _, err := c.GenerateImage(ctx, "barn", ""); err != nil {
		t.Fatalf("GenerateImage: %v", err)
	}
	if gotModel != defaultModelImage {
		t.Errorf("image slug sent = %q, want %q", gotModel, defaultModelImage)
	}
}

// TestChatCompletionNon200WithErrorBody verifies a non-200 surfaces the status
// and the upstream error message (and never leaks the key).
func TestChatCompletionNon200WithErrorBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "bad model slug"}})
	}))
	defer srv.Close()
	c := NewClient("secret-key").WithBaseURL(srv.URL)
	_, _, err := c.Generate(context.Background(), "s", "u", 10)
	if err == nil || !strings.Contains(err.Error(), "bad model slug") || !strings.Contains(err.Error(), "400") {
		t.Fatalf("want 400 + upstream message, got %v", err)
	}
	if strings.Contains(err.Error(), "secret-key") {
		t.Errorf("API key leaked into error: %v", err)
	}
}

// TestChatCompletionEmptyChoices verifies a 200 with no choices is an error.
func TestChatCompletionEmptyChoices(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{}})
	}))
	defer srv.Close()
	c := NewClient("k").WithBaseURL(srv.URL)
	if _, _, err := c.Generate(context.Background(), "s", "u", 10); err == nil || !strings.Contains(err.Error(), "empty response") {
		t.Fatalf("want empty-response error, got %v", err)
	}
}

// TestGenerateImageNoImageData covers two no-image cases: an images-less message,
// and an images entry whose URL is a remote link rather than a base64 data URI.
func TestGenerateImageNoImageData(t *testing.T) {
	cases := map[string]map[string]any{
		"no images array": {"content": "sorry, no image"},
		"non-data url": {"images": []any{map[string]any{
			"image_url": map[string]any{"url": "https://cdn.example.com/x.png"},
		}}},
	}
	for name, message := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"choices": []any{map[string]any{"message": message}},
				})
			}))
			defer srv.Close()
			c := NewClient("k").WithBaseURL(srv.URL)
			if _, _, err := c.GenerateImage(context.Background(), "barn", ""); err == nil || !strings.Contains(err.Error(), "no image data") {
				t.Fatalf("want no-image-data error, got %v", err)
			}
		})
	}
}

// TestGetBaseURLPrecedenceAndTrailingSlash covers the base-URL resolution:
// default when unset, static override trimmed of a trailing slash.
func TestGetBaseURLPrecedenceAndTrailingSlash(t *testing.T) {
	ctx := context.Background()
	if got := NewClient("k").getBaseURL(ctx); got != defaultOpenRouterBaseURL {
		t.Errorf("default base = %q, want %q", got, defaultOpenRouterBaseURL)
	}
	if got := NewClient("k").WithBaseURL("http://localhost:11434/").getBaseURL(ctx); got != "http://localhost:11434" {
		t.Errorf("trailing slash not trimmed: %q", got)
	}
	if got := NewClient("k").WithBaseURL("https://api.example.com/v1/").getBaseURL(ctx); got != "https://api.example.com/v1" {
		t.Errorf("got %q, want https://api.example.com/v1", got)
	}
}

// TestTrailingSlashBaseHitsCorrectPath ensures a trailing-slash base URL does not
// produce a doubled slash in the request path.
func TestTrailingSlashBaseHitsCorrectPath(t *testing.T) {
	var path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": "ok"}}},
		})
	}))
	defer srv.Close()
	c := NewClient("k").WithBaseURL(srv.URL + "/")
	if _, _, err := c.Generate(context.Background(), "s", "u", 10); err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if path != "/chat/completions" {
		t.Errorf("request path = %q, want /chat/completions (no double slash)", path)
	}
}

// TestValidateBaseURL guards the admin base-URL policy: https anywhere, http only
// for loopback, everything else rejected (so the Bearer key can't be sent in
// plaintext to an arbitrary remote host).
func TestValidateBaseURL(t *testing.T) {
	ok := []string{
		"",
		"https://openrouter.ai/api/v1",
		"http://localhost:11434/v1",
		"http://127.0.0.1:8080",
		"  https://api.example.com  ",
		"http://my-vllm.localhost:8000",
	}
	for _, u := range ok {
		if err := ValidateBaseURL(u); err != nil {
			t.Errorf("ValidateBaseURL(%q) = %v, want nil", u, err)
		}
	}
	bad := []string{
		"http://evil.com",           // plaintext to a remote host
		"ftp://openrouter.ai",       // wrong scheme
		"openrouter.ai/api/v1",      // no scheme/host
		"https://",                  // no host
		"HtTp://evil.com",           // scheme case-folding must not bypass
		"http://127.0.0.1@evil.com", // userinfo trick: the real host is evil.com
		"//evil.com",                // scheme-relative
		"http://127.0.0.2:8080",     // loopback range but not 127.0.0.1
		"http://2130706433",         // decimal-encoded 127.0.0.1 — not treated as loopback
	}
	for _, u := range bad {
		if err := ValidateBaseURL(u); err == nil {
			t.Errorf("ValidateBaseURL(%q) = nil, want error", u)
		}
	}
}
