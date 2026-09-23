-- Proof that vw_company_institution_profile picks a framework from the FILING,
-- on the shapes EQ-4 MEASURED against production rather than invented ones.
-- Every tag seeded below is one the probe reported as `matched` for that filer.
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
-- Last run 2026-09-23: 7/7.

DO $v$
DECLARE r record; ok text := ''; n int;
  -- Seed the MEASURED shapes, not invented ones. Every tag below is one the
  -- probe reported as `matched` for that filer.
  src text := '__profile_proof';
BEGIN
  DELETE FROM public.company_reported_lines WHERE source = src;
  INSERT INTO public.company_reported_lines(source,symbol,fiscal_year,concept,taxonomy,value) VALUES
   -- CB: claim reserves AND future policy benefits AND separate accounts
   (src,'CBLIKE',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'CBLIKE',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,1),
   (src,'CBLIKE',1900,'us-gaap_LiabilityForFuturePolicyBenefits',null,1),
   (src,'CBLIKE',1900,'us-gaap_SeparateAccountAssets',null,1),
   -- PGR: pure P&C
   (src,'PGRLIKE',1900,'us-gaap_PremiumsEarnedNet',null,1),
   (src,'PGRLIKE',1900,'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense',null,1),
   -- MET: life, AND reports us-gaap_Deposits. The deposits trap.
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
   (src,'TGTLIKE',1900,'us-gaap_Revenues',null,1);

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='CBLIKE';
  IF r.primary_framework <> 'mixed_insurer' OR r.frameworks_supported <> 2 THEN
    RAISE EXCEPTION 'CASE 1: CB-like gave % / %', r.primary_framework, r.frameworks_supported; END IF;
  ok := ok || E'\n  1 both P&C and life lines -> mixed_insurer        pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='PGRLIKE';
  IF r.primary_framework <> 'pc_insurer' OR r.lh_applicable THEN
    RAISE EXCEPTION 'CASE 2: PGR-like gave %', r.primary_framework; END IF;
  ok := ok || E'\n  2 claim reserves, no FPB -> pc_insurer            pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='METLIKE';
  IF r.primary_framework <> 'lh_insurer' OR r.bank_applicable THEN
    RAISE EXCEPTION 'CASE 3: MET-like gave % bank=%', r.primary_framework, r.bank_applicable; END IF;
  IF NOT r.has_deposits THEN RAISE EXCEPTION 'CASE 3: deposits not seen'; END IF;
  ok := ok || E'\n  3 DEPOSITS ALONE IS NOT A BANK                   pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='JPMLIKE';
  IF r.primary_framework <> 'bank' OR r.frameworks_supported <> 1 THEN
    RAISE EXCEPTION 'CASE 4: JPM-like gave %', r.primary_framework; END IF;
  ok := ok || E'\n  4 NII + noninterest lines -> bank                 pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='IFRSLIKE';
  IF r.symbol IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 5: an IFRS filer resolved to %', r.primary_framework; END IF;
  ok := ok || E'\n  5 an IFRS local name does NOT resolve             pass';

  SELECT * INTO r FROM public.vw_company_institution_profile WHERE symbol='TGTLIKE';
  IF r.primary_framework IS NOT NULL OR r.no_framework_reason <> 'no_institution_lines' THEN
    RAISE EXCEPTION 'CASE 6: retailer gave % / %', r.primary_framework, r.no_framework_reason; END IF;
  ok := ok || E'\n  6 a non-financial reports its reason, not a guess pass';

  -- CAMELS C is absent on every filer probed -- banks in EQ-3 and eight
  -- insurers here -- so the flag must be false everywhere, and the leg is
  -- refused rather than approximated from substitutes.
  SELECT count(*) INTO n FROM public.vw_company_institution_profile WHERE camels_c_computable;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 7: % rows claim CAMELS C computable', n; END IF;
  ok := ok || E'\n  7 CAMELS C computable on no filer measured       pass';

  RAISE EXCEPTION 'PROFILE PROOF -- 7/7, rolling back.%', ok;
END $v$;
