package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Client is a single OpenAI-compatible client targeting OpenRouter. It collapses
// what used to be three direct provider clients (Anthropic text+vision, Gemini
// image, Stability image) into one endpoint shape: every call is a
// POST {base}/chat/completions authenticated with one Bearer key.
//
//   - Generate(text)        → text model   (ai.model.text)
//   - ExtractMaterialList   → vision model (ai.model.vision) — image/pdf/text in
//   - ExtractFreightInvoice → vision model (ai.model.vision) — image/pdf in
//   - GenerateImage         → image model  (ai.model.image)
//
// The base URL is config-swappable (a self-hosted vLLM/Ollama/LiteLLM endpoint),
// and per-task model slugs are overridable at runtime via system_settings.
type Client struct {
	staticKey    string
	keyStore     *KeyStore // openrouter_api_key (DB-first, env fallback)
	baseURLStore *KeyStore // openrouter_base_url (DB-first, env fallback)
	baseURL      string    // optional static override (tests / self-hosted)
	models       *ModelRouter
	httpClient   *http.Client
	maestro      *MaestroClient // optional: routes text AI through Brain (dead code today)
}

const (
	defaultOpenRouterBaseURL = "https://openrouter.ai/api/v1"

	// Default model slugs. Verified against GET https://openrouter.ai/api/v1/models
	// on 2026-06-18. All are runtime-overridable via the ai.model.* system_settings
	// keys (the catalog churns — re-verify before pinning new ones).
	defaultModelText   = "deepseek/deepseek-chat"
	defaultModelVision = "qwen/qwen3-vl-235b-a22b-instruct"
	defaultModelCheap  = "meta-llama/llama-3.1-8b-instruct"
	defaultModelImage  = "black-forest-labs/flux.2-pro" // open-weight FLUX.2, best-in-class image gen

	// defaultPDFEngine is the file-parser engine used when a PDF is uploaded.
	// mistral-ocr handles scanned documents and images (the freight-invoice case).
	defaultPDFEngine = "mistral-ocr"

	// Attribution headers (optional, for OpenRouter's app leaderboard).
	httpReferer = "https://github.com/gablelbm/gable"
	appTitle    = "GableLBM"
)

// NewClient creates a client with a static key (no dynamic KeyStore).
func NewClient(apiKey string) *Client {
	return &Client{
		staticKey:  apiKey,
		httpClient: &http.Client{Timeout: 90 * time.Second},
	}
}

// NewClientWithKeyStore creates a client that reads the key dynamically from a KeyStore.
func NewClientWithKeyStore(ks *KeyStore) *Client {
	return &Client{
		keyStore:   ks,
		httpClient: &http.Client{Timeout: 90 * time.Second},
	}
}

// WithBaseURLStore attaches the admin-editable base-URL store. KeyStore is
// single-valued, so the base URL lives under its own setting key.
func (c *Client) WithBaseURLStore(ks *KeyStore) *Client {
	c.baseURLStore = ks
	return c
}

// WithBaseURL sets a static base URL override (used by tests and self-hosted
// static configs). The base-URL store, if set and non-empty, takes precedence.
func (c *Client) WithBaseURL(u string) *Client {
	c.baseURL = u
	return c
}

// WithModels attaches the per-task model router.
func (c *Client) WithModels(m *ModelRouter) *Client {
	c.models = m
	return c
}

// WithMaestro attaches a MaestroClient for routing text-based AI through Brain.
// This path is dead code today (no call-site wires a Maestro client) but the hook
// is preserved as the metered-routing extension point.
func (c *Client) WithMaestro(m *MaestroClient) *Client {
	c.maestro = m
	return c
}

// getKey resolves the API key, preferring the KeyStore over the static key.
func (c *Client) getKey(ctx context.Context) string {
	if c.keyStore != nil {
		return c.keyStore.Get(ctx)
	}
	return c.staticKey
}

// getBaseURL resolves the base URL: admin store override → static override → default.
func (c *Client) getBaseURL(ctx context.Context) string {
	candidate := ""
	if c.baseURLStore != nil {
		candidate = c.baseURLStore.Get(ctx)
	}
	if candidate == "" {
		candidate = c.baseURL
	}
	if candidate == "" {
		return defaultOpenRouterBaseURL
	}
	// Defense in depth: never send the Bearer key to an unvalidated host. The admin
	// handler and startup config validation already gate their inputs, but a value
	// written directly to system_settings (bypassing the handler) would otherwise
	// slip through here — so re-validate and fall back to the safe default.
	if err := ValidateBaseURL(candidate); err != nil {
		slog.Warn("ignoring invalid AI base URL; using default", "error", err)
		return defaultOpenRouterBaseURL
	}
	return strings.TrimRight(candidate, "/")
}

