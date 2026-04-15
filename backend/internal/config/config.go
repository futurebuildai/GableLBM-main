package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWKSURL     string
	AuthIssuer  string

	// Run Payments Gateway
	RunPaymentsAPIKey      string
	RunPaymentsPublicKey   string
	RunPaymentsBaseURL     string
	RunPaymentsEnvironment string // "sandbox" or "production"

	// Avalara Sales Tax
	AvalaraAccountID   string
	AvalaraLicenseKey  string
	AvalaraEnvironment string // "sandbox" or "production"
	AvalaraCompanyCode string

	// Google Maps
	GoogleMapsAPIKey string

	// Twilio SMS
	TwilioAccountSID string
	TwilioAuthToken  string
	TwilioFromNumber string

	// Anthropic (Claude AI — PIM Content Generation)
	AnthropicAPIKey string
	AnthropicModel  string

	// Stability AI (PIM Image Generation) — legacy, replaced by Gemini
	StabilityAPIKey string

	// Google Gemini (PIM Image Generation)
	GeminiAPIKey string

	// Auth & Security
	AuthMode string // "dev" to disable auth; otherwise JWKS_URL is required

	// Logging
	LogLevel string // DEBUG, INFO, WARN, ERROR (default: INFO)

	// Database Pool
	DBMaxConns        int32 // Max open connections (default: 10)
	DBMinConns        int32 // Min idle connections (default: 2)
	DBMaxConnLifetime int   // Max connection lifetime in minutes (default: 60)

	// FutureBuild Brain Integration
	FBBrainEnabled        bool   // Global kill switch for Brain integration
	FBBrainBaseURL        string // Brain API base URL (e.g. https://brain.futurebuild.io)
	FBBrainIntegrationKey string // Shared secret for service-to-service X-Integration-Key auth
	FBBrainPublicKeyPath  string // Path to Brain's RSA public key PEM for A2A JWS verification
	FBBrainOrgID          string // Tenant org_id for Brain financial attribution
}

func Load() (*Config, error) {
	_ = godotenv.Load() // Load .env if it exists, ignore if not

	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable"),
		JWKSURL:     getEnv("JWKS_URL", ""),
		AuthIssuer:  getEnv("AUTH_ISSUER", ""),

		// Run Payments — defaults to sandbox mode
		RunPaymentsAPIKey:      getEnv("RUN_PAYMENTS_API_KEY", ""),
		RunPaymentsPublicKey:   getEnv("RUN_PAYMENTS_PUBLIC_KEY", ""),
		RunPaymentsBaseURL:     getEnv("RUN_PAYMENTS_BASE_URL", ""),
		RunPaymentsEnvironment: getEnv("RUN_PAYMENTS_ENV", "sandbox"),

		// Avalara Sales Tax — defaults to sandbox mode
		AvalaraAccountID:   getEnv("AVALARA_ACCOUNT_ID", ""),
		AvalaraLicenseKey:  getEnv("AVALARA_LICENSE_KEY", ""),
		AvalaraEnvironment: getEnv("AVALARA_ENV", "sandbox"),
		AvalaraCompanyCode: getEnv("AVALARA_COMPANY_CODE", ""),

		// Google Maps
		GoogleMapsAPIKey: getEnv("GOOGLE_MAPS_API_KEY", ""),

		// Twilio SMS
		TwilioAccountSID: getEnv("TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:  getEnv("TWILIO_AUTH_TOKEN", ""),
		TwilioFromNumber: getEnv("TWILIO_FROM_NUMBER", ""),

		// Anthropic (Claude AI — PIM Content Generation)
		AnthropicAPIKey: getEnv("ANTHROPIC_API_KEY", ""),
		AnthropicModel:  getEnv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),

		// Stability AI (PIM Image Generation) — legacy
		StabilityAPIKey: getEnv("STABILITY_API_KEY", ""),

		// Google Gemini (PIM Image Generation)
		GeminiAPIKey: getEnv("GEMINI_API_KEY", ""),

		// Auth & Security
		AuthMode: getEnv("AUTH_MODE", ""),

		// Logging
		LogLevel: getEnv("LOG_LEVEL", "INFO"),

		// Database Pool
		DBMaxConns:        int32(getEnvInt("DB_MAX_CONNS", 10)),
		DBMinConns:        int32(getEnvInt("DB_MIN_CONNS", 2)),
		DBMaxConnLifetime: getEnvInt("DB_MAX_CONN_LIFETIME_MIN", 60),

		// FutureBuild Brain Integration
		FBBrainEnabled:        strings.EqualFold(getEnv("FB_BRAIN_ENABLED", "false"), "true"),
		FBBrainBaseURL:        getEnv("FB_BRAIN_BASE_URL", "http://localhost:8081"),
		FBBrainIntegrationKey: getEnv("FB_BRAIN_INTEGRATION_KEY", ""),
		FBBrainPublicKeyPath:  getEnv("FB_BRAIN_PUBLIC_KEY_PATH", ""),
		FBBrainOrgID:          getEnv("FB_BRAIN_ORG_ID", ""),
	}

	// F-05: Startup validation — fail fast if Brain is enabled but missing required config
	if cfg.FBBrainEnabled && cfg.FBBrainIntegrationKey == "" {
		return nil, fmt.Errorf("FB_BRAIN_ENABLED=true but FB_BRAIN_INTEGRATION_KEY is empty; cannot authenticate with Brain")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, exists := os.LookupEnv(key); exists {
		n, err := strconv.Atoi(value)
		if err != nil {
			slog.Warn("Invalid integer env var, using default", "key", key, "value", value, "default", fallback)
			return fallback
		}
		return n
	}
	return fallback
}
