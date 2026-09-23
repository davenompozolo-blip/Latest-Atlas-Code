-- ============================================================
-- EQ-4i · correct a number EQ-4h asserted before it could be measured.
--
-- EQ-4h's comments say CAMELS A is computable on "41 of 62 bank filer-years".
-- That figure came from a probe query written BEFORE the view existed, which
-- read a narrower allowance list than the view ships. Counted against the
-- applied view it is 48 of 62, and the 14 refusals are exactly the years each
-- filer straddles the ASC 326 tag change:
--
--   BAC 2020-2021   legacy loan tag ends 2019, CECL tag starts 2022
--   C   2020-2022   same, CECL starts 2023
--   JPM 2016-2020   allowance runs to 2019, the loan book stops at 2015
--   WFC 2022-2025   no CECL loan-book tag in the filings at all
--
-- Every one of those 14 rows carries camels_a_withheld and NULL on both
-- ratios, and no row carries the flag with an absent ratio -- checked, not
-- assumed. The 48 are what the flag and the numbers agree on.
--
-- Recorded as its own migration rather than by editing EQ-4h, because EQ-4h
-- is what the database ran and a file edited after the fact is the
-- file/database divergence this codebase has now found five times. A comment
-- stating a coverage figure is a claim about the data, and it has to be
-- measured against the object that carries it.
-- ============================================================

comment on view public.vw_company_institution_profile is
'EQ-4. Which CFA L2 V3 LM4 framework each filer-year supports, derived from the
FILING rather than from assets.sector.

The insurer test is ASC 944 SHORT-DURATION vs LONG-DURATION, not P&C vs life: a
health insurer files short-duration contract liabilities exactly as a P&C
insurer does, so UNH and HUM are short_duration_insurer. pc_applicable and
lh_applicable are retained as aliases of the duration flags.

Three independent applicability flags, not one exclusive label: CB reports
claim reserves AND future policy benefits AND separate account assets, so
mixed_insurer is the honest answer. A bank is net interest income PLUS the
noninterest lines, never deposits alone -- MetLife reports us-gaap_Deposits for
deposit-type contract liabilities.

Concept lists carry EVERY SPELLING MEASURED, because filers change tags across
accounting eras: the future-policy-benefit liability has three, and the health
insurers tag losses ...HealthCare through 2023 and generically from 2024. The
spellings never overlap in one filer-year.

camels_c_computable is false on every filer measured: Tier 1 and RWA are not
face-statement lines. camels_a_computable is per row -- true on 48 of 62 bank
filer-years, false on the 14 where the filer straddles the ASC 326 tag change.';

comment on view public.vw_company_institution_ratios is
'EQ-4. The CFA L2 V3 LM4 ratios the persisted as-reported lines support, and
nothing else. Each metric is gated on the framework the FILING supports, which
is what makes an ambiguous tag safe: HUM resolves provision_for_credit_losses
to ProvisionForDoubtfulAccounts, and a bank ratio is never computed for it
because bank_applicable is false.

The insurer legs are keyed on ASC 944 duration, not on P&C vs life, so
loss_and_lae_ratio is the medical care ratio for a health insurer -- UNH FY2024
computes 0.855494 against a published 85.5%, HUM 0.897952 against ~89.8%.

benefits_to_premiums carries benefits_ratio_caveat on every row it is present
because it reads like a loss ratio and is not one: a long-duration insurer
earns most revenue as net investment income and policy fees, so premiums are a
minority denominator and the figure runs to 1.098 at PRU on FY2024.

CAMELS A is withheld PER ROW, not as a class -- computable on 48 of 62 bank
filer-years wherever the filer reports a loan book and its allowance, under the
legacy tag pair or the ASC 326 one. The combined ratio (no sound
underwriting-expense numerator) and CAMELS C (Tier 1 and RWA are not
face-statement lines) remain refused outright.';
