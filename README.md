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
- Environment variable support in `config/config.py` for:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

## Setup

### 1. Install Supabase CLI

Install the Supabase CLI in your local environment (examples):

- macOS (Homebrew): `brew install supabase/tap/supabase`
- npm: `npm install supabase --save-dev`
- Other options: https://supabase.com/docs/guides/cli

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

### 4. Run Supabase locally and apply migrations

```bash
supabase start
supabase db reset
```

### 5. Use the modular query helpers

```javascript
import { fetchPortfolios, fetchPositionsForPortfolio } from './services/portfolioQueries';

const portfolios = await fetchPortfolios();
const positions = await fetchPositionsForPortfolio(portfolios[0].id);
```

## Notes

- Supabase integration is intentionally modular so it can be extended later without disrupting existing Atlas services.
- Existing Alpaca sync functionality was not modified.
