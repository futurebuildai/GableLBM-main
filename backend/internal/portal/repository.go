package portal

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository defines data access for the portal module.
type Repository struct {
	db *database.DB
}

// NewRepository creates a new portal repository.
func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

// GetCustomerUserByEmail fetches a customer user by email for login.
func (r *Repository) GetCustomerUserByEmail(ctx context.Context, email string) (*CustomerUser, error) {
	query := `
		SELECT id, customer_id, email, password_hash, name, role, status, created_at, updated_at
		FROM customer_users
		WHERE email = $1
	`
	var u CustomerUser
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, email).Scan(
		&u.ID, &u.CustomerID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.Status,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get customer user: %w", err)
	}
	return &u, nil
}

// GetPortalConfig fetches the first (singleton) portal config row.
func (r *Repository) GetPortalConfig(ctx context.Context) (*PortalConfig, error) {
	query := `
		SELECT id, dealer_name, logo_url, primary_color, support_email, support_phone, created_at, updated_at
		FROM portal_config
		LIMIT 1
	`
	var cfg PortalConfig
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query).Scan(
		&cfg.ID, &cfg.DealerName, &cfg.LogoURL, &cfg.PrimaryColor,
		&cfg.SupportEmail, &cfg.SupportPhone, &cfg.CreatedAt, &cfg.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			// Return a sensible default if no config exists
			return &PortalConfig{
				DealerName:   "GableLBM",
				PrimaryColor: "#00FFA3",
			}, nil
		}
		return nil, fmt.Errorf("failed to get portal config: %w", err)
	}
	return &cfg, nil
}

// GetCustomerARSummary fetches balance, credit limit, and past-due amount.
func (r *Repository) GetCustomerARSummary(ctx context.Context, customerID uuid.UUID) (balance, creditLimit, pastDue float64, err error) {
	// Balance and credit limit from customers table
	custQuery := `SELECT COALESCE(balance_due, 0)::float8, COALESCE(credit_limit, 0)::float8 FROM customers WHERE id = $1`
	err = r.db.GetExecutor(ctx).QueryRow(ctx, custQuery, customerID).Scan(&balance, &creditLimit)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to get customer AR: %w", err)
	}

	// Past due: sum of unpaid/overdue invoices past their due date
	pastDueQuery := `
		SELECT COALESCE(SUM(total_amount), 0)::float8
		FROM invoices
		WHERE customer_id = $1
		  AND status IN ('UNPAID', 'OVERDUE')
		  AND due_date < NOW()
	`
	err = r.db.GetExecutor(ctx).QueryRow(ctx, pastDueQuery, customerID).Scan(&pastDue)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to get past due: %w", err)
	}

	return balance, creditLimit, pastDue, nil
}

// ListOrdersByCustomer fetches orders with lines for a customer.
func (r *Repository) ListOrdersByCustomer(ctx context.Context, customerID uuid.UUID) ([]PortalOrderDTO, error) {
	query := `
		SELECT id, status, total_amount, created_at
		FROM orders
		WHERE customer_id = $1
		ORDER BY created_at DESC
		LIMIT 50
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list orders: %w", err)
	}
	defer rows.Close()

	orders := make([]PortalOrderDTO, 0)
	for rows.Next() {
		var o PortalOrderDTO
		if err := rows.Scan(&o.ID, &o.Status, &o.TotalAmount, &o.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}
		o.Lines = make([]PortalLineDTO, 0) // Initialize empty for JSON []
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	// Fetch lines for each order
	for i := range orders {
		lines, err := r.getOrderLines(ctx, orders[i].ID)
		if err != nil {
			return nil, err
		}
		orders[i].Lines = lines
	}

	return orders, nil
}

// getOrderLines fetches line items for an order.
func (r *Repository) getOrderLines(ctx context.Context, orderID uuid.UUID) ([]PortalLineDTO, error) {
	query := `
		SELECT ol.product_id, COALESCE(p.sku, ''), COALESCE(p.description, ''), ol.quantity, ol.price_each
		FROM order_lines ol
		LEFT JOIN products p ON ol.product_id = p.id
		WHERE ol.order_id = $1
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to list order lines: %w", err)
	}
	defer rows.Close()

	lines := make([]PortalLineDTO, 0)
	for rows.Next() {
		var l PortalLineDTO
		if err := rows.Scan(&l.ProductID, &l.ProductSKU, &l.ProductName, &l.Quantity, &l.PriceEach); err != nil {
			return nil, fmt.Errorf("failed to scan order line: %w", err)
		}
		lines = append(lines, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}
	return lines, nil
}

