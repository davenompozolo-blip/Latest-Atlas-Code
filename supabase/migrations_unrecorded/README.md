# Migrations the ledger does not record as written

Reconciled 2026-09-30. `supabase/migrations/` is now an exact mirror of
`supabase_migrations.schema_migrations`: one file per ledger row, holding the SQL that
row ran (378 rows, 378 files). This folder holds everything that did not fit that rule.
Nothing here is applied by the Supabase CLI, which reads `supabase/migrations/` only.

**Why it moved.** 187 files carried versions the ledger does not have, so `supabase db push`
would have tried to apply all of them -- `initial_portfolio_schema` included -- over production.
Separately, many files differed in code from what ran under their version. A file that claims
to define an object and does not match what ran is worse than no file.

**These files are history, not the schema.** Several objects defined here were later patched
through raw SQL, so the live database is the authority; read the object itself
(`pg_get_viewdef`, `pg_get_functiondef`) before trusting any file in either folder.
`never applied or since dropped` means none, or only some, of the tables, views and
functions the file creates exist in production today.

Re-check with `node scripts/check-migration-ledger.mjs` (needs `SUPABASE_ACCESS_TOKEN`).

| file (here) | class | the ledger's version of it in `migrations/` |
|---|---|---|
| `20260306211500_initial_portfolio_schema.sql` | applied before/outside the ledger | -- |
| `20260307000000_price_history_market_data_columns.sql` | applied before/outside the ledger | -- |
| `20260329000000_org_model.sql` | never applied or since dropped | -- |
| `20260329000001_rls_policies.sql` | never applied or since dropped | -- |
| `20260329000002_sync_jobs.sql` | never applied or since dropped | -- |
| `20260404000000_sync_log.sql` | applied before/outside the ledger | -- |
| `20260405000000_alpaca_full_sync.sql` | never applied or since dropped | -- |
| `20260405010000_drop_legacy_duplicate_tables.sql` | applied before/outside the ledger | -- |
| `20260405020000_backfill_broker_account_link.sql` | applied before/outside the ledger | -- |
| `20260405030000_nav_daily_granular.sql` | applied before/outside the ledger | -- |
| `20260405040000_nav_daily_fix_tx_type.sql` | applied before/outside the ledger | -- |
| `20260405050000_anon_read_policies.sql` | applied before/outside the ledger | -- |
| `20260406000000_side_cash_leverage.sql` | applied before/outside the ledger | -- |
| `20260412000000_portfolio_home_enhanced.sql` | applied before/outside the ledger | -- |
| `20260412010000_fix_pnl_sectors_filter.sql` | applied before/outside the ledger | -- |
| `20260416120000_equity_cache.sql` | applied before/outside the ledger | -- |
| `20260425000000_earnings_calendar_view.sql` | applied before/outside the ledger | -- |
| `20260427100000_portfolio_history_cron.sql` | applied before/outside the ledger | -- |
| `20260512000000_fix_price_history_interval.sql` | applied before/outside the ledger | -- |
| `20260512000001_data_freshness_rpc.sql` | applied before/outside the ledger | -- |
| `20260512000002_data_freshness_v2.sql` | applied before/outside the ledger | -- |
| `20260513000000_schedule_price_sync.sql` | applied before/outside the ledger | -- |
| `20260515000000_vw_portfolio_nav_daily_live.sql` | applied before/outside the ledger | -- |
| `20260530000000_vw_nexus_holdings_fundamentals.sql` | applied before/outside the ledger | -- |
| `20260530000001_system_health.sql` | applied before/outside the ledger | -- |
| `20260601010000_ledger_phase0.sql` | differs from the ledger row of the same name | `20260601204630_ledger_phase0.sql` |
| `20260601020000_ledger_backfill_transactions.sql` | applied before/outside the ledger | -- |
| `20260601050000_ledger_phase4_forward_nav.sql` | differs from the ledger row of the same name | `20260603082641_ledger_phase4_forward_nav.sql` |
| `20260601060000_ledger_phase5_adversary.sql` | differs from the ledger row of the same name | `20260603083459_ledger_phase5_adversary.sql` |
| `20260603000100_cortex_cron.sql` | applied before/outside the ledger | -- |
| `20260603010000_materialize_nexus_holdings.sql` | differs from the ledger row of the same name | `20260603150148_materialize_nexus_holdings.sql` |
| `20260603040000_materialize_cortex_screener.sql` | differs from the ledger row of the same name | `20260603210850_materialize_cortex_screener.sql` |
| `20260603050000_screener_universe_and_fundamentals.sql` | applied before/outside the ledger | -- |
| `20260603060000_fix_screener_finnhub_fields.sql` | applied before/outside the ledger | -- |
| `20260605010000_fund_research_v2_schema.sql` | differs from the ledger row of the same name | `20260605181145_fund_research_v2_schema.sql` |
| `20260605020000_fund_research_v3_schema.sql` | differs from the ledger row of the same name | `20260605181305_fund_research_v3_schema.sql` |
| `20260605030000_fund_style_skill_seed.sql` | differs from the ledger row of the same name | `20260605181338_fund_style_skill_seed.sql` |
| `20260617000000_options_positioning.sql` | differs from the ledger row of the same name | `20260618053353_options_positioning.sql` |
| `20260618010000_schedule_refresh_nexus_holdings.sql` | applied before/outside the ledger | -- |
| `20260619120000_fix_nexus_weight_basis.sql` | differs from the ledger row of the same name | `20260619164419_fix_nexus_weight_basis.sql` |
| `20260619140000_vw_screener_fundamentals_fix.sql` | applied before/outside the ledger | -- |
| `20260621020000_harden_vendor_json_date_casts.sql` | differs from the ledger row of the same name | `20260621081250_harden_vendor_json_date_casts.sql` |
| `20260624130000_command_centre_open_positions_pnl.sql` | differs from the ledger row of the same name | `20260624053442_command_centre_open_positions_pnl.sql` |
| `20260711000000_vol_dispersion_daily.sql` | differs from the ledger row of the same name | `20260711044626_vol_dispersion_daily.sql` |
| `20260718000000_realized_layer_tables.sql` | never applied or since dropped | -- |
| `20260801000000_bench_claims.sql` | applied before/outside the ledger | -- |
| `20260801000200_vw_bench_contribution.sql` | differs from the ledger row of the same name | `20260801190711_vw_bench_contribution.sql` |
| `20260801000300_nexus_holdings_fv_trustworthy_dispersion.sql` | differs from the ledger row of the same name | `20260801191147_nexus_holdings_fv_trustworthy_dispersion.sql` |
| `20260809104143_vw_bench_docket_and_sleeve_headroom.sql` | differs from what ran under its own version | `20260809104143_vw_bench_docket_and_sleeve_headroom.sql` |
| `20260809163000_vw_sleeve_headroom_expose_nav.sql` | differs from the ledger row of the same name | `20260809153711_vw_sleeve_headroom_expose_nav.sql` |
| `20260809170000_holding_vol_trailing_store.sql` | differs from the ledger row of the same name | `20260809164946_holding_vol_trailing_store.sql` |
| `20260809210000_atlas_validation_on_pg_cron.sql` | differs from the ledger row of the same name | `20260809204217_atlas_validation_on_pg_cron.sql` |
| `20260811010000_trade_signal_layer.sql` | differs from the ledger row of the same name | `20260811044417_trade_signal_layer.sql` |
| `20260811010100_decisions_trade_intent.sql` | differs from the ledger row of the same name | `20260811044513_decisions_trade_intent.sql` |
| `20260811010200_bench_claims_three_part.sql` | differs from the ledger row of the same name | `20260811044532_bench_claims_three_part.sql` |
| `20260811010300_opportunity_assessments_coherence.sql` | differs from the ledger row of the same name | `20260811044545_opportunity_assessments_coherence.sql` |
| `20260811010400_trade_universe.sql` | differs from the ledger row of the same name | `20260811044614_trade_universe.sql` |
| `20260811010500_trade_triggers.sql` | differs from the ledger row of the same name | `20260811044625_trade_triggers.sql` |
| `20260811010600_universe_correlations.sql` | differs from the ledger row of the same name | `20260811044643_universe_correlations.sql` |
| `20260811120000_price_backfill_and_bounded_correlations.sql` | differs from the ledger row of the same name | `20260811093817_price_backfill_and_bounded_correlations.sql` |
| `20260811130000_service_role_maintenance_timeout.sql` | applied before/outside the ledger | -- |
| `20260816140000_validate_peripheral_feeds.sql` | differs from the ledger row of the same name | `20260816131647_validate_peripheral_feeds.sql` |
| `20260816170000_scheduler_chain.sql` | applied before/outside the ledger | -- |
| `20260818003000_split_trade_sync_and_fix_reap_duration.sql` | applied before/outside the ledger | -- |
| `20260818210000_bound_price_scans_and_stale_moves.sql` | applied before/outside the ledger | -- |
| `20260818223000_atlas_symbol_search.sql` | differs from the ledger row of the same name | `20260818203225_atlas_symbol_search.sql` |
| `20260823120000_universe_price_sync.sql` | differs from the ledger row of the same name | `20260823112605_universe_price_sync.sql` |
| `20260823140000_chain_base_from_vault.sql` | differs from the ledger row of the same name | `20260823113710_chain_base_from_vault.sql` |
| `20260823190000_performance_suite_lateral.sql` | applied before/outside the ledger | -- |
| `20260823210000_performance_suite_staleness_gate.sql` | differs from the ledger row of the same name | `20260823193044_performance_suite_staleness_gate.sql` |
| `20260823230000_position_nav_daily_bound_price_join.sql` | differs from the ledger row of the same name | `20260823203346_position_nav_daily_bound_price_join.sql` |
| `20260824140000_exclude_cancelled_orders.sql` | differs from the ledger row of the same name | `20260824150752_exclude_cancelled_orders.sql` |
| `20260824160000_return_engine.sql` | applied before/outside the ledger | -- |
| `20260824180000_mv_position_returns.sql` | differs from the ledger row of the same name | `20260824220728_mv_position_returns.sql` |
| `20260826090000_positions_scope_to_latest_snapshot.sql` | differs from the ledger row of the same name | `20260826065313_positions_scope_to_latest_snapshot.sql` |
| `20260826110000_position_verdicts_schema.sql` | differs from the ledger row of the same name | `20260826071331_position_verdicts_schema.sql` |
| `20260826120000_tier2_rest_of_book.sql` | applied before/outside the ledger | -- |
| `20260826130000_tier1_cluster.sql` | applied before/outside the ledger | -- |
| `20260826140000_frozen_weight_baseline.sql` | applied before/outside the ledger | -- |
| `20260826150000_verdict_nightly_job.sql` | applied before/outside the ledger | -- |
| `20260826160000_verdict_preflight_and_basis_gate.sql` | applied before/outside the ledger | -- |
| `20260826170000_verdict_preflight_fn_and_patches.sql` | applied before/outside the ledger | -- |
| `20260827090000_verdict_job_noop_must_not_report_success.sql` | applied before/outside the ledger | -- |
| `20260830110000_tier1_rank_and_frozen_membership.sql` | differs from the ledger row of the same name | `20260830101729_tier1_rank_and_frozen_membership.sql` |
| `20260830110100_verdict_job_write_rank_and_members.sql` | differs from the ledger row of the same name | `20260830101847_verdict_job_write_rank_and_members.sql` |
| `20260830180100_verdict_job_write_thesis_state.sql` | differs from the ledger row of the same name | `20260830172218_verdict_job_write_thesis_state.sql` |
| `20260831043705_position_trading_effect.sql` | differs from what ran under its own version | `20260831043705_position_trading_effect.sql` |
| `20260907220100_bench_contribution_window_not_selfjoin.sql` | differs from the ledger row of the same name | `20260907215658_bench_contribution_window_not_selfjoin.sql` |
| `20260907220200_bench_contribution_reads_holdings_once.sql` | differs from the ledger row of the same name | `20260907215842_bench_contribution_reads_holdings_once.sql` |
| `20260907220300_bench_contribution_matview_refreshed_with_holdings.sql` | differs from the ledger row of the same name | `20260907220007_bench_contribution_matview_refreshed_with_holdings.sql` |
| `20260907220400_segment_verdicts_replace_not_append_and_report_before_raising.sql` | applied before/outside the ledger | -- |
| `20260909161500_c4_nightly_factor_score_refresh.sql` | differs from the ledger row of the same name | `20260909155333_c4_nightly_factor_score_refresh.sql` |
| `20260909161600_c4_factor_scores_real_duration.sql` | differs from the ledger row of the same name | `20260909155515_c4_factor_scores_real_duration.sql` |
| `20260910190000_a2_2_ratio_pairs_metadata.sql` | differs from the ledger row of the same name | `20260910231538_a2_2_ratio_pairs_metadata.sql` |
| `20260913120000_job28_resume_offset_from_last_run.sql` | differs from the ledger row of the same name | `20260913112454_job28_resume_offset_from_last_run.sql` |
| `20260913160000_a0b_treasury_curve_legs.sql` | applied before/outside the ledger | -- |
| `20260913161000_a0b_macro_series.sql` | applied before/outside the ledger | -- |
| `20260913161100_a0b_macro_series_seed.sql` | applied before/outside the ledger | -- |
| `20260913162000_a0b_macro_coverage_and_feed_status.sql` | applied before/outside the ledger | -- |
| `20260913163000_a0b_nightly_macro_load.sql` | applied before/outside the ledger | -- |
| `20260913164000_a0b_score_20d_z.sql` | applied before/outside the ledger | -- |
| `20260913164100_a0b_factor_scores_write_z.sql` | applied before/outside the ledger | -- |
| `20260913164200_a0b_dispersion_state_reads_z.sql` | applied before/outside the ledger | -- |
| `20260913170000_a3_0_theme_schema.sql` | applied before/outside the ledger | -- |
| `20260913170100_a3_0_seed_two_themes.sql` | applied before/outside the ledger | -- |
| `20260913171000_a3_1_amendments_and_two_themes.sql` | applied before/outside the ledger | -- |
| `20260913172000_a3_1_retrace_rows_carry_baseline.sql` | applied before/outside the ledger | -- |
| `20260913173000_a3_1_theme_operand_measures.sql` | applied before/outside the ledger | -- |
| `20260913174300_a3_1_persist_dynamic.sql` | applied before/outside the ledger | -- |
| `20260913176000_a3_1_engine_reentrant_and_nightly.sql` | applied before/outside the ledger | -- |
| `20260913177000_a3_1_squash_same_session_engine_iterations.sql` | applied before/outside the ledger | -- |
| `20260913177100_a3_1_drop_superseded_engine_ledger_row.sql` | applied before/outside the ledger | -- |
| `20260916100000_f5_tape_group_on_market_instruments.sql` | differs from what ran under its own version | `20260916100000_f5_tape_group_on_market_instruments.sql` |
| `20260920203206_atlas_refresh_cluster_identity.sql` | differs from what ran under its own version | `20260920203206_atlas_refresh_cluster_identity_bounded_sample.sql` |
| `20260921130500_atlas_write_segment_verdicts_mctr_euler.sql` | applied before/outside the ledger | -- |
| `20260921130600_atlas_write_verdicts_mctr_euler.sql` | applied before/outside the ledger | -- |
| `20260921194041_i1_chain_stages_table.sql` | differs from what ran under its own version | `20260921194041_i1_chain_stages_table.sql` |
| `20260921230243_i1_chain_advance.sql` | differs from what ran under its own version | `20260921230243_i1_chain_advance.sql` |
| `20260921230350_i1_chain_advance_definition_matches_file.sql` | differs from what ran under its own version | `20260921230350_i1_chain_advance_definition_matches_file.sql` |
| `20260921230635_i1_chain_completion_probe.sql` | differs from what ran under its own version | `20260921230635_i1_chain_completion_probe.sql` |
| `20260921231303_i1_vw_chain_status.sql` | differs from what ran under its own version | `20260921231303_i1_vw_chain_status.sql` |
| `20260922002500_i1_chain_day_spans_midnight.sql` | differs from the ledger row of the same name | `20260922002124_i1_chain_day_spans_midnight.sql` |
| `20260922002700_i1_vw_chain_status_chain_day.sql` | differs from the ledger row of the same name | `20260922002311_i1_vw_chain_status_chain_day.sql` |
| `20260922101557_eq2_vw_company_fundamentals.sql` | differs from what ran under its own version | `20260922101557_eq2_vw_company_fundamentals.sql` |

