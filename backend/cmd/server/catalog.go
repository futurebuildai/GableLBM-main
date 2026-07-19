package main

import "github.com/gablelbm/gable/pkg/apps"

// unconvertedAppCatalog declares manifests for every module that has not yet
// been converted to gated app registration (docs/modularization-blueprint.md
// §5). They appear on the Apps page as core (always-on) entries so the
// catalog reflects the whole platform from day one.
//
// Converting a module = moving its manifest into internal/<module>/manifest.go,
// registering via appRegistry.Add(...), and deleting its row here. Converted
// so far: millwork (owns the configurator module too) and governance.
//
// DependsOn lists app-level dependencies only (compiled-in coupling between
// modules). Platform library packages — config, ai, domain, notification —
// are listed for catalog truthfulness but are never dependency targets.
var unconvertedAppCatalog = []apps.Manifest{
	// Catalog & Inventory
	{Key: "product", Name: "Products", Summary: "Product master, SKUs, and units of measure.", Category: "Catalog & Inventory", Core: true, DependsOn: []string{"vendor"}},
	{Key: "inventory", Name: "Inventory", Summary: "Stock quants, double-entry moves, and cycle counts.", Category: "Catalog & Inventory", Core: true},
	{Key: "pim", Name: "Product Content (PIM)", Summary: "AI-generated product descriptions and images.", Category: "Catalog & Inventory", Core: true, DependsOn: []string{"product"}},
	{Key: "location", Name: "Locations & Branches", Summary: "Warehouse location tree and branch management.", Category: "Catalog & Inventory", Core: true},

	// Sales
	{Key: "quote", Name: "Quotes", Summary: "Quoting and quote-to-order conversion.", Category: "Sales", Core: true, DependsOn: []string{"product"}},
	{Key: "order", Name: "Orders", Summary: "Sales orders, fulfilment, and credit gating.", Category: "Sales", Core: true, DependsOn: []string{"customer", "inventory", "invoice", "purchase_order"}},
	{Key: "pricing", Name: "Pricing", Summary: "Price levels, category pricing, escalators, and rebates.", Category: "Sales", Core: true, DependsOn: []string{"customer", "product"}},

	// Finance
	{Key: "invoice", Name: "Invoicing", Summary: "Invoices, tax resolution, and GL posting.", Category: "Finance", Core: true, DependsOn: []string{"account", "gl"}},
	{Key: "payment", Name: "Payments", Summary: "Payment processing and AR application.", Category: "Finance", Core: true, DependsOn: []string{"account", "invoice"}},
	{Key: "account", Name: "AR Subledger", Summary: "Customer transactions and balance subledger.", Category: "Finance", Core: true},
	{Key: "gl", Name: "General Ledger", Summary: "Chart of accounts, journal entries, trial balance.", Category: "Finance", Core: true},
	{Key: "ap", Name: "Accounts Payable", Summary: "Vendor bills and AP workflows.", Category: "Finance", Core: true, DependsOn: []string{"gl"}},
	{Key: "bankrecon", Name: "Bank Reconciliation", Summary: "Bank statement import and reconciliation.", Category: "Finance", Core: true, DependsOn: []string{"gl"}},
	{Key: "tax", Name: "Tax", Summary: "Tax calculation and exemption certificates.", Category: "Finance", Core: true},
	{Key: "matching", Name: "3-Way Matching", Summary: "PO / receipt / AP-invoice matching.", Category: "Finance", Core: true, DependsOn: []string{"ap", "purchase_order"}},

	// Purchasing
	{Key: "purchase_order", Name: "Purchasing", Summary: "Purchase orders, receiving, EDI, and auto-reorder.", Category: "Purchasing", Core: true, DependsOn: []string{"edi", "inventory", "product", "vendor"}},
	{Key: "vendor", Name: "Vendors", Summary: "Vendor master and terms.", Category: "Purchasing", Core: true},
	{Key: "edi", Name: "EDI", Summary: "X12 EDI documents (850/855/810).", Category: "Purchasing", Core: true},

	// Logistics
	{Key: "delivery", Name: "Logistics", Summary: "Dispatch board, routing, fleet, and proof of delivery.", Category: "Logistics", Core: true},

	// Front of House
	{Key: "pos", Name: "Point of Sale", Summary: "Contractor-desk POS terminal and daily till.", Category: "Front of House", Core: true, DependsOn: []string{"inventory", "invoice", "payment", "product"}},
	{Key: "dashboard", Name: "Dashboard", Summary: "Executive KPIs and operational overview.", Category: "Front of House", Core: true},
	{Key: "reporting", Name: "Reporting", Summary: "Report builder, BI exports, and scheduled reports.", Category: "Front of House", Core: true},
	{Key: "document", Name: "Documents", Summary: "Generated PDFs and document delivery.", Category: "Front of House", Core: true, DependsOn: []string{"customer", "invoice", "order", "product"}},

	// CRM & People
	{Key: "crm", Name: "CRM Activities", Summary: "Customer activity feed and follow-ups.", Category: "CRM & People", Core: true},
	{Key: "salesteam", Name: "Sales Teams", Summary: "Sales rep assignments and team structure.", Category: "CRM & People", Core: true},
	{Key: "customer", Name: "Customers", Summary: "Customer master, credit limits, and branch assignment.", Category: "CRM & People", Core: true},
	{Key: "parsing", Name: "AI Document Parsing", Summary: "Material-list and freight OCR ingestion.", Category: "CRM & People", Core: true, DependsOn: []string{"product"}},

	// External Surfaces
	{Key: "portal", Name: "B2B Portal", Summary: "Dealer customer portal: catalog, cart, orders, AR.", Category: "External Surfaces", Core: true, DependsOn: []string{"customer", "inventory", "order", "pricing", "product"}},
	{Key: "partner", Name: "Partner API", Summary: "Co-op partner dashboard and quote API.", Category: "External Surfaces", Core: true, DependsOn: []string{"customer", "quote"}},
	{Key: "project", Name: "Portal Projects", Summary: "Customer project tracking on the B2B portal.", Category: "External Surfaces", Core: true},
	{Key: "integrations", Name: "Integrations", Summary: "Service-to-service API, X12 connectors, GL adapters.", Category: "External Surfaces", Core: true, DependsOn: []string{"customer", "order", "pricing", "product", "quote"}},
	{Key: "vision", Name: "Vision", Summary: "Image-based intake experiments.", Category: "External Surfaces", Core: true},

	// Platform libraries (not routable apps; listed for catalog truthfulness)
	{Key: "config", Name: "Configuration", Summary: "Environment configuration loader (library).", Category: "Platform", Core: true},
	{Key: "ai", Name: "AI Client", Summary: "OpenRouter client, KeyStore, and model routing (library).", Category: "Platform", Core: true},
	{Key: "domain", Name: "Shared Domain Types", Summary: "Cross-module EDI/GL structs (library).", Category: "Platform", Core: true},
	{Key: "notification", Name: "Notifications", Summary: "Email/SMS senders (library).", Category: "Platform", Core: true},
	{Key: "techadmin", Name: "Tech Admin", Summary: "System settings, AI keys, and integration keys.", Category: "Platform", Core: true},
}
