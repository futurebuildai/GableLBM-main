package configurator

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

// GetAllRules returns every configurator rule.
func (r *Repository) GetAllRules(ctx context.Context) ([]ConfiguratorRule, error) {
	query := `
		SELECT id, attribute_type, attribute_value, depends_on_type, depends_on_value,
		       is_allowed, error_message, created_at, updated_at
		FROM configurator_rules
		ORDER BY depends_on_type, depends_on_value, attribute_type, attribute_value
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query rules: %w", err)
	}
	defer rows.Close()

	rules := make([]ConfiguratorRule, 0)
	for rows.Next() {
		var rule ConfiguratorRule
		if err := rows.Scan(
			&rule.ID, &rule.AttributeType, &rule.AttributeValue,
			&rule.DependsOnType, &rule.DependsOnValue,
			&rule.IsAllowed, &rule.ErrorMessage,
			&rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan rule: %w", err)
		}
		rules = append(rules, rule)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rules: %w", err)
	}
	return rules, nil
}

// GetRulesByDependency returns all rules that depend on a specific attribute type+value.
func (r *Repository) GetRulesByDependency(ctx context.Context, dependsOnType, dependsOnValue string) ([]ConfiguratorRule, error) {
	query := `
		SELECT id, attribute_type, attribute_value, depends_on_type, depends_on_value,
		       is_allowed, error_message, created_at, updated_at
		FROM configurator_rules
		WHERE depends_on_type = $1 AND depends_on_value = $2
		ORDER BY attribute_type, attribute_value
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, dependsOnType, dependsOnValue)
	if err != nil {
		return nil, fmt.Errorf("failed to query rules by dependency: %w", err)
	}
	defer rows.Close()

	rules := make([]ConfiguratorRule, 0)
	for rows.Next() {
		var rule ConfiguratorRule
		if err := rows.Scan(
			&rule.ID, &rule.AttributeType, &rule.AttributeValue,
			&rule.DependsOnType, &rule.DependsOnValue,
			&rule.IsAllowed, &rule.ErrorMessage,
			&rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan rule: %w", err)
		}
		rules = append(rules, rule)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rules: %w", err)
	}
	return rules, nil
}

// GetAllowedValues returns the allowed values for a given attribute type
// constrained by a parent selection.
func (r *Repository) GetAllowedValues(ctx context.Context, attributeType, dependsOnType, dependsOnValue string) ([]ConfiguratorRule, error) {
	query := `
		SELECT id, attribute_type, attribute_value, depends_on_type, depends_on_value,
		       is_allowed, error_message, created_at, updated_at
		FROM configurator_rules
		WHERE attribute_type = $1
		  AND depends_on_type = $2
		  AND depends_on_value = $3
		ORDER BY attribute_value
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, attributeType, dependsOnType, dependsOnValue)
	if err != nil {
		return nil, fmt.Errorf("failed to query allowed values: %w", err)
	}
	defer rows.Close()

	rules := make([]ConfiguratorRule, 0)
	for rows.Next() {
		var rule ConfiguratorRule
		if err := rows.Scan(
			&rule.ID, &rule.AttributeType, &rule.AttributeValue,
			&rule.DependsOnType, &rule.DependsOnValue,
			&rule.IsAllowed, &rule.ErrorMessage,
			&rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan rule: %w", err)
		}
		rules = append(rules, rule)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating allowed values: %w", err)
	}
	return rules, nil
}

// GetPresets returns all active presets, optionally filtered by product type.
func (r *Repository) GetPresets(ctx context.Context, productType string) ([]ConfiguratorPreset, error) {
	var query string
	var args []interface{}

	if productType != "" {
		query = `
			SELECT id, name, description, product_type, config, is_active, created_at, updated_at
			FROM configurator_presets
			WHERE is_active = true AND product_type = $1
			ORDER BY name
		`
		args = append(args, productType)
	} else {
		query = `
			SELECT id, name, description, product_type, config, is_active, created_at, updated_at
			FROM configurator_presets
			WHERE is_active = true
			ORDER BY name
		`
	}

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query presets: %w", err)
	}
	defer rows.Close()

	presets := make([]ConfiguratorPreset, 0)
	for rows.Next() {
		var p ConfiguratorPreset
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.ProductType,
			&p.Config, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan preset: %w", err)
		}
		presets = append(presets, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating presets: %w", err)
	}
	return presets, nil
}
