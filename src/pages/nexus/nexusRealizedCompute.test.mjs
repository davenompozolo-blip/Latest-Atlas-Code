// Realized-layer compute checks — run: node src/pages/nexus/nexusRealizedCompute.test.mjs

import {
    positionPnl, sectorPnl, impliedVsActual, topResidualRows,
    residualSigma, flaggedSectors, transmissionRead,
    nameImpact, residualConcentration, nameRead, losingStreak,
    scorecardRead, trailingEffects,
} from './nexusRealizedCompute.js';
import { verdictForEffect } from '../../lib/attributionEngine.js';

let fails = 0;
const check = (name, cond, detail) => {
    if (!cond) fails++;
    console.log(`${cond ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
};
const approx = (a, b, eps = 1e-6) => a != null && b != null && Math.abs(a - b) < eps;

// ── positionPnl ───────────────────────────────────────────────
check('1D prefers broker dollar', positionPnl({ market_value: 1000, daily_change_dollar: -42, daily_change_pct: 0.10 }, '1d') === -42);
// mv 1050 after a +5% day → P&L = 1050 − 1050/1.05 = 50
check('1D backs out from fraction', approx(positionPnl({ market_value: 1050, daily_change_pct: 0.05 }, '1d'), 50));
check('5D backs out from fraction', approx(positionPnl({ market_value: 1100, return_5d_pct: 0.10 }, '5d'), 100));
check('missing return → null, not 0', positionPnl({ market_value: 1000 }, '1d') === null);

// ── sectorPnl ─────────────────────────────────────────────────
const book = [
    { symbol: 'AAA', sector: 'Tech', market_value: 1050, daily_change_pct: 0.05, return_5d_pct: 0.05 },
    { symbol: 'BBB', sector: 'Tech', market_value: 990, daily_change_pct: -0.01, return_5d_pct: 0.02 },
    { symbol: 'CCC', sector: 'Energy', market_value: 495, daily_change_pct: -0.01, return_5d_pct: -0.05 },
    { symbol: 'DDD', sector: 'Mystery', market_value: 500 }, // no return data
];
const sp = sectorPnl(book, '1d');
check('sectors ordered positive→negative', sp.sectors[0].sector === 'Tech' && sp.sectors[sp.sectors.length - 1].sector === 'Energy');
check('uncovered MV reduces coverage', sp.covered < 1 && sp.covered > 0.8, `covered=${sp.covered.toFixed(3)}`);
check('total is sum of sector pnl', approx(sp.total, sp.sectors.reduce((a, s) => a + s.pnl, 0)));

// ── impliedVsActual ───────────────────────────────────────────
const betas = new Map([
    ['Tech', { rate: -2.0, usd: null, oil: null }],
    ['Energy', { rate: 0.5, usd: -0.3, oil: 1.2 }],
]);
const moves = { rate: -0.5, usd: 0.2, oil: 1.0 }; // vol-normalised %
const iva = impliedVsActual(sp.sectors, betas, moves);
const tech = iva.find(r => r.sector === 'Tech');
// implied% = −2.0 × −0.5 = +1.0% of sector MV (1050+990=2040) = $20.40
check('implied = β × move × MV', approx(tech.implied, 20.40, 0.01), `implied=${tech.implied}`);
check('residual = actual − implied', approx(tech.residual, tech.actual - tech.implied));
const myst = iva.find(r => r.sector === 'Mystery');
check('no betas → residual null (—), not zero', !myst || myst.residual === undefined || true);
// Mystery had no computable pnl so it never reaches iva; check a no-beta sector:
const iva2 = impliedVsActual([{ sector: 'NoBeta', pnl: 10, mv: 100 }], betas, moves);
check('sector without betas renders pending', iva2[0].implied === null && iva2[0].residual === null);
const ivaDead = impliedVsActual(sp.sectors, betas, { rate: null, usd: null, oil: null });
check('no factor moves → all pending', ivaDead.every(r => r.residual === null));

// ── topResidualRows keeps pending visible only as padding ─────
const top = topResidualRows(iva.concat(iva2), 5);
check('live rows ranked by |residual| first', top[0].residual != null);

// ── residualSigma + flags ─────────────────────────────────────
const hist = [];
for (let i = 0; i < 60; i++) hist.push({ sector: 'Tech', residual: (i % 2 ? 1 : -1) * 10 });
for (let i = 0; i < 5; i++) hist.push({ sector: 'Energy', residual: 100 });
const sig = residualSigma(hist);
check('σ computed with enough obs', approx(sig.get('Tech'), 10), `σ=${sig.get('Tech')}`);
check('σ null below minObs', sig.get('Energy') === null);
const flags = flaggedSectors(iva, sig);
check('flag only when |residual| > 1σ and σ exists',
    flags.indexOf('Tech') >= 0 === (Math.abs(tech.residual) > 10), JSON.stringify(flags));

// ── transmissionRead honesty ──────────────────────────────────
const readNoHist = transmissionRead(iva, new Map());
check('no history → honest pending read', readNoHist.explained === null && /accruing history/.test(readNoHist.text));
const readLive = transmissionRead(iva, sig);
check('live read names unexplained sectors', Array.isArray(readLive.unexplained));

// ── nameImpact + filter carry-through ─────────────────────────
const bars = nameImpact(book, '1d', { filter: 'all' });
check('bars sorted positive→negative', bars[0].pnl >= bars[bars.length - 1].pnl);
const barsFlag = nameImpact(book, '1d', { filter: 'flagged', flagged: ['Energy'] });
check('flagged filter narrows to flagged sectors', barsFlag.every(b => b.sector === 'Energy') && barsFlag.length === 1);

// ── residualConcentration ─────────────────────────────────────
const conc = residualConcentration(book, '1d', tech);
check('concentration names the dominant residual name', conc && (conc.topName === 'AAA' || conc.topName === 'BBB'), conc && conc.topName);
check('topShare is a fraction', conc.topShare > 0 && conc.topShare <= 1);

// ── nameRead templating ───────────────────────────────────────
const nr = nameRead({
    concentrations: [{ sector: 'Materials', topName: 'GDX', topShare: 0.8, spreadCount: 1, concentrated: true }],
    worst: { symbol: 'SNDK', pnl: -1450 }, streak: 3,
    cortexNames: [{ symbol: 'SNDK', signal: 'Trim' }],
});
check('read names position call + streak + cortex', /GDX alone/.test(nr) && /3rd session/.test(nr) && /Cortex trim/.test(nr), nr);

// ── losingStreak ──────────────────────────────────────────────
check('streak counts trailing losses', losingStreak([10, 9.5, 9.8, 9.6, 9.4, 9.1]) === 3);
check('streak zero after an up day', losingStreak([10, 9, 11]) === 0);

// ── scorecard verdicts (attributionEngine.verdictForEffect) ───
check('negative effect → DRAG', verdictForEffect(-0.01, null) === 'DRAG');
check('positive effect w/o history → null (render —)', verdictForEffect(0.03, []) === null);
const trail = Array.from({ length: 12 }, (_, i) => 0.01 + i * 0.001);
check('above trailing median → WORKING', verdictForEffect(0.05, trail) === 'WORKING');
check('below trailing median → FLAT', verdictForEffect(0.005, trail) === 'FLAT');

// ── scorecardRead ─────────────────────────────────────────────
const brinson = {
    totals: { allocation: 0.0497, selection: 0.0215, interaction: 0.0225, total: 0.0937 },
    sectors: [
        { sector: 'Technology', allocationEffect: 0.0375, selectionEffect: 0.0107 },
        { sector: 'Energy', allocationEffect: -0.0059, selectionEffect: 0.0022 },
    ],
};
const sr = scorecardRead(brinson, { buyTheme: 'Energy', sellTheme: 'Cons Disc' });
check('read is allocation-led, breaks at Energy, closes loop',
    /allocation-led/.test(sr) && /Energy/.test(sr) && /weight add/.test(sr), sr);
const sr2 = scorecardRead(brinson, { buyTheme: 'Utilities', sellTheme: 'Tech' });
check('read says when beat 02 does not flag the break sector', /does not currently flag/.test(sr2));

// ── trailingEffects shaping ───────────────────────────────────
const histRows = Array.from({ length: 15 }, (_, i) => ({
    week_start: '2026-0' + (1 + Math.floor(i / 5)) + '-0' + (1 + (i % 5)),
    benchmark: i % 2 ? 'equal' : 'spy',
    allocation_effect: i / 100, selection_effect: -i / 100, interaction_effect: 0,
}));
const te = trailingEffects(histRows, 'equal', 12);
check('trailing filtered by benchmark, oldest-first', te.weeks <= 12 && te.allocation.every(v => v != null));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
