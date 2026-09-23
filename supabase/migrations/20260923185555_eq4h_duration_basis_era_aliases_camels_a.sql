-- ============================================================
-- EQ-4h · duration basis, era aliases, and CAMELS A per row.
--
-- Three corrections that ONLY THE FIRST REAL LOAD COULD SHOW. Eleven symbols,
-- 19,727 lines, 2010-2025 -- and every one of these is invisible on a probe of
-- one filer-year.
--
-- 1. `pc_insurer` NAMED THE WRONG PROPERTY. UNH and HUM were classified
--    `pc_insurer`, and they write no property and no casualty business at all.
--    The test the view actually performs is ASC 944's SHORT-DURATION vs
--    LONG-DURATION contract distinction -- a health insurer files short-duration
--    contract liabilities exactly as a P&C insurer does, which is why the
--    measurement was right and the label was false. The `fwd_pe` defect, in a
--    framework name. `short_duration_*` / `long_duration_*`, with the old names
--    kept as aliases so no consumer breaks.
--
-- 2. THE TAG LISTS KNEW ONE SPELLING OF EACH CONCEPT AND THE FILINGS USE
--    SEVERAL, SPLIT BY ACCOUNTING ERA. PRU was unclassified on 13 of 16 years,
--    MET on 4, because the future-policy-benefit liability is reported under
--    three different tags across LDTI (ASU 2018-12) adoption; and UNH and HUM
--    had NO loss ratio on 14 years each because a health insurer tags its
--    losses `PolicyholderBenefitsAndClaimsIncurredHealthCare` until 2023 and
--    the generic tag from 2024. Every alias below was verified by reading the
--    filer's own LABEL, and the two eras never overlap in one filer-year, so
--    the preference order can never double count.
--
-- 3. CAMELS A IS COMPUTABLE PER ROW, NOT REFUSABLE AS A CLASS. EQ-4f withheld
--    it for every bank on the grounds that no loan-book denominator was
--    measured. It is measured -- on 41 of 62 bank filer-years, under a legacy
--    tag pair through 2019-2021 and the CECL (ASC 326) pair from 2020-2022.
--    The resulting ratios corroborate: loans/assets runs 0.28-0.34 at JPM and
--    C, 0.33-0.42 at BAC and 0.45-0.58 at WFC -- the loan-heavy bank of the
--    four -- and allowance/loans traces the credit cycle from 4.7% in 2010 to
--    1.0% in 2019 and back up after CECL. A class refusal was hiding a
--    measurement.
-- ============================================================

-- No dependants (checked against pg_depend: zero rewrite rules reference
-- either view outside this pair, and no JS reads them yet), so these are
-- rebuilt rather than patched: `CREATE OR REPLACE VIEW` can append a column
-- but cannot rename one, and the duration rename is the point.
drop view if exists public.vw_company_institution_ratios;
drop view if exists public.vw_company_institution_profile;

