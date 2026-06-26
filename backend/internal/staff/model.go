package staff

import (
	"time"

	"github.com/google/uuid"
)

// Staff is a member of the dealer's roster. This is distinct from a JWT-`sub`
// ERP user: it is the identity AI_LM authenticates against via the
// `validate-staff` integration call, and the subject of per-module access
// grants. Module access is governed by ModuleGrants (and the global
// modules.<id>.enabled flag), not by Role — Role is a free-text label.
type Staff struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	StaffNo   *string   `json:"staff_no,omitempty"`
	Role      string    `json:"role"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Modules is the set of module_ids granted to this staff member. Populated on
	// list/get so the admin UI can render per-module grant checkboxes. Not a DB
	// column.
	Modules []string `json:"modules"`
}

// CreateStaffInput is the payload to create a staff member.
type CreateStaffInput struct {
	Email    string  `json:"email"`
	FullName string  `json:"full_name"`
	StaffNo  *string `json:"staff_no"`
	Role     string  `json:"role"`
	Active   *bool   `json:"active"`
}

// UpdateStaffInput is the payload to update a staff member. All fields optional;
// nil means "leave unchanged".
type UpdateStaffInput struct {
	Email    *string `json:"email"`
	FullName *string `json:"full_name"`
	StaffNo  *string `json:"staff_no"`
	Role     *string `json:"role"`
	Active   *bool   `json:"active"`
}

// Module is the global state of an integration module (e.g. AI_LM), toggled via
// the modules.<id>.enabled system setting.
type Module struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// Validation is the result of a `validate-staff` lookup. It carries everything
// the AI_LM integration endpoint needs to shape its response.
type Validation struct {
	Found    bool
	StaffID  uuid.UUID
	Email    string
	Name     string
	Role     string
	Entitled bool
	Modules  []string // granted module_ids that are also globally enabled
}

// knownModules is the catalog of integration modules the admin UI can toggle.
// Today AI_LM is the only one; extend this as modules are added.
var knownModules = []Module{
	{ID: "ai_lm", Name: "AI_LM"},
}
