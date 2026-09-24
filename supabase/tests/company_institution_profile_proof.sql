-- Proof that vw_company_institution_profile picks a framework from the FILING,
-- on the shapes EQ-4 MEASURED against production rather than invented ones.
-- Every tag seeded below is one the probe or the live load reported for that
-- filer.
--
-- Safe to run against production. Ends on a RAISE, so the transaction rolls
-- back and no row survives. A successful run FAILS with a message beginning
-- 'PROFILE PROOF', and every line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/company_institution_profile_proof.sql
--
-- CASE 3 IS THE ONE THAT EARNS ITS PLACE. MetLife reports us-gaap_Deposits --
-- deposit-type contract liabilities -- so "has deposits" would label a life
-- insurer a bank. The bank test is net interest income PLUS the noninterest
-- lines, which is what JPM carries on 15 of 15 periods and no insurer carries
-- at all.
--
-- CASES 8-12 ARE EQ-4h, AND EVERY ONE OF THEM FAILS AGAINST THE EQ-4e VIEW.
-- They are the shapes the first real eleven-symbol load surfaced: a health
-- insurer is short-duration and not P&C, one liability is reported under three
-- tags across LDTI adoption, and CAMELS A is a per-row fact rather than a
-- property of banks.
--
-- Last run 2026-09-23: 12/12.

DO $v$
DECLARE r record; ok text := ''; n int;
  src text := '__profile_proof';
