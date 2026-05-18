package pim

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/ai"
)

// TextAIClient calls the Anthropic Messages API for text generation
type TextAIClient struct {
	apiKey   string
	keyStore *ai.KeyStore
	model    string
	client   *http.Client
}

// NewTextAIClient creates a new Anthropic API client
func NewTextAIClient(apiKey, model string) *TextAIClient {
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}
	return &TextAIClient{
		apiKey: apiKey,
		model:  model,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// NewTextAIClientWithKeyStore creates an Anthropic client that reads the key dynamically.
func NewTextAIClientWithKeyStore(ks *ai.KeyStore, model string) *TextAIClient {
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}
	return &TextAIClient{
		keyStore: ks,
		model:    model,
		client:   &http.Client{Timeout: 30 * time.Second},
	}
}

// getKey resolves the API key, preferring keystore over static.
func (c *TextAIClient) getKey(ctx context.Context) string {
	if c.keyStore != nil {
		return c.keyStore.Get(ctx)
	}
	return c.apiKey
}

// anthropicRequest is the Anthropic Messages API request body
type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// anthropicResponse is a simplified Anthropic Messages API response
type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Model string `json:"model"`
}

// Generate sends a prompt to the Anthropic API and returns the text response
func (c *TextAIClient) Generate(systemPrompt, userPrompt string, maxTokens int) (string, string, error) {
	apiKey := c.getKey(context.Background())
	if apiKey == "" {
		return "", "", fmt.Errorf("no Anthropic API key configured — set key in Admin > AI Settings")
	}

	if maxTokens == 0 {
		maxTokens = 2048
	}

	reqBody := anthropicRequest{
		Model:     c.model,
		MaxTokens: maxTokens,
		System:    systemPrompt,
		Messages: []anthropicMessage{
			{Role: "user", Content: userPrompt},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("api call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("anthropic API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var apiResp anthropicResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", "", fmt.Errorf("unmarshal response: %w", err)
	}

	if len(apiResp.Content) == 0 {
		return "", "", fmt.Errorf("empty response from API")
	}

	text := apiResp.Content[0].Text

	// Strip markdown code fences if present (e.g. ```json ... ```)
	cleaned := strings.TrimSpace(text)
	if strings.HasPrefix(cleaned, "```") {
		if idx := strings.Index(cleaned, "\n"); idx != -1 {
			cleaned = cleaned[idx+1:]
		}
		if idx := strings.LastIndex(cleaned, "```"); idx != -1 {
			cleaned = cleaned[:idx]
		}
		text = strings.TrimSpace(cleaned)
	}

	return text, apiResp.Model, nil
}

// ImageAIClient calls the Stability AI API for image generation
type ImageAIClient struct {
	apiKey string
	client *http.Client
}

// NewImageAIClient creates a new Stability AI client
func NewImageAIClient(apiKey string) *ImageAIClient {
	return &ImageAIClient{
		apiKey: apiKey,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Generate calls Stability AI to generate an image, returns base64 data
func (c *ImageAIClient) Generate(prompt, style string) (string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	_ = w.WriteField("prompt", prompt)
	_ = w.WriteField("output_format", "png")
	if style != "" {
		_ = w.WriteField("style_preset", style)
	}
	w.Close()

	req, err := http.NewRequest("POST", "https://api.stability.ai/v2beta/stable-image/generate/core", &buf)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("stability api call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("stability API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Image string `json:"image"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}

	return "data:image/png;base64," + result.Image, nil
}

// GeminiImageClient calls the Google Gemini API for image generation
type GeminiImageClient struct {
	apiKey string
	model  string
	client *http.Client
}

// NewGeminiImageClient creates a new Google Gemini image generation client
func NewGeminiImageClient(apiKey string) *GeminiImageClient {
	return &GeminiImageClient{
		apiKey: apiKey,
		model:  "gemini-3.1-flash-image-preview",
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

type geminiRequest struct {
	Contents         []geminiContent  `json:"contents"`
	GenerationConfig geminiGenConfig  `json:"generationConfig"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text       string          `json:"text,omitempty"`
	InlineData *geminiInline   `json:"inlineData,omitempty"`
}

type geminiInline struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type geminiGenConfig struct {
	ResponseModalities []string `json:"responseModalities"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text       string       `json:"text,omitempty"`
				InlineData *geminiInline `json:"inlineData,omitempty"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

// Generate calls Gemini to generate a product image, returns a data URI
func (c *GeminiImageClient) Generate(prompt, style string) (string, error) {
	fullPrompt := prompt
	if style != "" {
		fullPrompt = fmt.Sprintf("%s. Style: %s", prompt, style)
	}

	reqBody := geminiRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: fullPrompt}}},
		},
		GenerationConfig: geminiGenConfig{
			ResponseModalities: []string{"IMAGE", "TEXT"},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal gemini request: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", c.model, c.apiKey)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini api call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", fmt.Errorf("read gemini response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var gemResp geminiResponse
	if err := json.Unmarshal(respBody, &gemResp); err != nil {
		return "", fmt.Errorf("unmarshal gemini response: %w", err)
	}

	if gemResp.Error != nil {
		return "", fmt.Errorf("gemini API error: %s", gemResp.Error.Message)
	}

	// Find the image part in the response
	for _, candidate := range gemResp.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData != nil && strings.HasPrefix(part.InlineData.MimeType, "image/") {
				return fmt.Sprintf("data:%s;base64,%s", part.InlineData.MimeType, part.InlineData.Data), nil
			}
		}
	}

	return "", fmt.Errorf("gemini response did not contain an image")
}
