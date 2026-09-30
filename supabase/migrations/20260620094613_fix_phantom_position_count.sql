-- B-05 source: vw_command_centre.position_count counted DISTINCT ON(asset_id)
-- across ALL history (latest_pos), so it included every asset ever held (80),
-- not the current book (≈67). Filter to current, non-zero holdings (latest
-- snapshot, 7-day window) — matching vw_screener's latest_pos logic. Other CTEs
-- that read latest_pos (pos_pnl) are unaffected: phantom rows have quantity=0
-- and contribute 0 to total_invested/unrealised_pnl. Applied via regexp over
-- the live definition to avoid transcribing the view.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('vw_command_centre'::regclass, true);
  d := regexp_replace(d,
    'SELECT count\(\*\) AS n\s+FROM latest_pos\s*\)',
    'SELECT count(*) AS n FROM latest_pos WHERE latest_pos.quantity <> 0 AND latest_pos.as_of_date >= ((SELECT max(p2.as_of_date) FROM positions p2) - 7) )');
  EXECUTE 'CREATE OR REPLACE VIEW vw_command_centre AS ' || d;
END $$;
