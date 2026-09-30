-- Rev. B §3's rule: a distinct refusal keeps its own name. Collapsing
-- basis_mismatch into one_sided would erase the difference between "we could
-- only see one side of this" and "the ledger and the tape price different
-- shares", which is the one that needs a corporate-action adjustment.
ALTER TABLE public.position_verdicts
  DROP CONSTRAINT IF EXISTS position_verdicts_status_ck;
ALTER TABLE public.position_verdicts
  ADD CONSTRAINT position_verdicts_status_ck
  CHECK (verdict_status IN ('measured','one_sided','stale_mark','ledger_mismatch','basis_mismatch'));

COMMENT ON COLUMN public.position_verdicts.verdict_status IS
 'measured | one_sided | stale_mark | ledger_mismatch | basis_mismatch. Rev. B §3: every refusal on this book is a data-integrity refusal, never a solver failure. stale_mark self-heals when the feed returns; ledger_mismatch and basis_mismatch do not.';

-- Map it through the job rather than letting it fall into the ELSE.
DO $patch$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='atlas_write_verdicts' AND pronamespace='public'::regnamespace;

  src := replace(src,
    E'WHEN ''ledger_mismatch'' THEN ''ledger_mismatch''',
    E'WHEN ''ledger_mismatch'' THEN ''ledger_mismatch''\n                   WHEN ''basis_mismatch''  THEN ''basis_mismatch''');

  IF position('WHEN ''basis_mismatch''  THEN' in src) = 0 THEN
    RAISE EXCEPTION 'verdict_status mapping patch did not match';
  END IF;

  EXECUTE src;
END $patch$;
