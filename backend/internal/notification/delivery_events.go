package notification

import (
	"context"
	"fmt"
	"log/slog"
)

// DeliveryEventType represents the type of delivery status change.
type DeliveryEventType string

const (
	DeliveryEventStaged         DeliveryEventType = "STAGED"
	DeliveryEventOutForDelivery DeliveryEventType = "OUT_FOR_DELIVERY"
	DeliveryEventDelivered      DeliveryEventType = "DELIVERED"
)

// DeliveryEvent is emitted when a delivery status changes.
type DeliveryEvent struct {
	EventType     DeliveryEventType
	DeliveryID    string
	OrderNumber   string
	CustomerName  string
	CustomerPhone string
	CustomerEmail string
	ETA           string // Estimated arrival time (ISO 8601), only for OUT_FOR_DELIVERY
	ReceiptURL    string // Link to delivery receipt, only for DELIVERED
}

// DeliveryNotifier sends SMS and email notifications on delivery status changes.
type DeliveryNotifier struct {
	sms    SMSService
	email  EmailService
	logger *slog.Logger
}

// NewDeliveryNotifier creates a new delivery notification orchestrator.
func NewDeliveryNotifier(sms SMSService, email EmailService, logger *slog.Logger) *DeliveryNotifier {
	return &DeliveryNotifier{sms: sms, email: email, logger: logger}
}

// Notify sends the appropriate notification(s) for a delivery event.
func (n *DeliveryNotifier) Notify(ctx context.Context, event DeliveryEvent) {
	var smsBody, emailSubject, emailBody string

	switch event.EventType {
	case DeliveryEventStaged:
		smsBody = fmt.Sprintf("Your order #%s is being prepared for delivery.", event.OrderNumber)
		emailSubject = fmt.Sprintf("Order #%s - Being Prepared", event.OrderNumber)
		emailBody = fmt.Sprintf("Hi %s, your order #%s is being staged and prepared for delivery. We'll notify you when it's on the way.",
			event.CustomerName, event.OrderNumber)

	case DeliveryEventOutForDelivery:
		if event.ETA != "" {
			smsBody = fmt.Sprintf("Your delivery is on the way! Order #%s - ETA: %s", event.OrderNumber, event.ETA)
		} else {
			smsBody = fmt.Sprintf("Your delivery is on the way! Order #%s", event.OrderNumber)
		}
		emailSubject = fmt.Sprintf("Order #%s - Out for Delivery", event.OrderNumber)
		emailBody = fmt.Sprintf("Hi %s, your order #%s is out for delivery.", event.CustomerName, event.OrderNumber)
		if event.ETA != "" {
			emailBody += fmt.Sprintf(" Estimated arrival: %s.", event.ETA)
		}

	case DeliveryEventDelivered:
		smsBody = fmt.Sprintf("Your delivery has been completed! Order #%s", event.OrderNumber)
		if event.ReceiptURL != "" {
			smsBody += fmt.Sprintf(" View receipt: %s", event.ReceiptURL)
		}
		emailSubject = fmt.Sprintf("Order #%s - Delivered", event.OrderNumber)
		emailBody = fmt.Sprintf("Hi %s, your order #%s has been delivered.", event.CustomerName, event.OrderNumber)

	default:
		n.logger.Warn("Unknown delivery event type", "type", event.EventType)
		return
	}

	// Send SMS if phone number available
	if event.CustomerPhone != "" {
		if err := n.sms.SendSMS(ctx, event.CustomerPhone, smsBody); err != nil {
			n.logger.Error("Failed to send delivery SMS",
				"delivery_id", event.DeliveryID,
				"to", event.CustomerPhone,
				"error", err,
			)
		}
	}

	// Send email if email available
	if event.CustomerEmail != "" {
		if err := n.email.SendDeliveryNotification(ctx, event.CustomerEmail, emailSubject, emailBody); err != nil {
			n.logger.Error("Failed to send delivery email",
				"delivery_id", event.DeliveryID,
				"to", event.CustomerEmail,
				"error", err,
			)
		}
	}

	n.logger.Info("Delivery notification sent",
		"event_type", event.EventType,
		"delivery_id", event.DeliveryID,
		"order_number", event.OrderNumber,
	)
}