// GetOrderByIDAndCustomer fetches a single order scoped to a customer.
func (r *Repository) GetOrderByIDAndCustomer(ctx context.Context, orderID, customerID uuid.UUID) (*PortalOrderDTO, error) {
	query := `
		SELECT id, status, total_amount, created_at
		FROM orders
		WHERE id = $1 AND customer_id = $2
	`
	var o PortalOrderDTO
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, orderID, customerID).Scan(
		&o.ID, &o.Status, &o.TotalAmount, &o.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("order not found")
		}
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	lines, err := r.getOrderLines(ctx, orderID)
	if err != nil {
		return nil, err
	}
	o.Lines = lines
	return &o, nil
}

// ListInvoicesByCustomer fetches invoices for a customer.
func (r *Repository) ListInvoicesByCustomer(ctx context.Context, customerID uuid.UUID) ([]PortalInvoiceDTO, error) {
	query := `
		SELECT id, order_id, status, total_amount, subtotal, tax_amount, payment_terms, due_date, paid_at, created_at
		FROM invoices
		WHERE customer_id = $1
		ORDER BY created_at DESC
		LIMIT 50
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list invoices: %w", err)
	}
	defer rows.Close()

	invoices := make([]PortalInvoiceDTO, 0)
	for rows.Next() {
		var inv PortalInvoiceDTO
		if err := rows.Scan(
			&inv.ID, &inv.OrderID, &inv.Status, &inv.TotalAmount,
			&inv.Subtotal, &inv.TaxAmount, &inv.PaymentTerms,
			&inv.DueDate, &inv.PaidAt, &inv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan invoice: %w", err)
		}
		inv.Lines = make([]PortalLineDTO, 0)
		invoices = append(invoices, inv)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	return invoices, nil
}

// GetInvoiceByIDAndCustomer fetches a single invoice scoped to a customer.
func (r *Repository) GetInvoiceByIDAndCustomer(ctx context.Context, invoiceID, customerID uuid.UUID) (*PortalInvoiceDTO, error) {
	query := `
		SELECT id, order_id, status, total_amount, subtotal, tax_amount, payment_terms, due_date, paid_at, created_at
		FROM invoices
		WHERE id = $1 AND customer_id = $2
	`
	var inv PortalInvoiceDTO
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, invoiceID, customerID).Scan(
		&inv.ID, &inv.OrderID, &inv.Status, &inv.TotalAmount,
		&inv.Subtotal, &inv.TaxAmount, &inv.PaymentTerms,
		&inv.DueDate, &inv.PaidAt, &inv.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("invoice not found")
		}
		return nil, fmt.Errorf("failed to get invoice: %w", err)
	}

	// Fetch invoice lines
	lineQuery := `
		SELECT il.product_id, COALESCE(p.sku, ''), COALESCE(p.description, ''), il.quantity, il.price_each
		FROM invoice_lines il
		LEFT JOIN products p ON il.product_id = p.id
		WHERE il.invoice_id = $1
	`
	lineRows, err := r.db.GetExecutor(ctx).Query(ctx, lineQuery, invoiceID)
	if err != nil {
		return nil, fmt.Errorf("failed to list invoice lines: %w", err)
	}
	defer lineRows.Close()

	inv.Lines = make([]PortalLineDTO, 0)
	for lineRows.Next() {
		var l PortalLineDTO
		if err := lineRows.Scan(&l.ProductID, &l.ProductSKU, &l.ProductName, &l.Quantity, &l.PriceEach); err != nil {
			return nil, fmt.Errorf("failed to scan invoice line: %w", err)
		}
		inv.Lines = append(inv.Lines, l)
	}
	if err := lineRows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	return &inv, nil
}

// ListDeliveriesByCustomer fetches deliveries with POD info, driver, and vehicle for a customer.
func (r *Repository) ListDeliveriesByCustomer(ctx context.Context, customerID uuid.UUID) ([]PortalDeliveryDTO, error) {
	query := `
		SELECT d.id, d.order_id, d.status, d.pod_proof_url, d.pod_signed_by, d.pod_timestamp,
		       d.created_at, o.id::text,
		       dr.name, dr.phone_number, dr.photo_url,
		       v.name, v.photo_url,
		       rt.scheduled_date, d.estimated_arrival,
		       c.address,
		       d.stop_sequence, d.delivery_instructions,
		       (SELECT COUNT(*) FROM deliveries WHERE route_id = d.route_id)
		FROM deliveries d
		JOIN orders o ON d.order_id = o.id
		JOIN customers c ON o.customer_id = c.id
		LEFT JOIN delivery_routes rt ON d.route_id = rt.id
		LEFT JOIN drivers dr ON rt.driver_id = dr.id
		LEFT JOIN vehicles v ON rt.vehicle_id = v.id
		WHERE o.customer_id = $1
		ORDER BY d.created_at DESC
		LIMIT 50
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list deliveries: %w", err)
	}
	defer rows.Close()

	deliveries := make([]PortalDeliveryDTO, 0)
	for rows.Next() {
		var d PortalDeliveryDTO
		if err := rows.Scan(
			&d.ID, &d.OrderID, &d.Status, &d.PODProofURL, &d.PODSignedBy,
			&d.PODTimestamp, &d.CreatedAt, &d.OrderNumber,
			&d.DriverName, &d.DriverPhone, &d.DriverPhotoURL,
			&d.VehicleName, &d.VehiclePhotoURL,
			&d.ScheduledDate, &d.EstimatedArrival,
			&d.DeliveryAddress,
			&d.StopSequence, &d.DeliveryInstructions,
			&d.TotalStops,
		); err != nil {
			return nil, fmt.Errorf("failed to scan delivery: %w", err)
		}
		deliveries = append(deliveries, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	return deliveries, nil
}

// GetDeliveryByIDAndCustomer fetches a single delivery scoped to a customer.
func (r *Repository) GetDeliveryByIDAndCustomer(ctx context.Context, deliveryID, customerID uuid.UUID) (*PortalDeliveryDTO, error) {
	query := `
		SELECT d.id, d.order_id, d.status, d.pod_proof_url, d.pod_signed_by, d.pod_timestamp,
		       d.created_at, o.id::text,
		       dr.name, dr.phone_number, dr.photo_url,
		       v.name, v.photo_url,
		       rt.scheduled_date, d.estimated_arrival,
		       c.address,
		       d.stop_sequence, d.delivery_instructions,
		       (SELECT COUNT(*) FROM deliveries WHERE route_id = d.route_id)
		FROM deliveries d
		JOIN orders o ON d.order_id = o.id
		JOIN customers c ON o.customer_id = c.id
		LEFT JOIN delivery_routes rt ON d.route_id = rt.id
		LEFT JOIN drivers dr ON rt.driver_id = dr.id
		LEFT JOIN vehicles v ON rt.vehicle_id = v.id
		WHERE d.id = $1 AND o.customer_id = $2
	`
	var d PortalDeliveryDTO
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, deliveryID, customerID).Scan(
		&d.ID, &d.OrderID, &d.Status, &d.PODProofURL, &d.PODSignedBy,
		&d.PODTimestamp, &d.CreatedAt, &d.OrderNumber,
		&d.DriverName, &d.DriverPhone, &d.DriverPhotoURL,
		&d.VehicleName, &d.VehiclePhotoURL,
		&d.ScheduledDate, &d.EstimatedArrival,
		&d.DeliveryAddress,
		&d.StopSequence, &d.DeliveryInstructions,
		&d.TotalStops,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("delivery not found")
		}
		return nil, fmt.Errorf("failed to get delivery: %w", err)
	}
	return &d, nil
}

