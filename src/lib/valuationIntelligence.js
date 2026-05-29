// ATLAS Valuation Intelligence — sector norms, provenance derivation, Compass scoring.
// Pure JS module: no React, no Supabase, no external imports.

export const SECTOR_NORMS = {
  "10": {
    label: "Energy",
    wacc:             { bear: 9.5,  base: 11.0, bull: 13.5 },
    terminalGrowth:   { bear: 1.0,  base: 1.5,  bull: 2.5  },
    revenueGrowthNear:{ bear: -2.0, base: 3.0,  bull: 8.0  },
    ebitdaMargin:     { bear: 18.0, base: 25.0, bull: 35.0 },
    betaRange:        { bear: 1.1,  base: 1.35, bull: 1.6  },
    erpPremium: 5.5
  },
  "15": {
    label: "Materials",
    wacc:             { bear: 9.0,  base: 10.5, bull: 13.0 },
    terminalGrowth:   { bear: 1.0,  base: 1.5,  bull: 2.0  },
    revenueGrowthNear:{ bear: -1.0, base: 4.0,  bull: 9.0  },
    ebitdaMargin:     { bear: 14.0, base: 20.0, bull: 28.0 },
    betaRange:        { bear: 1.0,  base: 1.2,  bull: 1.5  },
    erpPremium: 5.5
  },
  "20": {
    label: "Industrials",
    wacc:             { bear: 8.0,  base: 9.5,  bull: 11.5 },
    terminalGrowth:   { bear: 1.5,  base: 2.0,  bull: 2.5  },
    revenueGrowthNear:{ bear: 1.0,  base: 5.0,  bull: 10.0 },
    ebitdaMargin:     { bear: 10.0, base: 14.0, bull: 20.0 },
    betaRange:        { bear: 0.9,  base: 1.1,  bull: 1.35 },
    erpPremium: 5.0
  },
  "25": {
    label: "Consumer Discretionary",
    wacc:             { bear: 8.5,  base: 10.0, bull: 12.0 },
    terminalGrowth:   { bear: 1.5,  base: 2.0,  bull: 3.0  },
    revenueGrowthNear:{ bear: 0.0,  base: 6.0,  bull: 12.0 },
    ebitdaMargin:     { bear: 8.0,  base: 13.0, bull: 19.0 },
    betaRange:        { bear: 0.9,  base: 1.15, bull: 1.45 },
    erpPremium: 5.0
  },
  "30": {
    label: "Consumer Staples",
    wacc:             { bear: 6.5,  base: 8.0,  bull: 9.5  },
    terminalGrowth:   { bear: 1.5,  base: 2.0,  bull: 2.5  },
    revenueGrowthNear:{ bear: 1.0,  base: 4.0,  bull: 7.0  },
    ebitdaMargin:     { bear: 12.0, base: 16.0, bull: 20.0 },
    betaRange:        { bear: 0.5,  base: 0.7,  bull: 0.9  },
    erpPremium: 4.5
  },
  "35": {
    label: "Health Care",
    wacc:             { bear: 7.5,  base: 9.0,  bull: 11.0 },
    terminalGrowth:   { bear: 2.0,  base: 2.5,  bull: 3.5  },
    revenueGrowthNear:{ bear: 2.0,  base: 8.0,  bull: 15.0 },
    ebitdaMargin:     { bear: 15.0, base: 22.0, bull: 32.0 },
    betaRange:        { bear: 0.6,  base: 0.9,  bull: 1.2  },
    erpPremium: 5.0
  },
  "40": {
    label: "Financials",
    wacc:             { bear: 8.0,  base: 10.0, bull: 12.5 },
    terminalGrowth:   { bear: 1.5,  base: 2.0,  bull: 2.5  },
    revenueGrowthNear:{ bear: 0.0,  base: 5.0,  bull: 9.0  },
    ebitdaMargin:     { bear: 20.0, base: 28.0, bull: 38.0 },
    betaRange:        { bear: 0.9,  base: 1.15, bull: 1.4  },
    erpPremium: 5.5
  },
  "45": {
    label: "Information Technology",
    wacc:             { bear: 8.0,  base: 10.0, bull: 12.5 },
    terminalGrowth:   { bear: 2.0,  base: 3.0,  bull: 4.0  },
    revenueGrowthNear:{ bear: 5.0,  base: 12.0, bull: 22.0 },
    ebitdaMargin:     { bear: 18.0, base: 26.0, bull: 36.0 },
    betaRange:        { bear: 1.0,  base: 1.25, bull: 1.6  },
    erpPremium: 5.5
  },
  "50": {
    label: "Communication Services",
    wacc:             { bear: 7.5,  base: 9.0,  bull: 11.0 },
    terminalGrowth:   { bear: 1.5,  base: 2.5,  bull: 3.5  },
    revenueGrowthNear:{ bear: 2.0,  base: 7.0,  bull: 14.0 },
    ebitdaMargin:     { bear: 20.0, base: 28.0, bull: 36.0 },
    betaRange:        { bear: 0.8,  base: 1.05, bull: 1.35 },
    erpPremium: 5.0
  },
  "55": {
    label: "Utilities",
    wacc:             { bear: 5.5,  base: 7.0,  bull: 8.5  },
    terminalGrowth:   { bear: 0.5,  base: 1.5,  bull: 2.0  },
    revenueGrowthNear:{ bear: 0.0,  base: 2.0,  bull: 4.0  },
    ebitdaMargin:     { bear: 28.0, base: 35.0, bull: 42.0 },
    betaRange:        { bear: 0.3,  base: 0.5,  bull: 0.75 },
    erpPremium: 4.0
  },
  "60": {
    label: "Real Estate",
    wacc:             { bear: 6.5,  base: 8.0,  bull: 9.5  },
    terminalGrowth:   { bear: 1.0,  base: 2.0,  bull: 2.5  },
    revenueGrowthNear:{ bear: 1.0,  base: 4.0,  bull: 7.0  },
    ebitdaMargin:     { bear: 40.0, base: 50.0, bull: 62.0 },
    betaRange:        { bear: 0.6,  base: 0.85, bull: 1.1  },
    erpPremium: 4.5
  },
  "DEFAULT": {
    label: "General Market",
    wacc:             { bear: 8.0,  base: 9.5,  bull: 11.5 },
    terminalGrowth:   { bear: 1.5,  base: 2.0,  bull: 2.5  },
    revenueGrowthNear:{ bear: 1.0,  base: 5.0,  bull: 10.0 },
    ebitdaMargin:     { bear: 12.0, base: 18.0, bull: 25.0 },
    betaRange:        { bear: 0.8,  base: 1.0,  bull: 1.2  },
    erpPremium: 5.0
  }
};

