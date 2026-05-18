# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy the source code
COPY backend/ .

# Build the application binaries. `main` is the API server (CMD), and
# `migrate` / `seed` are bundled so DO App Platform post-deploy jobs can
# invoke them against the production image without needing a separate
# build step.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o main ./cmd/server/main.go && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o migrate ./cmd/migrate && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o seed ./cmd/seed

# Run stage
FROM alpine:3.20

RUN apk --no-cache add ca-certificates curl && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy the pre-built binaries from the builder stage.
COPY --from=builder /app/main .
COPY --from=builder /app/migrate ./migrate
COPY --from=builder /app/seed ./seed

# Copy migrations for runtime use
COPY --from=builder /app/migrations ./migrations

# Create writable directories for file uploads and EDI exports
RUN mkdir -p /app/uploads /app/edi_out && \
    chown -R appuser:appgroup /app/uploads /app/edi_out

# Run as non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/healthz/live || exit 1

# Command to run the executable
CMD ["./main"]
