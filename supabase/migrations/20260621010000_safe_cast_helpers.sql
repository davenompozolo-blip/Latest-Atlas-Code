-- Data-trust layer: canonical safe coercions for untrusted vendor JSON.
--
-- Principle: coercing external text to a strict SQL type must DEGRADE TO NULL,
-- never throw. A malformed vendor value should cost one "—" cell, never a 500
-- on the whole view. This is the durable fix for the class of outage seen with
-- the screener bigint cast on Citigroup's "245334658571.99997", and the latent
-- ::date landmines on NextEarningsDate / ExDividendDate.
--
-- numeric->bigint rounds (so fractional caps are fine); any parse failure,
-- empty string, or junk like 'None' / '0000-00-00' / 'N/A' returns NULL.

create or replace function public.safe_numeric(txt text)
returns numeric language plpgsql immutable parallel safe as $$
begin
  return nullif(trim(txt), '')::numeric;
exception when others then
  return null;
end $$;

create or replace function public.safe_bigint(txt text)
returns bigint language plpgsql immutable parallel safe as $$
begin
  return nullif(trim(txt), '')::numeric::bigint;  -- numeric first => rounds decimals, no error
exception when others then
  return null;
end $$;

create or replace function public.safe_date(txt text)
returns date language plpgsql immutable parallel safe as $$
begin
  return nullif(trim(txt), '')::date;
exception when others then
  return null;
end $$;

comment on function public.safe_numeric(text) is 'Coerce vendor JSON text to numeric; NULL on any failure. Use instead of (payload->>''x'')::numeric.';
comment on function public.safe_bigint(text)  is 'Coerce vendor JSON text to bigint (rounds via numeric); NULL on any failure. Use instead of (payload->>''x'')::bigint.';
comment on function public.safe_date(text)    is 'Coerce vendor JSON text to date; NULL on any failure. Use instead of (payload->>''x'')::date.';
