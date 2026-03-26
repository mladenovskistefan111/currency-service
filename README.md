# currency-service

A gRPC service that handles currency conversion for the platform-demo e-commerce platform. It loads exchange rates from a local JSON file, converts amounts via EUR as a base currency, and is called by `checkout-service` to normalise prices. Part of a broader microservices platform built with full observability, GitOps, and internal developer platform tooling.

## Overview

The service exposes two gRPC methods:

| Method | Description |
|---|---|
| `GetSupportedCurrencies` | Returns a list of all supported currency codes |
| `Convert` | Converts a `Money` amount from one currency to another via EUR as base |

**Port:** `7000` (gRPC)  
**Metrics Port:** `9464` (Prometheus)  
**Protocol:** gRPC  
**Language:** TypeScript (Node.js)  
**Called by:** `checkout-service`

## Requirements

- Node.js 22+
- Docker
- `grpcurl` for manual testing

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | gRPC server port (default: `7000`) |
| `METRICS_PORT` | No | Prometheus metrics port (default: `9464`) |
| `OTEL_SERVICE_NAME` | No | Service name reported to OTel (default: `currency-service`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OTLP HTTP endpoint (default: `http://localhost:4318`) |
| `PYROSCOPE_ADDR` | No | Pyroscope profiling endpoint (default: `http://localhost:4040`) |
| `SERVICE_VERSION` | No | Service version tag (default: `1.0.0`) |

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Build and run

```bash
npm run build
npm start
```

### 3. Run in dev mode (no build step)

```bash
npm run dev
```

### 4. Run with Docker

```bash
docker build -t currency-service .

docker run -p 7000:7000 -p 9464:9464 \
  currency-service
```

## Testing

### Manual gRPC testing

Install `grpcurl` then, from the service root:

```bash
# list supported currencies
grpcurl -plaintext \
  -proto proto/currency.proto \
  localhost:7000 \
  hipstershop.CurrencyService/GetSupportedCurrencies

# convert USD to EUR
grpcurl -plaintext \
  -proto proto/currency.proto \
  -d '{"from": {"currency_code": "USD", "units": 10, "nanos": 0}, "to_code": "EUR"}' \
  localhost:7000 \
  hipstershop.CurrencyService/Convert

# health check
grpcurl -plaintext \
  -proto proto/health.proto \
  localhost:7000 \
  grpc.health.v1.Health/Check
```

### Generate traffic

```bash
while true; do
  grpcurl -plaintext \
    -proto proto/currency.proto \
    -d '{"from": {"currency_code": "USD", "units": 10, "nanos": 0}, "to_code": "EUR"}' \
    localhost:7000 \
    hipstershop.CurrencyService/Convert
  sleep 1
done
```

## Project Structure

```
├── proto/
│   ├── currency.proto         # Service definition and message types
│   └── health.proto           # gRPC health check
├── src/
│   ├── server.ts              # gRPC server, service handlers, bootstrap
│   ├── telemetry.ts           # OpenTelemetry traces, Prometheus metrics, Pyroscope profiling
│   └── client.ts              # Test client
├── data/
│   └── currency_conversion.json  # Exchange rates (EUR base)
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Observability

- **Traces** — OTLP HTTP → Alloy → Tempo. Inbound server spans instrumented automatically via `GrpcInstrumentation`.
- **Metrics** — Prometheus endpoint on `:9464/metrics`, scraped by Alloy → Mimir. Exposes `rpc_server_duration`, `rpc_server_requests_total`, `rpc_server_active_requests`, plus a full set of Node.js runtime metrics: heap usage, RSS, CPU time, event loop lag, active handles.
- **Logs** — Structured JSON logs via `pino`, exported via OTLP HTTP → Alloy → Loki.
- **Profiles** — Continuous CPU profiling via `@pyroscope/nodejs` SDK → Pyroscope.

## Part Of

This service is part of [platform-demo](https://github.com/mladenovskistefan111) — a full platform engineering project featuring microservices, observability (LGTM stack), GitOps (Argo CD), policy enforcement (Kyverno), infrastructure provisioning (Crossplane), and an internal developer portal (Backstage).