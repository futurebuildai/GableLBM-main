package notification

import (
	"context"
	"fmt"
	"log/slog"
)

// EmailService defines the interface for sending emails.
type EmailService interface {
	SendInvoice(ctx context.Context, to string, invoiceID string, pdfBytes []byte) error
	SendDeliveryNotification(ctx context.Context, to string, subject string, body string) error
}

// LogEmailService is a dev/demo fallback that logs emails instead of sending.
type LogEmailService struct {
	logger *slog.Logger
}

// NewLogEmailService creates a logging-only email service.
func NewLogEmailService(logger *slog.Logger) *LogEmailService {
	return &LogEmailService{logger: logger}
}

func (s *LogEmailService) SendInvoice(ctx context.Context, to string, invoiceID string, pdfBytes []byte) error {
	s.logger.Info("MOCK EMAIL SENT",
		"to", to,
		"subject", fmt.Sprintf("Invoice #%s", invoiceID),
		"attachment_size", len(pdfBytes),
		"body", "Please find your invoice attached.",
	)
	return nil
}

func (s *LogEmailService) SendDeliveryNotification(ctx context.Context, to string, subject string, body string) error {
	s.logger.Info("MOCK DELIVERY EMAIL SENT",
		"to", to,
		"subject", subject,
		"body", body,
	)
	return nil
}
