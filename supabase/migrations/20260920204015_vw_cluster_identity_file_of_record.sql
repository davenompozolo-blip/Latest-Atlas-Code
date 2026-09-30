-- The read side of the cluster identity layer.
--
-- Scoped to ONE night inside the view. `cluster_identity` is an append-only
-- history keyed on (as_of_date, logic_version, cluster_id), and H-1 is the
-- entry about what happens when a surface aggregates such a history across
-- nights: it double-counts and every label repeats.
--
-- The axis vocabulary is JOINED from `factor_axes` rather than restated here,
-- so no consumer holds a copy of a classification the database owns. In
-- particular `positive_means` travels with the sign, because an axis key
-- alone says which axis a cluster loads on and NOT which way it pushes it --
-- the defect F-5 caught on the tape, one layer down.
--
-- The held-symbols column is computed ONCE in a CTE. As a correlated
-- subquery it was 45 clusters x one full evaluation of vw_positions_current
-- each: 15,887 buffers and 1,208 ms against anon's 3,000 ms cap, which is the
-- "compute it once and hand it down" lesson (atlas_counterfactual_frozen,
-- 2026-08-31). This view is browser-facing, so a warm reading near the
-- ceiling is the whole exposure. 1,208 -> 49 ms.
create or replace view public.vw_cluster_identity as
with night as (
    select max(as_of_date) as_of_date from public.cluster_identity
),
book as (
    select p.symbol from public.vw_positions_current p where p.market_value > 0
),
held as (
    select uc.cluster_id, array_agg(uc.symbol order by uc.symbol) symbols
    from public.universe_clusters uc
    join night n on n.as_of_date = uc.as_of_date
    join book b on b.symbol = uc.symbol
    group by uc.cluster_id
)
select
    ci.as_of_date,
    ci.logic_version,
    ci.cluster_id,
    ci.cluster_size,
    ci.held_count,
    ci.avg_intra_rho,
    ci.composition_label,
    ci.composition_basis,
    ci.composition_coverage,
    ci.fit_status,
    ci.n_obs,
    ci.r_squared,
    ci.beta_market,
    ci.t_market,
    -- Bound to the statistic beside it, the `bfb_significant_ck`
    -- construction: a surface cannot be handed a flag that disagrees with
    -- its own evidence.
    (ci.t_market is not null and abs(ci.t_market) > 2) as market_significant,
    ci.beta_cyclical,      ci.t_cyclical,
    ci.beta_concentration, ci.t_concentration,
    ci.beta_dollar,        ci.t_dollar,
    ci.primary_axis,
    ci.primary_axis_sign,
    -- The t that named the axis, so the strength of the claim travels with it.
    case ci.primary_axis
        when 'cyclical'      then ci.t_cyclical
        when 'concentration' then ci.t_concentration
        when 'dollar'        then ci.t_dollar
    end as primary_axis_t,
    case ci.primary_axis
        when 'cyclical'      then ci.beta_cyclical
        when 'concentration' then ci.beta_concentration
        when 'dollar'        then ci.beta_dollar
    end as primary_axis_beta,
    fa.label          as primary_axis_label,
    fa.positive_means as primary_axis_positive_means,
    -- Provenance only. `marginal` means the component barely cleared the
    -- Marchenko-Pastur noise edge -- a property of the PCA, not of the book.
    -- `dollar` is marginal AND the book's most significant exposure, so
    -- reading it as a gate withholds the axis that matters most.
    fa.marginal       as primary_axis_marginal,
    h.symbols         as held_symbols
from public.cluster_identity ci
join night n on n.as_of_date = ci.as_of_date
left join public.factor_axes fa on fa.axis_key = ci.primary_axis
left join held h on h.cluster_id = ci.cluster_id;

comment on view public.vw_cluster_identity is
'Latest night of cluster_identity with the axis vocabulary joined from factor_axes. Scoped to one as_of inside the view; never aggregate across nights.';

grant select on public.vw_cluster_identity to anon, authenticated, service_role;
