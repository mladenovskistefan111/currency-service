#!/usr/bin/env bash
# Service-specific smoke check run by the shared Node CI after the gRPC health check passes.
# Env from the workflow: GRPCURL (path to grpcurl), SMOKE_PORT.
set -euo pipefail

response=$("$GRPCURL" -plaintext \
  -import-path ./proto \
  -proto currency.proto \
  "localhost:${SMOKE_PORT}" hipstershop.CurrencyService/GetSupportedCurrencies)
if ! echo "$response" | grep -q '"EUR"'; then
  echo "FAIL: EUR not found in supported currencies"
  echo "$response"
  exit 1
fi
count=$(echo "$response" | grep -o '"[A-Z][A-Z][A-Z]"' | wc -l)
echo "PASS: GetSupportedCurrencies returned $count currency codes"