// IsConfigured returns true if an API key is available (from DB or env/static).
func (c *Client) IsConfigured(ctx context.Context) bool {
	return c.getKey(ctx) != ""
}

// --- JWT context propagation for Maestro (dead code path, preserved) ---

type jwtContextKey struct{}

// ContextWithJWT returns a context carrying the user's JWT for Maestro forwarding.
func ContextWithJWT(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, jwtContextKey{}, token)
}

func jwtFromContext(ctx context.Context) string {
	token, _ := ctx.Value(jwtContextKey{}).(string)
	return token
}

// --- Model routing ---

type modelTask int

const (
	taskText modelTask = iota
	taskVision
	taskCheap
	taskImage
)

// ModelDefaults carries the per-task default slugs (from config/env).
type ModelDefaults struct {
	Text   string
	Vision string
	Cheap  string
	Image  string
}

// ModelRouter resolves a model slug per task. Each task is backed by its own
// KeyStore so the slug is overridable at runtime via system_settings
// (ai.model.text / .vision / .cheap / .image) without a redeploy.
type ModelRouter struct {
	text   *KeyStore
	vision *KeyStore
	cheap  *KeyStore
	image  *KeyStore
}

// NewModelRouter builds a router whose defaults come from config, with DB
// overrides via the ai.model.* system_settings keys.
func NewModelRouter(pool *pgxpool.Pool, d ModelDefaults) *ModelRouter {
	orDefault := func(v string, t modelTask) string {
		if strings.TrimSpace(v) == "" {
			return defaultModelFor(t)
		}
		return v
	}
	return &ModelRouter{
		text:   NewKeyStore(pool, "ai.model.text", orDefault(d.Text, taskText)),
		vision: NewKeyStore(pool, "ai.model.vision", orDefault(d.Vision, taskVision)),
		cheap:  NewKeyStore(pool, "ai.model.cheap", orDefault(d.Cheap, taskCheap)),
		image:  NewKeyStore(pool, "ai.model.image", orDefault(d.Image, taskImage)),
	}
}

func (m *ModelRouter) resolve(ctx context.Context, t modelTask) string {
	switch t {
	case taskVision:
		return m.vision.Get(ctx)
	case taskCheap:
		return m.cheap.Get(ctx)
	case taskImage:
		return m.image.Get(ctx)
	default:
		return m.text.Get(ctx)
	}
}

// defaultModelFor is the single source of truth for default model slugs. It is
// used both by NewModelRouter (as each key's env/DB fallback) and by Client.model
// when no router is wired — e.g. a client built via NewClient for tests or a
// fixed-model deployment. With a router wired, the router's own defaults win, so
// this is reached only on the no-router path.
func defaultModelFor(t modelTask) string {
	switch t {
	case taskVision:
		return defaultModelVision
	case taskCheap:
		return defaultModelCheap
	case taskImage:
		return defaultModelImage
	default:
		return defaultModelText
	}
}

// model resolves the slug for a task via the router, falling back to the package
// default when no router is wired (e.g. in tests).
func (c *Client) model(ctx context.Context, t modelTask) string {
	if c.models != nil {
		if s := c.models.resolve(ctx, t); s != "" {
			return s
		}
	}
	return defaultModelFor(t)
}

// ValidateBaseURL checks an admin-supplied base URL before it is stored. An empty
// string is valid (it reverts to the default). Otherwise the URL must be absolute
// with an https scheme — or http only for loopback hosts — so the Bearer key is
// never transmitted in plaintext to an arbitrary remote host.
func ValidateBaseURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid base URL: %w", err)
	}
	if u.Host == "" {
		return fmt.Errorf("base URL must be absolute (include scheme and host), e.g. https://openrouter.ai/api/v1")
	}
	switch u.Scheme {
	case "https":
		return nil
	case "http":
		if isLoopbackHost(u.Hostname()) {
			return nil
		}
		return fmt.Errorf("base URL must use https (plaintext http is only allowed for localhost endpoints)")
	default:
		return fmt.Errorf("base URL scheme must be http or https, got %q", u.Scheme)
	}
}