// CreateReorder duplicates order lines from a historical order into a new DRAFT order.
// Uses RunInTx to ensure atomicity — partial failures roll back cleanly.
func (r *Repository) CreateReorder(ctx context.Context, customerID, sourceOrderID uuid.UUID) (uuid.UUID, error) {
	// Verify source order belongs to customer (outside tx — read-only check)
	var count int
	err := r.db.GetExecutor(ctx).QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE id = $1 AND customer_id = $2`, sourceOrderID, customerID).Scan(&count)
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to verify order ownership: %w", err)
	}
	if count == 0 {
		return uuid.Nil, fmt.Errorf("order not found")
	}

	newOrderID := uuid.New()
	now := time.Now()

	err = r.db.RunInTx(ctx, func(txCtx context.Context) error {
		// 1. Create new DRAFT order
		_, err := r.db.GetExecutor(txCtx).Exec(txCtx, `
			INSERT INTO orders (id, customer_id, status, total_amount, created_at, updated_at)
			SELECT $1, $2, 'DRAFT',
			       COALESCE(SUM(ol.quantity * ol.price_each), 0),
			       $3, $3
			FROM order_lines ol WHERE ol.order_id = $4
		`, newOrderID, customerID, now, sourceOrderID)
		if err != nil {
			return fmt.Errorf("failed to create reorder: %w", err)
		}

		// 2. Copy lines with fresh UUIDs and current product prices
		_, err = r.db.GetExecutor(txCtx).Exec(txCtx, `
			INSERT INTO order_lines (id, order_id, product_id, quantity, price_each, is_special_order, vendor_id, special_order_cost)
			SELECT gen_random_uuid(), $1, ol.product_id, ol.quantity,
			       COALESCE(p.base_price, ol.price_each),
			       ol.is_special_order, ol.vendor_id, ol.special_order_cost
			FROM order_lines ol
			LEFT JOIN products p ON ol.product_id = p.id
			WHERE ol.order_id = $2
		`, newOrderID, sourceOrderID)
		if err != nil {
			return fmt.Errorf("failed to copy order lines: %w", err)
		}

		// 3. Recalculate total with current prices
		_, err = r.db.GetExecutor(txCtx).Exec(txCtx, `
			UPDATE orders SET total_amount = (
				SELECT COALESCE(SUM(quantity * price_each), 0)
				FROM order_lines WHERE order_id = $1
			) WHERE id = $1
		`, newOrderID)
		if err != nil {
			return fmt.Errorf("failed to update reorder total: %w", err)
		}

		return nil
	})
	if err != nil {
		return uuid.Nil, err
	}

	return newOrderID, nil
}

// --- Catalog Repository Methods ---

// ListCatalogProducts queries products with optional search/filter and aggregated availability.
func (r *Repository) ListCatalogProducts(ctx context.Context, filter CatalogFilter) ([]catalogRow, error) {
	query := `
		SELECT p.id, p.sku, p.description,
		       COALESCE(p.category, ''), COALESCE(p.species, ''), COALESCE(p.grade, ''),
		       COALESCE(p.image_url, ''), p.uom_primary::text, COALESCE(p.base_price, 0)
		FROM products p
		WHERE 1=1
	`
	args := make([]interface{}, 0)
	argIdx := 1

	if filter.Query != "" {
		query += fmt.Sprintf(` AND (p.sku ILIKE $%d OR p.description ILIKE $%d)`, argIdx, argIdx)
		args = append(args, "%"+filter.Query+"%")
		argIdx++
	}
	if filter.Category != "" {
		query += fmt.Sprintf(` AND p.category = $%d`, argIdx)
		args = append(args, filter.Category)
		argIdx++
	}
	if filter.Species != "" {
		query += fmt.Sprintf(` AND p.species = $%d`, argIdx)
		args = append(args, filter.Species)
		argIdx++
	}
	if filter.Grade != "" {
		query += fmt.Sprintf(` AND p.grade = $%d`, argIdx)
		args = append(args, filter.Grade)
		argIdx++
	}

	query += ` ORDER BY p.sku ASC LIMIT 200`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list catalog products: %w", err)
	}
	defer rows.Close()

	products := make([]catalogRow, 0)
	for rows.Next() {
		var p catalogRow
		if err := rows.Scan(
			&p.ID, &p.SKU, &p.Name,
			&p.Category, &p.Species, &p.Grade,
			&p.ImageURL, &p.UOM, &p.BasePrice,
		); err != nil {
			return nil, fmt.Errorf("failed to scan catalog product: %w", err)
		}
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("catalog rows error: %w", err)
	}
	return products, nil
}

// GetCatalogProduct fetches a single product detail for the catalog.
func (r *Repository) GetCatalogProduct(ctx context.Context, productID uuid.UUID) (*catalogRow, error) {
	query := `
		SELECT p.id, p.sku, p.description,
		       COALESCE(p.category, ''), COALESCE(p.species, ''), COALESCE(p.grade, ''),
		       COALESCE(p.image_url, ''), p.uom_primary::text, COALESCE(p.base_price, 0),
		       COALESCE(p.weight_lbs, 0), COALESCE(p.upc, ''), COALESCE(p.vendor, '')
		FROM products p
		WHERE p.id = $1
	`
	var p catalogRow
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, productID).Scan(
		&p.ID, &p.SKU, &p.Name,
		&p.Category, &p.Species, &p.Grade,
		&p.ImageURL, &p.UOM, &p.BasePrice,
		&p.WeightLbs, &p.UPC, &p.Vendor,
	)
	if err != nil {
		return nil, fmt.Errorf("product not found: %w", err)
	}
	return &p, nil
}

// --- Cart Repository Methods ---

// GetCartByCustomer fetches a customer's cart with all items.
func (r *Repository) GetCartByCustomer(ctx context.Context, customerID uuid.UUID) (*CartDTO, error) {
	var cartID uuid.UUID
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT id FROM portal_carts WHERE customer_id = $1`, customerID,
	).Scan(&cartID)
	if err != nil {
		return nil, fmt.Errorf("cart not found: %w", err)
	}

	// Fetch items
	itemRows, err := r.db.GetExecutor(ctx).Query(ctx, `
		SELECT ci.id, ci.product_id, COALESCE(p.sku, ''), COALESCE(p.description, ''),
		       COALESCE(p.image_url, ''), ci.quantity, ci.unit_price
		FROM portal_cart_items ci
		LEFT JOIN products p ON ci.product_id = p.id
		WHERE ci.cart_id = $1
		ORDER BY ci.created_at ASC
	`, cartID)
	if err != nil {
		return nil, fmt.Errorf("failed to list cart items: %w", err)
	}
	defer itemRows.Close()

	items := make([]CartItemDTO, 0)
	subtotal := 0.0
	for itemRows.Next() {
		var item CartItemDTO
		if err := itemRows.Scan(
			&item.ID, &item.ProductID, &item.ProductSKU, &item.ProductName,
			&item.ImageURL, &item.Quantity, &item.UnitPrice,
		); err != nil {
			return nil, fmt.Errorf("failed to scan cart item: %w", err)
		}
		item.LineTotal = item.Quantity * item.UnitPrice
		subtotal += item.LineTotal
		items = append(items, item)
	}
	if err := itemRows.Err(); err != nil {
		return nil, fmt.Errorf("cart items rows error: %w", err)
	}

	return &CartDTO{
		ID:        cartID,
		Items:     items,
		ItemCount: len(items),
		Subtotal:  subtotal,
	}, nil
}

