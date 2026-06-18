package techadmin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gablelbm/gable/internal/ai"
	"github.com/gablelbm/gable/pkg/httputil"
)

type Handler struct {
	service      *Service
	aiKeyStore   *ai.KeyStore // openrouter_api_key
	baseURLStore *ai.KeyStore // openrouter_base_url
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// WithAIKeyStore sets the OpenRouter API key store for admin settings management.
func (h *Handler) WithAIKeyStore(ks *ai.KeyStore) {
	h.aiKeyStore = ks
}

// WithAIBaseURLStore sets the OpenRouter base-URL store. The base URL is a
// separate setting key because KeyStore is single-valued, so the admin-editable
// base URL needs its own store alongside the API key.
func (h *Handler) WithAIBaseURLStore(ks *ai.KeyStore) {
	h.baseURLStore = ks
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	// All admin routes require admin/owner role
	mux.HandleFunc("POST /api/v1/admin/keys", guard(h.CreateKey))
	mux.HandleFunc("GET /api/v1/admin/keys", guard(h.ListKeys))
	mux.HandleFunc("DELETE /api/v1/admin/keys/{id}", guard(h.RevokeKey))
	mux.HandleFunc("GET /api/v1/admin/settings/ai", guard(h.GetAISettings))
	mux.HandleFunc("PUT /api/v1/admin/settings/ai", guard(h.SaveAISettings))
	mux.HandleFunc("DELETE /api/v1/admin/settings/ai", guard(h.DeleteAISettings))
}

type CreateKeyRequest struct {
	Name   string   `json:"name"`
	Scopes []string `json:"scopes"`
}

type CreateKeyResponse struct {
	APIKey string  `json:"api_key"` // The raw key, shown once
	Key    *APIKey `json:"key"`
}

func (h *Handler) CreateKey(w http.ResponseWriter, r *http.Request) {
	var req CreateKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "failed to decode create key request", http.StatusBadRequest, err)
		return
	}

	rawKey, apiKey, err := h.service.GenerateKey(r.Context(), req.Name, req.Scopes)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate API key", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CreateKeyResponse{
		APIKey: rawKey,
		Key:    apiKey,
	})
}

func (h *Handler) ListKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := h.service.ListKeys(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list API keys", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

func (h *Handler) RevokeKey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.RespondError(w, r, "missing id", http.StatusBadRequest, nil)
		return
	}

	if err := h.service.RevokeKey(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to revoke API key", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- AI Settings ---

type AISettingsResponse struct {
	Configured bool   `json:"configured"`
	Source     string `json:"source"`             // "admin", "env", or "none"
	KeyHint    string `json:"key_hint,omitempty"` // e.g. "sk-or-...4f2e"
	BaseURL    string `json:"base_url,omitempty"` // OpenRouter base URL (default or admin override)
}

func (h *Handler) GetAISettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.aiKeyStore == nil {
		json.NewEncoder(w).Encode(AISettingsResponse{Source: "none"})
		return
	}

	ctx := r.Context()
	key := h.aiKeyStore.Get(ctx)
	hasDB := h.aiKeyStore.HasDBOverride(ctx)

	resp := AISettingsResponse{
		Configured: key != "",
	}

	if key != "" {
		// Show a masked hint
		if len(key) > 12 {
			resp.KeyHint = key[:10] + "..." + key[len(key)-4:]
		} else {
			resp.KeyHint = "****"
		}

		if hasDB {
			resp.Source = "admin"
		} else {
			resp.Source = "env"
		}
	} else {
		resp.Source = "none"
	}

	// Only surface a base URL when it's an admin override, so the UI can tell
	// "override set" from "using the default" (mirrors the Source derivation
	// above) and never re-persists the default back into system_settings.
	if h.baseURLStore != nil && h.baseURLStore.HasDBOverride(ctx) {
		resp.BaseURL = h.baseURLStore.Get(ctx)
	}

	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) SaveAISettings(w http.ResponseWriter, r *http.Request) {
	if h.aiKeyStore == nil {
		httputil.RespondError(w, r, "AI key store not available", http.StatusInternalServerError, nil)
		return
	}

	// base_url is a pointer so we can distinguish "omitted" (leave as-is) from
	// "present but empty" (clear the admin override, reverting to env/default).
	var body struct {
		APIKey  string  `json:"api_key"`
		BaseURL *string `json:"base_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if body.APIKey == "" {
		httputil.RespondError(w, r, "api_key is required", http.StatusBadRequest, nil)
		return
	}

	if err := h.aiKeyStore.Set(r.Context(), body.APIKey); err != nil {
		httputil.RespondError(w, r, "failed to save API key", http.StatusInternalServerError, err)
		return
	}

	if body.BaseURL != nil && h.baseURLStore != nil {
		baseURL := strings.TrimSpace(*body.BaseURL)
		if err := ai.ValidateBaseURL(baseURL); err != nil {
			httputil.RespondError(w, r, err.Error(), http.StatusBadRequest, err)
			return
		}
		if baseURL == "" {
			// Empty clears the override entirely (reverting to env/default) rather
			// than persisting an empty row that would read back as "overridden".
			if err := h.baseURLStore.Delete(r.Context()); err != nil {
				httputil.RespondError(w, r, "failed to clear base URL", http.StatusInternalServerError, err)
				return
			}
		} else if err := h.baseURLStore.Set(r.Context(), baseURL); err != nil {
			httputil.RespondError(w, r, "failed to save base URL", http.StatusInternalServerError, err)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

func (h *Handler) DeleteAISettings(w http.ResponseWriter, r *http.Request) {
	if h.aiKeyStore == nil {
		httputil.RespondError(w, r, "AI key store not available", http.StatusInternalServerError, nil)
		return
	}

	if err := h.aiKeyStore.Delete(r.Context()); err != nil {
		httputil.RespondError(w, r, "failed to delete API key", http.StatusInternalServerError, err)
		return
	}

	// Removing the admin AI config also clears any base-URL override so both
	// revert to their env/defaults together.
	if h.baseURLStore != nil {
		if err := h.baseURLStore.Delete(r.Context()); err != nil {
			httputil.RespondError(w, r, "failed to delete base URL", http.StatusInternalServerError, err)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
