# Data Trust — coercing untrusted vendor data

## The principle

> Coercing external data into a strict type must **degrade to NULL, never throw**,
> and it must happen **once at the ingestion boundary** — never lazily in the
> consumer. A bad vendor value should cost one "—" cell, never a 500 on a whole
> page.

Vendor feeds (Finnhub, Alpha Vantage, Yahoo) are untyped and inconsistent: a
market cap arrives as `"245334658571.99997"`, an earnings date as `""` or
`"None"`, a percentage sometimes as a fraction and sometimes as a percent. When
we cast that text straight into a strict SQL type, **one** malformed row throws
and the entire view fails — which is how the Equity/Valuation screener went fully
dark on a single Citigroup row (`invalid input syntax for type bigint`).

## The rules

### 1. SQL views — never cast vendor JSON straight to a strict type

```sql
-- ❌ NEVER — one bad row kills the whole view
(ec.payload ->> 'MarketCapitalization')::bigint
(co.payload -> 'overview' ->> 'NextEarningsDate')::date

-- ✅ ALWAYS — bad value becomes NULL, the surface stays up
public.safe_bigint(ec.payload ->> 'MarketCapitalization')
public.safe_date(co.payload -> 'overview' ->> 'NextEarningsDate')
```

Helpers (see `supabase/migrations/20260621010000_safe_cast_helpers.sql`):

| Helper | Returns | Notes |
|---|---|---|
| `safe_numeric(text)` | `numeric` | NULL on any parse failure |
| `safe_bigint(text)` | `bigint` | goes via numeric, so it **rounds** decimals; NULL on failure |
| `safe_date(text)` | `date` | NULL on `''`, `'None'`, `'0000-00-00'`, junk |

This is enforced in CI by `scripts/check-unsafe-casts.mjs`
(`.github/workflows/data-trust.yml`): any new migration with a bare
`->> ... ::bigint/int/date/timestamp` fails the build.

### 2. Ingestion — normalize at the boundary, once

Coerce to canonical **type and unit** when data is written to the cache, not
when it is read:

- **Integer-domain fields** (market cap, share counts) — round before storing.
  `api/equity.js` uses `intVal()` so the cache never holds meaningless precision
  like `…571.99997`.
- **Dates** — normalize to ISO `YYYY-MM-DD` or omit; never store `"None"`/`""`.
- **Percent vs fraction** — pick one convention per field and convert at
  ingestion. (ROE/RevGrowth/Dividend differ between Finnhub percent and AV
  fraction — a naive ×100 fallback is a 100× scale trap. See PR #661.)

### 3. Price ingestion — validate against an independent source

A vendor price feed can return a **distorted series** for a symbol — typically a
corporate-action / split mis-adjustment on a recent spin-off — that inflates
*every* bar uniformly from day one. Because the inflation is internally
consistent, a day-over-day jump check can't see it, and a newly added symbol has
no trusted history to compare against. This corrupted SNDK (~27×), MU (~10×) and
GEV (~2×) — and with no cross-check, every downstream valuation, upside and
signal for those names was wrong.

Rule: before writing an Alpaca series, validate its latest close against an
**independent** reference (Stooq — not Alpaca, not yfinance). A gross divergence
(> `MAX_DIVERGENCE`, 30%) **quarantines** the symbol — it is not written, and the
sync exits non-zero so it surfaces. Helpers live in `scripts/lib/price-guard.mjs`
(`assessClose`, `fetchStooqClose`), enforced in `scripts/backfill-price-history.mjs`.
A legit cross-feed difference is <5%, so 30% false-positives on nothing real
while catching every corruption seen.

### 4. Scale discipline downstream

Money is absolute, ratios are ratios, margins/growth/ROE are fractions, and the
display layer multiplies fractions by 100 exactly once. A value that is "1.4×
too big" or "100× too big" is the same class of bug as a hard cast error — it
just fails silently instead of loudly. Treat both as defects.

## When you add a feed or a view

1. Write/extend the ingestion normalizer so the stored value is canonical.
2. In any view, read vendor JSON through `safe_*` — never a bare cast.
3. `node scripts/check-unsafe-casts.mjs` locally; CI runs it on every PR that
   touches `supabase/migrations/**`.
