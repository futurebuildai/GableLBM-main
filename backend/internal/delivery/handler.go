package delivery

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
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

	// Fleet
	mux.HandleFunc("GET /api/v1/delivery/vehicles", guard(h.HandleListVehicles))
	mux.HandleFunc("POST /api/v1/delivery/vehicles", guard(h.HandleCreateVehicle))
	mux.HandleFunc("GET /api/v1/delivery/vehicles/{id}", guard(h.HandleGetVehicle))
	mux.HandleFunc("PUT /api/v1/delivery/vehicles/{id}", guard(h.HandleUpdateVehicle))
	mux.HandleFunc("DELETE /api/v1/delivery/vehicles/{id}", guard(h.HandleDeleteVehicle))
	mux.HandleFunc("GET /api/v1/delivery/drivers", guard(h.HandleListDrivers))
	mux.HandleFunc("POST /api/v1/delivery/drivers", guard(h.HandleCreateDriver))
	mux.HandleFunc("GET /api/v1/delivery/drivers/{id}", guard(h.HandleGetDriver))
	mux.HandleFunc("PUT /api/v1/delivery/drivers/{id}", guard(h.HandleUpdateDriver))
	mux.HandleFunc("DELETE /api/v1/delivery/drivers/{id}", guard(h.HandleDeleteDriver))
	mux.HandleFunc("POST /api/v1/delivery/vehicles/{id}/photo", guard(h.HandleUploadVehiclePhoto))
	mux.HandleFunc("POST /api/v1/delivery/drivers/{id}/photo", guard(h.HandleUploadDriverPhoto))

	// Routes
	mux.HandleFunc("GET /api/v1/delivery/routes", guard(h.HandleListRoutes))
	mux.HandleFunc("POST /api/v1/delivery/routes", guard(h.HandleCreateRoute))
	mux.HandleFunc("POST /api/v1/delivery/routes/{id}/dispatch", guard(h.HandleDispatchRoute))
	mux.HandleFunc("POST /api/v1/delivery/routes/{id}/reorder", guard(h.HandleReorderStops))
	mux.HandleFunc("POST /api/v1/delivery/routes/{id}/optimize", guard(h.HandleOptimizeRoute))
	mux.HandleFunc("POST /api/v1/delivery/routes/{id}/complete", guard(h.HandleCompleteRoute))

	// Deliveries
	mux.HandleFunc("GET /api/v1/delivery/routes/{id}/deliveries", guard(h.HandleListDeliveries))
	mux.HandleFunc("GET /api/v1/delivery/deliveries/{id}", guard(h.HandleGetDelivery))
	mux.HandleFunc("POST /api/v1/delivery/deliveries", guard(h.HandleAssignOrder))                     // Assign Order to Route
	mux.HandleFunc("PUT /api/v1/delivery/deliveries/{id}/status", guard(h.HandleUpdateDeliveryStatus)) // Complete Delivery
	mux.HandleFunc("POST /api/v1/delivery/deliveries/{id}/adjust-qty", guard(h.HandleAdjustQuantity))

	// POD Photos
	mux.HandleFunc("POST /api/v1/delivery/deliveries/{id}/pod-photo", guard(h.HandleUploadPODPhoto))
	mux.HandleFunc("GET /api/v1/delivery/deliveries/{id}/pod-photos", guard(h.HandleListPODPhotos))
}

// Fleet

