COMMENT ON TABLE public.position_verdicts IS
 'Nightly per-position verdict history (memo v2 §3 + step 4 addendum rev. B §4). Written by the nightly job under service_role, read by Performance as a single indexed lookup - the computation behind it cannot clear anon''s 3s cap. Append-only history: a row is a frozen record of what was known on `as_of` under `logic_version`, never updated in place.';
COMMENT ON COLUMN public.position_verdicts.verdict_status IS
 'measured | one_sided | stale_mark | ledger_mismatch. Rev. B §3: every refusal on this book is a data-integrity refusal, never a solver failure. stale_mark self-heals when the feed returns; ledger_mismatch does not.';
COMMENT ON COLUMN public.position_verdicts.status_reason IS
 'Free text explaining verdict_status, e.g. ''price_days_old=163''.';
COMMENT ON COLUMN public.position_verdicts.engine_status IS
 'The upstream mv_position_returns.engine_status this verdict was derived from. verdict_status is the verdict layer''s reading of it; keeping both means a later change to the mapping is visible in the history rather than invisible.';
COMMENT ON COLUMN public.position_verdicts.status_detail IS
 'Free text explaining engine_status (mv_position_returns.engine_reason), as distinct from status_reason which explains verdict_status.';
COMMENT ON COLUMN public.position_verdicts.peer_basis IS
 'cluster | book | none. Which tier produced the score. Rev. B §2.4: never fall back between tiers without recording which was used.';
COMMENT ON COLUMN public.position_verdicts.cluster_eligible IS
 'rho >= 0.75 AND cluster size >= 5. True for ~19 of 63 positions - the book is single names, ADRs, sector ETFs and commodity trackers, and most of it has no close peer by construction. A portfolio property, not a data gap.';
COMMENT ON COLUMN public.position_verdicts.excess_vs_book_pct IS
 'Tier 2 score: this position''s cash-flow schedule run into the rest of the book at prevailing weights, differenced against its own return. Available for every position, needs no peer. Every dollar in a name is a dollar not spread across the other 62.';
COMMENT ON COLUMN public.position_verdicts.best_correlate_rho IS
 'Highest correlation to any other held name. Carried per row so the diversification finding stays answerable over time - 17 of 63 positions have no correlate above 0.65, and the median position''s best correlate is 0.771.';
COMMENT ON COLUMN public.position_verdicts.conviction_at_entry IS
 'decisions.conviction at the opening trade. Unrecoverable if not captured at open - `decisions` starts 2026, the ledger starts 2025-12-29, so the older half of the book will carry NULL permanently.';
COMMENT ON COLUMN public.position_verdicts.trading_effect_pct IS
 'position_mwr_pct - frozen_weight_return_pct. The one number answering "did my trading help". Negative means the do-nothing book beat the traded book.';
COMMENT ON COLUMN public.position_verdicts.evidence_own_return_known IS
 'False wherever the terminal price is gated. Constrained to track verdict_status = measured, so unmeasured can never be read as flat.';

COMMENT ON TABLE public.book_risk_daily IS
 'Book-level companion to position_verdicts, one row per as_of per logic_version. Carries the risk reconciliation identity (position -> cluster -> book, residual explicit) and the do-nothing baseline at book level.';
COMMENT ON COLUMN public.book_risk_daily.residual IS
 'Total vol less the sum of weighted marginal contributions. Written explicitly and displayed - a decomposition that cannot close should say so rather than absorb the gap into the largest bucket.';
COMMENT ON COLUMN public.book_risk_daily.effective_bets IS
 '1 / sum(cluster_risk_share^2). 63 positions are expected to resolve to five or six bets. Absorbs the older Diversification Score and Redundant Pairs, which are weaker estimators of the same idea.';
COMMENT ON COLUMN public.book_risk_daily.frozen_book_return_pct IS
 'Every position held at its opening weight, never added to, never trimmed. If this beats traded_book_return_pct, trading is a cost centre.';
COMMENT ON COLUMN public.book_risk_daily.positions_no_correlate IS
 'Positions with no correlate above rho 0.65. Carried as a time series so the diversification trend is answerable, not a one-off measurement.';
