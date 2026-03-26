import { startRpcMetrics } from './telemetry'; // must be first — instruments before anything else loads
import path from 'path';
import fs from 'fs';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { pino } from 'pino';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  name: 'currency-service',
  messageKey: 'message',
  formatters: {
    level(label) {
      return { severity: label };
    },
  },
});

// ---------------------------------------------------------------------------
// Proto loading
// ---------------------------------------------------------------------------

const CURRENCY_PROTO_PATH = path.join(__dirname, '../proto/currency.proto');
const HEALTH_PROTO_PATH = path.join(__dirname, '../proto/health.proto');

function loadProto(protoPath: string) {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

const currencyProto = (loadProto(CURRENCY_PROTO_PATH) as any).hipstershop;
const healthProto = (loadProto(HEALTH_PROTO_PATH) as any).grpc.health.v1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Money {
  currency_code: string;
  units: number;
  nanos: number;
}

interface CurrencyConversionRequest {
  from: Money;
  to_code: string;
}

type CurrencyData = Record<string, string>;

// ---------------------------------------------------------------------------
// Currency data
// ---------------------------------------------------------------------------

const CURRENCY_DATA_PATH = path.join(__dirname, '../data/currency_conversion.json');

function getCurrencyData(): CurrencyData {
  const raw = fs.readFileSync(CURRENCY_DATA_PATH, 'utf-8');
  return JSON.parse(raw) as CurrencyData;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Normalises a Money amount so that nanos stays within [-999_999_999, 999_999_999]
 * and the whole units absorb any overflow.
 */
function carry(amount: Money): Money {
  const fractionSize = 1e9;
  amount.nanos += (amount.units % 1) * fractionSize;
  amount.units = Math.floor(amount.units) + Math.floor(amount.nanos / fractionSize);
  amount.nanos = amount.nanos % fractionSize;
  return amount;
}

// ---------------------------------------------------------------------------
// gRPC handlers
// ---------------------------------------------------------------------------

function getSupportedCurrencies(
  _call: grpc.ServerUnaryCall<unknown, unknown>,
  callback: grpc.sendUnaryData<{ currency_codes: string[] }>,
): void {
  const endMetrics = startRpcMetrics('GetSupportedCurrencies');
  logger.info('Getting supported currencies');
  try {
    const data = getCurrencyData();
    endMetrics(grpc.status.OK);
    callback(null, { currency_codes: Object.keys(data) });
  } catch (err) {
    logger.error({ err }, 'Failed to get supported currencies');
    endMetrics(grpc.status.INTERNAL);
    callback({ code: grpc.status.INTERNAL, message: 'Failed to load currency data' });
  }
}

function convert(
  call: grpc.ServerUnaryCall<CurrencyConversionRequest, Money>,
  callback: grpc.sendUnaryData<Money>,
): void {
  const endMetrics = startRpcMetrics('Convert');
  try {
    const data = getCurrencyData();
    const { from, to_code } = call.request;

    if (!data[from.currency_code]) {
      endMetrics(grpc.status.INVALID_ARGUMENT);
      callback({ code: grpc.status.INVALID_ARGUMENT, message: `Unknown source currency: ${from.currency_code}` });
      return;
    }
    if (!data[to_code]) {
      endMetrics(grpc.status.INVALID_ARGUMENT);
      callback({ code: grpc.status.INVALID_ARGUMENT, message: `Unknown target currency: ${to_code}` });
      return;
    }

    const fromRate = parseFloat(data[from.currency_code]);
    const toRate = parseFloat(data[to_code]);

    // Convert to EUR (base), then to target currency
    const euros = carry({
      currency_code: 'EUR',
      units: from.units / fromRate,
      nanos: from.nanos / fromRate,
    });
    euros.nanos = Math.round(euros.nanos);

    const result = carry({
      currency_code: to_code,
      units: euros.units * toRate,
      nanos: euros.nanos * toRate,
    });

    result.units = Math.floor(result.units);
    result.nanos = Math.floor(result.nanos);
    result.currency_code = to_code;

    logger.info({ from: from.currency_code, to: to_code }, 'Currency conversion successful');
    endMetrics(grpc.status.OK);
    callback(null, result);
  } catch (err) {
    logger.error({ err }, 'Currency conversion failed');
    endMetrics(grpc.status.INTERNAL);
    callback({ code: grpc.status.INTERNAL, message: 'Conversion failed' });
  }
}

function check(
  _call: grpc.ServerUnaryCall<unknown, unknown>,
  callback: grpc.sendUnaryData<{ status: string }>,
): void {
  callback(null, { status: 'SERVING' });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function main(): void {
  const port = process.env.PORT ?? '7000';

  const server = new grpc.Server();
  server.addService(currencyProto.CurrencyService.service, { getSupportedCurrencies, convert });
  server.addService(healthProto.Health.service, { check });

  server.bindAsync(
    `[::]:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        logger.error({ err }, 'Failed to bind gRPC server');
        process.exit(1);
      }
      logger.info({ port: boundPort }, 'CurrencyService gRPC server started');
    },
  );
}

main();