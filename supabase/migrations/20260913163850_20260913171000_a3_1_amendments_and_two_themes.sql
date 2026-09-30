-- A3.1 section 1 -- the two amendments to A3.0 -- plus the two remaining
-- driver classes, the tariff BRENT negative leg, and the two exhaustion rows
-- A3.0 could only state in prose.

-- Amendment 1: `absorbed` is a real outcome. A shock that happened and did not
-- rebase is not an absence of one and must not be recorded as `dormant`.
alter table public.regime_theme_states drop constraint rts_state_ck;
alter table public.regime_theme_states add constraint rts_state_ck check (state in
  ('dormant','emerging','established','absorbed','exhausted','aborted'));

-- Amendment 2: the operator set. `abs_lte` is what lets a trigger require that
-- something did NOT move, which is how the section 4 attribution rules are
-- expressed and the only reason four themes do not all fire on one move.
--
-- `pct_gte` is added because the spec's set names it, and no row uses it: this
-- schema carries the unit on `threshold_units`, so "25% above the baseline" is
-- already `gte` + `pct` and a separate percentage operator would be a second
-- way to write the same row. Left in the CHECK rather than silently dropped so
-- the set matches the spec.
alter table public.regime_theme_triggers drop constraint rtt_operator_ck;
alter table public.regime_theme_triggers add constraint rtt_operator_ck check (operator in
  ('gte','lte','abs_gte','abs_lte','pct_gte','retrace_gt'));

insert into public.regime_themes (theme_key, label, driver_class, description) values
  ('fiscal_dominance', 'Fiscal dominance', 'fiscal_dominance',
   'Sovereign issuance and industrial policy are setting the price of duration, '
   'not inflation. The signature is nominal yields rising while inflation '
   'expectations stay put -- a real-yield, bond-supply story -- with the long end '
   'leading, so the curve bear steepens.'),
  ('productivity_capex', 'Productivity capex', 'productivity_capex',
   'A capital-investment cycle is concentrating market leadership and lifting '
   'real yields through expected growth rather than through inflation or '
   'issuance. THE WEAKEST OF THE FOUR: it has no independent macro series, '
   'because nonresidential fixed investment is quarterly and lags by months, so '
   'it is detected mostly off the market-structure axis it is meant to be '
   'confirmed by. The 60-session holds are the longest of any theme on purpose -- '
   'a secular capex cycle should not be detectable in a quarter -- and this is '
   'the theme most likely to be recalibrated or retired after the backfill.')
on conflict (theme_key) do nothing;

insert into public.regime_theme_triggers
  (theme_key, trigger_key, role, operand_kind, series_key, axis_key, pair_key,
   measure, operator, threshold, threshold_units, baseline_window, hold_sessions,
   logic_version, notes)
