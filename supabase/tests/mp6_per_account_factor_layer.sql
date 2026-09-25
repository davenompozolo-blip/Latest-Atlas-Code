-- MP-6 contract: the factor layer is estimated and read per account.
-- Run under psql against production; the whole file rolls back. Every check
-- raises on failure.
begin;

do $$
declare
  v_default uuid := public.atlas_default_portfolio();
  v_empty   uuid;
  n int;
  m numeric;
begin
  -- 1. The estimator reproduces C3 (window ending 2026-09-04, n = 168) on
  --    every coefficient, standard error and t-stat. This is what pins the
  --    specification -- SPY adj_close, raw daily scores, NW(4) -- and a
  --    drifting panel or solver fails here, not in a published number.
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', v_default::text)::text, true);
  select count(*), max(greatest(abs(e.beta - o.beta), abs(e.std_error - o.std_error),
                                abs(e.t_stat - o.t_stat) * 1e-3, abs(e.r_squared - o.r_squared)))
    into n, m
    from public.atlas_book_factor_betas_estimate('2026-09-04', 252) e
    join public.book_factor_betas o
      on o.factor = e.factor and o.portfolio_id = v_default
     and o.estimated_at = '2026-09-09 15:22:52.968575+00' and o.n_obs = e.n_obs;
  if n <> 5 or m > 1e-9 then
    raise exception 'C3 not reproduced: % coefficients matched, max difference %', n, m;
  end if;

  -- 2. atlas_ols fits a near-perfect line with a large slope t on the
  --    classical path (p_nw_lag = 0) -- the solver itself, apart from the book.
  select abs(o.t_stat) into m from public.atlas_ols(
      (select array_agg(y order by i) from unnest(array[1.0,2.1,2.9,4.2,5.1,5.8,7.2,8.1]::numeric[]) with ordinality u(y,i)),
      (select array_agg(array[x] order by i) from unnest(array[1,2,3,4,5,6,7,8]::numeric[]) with ordinality u(x,i)),
      0) o where o.ix = 2;
  if m is null or m < 10 then
    raise exception 'atlas_ols classical fit on a clean line gave t = %', m;
  end if;

  -- 3. A singular design has no coefficients: a constant regressor is
  --    collinear with the intercept.
  select count(*) into n from public.atlas_ols(array[1,2,3,4,5]::numeric[],
                                               array[[1],[1],[1],[1],[1]]::numeric[], 0);
  if n <> 0 then raise exception 'atlas_ols published % coefficients for a singular design', n; end if;

  -- 4. An account with no estimate set has nothing to backtest and no
  --    regime CVaR -- no rows, never rows built on NULL betas.
  --    The precondition is CREATED, not waited for: a scratch portfolio that
  --    can have no betas, rolled back with the file. Gating on a real account
  --    having none would silently stop running the day it reaches 60
  --    sessions (CodeRabbit, PR #837). Deleting its betas is not an option --
  --    book_factor_betas is append-only by trigger.
  insert into public.portfolios (name, broker, metadata)
       values ('test:mp6-no-betas', 'test', '{"scratch": true}')
    returning id into v_empty;
  if exists (select 1 from public.book_factor_betas where portfolio_id = v_empty) then
    raise exception 'scratch portfolio unexpectedly carries betas';
  end if;
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', v_empty::text)::text, true);
  if public.atlas_active_portfolio() <> v_empty then
    raise exception 'the header did not select the scratch portfolio -- check 4 would test the default account';
  end if;
  select count(*) into n from public.atlas_var_backtest(0.95);
  if n <> 0 then raise exception 'atlas_var_backtest returned % rows for an account with no betas', n; end if;
  select count(*) into n from public.atlas_regime_cvar('dollar', 4, 0.95);
  if n <> 0 then raise exception 'atlas_regime_cvar returned % rows for an account with no betas', n; end if;
  perform set_config('request.headers', '', true);
end $$;

-- 5. The browser reads only the active account's rows (happy path included:
--    the default account still sees its own).
set local role anon;
do $$
declare v_other uuid := (select id from public.vw_portfolios where not is_default order by name limit 1);
begin
  if not exists (select 1 from public.book_factor_betas) then
    raise exception 'anon sees no factor betas on the default account';
  end if;
  if exists (select 1 from public.book_factor_betas where portfolio_id <> public.atlas_active_portfolio())
     or exists (select 1 from public.book_regime_cvar where portfolio_id <> public.atlas_active_portfolio())
     or exists (select 1 from public.var_backtest_runs where portfolio_id <> public.atlas_active_portfolio()) then
    raise exception 'anon sees another account''s factor layer on the default header';
  end if;
  if v_other is not null then
    perform set_config('request.headers', json_build_object('x-atlas-portfolio', v_other::text)::text, true);
    if exists (select 1 from public.book_factor_betas where portfolio_id <> v_other)
       or exists (select 1 from public.book_regime_cvar where portfolio_id <> v_other)
       or exists (select 1 from public.var_backtest_runs where portfolio_id <> v_other)
       or exists (select 1 from public.book_model_diagnostics where portfolio_id <> v_other) then
      raise exception 'anon on % sees another account''s factor layer', v_other;
    end if;
  end if;
end $$;
reset role;

-- 6. Writers and the estimator are not executable by the browser roles.
do $$
begin
  if has_function_privilege('anon', 'public.atlas_write_book_factor_betas(int,int)', 'execute')
     or has_function_privilege('anon', 'public.atlas_book_factor_betas_estimate(date,int)', 'execute')
     or has_function_privilege('anon', 'public.atlas_ols(numeric[],numeric[],int)', 'execute')
     or has_function_privilege('anon', 'public.atlas_write_regime_cvar(text,numeric)', 'execute')
     or has_function_privilege('anon', 'public.atlas_write_var_backtest(text,numeric[])', 'execute') then
    raise exception 'a factor-layer writer is executable by anon';
  end if;
end $$;

select 'mp6 per-account factor layer: all checks passed' as result;
rollback;
