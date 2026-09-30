-- Cortex (Signal & Idea Engine) — PR-1: Schema
--
-- Three additive tables. No existing tables touched.
-- RLS disabled consistent with other app-internal single-user tables
-- (users, saved_queries, query_log, materialized_insights).
--
-- cortex_signal_controls  — per-user signal-class preferences
-- cortex_signals          — materialized output of the signal engine
-- cortex_paper_trades     — simulated fills (v1 execution target)

-- ── 1. cortex_signal_controls ────────────────────────────────────────────────
create table if not exists cortex_signal_controls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  signal_class  text not null check (signal_class in ('thesis','gap','risk')),
  enabled       boolean not null default true,
  feed_weight   numeric not null default 0.5 check (feed_weight between 0 and 1),
  updated_at    timestamptz not null default now(),
  unique (user_id, signal_class)
);

-- ── 2. cortex_signals ────────────────────────────────────────────────────────
create table if not exists cortex_signals (
  id              uuid primary key default gen_random_uuid(),
  signal_class    text not null check (signal_class in ('thesis','gap','risk')),
  title           text not null,
  thesis_md       text not null,
  relevance       numeric not null,
  conviction      text not null check (conviction in ('low','medium','high')),
  risk_urgency    numeric not null default 0,
  setup_json      jsonb not null,
  candidates      jsonb not null,
  origin_metric   text,
  generated_at    timestamptz not null default now(),
  is_muted        boolean not null default false
);

create index if not exists cortex_signals_relevance_idx
  on cortex_signals (relevance desc, generated_at desc);

-- ── 3. cortex_paper_trades ───────────────────────────────────────────────────
create table if not exists cortex_paper_trades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  ticker          text not null,
  side            text not null check (side in ('buy','sell')),
  qty_shares      numeric not null,
  notional_zar    numeric not null,
  notional_pct    numeric not null,
  est_fill_price  numeric not null,
  source_signal   uuid references cortex_signals(id),
  pretrade_risk   jsonb,
  status          text not null default 'filled_paper',
  created_at      timestamptz not null default now()
);

-- ── 4. Seed default signal controls for the single app user ─────────────────
-- Uses a deterministic placeholder UUID matching the app's single-user pattern.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
insert into cortex_signal_controls (user_id, signal_class, enabled, feed_weight)
values
  ('00000000-0000-0000-0000-000000000001', 'thesis', true, 0.5),
  ('00000000-0000-0000-0000-000000000001', 'gap',    true, 0.5),
  ('00000000-0000-0000-0000-000000000001', 'risk',   true, 0.5)
on conflict (user_id, signal_class) do nothing;
