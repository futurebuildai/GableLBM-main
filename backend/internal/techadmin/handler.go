package techadmin

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/internal/ai"
	"github.com/gablelbm/gable/pkg/httputil"
)

type Handler struct {
	service        *Service
	aiKeyStore     *ai.KeyStore
	geminiKeyStore *ai.KeyStore
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// WithAIKeyStore sets the Anthropic AI key store for admin settings management.
func (h *Handler) WithAIKeyStore(ks *ai.KeyStore) {
	h.aiKeyStore = ks
}

// WithGeminiKeyStore sets the Gemini key store for admin settings management.
func (h *Handler) WithGeminiKeyStore(ks *ai.KeyStore) {
	h.geminiKeyStore = ks
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
	mux.HandleFunc("GET /api/v1/admin/settings/gemini", guard(h.GetGeminiSettings))
	mux.HandleFunc("PUT /api/v1/admin/settings/gemini", guard(h.SaveGeminiSettings))
	mux.HandleFunc("DELETE /api/v1/admin/settings/gemini", guard(h.DeleteGeminiSettings))
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
	Source     string `json:"source"` // "admin", "env", or "none"
	KeyHint   string `json:"key_hint,omitempty"` // e.g. "sk-ant-...4f2e"
}

func (h *Handler) GetAISettings(w http.ResponseWriter, r *http.Request) {
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) SaveAISettings(w http.ResponseWriter, r *http.Request) {
	if h.aiKeyStore == nil {
		httputil.RespondError(w, r, "AI key store not available", http.StatusInternalServerError, nil)
		return
	}

	var body struct {
		APIKey string `json:"api_key"`
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

	w.WriteHeader(http.StatusNoContent)
}

// --- Gemini Settings ---

func (h *Handler) GetGeminiSettings(w http.ResponseWriter, r *http.Request) {
	if h.geminiKeyStore == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(AISettingsResponse{Source: "none"})
		return
	}

	ctx := r.Context()
	key := h.geminiKeyStore.Get(ctx)
	hasDB := h.geminiKeyStore.HasDBOverride(ctx)

	resp := AISettingsResponse{
		Configured: key != "",
	}

	if key != "" {
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) SaveGeminiSettings(w http.ResponseWriter, r *http.Request) {
	if h.geminiKeyStore == nil {
		httputil.RespondError(w, r, "Gemini key store not available", http.StatusInternalServerError, nil)
		return
	}

	var body struct {
		APIKey string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if body.APIKey == "" {
		httputil.RespondError(w, r, "api_key is required", http.StatusBadRequest, nil)
		return
	}

	if err := h.geminiKeyStore.Set(r.Context(), body.APIKey); err != nil {
		httputil.RespondError(w, r, "failed to save Gemini API key", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

func (h *Handler) DeleteGeminiSettings(w http.ResponseWriter, r *http.Request) {
	if h.geminiKeyStore == nil {
		httputil.RespondError(w, r, "Gemini key store not available", http.StatusInternalServerError, nil)
		return
	}

	if err := h.geminiKeyStore.Delete(r.Context()); err != nil {
		httputil.RespondError(w, r, "failed to delete Gemini API key", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
