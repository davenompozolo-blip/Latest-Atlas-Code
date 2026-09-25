-- MP-6: the factor layer is computed per account.
--
-- book_factor_betas, book_regime_cvar, var_backtest_runs and
-- book_model_diagnostics described the default account only, and MP-2
-- withheld them from every other account rather than show them against the
-- wrong book. Worse, book_factor_betas had NO writer in the database: B0 and
-- C3 estimated it outside, the last set on 2026-09-09 on a window ending
-- 2026-09-04, so the regime CVaR and the VaR backtest have graded the default
-- book on betas three weeks stale ever since.
--
-- 1. atlas_ols: OLS with Newey-West standard errors, lifted from the cluster-
--    identity solver so there is one implementation of it.
-- 2. atlas_book_factor_betas_estimate: the C3 specification for the ACTIVE
--    account -- settled daily log return on SPY adj_close log return plus the
--    three raw daily axis scores, NW(4) standard errors. Proven by
--    reproduction before applying: on the C3 sample (window ending
--    2026-09-04, n = 168) every beta, standard error, t-stat and R2 agrees
--    with the stored C3 set to 1e-12. The NW lag was identified the same way;
--    classical standard errors put market's t at 10.1 against C3's 6.93.
-- 3. atlas_write_book_factor_betas: nightly, per account, 60-session floor.
--    Secondary has one settled session and logs insufficient_history until
--    it has 60 -- recorded, never an unstable set appended to a history that
--    cannot be restated.
-- 4. atlas_regime_cvar / atlas_var_backtest and their writers read the
--    active account's own betas and snapshots, one sync_log row per account.

-- ---------------------------------------------------------------------------
-- 1. Every factor-layer table records the account it describes.
--    Existing rows are the default account's -- every one was estimated or
--    computed from its book -- and that is what the default fills in.
-- ---------------------------------------------------------------------------
alter table public.book_factor_betas
  add column portfolio_id uuid not null default public.atlas_default_portfolio()
      references public.portfolios(id);
alter table public.book_model_diagnostics
  add column portfolio_id uuid not null default public.atlas_default_portfolio()
      references public.portfolios(id);
alter table public.book_regime_cvar
  add column portfolio_id uuid not null default public.atlas_default_portfolio()
      references public.portfolios(id);
alter table public.var_backtest_runs
  add column portfolio_id uuid not null default public.atlas_default_portfolio()
      references public.portfolios(id);

-- Keys: an estimate set is (portfolio_id, estimated_at); a snapshot row is
-- keyed by its account too, or two accounts' CVaR for one as_of collide.
alter table public.book_factor_betas drop constraint book_factor_betas_pkey;
alter table public.book_factor_betas add primary key (portfolio_id, estimated_at, factor);
alter table public.book_model_diagnostics drop constraint book_model_diagnostics_pkey;
alter table public.book_model_diagnostics add primary key (portfolio_id, estimated_at);
alter table public.book_regime_cvar drop constraint book_regime_cvar_pkey;
alter table public.book_regime_cvar
  add primary key (portfolio_id, as_of, logic_version, axis_key, bucket, conf);
drop index public.var_backtest_runs_key;
create unique index var_backtest_runs_key on public.var_backtest_runs
  (portfolio_id, as_of, logic_version, leg, basis, coalesce(axis_key, ''::text), conf);
drop index public.book_regime_cvar_as_of_idx;
create index book_regime_cvar_as_of_idx on public.book_regime_cvar (portfolio_id, as_of desc);
drop index public.var_backtest_runs_as_of_idx;
create index var_backtest_runs_as_of_idx on public.var_backtest_runs (portfolio_id, as_of desc);

-- A diagnostics row must name a set THIS account estimated.
create or replace function public.book_model_diagnostics_betas_exist()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not exists (select 1 from public.book_factor_betas
                  where portfolio_id = new.portfolio_id
                    and estimated_at = new.betas_estimated_at) then
    raise exception 'no book_factor_betas estimate set at % for portfolio % -- a diagnostics row must name the set it tested',
      new.betas_estimated_at, new.portfolio_id;
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Browser reads follow the switch. MP-2 withheld these tables from every
--    account but the default; now each account reads its own rows.
-- ---------------------------------------------------------------------------
drop policy book_factor_betas_read on public.book_factor_betas;
create policy book_factor_betas_read on public.book_factor_betas for select
  to anon, authenticated using (portfolio_id = (select public.atlas_active_portfolio()));
drop policy book_model_diagnostics_read on public.book_model_diagnostics;
create policy book_model_diagnostics_read on public.book_model_diagnostics for select
  to anon, authenticated using (portfolio_id = (select public.atlas_active_portfolio()));
drop policy book_regime_cvar_read on public.book_regime_cvar;
create policy book_regime_cvar_read on public.book_regime_cvar for select
  to anon, authenticated using (portfolio_id = (select public.atlas_active_portfolio()));
drop policy var_backtest_runs_read on public.var_backtest_runs;
create policy var_backtest_runs_read on public.var_backtest_runs for select
  to anon, authenticated using (portfolio_id = (select public.atlas_active_portfolio()));

-- ---------------------------------------------------------------------------
-- 3. The two views that read these tables as their owner (so RLS does not
--    reach them) carried MP-2's guarded subquery. The guard becomes an
--    account filter. Textual patch on the live definition, every anchor
--    counted, and a re-run refused rather than applied twice.
-- ---------------------------------------------------------------------------
do $patch$
declare
  v      text;
  d      text;
  n_old  int;
  guard  text := 'WHERE ( SELECT atlas_on_default_portfolio() AS atlas_on_default_portfolio)';
  scoped text := 'WHERE portfolio_id = ( SELECT atlas_active_portfolio() AS atlas_active_portfolio)';
  want   int;
