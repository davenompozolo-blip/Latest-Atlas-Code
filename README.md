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
- JavaScript modules:
  - `services/supabaseClient.js`
  - `services/portfolioQueries.js`
  - `services/portfolioDataService.js`
- Python Alpaca ingestion modules:
  - `services/supabase_client.py`
  - `services/data_normalizer.py`
  - `services/alpaca_sync.py`
- Environment variable support in `config/config.py` for:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
npm install @supabase/supabase-js
```

### 2. Configure environment variables

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY"
ALPACA_API_KEY="YOUR_ALPACA_KEY"
ALPACA_API_SECRET="YOUR_ALPACA_SECRET"
ALPACA_PAPER="true"
```

### 3. Apply migrations in Supabase

Apply `supabase/migrations/20260306211500_initial_portfolio_schema.sql` via Supabase SQL Editor or deployment pipeline.

## Python Alpaca → Supabase pipeline

Run manually:

```bash
python -m services.alpaca_sync --order-limit 200 --log-level INFO
```

Pipeline stages:

1. `connect_to_alpaca()`
2. `fetch_data()` (account, positions, orders)
3. `normalize_data()`
4. `write_to_supabase()`

### Idempotency strategy

- Portfolios: upsert by `external_id`.
- Assets: upsert by `symbol`.
- Positions: upsert by `(portfolio_id, asset_id, as_of_date)`.
- Transactions: upsert by `(portfolio_id, external_id)`; synthetic external IDs are generated when absent.

### Normalization guarantees

`services/data_normalizer.py` enforces:

- uppercase symbols
- numeric quantities/prices
- ISO 8601 timestamps

## Manual verification scripts

### Node demo (insert + fetch with example rows)

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co" \
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY" \
node scripts/supabaseDemo.mjs
```

### Python demo (read rows from Supabase REST API)

```bash
SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co" \
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_PUBLIC_KEY" \
python scripts/supabase_fetch_demo.py
```

## Notes

- Supabase integration is modular so Claude Code can extend it without refactoring existing Atlas analytics modules.
- Existing Alpaca sync functionality was not modified.
