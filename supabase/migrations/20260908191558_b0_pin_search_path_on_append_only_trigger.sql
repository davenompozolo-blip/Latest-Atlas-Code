-- The linter flagged this function as having a role-mutable search_path.
-- CLAUDE.md records search_path on engine functions as one of three defects
-- deferred on "nothing currently needs it", two of which went on to fail.
-- One line, while the context is loaded.
create or replace function public.book_factor_betas_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'book_factor_betas is append-only: % refused. Insert a new estimate under a new estimated_at.', tg_op;
end;
$fn$;
