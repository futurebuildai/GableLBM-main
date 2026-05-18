package vision

import (
	"fmt"
	"regexp"
	"strings"
)

// Pre-compiled regexes for performance (avoid recompilation on every request).
var (
	dimRegex     = regexp.MustCompile(`(\d+)\s*x\s*(\d+)`)
	lengthRegex  = regexp.MustCompile(`(\d+)\s*(?:'|foot|feet|ft)\b`)
	studRegex    = regexp.MustCompile(`(\d+)\s*(?:'|foot|ft)\s*stud`)
	spacingRegex = regexp.MustCompile(`(\d+)(?:"|''|in|inch)\s*(?:o\.?c\.?|on\s*center)`)
)

// Service provides simulated AI blueprint extraction and mismatch detection.
type Service struct{}

func NewService() *Service {
	return &Service{}
}

// ScanBlueprint parses simulated blueprint text for dimensions and specs,
// then compares against the user's configurator selections to flag mismatches.
func (s *Service) ScanBlueprint(req BlueprintScanRequest) *BlueprintScanResponse {
	resp := &BlueprintScanResponse{
		ExtractedDimensions: make(map[string]string),
		Mismatches:          make([]Mismatch, 0),
	}

	text := strings.ToLower(req.BlueprintText)

	// Extract common lumber dimensions (e.g., "2x4", "2x6", "2x8")
	if matches := dimRegex.FindStringSubmatch(text); len(matches) == 3 {
		dim := fmt.Sprintf("%sx%s", matches[1], matches[2])
		resp.ExtractedDimensions["cross_section"] = dim
	}

	// Extract lengths (e.g., "10' stud", "8 foot", "12ft")
	if matches := lengthRegex.FindStringSubmatch(text); len(matches) == 2 {
		resp.ExtractedDimensions["length"] = matches[1] + "'"
	}

	// Extract stud length specifically (e.g., "10' stud")
	if matches := studRegex.FindStringSubmatch(text); len(matches) == 2 {
		resp.ExtractedDimensions["stud_length"] = matches[1] + "'"
	}

	// Extract spacing (e.g., "16\" OC", "24\" on center")
	if matches := spacingRegex.FindStringSubmatch(text); len(matches) == 2 {
		resp.ExtractedDimensions["spacing"] = matches[1] + "\" OC"
	}

	// Extract species mentions — use ordered slice for deterministic matching,
	// checking longer/more-specific keywords first to avoid false positives.
	type speciesEntry struct {
		keyword string
		species string
	}
	speciesKeywords := []speciesEntry{
		{"southern yellow pine", "SYP"},
		{"douglas fir", "Douglas Fir"},
		{"western red cedar", "Cedar"},
		{"spruce-pine-fir", "SPF"},
		{"doug fir", "Douglas Fir"},
		{"hem-fir", "Hem-Fir"},
		{"hemfir", "Hem-Fir"},
		{"cedar", "Cedar"},
		{"syp", "SYP"},
		{"spf", "SPF"},
	}
	for _, entry := range speciesKeywords {
		if strings.Contains(text, entry.keyword) {
			resp.ExtractedDimensions["species"] = entry.species
			break
		}
	}

	// Extract treatment mentions — use word-boundary-aware checks
	// to avoid false positives (e.g., "pt" matching "apartment")
	if strings.Contains(text, "treated") || strings.Contains(text, "pressure treat") {
		resp.ExtractedDimensions["treatment"] = "Treatable"
	} else {
		// Check for standalone "pt" or "p.t." abbreviation with word boundaries
		ptRegex := regexp.MustCompile(`\bpt\b|\bp\.t\.\b`)
		if ptRegex.MatchString(text) {
			resp.ExtractedDimensions["treatment"] = "Treatable"
		}
	}

	// Now compare extracted dimensions against config selections
	if req.ConfigSelections != nil {
		s.detectMismatches(resp, req.ConfigSelections)
	}

	// Build summary
	if len(resp.Mismatches) == 0 {
		resp.Summary = fmt.Sprintf("Blueprint analysis complete. %d dimensions extracted. No mismatches found.", len(resp.ExtractedDimensions))
	} else {
		errors := 0
		warnings := 0
		for _, m := range resp.Mismatches {
			if m.Severity == "error" {
				errors++
			} else {
				warnings++
			}
		}
		resp.Summary = fmt.Sprintf("Blueprint analysis complete. %d dimensions extracted. Found %d error(s) and %d warning(s).",
			len(resp.ExtractedDimensions), errors, warnings)
	}

	return resp
}

func (s *Service) detectMismatches(resp *BlueprintScanResponse, selections map[string]string) {
	// Check species mismatch
	if bpSpecies, ok := resp.ExtractedDimensions["species"]; ok {
		if configSpecies, ok := selections["Species"]; ok && configSpecies != "" {
			if !strings.EqualFold(bpSpecies, configSpecies) {
				resp.Mismatches = append(resp.Mismatches, Mismatch{
					Field:          "Species",
					BlueprintValue: bpSpecies,
					ConfigValue:    configSpecies,
					Severity:       "error",
					Message:        fmt.Sprintf("Blueprint specifies %s but configurator has %s selected", bpSpecies, configSpecies),
				})
			}
		}
	}

	// Check dimension mismatch
	if bpDim, ok := resp.ExtractedDimensions["cross_section"]; ok {
		if configDim, ok := selections["Dimensions"]; ok && configDim != "" {
			// Extract cross-section from config dimensions (e.g., "2x6-10" → "2x6")
			configCross := strings.Split(configDim, "-")[0]
			if !strings.EqualFold(bpDim, configCross) {
				resp.Mismatches = append(resp.Mismatches, Mismatch{
					Field:          "Dimensions",
					BlueprintValue: bpDim,
					ConfigValue:    configCross,
					Severity:       "error",
					Message:        fmt.Sprintf("Blueprint specifies %s cross-section but configurator has %s", bpDim, configCross),
				})
			}
		}
	}

	// Check length mismatch
	if bpLength, ok := resp.ExtractedDimensions["stud_length"]; ok {
		if configDim, ok := selections["Dimensions"]; ok && configDim != "" {
			// Extract length from config dimensions (e.g., "2x6-10" → "10")
			parts := strings.Split(configDim, "-")
			if len(parts) >= 2 {
				configLength := parts[1] + "'"
				if bpLength != configLength {
					resp.Mismatches = append(resp.Mismatches, Mismatch{
						Field:          "Length",
						BlueprintValue: bpLength,
						ConfigValue:    configLength,
						Severity:       "warning",
						Message:        fmt.Sprintf("Blueprint specifies %s stud length but configurator has %s", bpLength, configLength),
					})
				}
			}
		}
	}

	// Check treatment mismatch
	if bpTreatment, ok := resp.ExtractedDimensions["treatment"]; ok {
		if configTreatment, ok := selections["Treatment"]; ok {
			if configTreatment == "None" || configTreatment == "" {
				resp.Mismatches = append(resp.Mismatches, Mismatch{
					Field:          "Treatment",
					BlueprintValue: bpTreatment,
					ConfigValue:    "None",
					Severity:       "warning",
					Message:        "Blueprint indicates treated lumber but configurator has no treatment selected",
				})
			}
		}
	}
}