// CreateCart creates a new empty cart for a customer.
func (r *Repository) CreateCart(ctx context.Context, customerID uuid.UUID) (uuid.UUID, error) {
	var cartID uuid.UUID
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`INSERT INTO portal_carts (customer_id) VALUES ($1)
		 ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
		 RETURNING id`,
		customerID,
	).Scan(&cartID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to create cart: %w", err)
	}
	return cartID, nil
}

// AddCartItem adds or updates a product in the cart.
func (r *Repository) AddCartItem(ctx context.Context, cartID, productID uuid.UUID, quantity, unitPrice float64) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `
		INSERT INTO portal_cart_items (cart_id, product_id, quantity, unit_price)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (cart_id, product_id) DO UPDATE SET
			quantity = portal_cart_items.quantity + EXCLUDED.quantity,
			unit_price = EXCLUDED.unit_price
	`, cartID, productID, quantity, unitPrice)
	if err != nil {
		return fmt.Errorf("failed to add cart item: %w", err)
	}
	return nil
}

// UpdateCartItemQty updates the quantity of a specific cart item, scoped to the customer's cart.
func (r *Repository) UpdateCartItemQty(ctx context.Context, itemID uuid.UUID, quantity float64, customerID uuid.UUID) error {
	tag, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE portal_cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 AND cart_id IN (SELECT id FROM portal_carts WHERE customer_id = $3)`,
		quantity, itemID, customerID,
	)
	if err != nil {
		return fmt.Errorf("failed to update cart item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("cart item not found")
	}
	return nil
}

// RemoveCartItem deletes a specific cart item, scoped to the customer's cart.
func (r *Repository) RemoveCartItem(ctx context.Context, itemID uuid.UUID, customerID uuid.UUID) error {
	tag, err := r.db.GetExecutor(ctx).Exec(ctx,
		`DELETE FROM portal_cart_items WHERE id = $1 AND cart_id IN (SELECT id FROM portal_carts WHERE customer_id = $2)`,
		itemID, customerID,
	)
	if err != nil {
		return fmt.Errorf("failed to remove cart item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("cart item not found")
	}
	return nil
}

// ClearCart removes all items from a cart.
func (r *Repository) ClearCart(ctx context.Context, cartID uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`DELETE FROM portal_cart_items WHERE cart_id = $1`, cartID,
	)
	if err != nil {
		return fmt.Errorf("failed to clear cart: %w", err)
	}
	return nil
}

// --- Portal User Management Methods ---

// ListCustomerUsers fetches all portal users for a customer.
func (r *Repository) ListCustomerUsers(ctx context.Context, customerID uuid.UUID) ([]CustomerUser, error) {
	query := `
		SELECT id, customer_id, email, name, role, status, created_at, updated_at
		FROM customer_users
		WHERE customer_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	users := make([]CustomerUser, 0)
	for rows.Next() {
		var u CustomerUser
		if err := rows.Scan(&u.ID, &u.CustomerID, &u.Email, &u.Name, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, nil
}

// UpdateUserRole updates an existing user's role.
func (r *Repository) UpdateUserRole(ctx context.Context, userID, customerID uuid.UUID, role string) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `UPDATE customer_users SET role = $1, updated_at = NOW() WHERE id = $2 AND customer_id = $3`, role, userID, customerID)
	if err != nil {
		return fmt.Errorf("failed to update user role: %w", err)
	}
	return nil
}

