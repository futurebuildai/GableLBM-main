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
			"model": "deepseek/deepseek-chat",
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
	if model != "deepseek/deepseek-chat" {
		t.Errorf("model = %q, want deepseek/deepseek-chat", model)
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
			"model": "google/gemini-3.1-flash-image",
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
	if model != "google/gemini-3.1-flash-image" {
		t.Errorf("model = %q", model)
	}
	if len(sawModalities) != 2 || sawModalities[0] != "image" || sawModalities[1] != "text" {
		t.Errorf("modalities = %v, want [image text]", sawModalities)
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
