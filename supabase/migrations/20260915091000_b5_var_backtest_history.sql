-- B5, step 3. Append-only history of the backtest.
--
-- A history and not a view, for the same reason book_regime_cvar is one: the
-- covariance behind the prediction is re-estimated every night and the book
-- gains a session every day, so a view would silently restate every past
-- reading of a test whose whole purpose is to say what the model claimed
-- BEFORE the outcome was known.
--
-- Every rule below is a predicate over a single row, so it is a CHECK rather
-- than an assertion the job could forget -- and a flag is bound to the evidence
-- underneath it, so it cannot be flipped without moving the statistic.

create table if not exists public.var_backtest_runs (
  id                      bigint      generated always as identity primary key,
  as_of                   date        not null,
  cvar_as_of              date        not null,
  logic_version           text        not null default 'v1',
  leg                     text        not null,
  basis                   text        not null,
  axis_key                text        references public.factor_axes(axis_key)
                                        on update cascade on delete restrict,
  conf                    numeric     not null,
  window_start            date        not null,
  window_end              date        not null,
  n_obs                   int         not null,
  exceptions              int         not null,
  expected_exceptions     numeric     generated always as ((1 - conf) * n_obs) stored,
  exception_rate          numeric     generated always as (exceptions::numeric / nullif(n_obs, 0)) stored,
  var_pred_daily          numeric     not null,
  cvar_pred_daily         numeric     not null,
  cvar_pred_on_exceptions numeric,
  cvar_realised_daily     numeric,
  sd_pred_daily           numeric     not null,
  sd_realised_daily       numeric     not null,
  sd_factor_window        numeric,
  sd_residual_window      numeric,
  kupiec_lr               numeric     not null,
  kupiec_reject_05        boolean     not null,
  kupiec_reject_01        boolean     not null,
  betas_estimated_at      timestamptz not null,
  computed_at             timestamptz not null default now(),

  constraint vbr_leg_ck   check (leg   in ('model', 'book')),
  constraint vbr_basis_ck check (basis in ('unconditional', 'regime_conditional')),
  constraint vbr_conf_ck  check (conf  in (0.90, 0.95, 0.99)),

  -- An unconditional row has no axis and a conditional row is meaningless
  -- without one. Stated as a biconditional so neither half can drift: a
  -- constraint that only forbids one direction is a claim the code does not
  -- check, which is how brd_vol_basis_ck first shipped.
  constraint vbr_axis_ck check (
       (basis = 'unconditional'      and axis_key is null)
    or (basis = 'regime_conditional' and axis_key is not null)
  ),

  -- The residual decomposition only exists for the book leg: the model leg IS
  -- the factor part, so it has no residual to measure.
  constraint vbr_decomp_ck check (
       (leg = 'book'  and sd_factor_window is not null and sd_residual_window is not null)
    or (leg = 'model' and sd_factor_window is null     and sd_residual_window is null)
  ),

  -- A realised tail loss is a mean over the exception days. With no exceptions
  -- there is nothing to take a mean of, and publishing a figure there would be
  -- a number with no observation behind it.
  constraint vbr_cvar_evidence_ck check (
       (exceptions = 0 and cvar_realised_daily is null     and cvar_pred_on_exceptions is null)
    or (exceptions > 0 and cvar_realised_daily is not null and cvar_pred_on_exceptions is not null)
  ),

  constraint vbr_counts_ck   check (exceptions >= 0 and exceptions <= n_obs),
  -- Below ~30 observations Kupiec has no power worth publishing. This is a
  -- floor on nonsense, not on the book: the book leg carries 172 today and
  -- gains a session a night.
  constraint vbr_n_obs_ck    check (n_obs >= 30),
  constraint vbr_window_ck   check (window_end >= window_start),
  constraint vbr_sd_ck       check (sd_pred_daily > 0 and sd_realised_daily > 0),
  -- CVaR is the mean beyond the quantile, so it exceeds VaR for any continuous
  -- distribution. If it ever does not, the arithmetic is wrong, not the market.
  constraint vbr_cvar_gt_var_ck check (cvar_pred_daily > var_pred_daily),
  constraint vbr_lr_ck       check (kupiec_lr >= 0),
  -- The flags are bound to the statistic, so a surface cannot be shown a
  -- rejection that disagrees with its own evidence. chi2(1) at 5% and 1%.
  constraint vbr_reject05_ck check (kupiec_reject_05 = (kupiec_lr > 3.841459)),
  constraint vbr_reject01_ck check (kupiec_reject_01 = (kupiec_lr > 6.634897))
);

-- axis_key is NULL on unconditional rows, so the natural key cannot be a
-- primary key. The unique index carries it instead.
create unique index if not exists var_backtest_runs_key
  on public.var_backtest_runs
     (as_of, logic_version, leg, basis, coalesce(axis_key, ''), conf);

create index if not exists var_backtest_runs_as_of_idx
  on public.var_backtest_runs (as_of desc);

comment on table public.var_backtest_runs is
  'Append-only history of the Kupiec VaR backtest. Two legs: `model` tests the Gaussian quantile on b''x over the whole factor panel, `book` tests the whole chain on realised equity returns over the sessions the book has lived.';
comment on column public.var_backtest_runs.exception_rate is
  'GENERATED ALWAYS. Never include it in a PostgREST payload -- the server rejects the ENTIRE write with 428C9, which is how 41 sync_log rows sat open for months.';
comment on column public.var_backtest_runs.expected_exceptions is
  'GENERATED ALWAYS, as exception_rate. Same warning.';
comment on column public.var_backtest_runs.cvar_pred_on_exceptions is
  'Predicted CVaR averaged over the EXCEPTION days only, so the comparison against cvar_realised_daily is like-for-like. On a conditional row it differs from cvar_pred_daily, because exceptions cluster in the high-vol buckets.';
comment on column public.var_backtest_runs.sd_residual_window is
  'Idiosyncratic sd of the book over the window. It is absent from b''Sigma b entirely -- the factor model carries no residual variance -- so this is the part of book risk E3 cannot see, published rather than left to be inferred.';
comment on column public.var_backtest_runs.sd_pred_daily is
  'Root-mean-square of the per-session predicted sd. On an unconditional row that is just the bucket-0 vol; on a conditional one it summarises a vol that changes with the regime.';

alter table public.var_backtest_runs enable row level security;

drop policy if exists var_backtest_runs_read on public.var_backtest_runs;
create policy var_backtest_runs_read on public.var_backtest_runs
  for select to anon, authenticated using (true);

drop policy if exists var_backtest_runs_service on public.var_backtest_runs;
create policy var_backtest_runs_service on public.var_backtest_runs
  for all to service_role using (true) with check (true);

create or replace function public.atlas_var_backtest_runs_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $t$
begin
  raise exception 'var_backtest_runs is append-only (attempted %)', tg_op;
end;
$t$;

drop trigger if exists var_backtest_runs_append_only on public.var_backtest_runs;
create trigger var_backtest_runs_append_only
  before update or delete on public.var_backtest_runs
  for each row execute function public.atlas_var_backtest_runs_append_only();

revoke execute on function public.atlas_var_backtest_runs_append_only() from public, anon, authenticated;
