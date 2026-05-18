package dashboard

import "time"

// DashboardSummary provides aggregated KPIs for the executive dashboard.
type DashboardSummary struct {
	TodayRevenue       int64   `json:"today_revenue"`        // Cents - today's collected payments
	TodayRevenueChange float64 `json:"today_revenue_change"` // Percentage change vs yesterday
	ActiveOrders       int     `json:"active_orders"`        // Orders in processing states
	PendingDispatch    int     `json:"pending_dispatch"`     // Deliveries not yet dispatched
	OutstandingAR      int64   `json:"outstanding_ar"`       // Cents - total unpaid invoices
	OutstandingARCount int     `json:"outstanding_ar_count"` // Number of unpaid invoices
}

// InventoryAlert represents a product with low or zero stock.
type InventoryAlert struct {
	ProductID  string `json:"product_id"`
	SKU        string `json:"sku"`
	Name       string `json:"name"`
	CurrentQty int    `json:"current_qty"`
	ReorderQty int    `json:"reorder_qty"`
	AlertType  string `json:"alert_type"` // "LOW_STOCK" or "OUT_OF_STOCK"
	LocationID string `json:"location_id,omitempty"`
}

// TopCustomer represents a customer ranked by revenue.
type TopCustomer struct {
	CustomerID   string `json:"customer_id"`
	CustomerName string `json:"customer_name"`
	TotalRevenue int64  `json:"total_revenue"` // Cents
	OrderCount   int    `json:"order_count"`
}

// OrderActivity provides recent order information.
type OrderActivity struct {
	RecentOrders    []RecentOrder  `json:"recent_orders"`
	StatusBreakdown map[string]int `json:"status_breakdown"`
}

// RecentOrder represents a single order in the activity feed.
type RecentOrder struct {
	OrderID      string    `json:"order_id"`
	CustomerName string    `json:"customer_name"`
	TotalAmount  int64     `json:"total_amount"` // Cents
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
}

// RevenueTrendPoint represents daily revenue for trend chart.
type RevenueTrendPoint struct {
	Date    string `json:"date"`    // YYYY-MM-DD
	Revenue int64  `json:"revenue"` // Cents
}
