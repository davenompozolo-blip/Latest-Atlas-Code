-- ============================================================
-- EQ-4 P0 · atlas_upsert_company_statements has never been able to write.
--
-- `insert into T select * from jsonb_populate_recordset(null::T, payload)`
-- fills EVERY column of T from the payload, and a key the payload omits comes
-- back NULL rather than absent. `loaded_at` is `not null default now()` and no
-- caller sends it, so the INSERT supplies an explicit NULL and the whole call
-- dies on 23502. Measured against production before this migration:
--
--   select atlas_upsert_company_statements(p_income := '[{...}]')
--   ERROR 23502: null value in column "loaded_at" ... violates not-null
--   CONTEXT: insert into public.company_income_statement
--            select * from jsonb_populate_recordset(...)
--
-- So EVERY statement load since the RPC shipped has thrown, and the layer is
-- frozen at what the earlier direct-POST path wrote. It went unnoticed because
-- PostgREST applies a column default for a key it is not sent, so the same
-- payload succeeds through a plain POST and fails through the RPC — the
-- transactional wrapper added to make a symbol atomic is the thing that broke
-- it. EQ-3 recorded a backfill that "wrote nothing, and that was the design
-- working"; the atomicity guard was real, and this would have refused the
-- write regardless.
--
-- THE DEFAULT IS THE TRAP. A column with a default reads as optional, and
-- through `select *` it is not optional at all — it is mandatory and unstated.
-- Any NOT NULL DEFAULT column added to these three tables later would break
-- the loader again in exactly the same silent way.
--
-- The fix stamps `loaded_at` inside the function rather than naming the other
-- 24/36/28 columns, which keeps the property the original was written for:
-- the column list does not rot as columns are added. It is also the more
-- correct reading of the field — when the DATABASE received the row, not when
-- a client said it did — and it takes away a caller's ability to backdate it.
-- ============================================================

create or replace function public.atlas_upsert_company_statements(
    p_income   jsonb default '[]'::jsonb,
    p_balance  jsonb default '[]'::jsonb,
    p_cashflow jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
    n_income   int := 0;
    n_balance  int := 0;
    n_cashflow int := 0;
    v_now      timestamptz := now();
begin
    if jsonb_typeof(p_income) <> 'array'
       or jsonb_typeof(p_balance) <> 'array'
       or jsonb_typeof(p_cashflow) <> 'array' then
        raise exception 'each payload must be a json array';
    end if;

    -- `loaded_at` is forced on every element, whatever the caller sent. Under
    -- `select *` an omitted key is an explicit NULL, so the default never
    -- applies and the NOT NULL refuses the row.
    p_income   := coalesce((select jsonb_agg(e || jsonb_build_object('loaded_at', v_now))
                              from jsonb_array_elements(p_income) e),   '[]'::jsonb);
    p_balance  := coalesce((select jsonb_agg(e || jsonb_build_object('loaded_at', v_now))
                              from jsonb_array_elements(p_balance) e),  '[]'::jsonb);
    p_cashflow := coalesce((select jsonb_agg(e || jsonb_build_object('loaded_at', v_now))
                              from jsonb_array_elements(p_cashflow) e), '[]'::jsonb);

    delete from public.company_income_statement t
     using jsonb_populate_recordset(null::public.company_income_statement, p_income) s
     where t.symbol = s.symbol and t.fiscal_date_ending = s.fiscal_date_ending
       and t.period = s.period and t.source = s.source;
    insert into public.company_income_statement
    select * from jsonb_populate_recordset(null::public.company_income_statement, p_income);
    get diagnostics n_income = row_count;

    delete from public.company_balance_sheet t
     using jsonb_populate_recordset(null::public.company_balance_sheet, p_balance) s
     where t.symbol = s.symbol and t.fiscal_date_ending = s.fiscal_date_ending
       and t.period = s.period and t.source = s.source;
    insert into public.company_balance_sheet
    select * from jsonb_populate_recordset(null::public.company_balance_sheet, p_balance);
    get diagnostics n_balance = row_count;

    delete from public.company_cash_flow t
     using jsonb_populate_recordset(null::public.company_cash_flow, p_cashflow) s
     where t.symbol = s.symbol and t.fiscal_date_ending = s.fiscal_date_ending
       and t.period = s.period and t.source = s.source;
    insert into public.company_cash_flow
    select * from jsonb_populate_recordset(null::public.company_cash_flow, p_cashflow);
    get diagnostics n_cashflow = row_count;

    return jsonb_build_object(
        'income',   n_income,
        'balance',  n_balance,
        'cashflow', n_cashflow,
        'total',    n_income + n_balance + n_cashflow);
end;
$fn$;

comment on function public.atlas_upsert_company_statements(jsonb, jsonb, jsonb) is
'EQ-2, repaired in EQ-4. Writes a symbol''s three statements in ONE transaction,
so a failure part way through cannot leave a half-loaded symbol.

`loaded_at` is stamped inside the function. Under `insert ... select * from
jsonb_populate_recordset`, a key the payload omits is an explicit NULL rather
than an absent column, so a NOT NULL DEFAULT column is mandatory-and-unstated
and the call dies on 23502. That is what it did on every call between the RPC
shipping and this repair. Any NOT NULL DEFAULT column added to these tables
later must be stamped here too.

DELETE-then-INSERT rather than ON CONFLICT DO UPDATE: the tables carry 24, 36
and 28 mapped columns and an enumerated update list rots silently as columns
are added.';

revoke execute on function public.atlas_upsert_company_statements(jsonb, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function public.atlas_upsert_company_statements(jsonb, jsonb, jsonb)
    to service_role;
