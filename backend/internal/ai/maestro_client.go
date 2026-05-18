package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// MaestroClient routes AI requests through FB Brain's Maestro AI Gateway.
// Brain handles model selection, metering, and billing markup transparently.
// All usage is attributed to the org_id embedded in the forwarded JWT.
type MaestroClient struct {
	brainBaseURL string
	httpClient   *http.Client
	logger       *slog.Logger
}

// NewMaestroClient creates a new client that proxies AI calls through Brain's Maestro.
func NewMaestroClient(brainBaseURL string, logger *slog.Logger) *MaestroClient {
	return &MaestroClient{
		brainBaseURL: strings.TrimRight(brainBaseURL, "/"),
		httpClient: &http.Client{
			Timeout: 90 * time.Second, // AI calls can be slow
		},
		logger: logger,
	}
}

// --- Request / Response types matching Brain's Maestro API ---

type maestroChatRequest struct {
	Message string `json:"message"`
}

type maestroChatResponse struct {
	Data struct {
		SessionID string          `json:"session_id"`
		Reply     string          `json:"reply"`
		Intent    string          `json:"intent"`
		ToolResults json.RawMessage `json:"tool_results,omitempty"`
	} `json:"data"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
	Meta struct {
		RequestID string `json:"request_id"`
		Timestamp string `json:"timestamp"`
	} `json:"meta"`
}

// Chat sends a text message to Brain's Maestro and returns the reply text.
// The JWT is forwarded as a Bearer token so Brain can attribute AI usage to
// the correct org for metering and billing.
func (m *MaestroClient) Chat(ctx context.Context, jwt, message string) (string, error) {
	reqBody := maestroChatRequest{Message: message}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshaling maestro request: %w", err)
	}

	url := m.brainBaseURL + "/api/maestro/chat"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("creating maestro request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if jwt != "" {
		req.Header.Set("Authorization", "Bearer "+jwt)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("maestro request failed: %w", err)
	}
	defer resp.Body.Close()

	// F-02: Cap response body to 10MB to prevent unbounded reads
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", fmt.Errorf("reading maestro response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var chatResp maestroChatResponse
		if json.Unmarshal(respBody, &chatResp) == nil && chatResp.Error != nil {
			return "", fmt.Errorf("maestro error (%d): %s - %s", resp.StatusCode, chatResp.Error.Code, chatResp.Error.Message)
		}
		return "", fmt.Errorf("maestro error (%d): %s", resp.StatusCode, string(respBody))
	}

	var chatResp maestroChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("parsing maestro response: %w", err)
	}

	if chatResp.Error != nil {
		return "", fmt.Errorf("maestro error: %s - %s", chatResp.Error.Code, chatResp.Error.Message)
	}

	return chatResp.Data.Reply, nil
}

// ChatWithSystemPrompt sends a message to Maestro with a system prompt prepended.
// The system prompt and user content are serialized into a single message for
// Brain's Maestro to process — Brain applies its own classifier on top.
func (m *MaestroClient) ChatWithSystemPrompt(ctx context.Context, jwt, systemPrompt, userContent string) (string, error) {
	combined := fmt.Sprintf("[SYSTEM]\n%s\n\n[USER]\n%s", systemPrompt, userContent)
	return m.Chat(ctx, jwt, combined)
}
