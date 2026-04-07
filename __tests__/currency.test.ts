import { carry, convertMoney, Money, CurrencyData } from '../src/currency';

// ---------------------------------------------------------------------------
// Test data — mirrors the real data/currency_conversion.json
// ---------------------------------------------------------------------------

const RATES: CurrencyData = {
  EUR: '1.0',
  USD: '1.1305',
  CHF: '1.1360',
  GBP: '0.85970',
  JPY: '126.40',
  BGN: '1.9558',
  CZK: '25.592',
};

// ---------------------------------------------------------------------------
// carry()
// ---------------------------------------------------------------------------

describe('carry()', () => {
  it('leaves a clean integer amount unchanged', () => {
    const m: Money = { currency_code: 'EUR', units: 100, nanos: 0 };
    const result = carry(m);
    expect(result.units).toBe(100);
    expect(result.nanos).toBe(0);
  });

  it('absorbs nanos overflow into units', () => {
    const m: Money = { currency_code: 'EUR', units: 1, nanos: 1_500_000_000 };
    const result = carry(m);
    expect(result.units).toBe(2);
    expect(result.nanos).toBe(500_000_000);
  });

  it('handles fractional units by moving them into nanos', () => {
    const m: Money = { currency_code: 'USD', units: 1.5, nanos: 0 };
    const result = carry(m);
    expect(result.units).toBe(1);
    expect(result.nanos).toBeCloseTo(500_000_000, -3);
  });

  it('handles zero amount', () => {
    const m: Money = { currency_code: 'EUR', units: 0, nanos: 0 };
    const result = carry(m);
    expect(result.units).toBe(0);
    expect(result.nanos).toBe(0);
  });

  it('handles large amounts without overflow', () => {
    const m: Money = { currency_code: 'JPY', units: 1_000_000, nanos: 0 };
    const result = carry(m);
    expect(result.units).toBe(1_000_000);
    expect(result.nanos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// convertMoney()
// ---------------------------------------------------------------------------

describe('convertMoney()', () => {
  // ── happy paths ──────────────────────────────────────────────────────────

  it('returns EUR unchanged when converting EUR → EUR', () => {
    const from: Money = { currency_code: 'EUR', units: 100, nanos: 0 };
    const result = convertMoney(from, 'EUR', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('EUR');
    expect(result.value.units).toBe(100);
  });

  it('converts USD → EUR correctly', () => {
    // 113.05 USD = 100 EUR (rate 1.1305)
    const from: Money = { currency_code: 'USD', units: 113, nanos: 50_000_000 };
    const result = convertMoney(from, 'EUR', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('EUR');
    // Should be ~99 EUR (minor rounding tolerance of ±1 unit)
    expect(result.value.units).toBeGreaterThanOrEqual(99);
    expect(result.value.units).toBeLessThanOrEqual(100);
  });

  it('converts CHF → USD (cross-currency via EUR base)', () => {
    // 300 CHF → EUR → USD
    const from: Money = { currency_code: 'CHF', units: 300, nanos: 0 };
    const result = convertMoney(from, 'USD', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('USD');
    // 300 / 1.136 * 1.1305 ≈ 298.44 USD
    expect(result.value.units).toBeGreaterThanOrEqual(297);
    expect(result.value.units).toBeLessThanOrEqual(300);
  });

  it('converts EUR → JPY correctly', () => {
    // 1 EUR = 126.40 JPY
    const from: Money = { currency_code: 'EUR', units: 1, nanos: 0 };
    const result = convertMoney(from, 'JPY', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('JPY');
    expect(result.value.units).toBe(126);
  });

  it('converts GBP → EUR correctly (rate < 1)', () => {
    // 0.8597 GBP = 1 EUR, so 100 GBP ≈ 116.32 EUR
    const from: Money = { currency_code: 'GBP', units: 100, nanos: 0 };
    const result = convertMoney(from, 'EUR', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('EUR');
    expect(result.value.units).toBeGreaterThanOrEqual(115);
    expect(result.value.units).toBeLessThanOrEqual(117);
  });

  it('handles nanos-only amounts (less than 1 unit)', () => {
    const from: Money = { currency_code: 'EUR', units: 0, nanos: 500_000_000 };
    const result = convertMoney(from, 'USD', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('USD');
  });

  it('converts zero amount', () => {
    const from: Money = { currency_code: 'EUR', units: 0, nanos: 0 };
    const result = convertMoney(from, 'USD', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.units).toBe(0);
    expect(result.value.nanos).toBe(0);
  });

  it('sets the correct currency_code on the result', () => {
    const from: Money = { currency_code: 'EUR', units: 10, nanos: 0 };
    const result = convertMoney(from, 'CZK', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currency_code).toBe('CZK');
  });

  // ── error paths ───────────────────────────────────────────────────────────

  it('returns INVALID_ARGUMENT for an unknown source currency', () => {
    const from: Money = { currency_code: 'XYZ', units: 100, nanos: 0 };
    const result = convertMoney(from, 'USD', RATES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_ARGUMENT');
    expect(result.message).toMatch(/XYZ/);
  });

  it('returns INVALID_ARGUMENT for an unknown target currency', () => {
    const from: Money = { currency_code: 'EUR', units: 100, nanos: 0 };
    const result = convertMoney(from, 'ABC', RATES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_ARGUMENT');
    expect(result.message).toMatch(/ABC/);
  });

  it('returns INVALID_ARGUMENT when both currencies are unknown', () => {
    const from: Money = { currency_code: 'FOO', units: 1, nanos: 0 };
    const result = convertMoney(from, 'BAR', RATES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_ARGUMENT');
  });

  // ── consistency ───────────────────────────────────────────────────────────

  it('round-trip EUR → USD → EUR stays within 1 unit', () => {
    const original: Money = { currency_code: 'EUR', units: 500, nanos: 0 };
    const toUsd = convertMoney(original, 'USD', RATES);
    expect(toUsd.ok).toBe(true);
    if (!toUsd.ok) return;

    const backToEur = convertMoney(toUsd.value, 'EUR', RATES);
    expect(backToEur.ok).toBe(true);
    if (!backToEur.ok) return;

    expect(Math.abs(backToEur.value.units - original.units)).toBeLessThanOrEqual(1);
  });

  it('BGN is pegged close to EUR (1.9558), conversion is proportional', () => {
    const from: Money = { currency_code: 'EUR', units: 100, nanos: 0 };
    const result = convertMoney(from, 'BGN', RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ~195–196 BGN
    expect(result.value.units).toBeGreaterThanOrEqual(195);
    expect(result.value.units).toBeLessThanOrEqual(196);
  });
});