// Maps the internal sector key (used by valuation-house) to a GICS sector code.
export function resolveGICSSectorCode(secKey) {
  const map = {
    technology:  '45',
    financials:  '40',
    healthcare:  '35',
    energy:      '10',
    utilities:   '55',
    consumer:    '25',
    industrials: '20',
    realestate:  '60',
    materials:   '15',
    comms:       '50',
    general:     'DEFAULT'
  };
  return map[secKey] || 'DEFAULT';
}

/**
 * Generates provenance metadata for the five key valuation inputs, derived
 * from the already-mapped ValuationHouse state (`mappedState`) and sector norms.
 * Each entry carries: range (bear/base/bull), provenance string, source label.
 *
 * @param {object} rawOverview - raw overview object from /api/equity response
 * @param {object} mappedState - the `s` state object from ValuationHouse
 * @param {object} sectorNorms - entry from SECTOR_NORMS
 * @returns {object} provenance per field key
 */
export function deriveProvenance(rawOverview, mappedState, sectorNorms) {
  const o = rawOverview || {};
  const s = mappedState;
  const norm = sectorNorms || SECTOR_NORMS['DEFAULT'];
  const dataSource = o._source || 'Finnhub';

  const beta = s.coc.beta;
  const rfPct = +(s.coc.rf * 100).toFixed(2);
  const erpPct = +(s.coc.erp * 100).toFixed(2);
  const ke = +(rfPct + beta * erpPct).toFixed(2);

  const gsPct = +(s.ddm.gS * 100).toFixed(2);
  const gLPct = +(s.fcf.gL * 100).toFixed(2);
  const ebitdaMarginPct = (s.mult.ebitda > 0 && s.mult.rev > 0)
    ? +((s.mult.ebitda / s.mult.rev) * 100).toFixed(1)
    : norm.ebitdaMargin.base;

  return {
    wacc: {
      range: norm.wacc,
      provenance: `${ke}% Ke · β ${beta.toFixed(2)} · ${rfPct}% Rf`,
      source: 'CAPM + ' + dataSource
    },
    terminalGrowth: {
      range: norm.terminalGrowth,
      provenance: `Capped at ${(rfPct * 0.9).toFixed(1)}% (90% of Rf)`,
      source: 'GDP convergence rule'
    },
    revenueGrowthNear: {
      range: norm.revenueGrowthNear,
      provenance: `TTM YoY ${gsPct}%`,
      source: dataSource + ' financials'
    },
    ebitdaMargin: {
      range: norm.ebitdaMargin,
      provenance: `Reported ${ebitdaMarginPct}%`,
      source: dataSource + ' fundamentals'
    },
    beta: {
      range: norm.betaRange,
      provenance: `Market beta ${beta.toFixed(2)}`,
      source: dataSource
    }
  };
}

