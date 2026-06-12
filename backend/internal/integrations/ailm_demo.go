package integrations

// AI_LM demo seeding: creates next-day CONFIRMED lumber orders (with delivery
// geopoints) for the end-to-end dispatch demo and stamps realistic actual-size
// dimensions on the lumber SKUs so their digital twins render true to scale.
// X-Integration-Key gated; see also migration 075 (scheduled_delivery_date,
// delivery geopoint, demo_seed flag).

import (
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"time"
)

// --- demo seed --------------------------------------------------------------

// demoSeedRequest optionally overrides the target delivery date (default: tomorrow).
type demoSeedRequest struct {
	Date string `json:"date,omitempty"` // YYYY-MM-DD
}

// demoLumberDim is the realistic actual-size geometry for a lumber SKU
// (nominal 2x4 is 1.5"x3.5" actual) so the AI_LM load builder renders true
// digital twins instead of identical volume boxes.
type demoLumberDim struct {
	SKU       string
	LengthIn  float64
	WidthIn   float64
	HeightIn  float64
	Stackable bool
}

var demoLumberDims = []demoLumberDim{
	{"LUM-248-PREM", 96, 3.5, 1.5, true},
	{"LUM-2410-PREM", 120, 3.5, 1.5, true},
	{"LUM-2412-PREM", 144, 3.5, 1.5, true},
	{"LUM-2492-STUD", 92.625, 3.5, 1.5, true},
	{"LUM-2610-PREM", 120, 5.5, 1.5, true},
	{"LUM-2612-PREM", 144, 5.5, 1.5, true},
	{"LUM-2616-PREM", 192, 5.5, 1.5, true},
	{"LUM-2810-NO2", 120, 7.25, 1.5, true},
	{"LUM-2816-NO2", 192, 7.25, 1.5, true},
	{"LUM-21012-NO2", 144, 9.25, 1.5, true},
	{"LUM-21216-NO2", 192, 11.25, 1.5, true},
	{"LUM-448-PT", 96, 3.5, 3.5, true},
	{"LUM-4410-PT", 120, 3.5, 3.5, true},
	{"LUM-6612-PT", 144, 5.5, 5.5, false}, // 6x6 PT post: do not stack on top
	{"LUM-448-WRC", 96, 3.5, 3.5, true},
	{"LUM-166-WRC", 72, 5.5, 0.75, true},
}

// demoOrderSpec is one deterministic demo order: a customer account, a real
// jobsite delivery point in the Okanagan, and a lumber-package line list.
type demoOrderSpec struct {
	CustomerAcct string
	Address      string
	Lat, Lng     float64
	Lines        []struct {
		SKU string
		Qty float64
	}
}

func demoLine(sku string, qty float64) struct {
	SKU string
	Qty float64
} {
	return struct {
		SKU string
		Qty float64
	}{sku, qty}
}

var demoOrders = []demoOrderSpec{
	{
		CustomerAcct: "KELBROOK-001",
		Address:      "1885 Spall Rd, Kelowna BC V1Y 4R2",
		Lat:          49.8801, Lng: -119.4436,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-2492-STUD", 196), demoLine("LUM-2410-PREM", 48), demoLine("LUM-21012-NO2", 24)},
	},
	{
		CustomerAcct: "OKH-001",
		Address:      "9000 Summit Pkwy, Kelowna BC V1Y 9R3",
		Lat:          49.9402, Lng: -119.3963,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-2616-PREM", 64), demoLine("LUM-2816-NO2", 32), demoLine("LUM-21216-NO2", 16)},
	},
	{
		CustomerAcct: "LCB-001",
		Address:      "2100 Bottom Wood Lake Rd, Lake Country BC V4V 2K9",
		Lat:          50.0541, Lng: -119.4131,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-248-PREM", 128), demoLine("LUM-2612-PREM", 40)},
	},
	{
		CustomerAcct: "PRR-001",
		Address:      "1525 Country Club Dr, Vernon BC V1H 1L3",
		Lat:          50.2670, Lng: -119.3723,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-448-PT", 36), demoLine("LUM-6612-PT", 12), demoLine("LUM-2610-PREM", 56)},
	},
	{
		CustomerAcct: "MHC-001",
		Address:      "3200 Mission Hill Rd, West Kelowna BC V4T 2E4",
		Lat:          49.8528, Lng: -119.5811,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-2412-PREM", 96), demoLine("LUM-2810-NO2", 40), demoLine("LUM-2492-STUD", 84)},
	},
	{
		CustomerAcct: "WDF-001",
		Address:      "150 Boucherie Rd, West Kelowna BC V4T 1Z6",
		Lat:          49.8606, Lng: -119.5876,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-166-WRC", 240), demoLine("LUM-448-WRC", 28), demoLine("LUM-4410-PT", 20)},
	},
	{
		CustomerAcct: "PFC-001",
		Address:      "5500 Beach Ave, Peachland BC V0H 1X4",
		Lat:          49.7742, Lng: -119.7369,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-2492-STUD", 144), demoLine("LUM-2616-PREM", 48)},
	},
	{
		CustomerAcct: "GHR-001",
		Address:      "780 Bernard Ave, Kelowna BC V1Y 6P5",
		Lat:          49.8870, Lng: -119.4893,
		Lines: []struct {
			SKU string
			Qty float64
		}{demoLine("LUM-2410-PREM", 72), demoLine("LUM-2612-PREM", 36), demoLine("LUM-448-PT", 16)},
	},
}

