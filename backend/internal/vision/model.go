package vision

// BlueprintScanRequest contains simulated blueprint text and the user's configurator selections.
type BlueprintScanRequest struct {
	BlueprintText    string            `json:"blueprint_text"`    // Simulated extracted text from PDF
	ConfigSelections map[string]string `json:"config_selections"` // User's configurator choices
}

// BlueprintScanResponse contains extracted dimensions and any mismatches found.
type BlueprintScanResponse struct {
	ExtractedDimensions map[string]string `json:"extracted_dimensions"` // e.g., {"stud_length": "10'", "spacing": "16\" OC"}
	Mismatches          []Mismatch        `json:"mismatches"`
	Summary             string            `json:"summary"`
}

// Mismatch represents a discrepancy between blueprint specs and configurator selections.
type Mismatch struct {
	Field          string `json:"field"` // e.g., "Dimensions", "Species"
	BlueprintValue string `json:"blueprint_value"`
	ConfigValue    string `json:"config_value"`
	Severity       string `json:"severity"` // "warning" or "error"
	Message        string `json:"message"`
}
