package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gablelbm/gable/internal/ai"
	"github.com/gablelbm/gable/internal/account"
	"github.com/gablelbm/gable/internal/ap"
	"github.com/gablelbm/gable/internal/bankrecon"
	"github.com/gablelbm/gable/internal/config"
	"github.com/gablelbm/gable/internal/configurator"
	"github.com/gablelbm/gable/internal/crm"
	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/dashboard"
	"github.com/gablelbm/gable/internal/delivery"
	"github.com/gablelbm/gable/internal/document"
	"github.com/gablelbm/gable/internal/edi"
	"github.com/gablelbm/gable/internal/gl"
	"github.com/gablelbm/gable/internal/governance"
	"github.com/gablelbm/gable/internal/integrations"
	glint "github.com/gablelbm/gable/internal/integrations/gl"
	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/invoice"
	"github.com/gablelbm/gable/internal/location"
	"github.com/gablelbm/gable/internal/matching"
	"github.com/gablelbm/gable/internal/millwork"
	"github.com/gablelbm/gable/internal/notification"
	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/internal/parsing"
	"github.com/gablelbm/gable/internal/pim"
	"github.com/gablelbm/gable/internal/partner"
	"github.com/gablelbm/gable/internal/payment"
	"github.com/gablelbm/gable/internal/portal"
	"github.com/gablelbm/gable/internal/pos"
	"github.com/gablelbm/gable/internal/pricing"
	"github.com/gablelbm/gable/internal/product"
	"github.com/gablelbm/gable/internal/project"
	"github.com/gablelbm/gable/internal/purchase_order"
	"github.com/gablelbm/gable/internal/quote"
	"github.com/gablelbm/gable/internal/reporting"
	"github.com/gablelbm/gable/internal/salesteam"
	"github.com/gablelbm/gable/internal/tax"
	"github.com/gablelbm/gable/internal/techadmin"
	"github.com/gablelbm/gable/internal/vendor"
	"github.com/gablelbm/gable/internal/vision"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

