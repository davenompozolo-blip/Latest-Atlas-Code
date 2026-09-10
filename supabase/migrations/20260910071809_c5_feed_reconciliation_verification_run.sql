-- Verification run of the C5 writer, so the sync_log / atlas_validation_log
-- path is proven rather than assumed before its first unattended fire.
--
-- Result (sync_log #46249): status partial, duration_ms 515 (real, so the
-- clock_timestamp() convention holds), 67 pairs compared, 0 diverged,
-- worst 7.30 bp, 13 Alpaca bars missing. atlas_validation_log carries the
-- matching feed_reconciliation row.
select public.atlas_run_feed_reconciliation();
