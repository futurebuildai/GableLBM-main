package main

import (
"encoding/json"
"fmt"
"os"
)

// DataDictionary defines the BI exposure for gable LBM entities.
type DataDictionary struct {
Entities []EntitySchema `json:"entities"`
}

type EntitySchema struct {
Name        string        `json:"name"`
Description string        `json:"description"`
Fields      []FieldSchema `json:"fields"`
Relations   []Relation    `json:"relations,omitempty"`
}

type FieldSchema struct {
Name        string `json:"name"`
Type        string `json:"type"`
Description string `json:"description"`
}

type Relation struct {
TargetEntity string `json:"target_entity"`
Type         string `json:"type"`   // 1:1, 1:N, N:1
JoinOn       string `json:"join_on"`
}

func main() {
dict := DataDictionary{
Entities: []EntitySchema{
{
Name:        "invoices",
Description: "Customer invoices representing completed sales or shipped materials.",
Fields: []FieldSchema{
{Name: "id", Type: "UUID", Description: "Primary Key"},
{Name: "invoice_number", Type: "String", Description: "Human readable invoice identifier"},
{Name: "status", Type: "String", Description: "UNPAID, PAID, VOID, PARTIAL"},
{Name: "total_amount", Type: "Decimal", Description: "Total invoice value including tax in cents"},
{Name: "created_at", Type: "DateTime", Description: "Timestamp of creation"},
{Name: "customer_id", Type: "UUID", Description: "Foreign Key to customers"},
{Name: "customer_name", Type: "String", Description: "Denormalized customer name"},
},
Relations: []Relation{
{TargetEntity: "customers", Type: "N:1", JoinOn: "customer_id = id"},
},
},
{
Name:        "orders",
Description: "Customer orders representing committed sales not yet invoiced.",
Fields: []FieldSchema{
{Name: "id", Type: "UUID", Description: "Primary Key"},
{Name: "order_number", Type: "String", Description: "Human readable order identifier"},
{Name: "status", Type: "String", Description: "OPEN, STAGED, COMPLETED"},
{Name: "total_amount", Type: "Decimal", Description: "Total order value in cents"},
{Name: "created_at", Type: "DateTime", Description: "Timestamp of creation"},
{Name: "customer_id", Type: "UUID", Description: "Foreign Key to customers"},
{Name: "customer_name", Type: "String", Description: "Denormalized customer name"},
},
Relations: []Relation{
{TargetEntity: "customers", Type: "N:1", JoinOn: "customer_id = id"},
},
},
{
Name:        "inventory",
Description: "Real-time product inventory levels by location.",
Fields: []FieldSchema{
{Name: "id", Type: "UUID", Description: "Primary Key"},
{Name: "product_id", Type: "UUID", Description: "Foreign Key to products"},
{Name: "product_name", Type: "String", Description: "Denormalized product name"},
{Name: "quantity", Type: "Decimal", Description: "Current stock level"},
{Name: "location_id", Type: "UUID", Description: "Foreign Key to locations"},
},
Relations: []Relation{
{TargetEntity: "products", Type: "N:1", JoinOn: "product_id = id"},
},
},
},
}

markdown := "# Gable LBM Business Intelligence - Entity Relationship Document\n\n"
markdown += "This document outlines the schema exposed via the `/api/v1/reporting/export/{entity}` API for connection to BI tools like Power BI or Tableau.\n\n"

for _, entity := range dict.Entities {
markdown += fmt.Sprintf("## %s\n> %s\n\n", entity.Name, entity.Description)

markdown += "### Fields\n"
markdown += "| Name | Type | Description |\n"
markdown += "|---|---|---|\n"
for _, field := range entity.Fields {
markdown += fmt.Sprintf("| `%s` | %s | %s |\n", field.Name, field.Type, field.Description)
}

if len(entity.Relations) > 0 {
markdown += "\n### Relationships\n"
for _, rel := range entity.Relations {
markdown += fmt.Sprintf("- **%s** (%s) on `%s`\n", rel.TargetEntity, rel.Type, rel.JoinOn)
}
}
markdown += "\n---\n\n"
}

// Write Markdown Documentation
err := os.WriteFile("scripts/BI_SCHEMA.md", []byte(markdown), 0644)
if err != nil {
fmt.Printf("Failed to write Markdown: %v\n", err)
} else {
fmt.Println("Wrote BI_SCHEMA.md successfully")
}

// Write JSON Schema for automated tooling
jsonData, err := json.MarshalIndent(dict, "", "  ")
if err == nil {
os.WriteFile("scripts/bi_schema.json", jsonData, 0644)
fmt.Println("Wrote bi_schema.json successfully")
}
}