values
  -- ------- the attribution row A3.0 could not carry -------
  ('tariff_rebasing', 'emg_brent_flat', 'emergence', 'series', 'BRENT', null, null,
   'series_level_vs_baseline_mean', 'abs_lte', 15, 'pct', 120, 20, 'v0-uncalibrated',
   'THE ROW THAT MAKES THE FOUR THEMES DISTINGUISHABLE. BRENT did not exist when A3.0 '
   'seeded this theme, so its negative leg was missing and tariff would co-fire with every '
   'energy shock -- one underlying move registering as two independent themes, which is how '
   'a multi-theme surface manufactures agreement. 15% against a 120-session mean is wide '
   'enough to tolerate ordinary crude volatility and narrow enough to exclude a supply event, '
   'which is flagged at 25% on the same baseline by energy_dislocation.'),

  -- ------- exhaustion rows that needed abs_lte -------
  ('tariff_rebasing', 'exh_cyclical_decay', 'exhaustion', 'axis', null, 'cyclical', null,
   'axis_score_20d_z', 'abs_lte', 0.5, 'sigma', null, 20, 'v0-uncalibrated',
   'A3.0 states this rule as "level holds, confirmation axis decays" with no number; the '
   'number is authored here. 0.5 sigma is the same quiet band the dispersion state uses on '
   'the same column, so "decayed" means the same thing in both places. "Level holds" needs '
   'no row: exhaustion is only reachable from `established`, which already requires the '
   'emergence rows to be holding.'),
  ('energy_dislocation', 'exh_xle_xlu_decay', 'exhaustion', 'pair', null, null, 'xle_xlu',
   'pair_logret_z', 'abs_lte', 0.3, 'sigma', 60, 20, 'v0-uncalibrated',
   'A3.0 states this as "level holds, XLE/XLU decays" in prose. The numeric form mirrors '
   'productivity_capex''s exhaustion row exactly -- 0.3 sigma over a 60-session move, held 20 '
   '-- so the two mean the same thing rather than each carrying its own invented band.'),

  -- ---------------- fiscal_dominance ----------------
  ('fiscal_dominance', 'emg_dgs10_up', 'emergence', 'series', 'DGS10', null, null,
   'series_level_vs_baseline_mean', 'gte', 40, 'bp', 60, 30, 'v0-uncalibrated',
   '40bp over 30 sessions on the 10y is roughly 1.5 sigma of a 30-session move: loose enough '
   'to catch 2023''s issuance-driven repricing, tight enough to exclude ordinary drift.'),
  ('fiscal_dominance', 'emg_t5yifr_flat', 'emergence', 'series', 'T5YIFR', null, null,
   'series_level_vs_baseline_mean', 'abs_lte', 12, 'bp', 60, 30, 'v0-uncalibrated',
   'THE DISCRIMINATOR, and the most important row in this theme. Inflation expectations flat '
   'is what makes a rising long end fiscal rather than inflationary. Widen this band and the '
   'theme starts co-firing with tariff_rebasing, which is the exact failure the attribution '
   'table exists to prevent. 12bp is deliberately tighter than the 15bp band '
   'productivity_capex uses, because fiscal is the theme most exposed to the confusion.'),
  ('fiscal_dominance', 'emg_t10y2y_up', 'emergence', 'series', 'T10Y2Y', null, null,
   'series_level_vs_baseline_mean', 'gte', 25, 'bp', 60, 30, 'v0-uncalibrated',
   'Bear steepening: the long end leads. A supply story prices duration, so the 10y must rise '
   'faster than the 2y. Note T10Y2Y is DGS10 minus DGS2 and is NOT independent of the row '
   'above -- the conjunction is testing the SHAPE of the move, not counting two pieces of '
   'evidence for the same thing.'),
  ('fiscal_dominance', 'abs_dgs10_up', 'absorption', 'series', 'DGS10', null, null,
   'series_level_vs_baseline_mean', 'gte', 40, 'bp', 60, 20, 'v0-uncalibrated',
   'Rates up...'),
  ('fiscal_dominance', 'abs_t10y2y_flat', 'absorption', 'series', 'T10Y2Y', null, null,
   'series_level_vs_baseline_mean', 'lte', 0, 'bp', 60, 20, 'v0-uncalibrated',
   '...but the curve flat or flattening. That is monetary tightening repricing the front end, '
   'not fiscal supply repricing the long end -- the same level move with the opposite cause.'),
  ('fiscal_dominance', 'abort_dgs10_retrace', 'abort', 'series', 'DGS10', null, null,
   'retrace_of_episode_move', 'retrace_gt', 60, 'pct', null, null, 'v0-uncalibrated',
   'The level giving back 60% of its move.'),
  ('fiscal_dominance', 'exh_t10y2y_retrace', 'exhaustion', 'series', 'T10Y2Y', null, null,
   'retrace_of_episode_move', 'retrace_gt', 50, 'pct', null, null, 'v0-uncalibrated',
   'The slope gives back half its steepening while the level holds. Exhaustion is a softer '
   'bar than abort (50 against 60) and is measured on the SHAPE rather than on the level, '
   'which is what distinguishes "the story ran its course" from "the story was wrong".'),
  ('fiscal_dominance', 'cfm_t10y2y', 'confirmation', 'series', 'T10Y2Y', null, null,
   'series_level_vs_baseline_mean', 'gte', 15, 'bp', 60, null, 'v0-uncalibrated',
   'Confirmation on the SLOPE, not on an axis -- the only theme whose confirmation is a macro '
   'series. There is no intermarket ratio that reads bond supply, so confirming on cyclical '
   'or concentration would confirm this theme with evidence about something else. Never a '
   'gate: recorded in evidence and reflected in strength only.'),

  -- ---------------- productivity_capex ----------------
  ('productivity_capex', 'emg_concentration_narrow', 'emergence', 'axis', null, 'concentration', null,
   'axis_score_20d_z', 'gte', 1.0, 'sigma', null, 60, 'v0-uncalibrated',
   'Leadership narrowing and STAYING narrow. Read on score_20d_z, never score_20d: the raw '
   'column is a rolling 20-session sum whose sd runs 4.2 to 8.2, so a threshold of 1.0 '
   'against it would be about a seventh of a sigma. Sixty sessions is the longest hold in the '
   'framework because a secular capex cycle should not be detectable in a quarter.'),
  ('productivity_capex', 'emg_t5yifr_flat', 'emergence', 'series', 'T5YIFR', null, null,
   'series_level_vs_baseline_mean', 'abs_lte', 15, 'bp', 60, 60, 'v0-uncalibrated',
   'No inflation impulse: this is a growth story, not a price story. Slightly wider than '
   'fiscal''s 12bp band because over a 60-session hold a tighter band would be broken by '
   'ordinary breakeven noise rather than by a real inflation impulse.'),
  ('productivity_capex', 'emg_dgs10_up', 'emergence', 'series', 'DGS10', null, null,
   'series_level_vs_baseline_mean', 'gte', 20, 'bp', 60, 60, 'v0-uncalibrated',
   'Real yields up on expected growth. 20bp rather than fiscal''s 40 because here the yield '
   'move is corroboration of a story the concentration axis is carrying, not the claim itself.'),
  ('productivity_capex', 'abs_concentration_narrow', 'absorption', 'axis', null, 'concentration', null,
   'axis_score_20d_z', 'gte', 1.0, 'sigma', null, 20, 'v0-uncalibrated',
   'Leadership narrows on the same bar as emergence but for a third of the time...'),
  ('productivity_capex', 'abs_concentration_retrace', 'absorption', 'axis', null, 'concentration', null,
   'retrace_of_episode_move', 'retrace_gt', 50, 'pct', null, null, 'v0-uncalibrated',
   '...then gives half of it back. Momentum, not a regime. Note this is the only absorption '
   'set in the framework whose two rows are on the SAME operand: for the other three themes '
   'absorption is a disagreement between two series, here it is a disagreement between a move '
   'and its own persistence.'),
  ('productivity_capex', 'abort_concentration_retrace', 'abort', 'axis', null, 'concentration', null,
   'retrace_of_episode_move', 'retrace_gt', 60, 'pct', null, null, 'v0-uncalibrated',
   'Sits 10 points above the absorption retrace on the same operand, so a 55% retrace is '
   'absorbed and a 65% retrace is aborted. The state machine checks abort first, so the two '
   'cannot both apply.'),
  ('productivity_capex', 'exh_rsp_spy_flat', 'exhaustion', 'pair', null, null, 'rsp_spy',
   'pair_logret_z', 'abs_lte', 0.3, 'sigma', 60, 20, 'v0-uncalibrated',
   'Breadth stops deteriorating: leadership plateaus rather than reverses. Measured on the '
   'equal-weight against cap-weight ratio, which is the most direct breadth read available in '
   'the A0 leg set. This is a RATIO PAIR, neither a macro series nor an axis, which is why '
   'the trigger table carries a third operand kind.'),
  ('productivity_capex', 'cfm_concentration', 'confirmation', 'axis', null, 'concentration', null,
   'axis_score_20d_z', 'gte', 0.5, 'sigma', null, null, 'v0-uncalibrated',
   'Confirmation on the same axis the theme is detected from, which is precisely the weakness '
   'recorded on the theme itself: with no independent macro series for capex, this row adds '
   'little beyond restating the emergence row at a lower bar. Kept so the theme has the same '
   'shape as the other three, and never a gate.')
on conflict (theme_key, trigger_key, logic_version) do nothing;
