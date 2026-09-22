-- POSTGRES TRUNCATES AN OVER-LENGTH IDENTIFIER SILENTLY, AND CREATE TABLE
-- STILL SUCCEEDS.
--
-- The EQ-1 migration was authored with Alpha Vantage's own field name spelled
-- out: `proceeds_from_issuance_of_long_term_debt_and_capital_securities_net`,
-- which is 67 characters. The identifier limit (NAMEDATALEN - 1) is 63, so the
-- server cut the last four characters, emitted a NOTICE nobody reads, and
-- created the table. Nothing failed. The checked-in file said one thing and
-- the database held another -- the file/database divergence this codebase has
-- now recorded four times, arriving here through a length limit rather than a
-- comment-stripped paste.
--
-- It surfaced only when the first INSERT named the column the file declares
-- and got 42703. That is the useful property: a truncation that breaks on
-- first write is far better than one that silently accepts a shortened name
-- forever. But it would NOT have surfaced from reading either artefact --
-- both were internally consistent and neither matched the other.
--
-- Renaming to the shortened form the loader already uses, so file, loader and
-- database agree on one name. Check identifier length before applying a
-- migration, not after: over-length names do not error.
alter table public.company_cash_flow
    rename column proceeds_from_issuance_of_long_term_debt_and_capital_securities
                to proceeds_from_issuance_of_lt_debt_and_cap_securities_net;
