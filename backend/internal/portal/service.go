package portal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/internal/pricing"
	"github.com/gablelbm/gable/internal/product"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Service encapsulates portal business logic.
type Service struct {
	repo         *Repository
	jwtSecret    []byte
	logger       *slog.Logger
	pricingSvc   *pricing.Service
	customerSvc  *customer.Service
	inventorySvc *inventory.Service
	orderSvc     *order.Service
	productSvc   *product.Service
}

// NewService creates a new portal service.
// jwtSecret must be provided and non-empty; callers should fail startup if not configured.
func NewService(
	repo *Repository,
	jwtSecret string,
	logger *slog.Logger,
	pricingSvc *pricing.Service,
	customerSvc *customer.Service,
	inventorySvc *inventory.Service,
	orderSvc *order.Service,
	productSvc *product.Service,
) *Service {
	return &Service{
		repo:         repo,
		jwtSecret:    []byte(jwtSecret),
		logger:       logger,
		pricingSvc:   pricingSvc,
		customerSvc:  customerSvc,
		inventorySvc: inventorySvc,
		orderSvc:     orderSvc,
		productSvc:   productSvc,
	}
}

// PortalClaims holds JWT claims for portal auth.
type PortalClaims struct {
	jwt.RegisteredClaims
	CustomerID     uuid.UUID `json:"customer_id"`
	CustomerUserID uuid.UUID `json:"customer_user_id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Role           string    `json:"role"`
}

// LoginResult holds the login response and the raw JWT token (for cookie delivery).
type LoginResult struct {
	Response *LoginResponse
	Token    string
}

// Login authenticates a customer user and returns a LoginResult.
// The token is returned separately so the handler can set it as a cookie
// without exposing it in the JSON response body.
func (s *Service) Login(ctx context.Context, req LoginRequest) (*LoginResult, error) {
	user, err := s.repo.GetCustomerUserByEmail(ctx, req.Email)
	if err != nil {
		s.logger.Warn("Portal login: user not found", "email", req.Email)
		return nil, fmt.Errorf("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		s.logger.Warn("Portal login: invalid password", "email", req.Email)
		return nil, fmt.Errorf("invalid credentials")
	}

	// Generate JWT
	now := time.Now()
	claims := PortalClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			Issuer:    "gable-portal",
		},
		CustomerID:     user.CustomerID,
		CustomerUserID: user.ID,
		Email:          user.Email,
		Name:           user.Name,
		Role:           user.Role,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(s.jwtSecret)
	if err != nil {
		s.logger.Error("Portal login: failed to sign JWT", "error", err)
		return nil, fmt.Errorf("authentication failed")
	}

	// Get portal config for branding
	cfg, err := s.repo.GetPortalConfig(ctx)
	if err != nil {
		s.logger.Error("Portal login: failed to get config", "error", err)
		return nil, fmt.Errorf("authentication failed")
	}

	s.logger.Info("Portal login success", "email", req.Email, "customer_id", user.CustomerID)

	return &LoginResult{
		Response: &LoginResponse{
			User:   *user,
			Config: *cfg,
		},
		Token: tokenStr,
	}, nil
}

// GetConfig returns portal branding config (public).
func (s *Service) GetConfig(ctx context.Context) (*PortalConfig, error) {
	return s.repo.GetPortalConfig(ctx)
}

// GetDashboard returns the contractor dashboard data.
func (s *Service) GetDashboard(ctx context.Context, customerID uuid.UUID) (*PortalDashboardDTO, error) {
	balance, creditLimit, pastDue, err := s.repo.GetCustomerARSummary(ctx, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to load dashboard: %w", err)
	}

	orders, err := s.repo.ListOrdersByCustomer(ctx, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to load recent orders: %w", err)
	}

	// Limit to 5 most recent for dashboard
	recentOrders := orders
	if len(recentOrders) > 5 {
		recentOrders = recentOrders[:5]
	}

	return &PortalDashboardDTO{
		BalanceDue:   balance,
		CreditLimit:  creditLimit,
		PastDue:      pastDue,
		RecentOrders: recentOrders,
	}, nil
}

// ListOrders returns all orders for a customer.
func (s *Service) ListOrders(ctx context.Context, customerID uuid.UUID) ([]PortalOrderDTO, error) {
	return s.repo.ListOrdersByCustomer(ctx, customerID)
}

// GetOrder returns a single order scoped to a customer.
func (s *Service) GetOrder(ctx context.Context, orderID, customerID uuid.UUID) (*PortalOrderDTO, error) {
	return s.repo.GetOrderByIDAndCustomer(ctx, orderID, customerID)
}

// ListInvoices returns all invoices for a customer.
func (s *Service) ListInvoices(ctx context.Context, customerID uuid.UUID) ([]PortalInvoiceDTO, error) {
	return s.repo.ListInvoicesByCustomer(ctx, customerID)
}

// GetInvoice returns a single invoice scoped to a customer.
func (s *Service) GetInvoice(ctx context.Context, invoiceID, customerID uuid.UUID) (*PortalInvoiceDTO, error) {
	return s.repo.GetInvoiceByIDAndCustomer(ctx, invoiceID, customerID)
}

// ListDeliveries returns all deliveries for a customer.
func (s *Service) ListDeliveries(ctx context.Context, customerID uuid.UUID) ([]PortalDeliveryDTO, error) {
	return s.repo.ListDeliveriesByCustomer(ctx, customerID)
}

// GetDelivery returns a single delivery scoped to a customer.
func (s *Service) GetDelivery(ctx context.Context, deliveryID, customerID uuid.UUID) (*PortalDeliveryDTO, error) {
	return s.repo.GetDeliveryByIDAndCustomer(ctx, deliveryID, customerID)
}

// CreateReorder duplicates a historical order as a new DRAFT.
func (s *Service) CreateReorder(ctx context.Context, customerID uuid.UUID, req ReorderRequest) (*ReorderResponse, error) {
	newOrderID, err := s.repo.CreateReorder(ctx, customerID, req.OrderID)
	if err != nil {
		return nil, fmt.Errorf("failed to create reorder: %w", err)
	}

	s.logger.Info("Portal reorder created", "customer_id", customerID, "source_order", req.OrderID, "new_order", newOrderID)

	return &ReorderResponse{
		OrderID: newOrderID,
		Message: "Order draft created successfully",
	}, nil
}

// ParseToken parses and validates a portal JWT. Used by middleware.
func (s *Service) ParseToken(tokenStr string) (*PortalClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &PortalClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*PortalClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}
