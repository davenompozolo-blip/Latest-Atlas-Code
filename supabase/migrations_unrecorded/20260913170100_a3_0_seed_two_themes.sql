-- A3.0 seed. Two themes at logic_version = 'v0-uncalibrated'.
--
-- The version string is the claim: these numbers are reasoned guesses, not
-- results. A3.1's historical backfill is what turns them into calibrated ones,
-- and a change to any of them is a NEW logic_version row set.
--
-- Two of A3.0's five rules are stated in prose without numbers -- tariff
-- exhaustion ("level holds, confirmation axis decays") and energy exhaustion
-- ("level holds, XLE/XLU decays"). Both need a "magnitude has fallen below"
-- test, and the operator for that (abs_lte) does not exist until A3.1 §1
-- extends the CHECK. Those two rows are therefore seeded in the A3.1 migration
-- beside the operator that makes them expressible, not omitted.

insert into public.regime_themes (theme_key, label, driver_class, description) values
  ('tariff_rebasing', 'Tariff rebasing', 'supply_geopolitical',
   'Trade policy is resetting the price level rather than producing a one-off '
   'shock: the market re-prices inflation expectations at the FORWARD horizon, '
   'not just the front end, and the move persists. The discriminating evidence '
   'is a 5y5y forward breakeven that rises while oil does not -- an energy shock '
   'moves both.'),
  ('energy_dislocation', 'Energy dislocation', 'supply_geopolitical',
   'A supply-driven move in crude is transmitting into inflation expectations. '
   'Requires the commodity move AND the breakeven move together; either alone '
   'is a different state. Cyclical leadership confirms that the market is '
   'treating it as a growth/supply event rather than a demand collapse.')
on conflict (theme_key) do nothing;

insert into public.regime_theme_triggers
  (theme_key, trigger_key, role, operand_kind, series_key, axis_key, pair_key,
   measure, operator, threshold, threshold_units, baseline_window, hold_sessions,
   logic_version, notes)
