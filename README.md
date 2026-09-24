# ATLAS Terminal

Institutional-grade portfolio analytics over a live Alpaca paper book: risk and
regime analysis, a valuation and equity-research house, performance
attribution, and an order ticket. Multi-account: the terminal's account
switcher moves every book-level panel between Alpaca accounts.

## Stack

| Layer | Technology | Where |
|---|---|---|
| Terminal | React 18 + Vite single-page app | `src/`, deployed to Vercel |
| API routes | Vercel Node functions | `api/*.js` |
| Database & compute | Supabase Postgres — views, materialised views, nightly SQL jobs | `supabase/migrations/` |
| Syncs & loaders | Supabase edge functions (Deno) | `supabase/functions/` |
| Scheduler | `pg_cron` — the only scheduler | `cron.job` |
| Data sources | Alpaca, Yahoo, FRED, Finnhub, Alpha Vantage, SEC EDGAR | |

Most analytics are computed **in the database** and read by the browser over
PostgREST; the React layer renders them and holds the pure compute that is
tested in `src/lib/*.test.mjs`.

## Running locally

```bash
npm install
export VITE_SUPABASE_ANON_KEY=<publishable key>   # required: a keyless build omits most queries
npm run dev        # pages on http://localhost:3000; /api/* routes need `vercel dev`
npm run build      # production build into dist/
node --test $(find src -name '*.test.mjs' -not -path '*/node_modules/*')
```

## Where to read next

- **`CLAUDE.md`** — architecture, conventions, and the running record of every
  data-integrity decision and why it was made. Read it before changing a view,
  a sync or a scheduled job.
- **`docs/`** — one report per unit of work (A0…H4, EQ1…EQ9, MP-*).

## Legacy

The original Streamlit build and its FastAPI companion (`atlas_app.py`, `core/`,
`ui/`, `navigation/`, `scheduler/`, `api/main.py`, `requirements*.txt`, Docker
files) are **retired and not deployed**. They remain in the repository until
`scripts/retire-streamlit.sh` archives and removes them; do not use them to
understand how Atlas works today.