BEGIN
  DELETE FROM public.company_reported_lines WHERE source = src;
  INSERT INTO public.company_reported_lines(source,symbol,fiscal_year,concept,taxonomy,value) VALUES
   -- CB: claim reserves AND future policy benefits AND separate accounts
   (src,'CBLIKE',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'CBLIKE',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,1),
   (src,'CBLIKE',1900,'us-gaap_LiabilityForFuturePolicyBenefits',null,1),
   (src,'CBLIKE',1900,'us-gaap_SeparateAccountAssets',null,1),
   -- PGR: pure short-duration
   (src,'PGRLIKE',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'PGRLIKE',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,1),
   -- MET: long-duration, AND reports us-gaap_Deposits. The deposits trap.
   (src,'METLIKE',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'METLIKE',1900,'us-gaap_LiabilityForFuturePolicyBenefits',null,1),
   (src,'METLIKE',1900,'us-gaap_Deposits',null,1),
   -- JPM: the measured 15/15 bank set
   (src,'JPMLIKE',1900,'us-gaap_InterestIncomeExpenseNet',null,1),
   (src,'JPMLIKE',1900,'us-gaap_NoninterestExpense',null,1),
   (src,'JPMLIKE',1900,'us-gaap_NoninterestIncome',null,1),
   (src,'JPMLIKE',1900,'us-gaap_Deposits',null,1),
   -- An IFRS filer using the same LOCAL name. Must not resolve.
   (src,'IFRSLIKE',1900,'ifrs-full:PremiumsEarnedNet','ifrs-full',1),
   (src,'IFRSLIKE',1900,'ifrs-full:LiabilityForClaimsAndClaimsAdjustmentExpense','ifrs-full',1),
   -- A retailer
   (src,'TGTLIKE',1900,'us-gaap_Assets',null,1),
   (src,'TGTLIKE',1900,'us-gaap_Revenues',null,1),

   -- ── EQ-4h shapes, all taken from the live load ─────────────────────────
   -- UNH through 2023: a HEALTH insurer. Short-duration liabilities and the
   -- health-specific losses tag. Writes no property and no casualty business.
   (src,'UNHLIKE',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'UNHLIKE',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,1),
   (src,'UNHLIKE',1900,'us-gaap_PolicyholderBenefitsAndClaimsIncurredHealthCare',null,1),
   -- PRU 2010-2022: the COMBINED liability tag, labelled "Future policy
   -- benefits" by the filer. 13 of PRU's 16 years read as no framework at all
   -- without it.
   (src,'PRUOLD',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'PRUOLD',1900,'us-gaap_LiabilityForFuturePolicyBenefitsAndUnpaidClaimsAndClaimsAdjustmentExpense',null,1),
   -- MET 2019-2022: the after-reinsurance spelling of the same liability.
   (src,'METMID',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'METMID',1900,'us-gaap_LiabilityForFuturePolicyBenefitAfterReinsurance',null,1),
   -- A bank on the LEGACY loan tag pair (through 2019-2021).
   (src,'BKLEGACY',1900,'us-gaap_InterestIncomeExpenseNet',null,1),
   (src,'BKLEGACY',1900,'us-gaap_NoninterestIncome',null,1),
   (src,'BKLEGACY',1900,'us-gaap_LoansAndLeasesReceivableNetReportedAmount',null,1),
   (src,'BKLEGACY',1900,'us-gaap_LoansAndLeasesReceivableAllowance',null,1),
   -- A bank on the ASC 326 (CECL) pair (from 2020-2022).
   (src,'BKCECL',1900,'us-gaap_InterestIncomeExpenseNet',null,1),
   (src,'BKCECL',1900,'us-gaap_NoninterestIncome',null,1),
   (src,'BKCECL',1900,'us-gaap_FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss',null,1),
   (src,'BKCECL',1900,'us-gaap_FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest',null,1),
   -- A bank straddling the change: allowance present, loan book absent. This
   -- is JPM 2016-2020 and BAC 2020-2021, 14 filer-years in all.
   (src,'BKSTRADDLE',1900,'us-gaap_InterestIncomeExpenseNet',null,1),
   (src,'BKSTRADDLE',1900,'us-gaap_NoninterestIncome',null,1),
   (src,'BKSTRADDLE',1900,'us-gaap_LoansAndLeasesReceivableAllowance',null,1);

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='CBLIKE';
  IF r.primary_framework <> 'mixed_insurer' OR r.frameworks_supported <> 2 THEN
    RAISE EXCEPTION 'CASE 1: CB-like gave % / %', r.primary_framework, r.frameworks_supported; END IF;
  ok := ok || E'\n   1 both durations on one filer -> mixed_insurer     pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='PGRLIKE';
  IF r.primary_framework <> 'short_duration_insurer' OR r.long_duration_applicable THEN
    RAISE EXCEPTION 'CASE 2: PGR-like gave %', r.primary_framework; END IF;
  ok := ok || E'\n   2 claim reserves, no FPB -> short_duration         pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='METLIKE';
  IF r.primary_framework <> 'long_duration_insurer' OR r.bank_applicable THEN
    RAISE EXCEPTION 'CASE 3: MET-like gave % bank=%', r.primary_framework, r.bank_applicable; END IF;
  IF NOT r.has_deposits THEN RAISE EXCEPTION 'CASE 3: deposits not seen'; END IF;
  ok := ok || E'\n   3 DEPOSITS ALONE IS NOT A BANK                    pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='JPMLIKE';
  IF r.primary_framework <> 'bank' OR r.frameworks_supported <> 1 THEN
    RAISE EXCEPTION 'CASE 4: JPM-like gave %', r.primary_framework; END IF;
  ok := ok || E'\n   4 NII + noninterest lines -> bank                  pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='IFRSLIKE';
  IF r.symbol IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 5: an IFRS filer resolved to %', r.primary_framework; END IF;
  ok := ok || E'\n   5 an IFRS local name does NOT resolve              pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='TGTLIKE';
  IF r.primary_framework IS NOT NULL OR r.no_framework_reason <> 'no_institution_lines' THEN
    RAISE EXCEPTION 'CASE 6: retailer gave % / %', r.primary_framework, r.no_framework_reason; END IF;
  ok := ok || E'\n   6 a non-financial reports its reason, not a guess  pass';

  -- CAMELS C is absent on every filer measured -- four banks in the live load
  -- and eight insurers in the probe -- so the flag must be false everywhere,
  -- and the leg is refused rather than approximated from substitutes.
  SELECT count(*) INTO n FROM public.vw_company_institution_profile WHERE camels_c_computable;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 7: % rows claim CAMELS C computable', n; END IF;
  ok := ok || E'\n   7 CAMELS C computable on no filer measured        pass';

  -- ── EQ-4h ──────────────────────────────────────────────────────────────
  -- THE RENAME IS THE POINT. A health insurer files short-duration contract
  -- liabilities exactly as a P&C insurer does, so the measurement was always
  -- right; `pc_insurer` asserted property and casualty business UNH and HUM
  -- do not write. This case fails against the EQ-4e view.
  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='UNHLIKE';
  IF r.primary_framework <> 'short_duration_insurer' THEN
    RAISE EXCEPTION 'CASE 8: a health insurer gave %', r.primary_framework; END IF;
  IF NOT r.has_losses_incurred THEN
    RAISE EXCEPTION 'CASE 8: the health-specific losses tag was not seen'; END IF;
  ok := ok || E'\n   8 A HEALTH INSURER IS SHORT-DURATION, NOT P&C     pass';

  -- The old names must keep meaning what they measured, or a consumer written
  -- against EQ-4e silently changes answer.
  IF r.pc_applicable IS DISTINCT FROM r.short_duration_applicable
     OR r.lh_applicable IS DISTINCT FROM r.long_duration_applicable THEN
    RAISE EXCEPTION 'CASE 9: the EQ-4e aliases do not track the duration flags'; END IF;
  ok := ok || E'\n   9 pc_/lh_applicable still alias the duration flags pass';

  -- ONE LIABILITY, THREE SPELLINGS, SPLIT BY LDTI ADOPTION.
  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='PRUOLD';
  IF r.primary_framework <> 'long_duration_insurer' THEN
    RAISE EXCEPTION 'CASE 10: the PRU combined tag gave %', r.primary_framework; END IF;
  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='METMID';
  IF r.primary_framework <> 'long_duration_insurer' THEN
    RAISE EXCEPTION 'CASE 10: the MET after-reinsurance tag gave %', r.primary_framework; END IF;
  ok := ok || E'\n  10 all three era spellings of one liability resolve pass';

  -- CAMELS A ON BOTH TAG ERAS.
  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='BKLEGACY';
  IF NOT r.camels_a_computable THEN RAISE EXCEPTION 'CASE 11: the legacy pair did not compute'; END IF;
  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='BKCECL';
  IF NOT r.camels_a_computable THEN RAISE EXCEPTION 'CASE 11: the ASC 326 pair did not compute'; END IF;
  ok := ok || E'\n  11 CAMELS A computes on BOTH tag eras              pass';

  -- AND IT IS PER ROW, NOT PER BANK. An allowance with no loan book is a
  -- denominator that does not exist, whatever the filer is.
  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='BKSTRADDLE';
  IF r.camels_a_computable OR NOT r.bank_applicable THEN
    RAISE EXCEPTION 'CASE 12: a bank with no loan book claimed CAMELS A'; END IF;
  ok := ok || E'\n  12 an allowance with no loan book refuses CAMELS A pass';

  RAISE EXCEPTION 'PROFILE PROOF -- 12/12, rolling back.%', ok;
END $v$;
