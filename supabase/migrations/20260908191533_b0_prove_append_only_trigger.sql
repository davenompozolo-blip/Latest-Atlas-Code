-- "Has not been observed failing" is not a test. Force both mutations and
-- require the trigger to refuse each; the subtransactions roll back either way.
do $$
declare ok boolean;
begin
  ok := false;
  begin
    update public.book_factor_betas set beta = 0 where factor = 'alpha';
  exception when others then
    if sqlerrm like '%append-only%' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FAIL: append-only trigger did not block UPDATE'; end if;

  ok := false;
  begin
    delete from public.book_factor_betas where factor = 'alpha';
  exception when others then
    if sqlerrm like '%append-only%' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FAIL: append-only trigger did not block DELETE'; end if;

  raise notice 'append-only trigger refused both UPDATE and DELETE';
end $$;