func main() {
	// 1. Setup Structured Logging (JSON)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// 2. Load Config
	cfg, err := config.Load()
	if err != nil {
		logger.Error("Configuration error", "error", err)
		os.Exit(1)
	}
	logger.Info("Starting server...", "port", cfg.Port)

	// 3. Database Connection
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		logger.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("Connected to database")

	// 4. Initialize Auth Middleware
	// If JWKS_URL is not set, we warn but allow startup (partial zero trust or dev mode)
	// For Strict Mode, we would exit.
	var authMw *middleware.AuthMiddleware
	if cfg.JWKSURL != "" {
		logger.Info("Initializing Auth Middleware", "jwks_url", cfg.JWKSURL)
		am, err := middleware.NewAuthMiddleware(context.Background(), middleware.AuthConfig{
			JWKSURL:     cfg.JWKSURL,
			Issuer:      cfg.AuthIssuer,
			PublicPaths: []string{"/health", "/api/portal/v1/login", "/api/portal/v1/config"},
		}, logger)
		if err != nil {
			logger.Error("Failed to initialize Auth Middleware", "error", err)
			os.Exit(1)
		}
		authMw = am
	} else {
		logger.Warn("NO JWKS_URL SET: AUTHENTICATION IS DISABLED (Use only for local dev)")
	}

	// 5. Setup Router & Modules
	mux := http.NewServeMux()

	// Initialize Modules

	// Product Module
	productRepo := product.NewRepository(db)
	productSvc := product.NewService(productRepo)
	productHandler := product.NewHandler(productSvc)
	productHandler.RegisterRoutes(mux)

	// AI Key Store — centralized key management (DB-first, env fallback)
	// Admin users can set the Anthropic key via Tech Admin > AI Settings,
	// which powers all AI features (material list parsing, PIM, etc.)
	aiKeyStore := ai.NewKeyStore(db.Pool, "anthropic_api_key", cfg.AnthropicAPIKey)
	claudeClient := ai.NewClientWithKeyStore(aiKeyStore)
	if cfg.AnthropicAPIKey != "" {
		logger.Info("Claude AI initialized (env key present, admin can override via settings)")
	} else {
		logger.Info("Claude AI initialized (no env key — admin can configure via Tech Admin > AI Settings)")
	}

	// AI Parsing Module (Material List Intake)
	parsingSvc := parsing.NewService(productRepo, claudeClient)
	parsingHandler := parsing.NewHandler(parsingSvc)
	parsingHandler.RegisterRoutes(mux)

	// Gemini Key Store — for image generation via Google Gemini
	geminiKeyStore := ai.NewKeyStore(db.Pool, "gemini_api_key", cfg.GeminiAPIKey)
	if cfg.GeminiAPIKey != "" {
		logger.Info("Gemini AI initialized (env key present, admin can override via settings)")
	} else {
		logger.Info("Gemini AI initialized (no env key — admin can configure via Tech Admin > AI Settings)")
	}

	// PIM Module (AI-Powered Product Information Management)
	pimRepo := pim.NewRepository(db)
	pimSvc := pim.NewService(pimRepo, productSvc)

	// PIM text AI (Anthropic Claude) — uses KeyStore for dynamic key resolution
	pimSvc.WithTextAI(pim.NewTextAIClientWithKeyStore(aiKeyStore, cfg.AnthropicModel))

	// PIM image AI — always attach KeyStore for dynamic resolution, then try eager init
	pimSvc.WithGeminiKeyStore(geminiKeyStore)
	geminiKey := geminiKeyStore.Get(context.Background())
	if geminiKey != "" {
		pimSvc.WithGeminiAI(pim.NewGeminiImageClient(geminiKey))
		logger.Info("PIM image AI (Gemini) initialized")
	} else if cfg.StabilityAPIKey != "" {
		pimSvc.WithImageAI(pim.NewImageAIClient(cfg.StabilityAPIKey))
		logger.Info("PIM image AI (Stability) initialized")
	} else {
		logger.Info("PIM image AI: will resolve dynamically from KeyStore (configure via Tech Admin > AI Settings)")
	}

	pimHandler := pim.NewHandler(pimSvc)
	pimHandler.RegisterRoutes(mux)

	locationHandler := location.NewHandler(location.NewService(location.NewRepository(db)))
	locationHandler.RegisterRoutes(mux)

	// Inventory Service needs to be shared to Order Service
	inventoryRepo := inventory.NewRepository(db)
	inventorySvc := inventory.NewService(inventoryRepo)
	inventoryHandler := inventory.NewHandler(inventorySvc)
	inventoryHandler.RegisterRoutes(mux)

	customerRepo := customer.NewRepository(db)
	customerSvc := customer.NewService(customerRepo)
	customerHandler := customer.NewHandler(customerSvc)
	customerHandler.RegisterRoutes(mux)

	// Sales Team Module
	salesTeamRepo := salesteam.NewRepository(db)
	salesTeamHandler := salesteam.NewHandler(salesTeamRepo)
	salesTeamHandler.RegisterRoutes(mux)

	// CRM Module
	crmRepo := crm.NewRepository(db)
	crmHandler := crm.NewHandler(crmRepo)
	crmHandler.RegisterRoutes(mux)

	// Account Module
	accountRepo := account.NewRepository(db)
	accountSvc := account.NewService(accountRepo, db, logger)
	accountHandler := account.NewHandler(accountSvc)
	accountHandler.RegisterRoutes(mux)

	quoteRepo := quote.NewRepository(db)
	quoteSvc := quote.NewService(quoteRepo)
	quoteHandler := quote.NewHandler(quoteSvc)
	quoteHandler.RegisterRoutes(mux)

	// GL Module (Full General Ledger)
	glAdapter := glint.NewMockGLAdapter()
	glRepo := gl.NewRepository(db)
	glSvc := gl.NewService(glRepo, glAdapter, logger)
	glHandler := gl.NewHandler(glSvc)
	glHandler.RegisterRoutes(mux)

	// Invoice Module
	invoiceRepo := invoice.NewRepository(db)
	invoiceSvc := invoice.NewService(invoiceRepo, glSvc, accountSvc)
	invoiceHandler := invoice.NewHandler(invoiceSvc)
	invoiceHandler.RegisterRoutes(mux)

	// Pricing Module
	pricingRepo := pricing.NewRepository(db)
	pricingSvc := pricing.NewService(pricingRepo)
	pricingHandler := pricing.NewHandler(pricingSvc, customerSvc, productSvc)
	pricingHandler.RegisterRoutes(mux)

	// Category Pricing Engine (feature-flagged)
	if strings.EqualFold(os.Getenv("CATEGORY_PRICING_ENABLED"), "true") {
		catPricingRepo := pricing.NewCategoryRepository(db)
		catPricingSvc := pricing.NewCategoryPricingService(catPricingRepo)
		pricingSvc.WithCategoryPricing(catPricingSvc)

		catPricingHandler := pricing.NewCategoryHandler(catPricingSvc, customerSvc)
		catPricingHandler.RegisterCategoryRoutes(mux, middleware.RequireRole("admin", "owner"))

		logger.Info("Category-based pricing engine enabled")
	} else {
		logger.Info("Category-based pricing disabled (set CATEGORY_PRICING_ENABLED=true to enable)")
	}

	// Rebate Module
	rebateRepo := pricing.NewRebateRepository(db)
	rebateSvc := pricing.NewRebateService(rebateRepo)
	rebateHandler := pricing.NewRebateHandler(rebateSvc)
	rebateHandler.RegisterRoutes(mux)

	// Escalator Pricing Module (Market Indices + Price Escalators)
	escalatorRepo := pricing.NewEscalatorRepository(db)
	escalatorSvc := pricing.NewEscalatorService(escalatorRepo)
	escalatorHandler := pricing.NewEscalatorHandler(escalatorSvc)
	escalatorHandler.RegisterRoutes(mux)

	// Vendor Module
	vendorRepo := vendor.NewRepository(db)
	vendorSvc := vendor.NewService(vendorRepo)
	vendorHandler := vendor.NewHandler(vendorSvc)
	vendorHandler.RegisterRoutes(mux)

	// Order Module - injected with InventoryService and InvoiceService
	orderRepo := order.NewRepository(db)
	poRepo := purchase_order.NewRepository(db)

	// EDI Module
	ediSvc := edi.NewService("./edi_out", logger) // Stub output dir

	poSvc := purchase_order.NewService(poRepo, ediSvc, inventorySvc, productSvc, vendorSvc)
	poSvc.WithAIClient(claudeClient)
	poRecSvc := purchase_order.NewRecommendationService(poRepo, inventorySvc, productSvc, vendorSvc)
	poHandler := purchase_order.NewHandler(poSvc, poRecSvc)
	poHandler.RegisterRoutes(mux)

	// Auto-PO: wire quote service to create POs when quotes are accepted
	quoteSvc.WithAutoPO(&autoPOAdapter{poSvc: poSvc, productSvc: productSvc})

	// Buying Group EDI Service (832/846 catalog sync)
	bgSvc := edi.NewBuyingGroupService(logger)

	// EDI Trading Partner Admin (vendor-agnostic)
	ediRepo := edi.NewEDIRepository(db)
	ediHandler := edi.NewEDIHandler(ediRepo, bgSvc, ediSvc)
	// Auth: EDI routes protected by global JWT middleware (see finalHandler wrapping below)
	ediHandler.RegisterRoutes(mux)

	orderSvc := order.NewService(orderRepo, inventorySvc, invoiceSvc, customerSvc, poSvc)
	orderHandler := order.NewHandler(orderSvc)
	orderHandler.RegisterRoutes(mux)

	// Notification Module
	emailSvc := notification.NewLogEmailService(logger)

	// Document Module
	docSvc := document.NewService(productRepo)
	docHandler := document.NewHandler(docSvc, orderSvc, invoiceSvc, customerSvc, emailSvc)
	docHandler.RegisterRoutes(mux)

	// Payment Module (with Run Payments gateway)
	paymentRepo := payment.NewRepository(db)
	paymentSvc := payment.NewService(db, paymentRepo, invoiceRepo, accountSvc)

	// Wire Run Payments gateway if API key is configured
	if cfg.RunPaymentsAPIKey != "" {
		rpGateway := payment.NewRunPaymentsGateway(payment.GatewayConfig{
			APIKey:      cfg.RunPaymentsAPIKey,
			PublicKey:   cfg.RunPaymentsPublicKey,
			BaseURL:     cfg.RunPaymentsBaseURL,
			Environment: cfg.RunPaymentsEnvironment,
		}, logger)
		paymentSvc.WithGateway(rpGateway, cfg.RunPaymentsPublicKey)
		logger.Info("Run Payments gateway initialized", "environment", cfg.RunPaymentsEnvironment)
	} else {
		logger.Warn("RUN_PAYMENTS_API_KEY not set — card payments disabled (cash/check/account only)")
	}

	paymentHandler := payment.NewHandler(paymentSvc)
	paymentHandler.RegisterRoutes(mux)

	// POS Module (Retail Counter Sales)
	posRepo := pos.NewRepository(db)
	posSvc := pos.NewService(db, posRepo, productSvc, inventorySvc, invoiceSvc, paymentSvc, logger)
	posSvc.WithPricing(&posCalcAdapter{pricingSvc: pricingSvc, customerSvc: customerSvc})
	posHandler := pos.NewHandler(posSvc)
	posHandler.RegisterRoutes(mux)

	// Accounts Payable Module
	apRepo := ap.NewRepository(db)
	apSvc := ap.NewService(db, apRepo, glSvc, logger)
	apHandler := ap.NewHandler(apSvc)
	apHandler.RegisterRoutes(mux)

	// 3-Way PO Matching Module
	matchingRepo := matching.NewRepository(db)
	matchingSvc := matching.NewService(db, matchingRepo, poSvc, apSvc, logger)
	matchingHandler := matching.NewHandler(matchingSvc)
	matchingHandler.RegisterRoutes(mux)

	// Bank Reconciliation Module
	bankreconRepo := bankrecon.NewRepository(db)
	bankreconSvc := bankrecon.NewService(db, bankreconRepo, glSvc, logger)
	bankreconHandler := bankrecon.NewHandler(bankreconSvc)
	bankreconHandler.RegisterRoutes(mux)

	// Reporting Module
	reportingRepo := reporting.NewRepository(db)
	reportingSvc := reporting.NewService(reportingRepo)
	reportingHandler := reporting.NewHandler(reportingSvc)
	reportingHandler.RegisterRoutes(mux)

	// Sales Tax Module (Avalara AvaTax)
	taxExemptionRepo := tax.NewExemptionRepo(db)
	var avalaraClient *tax.AvalaraClient
	if cfg.AvalaraAccountID != "" {
		avalaraClient = tax.NewAvalaraClient(tax.AvalaraConfig{
			AccountID:   cfg.AvalaraAccountID,
			LicenseKey:  cfg.AvalaraLicenseKey,
			Environment: cfg.AvalaraEnvironment,
			CompanyCode: cfg.AvalaraCompanyCode,
		}, logger)
		logger.Info("Avalara AvaTax initialized", "environment", cfg.AvalaraEnvironment)
	} else {
		logger.Warn("AVALARA_ACCOUNT_ID not set — using flat-rate tax fallback (0%)")
	}
	taxSvc := tax.NewService(taxExemptionRepo, avalaraClient, cfg.AvalaraCompanyCode, 0.0, logger)
	taxHandler := tax.NewHandler(taxSvc)
	taxHandler.RegisterRoutes(mux)

	// Delivery Module
	deliveryRepo := delivery.NewRepository(db)
	deliverySvc := delivery.NewService(deliveryRepo)

	// Wire Google Maps for route optimization if API key is set
	if cfg.GoogleMapsAPIKey != "" {
		mapsClient := delivery.NewMapsClient(cfg.GoogleMapsAPIKey, logger)
		deliverySvc.WithMaps(mapsClient, logger)
		logger.Info("Google Maps route optimization enabled")
	} else {
		logger.Warn("GOOGLE_MAPS_API_KEY not set — using mock route optimization")
	}

	deliveryHandler := delivery.NewHandler(deliverySvc)
	deliveryHandler.RegisterRoutes(mux)

	// SMS Notification Service
	var smsSvc notification.SMSService
	if cfg.TwilioAccountSID != "" {
		smsSvc = notification.NewTwilioSMSService(notification.TwilioConfig{
			AccountSID: cfg.TwilioAccountSID,
			AuthToken:  cfg.TwilioAuthToken,
			FromNumber: cfg.TwilioFromNumber,
		}, logger)
		logger.Info("Twilio SMS service initialized")
	} else {
		smsSvc = notification.NewLogSMSService(logger)
		logger.Warn("TWILIO_ACCOUNT_SID not set — using mock SMS service")
	}

	// Delivery Notification Orchestrator
	deliveryNotifier := notification.NewDeliveryNotifier(smsSvc, emailSvc, logger)
	deliverySvc.WithNotifier(&deliveryNotifierAdapter{notifier: deliveryNotifier})

	// Wire invoice service for auto-invoicing on delivery POD
	deliverySvc.WithInvoiceService(&invoiceServiceAdapter{invoiceSvc: invoiceSvc, orderSvc: orderSvc})

	// Millwork Module
	millworkRepo := millwork.NewRepository(db)
	millworkSvc := millwork.NewService(millworkRepo)
	millworkHandler := millwork.NewHandler(millworkSvc)
	millworkHandler.RegisterRoutes(mux)

	// Configurator Module (Sprint 19: Product Configurator)
	configuratorRepo := configurator.NewRepository(db)
	configuratorSvc := configurator.NewService(configuratorRepo)
	configuratorHandler := configurator.NewHandler(configuratorSvc)
	configuratorHandler.RegisterRoutes(mux)

	// AI Vision Module (Sprint 19: Blueprint Verification Prototype)
	visionSvc := vision.NewService()
	visionHandler := vision.NewHandler(visionSvc)
	visionHandler.RegisterRoutes(mux)

	// Governance Module
	governanceRepo := governance.NewRepository(db)
	aiProvider := governance.NewTemplateAIProvider()
	governanceSvc := governance.NewService(governanceRepo, aiProvider)
	governanceHandler := governance.NewHandler(governanceSvc)
	governanceHandler.RegisterRoutes(mux)

	// Partner Module
	partnerSvc := partner.NewService(customerRepo, quoteRepo, logger)
	partnerHandler := partner.NewHandler(partnerSvc)
	partnerAuthMw := middleware.NewPartnerAuthMiddleware(customerRepo, logger)
	partnerHandler.RegisterRoutes(mux, partnerAuthMw.Handler)

	// Dashboard Module (Executive Analytics)
	dashboardRepo := dashboard.NewRepository(db)
	dashboardSvc := dashboard.NewService(dashboardRepo)
	dashboardHandler := dashboard.NewHandler(dashboardSvc)
	dashboardHandler.RegisterRoutes(mux)

	// Tech Admin Module
	techAdminRepo := techadmin.NewRepository(db.Pool)
	techAdminSvc := techadmin.NewService(techAdminRepo)
	techAdminHandler := techadmin.NewHandler(techAdminSvc)
	techAdminHandler.WithAIKeyStore(aiKeyStore)
	techAdminHandler.WithGeminiKeyStore(geminiKeyStore)
	techAdminHandler.RegisterRoutes(mux)

	// Portal Module (Sovereign Dealer Portal)
	portalRepo := portal.NewRepository(db)
	portalSvc := portal.NewService(portalRepo, logger, pricingSvc, customerSvc, inventorySvc, orderSvc, productSvc)
	portalHandler := portal.NewHandler(portalSvc)

	// In dev/demo mode (no JWKS_URL), bypass portal auth and inject demo claims
	var portalMw func(http.Handler) http.Handler
	if cfg.JWKSURL == "" {
		logger.Warn("DEMO MODE: Portal auth bypassed — injecting demo customer claims")
		// Query first customer from DB for demo claims
		var demoCustomerID uuid.UUID
		row := db.Pool.QueryRow(context.Background(), "SELECT id FROM customers LIMIT 1")
		if err := row.Scan(&demoCustomerID); err != nil {
			logger.Error("Failed to load demo customer", "error", err)
			demoCustomerID = uuid.New() // Fallback
		}
		portalMw = func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				claims := &middleware.PortalClaims{
					CustomerID: demoCustomerID,
					Email:      "demo@gable.com",
					Name:       "Demo Contractor",
				}
				ctx := context.WithValue(r.Context(), middleware.PortalClaimsKey, claims)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		}
	} else {
		portalJWTSecret := os.Getenv("PORTAL_JWT_SECRET")
		if portalJWTSecret == "" {
			portalJWTSecret = "portal-dev-secret-change-in-production"
		}
		portalAuthMw := middleware.NewPortalAuthMiddleware([]byte(portalJWTSecret), logger)
		portalMw = portalAuthMw.Handler
	}
	portalHandler.RegisterRoutes(mux, portalMw)

	// Project Module (Sprint 34: Project Management Dashboard)
	projectRepo := project.NewRepository(db)
	projectSvc := project.NewService(projectRepo)
	projectHandler := project.NewHandler(projectSvc)
	projectHandler.RegisterRoutes(mux, portalMw)

	// Integration API (FB-Brain cross-system endpoints)
	integrationHandler := integrations.NewHandler(db, pricingSvc, quote.NewService(quoteRepo), orderSvc, customerSvc, productSvc)
	integrationHandler.RegisterRoutes(mux)

	// F-04: FB Brain Integration — all Brain components gated behind FBBrainEnabled kill switch
	if cfg.FBBrainEnabled {
		logger.Info("FB Brain integration enabled", "base_url", cfg.FBBrainBaseURL)

		// Maestro AI Gateway — routes AI calls through Brain for metering
		maestroClient := ai.NewMaestroClient(cfg.FBBrainBaseURL, logger)
		_ = maestroClient // Available for AI module injection

		// Brain Notifier — sends financial events (invoice payments) to Brain
		brainNotifier := payment.NewBrainNotifier(cfg.FBBrainBaseURL, cfg.FBBrainIntegrationKey, logger)
		paymentSvc.WithBrainNotifier(brainNotifier, cfg.FBBrainOrgID)

		// A2A Receiver — inbound purchase order webhooks from Brain
		if cfg.FBBrainPublicKeyPath != "" {
			brainPubKey, err := purchase_order.LoadBrainPublicKey(cfg.FBBrainPublicKeyPath)
			if err != nil {
				logger.Error("Failed to load Brain public key for A2A receiver", "error", err, "path", cfg.FBBrainPublicKeyPath)
			} else {
				a2aReceiver := purchase_order.NewA2AReceiver(brainPubKey, poSvc, db.Pool, logger)
				mux.HandleFunc("POST /api/v1/a2a/purchase-order", a2aReceiver.ReceiveWebhook)
				logger.Info("A2A purchase order receiver mounted", "path", "/api/v1/a2a/purchase-order")
			}
		} else {
			logger.Warn("FB_BRAIN_PUBLIC_KEY_PATH not set — A2A receiver disabled (no JWS verification key)")
		}
	} else {
		logger.Info("FB Brain integration disabled (FB_BRAIN_ENABLED=false)")
	}

	// Static file serving for uploaded photos
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))

	// Health Check (Public?)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		status := "ok"
		dbStatus := "connected"
		if err := db.Pool.Ping(r.Context()); err != nil {
			status = "error"
			dbStatus = "disconnected"
			logger.Error("Health check failed", "error", err)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": status, "db": dbStatus})
	})

	// 6. Wrap Middleware
	var finalHandler http.Handler = mux
	finalHandler = middleware.CORSMiddleware(finalHandler)
	if authMw != nil {
		// Wrap with Auth
		finalHandler = authMw.Handler(finalHandler)
	}

	// Add Logger Middleware (Access Logs)
	finalHandler = RequestLogger(logger, finalHandler)

	// 7. Start Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: finalHandler,
	}

	// Run server in goroutine
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("Server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal using a buffered channel
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server...")

	// Create a deadline to wait for
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("Server exiting")
}

