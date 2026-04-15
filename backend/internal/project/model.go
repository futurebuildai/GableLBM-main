package project

import (
	"time"

	"github.com/google/uuid"
)

// Project represents a construction job/project linked to a customer.
type Project struct {
	ID         uuid.UUID `json:"id"`
	CustomerID uuid.UUID `json:"customer_id"`
	Name       string    `json:"name"`
	Status     string    `json:"status"` // Active, Completed
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ProjectDashboardDTO aggregates orders, deliveries, and invoices for a project.
type ProjectDashboardDTO struct {
	Project    Project       `json:"project"`
	Orders     []ProjectItem `json:"orders"`
	Deliveries []ProjectItem `json:"deliveries"`
	Invoices   []ProjectItem `json:"invoices"`
}

// ProjectItem is a generic summary of an associated entity (Order, Delivery, Invoice).
// TODO: align with int64 cents — TotalAmount is float64 dollars
type ProjectItem struct {
	ID          uuid.UUID `json:"id"`
	Type        string    `json:"type"` // ORDER, DELIVERY, INVOICE
	Status      string    `json:"status"`
	TotalAmount float64   `json:"total_amount,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	Reference   string    `json:"reference,omitempty"` // e.g. "Order #1234"
}

// CreateProjectRequest is the payload to create a new project.
type CreateProjectRequest struct {
	Name string `json:"name"`
}

// UpdateProjectRequest is the payload to update an existing project's status/name.
type UpdateProjectRequest struct {
	Name   *string `json:"name,omitempty"`
	Status *string `json:"status,omitempty"`
}
