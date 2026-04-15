package notification

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SMSService defines the interface for sending SMS messages.
type SMSService interface {
	SendSMS(ctx context.Context, to string, body string) error
}

// TwilioConfig holds Twilio API credentials.
type TwilioConfig struct {
	AccountSID string
	AuthToken  string
	FromNumber string
}

// TwilioSMSService implements SMSService using the Twilio REST API.
type TwilioSMSService struct {
	config TwilioConfig
	client *http.Client
	logger *slog.Logger
}

// NewTwilioSMSService creates a new Twilio SMS service.
func NewTwilioSMSService(cfg TwilioConfig, logger *slog.Logger) *TwilioSMSService {
	return &TwilioSMSService{
		config: cfg,
		client: &http.Client{Timeout: 10 * time.Second},
		logger: logger,
	}
}

func (s *TwilioSMSService) SendSMS(ctx context.Context, to string, body string) error {
	apiURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", s.config.AccountSID)

	data := url.Values{}
	data.Set("To", to)
	data.Set("From", s.config.FromNumber)
	data.Set("Body", body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("create twilio request: %w", err)
	}
	req.SetBasicAuth(s.config.AccountSID, s.config.AuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("twilio API call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
		return fmt.Errorf("twilio returned status %d: %s", resp.StatusCode, string(respBody))
	}

	s.logger.Info("SMS sent via Twilio", "to", to, "body_length", len(body))
	return nil
}

// LogSMSService is a dev/demo fallback that logs SMS instead of sending.
type LogSMSService struct {
	logger *slog.Logger
}

// NewLogSMSService creates a logging-only SMS service.
func NewLogSMSService(logger *slog.Logger) *LogSMSService {
	return &LogSMSService{logger: logger}
}

func (s *LogSMSService) SendSMS(_ context.Context, to string, body string) error {
	s.logger.Info("MOCK SMS SENT",
		"to", to,
		"body", body,
	)
	return nil
}
