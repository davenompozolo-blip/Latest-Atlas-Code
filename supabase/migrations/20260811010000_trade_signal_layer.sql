-- ATLAS Trade revamp, spec §5.2 / §7 "Build new" — the signal normalisation layer.
--
-- signal_families declares the families and, per residual question 10.2, HOW
-- each one's conviction is computed. That column is not decoration: valuation
-- and macro are single-observation families whose conviction comes from
-- extremity within their own trailing distribution, which is honestly not the
-- same quantity as the within-family input agreement used by trend, stretch,
-- flow and vol regime. Tagging the method keeps the two populations separable
-- when the outcome dataset in §6 is finally large enough to analyse.
--
-- signal_scores is the normalisation layer over the raw tables that already
-- exist (holding_vol_trailing, options_positioning_snapshots,
-- market_regime_windows, price_history, equity_screener_universe). One row per
-- symbol per day per family, so the coherence state on any past date is
-- recoverable rather than recomputed from today's data.

create table if not exists public.signal_families (
  code              text primary key,
  label             text not null,
  description       text,
  is_suppressor     boolean not null default false,
  conviction_method text not null
                    check (conviction_method in ('input_agreement','distribution_extremity','none')),
  display_order     int not null default 0,
  created_at        timestamptz not null default now()
);

comment on table public.signal_families is
  'Signal family registry (spec §5.2). conviction_method separates the multi-input families (input_agreement) from the single-observation ones (distribution_extremity, provisional per §10 residual question 2).';

insert into public.signal_families (code, label, description, is_suppressor, conviction_method, display_order) values
  ('trend',      'Trend',      'MA structure, price vs 20/50/200, higher-high/higher-low state, RS vs sector and index', false, 'input_agreement',        1),
  ('flow',       'Flow',       'Volume vs ADV, put/call ratio, open interest shifts',                                    false, 'input_agreement',        2),
  ('macro',      'Macro',      'RISK-ON state, rate direction, sector regime',                                           false, 'distribution_extremity', 3),
  ('valuation',  'Valuation',  'Multiples vs own history and vs sector, earnings revision direction',                    false, 'distribution_extremity', 4),
  ('stretch',    'Stretch',    'z-score to VWAP and 20d MA, RSI, distance to bands, gap statistics',                     false, 'input_agreement',        5),
  ('vol_regime', 'Vol regime', 'Realised vs implied, IV rank, vol-of-vol, vol_dispersion_daily sector spread',           false, 'input_agreement',        6),
  ('event',      'Event proximity', 'Days to earnings, dividend and split dates. Suppresses confidence, does not point.', true, 'none',                  7)
on conflict (code) do update set
  label             = excluded.label,
  description       = excluded.description,
  is_suppressor     = excluded.is_suppressor,
  conviction_method = excluded.conviction_method,
  display_order     = excluded.display_order;

create table if not exists public.signal_scores (
  id           bigint generated always as identity primary key,
  symbol       text not null,
  as_of_date   date not null default current_date,
  family_code  text not null references public.signal_families (code),
  -- Nullable by design: a suppressor family has no direction to report. Every
  -- directional family must carry a score, enforced below.
  score        numeric check (score >= -1 and score <= 1),
  conviction   numeric check (conviction >= 0 and conviction <= 1),
  confidence   numeric not null check (confidence >= 0 and confidence <= 1),
  -- Multiplicative confidence penalty this family imposes on every OTHER
  -- family, in [0,1] (0.06 = the "−6%" the mockup shows against event
  -- proximity). Only suppressors set it.
  suppression  numeric check (suppression >= 0 and suppression <= 1),
  inputs       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (symbol, as_of_date, family_code)
);

comment on table public.signal_scores is
  'Per-symbol per-day family vector (spec §5.2). inputs holds the raw readings the score was built from, so a score is always traceable to what produced it.';

create index if not exists signal_scores_date_symbol_idx
  on public.signal_scores (as_of_date desc, symbol);
create index if not exists signal_scores_symbol_family_idx
  on public.signal_scores (symbol, family_code, as_of_date desc);

-- A directional family without a score is a silently missing reading, which is
-- exactly the failure mode §3.2 refuses to tolerate elsewhere. Reject it here.
create or replace function public.signal_scores_require_direction()
returns trigger language plpgsql as $$
declare
  suppressor boolean;
begin
  select is_suppressor into suppressor
    from public.signal_families where code = new.family_code;
  if suppressor is null then
    raise exception 'unknown signal family %', new.family_code;
  end if;
  if not suppressor and (new.score is null or new.conviction is null) then
    raise exception 'family % is directional and requires score and conviction', new.family_code;
  end if;
  return new;
end $$;

drop trigger if exists signal_scores_direction_check on public.signal_scores;
create trigger signal_scores_direction_check
  before insert or update on public.signal_scores
  for each row execute function public.signal_scores_require_direction();

alter table public.signal_families enable row level security;
alter table public.signal_scores   enable row level security;

drop policy if exists signal_families_read on public.signal_families;
create policy signal_families_read on public.signal_families
  for select to anon, authenticated using (true);

drop policy if exists signal_scores_read on public.signal_scores;
create policy signal_scores_read on public.signal_scores
  for select to anon, authenticated using (true);

-- The scoring job runs through the same anon path the rest of the app uses
-- (see api/sync-valuations.js for the precedent). Writes are idempotent on the
-- unique key, so an open insert/update policy cannot corrupt history, only
-- re-state today's row.
drop policy if exists signal_scores_write on public.signal_scores;
create policy signal_scores_write on public.signal_scores
  for insert to anon, authenticated with check (true);

drop policy if exists signal_scores_update on public.signal_scores;
create policy signal_scores_update on public.signal_scores
  for update to anon, authenticated using (true) with check (true);
