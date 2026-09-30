-- I-1: the nightly ingestion chain, as data.
--
-- The chain today is TIME-STAGGERED: every stage owns a cron entry and fires at
-- a wall-clock time chosen as a guess at how long its predecessor takes. That is
-- not a dependency, it is padding, and it fails in both directions -- a slow
-- upstream is read before it has written (ts_clusters' 504 on 2026-09-09 fed a
-- stale partition to atlas_write_segment_verdicts eight minutes later), while a
-- fast one leaves the pipeline idling for the rest of its slot.
--
-- This table makes the topology explicit so a stage can fire on its
-- predecessor's COMPLETION instead. Two columns carry what the schedule
-- conflated:
--
--   depends_on  the stage that must reach a terminal state first
--   hard        true  -> a real data dependency; an upstream error blocks
--               false -> mere ordering; any terminal state releases
--
-- Conflating them is what turns one failed leg into a dead night.
--
-- not_before is NOT padding and must not be removed. Alpaca cannot serve a
-- settled bar for a session that has not closed and Yahoo's in-progress bar is
-- refused by todaysBarIsPartial(), so the price stages carry a genuine
-- external-availability floor. Everything else has none and runs the moment its
-- upstream lands.

create table if not exists public.atlas_chain_stages (
    stage        text primary key,
    seq          integer     not null,
    kind         text        not null check (kind in ('http','edge','sql')),
    target       text        not null,
    body         jsonb       not null default '{}'::jsonb,
    gate_prices  boolean     not null default false,
    depends_on   text        references public.atlas_chain_stages(stage),
    hard         boolean     not null default true,
    not_before   time        null,
    dow          smallint[]  not null default '{1,2,3,4,5}',
    timeout_ms   integer     not null default 120000,
    enabled      boolean     not null default true,
    note         text        null,

    -- A stage cannot depend on itself, and a head has no dependency to grade.
    constraint acs_no_self_dep check (depends_on is distinct from stage),
    constraint acs_hard_needs_dep check (depends_on is not null or hard = false),
    constraint acs_dow_valid check (
        dow <@ '{0,1,2,3,4,5,6}'::smallint[] and array_length(dow, 1) between 1 and 7
    ),
    constraint acs_timeout_sane check (timeout_ms between 1000 and 300000),
    constraint acs_seq_positive check (seq > 0)
);

comment on table public.atlas_chain_stages is
  'Nightly ingestion chain topology. One row per stage; depends_on gives the '
  'completion edge and not_before the external-data-availability floor. Read by '
  'atlas_chain_advance(). Editing a row re-specifies the chain with no migration.';

comment on column public.atlas_chain_stages.hard is
  'true = real data dependency, an upstream error blocks this stage. '
  'false = ordering only, any terminal upstream state releases it. Chain order '
  'is not the same relation as dependency and must not be modelled as one.';

comment on column public.atlas_chain_stages.not_before is
  'Earliest UTC wall clock this stage may fire. Present ONLY where an external '
  'provider cannot answer sooner (a session that has not closed). Never use it '
  'to pad for an upstream duration -- that is what depends_on is for.';

create unique index if not exists atlas_chain_stages_seq_uniq
    on public.atlas_chain_stages (seq);

alter table public.atlas_chain_stages enable row level security;

drop policy if exists atlas_chain_stages_read on public.atlas_chain_stages;
create policy atlas_chain_stages_read on public.atlas_chain_stages
    for select to anon, authenticated using (true);

drop policy if exists atlas_chain_stages_service on public.atlas_chain_stages;
create policy atlas_chain_stages_service on public.atlas_chain_stages
    for all to service_role using (true) with check (true);
