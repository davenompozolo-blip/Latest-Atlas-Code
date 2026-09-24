-- ============================================================
-- EQ-4 · vw_company_institution_profile — which CFA L2 V3 LM4 framework a
-- filer's own filing supports.
--
-- NOT `assets.sector`. Measured: `Other` covers 6,879 of 7,921 active rows,
-- and inside the cohort where the field IS meaningful, `Financials` still
-- mixes banks with insurers while health insurers sit under `Healthcare`.
-- The sector decides who is worth fetching; the filing decides which
-- framework applies.
--
-- AND IT IS NOT ONE EXCLUSIVE LABEL, because the filings say otherwise.
-- Probing eight insurers, CB (Chubb) reports claim reserves AND future policy
-- benefits AND separate account assets -- it genuinely writes both P&C and
-- life business, and forcing it into one bucket would publish a combined
-- ratio over a book that is partly life, or a life framework over a book that
-- is mostly P&C. Each framework gets its own applicability flag, a primary is
-- chosen only where one dominates, and a filer that supports two is reported
-- as supporting two.
-- ============================================================

-- The us-gaap local name, lowercased. `taxonomy` is NULL exactly when a
-- concept is us-gaap in any of its three spellings, so a NULL taxonomy is the
-- us-gaap test and the prefix is stripped off the raw tag.
create or replace function public.atlas_concept_local(p_concept text)
returns text language sql immutable
set search_path = ''
as $fn$
    select lower(regexp_replace(coalesce(p_concept, ''), '^[A-Za-z][A-Za-z0-9-]*[:_]', ''))
$fn$;

comment on function public.atlas_concept_local(text) is
'EQ-4. The lowercased local name of an XBRL tag, so us-gaap:Assets,
us-gaap_Assets and Assets all resolve alike. Callers must restrict to
taxonomy IS NULL first -- this strips ANY prefix, so applying it to
ifrs-full:Assets would launder a foreign concept into a us-gaap match, which
is the collapse EQ-3e removed from the probe.';

create or replace view public.vw_company_institution_profile as
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
      bool_or(k = 'liabilityforfuturepolicybenefits')                                  as has_future_policy_benefits,
      bool_or(k = 'separateaccountassets')                                             as has_separate_accounts,
      bool_or(k in ('policyholderbenefitsandclaimsincurrednet'))                       as has_losses_incurred,
      bool_or(k in ('interestincomeexpensenet', 'interestincomeexpenseafterprovisionforloanloss'))
                                                                                       as has_net_interest_income,
      bool_or(k in ('noninterestincome', 'noninterestexpense'))                        as has_noninterest_lines,
      bool_or(k in ('deposits', 'interestbearingdepositliabilities'))                  as has_deposits,
      bool_or(k in ('tieronriskbasedcapital', 'riskweightedassets',
                    'capitaltoriskweightedassets', 'totalriskbasedcapital'))           as has_regulatory_capital
      from lines group by symbol, fiscal_year
),
applic as (
    select f.*,
      -- A BANK IS NOT "HAS DEPOSITS". MetLife reports us-gaap_Deposits --
      -- deposit-type contract liabilities -- so deposits alone would label a
      -- life insurer a bank. Net interest income together with the
      -- noninterest lines is the combination only a depository reports, and
      -- it is what JPM carries on 15 of 15 periods.
      (f.has_net_interest_income and f.has_noninterest_lines)   as bank_applicable,
      (f.has_premiums and f.has_claim_reserves)                 as pc_applicable,
      (f.has_premiums and f.has_future_policy_benefits)         as lh_applicable
      from flags f
)
select
    a.symbol,
    a.fiscal_year,
    a.bank_applicable,
    a.pc_applicable,
    a.lh_applicable,
    -- The primary framework, and NULL rather than a guess where nothing
    -- dominates. `frameworks_supported` is published beside it so a surface
    -- can say "both" rather than silently picking one.
    case
      when a.bank_applicable and not (a.pc_applicable or a.lh_applicable) then 'bank'
      when a.pc_applicable and a.lh_applicable                            then 'mixed_insurer'
      when a.pc_applicable                                               then 'pc_insurer'
      when a.lh_applicable                                               then 'lh_insurer'
      when a.bank_applicable                                             then 'mixed_bank_insurer'
      else null
    end as primary_framework,
    (a.bank_applicable::int + a.pc_applicable::int + a.lh_applicable::int) as frameworks_supported,
    case
      when not (a.bank_applicable or a.pc_applicable or a.lh_applicable)
        then 'no_institution_lines'
      else null
    end as no_framework_reason,

    -- CAMELS · C IS REFUSED, NOT APPROXIMATED. Tier 1 capital and
    -- risk-weighted assets live in the regulatory capital tables, not the
    -- face statements, and were absent on every filer probed -- banks in EQ-3
    -- and eight insurers here. The flag says whether the leg is computable
    -- at all, so a surface states the gap instead of a ratio built on
    -- substitutes.
    a.has_regulatory_capital as camels_c_computable,

    -- The components, not just the label. A label with nothing under it is
    -- what the chrome's hardcoded RISK-ON pill was.
    a.has_premiums, a.has_claim_reserves, a.has_future_policy_benefits,
    a.has_separate_accounts, a.has_losses_incurred,
    a.has_net_interest_income, a.has_noninterest_lines, a.has_deposits
  from applic a;

comment on view public.vw_company_institution_profile is
'EQ-4. Which CFA L2 V3 LM4 framework each filer-year supports, derived from the
FILING rather than from assets.sector.

Three independent applicability flags, not one exclusive label: CB reports
claim reserves AND future policy benefits AND separate account assets, so it
genuinely writes both P&C and life business and `mixed_insurer` is the honest
answer. A bank is net interest income PLUS the noninterest lines, never
deposits alone -- MetLife reports us-gaap_Deposits for deposit-type contract
liabilities.

camels_c_computable is false on every filer measured so far: Tier 1 capital and
risk-weighted assets are in the regulatory capital tables, not the face
statements.';

grant select on public.vw_company_institution_profile to anon, authenticated, service_role;
revoke execute on function public.atlas_concept_local(text) from public;
grant execute on function public.atlas_concept_local(text) to anon, authenticated, service_role;
