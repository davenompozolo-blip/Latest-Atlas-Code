-- E3 / B2, step 4. Append-only history of the regime-conditional CVaR.
--
-- A history rather than a view, for the same reason position_verdicts is one:
-- a row records what was known on `as_of` under `logic_version`, and the
-- covariance behind it is a 3,369-session estimate that shifts every night. A
-- view would silently restate every past reading.
--
-- E4 (PCM priors conditioned on regime) consumes the bucket covariances, so
-- those stay available from atlas_regime_factor_cov rather than being flattened
-- into this table -- this is the risk READING, not the estimate behind it.

create table if not exists public.book_regime_cvar (
  as_of                      date        not null,
  logic_version              text        not null default 'v1',
  axis_key                   text        not null references public.factor_axes(axis_key)
                                           on update cascade on delete restrict,
  bucket                     int         not null,
  bucket_label               text        not null,
  n_obs                      int         not null,
  z_lo                       numeric,
  z_hi                       numeric,
  lw_delta                   numeric     not null,
  betas_estimated_at         timestamptz not null,
  conf                       numeric     not null,
  vol_daily                  numeric     not null,
  vol_annual                 numeric     not null,
  var_daily                  numeric     not null,
  cvar_daily                 numeric     not null,
  vol_ratio_vs_unconditional numeric     not null,
  vol_daily_unshrunk         numeric     not null,
  computed_at                timestamptz not null default now(),

  constraint book_regime_cvar_pkey primary key (as_of, logic_version, axis_key, bucket, conf),

  -- Every rule below is a predicate over a single row, so it is a CHECK and not
  -- an assertion the job could forget. Same argument as position_verdicts.

  -- The master spec's floor, made structural: a bucket under 250 sessions must
  -- have been merged before it got here.
  constraint brc_min_obs_ck      check (n_obs >= 250),
  constraint brc_bucket_ck       check (bucket >= 0),
  -- A shrinkage intensity is a proportion. Outside [0,1] it is not a shrinkage.
  constraint brc_delta_range_ck  check (lw_delta >= 0 and lw_delta <= 1),
  constraint brc_vol_positive_ck check (vol_daily > 0 and vol_daily_unshrunk > 0),
  -- CVaR is the mean beyond the quantile, so it exceeds VaR for any continuous
  -- distribution. If it ever does not, the arithmetic is wrong, not the market.
  constraint brc_cvar_gt_var_ck  check (cvar_daily > var_daily),
  -- Bucket 0 IS the unconditional row, so its ratio against itself is exactly 1.
  -- This is what stops a mislabelled bucket being written as the baseline.
  constraint brc_uncond_ratio_ck check (bucket <> 0 or vol_ratio_vs_unconditional = 1),
  constraint brc_conf_ck         check (conf in (0.90, 0.95, 0.99))
);

create index if not exists book_regime_cvar_as_of_idx on public.book_regime_cvar (as_of desc);

comment on table public.book_regime_cvar is
  'Append-only history of stressed VaR/CVaR per regime bucket. Gaussian parametric off b''(shrunk Sigma)b -- understates a fat tail by construction and is labelled as such. Bucket 0 is unconditional on the identical sample.';
comment on column public.book_regime_cvar.vol_ratio_vs_unconditional is
  'Bucket vol over unconditional vol. The exposures are identical across buckets, so this isolates the regime effect on the covariance from the position of the book.';
comment on column public.book_regime_cvar.vol_daily_unshrunk is
  'Same quadratic form on the SAMPLE covariance. Kept beside the shrunk figure so the shrinkage is evidenced rather than asserted.';

-- Append-only, exactly as book_factor_betas is.
create or replace function public.atlas_book_regime_cvar_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $t$
begin
  raise exception 'book_regime_cvar is append-only (attempted %)', tg_op;
end;
$t$;

drop trigger if exists book_regime_cvar_append_only on public.book_regime_cvar;
create trigger book_regime_cvar_append_only
  before update or delete on public.book_regime_cvar
  for each row execute function public.atlas_book_regime_cvar_append_only();

revoke execute on function public.atlas_book_regime_cvar_append_only() from public, anon, authenticated;
