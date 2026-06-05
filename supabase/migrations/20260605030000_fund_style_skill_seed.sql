-- ============================================================
-- ATLAS — Fund Research v3 — Style & Skill seed data
-- Aloe Capital — Pan-Africa Long/Short Equity (fictional)
-- ============================================================

do $$ declare
  v_fund_id uuid;
  v_as_of   date;
begin
  select id into v_fund_id from funds
  where name = 'Aloe Capital — Pan-Africa Long/Short Equity';
  if v_fund_id is null then return; end if;

  -- Skip if already seeded
  if exists (select 1 from fund_style where fund_id = v_fund_id) then return; end if;

  -- ── fund_style: rolling 36-month RBSA weights (quarterly snapshots) ──
  -- Weights are JSONB: {sa_equity, offshore_equity, sa_bonds, sa_property, cash}
  -- Sum to 1.0 (long-only constraint satisfied by RBSA)
  insert into fund_style (fund_id, as_of, weights, r2, drift_flag) values
    (v_fund_id, '2021-12-31', '{"sa_equity":0.62,"offshore_equity":0.18,"sa_bonds":0.06,"sa_property":0.09,"cash":0.05}', 0.83, false),
    (v_fund_id, '2022-03-31', '{"sa_equity":0.60,"offshore_equity":0.20,"sa_bonds":0.07,"sa_property":0.08,"cash":0.05}', 0.84, false),
    (v_fund_id, '2022-06-30', '{"sa_equity":0.58,"offshore_equity":0.22,"sa_bonds":0.08,"sa_property":0.07,"cash":0.05}', 0.82, false),
    (v_fund_id, '2022-09-30', '{"sa_equity":0.55,"offshore_equity":0.24,"sa_bonds":0.09,"sa_property":0.07,"cash":0.05}', 0.81, false),
    (v_fund_id, '2022-12-31', '{"sa_equity":0.53,"offshore_equity":0.25,"sa_bonds":0.10,"sa_property":0.07,"cash":0.05}', 0.80, false),
    (v_fund_id, '2023-03-31', '{"sa_equity":0.55,"offshore_equity":0.23,"sa_bonds":0.10,"sa_property":0.07,"cash":0.05}', 0.82, false),
    (v_fund_id, '2023-06-30', '{"sa_equity":0.57,"offshore_equity":0.22,"sa_bonds":0.09,"sa_property":0.07,"cash":0.05}', 0.83, false),
    (v_fund_id, '2023-09-30', '{"sa_equity":0.59,"offshore_equity":0.21,"sa_bonds":0.08,"sa_property":0.07,"cash":0.05}', 0.84, false),
    (v_fund_id, '2023-12-31', '{"sa_equity":0.61,"offshore_equity":0.20,"sa_bonds":0.07,"sa_property":0.08,"cash":0.04}', 0.85, false),
    (v_fund_id, '2024-03-31', '{"sa_equity":0.63,"offshore_equity":0.19,"sa_bonds":0.06,"sa_property":0.08,"cash":0.04}', 0.86, false),
    (v_fund_id, '2024-06-30', '{"sa_equity":0.62,"offshore_equity":0.20,"sa_bonds":0.06,"sa_property":0.08,"cash":0.04}', 0.86, false),
    (v_fund_id, '2024-09-30', '{"sa_equity":0.61,"offshore_equity":0.21,"sa_bonds":0.06,"sa_property":0.08,"cash":0.04}', 0.87, false),
    (v_fund_id, '2024-12-31', '{"sa_equity":0.60,"offshore_equity":0.22,"sa_bonds":0.06,"sa_property":0.08,"cash":0.04}', 0.87, false),
    (v_fund_id, '2025-03-31', '{"sa_equity":0.59,"offshore_equity":0.23,"sa_bonds":0.06,"sa_property":0.08,"cash":0.04}', 0.86, false),
    (v_fund_id, '2025-06-30', '{"sa_equity":0.58,"offshore_equity":0.24,"sa_bonds":0.06,"sa_property":0.08,"cash":0.04}', 0.85, false),
    (v_fund_id, '2025-09-30', '{"sa_equity":0.57,"offshore_equity":0.25,"sa_bonds":0.07,"sa_property":0.08,"cash":0.03}', 0.85, false),
    (v_fund_id, '2025-12-31', '{"sa_equity":0.56,"offshore_equity":0.26,"sa_bonds":0.07,"sa_property":0.07,"cash":0.04}', 0.84, false),
    (v_fund_id, '2026-03-31', '{"sa_equity":0.58,"offshore_equity":0.24,"sa_bonds":0.07,"sa_property":0.07,"cash":0.04}', 0.85, false),
    (v_fund_id, '2026-05-31', '{"sa_equity":0.59,"offshore_equity":0.23,"sa_bonds":0.07,"sa_property":0.07,"cash":0.04}', 0.86, false);

  -- ── fund_skill: rolling 36-month alpha stats (quarterly) ──
  -- alpha_raw / alpha_shrunk in decimal annualised (e.g. 0.048 = 4.8% p.a.)
  -- alpha_se: standard error in same units
  -- quartile_path: array of {period, quartile} objects
  insert into fund_skill (fund_id, as_of, alpha_raw, alpha_se, alpha_shrunk,
                          posterior_lo, posterior_hi, shrink_narrative, quartile_path) values
    (v_fund_id, '2022-12-31', 0.038, 0.022, 0.026, 0.004, 0.048,
     'Raw alpha of 3.8% p.a. shrunk toward the SA EQ peer prior (μ=0, τ=2.5%). 68 months of data; moderate conviction.',
     '[{"period":"2020","q":2},{"period":"2021","q":1},{"period":"2022","q":2}]'),
    (v_fund_id, '2023-06-30', 0.042, 0.021, 0.029, 0.007, 0.051,
     'Raw alpha strengthened to 4.2% p.a. on 74 months. Bayesian update moves posterior mean to 2.9%; t-stat 2.0 — borderline significant.',
     '[{"period":"2020","q":2},{"period":"2021","q":1},{"period":"2022","q":2},{"period":"2023H1","q":1}]'),
    (v_fund_id, '2023-12-31', 0.045, 0.020, 0.032, 0.010, 0.054,
     'Persistence strengthening. 80 months of return history; annualised alpha 4.5%, t-stat 2.25. Posterior shrinks to 3.2% — skill signal emerging.',
     '[{"period":"2020","q":2},{"period":"2021","q":1},{"period":"2022","q":2},{"period":"2023","q":1}]'),
    (v_fund_id, '2024-06-30', 0.047, 0.020, 0.033, 0.011, 0.055,
     '86 months. Alpha 4.7% p.a., t-stat 2.35. Posterior 3.3%. Quartile consistency: 3× Top-2 in last 4 years. Skill probability >80% by Bayesian posterior mass above zero.',
     '[{"period":"2021","q":1},{"period":"2022","q":2},{"period":"2023","q":1},{"period":"2024H1","q":1}]'),
    (v_fund_id, '2024-12-31', 0.048, 0.021, 0.034, 0.011, 0.057,
     '89 months. Alpha 4.8% p.a., t-stat 2.29. Prior mean 0%, prior SD 2.5%. Posterior mean 3.4% (95% CI: 1.1%–5.7%). Manager has demonstrated repeatable out-performance versus ASISA SA EQ General peers.',
     '[{"period":"2021","q":1},{"period":"2022","q":2},{"period":"2023","q":1},{"period":"2024","q":1}]'),
    (v_fund_id, '2026-05-31', 0.051, 0.021, 0.036, 0.013, 0.059,
     '89+ months. Alpha 5.1% p.a., t-stat 2.43. Prior mean 0%, prior SD 2.5%. Posterior mean 3.6% (95% CI: 1.3%–5.9%). Consistent top-quartile ranking 3 of last 4 full years.',
     '[{"period":"2022","q":2},{"period":"2023","q":1},{"period":"2024","q":1},{"period":"2025","q":1}]');

end $$;
