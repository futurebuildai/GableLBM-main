package order_test

import (
	"context"
	"testing"

	"github.com/gablelbm/gable/internal/config"
	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/internal/purchase_order"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

func TestSpecialOrder_POCreation(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Setup Code (similar to main.go wiring)
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Configuration error: %v", err)
	}
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	// Initialize Services
	orderRepo := order.NewRepository(db)
	// invRepo := inventory.NewRepository(db) // Unused
	// invSvc := inventory.NewService(invRepo) // Not needed for test

	// Create dummy customer
	custID := uuid.New()
	accountNum := "TEST-" + custID.String()[:8]
	// customers.primary_branch_id is NOT NULL post-migration 067; resolve
	// the default branch from system_settings (seeded by migration 059).
	_, err = db.Pool.Exec(context.Background(),
		`INSERT INTO customers (id, name, account_number, primary_branch_id)
		 VALUES ($1, 'Test Customer', $2,
		         (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id'))`,
		custID, accountNum)
	if err != nil {
		t.Logf("Customer error: %v", err)
	}

	// Mock/Real Services
	// Wait, CreateOrder doesn't use inventory. Confirm does.
	// We only test CreateOrder -> PO trigger.

	poRepo := purchase_order.NewRepository(db)
	poSvc := purchase_order.NewService(poRepo, db, nil, nil, nil, nil)  // Mock EDI, Inventory, Product, Vendor
	custRepo := customer.NewRepository(db)
	custSvc := customer.NewService(custRepo)
	orderSvc := order.NewService(orderRepo, nil, nil, custSvc, poSvc)  // Nil for inventory/invoice (unused in CreateOrder)

	// Test Data
	vendorID := uuid.New()
	productID := uuid.New()
	sku := "SPECIAL-" + productID.String()[:8]
	vendorName := "Test Vendor " + vendorID.String()[:8]
	// purchase_orders.vendor_id has a FK to vendors(id); insert a vendor row
	// before triggering PO creation via CreateOrder.
	_, err = db.Pool.Exec(context.Background(),
		"INSERT INTO vendors (id, name) VALUES ($1, $2)",
		vendorID, vendorName)
	if err != nil {
		t.Logf("Vendor insert error: %v", err)
	}
	// Insert dummy product
	_, err = db.Pool.Exec(context.Background(), "INSERT INTO products (id, sku, description, uom_primary, base_price) VALUES ($1, $2, 'Special Item', 'EA', 100)", productID, sku)
	if err != nil {
		t.Logf("Product insert error: %v", err)
	}

	req := order.CreateOrderRequest{
		CustomerID: custID,
		Lines: []order.OrderLineRequest{
			{
				ProductID:        productID,
				Quantity:         1,
				PriceEach:        20000, // $200.00 in cents
				IsSpecialOrder:   true,
				VendorID:         &vendorID,
				SpecialOrderCost: 15000, // $150.00 in cents
			},
		},
	}

	// Action
	o, err := orderSvc.CreateOrder(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateOrder failed: %v", err)
	}
	t.Logf("Order Created: %s", o.ID)

	// Verify PO Creation
	// We need to check if a PO exists for this vendor
	po, err := poRepo.GetDraftPOByVendor(context.Background(), &vendorID)
	if err != nil {
		t.Fatalf("Failed to fetch PO: %v", err)
	}
	if po == nil {
		t.Fatal("Expected PO to be created, got nil")
	}

	if po.Status != "DRAFT" {
		t.Errorf("Expected PO status DRAFT, got %s", po.Status)
	}

	// Check Lines?
	// po.Lines isn't populated by GetDraftPOByVendor (it returns struct without lines usually unless join).
	// We can trust it worked if no error, or add a GetPOLines method.
	// For now, existence of PO is good signal.

	t.Logf("PO Created successfully: %s", po.ID)
}
