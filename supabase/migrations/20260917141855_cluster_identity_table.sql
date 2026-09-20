create table if not exists public.cluster_identity (
    as_of_date            date        not null,
    logic_version         text        not null,
    cluster_id            integer     not null,

    cluster_size          integer     not null,
    held_count            integer     not null default 0,
    avg_intra_rho         numeric,

    composition_label     text,
    composition_basis     text        not null,
    composition_coverage  numeric,

    n_obs                 integer,
    r_squared             numeric,
    beta_market           numeric,    t_market          numeric,
    beta_cyclical         numeric,    t_cyclical        numeric,
    beta_concentration    numeric,    t_concentration   numeric,
    beta_dollar           numeric,    t_dollar          numeric,
    primary_axis          text,
    primary_axis_sign     smallint,
    fit_status            text        not null,

    created_at            timestamptz not null default now(),

    primary key (as_of_date, logic_version, cluster_id),

    constraint ci_basis_ck check (composition_basis in
        ('curated_theme', 'vendor_sector', 'unclassified')),
    constraint ci_fit_ck check (fit_status in
        ('measured', 'insufficient_history', 'singular')),
    constraint ci_label_basis_ck check (
        (composition_basis = 'unclassified' and composition_label is null)
     or (composition_basis <> 'unclassified' and composition_label is not null
         and btrim(composition_label) <> '')),
    constraint ci_coverage_ck check (composition_coverage is null
        or (composition_coverage >= 0 and composition_coverage <= 1)),
    constraint ci_r2_ck check (r_squared is null
        or (r_squared > '-Infinity'::numeric and r_squared <= 1)),
    constraint ci_axis_ck check (
        (primary_axis is null and primary_axis_sign is null)
     or (primary_axis in ('cyclical', 'concentration', 'dollar')
         and primary_axis_sign in (-1, 1)
         and fit_status = 'measured')),
    constraint ci_fit_coeff_ck check (
        fit_status = 'measured' or (beta_market is null and n_obs is null))
);

comment on table public.cluster_identity is
'H-2. One row per risk cluster per night: what the cluster is (composition_label, from position_themes where held members are mapped -- never from assets.sector, which reads "Other" for half the universe including the semis bet) and which regime axis it answers to (multivariate loading on market + the three factor axes, market as a control). primary_axis is NULL unless an axis clears |t| > 2, because an axis that does not clear is absent from the naming rather than shown small. Rewritten per night by atlas_refresh_cluster_identity(): cluster ids are derived from a nightly clustering and do not survive recomputation, so this is DELETE+INSERT and never ON CONFLICT DO NOTHING.';

alter table public.cluster_identity enable row level security;
drop policy if exists cluster_identity_read on public.cluster_identity;
create policy cluster_identity_read on public.cluster_identity for select using (true);
drop policy if exists cluster_identity_service on public.cluster_identity;
create policy cluster_identity_service on public.cluster_identity for all
    to service_role using (true) with check (true);

grant select on public.cluster_identity to anon, authenticated, service_role;

create index if not exists cluster_identity_asof_idx
    on public.cluster_identity (as_of_date desc, held_count desc);
