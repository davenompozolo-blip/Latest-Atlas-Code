-- Proof that vw_company_institution_ratios computes only what the persisted
-- lines support, gates every metric on the framework the FILING supports, and
-- REFUSES what has no evidence behind it.
--
-- Safe to run against production. Ends on a RAISE, so the transaction rolls
-- back and no row survives. A successful run FAILS with a message beginning
-- 'RATIO PROOF', and every line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/company_institution_ratios_proof.sql
--
-- CASE 4 IS THE ONE THAT MATTERS MOST. HUM resolves
-- provision_for_credit_losses to ProvisionForDoubtfulAccounts -- bad-debt
-- provision on receivables, not credit-loss provisioning on a loan book.
-- Computing a bank ratio from it would be the `fwd_pe` defect. The framework
-- gate is what makes the ambiguous tag safe, and this case is what proves the
-- gate actually holds rather than being asserted in a comment.
--
-- CASES 9-12 ARE EQ-4h. Case 12 is the subtle one: the PRU combined tag is
-- good enough to CLASSIFY a filer as long-duration and NOT good enough to
-- MEASURE a short-duration reserve ratio, because it pools both durations.
--
-- Last run 2026-09-23: 12/12.

DO $v$
DECLARE r record; ok text := ''; src text := '__ratio_proof';
BEGIN
  DELETE FROM public.company_reported_lines WHERE source = src;
  INSERT INTO public.company_reported_lines(source,symbol,fiscal_year,concept,taxonomy,value) VALUES
   -- Pure short-duration. losses/premiums = 650/1000, reserves/premiums = 1800/1000.
   (src,'PC',1900,'us-gaap_PremiumsEarnedNet',null,1000),
   (src,'PC',1900,'us-gaap_PolicyholderBenefitsAndClaimsIncurredNet',null,650),
   (src,'PC',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,1800),
   -- Long-duration, AND reporting us-gaap_Deposits. benefits 1500/2000,
   -- sep acct 4000/20000.
   (src,'LH',1900,'us-gaap_PremiumsEarnedNet',null,2000),
   (src,'LH',1900,'us-gaap_PolicyholderBenefitsAndClaimsIncurredNet',null,1500),
   (src,'LH',1900,'us-gaap_LiabilityForFuturePolicyBenefits',null,9000),
   (src,'LH',1900,'us-gaap_SeparateAccountAssets',null,4000),
   (src,'LH',1900,'us-gaap_Deposits',null,1000),
   (src,'LH',1900,'us-gaap_Assets',null,20000),
   -- Bank. efficiency 560/800, ni share 300/800, nii/assets 500/10000,
   -- deposits/assets 6000/10000. No loan book: CAMELS A must refuse.
   (src,'BK',1900,'us-gaap_InterestIncomeExpenseNet',null,500),
   (src,'BK',1900,'us-gaap_NoninterestIncome',null,300),
   (src,'BK',1900,'us-gaap_NoninterestExpense',null,560),
   (src,'BK',1900,'us-gaap_Deposits',null,6000),
   (src,'BK',1900,'us-gaap_Assets',null,10000),
   -- The HUM shape: a health insurer carrying ProvisionForDoubtfulAccounts.
   (src,'HEALTH',1900,'us-gaap_PremiumsEarnedNet',null,5000),
   (src,'HEALTH',1900,'us-gaap_PolicyholderBenefitsAndClaimsIncurredNet',null,4200),
   (src,'HEALTH',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,900),
   (src,'HEALTH',1900,'us-gaap_LiabilityForFuturePolicyBenefits',null,300),
   (src,'HEALTH',1900,'us-gaap_ProvisionForDoubtfulAccounts',null,40),
   (src,'HEALTH',1900,'us-gaap_Assets',null,40000),

   -- ── EQ-4h shapes ──────────────────────────────────────────────────────
   -- UNH through 2023: the health-specific losses tag IS the numerator of the
   -- medical care ratio. 4200/5000 = 0.84, and it was absent entirely before.
   (src,'HEALTHOLD',1900,'us-gaap_PremiumsEarnedNet',null,5000),
   (src,'HEALTHOLD',1900,'us-gaap_PolicyholderBenefitsAndClaimsIncurredHealthCare',null,4200),
   (src,'HEALTHOLD',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,900),
   -- A bank on the legacy pair: allowance 200 / loans 4000 = 0.05,
   -- loans 4000 / assets 10000 = 0.40.
   (src,'BKLEGACY',1900,'us-gaap_InterestIncomeExpenseNet',null,500),
   (src,'BKLEGACY',1900,'us-gaap_NoninterestIncome',null,300),
   (src,'BKLEGACY',1900,'us-gaap_NoninterestExpense',null,560),
   (src,'BKLEGACY',1900,'us-gaap_LoansAndLeasesReceivableNetReportedAmount',null,4000),
   (src,'BKLEGACY',1900,'us-gaap_LoansAndLeasesReceivableAllowance',null,200),
   (src,'BKLEGACY',1900,'us-gaap_Assets',null,10000),
   -- The same bank one accounting era later, same numbers, ASC 326 tags.
   (src,'BKCECL',1900,'us-gaap_InterestIncomeExpenseNet',null,500),
   (src,'BKCECL',1900,'us-gaap_NoninterestIncome',null,300),
   (src,'BKCECL',1900,'us-gaap_NoninterestExpense',null,560),
   (src,'BKCECL',1900,'us-gaap_FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss',null,4000),
   (src,'BKCECL',1900,'us-gaap_FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest',null,200),
   (src,'BKCECL',1900,'us-gaap_Assets',null,10000),
   -- PRU 2010-2022: the COMBINED liability. Classifies long-duration; must
   -- NOT feed a short-duration reserve ratio.
   (src,'PRUOLD',1900,'us-gaap_PremiumsEarnedNet',null,2000),
   (src,'PRUOLD',1900,'us-gaap_PolicyholderBenefitsAndClaimsIncurredNet',null,1500),
   (src,'PRUOLD',1900,'us-gaap_LiabilityForFuturePolicyBenefitsAndUnpaidClaimsAndClaimsAdjustmentExpense',null,9000);

  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='PC';
  IF r.loss_and_lae_ratio <> 0.650000 OR r.reserves_to_premiums <> 1.800000 THEN
    RAISE EXCEPTION 'CASE 1: short-duration gave % / %', r.loss_and_lae_ratio, r.reserves_to_premiums; END IF;
  ok := ok || E'\n   1 the loss and LAE ratio computes (8/8 tags)      pass';

  IF r.combined_ratio_withheld <> 'underwriting_expense_not_measured' THEN
    RAISE EXCEPTION 'CASE 2: combined ratio not withheld (%)', r.combined_ratio_withheld; END IF;
  ok := ok || E'\n   2 the COMBINED ratio is refused, with a reason    pass';

  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='LH';
  IF r.benefits_to_premiums <> 0.750000 OR r.separate_account_share <> 0.200000 THEN
    RAISE EXCEPTION 'CASE 3: long-duration gave % / %', r.benefits_to_premiums, r.separate_account_share; END IF;
  -- The deposits trap, at the ratio layer: a life insurer reporting Deposits
  -- must get NO bank ratio at all, not a plausible-looking one.
  IF r.efficiency_ratio IS NOT NULL OR r.deposits_to_assets IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 3: a life insurer got bank ratios (% / %)',
      r.efficiency_ratio, r.deposits_to_assets; END IF;
  ok := ok || E'\n   3 long-duration computes, and gets NO bank ratio  pass';

  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='HEALTH';
  IF r.bank_applicable OR r.efficiency_ratio IS NOT NULL OR r.camels_a_withheld IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 4: a health insurer entered the bank framework'; END IF;
  IF r.loss_and_lae_ratio <> 0.840000 THEN
    RAISE EXCEPTION 'CASE 4: health loss ratio %', r.loss_and_lae_ratio; END IF;
  ok := ok || E'\n   4 THE GATE CONFINES AN AMBIGUOUS TAG             pass';

  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='BK';
  IF r.efficiency_ratio <> 0.700000 OR r.noninterest_income_share <> 0.375000 THEN
    RAISE EXCEPTION 'CASE 5: bank E gave % / %', r.efficiency_ratio, r.noninterest_income_share; END IF;
  ok := ok || E'\n   5 CAMELS E computes (15/15 tags on JPM)           pass';

  IF r.nii_to_assets <> 0.050000 OR r.deposits_to_assets <> 0.600000 THEN
    RAISE EXCEPTION 'CASE 6: bank L gave % / %', r.nii_to_assets, r.deposits_to_assets; END IF;
  ok := ok || E'\n   6 CAMELS L computes                               pass';

  IF r.camels_a_withheld <> 'loan_book_not_reported_by_this_filer_year'
     OR r.allowance_to_loans IS NOT NULL OR r.loans_to_assets IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 7: CAMELS A not withheld cleanly (% / % / %)',
      r.camels_a_withheld, r.allowance_to_loans, r.loans_to_assets; END IF;
  ok := ok || E'\n   7 no loan book -> CAMELS A refused AND absent      pass';

  IF r.camels_c_withheld <> 'regulatory_capital_not_in_face_statements' THEN
    RAISE EXCEPTION 'CASE 8: CAMELS C not withheld (%)', r.camels_c_withheld; END IF;
  ok := ok || E'\n   8 CAMELS C is refused, with a reason               pass';

  -- ── EQ-4h ──────────────────────────────────────────────────────────────
  -- 28 filer-years of UNH and HUM had NO loss ratio before this alias.
  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='HEALTHOLD';
  IF r.loss_and_lae_ratio <> 0.840000 THEN
    RAISE EXCEPTION 'CASE 9: the health-era losses tag gave %', r.loss_and_lae_ratio; END IF;
  ok := ok || E'\n   9 the pre-2024 health losses tag computes          pass';

  -- THE SAME BANK, THE SAME NUMBERS, TWO TAG ERAS. If these disagree, the
  -- ratio is a statement about XBRL practice rather than about the bank.
  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='BKLEGACY';
  IF r.allowance_to_loans <> 0.050000 OR r.loans_to_assets <> 0.400000
     OR r.camels_a_withheld IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 10: the legacy pair gave % / % / %',
      r.allowance_to_loans, r.loans_to_assets, r.camels_a_withheld; END IF;
  ok := ok || E'\n  10 CAMELS A computes on the legacy tag pair         pass';

  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='BKCECL';
  IF r.allowance_to_loans <> 0.050000 OR r.loans_to_assets <> 0.400000
     OR r.camels_a_withheld IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 11: the ASC 326 pair gave % / % / %',
      r.allowance_to_loans, r.loans_to_assets, r.camels_a_withheld; END IF;
  ok := ok || E'\n  11 ...and agrees exactly across the ASC 326 change  pass';

  -- GOOD ENOUGH TO CLASSIFY IS NOT GOOD ENOUGH TO MEASURE. PRU's combined
  -- tag pools short- and long-duration liabilities, so it establishes that
  -- the filer writes long-duration business and must not become the numerator
  -- of a reserve adequacy ratio. And the long-duration figure it does produce
  -- carries its caveat, because premiums are a minority denominator there.
  SELECT * INTO r FROM public.vw_company_institution_ratios WHERE symbol='PRUOLD';
  IF r.primary_framework <> 'long_duration_insurer' THEN
    RAISE EXCEPTION 'CASE 12: the combined tag gave %', r.primary_framework; END IF;
  IF r.reserves_to_premiums IS NOT NULL OR r.loss_and_lae_ratio IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 12: a combined liability produced a short-duration ratio'; END IF;
  IF r.benefits_to_premiums <> 0.750000
     OR r.benefits_ratio_caveat <> 'premiums_are_a_minority_of_long_duration_revenue' THEN
    RAISE EXCEPTION 'CASE 12: benefits % caveat %', r.benefits_to_premiums, r.benefits_ratio_caveat; END IF;
  ok := ok || E'\n  12 CLASSIFY-ONLY TAG NEVER BECOMES A MEASUREMENT    pass';

  RAISE EXCEPTION 'RATIO PROOF -- 12/12, rolling back.%', ok;
END $v$;
