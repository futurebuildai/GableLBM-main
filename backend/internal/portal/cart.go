package portal

import (
	"context"
	"fmt"
	"math"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/order"
	"github.com/google/uuid"
)

// GetCart returns the current cart for a customer, creating one if it doesn't exist.
func (s *Service) GetCart(ctx context.Context, customerID uuid.UUID) (*CartDTO, error) {
	cart, err := s.repo.GetCartByCustomer(ctx, customerID)
	if err != nil {
		// Create new cart
		cartID, cErr := s.repo.CreateCart(ctx, customerID)
		if cErr != nil {
			return nil, fmt.Errorf("failed to create cart: %w", cErr)
		}
		return &CartDTO{
			ID:    cartID,
			Items: []CartItemDTO{},
		}, nil
	}
	return cart, nil
}

// AddToCart adds a product to the customer's cart with customer-specific pricing.
func (s *Service) AddToCart(ctx context.Context, customerID uuid.UUID, req AddToCartRequest) (*CartDTO, error) {
	if req.Quantity <= 0 {
		return nil, fmt.Errorf("quantity must be positive")
	}

	// Ensure cart exists
	cart, err := s.GetCart(ctx, customerID)
	if err != nil {
		return nil, err
	}

	// Get customer-specific price
	unitPrice := 0.0
	prod, pErr := s.productSvc.GetProduct(ctx, req.ProductID)
	if pErr != nil {
		return nil, fmt.Errorf("product not found: %w", pErr)
	}
	unitPrice = prod.BasePrice

	cust, cErr := s.customerSvc.GetCustomer(ctx, customerID)
	if cErr == nil && s.pricingSvc != nil {
		cp, prErr := s.pricingSvc.CalculatePrice(ctx, cust, req.ProductID, prod.BasePrice)
		if prErr == nil {
			unitPrice = cp.FinalPrice
		}
	}

	err = s.repo.AddCartItem(ctx, cart.ID, req.ProductID, req.Quantity, unitPrice)
	if err != nil {
		return nil, fmt.Errorf("failed to add to cart: %w", err)
	}

	return s.GetCart(ctx, customerID)
}

// UpdateCartItem updates the quantity of a cart item.
func (s *Service) UpdateCartItem(ctx context.Context, customerID uuid.UUID, itemID uuid.UUID, req UpdateCartItemRequest) (*CartDTO, error) {
	if req.Quantity <= 0 {
		return nil, fmt.Errorf("quantity must be positive")
	}

	err := s.repo.UpdateCartItemQty(ctx, itemID, req.Quantity, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to update cart item: %w", err)
	}

	return s.GetCart(ctx, customerID)
}

// RemoveCartItem removes an item from the cart.
func (s *Service) RemoveCartItem(ctx context.Context, customerID uuid.UUID, itemID uuid.UUID) (*CartDTO, error) {
	err := s.repo.RemoveCartItem(ctx, itemID, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to remove cart item: %w", err)
	}
	return s.GetCart(ctx, customerID)
}

// Checkout converts the current cart into an order, then clears the cart.
func (s *Service) Checkout(ctx context.Context, customerID uuid.UUID, req CheckoutRequest) (*CheckoutResponse, error) {
	cart, err := s.GetCart(ctx, customerID)
	if err != nil {
		return nil, err
	}

	if len(cart.Items) == 0 {
		return nil, fmt.Errorf("cart is empty")
	}

	// Build order request from cart — PriceEach is now int64 cents
	lines := make([]order.OrderLineRequest, 0, len(cart.Items))
	for _, item := range cart.Items {
		lines = append(lines, order.OrderLineRequest{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
			PriceEach: int64(math.Round(item.UnitPrice * 100)), // TODO: align with int64 cents — cart UnitPrice is still float64 dollars
		})
	}

	orderReq := order.CreateOrderRequest{
		CustomerID: customerID,
		Lines:      lines,
	}

	newOrder, err := s.orderSvc.CreateOrder(ctx, orderReq)
	if err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	// Clear cart after successful order
	if clearErr := s.repo.ClearCart(ctx, cart.ID); clearErr != nil {
		s.logger.Error("Failed to clear cart after checkout", "cart_id", cart.ID, "error", clearErr)
	}

	s.logger.Info("Portal checkout complete",
		"customer_id", customerID,
		"order_id", newOrder.ID,
		"items", len(lines),
		"delivery_method", req.DeliveryMethod,
	)

	return &CheckoutResponse{
		OrderID: newOrder.ID,
		Message: "Order placed successfully",
	}, nil
}

// Ensure imported packages are used.
var (
	_ = (*order.Service)(nil)
	_ = (*customer.Service)(nil)
)
