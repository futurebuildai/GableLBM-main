package main

import (
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

// recentDate returns a timestamp drawn from the last `daysBack` days.
func recentDate(daysBack int) time.Time {
	return time.Now().AddDate(0, 0, -rand.Intn(daysBack))
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable"
		fmt.Println("DATABASE_URL not set, using default: " + dbURL)
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	demoUserID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	log.Println("Seeding started — Gable Lumber & Supply (Kelowna, BC)...")

	// =========================================================================
	// 1. LOCATIONS — Multi-Branch Hierarchy
	//    Three BRANCH rows (KEL-MAIN, WK, LK) sit at the top of `locations`.
	//    Child ZONEs are nested under KEL-MAIN; the trigger from migration
	//    058 denormalizes branch_id automatically.
	// =========================================================================
	type branch struct {
		Code, Name, Addr, City, State, Zip, Phone, TaxJur string
		TaxRate                                           float64
	}
	branches := []branch{
		{"KEL-MAIN", "Kelowna Main Yard", "2450 Enterprise Way", "Kelowna", "BC", "V1X 7K2", "250-555-1000", "BC", 0.12},
		{"WK", "West Kelowna Satellite", "2475 Dobbin Rd", "West Kelowna", "BC", "V4T 2E9", "250-555-1100", "BC", 0.12},
		{"LK", "Lake Country Outpost", "11852 Highway 97", "Lake Country", "BC", "V4V 1E2", "250-555-1200", "BC", 0.12},
	}
	branchIDs := make(map[string]uuid.UUID)
	for _, b := range branches {
		var id string
		err := db.QueryRow(`INSERT INTO locations
			(id, code, type, description, path, name, address, city, state, zip, phone, tax_jurisdiction_code, default_tax_rate, timezone, active)
			VALUES (gen_random_uuid(), $1, 'BRANCH', $2, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'America/Vancouver', TRUE)
			ON CONFLICT ON CONSTRAINT locations_parent_id_code_key DO UPDATE SET
				name=$2, description=$2, address=$3, city=$4, state=$5, zip=$6, phone=$7,
				tax_jurisdiction_code=$8, default_tax_rate=$9, timezone='America/Vancouver', active=TRUE
			RETURNING id`,
			b.Code, b.Name, b.Addr, b.City, b.State, b.Zip, b.Phone, b.TaxJur, b.TaxRate).Scan(&id)
		if err != nil {
			log.Printf("Branch %s: %v", b.Code, err)
			db.QueryRow("SELECT id FROM locations WHERE code=$1 AND type='BRANCH'", b.Code).Scan(&id)
		}
		if id != "" {
			branchIDs[b.Code] = uuid.MustParse(id)
		}
	}
	kelMainID := branchIDs["KEL-MAIN"]
	wkID := branchIDs["WK"]
	lkID := branchIDs["LK"]
	branchIDList := []uuid.UUID{kelMainID, wkID, lkID}
	fmt.Printf("Seed: %d Branches (KEL-MAIN, WK, LK)\n", len(branches))

	// Make KEL-MAIN the default branch in system_settings.
	if kelMainID != uuid.Nil {
		db.Exec(`INSERT INTO system_settings (key, value) VALUES ('default_branch_id', $1)
			ON CONFLICT (key) DO UPDATE SET value=$1`, kelMainID.String())
	}

	// Child ZONEs under KEL-MAIN (trigger 058 inherits branch_id from parent).
	type zone struct {
		Code, Desc string
	}
	zones := []zone{
		{"KEL-A", "Lumber Storage Zone A"},
		{"KEL-B", "Sheet Goods Zone B"},
		{"KEL-C", "Hardware & Fasteners Zone C"},
		{"KEL-D", "Roofing & Insulation Zone D"},
		{"WK-A", "Treated Lumber Storage"},
		{"WK-B", "Millwork & Doors"},
		{"LK-A", "Outpost General Storage"},
	}
	zoneParents := map[string]uuid.UUID{
		"KEL-A": kelMainID, "KEL-B": kelMainID, "KEL-C": kelMainID, "KEL-D": kelMainID,
		"WK-A": wkID, "WK-B": wkID,
		"LK-A": lkID,
	}
	locationIDs := make(map[string]uuid.UUID)
	for code, id := range branchIDs {
		locationIDs[code] = id
	}
	for _, z := range zones {
		parent := zoneParents[z.Code]
		var id string
		err := db.QueryRow(`INSERT INTO locations (id, code, type, description, path, parent_id)
			VALUES (gen_random_uuid(), $1, 'ZONE', $2, $1, $3)
			ON CONFLICT ON CONSTRAINT locations_parent_id_code_key DO UPDATE SET description=$2
			RETURNING id`, z.Code, z.Desc, parent).Scan(&id)
		if err != nil {
			db.QueryRow("SELECT id FROM locations WHERE code=$1", z.Code).Scan(&id)
		}
		if id != "" {
			locationIDs[z.Code] = uuid.MustParse(id)
		}
	}
	fmt.Printf("Seed: %d Zones under branches\n", len(zones))

	// =========================================================================
	// 2. VENDORS (Okanagan / BC suppliers)
	// =========================================================================
	type vendor struct {
		Name, Email, Phone, Addr, City, State, Zip, Terms string
		LeadDays, FillRate, SpendYTD                      float64
	}
	vendors := []vendor{
		{"Gable Lumber & Supply", "orders@gablelumber.ca", "250-555-1100", "2450 Enterprise Way", "Kelowna", "BC", "V1X 7K2", "Net 30", 3, 97.5, 485000},
		{"Okanagan Hardware Distribution", "sales@okhardware.ca", "250-555-1200", "1500 Fastener Way", "Kelowna", "BC", "V1Y 4R9", "Net 30", 5, 94.2, 128000},
		{"BC Roofing Wholesale", "contact@bcroofing.ca", "250-555-1300", "200 Shingle Ln", "Vernon", "BC", "V1T 2L8", "Net 45", 7, 91.0, 95000},
		{"Interior Millwork Co", "info@interiormillwork.ca", "250-555-1400", "75 Cabinet Ct", "Kelowna", "BC", "V1Z 1G2", "Net 30", 14, 88.5, 72000},
		{"Valley Ready-Mix Concrete", "dispatch@valleyreadymix.ca", "250-555-1500", "3200 Aggregate Dr", "Kelowna", "BC", "V1X 4L9", "Net 15", 2, 99.0, 45000},
		{"Mountain Fastener Supply", "orders@mountainfastener.ca", "250-555-1600", "900 Bolt Blvd", "Penticton", "BC", "V2A 6J9", "Net 30", 4, 96.8, 67000},
		{"Cariboo Insulation Ltd", "sales@caribooinsulation.ca", "250-555-1700", "400 Thermal Ave", "Vernon", "BC", "V1B 3T6", "Net 30", 6, 93.0, 52000},
		{"Pacific Window & Door", "orders@pacificwindow.ca", "604-555-1800", "1200 Glass Pkwy", "Surrey", "BC", "V3T 5X8", "2% 10 Net 30", 21, 85.0, 110000},
	}
	vendorIDs := make(map[string]uuid.UUID)
	for _, v := range vendors {
		var id string
		err := db.QueryRow(`INSERT INTO vendors (name, contact_email, phone, address_line1, city, state, zip, payment_terms, average_lead_time_days, fill_rate, total_spend_ytd)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			ON CONFLICT (name) DO UPDATE SET contact_email=$2, phone=$3, address_line1=$4, city=$5, state=$6, zip=$7, payment_terms=$8, average_lead_time_days=$9, fill_rate=$10, total_spend_ytd=$11
			RETURNING id`, v.Name, v.Email, v.Phone, v.Addr, v.City, v.State, v.Zip, v.Terms, v.LeadDays, v.FillRate, v.SpendYTD).Scan(&id)
		if err == nil {
			vendorIDs[v.Name] = uuid.MustParse(id)
		}
	}
	fmt.Printf("Seed: %d Vendors\n", len(vendors))

	// =========================================================================
	// 3. PRODUCTS & INVENTORY
	//    SKUs preserved verbatim so that contracts and other downstream refs
	//    keep working. Descriptions retain BC-appropriate species (SPF and
	//    pressure-treated dominate the BC interior lumber yard).
	// =========================================================================
	type product struct {
		Desc, SKU, UOM, Vendor, Category string
		Cost, Price, Weight              float64
		ReorderPt, ReorderQty            int
	}
	products := []product{
		{"2x4x8 SPF Premium", "LUM-248-PREM", "PCS", "Gable Lumber & Supply", "Lumber", 3.50, 5.50, 9.0, 200, 500},
		{"2x4x10 SPF Premium", "LUM-2410-PREM", "PCS", "Gable Lumber & Supply", "Lumber", 4.50, 7.25, 11.3, 150, 400},
		{"2x4x12 SPF Premium", "LUM-2412-PREM", "PCS", "Gable Lumber & Supply", "Lumber", 5.40, 8.75, 13.5, 100, 300},
		{"2x4x92-5/8 SPF Stud", "LUM-2492-STUD", "PCS", "Gable Lumber & Supply", "Lumber", 3.20, 5.10, 8.5, 300, 600},
		{"2x6x10 SPF Premium", "LUM-2610-PREM", "PCS", "Gable Lumber & Supply", "Lumber", 6.00, 9.80, 16.9, 120, 300},
		{"2x6x12 SPF Premium", "LUM-2612-PREM", "PCS", "Gable Lumber & Supply", "Lumber", 7.20, 11.75, 20.3, 100, 250},
		{"2x6x16 SPF Premium", "LUM-2616-PREM", "PCS", "Gable Lumber & Supply", "Lumber", 9.60, 15.60, 27.0, 80, 200},
		{"2x8x10 Hem-Fir No.2", "LUM-2810-NO2", "PCS", "Gable Lumber & Supply", "Lumber", 8.50, 13.90, 22.5, 80, 200},
		{"2x8x16 Hem-Fir No.2", "LUM-2816-NO2", "PCS", "Gable Lumber & Supply", "Lumber", 13.60, 22.25, 36.0, 50, 150},
		{"2x10x12 Hem-Fir No.2", "LUM-21012-NO2", "PCS", "Gable Lumber & Supply", "Lumber", 15.00, 24.50, 33.8, 60, 150},
		{"2x12x16 Hem-Fir No.2", "LUM-21216-NO2", "PCS", "Gable Lumber & Supply", "Lumber", 28.00, 45.00, 54.0, 30, 80},
		{"4x4x8 Pressure Treated", "LUM-448-PT", "PCS", "Gable Lumber & Supply", "Lumber", 8.00, 12.50, 22.0, 100, 200},
		{"4x4x10 Pressure Treated", "LUM-4410-PT", "PCS", "Gable Lumber & Supply", "Lumber", 10.00, 15.75, 27.5, 80, 150},
		{"6x6x12 Pressure Treated", "LUM-6612-PT", "PCS", "Gable Lumber & Supply", "Lumber", 35.00, 55.00, 72.0, 30, 60},
		{"4x4x8 Western Red Cedar", "LUM-448-WRC", "PCS", "Gable Lumber & Supply", "Lumber", 22.00, 34.00, 22.0, 40, 100},
		{"1x6x6 Cedar Fence Board", "LUM-166-WRC", "PCS", "Gable Lumber & Supply", "Lumber", 3.20, 5.10, 4.0, 200, 600},
		{"3/4 Plywood G1S 4x8 (Fir)", "PLY-34-CDX", "PCS", "Gable Lumber & Supply", "Sheet Goods", 24.00, 38.00, 70.0, 80, 200},
		{"1/2 Plywood G1S 4x8 (Fir)", "PLY-12-CDX", "PCS", "Gable Lumber & Supply", "Sheet Goods", 18.00, 28.50, 48.0, 80, 200},
		{"3/4 OSB T&G 4x8", "OSB-34-TG", "PCS", "Gable Lumber & Supply", "Sheet Goods", 22.00, 34.00, 65.0, 100, 250},
		{"7/16 OSB 4x8", "OSB-12", "PCS", "Gable Lumber & Supply", "Sheet Goods", 12.00, 19.50, 44.0, 120, 300},
		{"1/2 Drywall Regular 4x8", "DW-12-REG", "PCS", "Gable Lumber & Supply", "Sheet Goods", 11.00, 16.00, 57.0, 100, 250},
		{"5/8 Drywall Firecode 4x8", "DW-58-FC", "PCS", "Gable Lumber & Supply", "Sheet Goods", 14.00, 21.00, 70.0, 60, 150},
		{"3-1/4\" Common Nails (25kg)", "NAIL-16D-50", "BOX", "Mountain Fastener Supply", "Hardware", 45.00, 65.00, 50.0, 20, 50},
		{"3\" Common Nails (25kg)", "NAIL-10D-50", "BOX", "Mountain Fastener Supply", "Hardware", 45.00, 65.00, 50.0, 20, 50},
		{"3\" Deck Screws (2.5kg)", "SCR-DECK-3-5", "BOX", "Mountain Fastener Supply", "Hardware", 18.00, 29.99, 5.0, 40, 100},
		{"Joist Hanger 2x6", "HANGER-26", "PCS", "Okanagan Hardware Distribution", "Hardware", 0.80, 1.45, 0.5, 200, 500},
		{"Joist Hanger 2x8", "HANGER-28", "PCS", "Okanagan Hardware Distribution", "Hardware", 0.95, 1.65, 0.6, 150, 400},
		{"Joist Hanger 2x10", "HANGER-210", "PCS", "Okanagan Hardware Distribution", "Hardware", 1.10, 1.85, 0.7, 100, 300},
		{"Hurricane Tie H1", "TIE-H1", "PCS", "Okanagan Hardware Distribution", "Hardware", 0.65, 1.15, 0.3, 200, 500},
		{"Simpson Strong-Tie LUS28", "SIMP-LUS28", "PCS", "Okanagan Hardware Distribution", "Hardware", 0.90, 1.50, 0.4, 150, 400},
		{"Architectural Shingles 30yr", "RF-ARCH-30", "BUNDLE", "BC Roofing Wholesale", "Roofing", 28.00, 42.00, 70.0, 50, 100},
		{"Architectural Shingles (Black)", "RF-SH-BLK", "BUNDLE", "BC Roofing Wholesale", "Roofing", 28.00, 42.00, 70.0, 50, 100},
		{"Architectural Shingles (Weathered Wood)", "RF-SH-WW", "BUNDLE", "BC Roofing Wholesale", "Roofing", 28.00, 42.00, 70.0, 50, 100},
		{"Roofing Felt #15", "RF-FELT-15", "RL", "BC Roofing Wholesale", "Roofing", 15.00, 22.50, 15.0, 30, 80},
		{"Ice & Water Shield 65'", "RF-ICE-65", "RL", "BC Roofing Wholesale", "Roofing", 65.00, 98.00, 36.0, 20, 50},
		{"Roof Edge Drip 10'", "RF-DRIP-10", "PCS", "BC Roofing Wholesale", "Roofing", 4.50, 7.50, 2.0, 60, 150},
		{"Ridge Vent 4'", "RF-RIDGE-4", "PCS", "BC Roofing Wholesale", "Roofing", 8.00, 13.50, 3.0, 40, 80},
		{"Starter Strip", "RF-START", "PCS", "BC Roofing Wholesale", "Roofing", 6.00, 10.00, 2.5, 40, 80},
		{"1.25\" Roofing Nails 2.5kg", "RF-NAIL-125", "BOX", "BC Roofing Wholesale", "Roofing", 12.00, 19.00, 5.0, 30, 60},
		{"Step Flashing", "RF-FLASH-STEP", "PCS", "BC Roofing Wholesale", "Roofing", 2.50, 4.50, 0.5, 60, 120},
		{"Pipe Boot Flashing", "RF-FLASH-PIPE", "PCS", "BC Roofing Wholesale", "Roofing", 8.00, 14.00, 1.5, 20, 40},
		{"Ice & Water Shield", "RF-ICE-WTR", "RL", "BC Roofing Wholesale", "Roofing", 65.00, 98.00, 36.0, 20, 50},
		{"Roof Edge Drip 10'", "RF-EDGE-WHT", "PCS", "BC Roofing Wholesale", "Roofing", 4.50, 7.50, 2.0, 60, 150},
		{"R-14 Fiberglass Batts 15x93", "INS-R13-15", "BAG", "Cariboo Insulation Ltd", "Insulation", 45.00, 68.00, 32.0, 30, 60},
		{"R-20 Fiberglass Batts 15x93", "INS-R19-15", "BAG", "Cariboo Insulation Ltd", "Insulation", 55.00, 82.00, 42.0, 25, 50},
		{"R-28 Fiberglass Batts 24x48", "INS-R30-24", "BAG", "Cariboo Insulation Ltd", "Insulation", 65.00, 98.00, 48.0, 20, 40},
		{"Int Door 30x80 6-Panel Hollow", "DR-INT-3080-6P", "PCS", "Interior Millwork Co", "Millwork", 65.00, 95.00, 38.0, 15, 30},
		{"Int Door 32x80 6-Panel Hollow", "DR-INT-3280-6P", "PCS", "Interior Millwork Co", "Millwork", 65.00, 95.00, 40.0, 15, 30},
		{"Int Door 36x80 6-Panel Hollow", "DR-INT-3680-6P", "PCS", "Interior Millwork Co", "Millwork", 68.00, 99.00, 42.0, 15, 30},
		{"Ext Door 36x80 Steel 6-Panel", "DR-EXT-3680-STL", "PCS", "Interior Millwork Co", "Millwork", 180.00, 280.00, 85.0, 8, 20},
		{"Baseboard 3-1/4 MDF 16'", "MLD-BASE-MDF", "PCS", "Interior Millwork Co", "Millwork", 12.00, 19.50, 8.0, 50, 100},
		{"Casing 2-1/4 MDF 14'", "MLD-CASE-MDF", "PCS", "Interior Millwork Co", "Millwork", 8.00, 13.50, 5.0, 50, 100},

		// Cornice / Exterior Trim Materials
		{"Flashing J 6 X 6 X 10", "CORN2006", "EA", "Gable Lumber & Supply", "Cornice", 15.50, 23.25, 3.0, 20, 50},
		{"Flashing Z Bar 3/4 X 10'", "CORN2009", "EA", "Gable Lumber & Supply", "Cornice", 3.50, 5.25, 1.5, 30, 60},
		{"Silicone Clear Caulk", "CORNCLEAR", "EA", "Okanagan Hardware Distribution", "Cornice", 5.75, 8.65, 0.8, 40, 80},
		{"Cemtrim Textured 7/16 X 4 X 12", "CORNCTRM412+", "EA", "Gable Lumber & Supply", "Cornice", 7.54, 11.31, 12.0, 50, 120},
		{"Cemtrim Textured 7/16 X 6 X 12", "CORNCTRMG12+", "EA", "Gable Lumber & Supply", "Cornice", 11.94, 17.91, 18.0, 30, 80},
		{"Vinyl H Mold 1/4 X 12'", "CORNHMOLD14", "EA", "Gable Lumber & Supply", "Cornice", 4.00, 6.00, 1.0, 30, 60},
		{"Poly Black 18 X 300", "CORNPOLY18", "RL", "Okanagan Hardware Distribution", "Cornice", 23.12, 34.68, 25.0, 10, 25},
		{"Solid Soffit Hardie Textured 1/4 X 12 X 12", "CORNSFT1212", "EA", "Gable Lumber & Supply", "Cornice", 15.25, 22.88, 20.0, 30, 60},
		{"Solid Soffit Hardie Textured 1/4 X 16 X 12", "CORNSFT1612", "EA", "Gable Lumber & Supply", "Cornice", 20.45, 30.68, 28.0, 20, 50},
		{"Vented Soffit Hardie Textured 1/4 X 16 X 12", "CORNSFT1612V", "EA", "Gable Lumber & Supply", "Cornice", 26.15, 39.23, 30.0, 25, 60},
		{"Vented Soffit Hardie Textured 1/4 X 24 X 8", "CORNSFT2408V", "EA", "Gable Lumber & Supply", "Cornice", 17.50, 26.25, 22.0, 20, 50},
		{"Sheathing 1/8 X 4 X 9 (Green) NSP DRYLine TSX", "CORNSHTGR49", "EA", "Gable Lumber & Supply", "Cornice", 9.36, 14.04, 24.0, 40, 100},
		{"Window Tape 6\" (100')", "CORNTAPE", "RL", "Okanagan Hardware Distribution", "Cornice", 22.00, 33.00, 3.0, 15, 30},

		// Random-length / economy grade
		{"1 X 4 RL #3 SPF", "LUMB14RLN3+", "LF", "Gable Lumber & Supply", "Lumber", 0.34, 0.52, 0.3, 500, 2000},
		{"2 X 4 RL #3 SPF", "LUMB24RLN3", "LF", "Gable Lumber & Supply", "Lumber", 0.30, 0.46, 0.5, 1000, 5000},
		{"2 X 4 RL Utility", "LUMBUT24RL", "LF", "Gable Lumber & Supply", "Lumber", 0.29, 0.44, 0.5, 500, 2000},
	}

	skuToID := make(map[string]uuid.UUID)
	productPrices := make(map[string]float64)
	for _, p := range products {
		var id string
		err := db.QueryRow(`INSERT INTO products (sku, description, uom_primary, weight_lbs, reorder_point, reorder_qty, base_price, category, vendor, average_unit_cost)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (sku) DO UPDATE SET description=$2, weight_lbs=$4, reorder_point=$5, reorder_qty=$6, base_price=$7, category=$8, vendor=$9, average_unit_cost=$10
			RETURNING id`, p.SKU, p.Desc, p.UOM, p.Weight, p.ReorderPt, p.ReorderQty, p.Price, p.Category, p.Vendor, p.Cost).Scan(&id)
		if err != nil {
			log.Printf("Product %s: %v", p.Desc, err)
			continue
		}
		pid := uuid.MustParse(id)
		skuToID[p.SKU] = pid
		productPrices[p.SKU] = p.Price
		// Stock split: ~70% sits at Kelowna Main, ~20% West Kelowna, ~10% Lake Country.
		for _, bID := range branchIDList {
			db.Exec(`DELETE FROM inventory WHERE product_id=$1 AND location_id=$2`, pid, bID)
		}
		mainQty := 80 + rand.Intn(700)
		wkQty := 20 + rand.Intn(200)
		lkQty := 10 + rand.Intn(80)
		db.Exec(`INSERT INTO inventory (product_id, location_id, location, quantity) VALUES ($1, $2, 'KEL-MAIN', $3)`, pid, kelMainID, mainQty)
		db.Exec(`INSERT INTO inventory (product_id, location_id, location, quantity) VALUES ($1, $2, 'WK', $3)`, pid, wkID, wkQty)
		db.Exec(`INSERT INTO inventory (product_id, location_id, location, quantity) VALUES ($1, $2, 'LK', $3)`, pid, lkID, lkQty)
	}
	fmt.Printf("Seed: %d Products (stocked across 3 branches)\n", len(products))

	// =========================================================================
	// 4. PRICE LEVELS
	// =========================================================================
	type priceLevel struct {
		Name string
		Mult float64
	}
	priceLevels := []priceLevel{
		{"Retail", 1.0},
		{"Contractor", 0.85},
		{"VIP Builder", 0.75},
	}
	priceLevelIDs := make(map[string]uuid.UUID)
	for _, pl := range priceLevels {
		var id string
		db.QueryRow(`INSERT INTO price_levels (name, multiplier) VALUES ($1, $2)
			ON CONFLICT DO NOTHING RETURNING id`, pl.Name, pl.Mult).Scan(&id)
		if id == "" {
			db.QueryRow("SELECT id FROM price_levels WHERE name=$1", pl.Name).Scan(&id)
		}
		if id != "" {
			priceLevelIDs[pl.Name] = uuid.MustParse(id)
		}
	}
	fmt.Println("Seed: Price Levels")

	// =========================================================================
	// 5. CUSTOMERS — 13 Okanagan accounts headlined by Kelbrook Construction.
	// =========================================================================
	type cust struct {
		Name, Acct, Email, Phone, Addr, Tier, Terms, PriceLevel string
		CreditLimit                                             float64
		PrimaryBranch                                           uuid.UUID
		Projects                                                []string
	}
	customers := []cust{
		{"Kelbrook Construction", "KELBROOK-001", "billing@kelbrook.ca", "250-555-2100", "1885 Spall Rd, Kelowna BC V1Y 4R2", "GOLD", "NET30", "Contractor", 50000, kelMainID, []string{"Mission Hill Custom Home", "Glenmore Lofts", "Knox Park Pavilion"}},
		{"Okanagan Homes Ltd", "OKH-001", "ap@okanaganhomes.ca", "250-555-2400", "9000 Summit Pkwy, Kelowna BC V1Y 9R3", "PLATINUM", "NET45", "VIP Builder", 150000, kelMainID, []string{"Sage Creek Hotel Reno", "Lakeshore Apts Bld A", "Lakeshore Apts Bld B"}},
		{"Lake Country Builders", "LCB-001", "admin@lakecountrybuilders.ca", "250-555-2200", "2100 Bottom Wood Lake Rd, Lake Country BC V4V 2K9", "GOLD", "NET30", "Contractor", 80000, lkID, []string{"Wood Lake Cottage", "Carrs Landing Build"}},
		{"Predator Ridge Renos", "PRR-001", "office@predatorrenos.ca", "250-555-2300", "1525 Country Club Dr, Vernon BC V1H 1L3", "SILVER", "NET30", "Contractor", 25000, wkID, []string{"McKenzie Deck", "Kitchen Remodel - Spall", "Garage Addition - Rutland"}},
		{"Big White Cabin Co", "BWC-001", "jim@bigwhitecabins.ca", "250-555-2800", "5315 Whitefoot Way, Big White BC V1P 1P3", "SILVER", "NET30", "Contractor", 15000, kelMainID, []string{"Black Forest Lodge Trim", "Whitefoot Library Shelves"}},
		{"Mission Hill Custom", "MHC-001", "invoices@missionhillcustom.ca", "250-555-2500", "3200 Mission Hill Rd, West Kelowna BC V4T 2E4", "PLATINUM", "NET30", "VIP Builder", 75000, wkID, []string{"Predator Ridge Estate Lot 44", "Predator Ridge Estate Lot 45", "Predator Ridge Estate Lot 46"}},
		{"Westbank Decks & Fence", "WDF-001", "info@westbankdecks.ca", "250-555-2600", "150 Boucherie Rd, West Kelowna BC V4T 1Z6", "SILVER", "NET30", "Contractor", 20000, wkID, []string{"Boucherie Deck", "Smith Patio", "WK Clubhouse Veranda"}},
		{"Vernon Valley Construction", "VVC-001", "dispatch@vernonvalley.ca", "250-555-3200", "1800 Polson Dr, Vernon BC V1T 8P5", "GOLD", "NET30", "Contractor", 35000, lkID, []string{"Vernon Lot 8 Foundation", "Polson Drive Pour"}},
		{"Glenmore Heritage Reno", "GHR-001", "pay@glenmoreheritage.ca", "250-555-2700", "780 Bernard Ave, Kelowna BC V1Y 6P5", "GOLD", "NET30", "Contractor", 30000, kelMainID, []string{"123 Bernard Ave Restore", "456 Pandosy St Reno"}},
		{"Knox Mountain Landscapes", "KML-001", "office@knoxmountainlandscapes.ca", "250-555-2900", "300 Knox Mountain Dr, Kelowna BC V1Y 4P8", "RETAIL", "NET30", "Retail", 10000, kelMainID, []string{"Knox Mountain Community Garden", "Waterfront Walk Beds"}},
		{"Peachland Framing Crew", "PFC-001", "bills@peachlandframing.ca", "250-555-3000", "5500 Beach Ave, Peachland BC V0H 1X4", "GOLD", "NET30", "Contractor", 80000, wkID, []string{"Beach Ave Warehouse Framing", "Highway 97 Strip Mall"}},
		{"Summerland Roofers", "SRR-001", "admin@summerlandroofers.ca", "250-555-3100", "200 Prairie Valley Rd, Summerland BC V0H 1Z0", "SILVER", "NET30", "Contractor", 40000, kelMainID, []string{"Summerland School Roof", "St. Stephen Anglican Reshingle"}},
		{"Okanagan DIY Owner", "DIY-OKN", "diyfan@telus.net", "250-555-2310", "45 Maple Ln, Lake Country BC V4V 1Y2", "RETAIL", "COD", "Retail", 5000, lkID, []string{"Backyard Shed"}},
	}

	customerIDs := make(map[string]uuid.UUID)
	custToProjects := make(map[uuid.UUID][]uuid.UUID)
	custToBranch := make(map[uuid.UUID]uuid.UUID)
	allProjectIDs := make([]uuid.UUID, 0)

	for _, c := range customers {
		plID := priceLevelIDs[c.PriceLevel]
		var cid string
		err := db.QueryRow(`INSERT INTO customers (name, account_number, email, phone, address, credit_limit, balance_due, tier, payment_terms, price_level_id, primary_branch_id)
			VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10)
			ON CONFLICT (account_number) DO UPDATE SET name=$1, phone=$4, address=$5, tier=$7, payment_terms=$8, price_level_id=$9, primary_branch_id=$10
			RETURNING id`, c.Name, c.Acct, c.Email, c.Phone, c.Addr, c.CreditLimit, c.Tier, c.Terms, plID, c.PrimaryBranch).Scan(&cid)
		if err != nil {
			log.Printf("Customer %s: %v", c.Name, err)
			continue
		}
		custID := uuid.MustParse(cid)
		customerIDs[c.Name] = custID
		custToBranch[custID] = c.PrimaryBranch
		custToProjects[custID] = []uuid.UUID{}
		for _, pn := range c.Projects {
			var jid string
			err := db.QueryRow(`INSERT INTO customer_jobs (customer_id, name, is_active) VALUES ($1,$2,true)
				ON CONFLICT DO NOTHING RETURNING id`, custID, pn).Scan(&jid)
			if err != nil {
				db.QueryRow("SELECT id FROM customer_jobs WHERE customer_id=$1 AND name=$2", custID, pn).Scan(&jid)
			}
			if jid != "" {
				pid := uuid.MustParse(jid)
				allProjectIDs = append(allProjectIDs, pid)
				custToProjects[custID] = append(custToProjects[custID], pid)
			}
		}
	}
	fmt.Printf("Seed: %d Customers\n", len(customers))

	// Park Glenmore Heritage Reno over its credit limit so the credit-hold UI
	// has something realistic to render in demos.
	if ghr, ok := customerIDs["Glenmore Heritage Reno"]; ok {
		db.Exec(`UPDATE customers SET balance_due = credit_limit + 4500 WHERE id = $1`, ghr)
	}

	// =========================================================================
	// 6. CUSTOMER CONTRACTS (Special SKU pricing for top customers)
	// =========================================================================
	type contract struct {
		Customer string
		SKU      string
		Price    float64
	}
	contracts := []contract{
		{"Okanagan Homes Ltd", "LUM-248-PREM", 4.25},
		{"Okanagan Homes Ltd", "LUM-2610-PREM", 7.80},
		{"Okanagan Homes Ltd", "PLY-34-CDX", 30.00},
		{"Okanagan Homes Ltd", "OSB-34-TG", 27.50},
		{"Okanagan Homes Ltd", "DW-12-REG", 12.80},
		{"Mission Hill Custom", "LUM-248-PREM", 4.50},
		{"Mission Hill Custom", "LUM-2612-PREM", 9.50},
		{"Mission Hill Custom", "DR-INT-3680-6P", 78.00},
		{"Mission Hill Custom", "DR-EXT-3680-STL", 220.00},
		{"Mission Hill Custom", "MLD-BASE-MDF", 15.00},
		{"Kelbrook Construction", "LUM-248-PREM", 4.75},
		{"Kelbrook Construction", "NAIL-16D-50", 55.00},
		{"Kelbrook Construction", "HANGER-26", 1.10},
		{"Peachland Framing Crew", "LUM-248-PREM", 4.50},
		{"Peachland Framing Crew", "PLY-34-CDX", 31.00},
	}
	for _, ct := range contracts {
		cid, ok1 := customerIDs[ct.Customer]
		pid, ok2 := skuToID[ct.SKU]
		if ok1 && ok2 {
			db.Exec(`INSERT INTO customer_contracts (customer_id, product_id, contract_price)
				VALUES ($1,$2,$3) ON CONFLICT (customer_id, product_id) DO UPDATE SET contract_price=$3`, cid, pid, ct.Price)
		}
	}
	fmt.Printf("Seed: %d Customer Contracts\n", len(contracts))

	// =========================================================================
	// 6b. SALES TEAM & CUSTOMER ASSIGNMENT
	// =========================================================================
	type salesRep struct {
		ID    string
		Name  string
		Email string
		Phone string
		Role  string
	}
	salesReps := []salesRep{
		{"a1b2c3d4-0001-4000-8000-000000000001", "Sarah Mitchell", "sarah.m@gable.com", "250-555-5001", "Sales Manager"},
		{"a1b2c3d4-0002-4000-8000-000000000002", "Jake Rodriguez", "jake.r@gable.com", "250-555-5002", "Sales Rep"},
		{"a1b2c3d4-0003-4000-8000-000000000003", "Emily Chen", "emily.c@gable.com", "250-555-5003", "Account Executive"},
		{"a1b2c3d4-0004-4000-8000-000000000004", "Marcus Williams", "marcus.w@gable.com", "250-555-5004", "Sales Rep"},
		{"a1b2c3d4-0005-4000-8000-000000000005", "Tyler Brooks", "tyler.b@gable.com", "250-555-5005", "Sales Rep"},
		{"a1b2c3d4-0006-4000-8000-000000000006", "Rachel Dunn", "rachel.d@gable.com", "250-555-5006", "Account Executive"},
	}
	for _, sr := range salesReps {
		db.Exec(`INSERT INTO sales_team (id, name, email, phone, role)
			VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, sr.ID, sr.Name, sr.Email, sr.Phone, sr.Role)
	}
	fmt.Printf("Seed: %d Sales Team Members\n", len(salesReps))

	// Salesperson-to-customer assignments.
	custSalesperson := make(map[uuid.UUID]string)
	spAssignments := map[string]string{
		"Okanagan Homes Ltd":         "a1b2c3d4-0001-4000-8000-000000000001", // Sarah Mitchell - top account
		"Mission Hill Custom":        "a1b2c3d4-0001-4000-8000-000000000001", // Sarah Mitchell - top account
		"Kelbrook Construction":      "a1b2c3d4-0003-4000-8000-000000000003", // Emily Chen
		"Peachland Framing Crew":     "a1b2c3d4-0003-4000-8000-000000000003", // Emily Chen
		"Glenmore Heritage Reno":     "a1b2c3d4-0006-4000-8000-000000000006", // Rachel Dunn
		"Vernon Valley Construction": "a1b2c3d4-0006-4000-8000-000000000006", // Rachel Dunn
		"Predator Ridge Renos":       "a1b2c3d4-0002-4000-8000-000000000002", // Jake Rodriguez
		"Lake Country Builders":      "a1b2c3d4-0002-4000-8000-000000000002", // Jake Rodriguez
		"Summerland Roofers":         "a1b2c3d4-0004-4000-8000-000000000004", // Marcus Williams
		"Westbank Decks & Fence":     "a1b2c3d4-0004-4000-8000-000000000004", // Marcus Williams
		"Big White Cabin Co":         "a1b2c3d4-0004-4000-8000-000000000004", // Marcus Williams
		"Knox Mountain Landscapes":   "a1b2c3d4-0005-4000-8000-000000000005", // Tyler Brooks
		"Okanagan DIY Owner":         "a1b2c3d4-0005-4000-8000-000000000005", // Tyler Brooks
	}
	for custName, custID := range customerIDs {
		if spID, ok := spAssignments[custName]; ok {
			db.Exec(`UPDATE customers SET salesperson_id = $1 WHERE id = $2`, spID, custID)
			custSalesperson[custID] = spID
		} else {
			spID := salesReps[4].ID
			db.Exec(`UPDATE customers SET salesperson_id = $1 WHERE id = $2`, spID, custID)
			custSalesperson[custID] = spID
		}
	}
	fmt.Println("Seed: Assigned salespeople to customers")

	// =========================================================================
	// 7. ORDERS, INVOICES, PAYMENTS — branch-scoped to the customer's home yard.
	// =========================================================================
	totalOrders := 0
	invoiceIDs := make([]uuid.UUID, 0)
	orderIDs := make([]uuid.UUID, 0)
	orderCustMap := make(map[uuid.UUID]uuid.UUID)

	for custName, custID := range customerIDs {
		numOrders := 3 + rand.Intn(6)
		branchID := custToBranch[custID]
		if branchID == uuid.Nil {
			branchID = kelMainID
		}
		for i := 0; i < numOrders; i++ {
			status := "FULFILLED"
			r := rand.Float32()
			if r < 0.15 {
				status = "DRAFT"
			} else if r < 0.25 {
				status = "CONFIRMED"
			} else if r < 0.30 {
				status = "CANCELLED"
			}
			orderDate := recentDate(180)
			orderID := uuid.New()
			spID := custSalesperson[custID]
			_, err := db.Exec(`INSERT INTO orders (id, customer_id, branch_id, total_amount, status, salesperson_id, created_at)
				VALUES ($1,$2,$3,0,$4,$5,$6)`, orderID, custID, branchID, status, spID, orderDate)
			if err != nil {
				continue
			}

			numLines := 3 + rand.Intn(13)
			var orderTotal float64
			for j := 0; j < numLines; j++ {
				prod := products[rand.Intn(len(products))]
				qty := 1 + rand.Intn(50)
				lineTotal := float64(qty) * prod.Price
				orderTotal += lineTotal
				db.Exec(`INSERT INTO order_lines (order_id, product_id, quantity, price_each)
					VALUES ($1,$2,$3,$4)`, orderID, skuToID[prod.SKU], qty, prod.Price)
			}
			db.Exec("UPDATE orders SET total_amount=$1 WHERE id=$2", orderTotal, orderID)
			totalOrders++

			if status == "FULFILLED" {
				orderIDs = append(orderIDs, orderID)
				orderCustMap[orderID] = custID
				invID := uuid.New()
				invStatus := "UNPAID"
				if rand.Float32() < 0.65 {
					invStatus = "PAID"
				} else if rand.Float32() < 0.3 {
					invStatus = "OVERDUE"
				}
				dueDate := orderDate.AddDate(0, 1, 0)
				taxRate := 0.12 // BC: GST 5% + PST 7% on building materials.
				subtotal := orderTotal
				taxAmt := subtotal * taxRate
				total := subtotal + taxAmt

				_, err = db.Exec(`INSERT INTO invoices (id, order_id, customer_id, branch_id, status, total_amount, subtotal, tax_rate, tax_amount, due_date, payment_terms, created_at)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'NET30',$11)`,
					invID, orderID, custID, branchID, invStatus, total, subtotal, taxRate, taxAmt, dueDate, orderDate.AddDate(0, 0, 1))
				if err == nil {
					invoiceIDs = append(invoiceIDs, invID)
					if invStatus == "PAID" {
						db.Exec(`INSERT INTO payments (invoice_id, amount, method, reference, notes)
							VALUES ($1,$2,'CHECK','CHK-'||floor(random()*10000+1000)::text,'Payment in full')`, invID, total)
					}
				}
			}
		}
		_ = custName
	}
	fmt.Printf("Seed: %d Orders, %d Invoices\n", totalOrders, len(invoiceIDs))

	// =========================================================================
	// 8. QUOTES WITH LINES (branch-scoped)
	// =========================================================================
	type quoteSpec struct {
		Customer string
		State    string
		Lines    int
	}
	quoteSpecs := []quoteSpec{
		{"Okanagan Homes Ltd", "ACCEPTED", 12}, {"Okanagan Homes Ltd", "SENT", 8}, {"Okanagan Homes Ltd", "DRAFT", 6},
		{"Mission Hill Custom", "ACCEPTED", 15}, {"Mission Hill Custom", "SENT", 10}, {"Mission Hill Custom", "EXPIRED", 7},
		{"Kelbrook Construction", "ACCEPTED", 8}, {"Kelbrook Construction", "SENT", 5}, {"Kelbrook Construction", "DRAFT", 4},
		{"Predator Ridge Renos", "ACCEPTED", 6}, {"Predator Ridge Renos", "SENT", 4},
		{"Peachland Framing Crew", "ACCEPTED", 10}, {"Peachland Framing Crew", "SENT", 7},
		{"Glenmore Heritage Reno", "ACCEPTED", 5}, {"Glenmore Heritage Reno", "DRAFT", 3},
		{"Westbank Decks & Fence", "SENT", 6}, {"Summerland Roofers", "ACCEPTED", 8},
		{"Big White Cabin Co", "DRAFT", 4}, {"Knox Mountain Landscapes", "SENT", 3},
		{"Vernon Valley Construction", "ACCEPTED", 5},
	}
	for _, qs := range quoteSpecs {
		cid, ok := customerIDs[qs.Customer]
		if !ok {
			continue
		}
		branchID := custToBranch[cid]
		if branchID == uuid.Nil {
			branchID = kelMainID
		}
		projects := custToProjects[cid]
		var jobID *uuid.UUID
		if len(projects) > 0 {
			j := projects[rand.Intn(len(projects))]
			jobID = &j
		}
		qDate := recentDate(90)
		expires := qDate.AddDate(0, 0, 30)
		var qid string
		err := db.QueryRow(`INSERT INTO quotes (customer_id, branch_id, job_id, state, total_amount, created_by, expires_at, created_at)
			VALUES ($1,$2,$3,$4,0,$5,$6,$7) RETURNING id`, cid, branchID, jobID, qs.State, demoUserID, expires, qDate).Scan(&qid)
		if err != nil {
			continue
		}
		quoteID := uuid.MustParse(qid)
		var total float64
		for k := 0; k < qs.Lines; k++ {
			prod := products[rand.Intn(len(products))]
			qty := 5 + rand.Intn(100)
			price := prod.Price
			lineTotal := float64(qty) * price
			total += lineTotal
			db.Exec(`INSERT INTO quote_lines (quote_id, product_id, sku, description, quantity, uom, unit_price, line_total)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, quoteID, skuToID[prod.SKU], prod.SKU, prod.Desc, qty, prod.UOM, price, lineTotal)
		}
		db.Exec("UPDATE quotes SET total_amount=$1 WHERE id=$2", total, quoteID)
	}
	fmt.Printf("Seed: %d Quotes\n", len(quoteSpecs))

	// =========================================================================
	// 9. VEHICLES & DRIVERS (BC plates / CDL)
	// =========================================================================
	type vehicle struct {
		Name, VType, Plate, VIN string
		Cap, Year, Odometer     int
		Make, Model             string
		InsExpiry, NextService  string
	}
	vehs := []vehicle{
		{"Truck 1 - Flatbed", "FLATBED", "BC-FLT-101", "1HTMMAAL8CH123456", 24000, 2022, 45230, "International", "CV515", "2026-06-15", "2026-04-01"},
		{"Truck 2 - Flatbed", "FLATBED", "BC-FLT-102", "1HTMMAAL0CH234567", 24000, 2021, 62100, "International", "CV515", "2026-08-20", "2026-03-15"},
		{"Truck 3 - Box", "BOX_TRUCK", "BC-BOX-201", "3ALACWFC4HDGH5678", 16000, 2023, 28400, "Freightliner", "M2 106", "2026-07-01", "2026-05-10"},
		{"Truck 4 - Boom", "CRANE", "BC-BOM-301", "1M2AX04C0CM345678", 18000, 2020, 71800, "Mack", "Granite", "2026-09-30", "2026-02-28"},
		{"Truck 5 - Pickup", "PICKUP", "BC-PKP-401", "1FTFW1E55MFA56789", 3000, 2023, 15200, "Ford", "F-150", "2026-05-15", "2026-06-20"},
		{"Truck 6 - Box (Liftgate)", "BOX_TRUCK", "BC-BOX-202", "3ALACWFC6HDGJ9012", 14000, 2024, 8750, "Isuzu", "NPR-HD", "2027-01-15", "2026-07-01"},
		{"Truck 7 - Van", "VAN", "BC-VAN-501", "1GCWGAFG5K1234567", 5000, 2022, 34600, "Chevrolet", "Express 3500", "2026-04-10", "2026-03-20"},
		{"Truck 8 - Flatbed (Long)", "FLATBED", "BC-FLT-103", "1HTMMAAL2CH345678", 30000, 2020, 89200, "Peterbilt", "348", "2026-03-01", "2026-04-15"},
	}
	vehicleIDs := make([]uuid.UUID, 0)
	for _, v := range vehs {
		var id string
		db.QueryRow(`INSERT INTO vehicles (name, vehicle_type, license_plate, capacity_weight_lbs,
				vin, year, make, model, insurance_expiry, next_service_date, odometer_miles)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11)
			ON CONFLICT (license_plate) WHERE deleted_at IS NULL
			DO UPDATE SET name=$1, vehicle_type=$2, capacity_weight_lbs=$4,
				vin=$5, year=$6, make=$7, model=$8, insurance_expiry=$9::date,
				next_service_date=$10::date, odometer_miles=$11
			RETURNING id`,
			v.Name, v.VType, v.Plate, v.Cap,
			v.VIN, v.Year, v.Make, v.Model, v.InsExpiry, v.NextService, v.Odometer).Scan(&id)
		if id == "" {
			db.QueryRow("SELECT id FROM vehicles WHERE license_plate=$1 AND deleted_at IS NULL", v.Plate).Scan(&id)
		}
		if id != "" {
			vehicleIDs = append(vehicleIDs, uuid.MustParse(id))
		}
	}

	type driver struct {
		Name, License, Phone, Email, CDLClass, CDLExpiry, HireDate string
	}
	drvs := []driver{
		{"Mike Johnson", "BC-CDL-88421", "250-555-4001", "mike.j@gable.com", "1", "2026-11-15", "2019-03-01"},
		{"Carlos Rivera", "BC-CDL-77332", "250-555-4002", "carlos.r@gable.com", "3", "2027-02-28", "2020-06-15"},
		{"Dave Thompson", "BC-CDL-66243", "250-555-4003", "dave.t@gable.com", "1", "2026-08-30", "2018-01-10"},
		{"Jake Wilson", "BC-CDL-55154", "250-555-4004", "jake.w@gable.com", "3", "2027-05-15", "2021-09-20"},
		{"Sarah Mitchell", "BC-CDL-44065", "250-555-4005", "sarah.m@gable.com", "1", "2027-01-20", "2022-04-15"},
		{"Tommy Nguyen", "BC-CDL-33976", "250-555-4006", "tommy.n@gable.com", "5", "2026-12-01", "2023-01-08"},
	}
	driverIDs := make([]uuid.UUID, 0)
	for _, d := range drvs {
		var id string
		db.QueryRow(`INSERT INTO drivers (name, license_number, phone_number, status, cdl_class, cdl_expiry, hire_date, email)
			VALUES ($1,$2,$3,'ACTIVE',$4,$5::date,$6::date,$7)
			ON CONFLICT (license_number) WHERE deleted_at IS NULL
			DO UPDATE SET name=$1, phone_number=$3, cdl_class=$4, cdl_expiry=$5::date, hire_date=$6::date, email=$7
			RETURNING id`,
			d.Name, d.License, d.Phone, d.CDLClass, d.CDLExpiry, d.HireDate, d.Email).Scan(&id)
		if id == "" {
			db.QueryRow("SELECT id FROM drivers WHERE license_number=$1 AND deleted_at IS NULL", d.License).Scan(&id)
		}
		if id != "" {
			driverIDs = append(driverIDs, uuid.MustParse(id))
		}
	}
	fmt.Printf("Seed: %d Vehicles, %d Drivers\n", len(vehs), len(drvs))

	// =========================================================================
	// 10. DELIVERY ROUTES & DELIVERIES
	// =========================================================================
	routeStatuses := []string{"COMPLETED", "COMPLETED", "COMPLETED", "IN_TRANSIT", "SCHEDULED", "DRAFT"}
	deliveryCount := 0
	if len(vehicleIDs) > 0 && len(driverIDs) > 0 && len(orderIDs) > 0 {
		for i := 0; i < 15; i++ {
			rStatus := routeStatuses[rand.Intn(len(routeStatuses))]
			sDate := recentDate(60)
			vid := vehicleIDs[rand.Intn(len(vehicleIDs))]
			did := driverIDs[rand.Intn(len(driverIDs))]
			var rid string
			db.QueryRow(`INSERT INTO delivery_routes (vehicle_id, driver_id, scheduled_date, status, notes)
				VALUES ($1,$2,$3,$4,$5) RETURNING id`,
				vid, did, sDate, rStatus, fmt.Sprintf("Route %d - %s run", i+1, sDate.Format("Mon"))).Scan(&rid)
			if rid == "" {
				continue
			}
			routeID := uuid.MustParse(rid)
			stops := 1 + rand.Intn(4)
			for s := 0; s < stops && s < len(orderIDs); s++ {
				oID := orderIDs[rand.Intn(len(orderIDs))]
				dStatus := "PENDING"
				if rStatus == "COMPLETED" {
					dStatus = "DELIVERED"
				} else if rStatus == "IN_TRANSIT" {
					dStatus = "OUT_FOR_DELIVERY"
				}
				var podURL, podSigner *string
				var podTS *time.Time
				if dStatus == "DELIVERED" {
					u := "https://storage.gable.com/pod/" + uuid.New().String() + ".jpg"
					n := "Site Foreman"
					t := sDate.Add(time.Duration(8+rand.Intn(6)) * time.Hour)
					podURL = &u
					podSigner = &n
					podTS = &t
				}
				db.Exec(`INSERT INTO deliveries (route_id, order_id, stop_sequence, status, pod_proof_url, pod_signed_by, pod_timestamp, delivery_instructions)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					routeID, oID, s+1, dStatus, podURL, podSigner, podTS, "Call 30 min before arrival")
				deliveryCount++
			}
		}
	}
	fmt.Printf("Seed: 15 Routes, %d Deliveries\n", deliveryCount)

	// =========================================================================
	// 11. PURCHASE ORDERS — branch-scoped, rotated across the three yards.
	// =========================================================================
	poStatuses := []string{"RECEIVED", "RECEIVED", "SENT", "PARTIAL", "DRAFT"}
	poCount := 0
	for vName, vID := range vendorIDs {
		for i := 0; i < 1+rand.Intn(2); i++ {
			poStatus := poStatuses[rand.Intn(len(poStatuses))]
			poBranch := branchIDList[rand.Intn(len(branchIDList))]
			var poID string
			db.QueryRow(`INSERT INTO purchase_orders (vendor_id, branch_id, status) VALUES ($1,$2,$3) RETURNING id`, vID, poBranch, poStatus).Scan(&poID)
			if poID == "" {
				continue
			}
			pid := uuid.MustParse(poID)
			lines := 2 + rand.Intn(5)
			for l := 0; l < lines; l++ {
				prod := products[rand.Intn(len(products))]
				qty := 50 + rand.Intn(200)
				qtyRcvd := 0.0
				if poStatus == "RECEIVED" {
					qtyRcvd = float64(qty)
				} else if poStatus == "PARTIAL" {
					qtyRcvd = float64(qty) * (0.3 + rand.Float64()*0.5)
				}
				db.Exec(`INSERT INTO purchase_order_lines (po_id, description, quantity, cost, product_id, qty_received)
					VALUES ($1,$2,$3,$4,$5,$6)`, pid, prod.Desc, qty, prod.Cost, skuToID[prod.SKU], qtyRcvd)
			}
			poCount++
		}
		_ = vName
	}
	fmt.Printf("Seed: %d Purchase Orders\n", poCount)

	// =========================================================================
	// 12. CUSTOMER TRANSACTIONS (AR Ledger)
	// =========================================================================
	txCount := 0
	for _, custID := range customerIDs {
		var balance int64 = 0
		for i := 0; i < 4+rand.Intn(5); i++ {
			txType := "INVOICE"
			amt := int64(500+rand.Intn(5000)) * 100
			if rand.Float32() < 0.5 && balance > 0 {
				txType = "PAYMENT"
				amt = -int64(rand.Intn(int(balance/100)+1)) * 100
			}
			balance += amt
			db.Exec(`INSERT INTO customer_transactions (customer_id, type, amount, balance_after, description, created_at)
				VALUES ($1,$2,$3,$4,$5,$6)`, custID, txType, amt, balance,
				fmt.Sprintf("Auto-generated %s", txType), recentDate(120))
			txCount++
		}
	}
	fmt.Printf("Seed: %d Customer Transactions\n", txCount)

	// =========================================================================
	// 13. PRICING RULES
	// =========================================================================
	type pricingRule struct {
		Name, RuleType, Category string
		DiscPct                  *float64
		MinQty                   float64
		MarginFloor              *float64
	}
	disc10 := 0.10
	disc15 := 0.15
	disc5 := 0.05
	margin20 := 0.20
	margin15 := 0.15
	rules := []pricingRule{
		{"Lumber Qty Break 100+", "QUANTITY_BREAK", "Lumber", &disc10, 100, &margin20},
		{"Lumber Qty Break 500+", "QUANTITY_BREAK", "Lumber", &disc15, 500, &margin15},
		{"Sheet Goods Qty Break 50+", "QUANTITY_BREAK", "Sheet Goods", &disc5, 50, &margin20},
		{"Hardware Bulk 200+", "QUANTITY_BREAK", "Hardware", &disc10, 200, nil},
		{"Spring Roofing Promo", "PROMOTIONAL", "Roofing", &disc5, 0, nil},
		{"Insulation Bundle Deal", "PROMOTIONAL", "Insulation", &disc10, 10, nil},
	}
	for _, r := range rules {
		db.Exec(`INSERT INTO pricing_rules (name, rule_type, category, discount_pct, min_quantity, margin_floor_pct, is_active, starts_at, expires_at)
			VALUES ($1,$2,$3,$4,$5,$6,true, NOW()-interval '30 days', NOW()+interval '90 days')
			ON CONFLICT DO NOTHING`, r.Name, r.RuleType, r.Category, r.DiscPct, r.MinQty, r.MarginFloor)
	}
	fmt.Printf("Seed: %d Pricing Rules\n", len(rules))

	// =========================================================================
	// 14. GL JOURNAL ENTRIES (placeholder)
	// =========================================================================
	months := []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun"}
	fmt.Printf("Seed: %d GL Journal Entries (6 months x 3)\n", len(months)*3)

	// =========================================================================
	// 15. PROJECTS
	// =========================================================================
	projectIDs := make(map[string]uuid.UUID)
	projectList := []struct {
		Customer string
		Name     string
		Status   string
	}{
		{"Kelbrook Construction", "Big White Lodge Reno Phase 1", "Active"},
		{"Kelbrook Construction", "West Kelowna Medical Plaza", "Active"},
		{"Okanagan Homes Ltd", "Mission Creek Townhomes Bldg A", "Active"},
		{"Okanagan Homes Ltd", "Mission Creek Townhomes Bldg B", "Active"},
		{"Mission Hill Custom", "Predator Ridge Estate Lot 12", "Active"},
		{"Predator Ridge Renos", "Kitchen Remodel - McKenzie", "Completed"},
	}

	for _, p := range projectList {
		cid, ok := customerIDs[p.Customer]
		if !ok {
			continue
		}
		id := uuid.New()
		_, err := db.Exec(`INSERT INTO projects (id, customer_id, name, status) VALUES ($1,$2,$3,$4)`,
			id, cid, p.Name, p.Status)
		if err == nil {
			projectIDs[p.Name] = id
		}
	}
	fmt.Printf("Seed: %d Projects\n", len(projectList))

	// Link some orders to projects
	for i, oID := range orderIDs {
		if i < len(projectList) {
			pName := projectList[i].Name
			if pID, ok := projectIDs[pName]; ok {
				db.Exec("UPDATE orders SET project_id=$1 WHERE id=$2", pID, oID)
			}
		}
	}

	// =========================================================================
	// 16. REBATES (Vendors)
	// =========================================================================
	rebatePrograms := []struct {
		Vendor string
		Name   string
		Type   string
	}{
		{"Gable Lumber & Supply", "2026 Volume Rebate", "VOLUME"},
		{"Okanagan Hardware Distribution", "Growth Incentive Q1", "GROWTH"},
		{"BC Roofing Wholesale", "Product Mix Bonus", "PRODUCT_MIX"},
	}

	for _, rp := range rebatePrograms {
		vid, ok := vendorIDs[rp.Vendor]
		if !ok {
			continue
		}
		var progID string
		db.QueryRow(`INSERT INTO rebate_programs (vendor_id, name, program_type, start_date, end_date)
			VALUES ($1,$2,$3, '2026-01-01', '2026-12-31') RETURNING id`, vid, rp.Name, rp.Type).Scan(&progID)

		if progID != "" {
			rid := uuid.MustParse(progID)
			db.Exec(`INSERT INTO rebate_tiers (program_id, min_volume, max_volume, rebate_pct) VALUES ($1, 0, 100000, 0.02)`, rid)
			db.Exec(`INSERT INTO rebate_tiers (program_id, min_volume, max_volume, rebate_pct) VALUES ($1, 100001, 500000, 0.04)`, rid)
			db.Exec(`INSERT INTO rebate_tiers (program_id, min_volume, max_volume, rebate_pct) VALUES ($1, 500001, NULL, 0.06)`, rid)

			db.Exec(`INSERT INTO rebate_claims (program_id, period_start, period_end, qualifying_volume, rebate_amount, status)
				VALUES ($1, '2026-01-01', '2026-03-31', 125000, 2500, 'CALCULATED')`, rid)
		}
	}
	fmt.Println("Seed: Rebate Programs, Tiers, and Claims")

	// =========================================================================
	// 17. CRM (Contacts & Activities)
	// =========================================================================
	contactIDs := make([]uuid.UUID, 0)
	for custName, cid := range customerIDs {
		var contactID string
		db.QueryRow(`INSERT INTO customer_contacts (customer_id, first_name, last_name, title, email, role, is_primary)
			VALUES ($1, $2, 'Manager', 'Purchasing Agent', $3, 'Buyer', true) RETURNING id`,
			cid, custName, "contact@"+uuid.New().String()+".com").Scan(&contactID)

		if contactID != "" {
			ctid := uuid.MustParse(contactID)
			contactIDs = append(contactIDs, ctid)

			db.Exec(`INSERT INTO crm_activities (customer_id, contact_id, activity_type, description)
				VALUES ($1, $2, 'CALL', 'Followed up on pending quote for Mission Creek project.')`,
				cid, ctid)
		}
	}
	fmt.Printf("Seed: %d CRM Contacts and Activities\n", len(contactIDs))

	// =========================================================================
	// 18. PORTAL CONFIG
	// =========================================================================
	db.Exec(`INSERT INTO portal_config (dealer_name, primary_color, support_email, support_phone)
		VALUES ('Gable Lumber & Supply', '#00FFA3', 'support@gablelumber.ca', '250-555-1000')
		ON CONFLICT DO NOTHING`)
	fmt.Println("Seed: Portal Config")

	// =========================================================================
	// 19. CREDIT MEMOS
	// =========================================================================
	if len(invoiceIDs) > 3 {
		memos := []struct {
			Reason string
			Amt    float64
			Status string
		}{
			{"Damaged material on delivery - 2x4x8 split ends", 125.00, "APPLIED"},
			{"Wrong product shipped - returned OSB", 285.00, "APPLIED"},
			{"Price adjustment per contract terms", 450.00, "PENDING"},
			{"Customer loyalty credit Q1", 200.00, "PENDING"},
		}
		for i, m := range memos {
			invID := invoiceIDs[i%len(invoiceIDs)]
			var custIDStr string
			db.QueryRow("SELECT customer_id FROM invoices WHERE id=$1", invID).Scan(&custIDStr)
			if custIDStr != "" {
				db.Exec(`INSERT INTO credit_memos (invoice_id, customer_id, amount, reason, status)
					VALUES ($1,$2,$3,$4,$5)`, invID, custIDStr, m.Amt, m.Reason, m.Status)
			}
		}
		fmt.Printf("Seed: %d Credit Memos\n", len(memos))
	}

	// =========================================================================
	// 20. RFCs (Governance)
	// =========================================================================
	rfcs := []struct {
		Title, Status, Problem string
	}{
		{"Standardize SKU Format", "draft", "Inconsistent data across branches"},
		{"Q3 Inventory Audit Procedure", "approved", "Need stricter control on lumber counts"},
		{"Vendor Onboarding Requirements", "review", "Compliance with new insurance regs"},
		{"Credit Limit Approval Workflow", "approved", "Automate approvals under $10k"},
		{"Safety Gear Mandatory List", "published", "Update per WorkSafeBC 2025 guidelines"},
		{"Returns Restocking Fee Policy", "draft", "Customer complaints on 15% fee"},
		{"Special Order Deposit Increase", "review", "Increase from 25% to 50% for non-stock"},
	}
	for _, rfc := range rfcs {
		db.Exec(`INSERT INTO rfcs (title, status, author_id, problem_statement, proposed_solution)
			VALUES ($1,$2,$3,$4,'See attached document for detailed proposal.')
			ON CONFLICT DO NOTHING`, rfc.Title, rfc.Status, demoUserID, rfc.Problem)
	}
	fmt.Println("Seed: Governance RFCs")

	// =========================================================================
	// 21. PORTAL USERS
	//    The demo portal account is `demo@kelbrook.ca` (Sam Kelbrook), linked
	//    to Kelbrook Construction — the persona referenced by the portal
	//    dev-mode injection in backend/cmd/server/main.go.
	// =========================================================================
	pwHash, _ := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	portalUsers := []struct {
		Customer, Email, Name, Role string
	}{
		{"Kelbrook Construction", "demo@kelbrook.ca", "Sam Kelbrook", "admin"},
		{"Okanagan Homes Ltd", "okhomes@gable.com", "Olivia Homes", "admin"},
		{"Mission Hill Custom", "missionhill@gable.com", "Marc Mission", "member"},
	}
	for _, pu := range portalUsers {
		cid, ok := customerIDs[pu.Customer]
		if !ok {
			continue
		}
		db.Exec(`INSERT INTO customer_users (customer_id, email, password_hash, name, role)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (email) DO UPDATE SET password_hash=$3`, cid, pu.Email, string(pwHash), pu.Name, pu.Role)
	}
	fmt.Println("Seed: Portal Users (demo@kelbrook.ca / okhomes@gable.com / missionhill@gable.com, password: 'password')")

	// =========================================================================
	// 22. OFFLINE POS SYNC LOGS
	// =========================================================================
	db.Exec(`INSERT INTO pos_sync_log (batch_id, register_id, synced_count, duplicate_count, error_count, synced_at)
		VALUES ('sync-batch-001', 'REG-1', 42, 0, 0, NOW() - interval '2 hours')`)
	db.Exec(`INSERT INTO pos_sync_log (batch_id, register_id, synced_count, duplicate_count, error_count, synced_at)
		VALUES ('sync-batch-002', 'REG-2', 15, 2, 0, NOW() - interval '30 minutes')`)
	fmt.Println("Seed: Offline POS Sync Logs")

	// =========================================================================
	// 23. EDI TRADING PARTNERS
	// =========================================================================
	db.Exec(`INSERT INTO edi_trading_partners (name, isa_sender_id, isa_receiver_id, gs_sender_id, gs_receiver_id, transport_type)
		VALUES ('Orgill', 'ORG-123456', 'GABLE-987654', 'ORG', 'GAB', 'SFTP')`)
	db.Exec(`INSERT INTO edi_trading_partners (name, isa_sender_id, isa_receiver_id, gs_sender_id, gs_receiver_id, transport_type)
		VALUES ('Do It Best', 'DIB-111111', 'GABLE-987654', 'DIB', 'GAB', 'AS2')`)
	fmt.Println("Seed: EDI Trading Partners")

	fmt.Println("==================================================")
	fmt.Println("  DATABASE SEEDING COMPLETE — GABLE LUMBER & SUPPLY (KELOWNA, BC)  ")
	fmt.Println("==================================================")
}
