# currency-service

A gRPC service that converts monetary amounts between currencies for the platform-demo e-commerce platform. It reads a static table of exchange rates (relative to EUR) from a JSON file baked into the image and converts through EUR. It is stateless, has no downstream dependencies, and is called by `frontend` and `checkout-service`.

Part of the [platform-demo](https://github.com/mladenovskistefan111) platform — microservices, observability (LGTM stack), GitOps (Argo CD), policy enforcement (Kyverno), infrastructure provisioning (Crossplane) and an internal developer portal (Backstage). See the master `README.md` in the platform-demo root for the whole-system view.

## At a glance

| | |
|---|---|
| **Language / runtime** | TypeScript on Node.js 22 (`@grpc/grpc-js`) |
| **Image** | `mladenovskistefan/currency-service` |
| **Protocol / port** | gRPC (HTTP/2, plaintext) on `7000` |
| **Metrics** | Pushed over OTLP/gRPC to Alloy → Mimir every 15 s (no scrape endpoint). Dashboard names: `rpc_server_duration_seconds_{bucket,count,sum}`, `rpc_server_requests_total`, `rpc_server_active_requests` |
| **Health** | `grpc.health.v1.Health/Check` on `7000` — static `SERVING` |
| **State** | None. Rates are read from `data/currency_conversion.json` (static, not live) |
| **Depends on** | Nothing (optional: OTLP collector, Pyroscope) |
| **Called by** | `frontend` (`GetSupportedCurrencies`, `Convert`), `checkout-service` (`Convert`) |
| **gRPC reflection** | Not enabled — pass `-proto` to `grpcurl` |

## API

Package `hipstershop`, service `CurrencyService` ([`proto/currency.proto`](proto/currency.proto)); health in [`proto/health.proto`](proto/health.proto).

| Method | Request | Response | Behaviour |
|---|---|---|---|
| `GetSupportedCurrencies` | `Empty` | `{ repeated string currency_codes }` | Returns all codes present in the rates file |
| `Convert` | `{ Money from, string to_code }` | `Money` | Converts `from` → EUR → `to_code`. Unknown source or target code → gRPC `INVALID_ARGUMENT` |

`Money` = `{ currency_code, int64 units, int32 nanos }`.

**Supported currencies (33):** EUR, USD, JPY, BGN, CZK, DKK, GBP, HUF, PLN, RON, SEK, CHF, ISK, NOK, HRK, RUB, TRY, AUD, BRL, CAD, CNY, HKD, IDR, ILS, INR, KRW, MXN, MYR, NZD, PHP, SGD, THB, ZAR. (The frontend only exposes USD, EUR, CAD, JPY, GBP, TRY.)

Rates live in [`data/currency_conversion.json`](data/currency_conversion.json) as `"CODE": "rate-per-1-EUR"` strings. To change rates, edit the file and rebuild the image (or mount a new file over `/app/data/currency_conversion.json` — the file is re-read on **every** request, so no restart is needed).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7000` | gRPC listen port. **Must be set when relying on the Docker `HEALTHCHECK`** (see below) |
| `NODE_ENV` | `production` (set in image) | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP/**gRPC** endpoint for **traces, metrics and logs** (scheme required), e.g. `http://alloy.monitoring.svc.cluster.local:4317`. Legacy fallback: `COLLECTOR_SERVICE_ADDR` (`host:port`) |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | Milliseconds between metric pushes |
| `OTEL_SERVICE_NAME` | `currency-service` | `service.name` — becomes the Prometheus `job` and the Loki `service_name`; keep the default, dashboards depend on it |
| `SERVICE_VERSION` | `1.0.0` | `service.version` resource attribute |
| `PYROSCOPE_ADDR` | `http://localhost:4040` | Profiles use the Pyroscope SDK push protocol (**not** OTLP). Point it at Alloy (`http://alloy.monitoring.svc.cluster.local:4040`), which forwards to Pyroscope, or directly at Pyroscope |

Notes:

- Telemetry is **pushed**, not scraped: traces, metrics and logs share one OTLP/gRPC endpoint (Alloy); profiles go to Pyroscope (via Alloy). `service.instance.id` is the pod hostname, so replicas stay distinct in Mimir.
- The former Prometheus endpoint (`METRICS_PORT`) no longer exists. Logs keep going to stdout and are additionally exported over OTLP with trace ids.
- Telemetry and profiling cannot be switched off with a flag; with no reachable collector the exporters just log errors and the service keeps serving.

## Container image

Multi-stage [`Dockerfile`](Dockerfile):

| Stage | Base | What happens |
|---|---|---|
| builder | `node:22.22.2-alpine3.23` | `npm ci --ignore-scripts`, `npm run build` (tsc → `dist/`), `npm prune --omit=dev` |
| runtime | `node:22.22.2-alpine3.23` | copies `node_modules`, `dist/`, `proto/`, `data/`; runs as non-root |

- **Entrypoint:** `node dist/server.js` (working dir `/app`).
- **User:** `appuser` — UID `100`, GID `101` (verified). Set `runAsUser: 100` for `runAsNonRoot`.
- **EXPOSE:** `7000` only.
- **Docker `HEALTHCHECK`:** a `grpc-js` client connecting to `localhost:$PORT`. Because the command reads `process.env.PORT` directly (no default), **it fails if `PORT` is not set** in the container — compose sets `PORT=7000`. Kubernetes ignores this check anyway, but set `PORT` explicitly in the Deployment for parity.
- **Image size:** ~73 MB.

## Kubernetes deployment notes

**Workload:** stateless `Deployment`; scale freely (each pod has its own copy of the rates file).

**Ports to declare**

| Name | Port | Protocol | Expose via Service? |
|---|---|---|---|
| `grpc` | `7000` | TCP (HTTP/2) | Yes — callers dial `currency-service:7000` |

**Service DNS name expected by callers:** `currency-service` (`frontend`: `CURRENCY_SERVICE_ADDR=currency-service:7000`, `checkout-service`: `CURRENCY_SERVICE_ADDR=currency-service:7000`).

**Probes**

```yaml
readinessProbe:
  grpc: { port: 7000 }
  initialDelaySeconds: 3
  periodSeconds: 5
livenessProbe:
  grpc: { port: 7000 }
  periodSeconds: 10
  failureThreshold: 3
```

The Node health handler implements `Check` only (no `Watch`); Kubernetes `grpc:` probes only call `Check`, so this works. Startup takes ~1–2 s.

**Graceful shutdown:** the service registers a `SIGTERM` handler that flushes OpenTelemetry/Pyroscope but never exits the process, so Node keeps running until the kubelet's `SIGKILL`. Set `terminationGracePeriodSeconds: 5` (default 30 s would only delay rollouts).

**Security context**

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 100
  runAsGroup: 101
  allowPrivilegeEscalation: false
  capabilities: { drop: ["ALL"] }
  readOnlyRootFilesystem: true   # verified (no /tmp needed)
```

**Resources** — requests sized from measured idle usage in the test stack (see the chart's `values.yaml` for limits):

```yaml
resources:
  requests: { cpu: 100m, memory: 64Mi }
  limits:   { cpu: "500m", memory: 192Mi }
```

**Config / secrets:** no secrets. The rates file can optionally be supplied via a `ConfigMap` mounted at `/app/data/currency_conversion.json` (e.g. `subPath`) for rate changes without a rebuild.

**Telemetry:** pushed, not scraped — OTLP/gRPC to Alloy (`global.monitoring.otlpEndpoint`), profiles to Alloy `:4040`. Metrics carry `job="currency-service"` and `instance=<pod>`; no scrape annotations or `ServiceMonitor` are needed.

**Helm chart:** [`platform-demo-helm/currency-service`](../platform-demo-helm/currency-service) (built on the shared `platform-common` library chart). It ships with HA defaults — 2 replicas,
HPA, PodDisruptionBudget, topology spread, NetworkPolicy, restricted pod security context, probes and the full env contract (see Configuration) —
and was verified on a 3-node kind cluster under the `restricted` Pod Security Standard.

## Observability

| Signal | Implementation | Destination |
|---|---|---|
| **Traces** | OpenTelemetry `NodeSDK` + `GrpcInstrumentation`, OTLP/gRPC exporter (`BatchSpanProcessor`) | Alloy `:4317` → Tempo |
| **Metrics** | Hand-rolled RPC instruments (`GrpcInstrumentation` emits traces only) + Node runtime gauges, `PeriodicExportingMetricReader` over OTLP/gRPC every 15 s (replaces the Prometheus exporter) | Alloy → Mimir |
| **Logs** | `pino` JSON to stdout **and** `@opentelemetry/instrumentation-pino` forwarding records over OTLP/gRPC with trace ids | Alloy → Loki |
| **Profiles** | `@pyroscope/nodejs`, tagged with `version` | Alloy `:4040` → Pyroscope |

Metric names: `rpc_server_duration_seconds_{bucket,count,sum}` (buckets 1 ms … 10 s; the unit `s` yields the `_seconds` suffix), `rpc_server_requests_total`, `rpc_server_active_requests` (labels `rpc_system`, `rpc_service`, `rpc_method`, `rpc_grpc_status_code`), plus `nodejs_*` runtime gauges (heap, RSS, CPU, event-loop lag, active handles). The event-loop lag is sampled with Node's `monitorEventLoopDelay` histogram — the earlier self-rescheduling `setTimeout(0)` probe kept an idle pod at ~25 % CPU, which would have kept an HPA scaling out.

Every series carries `job="currency-service"` (from `service.name`) and `instance=<pod name>` (`service.instance.id`), which is what the Grafana dashboards select on. Logs land in Loki with `service_name="currency-service"` and trace/span ids, so a log line links to its trace.

## Running locally

Requirements: Node.js 22 (`.nvmrc`), Docker, [`grpcurl`](https://github.com/fullstorydev/grpcurl).

```bash
npm ci
npm run build && npm start          # compiled
npm run dev                         # ts-node, no build step
npm run client                      # built-in smoke-test client (talks to localhost:$PORT)
npm test                            # jest unit tests
npm run lint && npm run typecheck

docker build -t currency-service .
docker run --rm -p 7000:7000 -e PORT=7000 currency-service
```

### Manual gRPC testing (no reflection — pass the proto)

```bash
grpcurl -plaintext -proto proto/currency.proto -d '{}' \
  localhost:7000 hipstershop.CurrencyService/GetSupportedCurrencies

grpcurl -plaintext -proto proto/currency.proto \
  -d '{"from": {"currency_code": "USD", "units": 100, "nanos": 0}, "to_code": "EUR"}' \
  localhost:7000 hipstershop.CurrencyService/Convert

grpcurl -plaintext -proto proto/health.proto localhost:7000 grpc.health.v1.Health/Check
```

## Project structure

```
├── src/
│   ├── server.ts        # gRPC server bootstrap, handlers (GetSupportedCurrencies, Convert, Check)
│   ├── currency.ts      # pure conversion logic (carry, convertMoney)
│   ├── telemetry.ts     # OTel SDK, Prometheus exporter, RPC metrics, runtime gauges, Pyroscope
│   └── client.ts        # smoke-test client
├── proto/               # currency.proto, health.proto (loaded at runtime by @grpc/proto-loader)
├── data/currency_conversion.json   # EUR-based rates (33 currencies)
├── package.json / package-lock.json / tsconfig.json
├── Dockerfile
├── .dockerignore / .nvmrc / .eslintrc.cjs / .prettierrc / .trivyignore
└── docs/                # empty placeholder
```

## Known limitations

- Rates are a static snapshot; they are never refreshed.
- The rates file is read and parsed from disk on every request (cheap for 33 entries, but not free).
- Conversion uses floating-point arithmetic and truncates; results can be off by a nano-unit.
- `SIGTERM` does not terminate the process (see Graceful shutdown).
- The Docker `HEALTHCHECK` depends on `PORT` being set.
