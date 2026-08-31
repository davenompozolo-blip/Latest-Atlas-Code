-- Invariants of vw_position_trading_effect (memo v2 close-out §5.1 drill-down).
--
--   psql "$DATABASE_URL" -f supabase/tests/position_trading_effect_invariants.sql
--
-- Read-only: it mutates nothing, and still ends on RAISE so the transaction
-- rolls back and the report arrives as the error message. A successful run
-- FAILS with a message beginning 'TRADING EFFECT INVARIANTS' and every line
-- under it should read `pass`.
--
-- The point of these is not that the view runs. It is that the two claims the
-- drill-down makes on screen are true of the data: that the dollar column adds
-- up to the book, and that the rate column does not. A surface that ranks on
-- the wrong one of those is wrong in a way no error will ever report.
--
-- Last run 2026-08-31: 9/9. Check 3 is the one worth reading — the rates sum
-- to −160.76pp against the book's −1.03pp, a factor of 156. That is the size
-- of the mistake a drill-down ranking on the rate column would be making.

DO $test$
DECLARE
  results text := '';
  n       int;
  x       numeric;
  y       numeric;
BEGIN
  -- 1. The partition is exhaustive and disjoint. If a new trade_kind ever
  --    appears the rollup on screen silently drops those positions out of the
  --    decomposition while still counting them in the total.
  SELECT count(*) INTO n FROM public.vw_position_trading_effect
   WHERE trade_kind NOT IN ('exit','resized','untouched') OR trade_kind IS NULL;
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  every row carries a known trade_kind (' || n || ' strays)';

  -- 2. THE claim the surface rests on: dollars are additive. The sum over
  --    positions must equal the book's own traded-minus-frozen gain, because
  --    that is what makes it legitimate to rank positions by this column and
  --    say they explain the book.
  SELECT sum(trading_effect_usd),
         sum(traded_gain_usd) - sum(frozen_gain_usd)
    INTO x, y
    FROM public.vw_position_trading_effect WHERE comparable;
  results := results || E'\n  ' || CASE WHEN abs(x - y) <= 1.00 THEN 'pass' ELSE 'FAIL' END
          || '  dollar effects sum to the book difference (' || round(x,2)
          || ' vs ' || round(y,2) || ', tolerance $1 for the untouched snap)';

  -- 3. And the counter-claim, asserted rather than assumed: the RATE column
  --    does not sum to the book's MWR effect, and is not within a mile of it.
  --    This is why the drill-down sorts on dollars. If this check ever starts
  --    failing, the two are no longer different questions and the surface's
  --    explanation of itself has gone stale.
  SELECT sum(trading_effect_pct) INTO x
    FROM public.vw_position_trading_effect WHERE comparable;
  SELECT trading_effect_pct INTO y FROM public.vw_book_frozen_baseline;
  results := results || E'\n  ' || CASE WHEN abs(x - y) > 0.05 THEN 'pass' ELSE 'FAIL' END
          || '  rate effects do NOT sum to the book MWR effect (sum '
          || round(x,4) || ' vs book ' || round(y,4) || ')';

  -- 4. The two units must still agree on the book verdict. They answer
  --    different questions, but if they disagreed on whether trading helped at
  --    all, the drill-down would be contradicting the headline it sits under
  --    and one of them would have to be withdrawn.
  SELECT sum(trading_effect_usd) INTO x
    FROM public.vw_position_trading_effect WHERE comparable;
  SELECT trading_effect_pct INTO y FROM public.vw_book_frozen_baseline;
  results := results || E'\n  ' || CASE WHEN sign(x) = sign(y) THEN 'pass' ELSE 'FAIL' END
          || '  dollars and the book rate agree on the SIGN (' || sign(x) || ' / ' || sign(y) || ')';

  -- 5. An untouched position's traded path IS its frozen path. Not approximately.
  SELECT count(*) INTO n FROM public.vw_position_trading_effect
   WHERE trade_kind = 'untouched' AND comparable
     AND (trading_effect_usd <> 0 OR trading_effect_pct <> 0);
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  untouched positions are exactly zero, not nearly (' || n || ' nonzero)';

  -- 6. The snap is bounded. A breach means a position was classed untouched
  --    while its two paths actually diverged — the classification or the
  --    counterfactual is wrong, and zeroing it would bury that.
  SELECT count(*) INTO n FROM public.vw_position_trading_effect
   WHERE structural_zero_breach;
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  no structural-zero breach (' || n || ' breached)';

  -- 7. Unmeasurable rows publish nothing and say why. The house rule: if the
  --    data cannot support the figure, the figure is NULL — and the absence
  --    carries a reason rather than reading as a zero.
  SELECT count(*) INTO n FROM public.vw_position_trading_effect
   WHERE NOT comparable
     AND (unmeasurable_reason IS NULL
          OR trading_effect_usd IS NOT NULL OR trading_effect_pct IS NOT NULL);
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  unmeasurable rows are NULL and reasoned (' || n || ' violations)';

  -- 8. Comparability is the engine's gate verbatim, not a second opinion. If
  --    these ever diverge the drill-down is grading positions the engine
  --    refused to measure.
  SELECT count(*) INTO n
    FROM public.vw_position_trading_effect te
    JOIN public.vw_position_frozen f ON f.asset_id = te.asset_id
   WHERE te.comparable <> (f.trading_effect_pct IS NOT NULL);
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  comparable mirrors the engine gate exactly (' || n || ' divergent)';

  -- 9. The reason this view reads live instead of position_verdicts. The
  --    verdict history is open-book only, so the closed exits — which carry
  --    essentially the whole book effect — cannot appear in it. Asserted
  --    because it is a structural property someone will otherwise "simplify"
  --    the view against, and the resulting drill-down would show near-zeros
  --    with no sign that anything was missing.
  SELECT count(*) INTO n
    FROM public.vw_position_trading_effect te
   WHERE te.position_state <> 'open'
     AND EXISTS (SELECT 1 FROM public.position_verdicts v
                  WHERE v.symbol = te.symbol
                    AND v.as_of = (SELECT max(as_of) FROM public.position_verdicts));
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  closed positions are absent from position_verdicts (' || n || ' present)';

  RAISE EXCEPTION 'TRADING EFFECT INVARIANTS%', results;
END
$test$;