Renamed to their ledger version, content unchanged (a doc citing the old name finds it here):

| old name | new name |
|---|---|
| `20260425000001_nav_from_equity_curve.sql` | `20260427094857_nav_from_equity_curve.sql` |
| `20260425000002_perf_suite_sector_mv.sql` | `20260427094920_perf_suite_sector_mv.sql` |
| `20260501000000_fix_phantom_positions.sql` | `20260501210024_fix_phantom_positions.sql` |
| `20260504000000_fix_command_centre_nav.sql` | `20260504180453_fix_command_centre_nav.sql` |
| `20260507000000_sync_health_infrastructure.sql` | `20260507155313_sync_health_infrastructure.sql` |
| `20260510000000_optimize_vw_screener_single_pass.sql` | `20260510143548_optimize_vw_screener_single_pass.sql` |
| `20260510000001_vw_screener_name_from_cache.sql` | `20260510165934_vw_screener_name_from_cache.sql` |
| `20260514000000_assets_listing_status.sql` | `20260515063949_assets_listing_status.sql` |
| `20260514000001_fix_portfolio_history_cron.sql` | `20260515063958_fix_portfolio_history_cron.sql` |
| `20260515000001_vw_portfolio_home_live_prices.sql` | `20260515183633_vw_portfolio_home_live_prices.sql` |
| `20260601000000_nexus_holdings_saved_valuation.sql` | `20260601120659_nexus_holdings_saved_valuation.sql` |
| `20260601030000_ledger_phase2_outcomes.sql` | `20260601215817_ledger_phase2_outcomes.sql` |
| `20260601040000_ledger_phase3_calibration.sql` | `20260602191700_ledger_phase3_calibration.sql` |
| `20260603000000_cortex_schema.sql` | `20260603081232_cortex_schema.sql` |
| `20260603020000_create_cortex_watchlist.sql` | `20260603195111_create_cortex_watchlist.sql` |
| `20260603030000_create_vw_cortex_screener.sql` | `20260603195300_create_vw_cortex_screener.sql` |
| `20260604100000_equity_fundamentals_derived.sql` | `20260604175602_equity_fundamentals_derived.sql` |
| `20260605040000_fund_prices_raw_nav_nullable.sql` | `20260605224502_fund_prices_raw_nav_nullable.sql` |
| `20260605050000_etf_universe.sql` | `20260605230027_etf_universe.sql` |
| `20260606120000_nexus_price_freshness.sql` | `20260606172205_nexus_price_freshness.sql` |
| `20260608120000_valuation_health.sql` | `20260608140308_valuation_health.sql` |
| `20260611090000_scrapbook_snapshots_nullable_implied_price.sql` | `20260611084429_scrapbook_snapshots_nullable_implied_price.sql` |
| `20260614000000_fix_vw_earnings_calendar_overview_path.sql` | `20260614071857_fix_vw_earnings_calendar_overview_path.sql` |
| `20260616000000_opportunity_assessments.sql` | `20260616124926_opportunity_assessments.sql` |
| `20260618000000_options_positioning_anon_write.sql` | `20260618131212_options_positioning_anon_write.sql` |
| `20260619150000_fix_phantom_position_count.sql` | `20260620094613_fix_phantom_position_count.sql` |
| `20260620100000_cron_sync_holdings_fundamentals.sql` | `20260620101536_cron_sync_holdings_fundamentals.sql` |
| `20260621000000_fix_vw_screener_market_cap_bigint_cast.sql` | `20260621080014_fix_vw_screener_market_cap_bigint_cast.sql` |
| `20260621010000_safe_cast_helpers.sql` | `20260621081125_safe_cast_helpers.sql` |
| `20260622000000_robust_sector_classification.sql` | `20260622083533_robust_sector_classification.sql` |
| `20260624120000_earnings_calendar_long_mv_weight.sql` | `20260624053419_earnings_calendar_long_mv_weight.sql` |
| `20260624140000_backfill_etf_asset_names.sql` | `20260624193825_backfill_etf_asset_names.sql` |
| `20260711120000_theme_leadership_weekly.sql` | `20260712172438_theme_leadership_weekly.sql` |
| `20260801000100_opportunity_assessments_bench_verdicts.sql` | `20260801190648_opportunity_assessments_bench_verdicts.sql` |
| `20260809154500_vw_bench_contribution_declare_coverage.sql` | `20260809152212_vw_bench_contribution_declare_coverage.sql` |
| `20260809170500_cron_refresh_holding_vol_trailing.sql` | `20260809165031_cron_refresh_holding_vol_trailing.sql` |
| `20260809201500_cron_sync_alpaca_transactions.sql` | `20260809202019_cron_sync_alpaca_transactions.sql` |
| `20260810231500_price_sync_window_and_saturday.sql` | `20260810233924_price_sync_window_and_saturday.sql` |
| `20260810232000_validation_price_coverage_check.sql` | `20260810234057_validation_price_coverage_check.sql` |
| `20260811150000_bound_price_scans_and_expose_theme.sql` | `20260811150230_bound_price_scans_and_expose_theme.sql` |
| `20260812090000_bound_risk_and_perf_price_scans.sql` | `20260812074551_bound_risk_and_perf_price_scans.sql` |
| `20260812120000_holdings_vol_and_valuation_gap.sql` | `20260816125718_holdings_vol_and_valuation_gap.sql` |
| `20260823160000_nav_daily_sargable_as_of.sql` | `20260823114108_nav_daily_sargable_as_of.sql` |
| `20260823180000_split_clusters_and_reap_orphans.sql` | `20260823115917_split_clusters_and_reap_orphans.sql` |
| `20260824120000_performance_suite_annualisation_floor.sql` | `20260824115537_performance_suite_annualisation_floor.sql` |
| `20260830180000_bench_thesis_state.sql` | `20260830171936_bench_thesis_state.sql` |
| `20260831130000_frozen_view_passes_valuation_date.sql` | `20260831044005_frozen_view_passes_valuation_date.sql` |
| `20260901120000_shared_api_cache.sql` | `20260902070742_shared_api_cache.sql` |
| `20260907103500_verdict_counts_must_sum_to_member_count.sql` | `20260907153624_verdict_counts_must_sum_to_member_count.sql` |
| `20260908115933_a0_market_series_layer_schema.sql` | `20260908144327_a0_market_series_layer_schema.sql` |
| `20260908120123_a0_register_instruments_and_ratio_pairs.sql` | `20260908144422_a0_register_instruments_and_ratio_pairs.sql` |
| `20260908120816_a0_correct_close_label_and_coverage_view.sql` | `20260908144439_a0_correct_close_label_and_coverage_view.sql` |
| `20260908120842_a0_coverage_view_security_invoker.sql` | `20260908144446_a0_coverage_view_security_invoker.sql` |
| `20260908144500_a0_series_layer_rls_matches_platform_convention.sql` | `20260908144459_a0_series_layer_rls_matches_platform_convention.sql` |
| `20260908145000_a0_drop_partial_session_bars_20260908.sql` | `20260908144955_a0_drop_partial_session_bars_20260908.sql` |
| `20260908145500_schedule_market_series_nightly_sync.sql` | `20260908145328_schedule_market_series_nightly_sync.sql` |
| `20260909124500_c2_state_axis_orientation_in_data.sql` | `20260909140702_c2_state_axis_orientation_in_data.sql` |
| `20260909130000_c1_1_equity_curve_data_quality.sql` | `20260909141405_c1_1_equity_curve_data_quality.sql` |
| `20260909152200_c3_reestimate_book_factor_betas_excluding_stale.sql` | `20260909152252_c3_reestimate_book_factor_betas_excluding_stale.sql` |
| `20260909160000_c_audit_backfill_sync_log_function_name.sql` | `20260909155057_c_audit_backfill_sync_log_function_name.sql` |
| `20260909161700_c4_revoke_factor_scores_from_public.sql` | `20260909155546_c4_revoke_factor_scores_from_public.sql` |
| `20260910180010_e1_1_thesis_regime_snapshots.sql` | `20260910175841_e1_1_thesis_regime_snapshots.sql` |
| `20260910180011_e1_1b_thesis_snapshot_writer_and_trigger.sql` | `20260910180332_e1_1b_thesis_snapshot_writer_and_trigger.sql` |
| `20260910180012_e1_2_thesis_regime_drift_view.sql` | `20260910231526_e1_2_thesis_regime_drift_view.sql` |
| `20260910180013_e1_1c_backfill_existing_theses.sql` | `20260910180343_e1_1c_backfill_existing_theses.sql` |
| `20260913113000_b1_book_model_diagnostics.sql` | `20260913113125_b1_book_model_diagnostics.sql` |
| `20260913113100_b1_diagnostics_first_run.sql` | `20260913113157_b1_diagnostics_first_run.sql` |
| `20260913140000_e1_3_grant_dispersion_state_execute.sql` | `20260913114116_e1_3_grant_dispersion_state_execute.sql` |
| `20260913140100_e1_3_drift_view_expose_pc_rank.sql` | `20260913114202_e1_3_drift_view_expose_pc_rank.sql` |
| `20260913150000_job28_next_offset_safe_cast.sql` | `20260913114755_job28_next_offset_safe_cast.sql` |
| `20260920210000_cron_atlas_refresh_cluster_identity.sql` | `20260920204031_cron_atlas_refresh_cluster_identity.sql` |
| `20260920211500_cluster_identity_finite_coefficients.sql` | `20260920205002_cluster_identity_finite_coefficients.sql` |
| `20260922002600_i1_advance_uses_chain_day.sql` | `20260922002228_i1_advance_uses_chain_day.sql` |