begin
  foreach v in array array['vw_position_risk_thesis', 'vw_var_backtest_distribution'] loop
    d := pg_get_viewdef(('public.' || v)::regclass, true);
    want := case v when 'vw_position_risk_thesis' then 2 else 4 end;
    n_old := (length(d) - length(replace(d, guard, ''))) / length(guard);
    if position(scoped in d) > 0 then
      raise exception '% is already scoped by account -- refusing to patch twice', v;
    end if;
    if n_old <> want then
      raise exception '% carries % default-only guards, expected %', v, n_old, want;
    end if;
    execute format('create or replace view public.%I as %s', v, replace(d, guard, scoped));
  end loop;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 4. The estimator (atlas_ols + atlas_book_factor_betas_estimate) and the
--    two readers of the betas, scoped to the active account.
-- ---------------------------------------------------------------------------
-- Ordinary least squares with an intercept, for a small k. y is n values,
-- x is an n-by-(k-1) array of regressors; the intercept column is added here.
-- Returns one row per coefficient (ix 1 = intercept). A singular normal matrix
-- returns NO rows: collinear regressors have no coefficients to publish.
--
-- p_nw_lag > 0 gives Newey-West (Bartlett kernel) standard errors with that
-- many lags and NO small-sample scaling; 0 gives the classical s2 (X'X)^-1.
-- B0 and C3 published NW(4), identified by reproduction to the last stored
-- digit on all five coefficients -- not assumed from the specification,
-- which never said.
create or replace function public.atlas_ols(p_y numeric[], p_x numeric[], p_nw_lag int default 0)
returns table(ix int, beta numeric, std_error numeric, t_stat numeric,
              r_squared numeric, adj_r_squared numeric, n_obs int)
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_n    int := coalesce(array_length(p_y, 1), 0);
  v_k    int := coalesce(array_length(p_x, 2), 0) + 1;
  v_xtx  numeric[];
  v_xty  numeric[];
  v_aug  numeric[];
  v_inv  numeric[];
  v_b    numeric[];
  xv     numeric[];
  v_i int; v_j int; v_c int; v_r int; v_piv int;
  v_d numeric; v_f numeric; v_fit numeric;
  v_sse numeric := 0; v_sst numeric := 0; v_ybar numeric; v_s2 numeric; v_se numeric;
  v_e    numeric[];
  v_s    numeric[];
  v_v    numeric[];
  v_w    numeric;
  v_l    int;
begin
  if v_n <= v_k or array_length(p_x, 1) is distinct from v_n then
    return;
  end if;

  v_xtx := array_fill(0::numeric, array[v_k, v_k]);
  v_xty := array_fill(0::numeric, array[v_k]);
  for v_r in 1..v_n loop
    xv := array[1::numeric];
    for v_j in 2..v_k loop xv := xv || p_x[v_r][v_j - 1]; end loop;
    for v_i in 1..v_k loop
      v_xty[v_i] := v_xty[v_i] + xv[v_i] * p_y[v_r];
      for v_j in 1..v_k loop
        v_xtx[v_i][v_j] := v_xtx[v_i][v_j] + xv[v_i] * xv[v_j];
      end loop;
    end loop;
  end loop;

  -- Gauss-Jordan on [X'X | I] with partial pivoting (the cluster-identity
  -- solver, lifted so there is one implementation of it).
  v_aug := array_fill(0::numeric, array[v_k, 2 * v_k]);
  for v_i in 1..v_k loop
    for v_j in 1..v_k loop v_aug[v_i][v_j] := v_xtx[v_i][v_j]; end loop;
    v_aug[v_i][v_k + v_i] := 1;
  end loop;
  for v_c in 1..v_k loop
    v_piv := v_c;
    for v_r in v_c + 1..v_k loop
      if abs(v_aug[v_r][v_c]) > abs(v_aug[v_piv][v_c]) then v_piv := v_r; end if;
    end loop;
    if abs(v_aug[v_piv][v_c]) < 1e-18 then
      return;
    end if;
    if v_piv <> v_c then
      for v_j in 1..2 * v_k loop
        v_d := v_aug[v_c][v_j]; v_aug[v_c][v_j] := v_aug[v_piv][v_j]; v_aug[v_piv][v_j] := v_d;
      end loop;
    end if;
    v_d := v_aug[v_c][v_c];
    for v_j in 1..2 * v_k loop v_aug[v_c][v_j] := v_aug[v_c][v_j] / v_d; end loop;
    for v_r in 1..v_k loop
      if v_r <> v_c then
        v_f := v_aug[v_r][v_c];
        if v_f <> 0 then
          for v_j in 1..2 * v_k loop
            v_aug[v_r][v_j] := v_aug[v_r][v_j] - v_f * v_aug[v_c][v_j];
          end loop;
        end if;
      end if;
    end loop;
  end loop;

  v_inv := array_fill(0::numeric, array[v_k, v_k]);
  v_b   := array_fill(0::numeric, array[v_k]);
  for v_i in 1..v_k loop
    v_d := 0;
    for v_j in 1..v_k loop
      v_inv[v_i][v_j] := v_aug[v_i][v_k + v_j];
      v_d := v_d + v_aug[v_i][v_k + v_j] * v_xty[v_j];
    end loop;
    v_b[v_i] := v_d;
  end loop;

  select avg(y) into v_ybar from unnest(p_y) y;
  v_e := array_fill(0::numeric, array[v_n]);
  for v_r in 1..v_n loop
    v_fit := v_b[1];
    for v_j in 2..v_k loop v_fit := v_fit + v_b[v_j] * p_x[v_r][v_j - 1]; end loop;
    v_e[v_r] := p_y[v_r] - v_fit;
    v_sse := v_sse + power(v_e[v_r], 2);
    v_sst := v_sst + power(p_y[v_r] - v_ybar, 2);
  end loop;
  v_s2 := v_sse / (v_n - v_k);

  -- Coefficient covariance. Classical: s2 (X'X)^-1. Newey-West: the sandwich
  -- (X'X)^-1 S (X'X)^-1, S = sum e_t^2 x_t x_t' + sum_l w_l sum_t e_t e_(t-l)
  -- (x_t x_(t-l)' + x_(t-l) x_t'), w_l = 1 - l/(L+1).
  v_v := array_fill(0::numeric, array[v_k, v_k]);
  if coalesce(p_nw_lag, 0) > 0 then
    v_s := array_fill(0::numeric, array[v_k, v_k]);
    for v_l in 0..least(p_nw_lag, v_n - 1) loop
      v_w := case when v_l = 0 then 1 else 1 - v_l::numeric / (p_nw_lag + 1) end;
      for v_r in v_l + 1..v_n loop
        for v_i in 1..v_k loop
          for v_j in 1..v_k loop
            v_f := v_e[v_r] * v_e[v_r - v_l] * v_w
                 * (case when v_i = 1 then 1 else p_x[v_r][v_i - 1] end)
                 * (case when v_j = 1 then 1 else p_x[v_r - v_l][v_j - 1] end);
            v_s[v_i][v_j] := v_s[v_i][v_j] + v_f;
            if v_l > 0 then v_s[v_j][v_i] := v_s[v_j][v_i] + v_f; end if;
          end loop;
        end loop;
      end loop;
    end loop;
    for v_i in 1..v_k loop
      for v_j in 1..v_k loop
        v_d := 0;
        for v_c in 1..v_k loop
          for v_r in 1..v_k loop
            v_d := v_d + v_inv[v_i][v_c] * v_s[v_c][v_r] * v_inv[v_r][v_j];
          end loop;
        end loop;
        v_v[v_i][v_j] := v_d;
      end loop;
    end loop;
  else
    for v_i in 1..v_k loop
      for v_j in 1..v_k loop v_v[v_i][v_j] := v_s2 * v_inv[v_i][v_j]; end loop;
    end loop;
  end if;

  for v_i in 1..v_k loop
    v_se := sqrt(greatest(v_v[v_i][v_i], 0));
    ix := v_i;
    beta := v_b[v_i];
    std_error := v_se;
    t_stat := case when v_se > 0 then v_b[v_i] / v_se end;
    r_squared := case when v_sst > 0 then 1 - v_sse / v_sst end;
    adj_r_squared := case when v_sst > 0
                          then 1 - (v_sse / (v_n - v_k)) / (v_sst / (v_n - 1)) end;
    n_obs := v_n;
    return next;
  end loop;
end;
$fn$;

revoke execute on function public.atlas_ols(numeric[], numeric[], int) from public, anon, authenticated;

-- The book's factor betas for the ACTIVE account: its settled daily log return
-- on SPY adj_close log return plus the three raw daily axis scores -- the C3
-- specification, identified by reproduction (CLAUDE.md, "Reproduce before you
-- re-estimate"). Evaluates only; atlas_write_book_factor_betas persists.
--
-- The sample is the most recent p_max_obs sessions at or before p_window_end
-- where the book return is USABLE (both endpoints settled -- C1) and the panel
-- carries every score. A window is trailing, not expanding, so a year-old
-- regime stops weighing on today's betas once a year has passed.
create or replace function public.atlas_book_factor_betas_estimate(
  p_window_end date default null, p_max_obs int default 252)
returns table(factor text, beta numeric, std_error numeric, t_stat numeric,
              significant boolean, r_squared numeric, adj_r_squared numeric,
              n_obs int, window_start date, window_end date)
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  -- Both views are read ONCE. Joined inline, the planner nests the panel (a
  -- window over every SPY bar plus a pivot of every axis score) inside the
  -- book's rows and re-evaluates it per session -- measured past 60s.
  with book as materialized (
    select b.session_date as d, b.log_return as y
      from public.vw_book_realised_returns b
     where b.usable
       and (p_window_end is null or b.session_date <= p_window_end)
  ),
  panel as materialized (
    select p.date, p.market, p.cyclical, p.concentration, p.dollar
      from public.vw_factor_return_panel p
     where p.complete_scores
       and p.date >= (select min(d) from book)
  ),
  sample as (
    select b.d, b.y, p.market, p.cyclical, p.concentration, p.dollar
      from book b
      join panel p on p.date = b.d
     where true
       -- NaN sorts above every finite value and a one-sided bound admits it
       -- (CLAUDE.md, "NaN walks through every ordering CHECK"): every input
       -- is bounded on both sides, y and X alike.
       and b.y             > '-Infinity'::numeric and b.y             < 'Infinity'::numeric
       and p.market        > '-Infinity'::numeric and p.market        < 'Infinity'::numeric
       and p.cyclical      > '-Infinity'::numeric and p.cyclical      < 'Infinity'::numeric
       and p.concentration > '-Infinity'::numeric and p.concentration < 'Infinity'::numeric
       and p.dollar        > '-Infinity'::numeric and p.dollar        < 'Infinity'::numeric
     order by b.d desc
     limit p_max_obs
  ),
  arr as (
    select array_agg(y order by d) as ys,
           array_agg(array[market, cyclical, concentration, dollar] order by d) as xs,
           min(d) as w0, max(d) as w1
      from sample
  )
  select case o.ix when 1 then 'alpha' when 2 then 'market' when 3 then 'cyclical'
                   when 4 then 'concentration' else 'dollar' end,
         round(o.beta, 12), round(o.std_error, 12), round(o.t_stat, 12),
         case when o.t_stat is not null then abs(round(o.t_stat, 12)) > 2 end,
         round(o.r_squared, 12), round(o.adj_r_squared, 12),
         o.n_obs, arr.w0, arr.w1
    -- NW lag by the usual rule, floor(4 (n/100)^(2/9)): 4 at n = 168 and at
    -- n = 174, which is what B0 and C3 used.
    from arr, lateral public.atlas_ols(arr.ys, arr.xs,
               floor(4 * power(coalesce(array_length(arr.ys, 1), 0) / 100.0, 2.0 / 9))::int) o
   order by o.ix;
$fn$;

CREATE OR REPLACE FUNCTION public.atlas_regime_cvar(p_axis_key text, p_buckets integer DEFAULT 4, p_conf numeric DEFAULT 0.95, p_min_obs integer DEFAULT 250)
 RETURNS TABLE(axis_key text, bucket integer, bucket_label text, n_obs integer, z_lo numeric, z_hi numeric, lw_delta numeric, betas_estimated_at timestamp with time zone, vol_daily numeric, vol_annual numeric, var_daily numeric, cvar_daily numeric, vol_ratio_vs_unconditional numeric, vol_daily_unshrunk numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with betas as (
    select factor, beta,
           (select max(b2.estimated_at) from public.book_factor_betas b2
             where b2.portfolio_id = (select public.atlas_active_portfolio())) as est_at
    from public.book_factor_betas
    -- The ACTIVE account's latest estimate set: every account has its own
    -- betas (MP-6), and a set is identified by (portfolio_id, estimated_at).
    where portfolio_id = (select public.atlas_active_portfolio())
      and estimated_at = (select max(b2.estimated_at) from public.book_factor_betas b2
                           where b2.portfolio_id = (select public.atlas_active_portfolio()))
      and factor <> 'alpha'
  ),
  cv as (
    select * from public.atlas_regime_factor_cov(p_axis_key, p_buckets, p_min_obs)
  ),
  q as (
    select c.bucket, max(c.n_obs) as n_obs, max(c.z_lo) as z_lo, max(c.z_hi) as z_hi,
           max(c.lw_delta) as lw_delta,
           sum(bi.beta * bj.beta * c.cov_shrunk) as vq,
           sum(bi.beta * bj.beta * c.cov_sample) as vq_raw
    from cv c
    join betas bi on bi.factor = c.factor_i
    join betas bj on bj.factor = c.factor_j
    group by c.bucket
  ),
  base as (select vq from q where bucket = 0),
  -- z_q and phi(z_q)/(1-q) for the Gaussian reading. Kept as a lookup rather
  -- than a normal-quantile implementation: three confidence levels are all this
  -- surface needs, and an unlisted one must fail loudly rather than silently
  -- resolve to a neighbour.
  k as (
    select * from (values
      (0.90::numeric, 1.2815515655::numeric, 1.7549833193::numeric),
      (0.95::numeric, 1.6448536270::numeric, 2.0627128054::numeric),
      (0.99::numeric, 2.3263478740::numeric, 2.6652142817::numeric)
    ) v(conf, z_q, es_mult)
    where v.conf = p_conf
  )
  select p_axis_key,
         q.bucket::int,
         case when q.bucket = 0 then 'unconditional'
              else 'q' || q.bucket || ' of ' || (select count(*)-1 from q) ||
                   ' (z ' || round(q.z_lo,2) || ' .. ' || round(q.z_hi,2) || ')'
         end,
         q.n_obs, q.z_lo, q.z_hi, q.lw_delta,
         (select est_at from betas limit 1),
         round(sqrt(q.vq)::numeric, 8),
         round((sqrt(q.vq) * sqrt(252))::numeric, 6),
         round((k.z_q     * sqrt(q.vq))::numeric, 8),
         round((k.es_mult * sqrt(q.vq))::numeric, 8),
         round((sqrt(q.vq) / sqrt((select vq from base)))::numeric, 6),
         round(sqrt(q.vq_raw)::numeric, 8)
  from q cross join k
  order by q.bucket;
$function$;

CREATE OR REPLACE FUNCTION public.atlas_var_backtest(p_conf numeric DEFAULT 0.95, p_as_of date DEFAULT NULL::date)
 RETURNS TABLE(as_of date, cvar_as_of date, leg text, basis text, axis_key text, conf numeric, window_start date, window_end date, n_obs integer, exceptions integer, var_pred_daily numeric, cvar_pred_daily numeric, cvar_pred_on_exceptions numeric, cvar_realised_daily numeric, sd_pred_daily numeric, sd_realised_daily numeric, sd_factor_window numeric, sd_residual_window numeric, kupiec_lr numeric, betas_estimated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
-- Postgres has no inverse normal CDF, so the three quantiles the schema permits
-- are tabulated. The CVaR multiplier phi(z)/(1-c) is DERIVED from that z rather
-- than tabulated beside it, so the two cannot drift apart.
q as (
  select p_conf as conf,
         case p_conf
           when 0.90 then 1.2815515655446004::numeric
           when 0.95 then 1.6448536269514722::numeric
           when 0.99 then 2.3263478740408408::numeric
         end as zq
   -- An unsupported confidence returns NO ROWS rather than resolving to a
   -- neighbour, exactly as atlas_regime_cvar does. A NULL quantile would
   -- silently report zero exceptions, which is a no-op answering 200.
   where p_conf in (0.90, 0.95, 0.99)
),
k as (
  select q.conf, q.zq,
         exp(-(q.zq::double precision ^ 2) / 2.0) / sqrt(2.0 * pi()) / (1 - q.conf::double precision) as cf
    from q
),
snap as (
  select coalesce(p_as_of, (select max(c.as_of) from public.book_regime_cvar c
                             where c.portfolio_id = (select public.atlas_active_portfolio()))) as cvar_as_of
),
bet as (
  select max(beta) filter (where factor = 'market')        as bm,
         max(beta) filter (where factor = 'cyclical')      as bc,
         max(beta) filter (where factor = 'concentration') as bk,
         max(beta) filter (where factor = 'dollar')        as bd,
         max(beta) filter (where factor = 'alpha')         as a0,
         max(estimated_at)                                 as bea
    from public.book_factor_betas
   -- The active account's own latest estimate set (MP-6).
   where portfolio_id = (select public.atlas_active_portfolio())
     and estimated_at = (select max(b2.estimated_at) from public.book_factor_betas b2
                          where b2.portfolio_id = (select public.atlas_active_portfolio()))
),
panel as (
  select f.date, f.market, f.cyclical, f.concentration, f.dollar,
         f.z_cyclical, f.z_concentration, f.z_dollar
    from public.vw_factor_return_panel f
   where f.complete_z
),
model as (
  select p.date,
         bet.bm * p.market + bet.bc * p.cyclical + bet.bk * p.concentration + bet.bd * p.dollar as r
    from panel p cross join bet
),
-- One vol per (axis, bucket) for the snapshot under test. Grouping collapses
-- the conf rows, which carry the identical vol.
vols as (
  select c.axis_key, c.bucket, max(c.vol_daily) as vol, max(c.z_hi) as z_hi
    from public.book_regime_cvar c, snap s
   where c.as_of = s.cvar_as_of and c.bucket > 0
     and c.portfolio_id = (select public.atlas_active_portfolio())
   group by c.axis_key, c.bucket
),
uvol as (
  select max(c.vol_daily) as vol
    from public.book_regime_cvar c, snap s
   where c.as_of = s.cvar_as_of and c.bucket = 0
     and c.portfolio_id = (select public.atlas_active_portfolio())
),
zlong as (
  select date, 'cyclical'::text      as ax, z_cyclical      as z from panel
  union all
  select date, 'concentration'::text as ax, z_concentration as z from panel
  union all
  select date, 'dollar'::text        as ax, z_dollar        as z from panel
),
-- Lowest bucket whose upper edge still contains z; a z above every edge falls
-- to the top bucket. The quartile edges do not tile the line exactly (bucket 2
-- opens a hair above bucket 1 closes), so a future session can land between
-- them -- it must not fall out of the sample.
assigned as (
  select zl.date, zl.ax,
         coalesce(
           (select v.vol from vols v
             where v.axis_key = zl.ax and zl.z <= v.z_hi
             order by v.bucket limit 1),
           (select v.vol from vols v
             where v.axis_key = zl.ax
             order by v.bucket desc limit 1)
         ) as vol
    from zlong zl
),
bookret as (
  select b.session_date as date, b.log_return as r
    from public.vw_book_realised_returns b
   where b.usable
),
-- Both book legs are scoped to the sessions the panel also covers, so the
-- conditional and unconditional book rows share one denominator.
bookpanel as (
  select br.date, br.r from bookret br join panel p on p.date = br.date
),
decomp as (
  select stddev_samp(m.r)                       as sd_factor,
         stddev_samp(bp.r - bet.a0 - m.r)       as sd_resid
    from bookpanel bp
    join model m on m.date = bp.date
   cross join bet
),
obs as (
  select 'model'::text as leg, 'unconditional'::text as basis, null::text as axis_key,
         m.date, m.r as ret, u.vol
    from model m cross join uvol u
  union all
  select 'model', 'regime_conditional', a.ax, m.date, m.r, a.vol
    from model m join assigned a on a.date = m.date
  union all
  select 'book', 'unconditional', null, bp.date, bp.r, u.vol
    from bookpanel bp cross join uvol u
  union all
  select 'book', 'regime_conditional', a.ax, bp.date, bp.r, a.vol
    from bookpanel bp join assigned a on a.date = bp.date
),
agg as (
  select o.leg, o.basis, o.axis_key,
         min(o.date) as window_start,
         max(o.date) as window_end,
         count(*)::int as n_obs,
         count(*) filter (where o.ret < -(k.zq * o.vol))::int as exceptions,
         avg(k.zq * o.vol)::numeric  as var_pred_daily,
         avg(k.cf * o.vol)::numeric  as cvar_pred_daily,
         avg(k.cf * o.vol) filter (where o.ret < -(k.zq * o.vol))::numeric as cvar_pred_on_exceptions,
         avg(-o.ret)       filter (where o.ret < -(k.zq * o.vol))::numeric as cvar_realised_daily,
         sqrt(avg(o.vol * o.vol))::numeric as sd_pred_daily,
         stddev_samp(o.ret)::numeric       as sd_realised_daily
    from obs o cross join k
   group by o.leg, o.basis, o.axis_key
)
select (select max(p.date) from panel p)          as as_of,
       (select s.cvar_as_of from snap s)          as cvar_as_of,
       a.leg, a.basis, a.axis_key, p_conf         as conf,
       a.window_start, a.window_end, a.n_obs, a.exceptions,
       round(a.var_pred_daily, 10),
       round(a.cvar_pred_daily, 10),
       round(a.cvar_pred_on_exceptions, 10),
       round(a.cvar_realised_daily, 10),
       round(a.sd_pred_daily, 10),
       round(a.sd_realised_daily, 10),
       case when a.leg = 'book' then round(d.sd_factor::numeric, 10) end,
       case when a.leg = 'book' then round(d.sd_resid::numeric, 10)  end,
       -- Kupiec unconditional coverage. 0*ln(0) is 0 in the limit and NaN in
       -- floating point, so both saturated cases are written out rather than
       -- left to the arithmetic.
       round((2 * (
           case when a.exceptions = 0 then 0
                else a.exceptions * ln((a.exceptions::numeric / a.n_obs) / (1 - p_conf)) end
         + case when a.exceptions = a.n_obs then 0
                else (a.n_obs - a.exceptions) * ln((1 - a.exceptions::numeric / a.n_obs) / p_conf) end
       ))::numeric, 10) as kupiec_lr,
       (select bet.bea from bet) as betas_estimated_at
  from agg a cross join decomp d
 -- An account with no estimate set, or no regime CVaR snapshot, has nothing
 -- to backtest. Without this every row came back built on NULL betas and
 -- NULL vols -- zero exceptions against no prediction, which reads as a pass.
 where (select bet.bea from bet) is not null
   and exists (select 1 from uvol where uvol.vol is not null)
 order by a.leg desc, a.basis, a.axis_key nulls first;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The nightly writers, one sync_log row per account.
--    Each account runs under its own x-atlas-portfolio in its own
--    subtransaction (the MP-5 shape): the estimate, the regime CVaR and the
--    backtest all read request-scoped views, and one account failing neither
--    blocks nor rolls back another. A refusal UPDATEs its log row and moves
--    on -- never a RAISE, which would roll back the row that recorded it.
-- ---------------------------------------------------------------------------

create or replace function public.atlas_write_book_factor_betas(
  p_min_obs int default 60, p_max_obs int default 252)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_orig  text := current_setting('request.headers', true);
  r       record;
  v_log   bigint;
  v_n     int;
  v_w0    date;
  v_w1    date;
  v_prev  record;
  v_at    timestamptz;
  v_rows  int;
begin
  for r in select p.id, p.name from public.portfolios p order by p.is_default desc, p.name loop
    insert into public.sync_log (function_name, source, status, portfolio_id, started_at, details)
    values ('atlas_write_book_factor_betas', 'pg_cron', 'running', r.id, clock_timestamp(),
            jsonb_build_object('portfolio', r.name))
    returning id into v_log;
    begin
      perform set_config('request.headers',
                         json_build_object('x-atlas-portfolio', r.id::text)::text, true);

      create temp table if not exists _bfb_est (
        factor text, beta numeric, std_error numeric, t_stat numeric, significant boolean,
        r_squared numeric, adj_r_squared numeric, n_obs int, window_start date, window_end date
      ) on commit drop;
      truncate _bfb_est;
      insert into _bfb_est select * from public.atlas_book_factor_betas_estimate(null, p_max_obs);

      select max(n_obs), max(window_start), max(window_end) into v_n, v_w0, v_w1 from _bfb_est;

      -- A new account has one or two settled sessions. Below the floor there
      -- is no estimate to publish, and that is recorded rather than an
      -- unstable set being appended to a history that cannot be restated.
      if v_n is null or v_n < p_min_obs then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'insufficient_history', 'n_obs', coalesce(v_n, 0),
                 'min_obs', p_min_obs)
         where id = v_log;
        continue;
      end if;

      -- An identical sample is not a new estimate. Same window, same count:
      -- the equity curve has not advanced, so appending would add a set that
      -- only restates the last one.
      select b.window_end, b.n_obs, b.estimated_at into v_prev
        from public.book_factor_betas b
       where b.portfolio_id = r.id
       order by b.estimated_at desc limit 1;
      if found and v_prev.window_end = v_w1 and v_prev.n_obs = v_n then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'already estimated for this window',
                 'window_end', v_w1, 'n_obs', v_n, 'estimated_at', v_prev.estimated_at)
         where id = v_log;
        continue;
      end if;

      -- clock_timestamp(), not now(): now() is the transaction's timestamp,
      -- so every account in this loop would share one estimated_at.
      v_at := clock_timestamp();
      insert into public.book_factor_betas
        (portfolio_id, estimated_at, window_start, window_end, n_obs, factor, beta,
         std_error, t_stat, significant, r_squared, adj_r_squared)
      select r.id, v_at, e.window_start, e.window_end, e.n_obs, e.factor, e.beta,
             e.std_error, e.t_stat, e.significant, e.r_squared, e.adj_r_squared
        from _bfb_est e;
      get diagnostics v_rows = row_count;

      if v_rows <> 5 then
        update public.sync_log
           set status = 'error', finished_at = clock_timestamp(),
               details = details || jsonb_build_object('reason', 'expected 5 coefficients',
                                                       'rows_written', v_rows)
         where id = v_log;
        continue;
      end if;

      update public.sync_log
         set status = 'success', finished_at = clock_timestamp(),
             details = details || jsonb_build_object(
               'estimated_at', v_at, 'window_start', v_w0, 'window_end', v_w1,
               'n_obs', v_n, 'rows_written', v_rows, 'se', 'newey_west')
       where id = v_log;
    exception when others then
      update public.sync_log
         set status = 'error', finished_at = clock_timestamp(), error_message = sqlerrm
       where id = v_log;
    end;
  end loop;
  perform set_config('request.headers', coalesce(v_orig, ''), true);
end;
$fn$;

create or replace function public.atlas_write_regime_cvar(
  p_logic_version text default 'v1'::text, p_conf numeric default 0.95)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_orig     text := current_setting('request.headers', true);
  r          record;
  v_log_id   bigint;
  v_as_of    date;
  v_upstream text;
  v_written  int;
  v_present  int;
  v_axes     text[] := array['cyclical','concentration','dollar'];
  v_axis     text;
  v_n        int;
  v_bea      timestamptz;
begin
  -- The factor panel is shared by every account; the gate on it is read once.
  -- Gate on the WRITER's name in sync_log, not the cron job's name.
  select max(date) into v_as_of
  from public.vw_factor_return_panel where complete_z;

  select status into v_upstream
  from public.sync_log
  where function_name = 'atlas_refresh_factor_scores'
    and started_at::date = clock_timestamp()::date
  order by started_at desc limit 1;

  for r in select p.id, p.name from public.portfolios p order by p.is_default desc, p.name loop
    insert into public.sync_log (function_name, source, status, portfolio_id, started_at, details)
    values ('atlas_write_regime_cvar', 'pg_cron', 'running', r.id, clock_timestamp(),
            jsonb_build_object('portfolio', r.name))
    returning id into v_log_id;
    begin
      perform set_config('request.headers',
                         json_build_object('x-atlas-portfolio', r.id::text)::text, true);
      v_written := 0;

      if v_upstream is distinct from 'success' then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'factor scores not refreshed today',
                 'upstream_status', coalesce(v_upstream, 'no row'),
                 'as_of', v_as_of)
         where id = v_log_id;
        continue;
      end if;

      -- No estimate set for this account means no regime CVaR, and that is
      -- a state of the account, not a failure of the job.
      select max(estimated_at) into v_bea
      from public.book_factor_betas where portfolio_id = r.id;
      if v_bea is null then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'no factor betas for this account', 'as_of', v_as_of)
         where id = v_log_id;
        continue;
      end if;

      select count(*) into v_present
      from public.book_regime_cvar
      where portfolio_id = r.id and as_of = v_as_of
        and logic_version = p_logic_version and conf = p_conf;

      if v_present = 0 then
        foreach v_axis in array v_axes loop
          with ins as (
            insert into public.book_regime_cvar
              (portfolio_id, as_of, logic_version, axis_key, bucket, bucket_label, n_obs,
               z_lo, z_hi, lw_delta, betas_estimated_at, conf, vol_daily, vol_annual,
               var_daily, cvar_daily, vol_ratio_vs_unconditional, vol_daily_unshrunk)
            select r.id, v_as_of, p_logic_version, c.axis_key, c.bucket, c.bucket_label,
                   c.n_obs, c.z_lo, c.z_hi, c.lw_delta, c.betas_estimated_at, p_conf,
                   c.vol_daily, c.vol_annual, c.var_daily, c.cvar_daily,
                   c.vol_ratio_vs_unconditional, c.vol_daily_unshrunk
            from public.atlas_regime_cvar(v_axis, 4, p_conf) c
            returning 1
          )
          select count(*) into v_n from ins;
          v_written := v_written + v_n;
        end loop;
      end if;

      if v_written > 0 then
        update public.sync_log
           set status = 'success', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'as_of', v_as_of, 'rows_written', v_written, 'rows_present', v_present,
                 'conf', p_conf, 'logic_version', p_logic_version,
                 'betas_estimated_at', v_bea, 'axes', to_jsonb(v_axes))
         where id = v_log_id;
      elsif v_present > 0 then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'already written for this as_of',
                 'as_of', v_as_of, 'rows_present', v_present)
         where id = v_log_id;
      else
        update public.sync_log
           set status = 'error', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'produced no rows and none present', 'as_of', v_as_of)
         where id = v_log_id;
      end if;
    exception when others then
      update public.sync_log
         set status = 'error', finished_at = clock_timestamp(), error_message = sqlerrm
       where id = v_log_id;
    end;
  end loop;
  perform set_config('request.headers', coalesce(v_orig, ''), true);
