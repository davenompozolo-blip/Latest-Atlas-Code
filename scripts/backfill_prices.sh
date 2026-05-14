#!/usr/bin/env bash
# scripts/backfill_prices.sh
#
# One-off backfill of price_history via the sync_alpaca_prices Edge Function.
# Fills the 2026-03-28 → today gap. Two trading days of overlap (start =
# 2026-03-25) is intentional: the ON CONFLICT clause overwrites those yfinance
# rows with Alpaca data so there's no source mix on overlap dates going forward.
#
# Prerequisites:
#   1. Migration 20260512000000_fix_price_history_interval applied
#   2. Migration 20260512000002_data_freshness_v2 applied
#   3. Edge Function sync_alpaca_prices deployed (--no-verify-jwt)
#   4. Secrets present: supabase secrets list
#      → Expect: ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_DB_URL
#
# Usage:
#   SUPABASE_URL=https://vdmojjszvvcithuxwexx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
#   ./scripts/backfill_prices.sh
#
# Optional overrides:
#   START=2026-01-01          override start date (default: 2026-03-25)
#   END=2026-05-13            override end date   (default: today UTC)
#   DRY_RUN=true              validate without upserting

set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://vdmojjszvvcithuxwexx.supabase.co)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

START="${START:-2026-03-25}"
END="${END:-$(date -u +%Y-%m-%d)}"
DRY_RUN="${DRY_RUN:-false}"

echo "→ ATLAS Price History Backfill"
echo "  Range:   ${START} → ${END}"
echo "  Dry run: ${DRY_RUN}"
echo ""

RESPONSE=$(curl --fail-with-body -sS -X POST \
  "${SUPABASE_URL}/functions/v1/sync_alpaca_prices" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"start_date\":\"${START}\",\"end_date\":\"${END}\",\"dry_run\":${DRY_RUN}}" \
)

echo "${RESPONSE}" | jq .

# Extract key metrics and surface them clearly
UPSERTED=$(echo "${RESPONSE}" | jq -r '.upserted // 0')
ROWS_BUILT=$(echo "${RESPONSE}" | jq -r '.rows_built // 0')
MISSING=$(echo "${RESPONSE}" | jq -r '.missing_symbol_count // 0')

echo ""
if [ "${DRY_RUN}" = "true" ]; then
  echo "✓ Dry run complete — ${ROWS_BUILT} rows would be upserted, ${MISSING} symbols returned no bars"
else
  echo "✓ Backfill complete — ${UPSERTED} rows upserted, ${MISSING} symbols returned no bars"
  echo ""
  echo "Next steps:"
  echo "  1. Run validation queries in supabase/migrations/validation_queries.sql"
  echo "  2. Confirm price_date in vw_portfolio_home is a recent weekday"
  echo "  3. Apply migration 20260513000000_schedule_price_sync.sql"
fi