func (h *Handler) HandleListVehicles(w http.ResponseWriter, r *http.Request) {
	vehicles, err := h.service.ListVehicles(r.Context())
	if err != nil {
		slog.Error("ListVehicles failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vehicles)
}

func (h *Handler) HandleCreateVehicle(w http.ResponseWriter, r *http.Request) {
	var req CreateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	v, err := h.service.CreateVehicle(r.Context(), req)
	if err != nil {
		slog.Error("CreateVehicle failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(v)
}

func (h *Handler) HandleListDrivers(w http.ResponseWriter, r *http.Request) {
	drivers, err := h.service.ListDrivers(r.Context())
	if err != nil {
		slog.Error("ListDrivers failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(drivers)
}

func (h *Handler) HandleCreateDriver(w http.ResponseWriter, r *http.Request) {
	var req CreateDriverRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	d, err := h.service.CreateDriver(r.Context(), req)
	if err != nil {
		slog.Error("CreateDriver failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(d)
}

// Routes

func (h *Handler) HandleListRoutes(w http.ResponseWriter, r *http.Request) {
	dateStr := r.URL.Query().Get("date")
	var datePtr *string
	if dateStr != "" {
		datePtr = &dateStr
	}

	driverIDStr := r.URL.Query().Get("driver_id")
	var driverID *uuid.UUID
	if driverIDStr != "" {
		id, err := uuid.Parse(driverIDStr)
		if err != nil {
			httputil.RespondError(w, r, "Invalid driver_id UUID", http.StatusBadRequest, err)
			return
		}
		driverID = &id
	}

	routes, err := h.service.ListRoutes(r.Context(), datePtr, driverID)
	if err != nil {
		slog.Error("ListRoutes failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(routes)
}

func (h *Handler) HandleCreateRoute(w http.ResponseWriter, r *http.Request) {
	var req CreateRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	route, err := h.service.CreateRoute(r.Context(), req)
	if err != nil {
		slog.Error("CreateRoute failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(route)
}

func (h *Handler) HandleDispatchRoute(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	if err := h.service.DispatchRoute(r.Context(), id); err != nil {
		slog.Error("DispatchRoute failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) HandleReorderStops(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	var req ReorderStopsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.ReorderStops(r.Context(), id, req.OrderedDeliveryIDs); err != nil {
		slog.Error("ReorderStops failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// Deliveries

func (h *Handler) HandleListDeliveries(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id") // Route ID
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	deliveries, err := h.service.ListDeliveries(r.Context(), id)
	if err != nil {
		slog.Error("ListDeliveries failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(deliveries)
}

func (h *Handler) HandleGetDelivery(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	d, err := h.service.GetDelivery(r.Context(), id)
	if err != nil {
		slog.Error("GetDelivery failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func (h *Handler) HandleAssignOrder(w http.ResponseWriter, r *http.Request) {
	var req AssignOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	d, capacityWarning, err := h.service.AssignOrderToRoute(r.Context(), req)
	if err != nil {
		slog.Error("AssignOrderToRoute failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	response := struct {
		Delivery        *Delivery        `json:"delivery"`
		CapacityWarning *CapacityWarning `json:"capacity_warning,omitempty"`
	}{
		Delivery:        d,
		CapacityWarning: capacityWarning,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) HandleUpdateDeliveryStatus(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	var req UpdateDeliveryStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.CompleteDelivery(r.Context(), id, req); err != nil {
		slog.Error("CompleteDelivery failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) HandleOptimizeRoute(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	result, err := h.service.OptimizeRoute(r.Context(), id)
	if err != nil {
		slog.Error("OptimizeRoute failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) HandleGetVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	v, err := h.service.GetVehicle(r.Context(), id)
	if err != nil {
		slog.Error("GetVehicle failed", "error", err)
		httputil.RespondError(w, r, "Vehicle not found", http.StatusNotFound, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func (h *Handler) HandleUpdateVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	var req UpdateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	v, err := h.service.UpdateVehicle(r.Context(), id, req)
	if err != nil {
		slog.Error("UpdateVehicle failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func (h *Handler) HandleDeleteVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	if err := h.service.DeleteVehicle(r.Context(), id); err != nil {
		slog.Error("DeleteVehicle failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleGetDriver(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	d, err := h.service.GetDriver(r.Context(), id)
	if err != nil {
		slog.Error("GetDriver failed", "error", err)
		httputil.RespondError(w, r, "Driver not found", http.StatusNotFound, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func (h *Handler) HandleUpdateDriver(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	var req UpdateDriverRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	d, err := h.service.UpdateDriver(r.Context(), id, req)
	if err != nil {
		slog.Error("UpdateDriver failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func (h *Handler) HandleDeleteDriver(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	if err := h.service.DeleteDriver(r.Context(), id); err != nil {
		slog.Error("DeleteDriver failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleCompleteRoute(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}
	if err := h.service.CompleteRoute(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to complete route", http.StatusBadRequest, err)
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "completed"})
}

const maxUploadSize = 10 << 20 // 10 MB

func saveUpload(w http.ResponseWriter, r *http.Request, subdir string) (string, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	file, header, err := r.FormFile("photo")
	if err != nil {
		return "", fmt.Errorf("read form file: %w", err)
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		return "", fmt.Errorf("unsupported file type: %s", ext)
	}

	dir := filepath.Join("uploads", subdir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create dir: %w", err)
	}

	filename := uuid.New().String() + ext
	path := filepath.Join(dir, filename)
	out, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		return "", fmt.Errorf("copy file: %w", err)
	}

	return "/uploads/" + subdir + "/" + filename, nil
}

func (h *Handler) HandleUploadVehiclePhoto(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	url, err := saveUpload(w, r, "vehicles")
	if err != nil {
		httputil.RespondError(w, r, "failed to upload vehicle photo", http.StatusBadRequest, err)
		return
	}

	if err := h.service.SetVehiclePhoto(r.Context(), id, url); err != nil {
		slog.Error("SetVehiclePhoto failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"photo_url": url})
}

func (h *Handler) HandleUploadDriverPhoto(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	url, err := saveUpload(w, r, "drivers")
	if err != nil {
		httputil.RespondError(w, r, "failed to upload driver photo", http.StatusBadRequest, err)
		return
	}

	if err := h.service.SetDriverPhoto(r.Context(), id, url); err != nil {
		slog.Error("SetDriverPhoto failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"photo_url": url})
}

func (h *Handler) HandleAdjustQuantity(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	deliveryID, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	var req QtyAdjustmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	req.DeliveryID = deliveryID

	if err := h.service.AdjustDeliveryQuantity(r.Context(), req); err != nil {
		slog.Error("AdjustDeliveryQuantity failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "adjusted"})
}

// HandleUploadPODPhoto handles POST /api/v1/delivery/deliveries/{id}/pod-photo
func (h *Handler) HandleUploadPODPhoto(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid delivery ID", http.StatusBadRequest, err)
		return
	}

	// Limit request body size before parsing
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	// Parse multipart form (max 10MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		httputil.RespondError(w, r, "File too large", http.StatusBadRequest, err)
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		httputil.RespondError(w, r, "Photo file required", http.StatusBadRequest, err)
		return
	}
	defer file.Close()

	photoType := r.FormValue("photo_type")
	if photoType == "" {
		photoType = "site"
	}

	// Save file to uploads directory
	uploadsDir := filepath.Join("uploads", "pod")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		slog.Error("Failed to create POD uploads dir", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".jpg"
	}
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		httputil.RespondError(w, r, fmt.Sprintf("unsupported file type: %s", ext), http.StatusBadRequest, nil)
		return
	}
	filename := fmt.Sprintf("%s-%s%s", id.String(), uuid.New().String()[:8], ext)
	filePath := filepath.Join(uploadsDir, filename)

	dst, err := os.Create(filePath)
	if err != nil {
		slog.Error("Failed to create file", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		slog.Error("Failed to write file", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	photoURL := "/uploads/pod/" + filename

	photo, err := h.service.UploadPODPhoto(r.Context(), id, photoURL, photoType)
	if err != nil {
		slog.Error("UploadPODPhoto failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(photo)
}

// HandleListPODPhotos handles GET /api/v1/delivery/deliveries/{id}/pod-photos
func (h *Handler) HandleListPODPhotos(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid delivery ID", http.StatusBadRequest, err)
		return
	}

	photos, err := h.service.GetPODPhotos(r.Context(), id)
	if err != nil {
		slog.Error("GetPODPhotos failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	if photos == nil {
		photos = []PODPhoto{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(photos)
}
