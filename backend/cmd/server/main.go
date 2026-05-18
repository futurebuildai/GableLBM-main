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
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/metrics"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	startTime := time.Now()

	// 1. Setup Structured Logging (JSON) with configurable level
	logLevel := new(slog.LevelVar)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	// 2. Load Config
	cfg, err := config.Load()
	if err != nil {
		logger.Error("Configuration error", "error", err)
		os.Exit(1)
	}
	// Configure log level
	switch strings.ToUpper(cfg.LogLevel) {
	case "DEBUG":
		logLevel.Set(slog.LevelDebug)
	case "WARN":
		logLevel.Set(slog.LevelWarn)
	case "ERROR":
		logLevel.Set(slog.LevelError)
	default:
		logLevel.Set(slog.LevelInfo)
	}

	// Validate CORS_ORIGINS in production mode (fail-closed like JWKS_URL)
	if !strings.EqualFold(cfg.AuthMode, "dev") && os.Getenv("CORS_ORIGINS") == "" {
		logger.Error("CORS_ORIGINS not set and AUTH_MODE != dev; set CORS_ORIGINS for production or AUTH_MODE=dev for development")
		os.Exit(1)
	}

	logger.Info("Starting server...", "port", cfg.Port, "auth_mode", cfg.AuthMode, "log_level", cfg.LogLevel)

	// 3. Database Connection
	db, err := database.Connect(cfg.DatabaseURL, database.PoolConfig{
		MaxConns:          cfg.DBMaxConns,
		MinConns:          cfg.DBMinConns,
		MaxConnLifetime:   time.Duration(cfg.DBMaxConnLifetime) * time.Minute,
		MaxConnIdleTime:   30 * time.Minute,
		HealthCheckPeriod: 1 * time.Minute,
	})
	if err != nil {
		logger.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("Connected to database")

	// 3b. Initialize Prometheus Metrics
	metrics.Register()
	metricsCtx, metricsCancel := context.WithCancel(context.Background())
	defer metricsCancel()
	metrics.StartDBPoolCollector(metricsCtx, db.Pool, 15*time.Second)
	logger.Info("Prometheus metrics initialized")

	// 3c. Initialize Audit Logger (financial operation tracking)
	auditLog := audit.NewLogger(db)
	logger.Info("Audit logger initialized")

	// 4. Initialize Auth Middleware
	// Fail-closed: JWKS_URL is required unless AUTH_MODE=dev is explicitly set.
	var authMw *middleware.AuthMiddleware
	if cfg.JWKSURL != "" {
		logger.Info("Initializing Auth Middleware", "jwks_url", cfg.JWKSURL)
		am, err := middleware.NewAuthMiddleware(context.Background(), middleware.AuthConfig{
			JWKSURL:     cfg.JWKSURL,
			Issuer:      cfg.AuthIssuer,
			PublicPaths: []string{"/health", "/healthz/live", "/healthz/ready", "/metrics", "/api/portal/v1/login", "/api/portal/v1/config", "/api/portal/v1/", "/api/integration/", "/api/v1/a2a/"},
		}, logger)
		if err != nil {
			logger.Error("Failed to initialize Auth Middleware", "error", err)
			os.Exit(1)
		}
		authMw = am
	} else if strings.EqualFold(cfg.AuthMode, "dev") {
		logger.Warn("AUTH_MODE=dev: authentication disabled (development only)")
	} else {
		logger.Error("JWKS_URL not set and AUTH_MODE != dev; set JWKS_URL for production or AUTH_MODE=dev for development")
		os.Exit(1)
	}

	// 4b. Branch Context Middleware — enforces multi-branch scoping per
	// the user_locations grant table. Controlled by system_settings keys
	// `multi_branch_enabled` (kill switch) and `default_branch_required`.
	branchMw := middleware.NewBranchMiddleware(db).Handler

	// scoped composes a role guard with the branch middleware. Use this for
	// any module group whose entities carry a branch_id.
	scoped := func(roles ...string) func(http.Handler) http.Handler {
		return middleware.Compose(middleware.RequireRole(roles...), branchMw)
	}

	// 5. Setup Router & Modules
	mux := http.NewServeMux()

	// Initialize Modules

	// Product Module
	productRepo := product.NewRepository(db)
	productSvc := product.NewService(productRepo)
	productHandler := product.NewHandler(productSvc)
	productHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales", "warehouse"))

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
	parsingHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales"))

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
	pimHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	locationSvc := location.NewService(location.NewRepository(db))
	locationUserRepo := location.NewUserRepository(db)
	locationHandler := location.NewHandler(
		locationSvc,
		locationUserRepo,
		middleware.RequireRole("admin", "owner"),
	)
	// Location routes are NOT branch-scoped at the middleware level: the
	// branch switcher must be able to fetch /me/branches before a branch
	// is selected, and branch CRUD endpoints don't operate on branch-scoped
	// data.
	locationHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "warehouse", "sales"))

	// Inventory Service needs to be shared to Order Service
	inventoryRepo := inventory.NewRepository(db)
	inventorySvc := inventory.NewService(inventoryRepo)
	inventoryHandler := inventory.NewHandler(inventorySvc)
	inventoryHandler.RegisterRoutes(mux, scoped("admin", "owner", "warehouse"))

	customerRepo := customer.NewRepository(db)
	customerSvc := customer.NewService(customerRepo)
	customerHandler := customer.NewHandler(customerSvc)
	customerHandler.RegisterRoutes(mux, scoped("admin", "owner", "sales"))

	// Sales Team Module
	salesTeamRepo := salesteam.NewRepository(db)
	salesTeamHandler := salesteam.NewHandler(salesTeamRepo)
	salesTeamHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales"))

	// CRM Module
	crmRepo := crm.NewRepository(db)
	crmHandler := crm.NewHandler(crmRepo)
	crmHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales"))

	// Account Module
	accountRepo := account.NewRepository(db)
	accountSvc := account.NewService(accountRepo, db, logger)
	accountHandler := account.NewHandler(accountSvc)
	accountHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales", "finance"))

	quoteRepo := quote.NewRepository(db)
	quoteSvc := quote.NewService(quoteRepo)
	quoteHandler := quote.NewHandler(quoteSvc)
	quoteHandler.RegisterRoutes(mux, scoped("admin", "owner", "sales"))

	// GL Module (Full General Ledger)
	glAdapter := glint.NewMockGLAdapter()
	glRepo := gl.NewRepository(db)
	glSvc := gl.NewService(glRepo, glAdapter, logger)
	glHandler := gl.NewHandler(glSvc)
	glHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	// Invoice Module
	invoiceRepo := invoice.NewRepository(db)
	invoiceSvc := invoice.NewService(invoiceRepo, glSvc, accountSvc, db)
	invoiceSvc.WithAuditLog(auditLog)
	invoiceHandler := invoice.NewHandler(invoiceSvc)
	invoiceHandler.RegisterRoutes(mux, scoped("admin", "owner", "sales", "finance"))

	// Pricing Module
	pricingRepo := pricing.NewRepository(db)
	pricingSvc := pricing.NewService(pricingRepo)
	pricingHandler := pricing.NewHandler(pricingSvc, customerSvc, productSvc)
	pricingHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

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
	rebateHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	// Escalator Pricing Module (Market Indices + Price Escalators)
	escalatorRepo := pricing.NewEscalatorRepository(db)
	escalatorSvc := pricing.NewEscalatorService(escalatorRepo)
	escalatorHandler := pricing.NewEscalatorHandler(escalatorSvc)
	escalatorHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	// Vendor Module
	vendorRepo := vendor.NewRepository(db)
	vendorSvc := vendor.NewService(vendorRepo)
	vendorHandler := vendor.NewHandler(vendorSvc)
	vendorHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "purchasing"))

	// Back-wire vendor service into product service so CreateProduct can
	// auto-resolve a free-text vendor name to a canonical vendor_id.
	productSvc.WithVendorService(vendorSvc)

	// Order Module - injected with InventoryService and InvoiceService
	orderRepo := order.NewRepository(db)
	poRepo := purchase_order.NewRepository(db)

	// EDI Module
	ediSvc := edi.NewService("/app/edi_out", logger) // Absolute path for container deployment

	poSvc := purchase_order.NewService(poRepo, db, ediSvc, inventorySvc, productSvc, vendorSvc)
	poSvc.WithAIClient(claudeClient)
	velocityRepo := purchase_order.NewVelocityRepository(db)
	poSvc.WithVelocityRepo(velocityRepo)
	poRecSvc := purchase_order.NewRecommendationService(poRepo, inventorySvc, productSvc, vendorSvc).
		WithVelocityRepo(velocityRepo)
	poHandler := purchase_order.NewHandler(poSvc, poRecSvc)
	poHandler.RegisterRoutes(mux, scoped("admin", "owner", "purchasing"))

	// Auto-reorder scheduler. Disabled by default; an operator activates it
	// by setting reorder.enabled=true in system_settings. Stops in step 3.5
	// of graceful shutdown (before DB pool close).
	reorderScheduler := purchase_order.NewScheduler(db, poSvc)
	if err := reorderScheduler.Start(context.Background()); err != nil {
		logger.Error("reorder scheduler failed to start", "error", err)
	}

	// Auto-PO: wire quote service to create POs when quotes are accepted
	quoteSvc.WithAutoPO(&autoPOAdapter{poSvc: poSvc, productSvc: productSvc})

	// Buying Group EDI Service (832/846 catalog sync)
	bgSvc := edi.NewBuyingGroupService(logger)

	// EDI Trading Partner Admin (vendor-agnostic)
	ediRepo := edi.NewEDIRepository(db)
	ediHandler := edi.NewEDIHandler(ediRepo, bgSvc, ediSvc)
	ediHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	orderSvc := order.NewService(orderRepo, inventorySvc, invoiceSvc, customerSvc, poSvc, db)
	orderSvc.WithAuditLog(auditLog)
	orderHandler := order.NewHandler(orderSvc)
	orderHandler.RegisterRoutes(mux, scoped("admin", "owner", "sales"))

	// Notification Module
	emailSvc := notification.NewLogEmailService(logger)

	// Document Module
	docSvc := document.NewService(productRepo)
	docHandler := document.NewHandler(docSvc, orderSvc, invoiceSvc, customerSvc, emailSvc)
	docHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales", "finance"))

	// Payment Module (with Run Payments gateway)
	paymentRepo := payment.NewRepository(db)
	paymentSvc := payment.NewService(db, paymentRepo, invoiceRepo, accountSvc)
	paymentSvc.WithAuditLog(auditLog)

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
	paymentHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales", "finance", "cashier"))

	// POS Module (Retail Counter Sales)
	posRepo := pos.NewRepository(db)
	posSvc := pos.NewService(db, posRepo, productSvc, inventorySvc, invoiceSvc, paymentSvc, logger)
	posSvc.WithPricing(&posCalcAdapter{pricingSvc: pricingSvc, customerSvc: customerSvc})
	posHandler := pos.NewHandler(posSvc)
	posHandler.RegisterRoutes(mux, scoped("admin", "owner", "cashier"))

	// Accounts Payable Module
	apRepo := ap.NewRepository(db)
	apSvc := ap.NewService(db, apRepo, glSvc, logger)
	apHandler := ap.NewHandler(apSvc)
	apHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "finance"))

	// 3-Way PO Matching Module
	matchingRepo := matching.NewRepository(db)
	matchingSvc := matching.NewService(db, matchingRepo, poSvc, apSvc, logger)
	matchingHandler := matching.NewHandler(matchingSvc)
	matchingHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "finance"))

	// Bank Reconciliation Module
	bankreconRepo := bankrecon.NewRepository(db)
	bankreconSvc := bankrecon.NewService(db, bankreconRepo, glSvc, logger)
	bankreconHandler := bankrecon.NewHandler(bankreconSvc)
	bankreconHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "finance"))

	// Reporting Module
	reportingRepo := reporting.NewRepository(db)
	reportingSvc := reporting.NewService(reportingRepo)
	reportingHandler := reporting.NewHandler(reportingSvc)
	reportingHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "finance"))
	reportingHandler.RegisterBuilderRoutes(mux, middleware.RequireRole("admin", "owner", "finance"))
	reportingHandler.RegisterBIIntegrationRoutes(mux, middleware.RequireRole("admin", "owner"))

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
	taxHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "finance"))

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
	deliveryHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "warehouse", "driver"))

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
	millworkHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales"))

	// Configurator Module (Sprint 19: Product Configurator)
	configuratorRepo := configurator.NewRepository(db)
	configuratorSvc := configurator.NewService(configuratorRepo)
	configuratorHandler := configurator.NewHandler(configuratorSvc)
	configuratorHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner", "sales"))

	// AI Vision Module (Sprint 19: Blueprint Verification Prototype)
	visionSvc := vision.NewService()
	visionHandler := vision.NewHandler(visionSvc)
	visionHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	// Governance Module
	governanceRepo := governance.NewRepository(db)
	aiProvider := governance.NewTemplateAIProvider()
	governanceSvc := governance.NewService(governanceRepo, aiProvider)
	governanceHandler := governance.NewHandler(governanceSvc)
	governanceHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	// Partner Module
	partnerSvc := partner.NewService(customerRepo, quoteRepo, logger)
	partnerHandler := partner.NewHandler(partnerSvc)
	partnerAuthMw := middleware.NewPartnerAuthMiddleware(customerRepo, logger)
	partnerHandler.RegisterRoutes(mux, partnerAuthMw.Handler)

	// Dashboard Module (Executive Analytics)
	dashboardRepo := dashboard.NewRepository(db)
	dashboardSvc := dashboard.NewService(dashboardRepo)
	dashboardHandler := dashboard.NewHandler(dashboardSvc)
	dashboardHandler.RegisterRoutes(mux, scoped("admin", "owner", "finance"))

	// Tech Admin Module
	techAdminRepo := techadmin.NewRepository(db)
	techAdminSvc := techadmin.NewService(techAdminRepo)
	techAdminHandler := techadmin.NewHandler(techAdminSvc)
	techAdminHandler.WithAIKeyStore(aiKeyStore)
	techAdminHandler.WithGeminiKeyStore(geminiKeyStore)
	techAdminHandler.RegisterRoutes(mux, middleware.RequireRole("admin", "owner"))

	// Portal Module (Sovereign Dealer Portal)
	// Resolve JWT secret: required in production, uses dev default in dev mode only.
	portalJWTSecret := os.Getenv("PORTAL_JWT_SECRET")
	if portalJWTSecret == "" {
		if strings.EqualFold(cfg.AuthMode, "dev") {
			portalJWTSecret = "portal-dev-secret-do-not-use-in-production"
			logger.Warn("PORTAL_JWT_SECRET not set — using dev-only default (AUTH_MODE=dev)")
		} else {
			logger.Error("PORTAL_JWT_SECRET not set — required for portal authentication")
			os.Exit(1)
		}
	}

	portalRepo := portal.NewRepository(db)
	portalSvc := portal.NewService(portalRepo, portalJWTSecret, logger, pricingSvc, customerSvc, inventorySvc, orderSvc, productSvc)
	portalHandler := portal.NewHandler(portalSvc)

	// Portal auth middleware
	var portalMw func(http.Handler) http.Handler
	if strings.EqualFold(cfg.AuthMode, "dev") {
		logger.Warn("AUTH_MODE=dev: Portal auth bypassed — injecting Kelbrook demo customer claims")
		// Look up the Kelbrook Construction demo account; fall back to the
		// first customer in the table so a non-Kelowna fork can still boot.
		var demoCustomerID uuid.UUID
		row := db.Pool.QueryRow(context.Background(),
			"SELECT id FROM customers WHERE account_number = 'KELBROOK-001' LIMIT 1")
		if err := row.Scan(&demoCustomerID); err != nil {
			logger.Warn("Kelbrook demo customer not found, falling back to first customer", "error", err)
			fallback := db.Pool.QueryRow(context.Background(), "SELECT id FROM customers LIMIT 1")
			if err := fallback.Scan(&demoCustomerID); err != nil {
				logger.Error("Failed to load demo customer", "error", err)
				demoCustomerID = uuid.New() // Last-resort fallback
			}
		}
		portalMw = func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				claims := &middleware.PortalClaims{
					CustomerID: demoCustomerID,
					Email:      "demo@kelbrook.ca",
					Name:       "Sam Kelbrook",
				}
				ctx := context.WithValue(r.Context(), middleware.PortalClaimsKey, claims)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		}
	} else {
		portalAuthMw := middleware.NewPortalAuthMiddleware([]byte(portalJWTSecret), logger)
		portalMw = portalAuthMw.Handler
	}
	portalHandler.RegisterRoutes(mux, portalMw, middleware.StrictRateLimit(10))

	// Project Module (Sprint 34: Project Management Dashboard)
	projectRepo := project.NewRepository(db)
	projectSvc := project.NewService(projectRepo)
	projectHandler := project.NewHandler(projectSvc)
	projectHandler.RegisterRoutes(mux, portalMw)

	// Integration API (FB-Brain cross-system endpoints)
	integrationAPIKey := os.Getenv("INTEGRATION_API_KEY")
	if integrationAPIKey == "" {
		if strings.EqualFold(cfg.AuthMode, "dev") {
			integrationAPIKey = "fb-brain-demo-key-2026"
		} else {
			logger.Warn("INTEGRATION_API_KEY not set — integration endpoints disabled")
		}
	}
	integrationHandler := integrations.NewHandler(db, pricingSvc, quote.NewService(quoteRepo), orderSvc, customerSvc, productSvc, integrationAPIKey)
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

	// Static file serving for uploaded photos (auth-protected, no directory listing)
	uploadFS := noListingFileSystem{fs: http.Dir("uploads")}
	fileServer := http.FileServer(uploadFS)
	mux.Handle("/uploads/", middleware.RequireRole("admin", "owner", "user")(http.StripPrefix("/uploads/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", "attachment")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		fileServer.ServeHTTP(w, r)
	}))))

	// Health Check — liveness (always 200 if process is running)
	mux.HandleFunc("GET /healthz/live", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Health Check — readiness (checks dependencies)
	mux.HandleFunc("GET /healthz/ready", func(w http.ResponseWriter, r *http.Request) {
		status := "ok"
		httpStatus := http.StatusOK
		dbStatus := "connected"
		if err := db.Pool.Ping(r.Context()); err != nil {
			status = "degraded"
			httpStatus = http.StatusServiceUnavailable
			dbStatus = "disconnected"
			logger.Error("Readiness check failed", "error", err)
		}

		poolStat := db.Pool.Stat()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(httpStatus)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": status,
			"uptime": time.Since(startTime).String(),
			"checks": map[string]interface{}{
				"database": map[string]interface{}{
					"status":       dbStatus,
					"pool_total":   poolStat.TotalConns(),
					"pool_idle":    poolStat.IdleConns(),
					"pool_in_use":  poolStat.AcquiredConns(),
					"pool_max":     poolStat.MaxConns(),
				},
			},
		})
	})

	// Legacy /health endpoint (backward compat)
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

	// Prometheus metrics endpoint (public — scrape target)
	mux.Handle("GET /metrics", promhttp.Handler())

	// 6. Wrap Middleware (outermost first)
	var finalHandler http.Handler = mux

	// Cache-Control headers (innermost — runs after auth, before response)
	finalHandler = middleware.CacheControl(finalHandler)

	// Request size limit (10MB default)
	finalHandler = middleware.MaxRequestSize(10 << 20)(finalHandler)

	// Auth (JWT verification)
	if authMw != nil {
		finalHandler = authMw.Handler(finalHandler)
	}

	// CORS — must be outside auth so OPTIONS preflight is handled before auth
	finalHandler = middleware.CORSMiddleware(finalHandler)

	// Idempotency key caching (POST/PUT — after auth, before rate limiting)
	finalHandler = middleware.Idempotency()(finalHandler)

	// Rate limiting (120 requests/minute per IP)
	finalHandler = middleware.RateLimit(120)(finalHandler)

	// Panic recovery
	finalHandler = middleware.Recovery(logger)(finalHandler)

	// Request ID generation
	finalHandler = middleware.RequestID(finalHandler)

	// Prometheus HTTP metrics
	finalHandler = metrics.HTTPMetrics(finalHandler)

	// Access logging (outermost — captures full request lifecycle)
	finalHandler = RequestLogger(logger, finalHandler)

	// 7. Start Server with Graceful Shutdown
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.Port),
		Handler:           finalHandler,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
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
	sig := <-quit
	logger.Info("Shutdown signal received", "signal", sig.String())

	// Create a deadline to wait for in-flight requests
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Step 1: Stop accepting new HTTP connections and drain in-flight requests
	logger.Info("Shutdown step 1/4: draining HTTP connections...")
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("HTTP server forced to shutdown", "error", err)
		os.Exit(1)
	}
	logger.Info("Shutdown step 1/4: HTTP server stopped")

	// Step 2: Cancel metrics collector goroutine
	logger.Info("Shutdown step 2/4: stopping metrics collector...")
	metricsCancel()
	logger.Info("Shutdown step 2/4: metrics collector stopped")

	// Step 3: Drain audit logger (wait for in-flight audit writes)
	slog.Info("draining audit logger")
	auditLog.Drain()

	// Step 3.5: Stop the auto-reorder cron scheduler so no new jobs tick
	// against a draining DB pool. In-flight jobs continue to completion;
	// their reorder_runs row is finalized before the pool closes.
	logger.Info("Shutdown step 3.5/4: stopping reorder scheduler...")
	reorderScheduler.Stop()
	logger.Info("Shutdown step 3.5/4: reorder scheduler stopped")

	// Step 4: Close database connection pool
	logger.Info("Shutdown step 4/4: closing database pool...")
	db.Close()
	logger.Info("Shutdown step 4/4: database pool closed")

	logger.Info("Server exiting — clean shutdown complete")
}

