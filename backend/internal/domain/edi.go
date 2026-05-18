package domain

import (
	"time"

	"github.com/google/uuid"
)

// EDIProfile represents settings for a vendor's EDI connection
type EDIProfile struct {
	VendorID        uuid.UUID
	ISASenderID     string
	ISAReceiverID   string
	GSSenderID      string
	GSReceiverID    string
	ProductionMode  bool
	TransportMethod string // "FTP", "SFTP", "AS2"
	DestinationURL  string
}

// X12Document represents a raw EDI document
type X12Document struct {
	ID        uuid.UUID
	Type      string // "850", "855", "810"
	Content   string
	CreatedAt time.Time
	SentAt    *time.Time
	Status    string // Queued, Sent, Failed
}

// POData is a DTO for Purchase Order data needed for EDI
type POData struct {
	ID       uuid.UUID
	PONumber string
	VendorID uuid.UUID
	Lines    []POlineData
}

type POlineData struct {
	LineNumber int
	Quantity   float64
	Cost       float64
	ItemCode   string
}
