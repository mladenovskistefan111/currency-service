/**
 * Pure currency conversion logic, extracted from server.ts so it can be
 * unit-tested without starting a gRPC server or touching telemetry.
 */

export interface Money {
  currency_code: string;
  units: number;
  nanos: number;
}

export type CurrencyData = Record<string, string>;

/**
 * Normalises a Money amount so that nanos stays within [-999_999_999, 999_999_999]
 * and the whole units absorb any overflow.
 */
export function carry(amount: Money): Money {
  const fractionSize = 1e9;
  amount.nanos += (amount.units % 1) * fractionSize;
  amount.units = Math.floor(amount.units) + Math.floor(amount.nanos / fractionSize);
  amount.nanos = amount.nanos % fractionSize;
  return amount;
}

export type ConvertResult =
  | { ok: true; value: Money }
  | { ok: false; code: 'INVALID_ARGUMENT'; message: string };

/**
 * Converts a Money amount from one currency to another using the provided
 * currency data (rates relative to EUR as base).
 */
export function convertMoney(from: Money, toCode: string, data: CurrencyData): ConvertResult {
  if (!data[from.currency_code]) {
    return {
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: `Unknown source currency: ${from.currency_code}`,
    };
  }
  if (!data[toCode]) {
    return {
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: `Unknown target currency: ${toCode}`,
    };
  }

  const fromRate = parseFloat(data[from.currency_code]);
  const toRate = parseFloat(data[toCode]);

  const euros = carry({
    currency_code: 'EUR',
    units: from.units / fromRate,
    nanos: from.nanos / fromRate,
  });
  euros.nanos = Math.round(euros.nanos);

  const result = carry({
    currency_code: toCode,
    units: euros.units * toRate,
    nanos: euros.nanos * toRate,
  });

  result.units = Math.floor(result.units);
  result.nanos = Math.floor(result.nanos);
  result.currency_code = toCode;

  return { ok: true, value: result };
}
