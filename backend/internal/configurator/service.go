package configurator

import (
	"context"
	"fmt"
	"strings"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// GetAllRules returns the complete rule set for the frontend to display.
func (s *Service) GetAllRules(ctx context.Context) ([]ConfiguratorRule, error) {
	return s.repo.GetAllRules(ctx)
}

// GetPresets delegates to the repository for preset retrieval.
func (s *Service) GetPresets(ctx context.Context, productType string) ([]ConfiguratorPreset, error) {
	return s.repo.GetPresets(ctx, productType)
}

// ValidateConfig checks a full set of attribute selections against the rule matrix.
// Returns valid=true if no conflicts, or valid=false with detailed conflict messages.
func (s *Service) ValidateConfig(ctx context.Context, req ValidateConfigRequest) (*ValidateConfigResponse, error) {
	resp := &ValidateConfigResponse{Valid: true}

	// Deduplicate: track which (attr, dep) pairs we've already checked
	type pairKey struct{ attr, dep string }
	checked := make(map[pairKey]bool)

	// For each selected attribute, check if it conflicts with any other selection
	for attrType, attrValue := range req.Selections {
		for depType, depValue := range req.Selections {
			if attrType == depType {
				continue // Don't check against self
			}

			// Skip if we've already checked the reverse direction
			key := pairKey{attrType + "=" + attrValue, depType + "=" + depValue}
			if checked[key] {
				continue
			}
			checked[key] = true

			// Look up rules: does attrType=attrValue conflict with depType=depValue?
			rules, err := s.repo.GetAllowedValues(ctx, attrType, depType, depValue)
			if err != nil {
				return nil, fmt.Errorf("failed to check rules for %s=%s: %w", attrType, attrValue, err)
			}

			// If there are rules for this combination, check if our value is explicitly disallowed
			for _, rule := range rules {
				if rule.AttributeValue == attrValue && !rule.IsAllowed {
					resp.Valid = false
					msg := fmt.Sprintf("%s '%s' is not compatible with %s '%s'", attrType, attrValue, depType, depValue)
					if rule.ErrorMessage != nil && *rule.ErrorMessage != "" {
						msg = *rule.ErrorMessage
					}
					resp.Conflicts = append(resp.Conflicts, ValidationConflict{
						AttributeType:  attrType,
						AttributeValue: attrValue,
						DependsOnType:  depType,
						DependsOnValue: depValue,
						Message:        msg,
					})
				}
			}
		}
	}

	return resp, nil
}

// GetAvailableOptions returns available values for an attribute type given current selections.
func (s *Service) GetAvailableOptions(ctx context.Context, req AvailableOptionsRequest) ([]AvailableOption, error) {
	// If no parent selections constrain this attribute, return static defaults
	if len(req.Selections) == 0 {
		return s.getStaticOptions(req.AttributeType), nil
	}

	optionMap := make(map[string]*AvailableOption)

	// Check constraints from each parent selection
	for depType, depValue := range req.Selections {
		rules, err := s.repo.GetAllowedValues(ctx, req.AttributeType, depType, depValue)
		if err != nil {
			return nil, fmt.Errorf("failed to get options: %w", err)
		}

		for _, rule := range rules {
			existing, ok := optionMap[rule.AttributeValue]
			if !ok {
				msg := ""
				if rule.ErrorMessage != nil {
					msg = *rule.ErrorMessage
				}
				optionMap[rule.AttributeValue] = &AvailableOption{
					Value:   rule.AttributeValue,
					Allowed: rule.IsAllowed,
					Message: msg,
				}
			} else if !rule.IsAllowed {
				// If any rule disallows it, mark as disallowed
				existing.Allowed = false
				if rule.ErrorMessage != nil {
					existing.Message = *rule.ErrorMessage
				}
			}
		}
	}

	// Convert map to slice
	options := make([]AvailableOption, 0, len(optionMap))
	for _, opt := range optionMap {
		options = append(options, *opt)
	}

	// If no rules found, return static defaults
	if len(options) == 0 {
		return s.getStaticOptions(req.AttributeType), nil
	}

	return options, nil
}

// BuildSKU generates a non-stock SKU from validated selections.
func (s *Service) BuildSKU(ctx context.Context, req BuildSKURequest) (*BuildSKUResponse, error) {
	// First validate
	valResp, err := s.ValidateConfig(ctx, ValidateConfigRequest{Selections: req.Selections})
	if err != nil {
		return nil, err
	}
	if !valResp.Valid {
		return nil, fmt.Errorf("cannot build SKU: configuration has %d conflict(s)", len(valResp.Conflicts))
	}

	// Build SKU parts
	parts := []string{"NS"} // Non-Stock prefix
	typeAbbrev := map[string]string{
		"Lumber": "LBR",
		"Door":   "DR",
		"Trim":   "TRM",
		"Panel":  "PNL",
	}

	if abbr, ok := typeAbbrev[req.ProductType]; ok {
		parts = append(parts, abbr)
	} else {
		// Safe truncation for unknown product types
		pt := strings.ToUpper(req.ProductType)
		if len(pt) > 3 {
			pt = pt[:3]
		}
		parts = append(parts, pt)
	}

	// Add selections in a deterministic order
	order := []string{"Species", "Grade", "Treatment", "Dimensions"}
	for _, key := range order {
		if val, ok := req.Selections[key]; ok && val != "" && val != "None" {
			// Normalize for SKU
			normalized := strings.ToUpper(strings.ReplaceAll(val, " ", "-"))
			parts = append(parts, normalized)
		}
	}

	sku := strings.Join(parts, "-")

	// Build description
	descParts := []string{req.ProductType}
	for _, key := range order {
		if val, ok := req.Selections[key]; ok && val != "" && val != "None" {
			descParts = append(descParts, val)
		}
	}
	description := strings.Join(descParts, " ")

	return &BuildSKUResponse{
		SKU:         sku,
		Description: description,
	}, nil
}

// getStaticOptions returns default options when no constraints apply.
func (s *Service) getStaticOptions(attributeType string) []AvailableOption {
	defaults := map[string][]string{
		"ProductType": {"Lumber", "Door", "Trim", "Panel"},
		"Species":     {"SYP", "Douglas Fir", "Cedar", "Hem-Fir", "SPF"},
		"Grade":       {"#1", "#2", "#3", "Stud", "Select Structural", "Clear", "STK", "Structural", "Appearance"},
		"Treatment":   {"None", "Treatable", "Fire Retardant", "Borate"},
		"Dimensions":  {"2x4", "2x6", "2x8", "2x10", "2x12", "4x4", "1x4", "1x6"},
	}

	values, ok := defaults[attributeType]
	if !ok {
		return []AvailableOption{}
	}

	options := make([]AvailableOption, len(values))
	for i, v := range values {
		options[i] = AvailableOption{Value: v, Allowed: true}
	}
	return options
}
