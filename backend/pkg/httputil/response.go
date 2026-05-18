package httputil

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// ErrorResponse is the standard JSON error envelope returned to clients.
type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
	Meta  ErrorMeta   `json:"meta"`
}

// ErrorDetail holds the machine-readable code and human-readable message.
type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ErrorMeta holds request-scoped metadata.
type ErrorMeta struct {
	RequestID string `json:"request_id"`
}

// RespondError sends a structured JSON error to the client and logs the full
// error server-side with request context. This prevents internal error details
// (DB schema, query structure, service names) from leaking to clients.
func RespondError(w http.ResponseWriter, r *http.Request, msg string, code int, err error) {
	// Read request ID from the response header (set by RequestID middleware)
	// or fall back to the incoming request header.
	reqID := w.Header().Get("X-Request-ID")
	if reqID == "" {
		reqID = r.Header.Get("X-Request-ID")
	}

	slog.Error(msg,
		"error", err,
		"status", code,
		"method", r.Method,
		"path", r.URL.Path,
		"request_id", reqID,
	)

	resp := ErrorResponse{
		Error: ErrorDetail{
			Code:    errorCode(code),
			Message: genericMessage(code),
		},
		Meta: ErrorMeta{
			RequestID: reqID,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(resp)
}

// errorCode maps HTTP status codes to machine-readable error codes.
func errorCode(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "BAD_REQUEST"
	case http.StatusUnauthorized:
		return "UNAUTHORIZED"
	case http.StatusForbidden:
		return "FORBIDDEN"
	case http.StatusNotFound:
		return "NOT_FOUND"
	case http.StatusConflict:
		return "CONFLICT"
	case http.StatusTooManyRequests:
		return "RATE_LIMITED"
	case http.StatusUnprocessableEntity:
		return "UNPROCESSABLE_ENTITY"
	case http.StatusPaymentRequired:
		return "PAYMENT_REQUIRED"
	default:
		if status >= 400 && status < 500 {
			return "BAD_REQUEST"
		}
		return "INTERNAL_ERROR"
	}
}

func genericMessage(code int) string {
	switch code {
	case http.StatusNotFound:
		return "Not Found"
	case http.StatusForbidden:
		return "Forbidden"
	case http.StatusUnauthorized:
		return "Unauthorized"
	case http.StatusConflict:
		return "Conflict"
	case http.StatusTooManyRequests:
		return "Too Many Requests"
	case http.StatusUnprocessableEntity:
		return "Unprocessable Entity"
	case http.StatusPaymentRequired:
		return "Payment Required"
	default:
		if code >= 400 && code < 500 {
			return "Bad Request"
		}
		return "Internal Server Error"
	}
}
