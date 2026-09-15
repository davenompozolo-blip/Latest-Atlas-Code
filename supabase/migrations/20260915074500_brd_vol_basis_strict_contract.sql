-- brd_vol_basis_ck did not enforce the contract its own documentation claimed.
--
-- As shipped in 20260915053000:
--
--   CHECK (total_vol_annual IS NULL
--          OR (vol_basis IS NOT NULL AND btrim(vol_basis) <> ''))
--
-- That forbids a figure without a basis and nothing else. It permits three
-- states the design excludes, all writable by service_role:
--
--   total_vol_annual NULL      + vol_basis 'mctr_covariance'
--   vol_basis 'mctr_covariance' + vol_matrix_as_of NULL
--   vol_basis 'weight_sq_undiversified' + vol_matrix_as_of NOT NULL
--
-- And it permits any non-blank string as a basis, so a typo becomes a stored
-- measure nobody can interpret.
--
-- CLAUDE.md asserted "vol_basis is NULL exactly when total_vol_annual is,
-- enforced by brd_vol_basis_ck". The biconditional was never enforced. That is
-- this file's own recorded failure mode -- a comment asserting a check the code
-- does not perform is worse than no comment -- so the prose is corrected in the
-- same commit rather than the constraint alone.
--
-- The contract is three states and nothing else:
--
--   no figure          -> no basis, no matrix date
--   weight_sq_undiv.   -> a figure, and NO matrix date (that formula used no
--                         matrix at all, so a date would be a false provenance)
--   mctr_covariance    -> a figure, and a matrix date REQUIRED (the whole point
--                         of the column is that this basis rests on a snapshot)
--
-- Verified against live data before applying: 13 rows, all
-- weight_sq_undiversified with a NULL matrix date, 0 violations. And
-- vw_book_mctr returns book_vol_annual and matrix_as_of both non-null on all
-- 61 rows, so the nightly mctr_covariance write satisfies the strict form too.
--
-- NOT VALID / VALIDATE CONSTRAINT is deliberately NOT used. Squawk flags the
-- plain form because adding a constraint takes ACCESS EXCLUSIVE and scans the
-- table -- real advice on a large table, irrelevant on 13 rows. Worse here: it
-- inverts the intent. NOT VALID means existing rows are NOT checked, and
-- checking them is exactly what proves the backfill was coherent.

alter table public.book_risk_daily
  drop constraint if exists brd_vol_basis_ck;

alter table public.book_risk_daily
  add constraint brd_vol_basis_ck check (
       (total_vol_annual is null
        and vol_basis is null
        and vol_matrix_as_of is null)
    or (total_vol_annual is not null
        and vol_basis = 'weight_sq_undiversified'
        and vol_matrix_as_of is null)
    or (total_vol_annual is not null
        and vol_basis = 'mctr_covariance'
        and vol_matrix_as_of is not null)
  );

comment on constraint brd_vol_basis_ck on public.book_risk_daily is
  'The volatility metadata contract, biconditional. A figure implies a basis '
  'and a basis implies a figure; the basis is one of exactly two known values; '
  'and the matrix date is present for mctr_covariance and absent for '
  'weight_sq_undiversified, which used no correlation matrix.';
