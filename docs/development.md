# Develop & test

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
