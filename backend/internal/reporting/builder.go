package reporting

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Allowed fields and mappings to prevent SQL injection.
// Maps entity -> field_name -> SQL column expression
var entitySchemas = map[string]map[string]string{
	"invoices": {
		"id":           "i.id",
		"invoice_number": "i.invoice_number",
		"status":       "i.status",
		"total_amount": "i.total_amount",
		"created_at":   "i.created_at",
		"customer_id":  "i.customer_id",
		"customer_name": "c.name",
	},
	"orders": {
		"id":           "o.id",
		"order_number": "o.order_number",
		"status":       "o.status",
		"total_amount": "o.total_amount",
		"created_at":   "o.created_at",
		"customer_id":  "o.customer_id",
		"customer_name": "c.name",
	},
	"inventory": {
		"id":           "inv.id",
		"product_id":   "inv.product_id",
		"product_name": "p.name",
		"quantity":     "inv.quantity",
		"location_id":  "inv.location_id",
	},
}

var entityBaseQuery = map[string]string{
	"invoices": "FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id",
	"orders":   "FROM orders o LEFT JOIN customers c ON o.customer_id = c.id",
	"inventory": "FROM inventory inv LEFT JOIN products p ON inv.product_id = p.id",
}

// BuildAndExecuteQuery converts a JSON definition to SQL and executes it.
func BuildAndExecuteQuery(ctx context.Context, pool *pgxpool.Pool, def *ReportDefinition, entityType string) ([]map[string]interface{}, error) {
	schema, ok := entitySchemas[entityType]
	if !ok {
		return nil, fmt.Errorf("unknown entity type: %s", entityType)
	}

	baseQuery, ok := entityBaseQuery[entityType]
	if !ok {
		return nil, fmt.Errorf("no base query defined for: %s", entityType)
	}

	// SELECT Clause
	var selectCols []string
	var displayCols []string // Keeps track of output JSON keys
	for _, col := range def.Columns {
		sqlExpr, ok := schema[col.Field]
		if !ok {
			return nil, fmt.Errorf("invalid column: %s", col.Field)
		}
		
		if col.Aggregation != "" {
			switch strings.ToUpper(col.Aggregation) {
			case "SUM", "COUNT", "AVG", "MIN", "MAX":
				// E.g., SUM(i.total_amount) AS total_amount
				selectCols = append(selectCols, fmt.Sprintf("%s(%s) AS %s", strings.ToUpper(col.Aggregation), sqlExpr, col.Field))
			default:
				return nil, fmt.Errorf("invalid aggregation: %s", col.Aggregation)
			}
		} else {
			selectCols = append(selectCols, fmt.Sprintf("%s AS %s", sqlExpr, col.Field))
		}
		displayCols = append(displayCols, col.Field)
	}

	if len(selectCols) == 0 {
		return nil, fmt.Errorf("no columns selected")
	}

	// WHERE Clause
	var whereClauses []string
	var args []interface{}
	argIdx := 1

	for _, filter := range def.Filters {
		sqlExpr, ok := schema[filter.Field]
		if !ok {
			return nil, fmt.Errorf("invalid filter field: %s", filter.Field)
		}

		switch filter.Operator {
		case "=", "!=", ">", "<", ">=", "<=":
			whereClauses = append(whereClauses, fmt.Sprintf("%s %s $%d", sqlExpr, filter.Operator, argIdx))
			args = append(args, filter.Value)
			argIdx++
		case "LIKE":
			whereClauses = append(whereClauses, fmt.Sprintf("%s ILIKE $%d", sqlExpr, argIdx))
			args = append(args, fmt.Sprintf("%%%v%%", filter.Value))
			argIdx++
		default:
			return nil, fmt.Errorf("unsupported operator: %s", filter.Operator)
		}
	}

	// GROUP BY Clause
	var groupByCols []string
	for _, group := range def.Groupings {
		sqlExpr, ok := schema[group.Field]
		if !ok {
			return nil, fmt.Errorf("invalid grouping field: %s", group.Field)
		}
		groupByCols = append(groupByCols, sqlExpr)
	}

	// Construct Query String
	query := fmt.Sprintf("SELECT %s\n%s", strings.Join(selectCols, ", "), baseQuery)
	
	if len(whereClauses) > 0 {
		query += fmt.Sprintf("\nWHERE %s", strings.Join(whereClauses, " AND "))
	}

	if len(groupByCols) > 0 {
		query += fmt.Sprintf("\nGROUP BY %s", strings.Join(groupByCols, ", "))
	}

	// Limit to prevent massive runaway ad-hoc queries
	query += "\nLIMIT 1000"

	// Execution
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute dynamic query: %w", err)
	}
	defer rows.Close()

	var results []map[string]interface{}
	fieldDescriptions := rows.FieldDescriptions()
	
	for rows.Next() {
		rowVals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		
		rowData := make(map[string]interface{})
		for i, fd := range fieldDescriptions {
			rowData[string(fd.Name)] = rowVals[i]
		}
		results = append(results, rowData)
	}

	return results, nil
}
