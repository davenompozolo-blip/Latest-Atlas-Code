// Coherence engine fixture.
// Run: node src/lib/trade/coherence.test.mjs
//
// The fixture is the worked NVDA example from the mockup, because that example
// states its own family vector AND the three numbers it produces. If the engine
// reproduces net, alignment, the effective weights and the size multiplier from
// that vector, the arithmetic in §5.3 and §5.6 is implemented as specified.

import {
    computeCoherence, derivePosture, sizeMultiplierFor, reconcileSize,
    assessCoherence, applySuppression, requiresTrigger, POSTURE_THRESHOLDS,
} from './coherence.js';

let fails = 0;
const near = (name, got, want, tol = 0.005) => {
    const ok = got != null && Math.abs(got - want) <= tol;
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${got}\n    want: ${want} ±${tol}`); }
    else console.log(`✓ ${name}  (${typeof got === 'number' ? got.toFixed(4) : got})`);
};
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

// ── The mockup's NVDA family table, post-suppression as displayed ────────────
const NVDA = [
    { code: 'trend',      score:  0.72, conviction: 0.81, confidence: 0.94 },
    { code: 'flow',       score:  0.58, conviction: 0.66, confidence: 0.79 },
    { code: 'macro',      score:  0.40, conviction: 0.50, confidence: 0.85 },
    { code: 'vol_regime', score:  0.20, conviction: 0.35, confidence: 0.88 },
    { code: 'stretch',    score: -0.45, conviction: 0.60, confidence: 0.92 },
    { code: 'valuation',  score: -0.80, conviction: 0.88, confidence: 0.91 },
];

const coh = computeCoherence(NVDA, { side: 'buy' });

console.log('\n— effective weights, w = conviction × confidence (§5.3) —');
// Exact products, against the mockup's 2dp W column. Macro is the one exact
// tie in the table — 0.50 × 0.85 = 0.425, which the mock rounds up to 0.43 —
// so it is checked at full precision rather than at display resolution.
const wants = { trend: 0.7614, flow: 0.5214, macro: 0.425, vol_regime: 0.308, stretch: 0.552, valuation: 0.8008 };
for (const f of coh.families) near(`w ${f.code} = conviction × confidence`, f.weight, wants[f.code], 1e-9);

console.log('\n— the three numbers —');
near('net        = Σ(w·s)/Σw',        coh.net,        0.06, 0.005);
near('alignment  = |Σ(w·s)|/Σ(w|s|)', coh.alignment,  0.10, 0.005);
// §5.3 defines dispersion as the weighted stdev of s. The mockup prints 0.58
// against the 0.61 that definition yields from its own table; the definition is
// unambiguous, so the definition wins and the mock value is a design round.
near('dispersion = weighted stdev(s)', coh.dispersion, 0.61, 0.01);

console.log('\n— posture and the size link —');
eq('posture is WAIT FOR TRIGGER', coh.posture, 'wait_for_trigger');
// 0.25 + 0.75 × 0.0980 = 0.3235, which is the ×0.32 the mockup displays.
near('size multiplier displays ×0.32 (§5.6)', Number(coh.sizeMultiplier.toFixed(2)), 0.32, 1e-9);
near('size multiplier exact', coh.sizeMultiplier, 0.3235, 0.0005);
eq('dominant family is valuation', coh.dominantFamily, 'valuation');
eq('a non-Act posture must emit a trigger (§5.7)', requiresTrigger(coh.posture), true);

console.log('\n— size reconciliation against the mockup —');
const rec = reconcileSize({ requestedPct: 0.02, requestedNotional: 1957.41, sizeMultiplier: coh.sizeMultiplier, price: 217.49 });
near('coherence-adjusted pct 0.64%', rec.pctOfEquity * 100, 0.65, 0.02);
eq('coherence-adjusted shares = 2', rec.qty, 2);
// The mockup prints 3 shares / $652 against 0.64% of $100,167 = $636, which is
// 2.9 shares at $217.49. It rounds up; the engine floors, because a share count
// you round up is a size you did not agree to.

console.log('\n— the multiplier is a curve, not a switch (§5.6) —');
near('alignment 0.00 → ×0.25', sizeMultiplierFor(0),   0.25, 1e-9);
near('alignment 0.50 → ×0.625', sizeMultiplierFor(0.5), 0.625, 1e-9);
near('alignment 1.00 → ×1.00', sizeMultiplierFor(1),   1.00, 1e-9);

console.log('\n— posture grid (§5.5) —');
eq('high alignment + meaningful net → act',
   derivePosture({ net: 0.5, alignment: 0.8, dispersion: 0.2, side: 'buy' }), 'act');
eq('moderate alignment → scale in',
   derivePosture({ net: 0.3, alignment: 0.45, dispersion: 0.3, side: 'buy' }), 'scale_in');
eq('high dispersion + meaningful net → scale in',
   derivePosture({ net: 0.3, alignment: 0.2, dispersion: 0.7, side: 'buy' }), 'scale_in');
eq('weak conflicted net → wait',
   derivePosture({ net: 0.06, alignment: 0.1, dispersion: 0.6, side: 'buy' }), 'wait_for_trigger');
eq('net opposes the intended side → stand down',
   derivePosture({ net: -0.4, alignment: 0.7, dispersion: 0.2, side: 'buy' }), 'stand_down');
eq('same net on the sell side → act, not stand down',
   derivePosture({ net: -0.4, alignment: 0.7, dispersion: 0.2, side: 'sell' }), 'act');

console.log('\n— conviction vs confidence stay separate (§5.2) —');
// Highly convinced of a weak signal, and weakly convinced of a strong one, must
// not collapse to the same weight.
const weakButAgreed  = computeCoherence([{ code: 'trend', score: 0.15, conviction: 1.0, confidence: 1.0 }], { side: 'buy' });
const strongButAlone = computeCoherence([{ code: 'trend', score: 0.90, conviction: 0.2, confidence: 1.0 }], { side: 'buy' });
near('weak-but-agreed carries full weight', weakButAgreed.families[0].weight, 1.0, 1e-9);
near('strong-but-alone carries little',     strongButAlone.families[0].weight, 0.2, 1e-9);
eq('both are alignment 1 on a single family',
   [weakButAgreed.alignment, strongButAlone.alignment], [1, 1]);

console.log('\n— event proximity suppresses confidence, never direction (§5.2) —');
const withEvent = applySuppression([
    ...NVDA.map((f) => ({ ...f, confidence: 1.0 })),
    { code: 'event', isSuppressor: true, suppression: 0.06, reason: 'earnings in 14 days' },
]);
near('suppression factor 0.94', withEvent.suppressionFactor, 0.94, 1e-9);
near('trend confidence 1.00 → 0.94', withEvent.directional[0].confidence, 0.94, 1e-9);
near('trend score untouched', withEvent.directional[0].score, 0.72, 1e-9);
near('trend conviction untouched', withEvent.directional[0].conviction, 0.81, 1e-9);

console.log('\n— tension statement —');
const full = assessCoherence(NVDA, {
    side: 'buy',
    context: {
        valuationDetail: 'at 274× forward earnings against a five-year median near 41×',
        stretchDetail: "after today's 2.9% fall left price below VWAP",
    },
});
const t = full.tension;
const mustContain = [
    'Trend and flow point long',
    'Valuation is the heaviest single voice in the room and it points the other way',
    '274× forward earnings',
    'momentum trade taken against fundamentals',
    'It says smaller, or later',
];
for (const frag of mustContain) {
    const ok = t.includes(frag);
    if (!ok) { fails++; console.error(`✗ tension contains "${frag}"\n    got: ${t}`); }
    else console.log(`✓ tension contains "${frag}"`);
}
console.log(`\n  → ${t}\n`);

console.log('— degraded input —');
const none = computeCoherence([], { side: 'buy' });
eq('empty vector reports insufficient rather than a confident zero',
   [none.insufficient, none.net, none.posture], [true, null, null]);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
