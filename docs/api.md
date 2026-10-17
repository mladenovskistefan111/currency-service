# API

Package `hipstershop`, service `CurrencyService` ([`proto/currency.proto`](https://github.com/platform-boutique/app-currency-service/blob/main/proto/currency.proto)); health in [`proto/health.proto`](https://github.com/platform-boutique/app-currency-service/blob/main/proto/health.proto).

| Method | Request | Response | Behaviour |
|---|---|---|---|
| `GetSupportedCurrencies` | `Empty` | `{ repeated string currency_codes }` | Returns all codes present in the rates file |
| `Convert` | `{ Money from, string to_code }` | `Money` | Converts `from` → EUR → `to_code`. Unknown source or target code → gRPC `INVALID_ARGUMENT` |

`Money` = `{ currency_code, int64 units, int32 nanos }`.

**Supported currencies (33):** EUR, USD, JPY, BGN, CZK, DKK, GBP, HUF, PLN, RON, SEK, CHF, ISK, NOK, HRK, RUB, TRY, AUD, BRL, CAD, CNY, HKD, IDR, ILS, INR, KRW, MXN, MYR, NZD, PHP, SGD, THB, ZAR. (The frontend only exposes USD, EUR, CAD, JPY, GBP, TRY.)

Rates live in [`data/currency_conversion.json`](https://github.com/platform-boutique/app-currency-service/blob/main/data/currency_conversion.json) as `"CODE": "rate-per-1-EUR"` strings. To change rates, edit the file and rebuild the image (or mount a new file over `/app/data/currency_conversion.json` — the file is re-read on **every** request, so no restart is needed).