// deliveryNotifierAdapter bridges delivery.DeliveryNotifierInterface and notification.DeliveryNotifier.
type deliveryNotifierAdapter struct {
	notifier *notification.DeliveryNotifier
}

func (a *deliveryNotifierAdapter) Notify(ctx context.Context, event delivery.DeliveryEvent) {
	a.notifier.Notify(ctx, notification.DeliveryEvent{
		EventType:     notification.DeliveryEventType(event.EventType),
		DeliveryID:    event.DeliveryID,
		OrderNumber:   event.OrderNumber,
		CustomerName:  event.CustomerName,
		CustomerPhone: event.CustomerPhone,
		CustomerEmail: event.CustomerEmail,
		ETA:           event.ETA,
		ReceiptURL:    event.ReceiptURL,
	})
}

// RequestLogger logs incoming requests
func RequestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		// Wrap writer to capture status if needed (omitted for brevity, assume 200/error handled)
		next.ServeHTTP(w, r)
		logger.Info("Request processed",
			"method", r.Method,
			"path", r.URL.Path,
			"duration", time.Since(start).String(),
			"remote_addr", r.RemoteAddr,
		)
	})
}

// invoiceServiceAdapter bridges invoice.Service to delivery.InvoiceServiceInterface.
type invoiceServiceAdapter struct {
	invoiceSvc *invoice.Service
	orderSvc   *order.Service
}

