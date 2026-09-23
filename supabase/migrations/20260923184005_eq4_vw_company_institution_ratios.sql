-- ============================================================
-- EQ-4 · vw_company_institution_ratios — the CFA L2 V3 LM4 ratios that the
-- persisted lines actually support, and NOTHING else.
--
-- Every metric here rests on a tag measured against production: the P&C pair
-- on 8 of 8 insurers, the bank set on 15 of 15 JPM periods. What is not
-- supported is REFUSED with a named reason rather than approximated, and the
-- reasons are published as columns so a surface states the gap.
--
-- THE FRAMEWORK GATE IS WHAT MAKES AN AMBIGUOUS TAG SAFE. HUM resolves
-- `provision_for_credit_losses` to `ProvisionForDoubtfulAccounts` -- bad-debt
-- provision on receivables, not credit-loss provisioning on a loan book. That
-- would be the `fwd_pe` defect if a bank ratio were computed for a health
-- insurer; it cannot be, because `bank_applicable` is false for HUM. A gate on
-- the FILING confines each tag to the filer class where it means what the
-- framework says it means.
-- ============================================================

create or replace view public.vw_company_institution_ratios as
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
      max(value) filter (where k = 'policyholderbenefitsandclaimsincurrednet')       as losses_incurred,
      max(value) filter (where k = 'liabilityforclaimsandclaimsadjustmentexpense')   as claim_reserves,
      max(value) filter (where k = 'liabilityforfuturepolicybenefits')               as future_policy_benefits,
      max(value) filter (where k = 'separateaccountassets')                          as separate_accounts,
      coalesce(max(value) filter (where k = 'interestincomeexpensenet'),
               max(value) filter (where k = 'interestincomeexpenseafterprovisionforloanloss')) as net_interest_income,
      max(value) filter (where k = 'noninterestincome')                              as noninterest_income,
      max(value) filter (where k = 'noninterestexpense')                             as noninterest_expense,
      coalesce(max(value) filter (where k = 'deposits'),
               max(value) filter (where k = 'interestbearingdepositliabilities'))    as deposits,
      max(value) filter (where k = 'assets')                                         as total_assets
      from v group by symbol, fiscal_year
)
select
    pr.symbol,
    pr.fiscal_year,
    pr.primary_framework,
    pr.pc_applicable, pr.lh_applicable, pr.bank_applicable,

    -- ── P&C ──────────────────────────────────────────────────────────────
    -- Loss and loss-adjustment expense ratio (CFA §13675). Both terms hit
    -- 8 of 8 insurers, so this is the P&C figure the data supports.
    case when pr.pc_applicable and p.premiums_earned > 0
         then round((p.losses_incurred / p.premiums_earned)::numeric, 6) end as loss_and_lae_ratio,
    -- Reserve adequacy against the premium base the reserves were written on.
    case when pr.pc_applicable and p.premiums_earned > 0
         then round((p.claim_reserves / p.premiums_earned)::numeric, 6) end as reserves_to_premiums,

    -- THE COMBINED RATIO IS REFUSED, not estimated. It is the loss ratio plus
    -- the underwriting expense ratio, and the only candidate for the latter's
    -- numerator is DeferredPolicyAcquisitionCostAmortizationExpense -- DAC
    -- amortisation is a COMPONENT of underwriting expense, not the measure.
    -- Publishing a ratio from it would put a label on a field that does not
    -- carry it. `premiums_written_net`, the CFA denominator, hits 1 of 8.
    case when pr.pc_applicable then 'underwriting_expense_not_measured' end as combined_ratio_withheld,

    -- ── life / health ────────────────────────────────────────────────────
    case when pr.lh_applicable and p.premiums_earned > 0
         then round((p.losses_incurred / p.premiums_earned)::numeric, 6) end as benefits_to_premiums,
    case when pr.lh_applicable and p.total_assets > 0
         then round((p.separate_accounts / p.total_assets)::numeric, 6) end as separate_account_share,

    -- ── CAMELS · E (earnings) ────────────────────────────────────────────
    -- The efficiency ratio is THE bank earnings ratio, and all three of its
    -- terms are 15/15 on JPM.
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

    -- ── CAMELS · L (liquidity) ───────────────────────────────────────────
    case when pr.bank_applicable and p.total_assets > 0
         then round((p.deposits / p.total_assets)::numeric, 6) end as deposits_to_assets,

    -- ── the two legs that are REFUSED ────────────────────────────────────
    -- A (asset quality) needs a loan book to divide by. `allowance_for_credit_
    -- losses` is 15/15 on JPM but `loans_and_leases` was never measured on a
    -- BANK -- on the three insurers that carry it, it resolves to two
    -- different tags. A coverage ratio over an unmeasured denominator is a
    -- number with no evidence behind it.
    case when pr.bank_applicable then 'loan_book_denominator_not_measured' end as camels_a_withheld,
    -- C (capital adequacy) needs Tier 1 capital and risk-weighted assets,
    -- which live in the regulatory capital tables and not the face
    -- statements. Absent on every filer probed.
    case when pr.bank_applicable and not pr.camels_c_computable
         then 'regulatory_capital_not_in_face_statements' end as camels_c_withheld,

    p.premiums_earned, p.losses_incurred, p.claim_reserves,
    p.net_interest_income, p.noninterest_income, p.noninterest_expense,
    p.deposits, p.total_assets
  from public.vw_company_institution_profile pr
  join p on p.symbol = pr.symbol and p.fiscal_year = pr.fiscal_year;

comment on view public.vw_company_institution_ratios is
'EQ-4. The CFA L2 V3 LM4 ratios the persisted as-reported lines support, and
nothing else. Each metric is gated on the framework the FILING supports, which
is what makes an ambiguous tag safe: HUM resolves provision_for_credit_losses
to ProvisionForDoubtfulAccounts, and a bank ratio is never computed for it
because bank_applicable is false.

Three things are REFUSED with a named reason rather than approximated: the
combined ratio (no sound underwriting-expense numerator), CAMELS A (no measured
loan-book denominator) and CAMELS C (Tier 1 and RWA are not face-statement
lines).';

grant select on public.vw_company_institution_ratios to anon, authenticated, service_role;
