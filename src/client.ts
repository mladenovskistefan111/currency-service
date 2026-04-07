/**
 * Smoke-test client for the CurrencyService.
 * Run with: npx ts-node src/client.ts
 */

import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { pino } from 'pino';

const logger = pino({
  name: 'currency-service-client',
  messageKey: 'message',
  formatters: {
    level(label) {
      return { severity: label };
    },
  },
});

const PROTO_PATH = path.join(__dirname, '../proto/currency.proto');
const PORT = process.env.PORT ?? '7000';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const shopProto = (grpc.loadPackageDefinition(packageDefinition) as any).hipstershop;

const client = new shopProto.CurrencyService(
  `localhost:${PORT}`,
  grpc.credentials.createInsecure(),
);

interface Money {
  currency_code: string;
  units: number;
  nanos: number;
}

function moneyToString(m: Money): string {
  return `${m.units}.${m.nanos.toString().padStart(9, '0')} ${m.currency_code}`;
}

// -- GetSupportedCurrencies --
client.getSupportedCurrencies({}, (err: Error | null, response: { currency_codes: string[] }) => {
  if (err) {
    logger.error({ err }, 'getSupportedCurrencies failed');
    return;
  }
  logger.info({ currency_codes: response.currency_codes }, 'Supported currencies');
});

// -- Convert --
const conversionRequest = {
  from: { currency_code: 'CHF', units: 300, nanos: 0 },
  to_code: 'EUR',
};

client.convert(conversionRequest, (err: Error | null, response: Money) => {
  if (err) {
    logger.error({ err }, 'convert failed');
    return;
  }
  logger.info(`${moneyToString(conversionRequest.from)} → ${moneyToString(response)}`);
});
