-- The Bench, spec §4 — opportunity_assessments becomes the verdict layer's
-- persistence. Extend, never replace: survives / portfolio_verdict / swap_source
-- stay for continuity (swap_source is superseded by vw_funding_sleeve and is no
-- longer read by the Nexus page). Applied 2026-08-01.
alter table public.opportunity_assessments
  add column if not exists verdict text
    check (verdict in ('press','stays','watch','cut')),
  add column if not exists thesis_integrity text
    check (thesis_integrity in ('intact','bending','broken','untested','expired')),
  add column if not exists synthesis text,
  add column if not exists verdict_condition text,
  add column if not exists overridden_by_user boolean not null default false,
  add column if not exists user_verdict text
    check (user_verdict in ('press','stays','watch','cut'));

-- One ruling per symbol per day; the writer re-runs idempotently.
create unique index if not exists opportunity_assessments_symbol_date_uidx
  on public.opportunity_assessments (symbol, as_of_date);

-- THE SILENT-FAILURE FIX. This table had RLS enabled with a SELECT policy and
-- nothing else, so every insert from a non-service-role client was rejected
-- without an error surfacing — which is why the writer has "never fired" and
-- the table has zero rows after six weeks. Verified post-migration: an anon
-- INSERT now returns HTTP 201.
drop policy if exists opportunity_assessments_write_insert on public.opportunity_assessments;
create policy opportunity_assessments_write_insert on public.opportunity_assessments
  for insert to anon, authenticated with check (true);

-- Hlobo's override path (spec §2: AI-authored, human override, both displayed).
drop policy if exists opportunity_assessments_write_update on public.opportunity_assessments;
create policy opportunity_assessments_write_update on public.opportunity_assessments
  for update to anon, authenticated using (true) with check (true);