values
  -- ---------------- tariff_rebasing ----------------
  ('tariff_rebasing', 'emg_t5yifr_up', 'emergence', 'series', 'T5YIFR', null, null,
   'series_level_vs_baseline_mean', 'gte', 25, 'bp', 60, 20, 'v0-uncalibrated',
   'The theme''s primary claim: the FORWARD breakeven reprices, not just the front end. '
   '25bp over a 60-session mean is roughly a 1.5 sigma move on this series and is loose '
   'enough to catch a policy repricing without firing on ordinary drift. Held 20 sessions '
   'because a rebasing that lasts a month is the thing being claimed; a week is a headline.'),
  ('tariff_rebasing', 'emg_no_retrace', 'emergence', 'series', 'T5YIFR', null, null,
   'retrace_of_episode_move', 'lte', 40, 'pct', null, 20, 'v0-uncalibrated',
   'A move that gives back 40% of itself during the hold window has not rebased anything. '
   'Tighter than the 60% abort threshold on purpose: 40% disqualifies an emergence that is '
   'still forming, 60% kills one that had already been established.'),
  ('tariff_rebasing', 'abs_t5yie_up', 'absorption', 'series', 'T5YIE', null, null,
   'series_level_vs_baseline_mean', 'gte', 25, 'bp', 60, 20, 'v0-uncalibrated',
   'Absorption is the front end pricing a shock the forward curve does not. Same 25bp bar '
   'as emergence so the two are like-for-like. The 20-session hold is authored here: A3.0 '
   'gives absorption no hold, and without one a single noisy session reads as an absorbed '
   'shock. It mirrors the hold A3.1 gives fiscal_dominance absorption.'),
  ('tariff_rebasing', 'abs_t5yifr_flat', 'absorption', 'series', 'T5YIFR', null, null,
   'series_level_vs_baseline_mean', 'lte', 10, 'bp', 60, 20, 'v0-uncalibrated',
   'The other half of absorption, and the half that makes it a distinct state: the forward '
   'breakeven did NOT follow. 10bp is deliberately inside the 25bp emergence bar so the two '
   'states cannot both hold on the same reading.'),
  ('tariff_rebasing', 'abort_t5yifr_retrace', 'abort', 'series', 'T5YIFR', null, null,
   'retrace_of_episode_move', 'retrace_gt', 60, 'pct', null, null, 'v0-uncalibrated',
   'Giving back 60% of the move that produced the state is the point at which the claim is '
   'no longer supported by its own evidence. Fires from any state, as the state machine says.'),
  ('tariff_rebasing', 'cfm_cyclical', 'confirmation', 'axis', null, 'cyclical', null,
   'axis_score_20d_z', 'gte', 0.5, 'sigma', null, null, 'v0-uncalibrated',
   'Ratio confirmation, NOT a gate. A tariff rebasing should show up as cyclical leadership '
   'in the cross-section; when it does not, that is a genuinely interesting state and the '
   'engine must be able to report it, so this never blocks a transition -- it is recorded in '
   'evidence and reflected in strength. 0.5 sigma matches the quiet band on the same column. '
   'EXCLUSIVITY: an energy shock also moves T5YIFR and also lifts cyclical, so this row '
   'cannot separate the two themes and is not asked to. The separation is the BRENT abs_lte '
   'row A3.1 adds to emergence -- tariff requires the breakeven move WITHOUT a commodity move.'),

  -- ---------------- energy_dislocation ----------------
  ('energy_dislocation', 'emg_brent_up', 'emergence', 'series', 'BRENT', null, null,
   'series_level_vs_baseline_mean', 'gte', 25, 'pct', 120, 40, 'v0-uncalibrated',
   'The commodity leg. 25% over a 120-session mean is a supply event rather than a rally, '
   'and 40 sessions is long enough that a spike which mean-reverts inside two months does '
   'not qualify. Brent is SPOT: without a forward curve this cannot say the market expects '
   'the level to persist, which is why the hold does the work instead.'),
  ('energy_dislocation', 'emg_t5yifr_up', 'emergence', 'series', 'T5YIFR', null, null,
   'series_level_vs_baseline_mean', 'gte', 20, 'bp', 60, 40, 'v0-uncalibrated',
   'Transmission into inflation expectations. 20bp rather than tariff''s 25 because here it '
   'is corroboration of a move already evidenced in the commodity, not the primary claim. '
   'A3.0 states hold 40 once for the whole emergence conjunction rather than per leg, so all '
   'three energy emergence rows carry 40.'),
  ('energy_dislocation', 'emg_cyclical_positive', 'emergence', 'axis', null, 'cyclical', null,
   'axis_score_20d_z', 'gte', 0, 'sigma', null, 40, 'v0-uncalibrated',
   'A3.0 says "and cyclical positive" with no magnitude, so the threshold is exactly zero: '
   'a sign test, not a strength test. It separates a supply squeeze the market reads as a '
   'growth event from one it reads as a demand collapse, where cyclicals would be leading '
   'down while oil rose.'),
  ('energy_dislocation', 'abs_brent_up', 'absorption', 'series', 'BRENT', null, null,
   'series_level_vs_baseline_mean', 'gte', 25, 'pct', 120, 20, 'v0-uncalibrated',
   'Oil moved and the forward breakeven did not: the shock was absorbed rather than rebased. '
   'Same 25% bar as emergence; the 20-session hold is authored for the same reason as '
   'tariff''s, A3.0 giving absorption none.'),
  ('energy_dislocation', 'abs_t5yifr_flat', 'absorption', 'series', 'T5YIFR', null, null,
   'series_level_vs_baseline_mean', 'lte', 10, 'bp', 60, 20, 'v0-uncalibrated',
   'The discriminating half. 10bp is inside the 20bp emergence bar, so emergence and '
   'absorption cannot both be satisfied on one reading.'),
  ('energy_dislocation', 'abort_brent_retrace', 'abort', 'series', 'BRENT', null, null,
   'retrace_of_episode_move', 'retrace_gt', 60, 'pct', null, null, 'v0-uncalibrated',
   'Crude giving back 60% of the move is the supply story failing. Anchored on BRENT rather '
   'than on the breakeven because the commodity is this theme''s primary evidence.'),
  ('energy_dislocation', 'cfm_cyclical', 'confirmation', 'axis', null, 'cyclical', null,
   'axis_score_20d_z', 'gte', 0.5, 'sigma', null, null, 'v0-uncalibrated',
   'Confirmation, never a gate. Note this axis appears twice for this theme with different '
   'thresholds and different jobs: emergence tests the SIGN at 0 and must hold for the state '
   'to change, confirmation tests STRENGTH at 0.5 and never blocks anything.')
on conflict (theme_key, trigger_key, logic_version) do nothing;