/**
 * Scores the internal coherence of a valuation input set (0–100).
 * Inputs must be plain percentage values (e.g. wacc=10.2, not 0.102).
 *
 * @param {{ wacc, terminalGrowth, revenueGrowthNear, ebitdaMargin, beta }} inputs
 * @param {string} sectorCode - GICS sector code key
 * @returns {{ score, band, bandLabel, flags }}
 */
export function computeCompassScore(inputs, sectorCode) {
  const norm = SECTOR_NORMS[sectorCode] || SECTOR_NORMS['DEFAULT'];
  const { wacc, terminalGrowth, revenueGrowthNear, ebitdaMargin, beta } = inputs;
  const flags = [];
  let deductions = 0;

  // Rule 1: Gordon Growth Model — terminal growth must be < WACC
  if (terminalGrowth >= wacc) {
    flags.push({
      rule: 'WACC_INTEGRITY',
      severity: 'critical',
      message: `Terminal growth (${terminalGrowth.toFixed(2)}%) ≥ WACC (${wacc.toFixed(2)}%) — Gordon Growth Model breaks down. Reduce gL or raise WACC.`
    });
    deductions += 35;
  }

  // Rule 2: Terminal growth should not exceed near-term growth (unusual for maturing business)
  if (terminalGrowth > revenueGrowthNear + 1.0) {
    flags.push({
      rule: 'GROWTH_CONSISTENCY',
      severity: 'warning',
      message: `Terminal growth (${terminalGrowth.toFixed(2)}%) exceeds near-term growth (${revenueGrowthNear.toFixed(2)}%) — unusual for a maturing business.`
    });
    deductions += 15;
  }

  // Rule 3: High beta + low WACC is structurally inconsistent
  if (beta > 1.4 && wacc < norm.wacc.bear) {
    flags.push({
      rule: 'RISK_COHERENCE',
      severity: 'warning',
      message: `High beta (${beta.toFixed(2)}) with low WACC (${wacc.toFixed(2)}%) — cost of equity appears underestimated for this risk level.`
    });
    deductions += 20;
  }

  // Rule 4: WACC outside sector bear/bull range
  if (wacc < norm.wacc.bear * 0.85 || wacc > norm.wacc.bull * 1.15) {
    flags.push({
      rule: 'SECTOR_CONTEXT',
      severity: 'info',
      message: `WACC (${wacc.toFixed(2)}%) is outside the ${norm.label} sector range (${norm.wacc.bear}–${norm.wacc.bull}%). Confirm this is intentional.`
    });
    deductions += 10;
  }

  // Rule 5: EBITDA margin well above sector ceiling
  if (ebitdaMargin > norm.ebitdaMargin.bull * 1.2) {
    flags.push({
      rule: 'MARGIN_PLAUSIBILITY',
      severity: 'warning',
      message: `EBITDA margin (${ebitdaMargin.toFixed(1)}%) is above the ${norm.label} sector ceiling (${norm.ebitdaMargin.bull}%). Verify against reported financials.`
    });
    deductions += 10;
  }

  const score = Math.max(0, 100 - deductions);
  return {
    score,
    band: score >= 80 ? 'GREEN' : score >= 55 ? 'AMBER' : 'RED',
    bandLabel: score >= 80 ? 'Coherent' : score >= 55 ? 'Review' : 'Tension',
    flags
  };
}