// isLoopbackHost reports whether host is a loopback literal or a *.localhost name.
// Per RFC 6761, names under the .localhost TLD are reserved to resolve to loopback,
// so plaintext http to them is treated as safe (it never leaves the machine). This
// trusts the resolver to honor RFC 6761; a maliciously-configured resolver could
// point *.localhost elsewhere, which is out of scope for this admin-only setting.
func isLoopbackHost(host string) bool {
	switch strings.ToLower(host) {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return strings.HasSuffix(strings.ToLower(host), ".localhost")
}

// --- OpenAI-compatible request / response types ---

type chatRequest struct {
	Model      string        `json:"model"`
	Messages   []chatMessage `json:"messages"`
	MaxTokens  int           `json:"max_tokens,omitempty"`
	Modalities []string      `json:"modalities,omitempty"`
	Plugins    []plugin      `json:"plugins,omitempty"`
}

// chatMessage.Content is either a plain string (system / simple user message) or
// a []contentPart (multimodal user message). interface{} marshals both shapes.
type chatMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type contentPart struct {
	Type     string    `json:"type"` // "text" | "image_url" | "file"
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
	File     *filePart `json:"file,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

type filePart struct {
	Filename string `json:"filename"`
	FileData string `json:"file_data"`
}

type plugin struct {
	ID  string     `json:"id"`
	PDF *pdfPlugin `json:"pdf,omitempty"`
}

type pdfPlugin struct {
	Engine string `json:"engine"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string          `json:"content"`
			Images  []responseImage `json:"images,omitempty"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Model string `json:"model"`
	Usage *struct {
		PromptTokens     int     `json:"prompt_tokens"`
		CompletionTokens int     `json:"completion_tokens"`
		TotalTokens      int     `json:"total_tokens"`
		Cost             float64 `json:"cost"`
	} `json:"usage,omitempty"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error,omitempty"`
}

type responseImage struct {
	Type     string   `json:"type"`
	ImageURL imageURL `json:"image_url"`
}

// stripJSONFence removes a leading ```lang fence and a trailing ``` fence from a
// model response, if present. This is a load-bearing invariant: models routinely
// wrap JSON (and SVG) in markdown code fences despite being told not to, and the
// downstream json.Unmarshal / SVG checks break on the fence characters. Despite
// the name it strips any code fence, not only ```json.
func stripJSONFence(s string) string {
	cleaned := strings.TrimSpace(s)
	if !strings.HasPrefix(cleaned, "```") {
		return cleaned
	}
	// Drop the opening fence line (```json / ```svg / ```).
	if idx := strings.Index(cleaned, "\n"); idx != -1 {
		cleaned = cleaned[idx+1:]
	} else {
		// Whole string is just a fence token; nothing usable remains.
		cleaned = strings.TrimPrefix(cleaned, "```")
	}
	// Drop the closing fence.
	if idx := strings.LastIndex(cleaned, "```"); idx != -1 {
		cleaned = cleaned[:idx]
	}
	return strings.TrimSpace(cleaned)
}

// chatCompletion performs one POST {base}/chat/completions and returns the parsed
// response. A missing key is reported as an error; call-sites gate on
// IsConfigured first to apply their own degradation behavior (see service code).
func (c *Client) chatCompletion(ctx context.Context, req chatRequest) (*chatResponse, error) {
	apiKey := c.getKey(ctx)
	if apiKey == "" {
		return nil, fmt.Errorf("no OpenRouter API key configured")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := c.getBaseURL(ctx) + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("HTTP-Referer", httpReferer)
	httpReq.Header.Set("X-Title", appTitle)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("AI request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp chatResponse
		if json.Unmarshal(respBody, &errResp) == nil && errResp.Error != nil {
			return nil, fmt.Errorf("OpenRouter API error (%d): %s", resp.StatusCode, errResp.Error.Message)
		}
		return nil, fmt.Errorf("OpenRouter API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var cr chatResponse
	if err := json.Unmarshal(respBody, &cr); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if cr.Error != nil {
		return nil, fmt.Errorf("OpenRouter error: %s", cr.Error.Message)
	}
	if len(cr.Choices) == 0 {
		return nil, fmt.Errorf("empty response from AI (no choices)")
	}
	if cr.Usage != nil && cr.Usage.Cost > 0 {
		slog.Debug("AI call billed", "model", cr.Model, "cost_usd", cr.Usage.Cost, "total_tokens", cr.Usage.TotalTokens)
	}
	return &cr, nil
}

// Generate sends a system+user prompt to the text model and returns the
// (fence-stripped text, resolved model, error). This preserves PIM's existing
// (text, model, error) 3-tuple contract.
func (c *Client) Generate(ctx context.Context, systemPrompt, userPrompt string, maxTokens int) (string, string, error) {
	if maxTokens == 0 {
		maxTokens = 2048
	}

	msgs := make([]chatMessage, 0, 2)
	if systemPrompt != "" {
		msgs = append(msgs, chatMessage{Role: "system", Content: systemPrompt})
	}
	msgs = append(msgs, chatMessage{Role: "user", Content: userPrompt})

	wantModel := c.model(ctx, taskText)
	resp, err := c.chatCompletion(ctx, chatRequest{
		Model:     wantModel,
		MaxTokens: maxTokens,
		Messages:  msgs,
	})
	if err != nil {
		return "", "", err
	}

	text := stripJSONFence(resp.Choices[0].Message.Content)
	model := resp.Model
	if model == "" {
		model = wantModel
	}
	return text, model, nil
}

// GenerateImage generates an image via the image model and returns the
// (base64 data-URI, resolved model, error). The data URI is exactly the
// "data:image/...;base64,..." shape callers persist directly.
func (c *Client) GenerateImage(ctx context.Context, prompt, style string) (string, string, error) {
	fullPrompt := prompt
	if style != "" {
		fullPrompt = fmt.Sprintf("%s. Style: %s", prompt, style)
	}

	wantModel := c.model(ctx, taskImage)
	resp, err := c.chatCompletion(ctx, chatRequest{
		Model:      wantModel,
		Modalities: []string{"image", "text"},
		Messages:   []chatMessage{{Role: "user", Content: fullPrompt}},
	})
	if err != nil {
		return "", "", err
	}

	model := resp.Model
	if model == "" {
		model = wantModel
	}
	for _, img := range resp.Choices[0].Message.Images {
		if strings.HasPrefix(img.ImageURL.URL, "data:image/") {
			return img.ImageURL.URL, model, nil
		}
	}
	return "", "", fmt.Errorf("image model %q returned no image data", model)
}

// FreightInvoiceResult holds the extracted freight invoice data.
type FreightInvoiceResult struct {
	TotalAmount   float64 `json:"total_amount"`
	CarrierName   string  `json:"carrier_name"`
	InvoiceNumber string  `json:"invoice_number"`
}

const freightSystemPrompt = `You are a freight invoice extraction assistant for a lumber and building materials dealer.

Your job is to extract the total freight/shipping charge, carrier name, and invoice number from an uploaded freight invoice — this may be a scan, photo, PDF, or digital document.

Return ONLY valid JSON in this exact format:
{"total_amount": 245.50, "carrier_name": "ABC Freight", "invoice_number": "FR-12345"}

Rules:
- total_amount must be a number in dollars (not cents). This is the total freight charge on the invoice.
- carrier_name is the trucking company or freight carrier name
- invoice_number is the carrier's invoice or reference number
- If you cannot determine a field, use an empty string for text fields or 0 for total_amount
- Output ONLY the JSON object, nothing else — no markdown, no explanation`

// ExtractFreightInvoice sends a freight invoice file to the vision model for data
// extraction. Returns the extracted result, the raw model text, and an error.
//
// Unconfigured-key behavior is the caller's concern (purchase_order returns a hard
// 400); the no-key guard here is a backstop that preserves the helpful message.
func (c *Client) ExtractFreightInvoice(ctx context.Context, fileBytes []byte, contentType string) (*FreightInvoiceResult, string, error) {
	if !c.IsConfigured(ctx) {
		return nil, "", fmt.Errorf("no AI key configured — please enter the freight total manually")
	}

	content, plugins, err := buildFileContent(fileBytes, contentType,
		"Extract the freight charge details from this invoice. Return JSON with total_amount, carrier_name, and invoice_number.")
	if err != nil {
		return nil, "", fmt.Errorf("freight invoice: %w", err)
	}

	resp, err := c.chatCompletion(ctx, chatRequest{
		Model:     c.model(ctx, taskVision),
		MaxTokens: 1024,
		Messages: []chatMessage{
			{Role: "system", Content: freightSystemPrompt},
			{Role: "user", Content: content},
		},
		Plugins: plugins,
	})
	if err != nil {
		return nil, "", err
	}

	raw := resp.Choices[0].Message.Content
	cleaned := stripJSONFence(raw)

	var result FreightInvoiceResult
	if err := json.Unmarshal([]byte(cleaned), &result); err != nil {
		return nil, raw, fmt.Errorf("failed to parse AI response as JSON: %w", err)
	}
	return &result, raw, nil
}

// systemPrompt instructs the model how to extract material lists.
const systemPrompt = `You are a material list extraction assistant for a lumber and building materials dealer.

Your job is to extract structured line items from uploaded material lists — these may be handwritten notes, printed lists, PDFs, spreadsheets, or photos.

For each item you find, output exactly one line in this format:
QUANTITY UOM - DESCRIPTION

Rules:
- QUANTITY must be a number (integer or decimal)
- UOM should be one of: pcs, ea, lf, sf, bf, sheets, bags, rolls, bundles, gal
- DESCRIPTION should include dimensions, species, grade, and any other identifying details
- If you cannot determine the quantity, default to 1
- If you cannot determine the UOM, default to pcs
- Output ONLY the extracted lines, nothing else — no headers, no explanations
- Each line item on its own line
- Preserve the original descriptions as closely as possible while being clear

Example output:
50 pcs - 2x4x8 SPF Stud
25 pcs - 2x6x12 Doug Fir #2
30 sheets - OSB 7/16 4x8
20 bags - Quikrete 80lb`

// ExtractMaterialList sends a file to the vision model for material list
// extraction. Supports images, PDFs, and pre-processed text/csv. Returns the raw
// model text (the rule-based parser downstream consumes it line by line).
//
// When a MaestroClient is configured and the input is text-based, the request is
// routed through Brain's metered Maestro gateway first (dead code today).
func (c *Client) ExtractMaterialList(ctx context.Context, fileBytes []byte, contentType string) (string, error) {
	// Maestro routing for text-based inputs (preserved hook; no call-site today).
	if c.maestro != nil && (contentType == "text/plain" || contentType == "text/csv") {
		jwt := jwtFromContext(ctx)
		result, err := c.maestro.ChatWithSystemPrompt(ctx, jwt, systemPrompt,
			"Extract all material list items from this text data. Output each item as: QUANTITY UOM - DESCRIPTION\n\n"+string(fileBytes))
		if err == nil {
			return result, nil
		}
		// Fall through to the direct OpenRouter call on Maestro failure.
	}

	if !c.IsConfigured(ctx) {
		return "", fmt.Errorf("no AI key configured")
	}

	content, plugins, err := buildFileContent(fileBytes, contentType,
		"Extract all material list items from this document. Output each item as: QUANTITY UOM - DESCRIPTION")
	if err != nil {
		return "", err
	}

	resp, err := c.chatCompletion(ctx, chatRequest{
		Model:     c.model(ctx, taskVision),
		MaxTokens: 4096,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: content},
		},
		Plugins: plugins,
	})
	if err != nil {
		return "", err
	}

	// Raw text (no fence strip): downstream parsing splits on newlines.
	return resp.Choices[0].Message.Content, nil
}

// buildFileContent translates an uploaded file into OpenAI content blocks and the
// matching plugins. image/* → image_url; application/pdf → file + file-parser
// plugin; text/plain & text/csv → a single text block with the content inlined.
// The "unsupported content type" errors mirror the original Anthropic paths.
func buildFileContent(fileBytes []byte, contentType, instruction string) ([]contentPart, []plugin, error) {
	switch {
	case strings.HasPrefix(contentType, "image/"):
		return []contentPart{
			{
				Type:     "image_url",
				ImageURL: &imageURL{URL: "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(fileBytes)},
			},
			{Type: "text", Text: instruction},
		}, nil, nil

	case contentType == "application/pdf":
		return []contentPart{
				{
					Type: "file",
					File: &filePart{
						Filename: "upload.pdf",
						FileData: "data:application/pdf;base64," + base64.StdEncoding.EncodeToString(fileBytes),
					},
				},
				{Type: "text", Text: instruction},
			},
			[]plugin{{ID: "file-parser", PDF: &pdfPlugin{Engine: defaultPDFEngine}}},
			nil

	case contentType == "text/plain" || contentType == "text/csv":
		return []contentPart{
			{Type: "text", Text: instruction + "\n\n" + string(fileBytes)},
		}, nil, nil

	default:
		return nil, nil, fmt.Errorf("unsupported content type: %s", contentType)
	}
}