// UpdateUserStatus changes the user's status.
func (r *Repository) UpdateUserStatus(ctx context.Context, userID, customerID uuid.UUID, status string) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `UPDATE customer_users SET status = $1, updated_at = NOW() WHERE id = $2 AND customer_id = $3`, status, userID, customerID)
	if err != nil {
		return fmt.Errorf("failed to update user status: %w", err)
	}
	return nil
}

// CreatePortalInvite stores a new invite token.
func (r *Repository) CreatePortalInvite(ctx context.Context, invite PortalInvite) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `
		INSERT INTO portal_invites (id, customer_id, email, role, token, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`, invite.ID, invite.CustomerID, invite.Email, invite.Role, invite.Token, invite.ExpiresAt)
	if err != nil {
		return fmt.Errorf("failed to create invite: %w", err)
	}
	return nil
}

// ListPortalInvites fetches active invites for a customer.
func (r *Repository) ListPortalInvites(ctx context.Context, customerID uuid.UUID) ([]PortalInvite, error) {
	query := `
		SELECT id, customer_id, email, role, token, expires_at, created_at
		FROM portal_invites
		WHERE customer_id = $1 AND expires_at > NOW()
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list invites: %w", err)
	}
	defer rows.Close()

	invites := make([]PortalInvite, 0)
	for rows.Next() {
		var i PortalInvite
		if err := rows.Scan(&i.ID, &i.CustomerID, &i.Email, &i.Role, &i.Token, &i.ExpiresAt, &i.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan invite: %w", err)
		}
		invites = append(invites, i)
	}
	return invites, nil
}
