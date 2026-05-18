package governance

import (
	"time"

	"github.com/google/uuid"
)

type RFCStatus string

const (
	RFCStatusDraft    RFCStatus = "draft"
	RFCStatusReview   RFCStatus = "review"
	RFCStatusApproved RFCStatus = "approved"
	RFCStatusRejected RFCStatus = "rejected"
)

type RFC struct {
	ID               uuid.UUID  `json:"id"`
	Title            string     `json:"title"`
	Status           RFCStatus  `json:"status"`
	ProblemStatement string     `json:"problem_statement" `
	ProposedSolution string     `json:"proposed_solution"`
	Content          string     `json:"content"`
	AuthorID         *uuid.UUID `json:"author_id"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}