create view public.vw_company_institution_profile as
with lines as (
    select l.symbol, l.fiscal_year, public.atlas_concept_local(l.concept) as k
      from public.company_reported_lines l
     -- US-GAAP ONLY. A foreign taxonomy carrying the same local name is a
     -- different concept, and matching it here would report a framework the
     -- filing does not support.
     where l.taxonomy is null
),
flags as (
    select symbol, fiscal_year,
      bool_or(k in ('premiumsearnednet', 'premiumsearnednetpropertyandcasualty'))      as has_premiums,
      bool_or(k = 'liabilityforclaimsandclaimsadjustmentexpense')                      as has_claim_reserves,
      -- THREE SPELLINGS OF ONE LIABILITY, verified by the filers' own labels,
      -- all reading "Future policy benefits" on the balance sheet:
      --   LiabilityForFuturePolicyBenefits                     AFL 2012-25, MET 2010-18 + 2023-25, PRU 2023-25
      --   LiabilityForFuturePolicyBenefitAfterReinsurance      MET 2019-2022
      --   ...AndUnpaidClaimsAndClaimsAdjustmentExpense         PRU 2010-2022
      -- Without them PRU reads as having no framework on 13 of 16 years.
      bool_or(k in ('liabilityforfuturepolicybenefits',
                    'liabilityforfuturepolicybenefitafterreinsurance',
                    'liabilityforfuturepolicybenefitsandunpaidclaimsandclaimsadjustmentexpense'))
                                                                                       as has_future_policy_benefits,
      bool_or(k = 'separateaccountassets')                                             as has_separate_accounts,
      -- The health-insurer spelling, mutually exclusive with the generic one:
      -- UNH and HUM both use ...HealthCare through 2023 (labelled "Medical
      -- costs" and "Benefits") and the generic tag from 2024. No filer-year
      -- carries both, so there is nothing to double count.
      bool_or(k in ('policyholderbenefitsandclaimsincurrednet',
                    'policyholderbenefitsandclaimsincurredhealthcare'))                as has_losses_incurred,
      bool_or(k in ('interestincomeexpensenet', 'interestincomeexpenseafterprovisionforloanloss'))
                                                                                       as has_net_interest_income,
      bool_or(k in ('noninterestincome', 'noninterestexpense'))                        as has_noninterest_lines,
      bool_or(k in ('deposits', 'interestbearingdepositliabilities'))                  as has_deposits,
      bool_or(k in ('tieronriskbasedcapital', 'riskweightedassets',
                    'capitaltoriskweightedassets', 'totalriskbasedcapital'))           as has_regulatory_capital,
      -- CAMELS A, both eras. Legacy through 2019-2021, CECL from 2020-2022.
      bool_or(k in ('loansandleasesreceivablenetreportedamount',
                    'financingreceivableexcludingaccruedinterestafterallowanceforcreditloss'))
                                                                                       as has_loan_book,
      bool_or(k in ('loansandleasesreceivableallowance',
                    'financingreceivableallowanceforcreditlossexcludingaccruedinterest',
                    'financingreceivableallowanceforcreditlosses'))                    as has_loan_allowance
      from lines group by symbol, fiscal_year
),
applic as (
    select f.*,
      -- A BANK IS NOT "HAS DEPOSITS". MetLife reports us-gaap_Deposits --
      -- deposit-type contract liabilities -- so deposits alone would label a
      -- life insurer a bank. Net interest income together with the
      -- noninterest lines is the combination only a depository reports.
      (f.has_net_interest_income and f.has_noninterest_lines)   as bank_applicable,
      -- ASC 944 SHORT-DURATION: premiums earned against a claims-and-claims-
      -- adjustment liability. True of P&C AND of health, which is the whole
      -- reason the old name was wrong.
      (f.has_premiums and f.has_claim_reserves)                 as short_duration_applicable,
      (f.has_premiums and f.has_future_policy_benefits)         as long_duration_applicable
      from flags f
)
select
    a.symbol,
    a.fiscal_year,
    a.bank_applicable,
    a.short_duration_applicable,
    a.long_duration_applicable,
    -- Retained under the EQ-4e names so an existing consumer keeps working.
    -- They mean what they always measured; only the names were wrong.
    a.short_duration_applicable as pc_applicable,
    a.long_duration_applicable  as lh_applicable,
    -- The primary framework, and NULL rather than a guess where nothing
    -- dominates. `frameworks_supported` is published beside it so a surface
    -- can say "both" rather than silently picking one.
    case
      when a.bank_applicable and not (a.short_duration_applicable or a.long_duration_applicable) then 'bank'
      when a.short_duration_applicable and a.long_duration_applicable                            then 'mixed_insurer'
      when a.short_duration_applicable                                                           then 'short_duration_insurer'
      when a.long_duration_applicable                                                            then 'long_duration_insurer'
      when a.bank_applicable                                                                     then 'mixed_bank_insurer'
      else null
    end as primary_framework,
    (a.bank_applicable::int + a.short_duration_applicable::int + a.long_duration_applicable::int)
      as frameworks_supported,
    case
      when not (a.bank_applicable or a.short_duration_applicable or a.long_duration_applicable)
        then 'no_institution_lines'
      else null
    end as no_framework_reason,

    -- CAMELS · C IS REFUSED, NOT APPROXIMATED. Tier 1 capital and
    -- risk-weighted assets live in the regulatory capital tables, not the
    -- face statements, and were absent on every filer measured -- four banks
    -- and eight insurers. The flag says whether the leg is computable at all,
    -- so a surface states the gap instead of a ratio built on substitutes.
    a.has_regulatory_capital as camels_c_computable,
    -- CAMELS · A IS PER ROW. Both terms present on 41 of 62 bank filer-years;
    -- the gaps are the years each filer straddles the ASC 326 transition.
    (a.has_loan_book and a.has_loan_allowance) as camels_a_computable,

    -- The components, not just the label. A label with nothing under it is
    -- what the chrome's hardcoded RISK-ON pill was.
    a.has_premiums, a.has_claim_reserves, a.has_future_policy_benefits,
    a.has_separate_accounts, a.has_losses_incurred,
    a.has_net_interest_income, a.has_noninterest_lines, a.has_deposits,
    a.has_loan_book, a.has_loan_allowance
  from applic a;

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
face-statement lines. camels_a_computable is per row -- true on 41 of 62 bank
filer-years, false where the filer straddles the ASC 326 tag change.';

grant select on public.vw_company_institution_profile to anon, authenticated, service_role;


create view public.vw_company_institution_ratios as
with v as (
    -- US-GAAP only, for the reason atlas_concept_local's own comment gives.
    select l.symbol, l.fiscal_year, public.atlas_concept_local(l.concept) as k, l.value
      from public.company_reported_lines l
     where l.taxonomy is null and l.value is not null
),
p as (
    select symbol, fiscal_year,
      -- PremiumsEarnedNet first, then the P&C-specific variant. They are
      -- DIFFERENT concepts, so this is a preference order and never a sum:
      -- a filer reporting both would otherwise be double counted.
      coalesce(max(value) filter (where k = 'premiumsearnednet'),
               max(value) filter (where k = 'premiumsearnednetpropertyandcasualty')) as premiums_earned,
      -- Generic first, health-insurer spelling second. Measured mutually
      -- exclusive across all 32 UNH and HUM filer-years.
      coalesce(max(value) filter (where k = 'policyholderbenefitsandclaimsincurrednet'),
               max(value) filter (where k = 'policyholderbenefitsandclaimsincurredhealthcare'))
                                                                                     as losses_incurred,
      -- THE PURE SHORT-DURATION RESERVE ONLY. PRU's combined
      -- ...AndUnpaidClaimsAndClaimsAdjustmentExpense tag establishes that the
      -- filer writes long-duration business and is deliberately NOT accepted
      -- here: it pools both durations, so dividing it by premiums would
      -- publish a reserve adequacy figure over a book it does not describe.
      -- Good enough to classify is not good enough to measure.
      max(value) filter (where k = 'liabilityforclaimsandclaimsadjustmentexpense')   as claim_reserves,
      max(value) filter (where k = 'separateaccountassets')                          as separate_accounts,
      coalesce(max(value) filter (where k = 'interestincomeexpensenet'),
               max(value) filter (where k = 'interestincomeexpenseafterprovisionforloanloss')) as net_interest_income,
      max(value) filter (where k = 'noninterestincome')                              as noninterest_income,
      max(value) filter (where k = 'noninterestexpense')                             as noninterest_expense,
      coalesce(max(value) filter (where k = 'deposits'),
               max(value) filter (where k = 'interestbearingdepositliabilities'))    as deposits,
      -- Legacy tag pair first, CECL pair second. Each filer uses one or the
      -- other in a given year; the eras abut rather than overlap.
      coalesce(max(value) filter (where k = 'loansandleasesreceivablenetreportedamount'),
               max(value) filter (where k = 'financingreceivableexcludingaccruedinterestafterallowanceforcreditloss'))
                                                                                     as loan_book,
      coalesce(max(value) filter (where k = 'loansandleasesreceivableallowance'),
               max(value) filter (where k = 'financingreceivableallowanceforcreditlossexcludingaccruedinterest'),
               max(value) filter (where k = 'financingreceivableallowanceforcreditlosses'))
                                                                                     as loan_allowance,
      max(value) filter (where k = 'assets')                                         as total_assets
      from v group by symbol, fiscal_year
)
select
    pr.symbol,
    pr.fiscal_year,
    pr.primary_framework,
    pr.short_duration_applicable, pr.long_duration_applicable, pr.bank_applicable,
    pr.pc_applicable, pr.lh_applicable,

    -- ── short-duration contracts (P&C and health) ────────────────────────
    -- Loss and loss-adjustment expense ratio (CFA L2 V3 LM4). For a health
    -- insurer this IS the medical care ratio: UNH FY2024 computes 0.8555
    -- against a published 85.5%.
    case when pr.short_duration_applicable and p.premiums_earned > 0
         then round((p.losses_incurred / p.premiums_earned)::numeric, 6) end as loss_and_lae_ratio,
    -- Reserve adequacy against the premium base the reserves were written on.
    case when pr.short_duration_applicable and p.premiums_earned > 0
         then round((p.claim_reserves / p.premiums_earned)::numeric, 6) end as reserves_to_premiums,

    -- THE COMBINED RATIO IS REFUSED, not estimated. It is the loss ratio plus
    -- the underwriting expense ratio, and no sound numerator for the latter
    -- exists in these lines: DeferredPolicyAcquisitionCostAmortizationExpense
    -- is a COMPONENT of underwriting expense and PGR's OtherUnderwritingExpense
    -- says "other" in its own name. `premiums_written_net`, the CFA
    -- denominator, hits 1 of 8 insurers.
    case when pr.short_duration_applicable then 'underwriting_expense_not_measured' end as combined_ratio_withheld,

    -- ── long-duration contracts ──────────────────────────────────────────
    case when pr.long_duration_applicable and p.premiums_earned > 0
         then round((p.losses_incurred / p.premiums_earned)::numeric, 6) end as benefits_to_premiums,
    -- IT READS LIKE A LOSS RATIO AND IS NOT ONE. A long-duration insurer earns
    -- most of its revenue as net investment income and policy fees, so
    -- premiums are a minority denominator and the figure runs near or above
    -- 1.0 in normal years without saying anything about underwriting. The
    -- caveat travels on the row so it cannot be rendered without it.
    case when pr.long_duration_applicable and p.premiums_earned > 0
         then 'premiums_are_a_minority_of_long_duration_revenue' end as benefits_ratio_caveat,
    case when pr.long_duration_applicable and p.total_assets > 0
         then round((p.separate_accounts / p.total_assets)::numeric, 6) end as separate_account_share,

    -- ── CAMELS · E (earnings) ────────────────────────────────────────────
    case when pr.bank_applicable and (p.net_interest_income + p.noninterest_income) > 0
         then round((p.noninterest_expense
                     / (p.net_interest_income + p.noninterest_income))::numeric, 6) end as efficiency_ratio,
    case when pr.bank_applicable and (p.net_interest_income + p.noninterest_income) > 0
         then round((p.noninterest_income
                     / (p.net_interest_income + p.noninterest_income))::numeric, 6) end as noninterest_income_share,
    -- Net interest income over total assets. NOT called net interest MARGIN:
    -- that is NII over average EARNING assets, and earning assets are not a
    -- line the face statements carry. Naming it margin would assert a measure
    -- the field does not hold.
    case when pr.bank_applicable and p.total_assets > 0
         then round((p.net_interest_income / p.total_assets)::numeric, 6) end as nii_to_assets,

    -- ── CAMELS · A (asset quality) ───────────────────────────────────────
    case when pr.bank_applicable and pr.camels_a_computable and p.loan_book > 0
         then round((p.loan_allowance / p.loan_book)::numeric, 6) end as allowance_to_loans,
    case when pr.bank_applicable and pr.camels_a_computable and p.total_assets > 0
         then round((p.loan_book / p.total_assets)::numeric, 6) end as loans_to_assets,
    -- PER ROW, never as a class. The gaps are the years a filer straddles the
    -- ASC 326 tag change, not a property of banks.
    case when pr.bank_applicable and not pr.camels_a_computable
         then 'loan_book_not_reported_by_this_filer_year' end as camels_a_withheld,

    -- ── CAMELS · L (liquidity) ───────────────────────────────────────────
    case when pr.bank_applicable and p.total_assets > 0
         then round((p.deposits / p.total_assets)::numeric, 6) end as deposits_to_assets,

    -- C (capital adequacy) needs Tier 1 capital and risk-weighted assets,
    -- which live in the regulatory capital tables and not the face
    -- statements. Absent on every filer measured.
    case when pr.bank_applicable and not pr.camels_c_computable
         then 'regulatory_capital_not_in_face_statements' end as camels_c_withheld,

    p.premiums_earned, p.losses_incurred, p.claim_reserves,
    p.net_interest_income, p.noninterest_income, p.noninterest_expense,
    p.deposits, p.loan_book, p.loan_allowance, p.total_assets
  from public.vw_company_institution_profile pr
  join p on p.symbol = pr.symbol and p.fiscal_year = pr.fiscal_year;

comment on view public.vw_company_institution_ratios is
'EQ-4. The CFA L2 V3 LM4 ratios the persisted as-reported lines support, and
nothing else. Each metric is gated on the framework the FILING supports, which
is what makes an ambiguous tag safe: HUM resolves provision_for_credit_losses
to ProvisionForDoubtfulAccounts, and a bank ratio is never computed for it
because bank_applicable is false.

The insurer legs are keyed on ASC 944 duration, not on P&C vs life, so
loss_and_lae_ratio is the medical care ratio for a health insurer -- UNH FY2024
computes 0.8555 against a published 85.5%.

benefits_to_premiums carries benefits_ratio_caveat because it reads like a loss
ratio and is not one: a long-duration insurer earns most revenue as net
investment income and policy fees, so premiums are a minority denominator.

CAMELS A is withheld PER ROW, not as a class -- it is computable wherever the
filer reports a loan book and its allowance, under the legacy tag pair or the
ASC 326 one. The combined ratio (no sound underwriting-expense numerator) and
CAMELS C (Tier 1 and RWA are not face-statement lines) remain refused
outright.';

grant select on public.vw_company_institution_ratios to anon, authenticated, service_role;