func (a *invoiceServiceAdapter) CreateFromOrder(ctx context.Context, orderID uuid.UUID) error {
	ord, err := a.orderSvc.GetOrder(ctx, orderID)
	if err != nil {
		return fmt.Errorf("get order for invoice: %w", err)
	}

	// Build invoice from order
	var lines []invoice.InvoiceLine
	for _, ol := range ord.Lines {
		lines = append(lines, invoice.InvoiceLine{
			ProductID: ol.ProductID,
			Quantity:  ol.Quantity,
			PriceEach: int64(ol.PriceEach * 100), // dollars to cents
		})
	}

	inv := &invoice.Invoice{
		CustomerID: ord.CustomerID,
		OrderID:    ord.ID,
		Lines:      lines,
	}

	return a.invoiceSvc.CreateInvoice(ctx, inv)
}

// autoPOAdapter bridges purchase_order.Service to quote.AutoPOService.
type autoPOAdapter struct {
	poSvc      *purchase_order.Service
	productSvc *product.Service
}

func (a *autoPOAdapter) CreatePOFromSpecialOrderLine(ctx context.Context, productID uuid.UUID, vendorID *uuid.UUID, quantity float64, unitCost float64, linkedSOLineID uuid.UUID) error {
	// Resolve product description for the PO line
	desc := productID.String()
	if a.productSvc != nil {
		p, err := a.productSvc.GetProduct(ctx, productID)
		if err == nil && p != nil {
			desc = fmt.Sprintf("%s - %s", p.SKU, p.Description)
		}
	}
	return a.poSvc.CreateFromSOLine(ctx, linkedSOLineID, vendorID, desc, quantity, unitCost)
}

// posCalcAdapter bridges pricing.Service + customer.Service to pos.PriceCalculator.
type posCalcAdapter struct {
	pricingSvc  *pricing.Service
	customerSvc *customer.Service
}

func (a *posCalcAdapter) CalculateItemPrice(ctx context.Context, customerID uuid.UUID, productID uuid.UUID, basePrice float64, quantity float64) (float64, error) {
	cust, err := a.customerSvc.GetCustomer(ctx, customerID)
	if err != nil {
		return basePrice, nil // Fallback to base price if customer lookup fails
	}
	cp, err := a.pricingSvc.CalculatePriceWithQty(ctx, cust, productID, basePrice, quantity, nil)
	if err != nil {
		return basePrice, nil
	}
	return cp.FinalPrice, nil
}
