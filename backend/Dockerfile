# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy the source code
COPY backend/ .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/server/main.go

# Run stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the pre-built binary from the builder stage
COPY --from=builder /app/main .

# Copy migrations for runtime use
COPY --from=builder /app/migrations ./migrations

# Expose the port the app runs on
EXPOSE 8080

# Command to run the executable
CMD ["./main"]