// SeedDemoOrders creates next-day CONFIRMED lumber orders (with delivery
// geopoints) for the AI_LM end-to-end demo, and stamps realistic actual-size
// dimensions onto the lumber SKUs so their digital twins render true to scale.
// Re-seeding a date first removes the orders it previously seeded for it.
func (h *Handler) SeedDemoOrders(w http.ResponseWriter, r *http.Request) {
	var req demoSeedRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req) // empty body → defaults
	}
	date := req.Date
	if date == "" {
		date = time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		writeError(w, http.StatusBadRequest, "invalid date; expected YYYY-MM-DD")
		return
	}

	ctx := r.Context()

	// 1. Stamp realistic geometry on the demo lumber SKUs (the PIM digital twin).
	for _, d := range demoLumberDims {
		if _, err := h.db.Pool.Exec(ctx, `
			UPDATE products SET length_in=$2, width_in=$3, height_in=$4, stackable=$5,
			       geometry_source='parametric', updated_at=NOW()
			WHERE sku=$1`, d.SKU, d.LengthIn, d.WidthIn, d.HeightIn, d.Stackable); err != nil {
			slog.Error("demo seed: stamp dims", "sku", d.SKU, "error", err)
		}
	}

	// 2. Replace previously demo-seeded orders for this date.
	if _, err := h.db.Pool.Exec(ctx, `
		DELETE FROM deliveries WHERE order_id IN
			(SELECT id FROM orders WHERE demo_seed AND scheduled_delivery_date=$1)`, date); err != nil {
		slog.Error("demo seed: clear deliveries", "error", err)
	}
	if _, err := h.db.Pool.Exec(ctx, `
		DELETE FROM orders WHERE demo_seed AND scheduled_delivery_date=$1`, date); err != nil {
		slog.Error("demo seed: clear orders", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to clear previous demo orders")
		return
	}

	// 3. Create the demo orders.
	type seededOrder struct {
		ID           string  `json:"id"`
		CustomerName string  `json:"customer_name"`
		Address      string  `json:"address"`
		Lines        int     `json:"lines"`
		WeightLbs    float64 `json:"weight_lbs"`
	}
	created := []seededOrder{}

	for _, spec := range demoOrders {
		var customerID, customerName string
		var branchID *string
		err := h.db.Pool.QueryRow(ctx, `
			SELECT id, name, primary_branch_id FROM customers WHERE account_number=$1`,
			spec.CustomerAcct).Scan(&customerID, &customerName, &branchID)
		if err != nil {
			slog.Warn("demo seed: customer not found, skipping", "account", spec.CustomerAcct)
			continue
		}

		var orderID string
		err = h.db.Pool.QueryRow(ctx, `
			INSERT INTO orders (customer_id, branch_id, status, total_amount,
			                    scheduled_delivery_date, delivery_address,
			                    delivery_latitude, delivery_longitude, demo_seed)
			VALUES ($1,
			        COALESCE($2::uuid, (SELECT value::uuid FROM system_settings WHERE key='default_branch_id')),
			        'CONFIRMED', 0, $3, $4, $5, $6, TRUE)
			RETURNING id`,
			customerID, branchID, date, spec.Address, spec.Lat, spec.Lng).Scan(&orderID)
		if err != nil {
			slog.Error("demo seed: create order", "account", spec.CustomerAcct, "error", err)
			continue
		}

		var totalDollars, totalWeight float64
		lineCount := 0
		for _, l := range spec.Lines {
			var productID string
			var basePrice, weight float64
			err := h.db.Pool.QueryRow(ctx, `
				SELECT id, COALESCE(base_price, 0), COALESCE(weight_lbs, 0)
				FROM products WHERE sku=$1`, l.SKU).Scan(&productID, &basePrice, &weight)
			if err != nil {
				slog.Warn("demo seed: product not found, skipping line", "sku", l.SKU)
				continue
			}
			if _, err := h.db.Pool.Exec(ctx, `
				INSERT INTO order_lines (order_id, product_id, quantity, price_each)
				VALUES ($1, $2, $3, $4)`, orderID, productID, l.Qty, basePrice); err != nil {
				slog.Error("demo seed: create order line", "sku", l.SKU, "error", err)
				continue
			}
			totalDollars += basePrice * l.Qty
			totalWeight += weight * l.Qty
			lineCount++
		}

		if _, err := h.db.Pool.Exec(ctx, `
			UPDATE orders SET total_amount=$2, updated_at=NOW() WHERE id=$1`,
			orderID, math.Round(totalDollars*100)/100); err != nil {
			slog.Error("demo seed: set order total", "order_id", orderID, "error", err)
		}

		created = append(created, seededOrder{
			ID:           orderID,
			CustomerName: customerName,
			Address:      spec.Address,
			Lines:        lineCount,
			WeightLbs:    math.Round(totalWeight),
		})
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"date":   date,
		"orders": created,
	})
}
