package configurator

import (
	"time"

	"github.com/google/uuid"
)

// ConfiguratorRule defines a dependency constraint between product attributes.
// For example: Species="SYP" allows Treatment="Treatable".
type ConfiguratorRule struct {
	ID             uuid.UUID `json:"id"`
	AttributeType  string    `json:"attribute_type"`   // e.g., "Grade", "Treatment"
	AttributeValue string    `json:"attribute_value"`  // e.g., "Treatable", "#2"
	DependsOnType  string    `json:"depends_on_type"`  // e.g., "Species"
	DependsOnValue string    `json:"depends_on_value"` // e.g., "SYP"
	IsAllowed      bool      `json:"is_allowed"`
	ErrorMessage   *string   `json:"error_message,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ConfiguratorPreset is a pre-built product template.
type ConfiguratorPreset struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	ProductType string    `json:"product_type"`
	Config      []byte    `json:"config"` // JSONB
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ValidateConfigRequest contains the user's attribute selections to validate.
type ValidateConfigRequest struct {
	Selections map[string]string `json:"selections"` // e.g., {"Species": "SYP", "Grade": "#2", "Treatment": "Treatable"}
}

// ValidationConflict describes a single rule violation.
type ValidationConflict struct {
	AttributeType  string `json:"attribute_type"`
	AttributeValue string `json:"attribute_value"`
	DependsOnType  string `json:"depends_on_type"`
	DependsOnValue string `json:"depends_on_value"`
	Message        string `json:"message"`
}

// ValidateConfigResponse contains the validation result.
type ValidateConfigResponse struct {
	Valid     bool                 `json:"valid"`
	Conflicts []ValidationConflict `json:"conflicts,omitempty"`
}

// BuildSKURequest contains the finalized attribute selections.
type BuildSKURequest struct {
	ProductType string            `json:"product_type"` // "Lumber", "Door", "Trim", "Panel"
	Selections  map[string]string `json:"selections"`
}

// BuildSKUResponse contains the generated non-stock SKU.
type BuildSKUResponse struct {
	SKU         string `json:"sku"`
	Description string `json:"description"`
}

// AvailableOptionsRequest asks for valid options for a given step.
type AvailableOptionsRequest struct {
	AttributeType string            `json:"attribute_type"` // The attribute to get options for
	Selections    map[string]string `json:"selections"`     // Current selections so far
}

// AvailableOption is a single allowed value with its display label.
type AvailableOption struct {
	Value   string `json:"value"`
	Allowed bool   `json:"allowed"`
	Message string `json:"message,omitempty"` // Why it's disallowed
}
