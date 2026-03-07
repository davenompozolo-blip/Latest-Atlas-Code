# Latest-Atlas-Code

## Supabase backend scaffolding

This repository now includes Supabase scaffolding for persistent portfolio data while keeping existing Alpaca sync/business logic untouched.

### What was added

- `supabase/config.toml` for local Supabase project configuration.
- `supabase/migrations/20260306211500_initial_portfolio_schema.sql` with initial schema for:
  - `portfolios`
  - `assets`
  - `positions`
  - `transactions`
  - `price_history`
- `services/supabaseClient.js` as a modular Supabase client initializer.
- `services/portfolioQueries.js` with example query helpers for:
  - fetch portfolios
  - fetch positions for a portfolio
- `services/portfolioDataService.js` with modular insert + fetch functions for persistent portfolio workflows.
- Environment variable support in `config/config.py` for:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

## Setup

### 1. Install Supabase client dependency

Install the JavaScript client package in your local environment:

```bash
npm install @supabase/supabase-js
```

### 2. Initialize / verify Supabase project files

If starting fresh:

```bash
supabase init
```

In this repo, the scaffold is already present under `supabase/` with config and migrations.

### 3. Configure environment variables

Set the following in your environment or local `.env` (never commit secrets):

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY"
```

### 4. Apply migrations in your Supabase project

Apply the migration SQL from `supabase/migrations/20260306211500_initial_portfolio_schema.sql` in Supabase SQL Editor (or your deployment pipeline).

## Portfolio data service API

`services/portfolioDataService.js` is intentionally independent of Alpaca sync and only accepts data payloads for inserts/queries.

### Insert functions

- `insertPortfolio(portfolioInput)`
- `upsertAsset(assetInput)`
- `insertPosition(positionInput)`
- `insertTransaction(transactionInput)`
- `insertPriceHistory(priceInput)`

Duplicate checks are included for:

- positions on `(portfolio_id, asset_id, as_of_date)`
- transactions on `(portfolio_id, external_id)` when `external_id` is provided, with a deterministic fallback check when not provided
- price history on `(asset_id, price_date)`

### Fetch functions

- `fetchPortfolioWithPositions(portfolioId)`
- `fetchPortfolioSnapshot(portfolioId, snapshotDate)`
- `fetchPortfolios()` (in `services/portfolioQueries.js`)
- `fetchPositionsForPortfolio(portfolioId)` (in `services/portfolioQueries.js`)

## Manual verification scripts

### Node demo (insert + fetch with example rows)

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co" \
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY" \
node scripts/supabaseDemo.mjs
```

This script inserts example rows for `portfolios`, `assets`, `positions`, `transactions`, and `price_history`, then prints a joined portfolio view + dated snapshot.

### Python demo (read rows from Supabase REST API)

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co" \
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY" \
python scripts/supabase_fetch_demo.py
```

This script fetches and prints recent rows from `portfolios`, `positions`, and `price_history`.

## Notes

- Supabase integration is modular so Claude Code can extend it without refactoring existing Atlas analytics modules.
- Existing Alpaca sync functionality was not modified.