// noListingFileSystem wraps http.Dir to prevent directory listing.
type noListingFileSystem struct {
	fs http.FileSystem
}

func (nfs noListingFileSystem) Open(path string) (http.File, error) {
	f, err := nfs.fs.Open(path)
	if err != nil {
		return nil, err
	}
	stat, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if stat.IsDir() {
		f.Close()
		return nil, os.ErrNotExist
	}
	return f, nil
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

// statusResponseWriter wraps http.ResponseWriter to capture the status code and bytes written.
type statusResponseWriter struct {
	http.ResponseWriter
	status       int
	bytesWritten int
	wroteHeader  bool
}

func (w *statusResponseWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status = code
		w.wroteHeader = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.status = http.StatusOK
		w.wroteHeader = true
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytesWritten += n
	return n, err
}

func (w *statusResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// RequestLogger logs incoming requests with status code, bytes written, and request ID.
func RequestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"bytes", sw.bytesWritten,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote_addr", r.RemoteAddr,
			"request_id", middleware.GetRequestID(r.Context()),
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

	// Build invoice from order — PriceEach is already in cents
	var lines []invoice.InvoiceLine
	for _, ol := range ord.Lines {
		lines = append(lines, invoice.InvoiceLine{
			ProductID: ol.ProductID,
			Quantity:  ol.Quantity,
			PriceEach: ol.PriceEach,
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
