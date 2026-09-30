-- B1 · book_model_diagnostics (master spec §7, B1 spec §6)
--
-- Append-only, one row per validation run, so model quality becomes a SERIES
-- rather than a one-off claim. Every future re-estimate of book_factor_betas
-- gets its own diagnostics row pinned to the estimate set it tested.

create table if not exists public.book_model_diagnostics (
    estimated_at             timestamptz not null default now(),
    -- Which estimate set was tested. NOT a foreign key: book_factor_betas is
    -- keyed (estimated_at, factor) and holds five rows per set, so estimated_at
    -- is not unique there and cannot carry a REFERENCES. The trigger below
    -- enforces the same guarantee instead -- a diagnostics row that names an
    -- estimate set which does not exist is meaningless.
    betas_estimated_at       timestamptz not null,
    window_start             date        not null,
    window_end               date        not null,
    n_obs                    integer     not null check (n_obs > 0),

    -- 2.1 predicted. The split is itself a finding: a book whose predicted risk
    -- is mostly residual is not well described by these factors, whatever the
    -- R-squared says. All three are DAILY standard deviations.
    sigma_pred               double precision not null check (sigma_pred > 0),
    sigma_pred_factor        double precision not null check (sigma_pred_factor >= 0),
    sigma_pred_residual      double precision not null check (sigma_pred_residual >= 0),

    -- 2.2 realised, on the C1-cleaned return series.
    sigma_realised_20d_mean  double precision not null check (sigma_realised_20d_mean > 0),
    sigma_realised_60d_mean  double precision not null check (sigma_realised_60d_mean > 0),
    sigma_realised_full      double precision,

    -- 2.3 bias = realised / predicted.
    --
    -- bias_ratio is the FULL-WINDOW figure and is ~1 by construction: OLS
    -- guarantees var(y) = var(fit) + var(resid) in sample, and sigma_pred is
    -- built from exactly those two pieces. It is recorded for completeness and
    -- must not be read as evidence the model is correctly scaled.
    --
    -- The rolling columns are the ones that carry information: a CONSTANT
    -- predicted sigma against a realised vol that moves is where the model
    -- actually fails, and min/max are what show it.
    bias_ratio               double precision not null,
    bias_20d_mean            double precision,
    bias_20d_min             double precision,
    bias_20d_max             double precision,
    bias_60d_mean            double precision,
    bias_20d_share_outside   double precision
        check (bias_20d_share_outside is null
               or bias_20d_share_outside between 0 and 1),

    -- 3 residual diagnostics. ARCH first, per the spec.
    arch_lm_p                double precision check (arch_lm_p is null or arch_lm_p between 0 and 1),
    arch_lm_lags             integer,
    ljung_box_p              double precision check (ljung_box_p is null or ljung_box_p between 0 and 1),
    ljung_box_sq_p           double precision check (ljung_box_sq_p is null or ljung_box_sq_p between 0 and 1),
    jarque_bera_p            double precision check (jarque_bera_p is null or jarque_bera_p between 0 and 1),
    skew                     double precision,
    excess_kurtosis          double precision,

    -- 4 stability. Recorded as jsonb rather than 10 more columns: the factor
    -- set is defined by factor_axes and will change if an axis is added, and a
    -- fixed column per factor would make that a schema migration.
    stability                jsonb,
    axis_correlations        jsonb,

    logic_version            text not null default 'v1',
    notes                    text,

    primary key (estimated_at)
);

comment on table public.book_model_diagnostics is
'B1 · whether the four-factor model describes the book''s risk well enough to build on. Append-only, one row per validation run, pinned to the book_factor_betas estimate set it tested. IN-SAMPLE diagnostics only -- with n<400 there is no honest holdout, so a passing row clears a low bar.';

comment on column public.book_model_diagnostics.bias_ratio is
'Full-window realised/predicted. ~1 BY CONSTRUCTION (OLS variance identity), so it is not evidence of correct scaling. Read bias_20d_min/max instead.';
comment on column public.book_model_diagnostics.sigma_pred_residual is
'Residual component of predicted daily vol. Its share of total variance says how much of the book''s risk these factors do NOT describe.';
comment on column public.book_model_diagnostics.bias_20d_share_outside is
'Share of rolling 20-session windows whose bias ratio falls outside the spec''s 0.8-1.2 band. This is the real scale test.';

-- Integrity: the estimate set named must exist.
create or replace function public.book_model_diagnostics_betas_exist()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (select 1 from public.book_factor_betas
                  where estimated_at = new.betas_estimated_at) then
    raise exception 'no book_factor_betas estimate set at % -- a diagnostics row must name the set it tested',
      new.betas_estimated_at;
  end if;
  return new;
end;
$$;

create trigger book_model_diagnostics_betas_exist
  before insert on public.book_model_diagnostics
  for each row execute function public.book_model_diagnostics_betas_exist();

-- Append-only, same pattern as book_factor_betas.
create or replace function public.book_model_diagnostics_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  raise exception 'book_model_diagnostics is append-only: % refused. Run the validation again and insert a new row under a new estimated_at.', tg_op
    using hint = 'A rewritten row no longer records what the model looked like when it was tested.';
end;
$$;

create trigger book_model_diagnostics_append_only
  before update or delete on public.book_model_diagnostics
  for each row execute function public.book_model_diagnostics_append_only();

grant select on public.book_model_diagnostics to anon, authenticated;

-- Postgres grants EXECUTE to PUBLIC by default; revoking anon/authenticated by
-- name alone leaves the grant in place.
revoke execute on function public.book_model_diagnostics_betas_exist() from public, anon, authenticated;
revoke execute on function public.book_model_diagnostics_append_only() from public, anon, authenticated;
