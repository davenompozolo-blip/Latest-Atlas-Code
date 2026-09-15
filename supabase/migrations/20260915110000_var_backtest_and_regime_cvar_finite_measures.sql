-- Every numeric CHECK in this family accepts NaN.
--
-- Raised by CodeRabbit on PR #783 against var_backtest_runs, and verified
-- rather than taken on trust -- PostgreSQL sorts `numeric 'NaN'` ABOVE every
-- finite value, so:
--
--   'NaN'::numeric > 0          -> true
--   'NaN'::numeric >= 0         -> true
--   'NaN'::numeric > 3.841459   -> true
--
-- which means a NaN row satisfies `sd_pred_daily > 0`, satisfies
-- `cvar_pred_daily > var_pred_daily` from EITHER side, satisfies
-- `kupiec_lr >= 0`, AND satisfies both `kupiec_reject_*` flag bindings with
-- the flags set true. The entire constraint set passes on a row that says
-- nothing. A wall of CHECKs that a single sentinel walks straight through is
-- the failure mode this file already records one layer up, where prose
-- asserted a biconditional the code never checked.
--
-- `x IS DISTINCT FROM 'NaN'::numeric` is the guard: TRUE for NULL (so the
-- nullable measurements are unaffected) and FALSE for NaN. Note `<>` would
-- also work here -- unlike float, numeric NaN compares equal to itself -- but
-- IS DISTINCT FROM says so without the reader having to know that.
--
-- book_regime_cvar is included because that is where the value is CREATED.
-- `brc_vol_positive_ck` has the identical hole, and the conditional bound in
-- var_backtest_runs is `z x vol_daily` -- so a NaN admitted upstream arrives
-- downstream already laundered through arithmetic. A gate applied at the
-- consumer is missed by the next consumer; this file has an entry about that
-- too. Added as a separate constraint rather than by rewriting
-- brc_vol_positive_ck, so the existing positivity rule keeps its own name and
-- its own history.
--
-- Verified before applying: 0 of 24 var_backtest_runs rows and 0 of 15
-- book_regime_cvar rows would violate. Both tables are small, so these are
-- plain validating ADD CONSTRAINTs and NOT `NOT VALID` -- checking the
-- existing rows is the point, and a linter rule aimed at a million rows is
-- not advice about thirty-nine.

alter table public.var_backtest_runs
  drop constraint if exists vbr_finite_ck;

alter table public.var_backtest_runs
  add constraint vbr_finite_ck check (
        var_pred_daily          is distinct from 'NaN'::numeric
    and cvar_pred_daily         is distinct from 'NaN'::numeric
    and cvar_pred_on_exceptions is distinct from 'NaN'::numeric
    and cvar_realised_daily     is distinct from 'NaN'::numeric
    and sd_pred_daily           is distinct from 'NaN'::numeric
    and sd_realised_daily       is distinct from 'NaN'::numeric
    and sd_factor_window        is distinct from 'NaN'::numeric
    and sd_residual_window      is distinct from 'NaN'::numeric
    and kupiec_lr               is distinct from 'NaN'::numeric
  );

alter table public.book_regime_cvar
  drop constraint if exists brc_finite_ck;

alter table public.book_regime_cvar
  add constraint brc_finite_ck check (
        vol_daily                  is distinct from 'NaN'::numeric
    and vol_daily_unshrunk         is distinct from 'NaN'::numeric
    and vol_annual                 is distinct from 'NaN'::numeric
    and var_daily                  is distinct from 'NaN'::numeric
    and cvar_daily                 is distinct from 'NaN'::numeric
    and vol_ratio_vs_unconditional is distinct from 'NaN'::numeric
    and z_lo                       is distinct from 'NaN'::numeric
    and z_hi                       is distinct from 'NaN'::numeric
  );

-- lw_delta needs no guard: `lw_delta >= 0 and lw_delta <= 1` already refuses
-- NaN, because NaN sorting above everything makes the UPPER bound fail. A
-- two-sided range is NaN-safe and a one-sided one is not, which is exactly why
-- this is easy to miss by inspection.

comment on constraint vbr_finite_ck on public.var_backtest_runs is
  'NaN sorts above every finite numeric, so it satisfies every ordering CHECK on this table including both kupiec_reject flag bindings. This is the only constraint that refuses it.';
comment on constraint brc_finite_ck on public.book_regime_cvar is
  'Same guard at the point the value is created. brc_vol_positive_ck and brc_cvar_gt_var_ck are both satisfied by NaN on their own.';
