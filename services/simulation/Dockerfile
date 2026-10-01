# Build the Go API server for the Bannerlord-clone campaign simulation.
# One process, one campaign: the simulation runs in-memory, no database.
#
# Build: docker build -f services/simulation/Dockerfile -t bannerlord-apiserver .
# Run:   docker run -p 8080:8080 bannerlord-apiserver

FROM golang:1.23-alpine AS builder

WORKDIR /src/services/simulation

# Copy module files first for layer caching
COPY services/simulation/go.mod services/simulation/go.sum ./
RUN go mod download

# Copy the rest of the simulation service
COPY services/simulation/ ./

# Build the API server (static binary for minimal runtime)
RUN CGO_ENABLED=0 GOOS=linux go build -o /apiserver ./cmd/apiserver/

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Binary
COPY --from=builder /apiserver /app/apiserver

# Default config (overridable via -config flag or volume mount)
COPY services/simulation/config/ /app/config/

EXPOSE 8080

# Listen on all interfaces for container platforms.
# The world seed and other tuning come from flags/env at deploy time.
ENTRYPOINT ["/app/apiserver", "-addr", "0.0.0.0:8080"]
