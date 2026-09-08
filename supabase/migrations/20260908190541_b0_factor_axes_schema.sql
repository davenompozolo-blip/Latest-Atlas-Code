-- Phase B0: intermarket factor axes with FROZEN loadings, and the book's
-- estimated exposure to them.
--
-- The loadings are the A1 eigenvectors and are never re-estimated on a rolling
-- window: doing so would silently redefine what each axis means, making betas
-- non-comparable across time and any stored history meaningless. A re-fit is a
-- deliberate, versioned event -- a new row set with a new estimated_at, never an
-- in-place update.

create table if not exists public.factor_axes (
  axis_key            text primary key,
  label               text not null,
  pc_rank             int  not null,
  variance_explained  numeric not null,
  marginal            boolean not null,
  estimation_start    date not null,
  estimation_end      date not null,
  estimated_at        timestamptz not null default now(),

  constraint factor_axes_pc_rank_ck  check (pc_rank between 1 and 11),
  constraint factor_axes_ve_ck       check (variance_explained > 0 and variance_explained < 1),
  constraint factor_axes_window_ck   check (estimation_end > estimation_start),
  constraint factor_axes_label_ck    check (length(btrim(label)) > 0),
  constraint factor_axes_pc_rank_uq  unique (pc_rank)
);

comment on table public.factor_axes is
  'The three intermarket axes from the A1 study: components above the Marchenko-Pastur noise edge on daily log returns of 11 ratio pairs (cper_gld excluded -- it loaded below the edge on all three).';
comment on column public.factor_axes.marginal is
  'True where the component barely cleared the MP noise edge. dollar is marginal: eigenvalue 1.1349 against an edge of 1.0972. Treat its betas with more suspicion than the other two.';
comment on column public.factor_axes.label is
  'Display name. States the axis ORIENTATION, because an eigenvector is defined only up to sign and a loading is uninterpretable without knowing which way is up.';
comment on column public.factor_axes.estimated_at is
  'Freeze timestamp. A re-fit inserts a NEW row set under a new timestamp; it never updates these in place.';

create table if not exists public.factor_axis_loadings (
  axis_key text not null references public.factor_axes(axis_key)
             on update cascade on delete restrict,
  pair_key text not null references public.ratio_pairs(pair_key)
             on update cascade on delete restrict,
  loading  numeric not null,

  constraint factor_axis_loadings_pkey primary key (axis_key, pair_key),
  -- A unit eigenvector cannot have an element outside [-1, 1]. The vector-norm
  -- invariant spans rows and is asserted by the loader instead.
  constraint factor_axis_loadings_range_ck check (loading between -1 and 1)
);

comment on table public.factor_axis_loadings is
  'Frozen eigenvector elements. Each axis vector is unit-norm and the three are mutually orthogonal to ~1e-16; asserted at load time, not enforceable as a row CHECK.';

create table if not exists public.book_factor_betas (
  estimated_at   timestamptz not null default now(),
  window_start   date not null,
  window_end     date not null,
  n_obs          int  not null,
  factor         text not null,
  beta           numeric not null,
  std_error      numeric,
  t_stat         numeric,
  significant    boolean,
  r_squared      numeric not null,
  adj_r_squared  numeric not null,

  constraint book_factor_betas_pkey primary key (estimated_at, factor),
  constraint bfb_factor_ck check (factor in ('market','cyclical','concentration','dollar','alpha')),
  constraint bfb_nobs_ck   check (n_obs > 0),
  constraint bfb_window_ck check (window_end > window_start),
  -- significant is a claim about t_stat; it must not be able to disagree with it
  constraint bfb_significant_ck check (
    (t_stat is null and significant is null) or
    (t_stat is not null and significant = (abs(t_stat) > 2)))
);

comment on table public.book_factor_betas is
  'Append-only estimate history. A row records what was estimated at estimated_at over [window_start, window_end]; it is never updated. An insignificant beta must render downstream as "no measurable exposure", never as a value.';

-- "Append-only" is a property the table should enforce, not one every future
-- writer has to remember.
create or replace function public.book_factor_betas_append_only()
returns trigger language plpgsql as $fn$
begin
  raise exception 'book_factor_betas is append-only: % refused. Insert a new estimate under a new estimated_at.', tg_op;
end;
$fn$;

drop trigger if exists book_factor_betas_no_mutate on public.book_factor_betas;
create trigger book_factor_betas_no_mutate
  before update or delete on public.book_factor_betas
  for each row execute function public.book_factor_betas_append_only();

-- RLS, matching the house pattern on book_risk_daily / position_verdicts
alter table public.factor_axes          enable row level security;
alter table public.factor_axis_loadings enable row level security;
alter table public.book_factor_betas    enable row level security;

drop policy if exists factor_axes_read             on public.factor_axes;
drop policy if exists factor_axes_service          on public.factor_axes;
create policy factor_axes_read    on public.factor_axes    for select to anon, authenticated using (true);
create policy factor_axes_service on public.factor_axes    for all    to service_role using (true) with check (true);

drop policy if exists factor_axis_loadings_read    on public.factor_axis_loadings;
drop policy if exists factor_axis_loadings_service on public.factor_axis_loadings;
create policy factor_axis_loadings_read    on public.factor_axis_loadings for select to anon, authenticated using (true);
create policy factor_axis_loadings_service on public.factor_axis_loadings for all    to service_role using (true) with check (true);

drop policy if exists book_factor_betas_read       on public.book_factor_betas;
drop policy if exists book_factor_betas_service    on public.book_factor_betas;
create policy book_factor_betas_read    on public.book_factor_betas for select to anon, authenticated using (true);
create policy book_factor_betas_service on public.book_factor_betas for all    to service_role using (true) with check (true);
