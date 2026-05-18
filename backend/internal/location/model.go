package location

import (
	"time"

	"github.com/google/uuid"
)

// LocationType represents the hierarchy level of a location.
type LocationType string

const (
	LocTypeBranch LocationType = "BRANCH"
	LocTypeZone   LocationType = "ZONE"
	LocTypeAisle  LocationType = "AISLE"
	LocTypeRack   LocationType = "RACK"
	LocTypeShelf  LocationType = "SHELF"
	LocTypeBin    LocationType = "BIN"
	LocTypeYard   LocationType = "YARD"
)

// Location represents a node in the location hierarchy. A node with
// Type=BRANCH and ParentID=nil is a top-level branch; every other row has a
// parent and a denormalized BranchID (kept up to date by a DB trigger).
type Location struct {
	ID          uuid.UUID    `json:"id"`
	ParentID    *uuid.UUID   `json:"parent_id,omitempty"` // Branch rows have nil ParentID
	Path        string       `json:"path"`                // e.g. "West Yard/Row 1"
	Type        LocationType `json:"type"`
	Code        string       `json:"code"` // short identifier (e.g. "A", "1", "B2")
	Description string       `json:"description,omitempty"`

	// Branch-only metadata. Non-branch rows leave these fields zero/null.
	Name                string     `json:"name,omitempty"`
	Address             string     `json:"address,omitempty"`
	City                string     `json:"city,omitempty"`
	State               string     `json:"state,omitempty"`
	Zip                 string     `json:"zip,omitempty"`
	Phone               string     `json:"phone,omitempty"`
	TaxJurisdictionCode string     `json:"tax_jurisdiction_code,omitempty"`
	DefaultTaxRate      *float64   `json:"default_tax_rate,omitempty"`
	Timezone            string     `json:"timezone,omitempty"`
	Active              bool       `json:"active"`
	BranchID            *uuid.UUID `json:"branch_id,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Optional: computed children for tree views.
	Children []Location `json:"children,omitempty"`
}

// IsBranch reports whether this row is a top-level branch.
func (l *Location) IsBranch() bool {
	return l.Type == LocTypeBranch
}

// BranchSummary is the lightweight projection used by selectors and
// /me/branches responses.
type BranchSummary struct {
	ID       uuid.UUID `json:"id"`
	Code     string    `json:"code"`
	Name     string    `json:"name"`
	Active   bool      `json:"active"`
	IsHome   bool      `json:"is_home,omitempty"`   // populated by /me/branches
	Timezone string    `json:"timezone,omitempty"`
}

// UserLocation describes a user's grant to a single branch.
type UserLocation struct {
	UserSub   string    `json:"user_sub"`
	BranchID  uuid.UUID `json:"branch_id"`
	IsHome    bool      `json:"is_home"`
	GrantedAt time.Time `json:"granted_at"`
	GrantedBy string    `json:"granted_by,omitempty"`
}