end;
$fn$;

create or replace function public.atlas_write_var_backtest(
  p_logic_version text default 'v1'::text,
  p_confs numeric[] default array[0.90, 0.95, 0.99])
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_orig       text := current_setting('request.headers', true);
  r            record;
  v_log_id     bigint;
  v_as_of      date;
  v_cvar_as_of date;
  v_written    int;
  v_present    int;
  v_n          int;
  v_conf       numeric;
begin
  select max(f.date) into v_as_of
  from public.vw_factor_return_panel f where f.complete_z;

  for r in select p.id, p.name from public.portfolios p order by p.is_default desc, p.name loop
    insert into public.sync_log (function_name, source, status, portfolio_id, started_at, details)
    values ('atlas_write_var_backtest', 'pg_cron', 'running', r.id, clock_timestamp(),
            jsonb_build_object('portfolio', r.name))
    returning id into v_log_id;
    begin
      perform set_config('request.headers',
                         json_build_object('x-atlas-portfolio', r.id::text)::text, true);
      v_written := 0;

      -- Gate on the dependency: THIS account's regime CVaR snapshot for the
      -- session being graded (not on the upstream job's status).
      select max(c.as_of) into v_cvar_as_of
      from public.book_regime_cvar c where c.portfolio_id = r.id;

      if v_as_of is null or v_cvar_as_of is distinct from v_as_of then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'no regime cvar snapshot for the latest panel session',
                 'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of)
         where id = v_log_id;
        continue;
      end if;

      select count(*) into v_present
      from public.var_backtest_runs b
      where b.portfolio_id = r.id and b.as_of = v_as_of and b.logic_version = p_logic_version;

      -- Every requested confidence is attempted, every time. A level already
      -- written is skipped by ON CONFLICT, not by abandoning the whole run.
      foreach v_conf in array p_confs loop
        with ins as (
          insert into public.var_backtest_runs
            (portfolio_id, as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf,
             window_start, window_end, n_obs, exceptions,
             var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
             cvar_realised_daily, sd_pred_daily, sd_realised_daily,
             sd_factor_window, sd_residual_window,
             kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
          select r.id, b.as_of, b.cvar_as_of, p_logic_version, b.leg, b.basis, b.axis_key, b.conf,
                 b.window_start, b.window_end, b.n_obs, b.exceptions,
                 b.var_pred_daily, b.cvar_pred_daily, b.cvar_pred_on_exceptions,
                 b.cvar_realised_daily, b.sd_pred_daily, b.sd_realised_daily,
                 b.sd_factor_window, b.sd_residual_window,
                 b.kupiec_lr,
                 b.kupiec_lr > 3.841459,
                 b.kupiec_lr > 6.634897,
                 b.betas_estimated_at
          from public.atlas_var_backtest(v_conf) b
          on conflict do nothing
          returning 1
        )
        select count(*) into v_n from ins;
        v_written := v_written + v_n;
      end loop;

      if v_written > 0 then
        update public.sync_log
           set status = 'success', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of,
                 'rows_written', v_written, 'rows_present_before', v_present,
                 'confs', to_jsonb(p_confs), 'logic_version', p_logic_version)
         where id = v_log_id;
      elsif v_present > 0 then
        update public.sync_log
           set status = 'skipped', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'every requested confidence already written for this as_of',
                 'as_of', v_as_of, 'rows_present_before', v_present,
                 'confs', to_jsonb(p_confs))
         where id = v_log_id;
      else
        update public.sync_log
           set status = 'error', finished_at = clock_timestamp(),
               details = details || jsonb_build_object(
                 'reason', 'produced no rows and none present',
                 'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of)
         where id = v_log_id;
      end if;
    exception when others then
      update public.sync_log
         set status = 'error', finished_at = clock_timestamp(), error_message = sqlerrm
       where id = v_log_id;
    end;
  end loop;
  perform set_config('request.headers', coalesce(v_orig, ''), true);
end;
$fn$;

revoke execute on function public.atlas_book_factor_betas_estimate(date, int) from public, anon, authenticated;
revoke execute on function public.atlas_write_book_factor_betas(int, int) from public, anon, authenticated;
revoke execute on function public.atlas_write_regime_cvar(text, numeric) from public, anon, authenticated;
revoke execute on function public.atlas_write_var_backtest(text, numeric[]) from public, anon, authenticated;
revoke execute on function public.atlas_regime_cvar(text, integer, numeric, integer) from public, anon, authenticated;
revoke execute on function public.atlas_var_backtest(numeric, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Schedule. The betas run before the regime CVaR that reads them, after
--    the factor scores (23:10). The equity curve they read lands at 01:00,
--    so tonight's set is estimated through the previous session; an
--    unchanged window is skipped rather than restated.
-- ---------------------------------------------------------------------------
select cron.schedule('atlas_write_book_factor_betas', '42 23 * * 1-6',
                     'select public.atlas_write_book_factor_betas();');

-- The completion-chained pipeline (I-1, shadow) gets the same edge: the
-- betas depend on the factor scores, the regime CVaR on the betas.
insert into public.atlas_chain_stages
  (stage, seq, kind, target, depends_on, hard, dow, timeout_ms, note)
values ('write_book_factor_betas', 265, 'sql', 'atlas_write_book_factor_betas()',
        'refresh_factor_scores', true, '{1,2,3,4,5,6}', 120000,
        'per account; the regime CVaR reads the betas this writes');
update public.atlas_chain_stages
   set depends_on = 'write_book_factor_betas'
 where stage = 'write_regime_cvar';

-- ---------------------------------------------------------------------------
-- 7. Assertions.
-- ---------------------------------------------------------------------------
do $assert$
declare v_def uuid := public.atlas_default_portfolio();
begin
  if exists (select 1 from public.book_factor_betas where portfolio_id <> v_def)
     or exists (select 1 from public.book_regime_cvar where portfolio_id <> v_def)
     or exists (select 1 from public.var_backtest_runs where portfolio_id <> v_def)
     or exists (select 1 from public.book_model_diagnostics where portfolio_id <> v_def) then
    raise exception 'existing factor-layer rows must all belong to the default account';
  end if;
  if has_function_privilege('anon', 'public.atlas_write_book_factor_betas(int,int)', 'execute')
     or has_function_privilege('anon', 'public.atlas_ols(numeric[],numeric[],int)', 'execute')
     or has_function_privilege('anon', 'public.atlas_book_factor_betas_estimate(date,int)', 'execute')
     or has_function_privilege('anon', 'public.atlas_write_regime_cvar(text,numeric)', 'execute')
     or has_function_privilege('anon', 'public.atlas_write_var_backtest(text,numeric[])', 'execute') then
    raise exception 'a factor-layer writer is executable by anon';
  end if;
end
$assert$;
