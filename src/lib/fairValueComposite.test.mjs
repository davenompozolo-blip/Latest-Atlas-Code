// Verification fixture for the fair-value composite trim.
// Run: node src/lib/fairValueComposite.test.mjs
//
// Uses the stored per-method implied prices for the brief's named
// cases and asserts the composite behaves per the verification table.

import { computeComposite } from './fairValueComposite.js';

// [implied prices], trustedPrice, expectation
const CASES = [
    // NVDA — $3,607 DCF blowup dropped, blend collapses off +745%
    { tk: 'NVDA', prices: [3606.92, 102.44], price: 219.52, expect: v => v && !v.used.includes(3606.92) },
    // BMY — 388 (TV blowup) and 214 dropped vs $57; +281% gone
    { tk: 'BMY', prices: [388.04, 214.47, 49.19], price: 57.02, expect: v => v && v.blended_fair_value < 120 },
    // GOOGL with the CORRECTED (split-adjusted) price — all three sane methods survive
    { tk: 'GOOGL', prices: [141.71, 158.55, 186.54], price: 170, expect: v => v && v.used.length === 3 },
    // GOOGL with the SUSPECT price — band is anchored wrong, methods get dropped (shows the price fault matters)
    { tk: 'GOOGL(suspect)', prices: [141.71, 158.55, 186.54], price: 380.38, expect: v => v && v.dropped.length > 0 },
    // META — the 30.56 outlier dropped
    { tk: 'META', prices: [244.36, 265.72, 30.56, 345.97], price: 609.845, expect: v => v && !v.used.includes(30.56) },
    // KMI — control: nothing dropped, stays ~+43%
    { tk: 'KMI', prices: [61.36, 42.32, 60.12, 63.67, 21.25, 23.2], price: 30.89, expect: v => v && v.dropped.length === 0 && v.blended_fair_value > 43 && v.blended_fair_value < 47 },
    // ABEV3.SA — all methods broken vs $3.13 → composite is null
    { tk: 'ABEV3.SA', prices: [27.35, 8.15], price: 3.125, expect: v => v === null },
];

let fails = 0;
for (const c of CASES) {
    const v = computeComposite(c.prices, c.price);
    const ok = !!c.expect(v);
    if (!ok) fails++;
    const out = v ? `blend=${v.blended_fair_value} used=[${v.used}] dropped=[${v.dropped}]` : 'null';
    console.log(`${ok ? '✓' : '✗'} ${c.tk.padEnd(15)} ${out}`);
}
console.log(fails ? `\nFAILED — ${fails} case(s)` : '\nPASS — composite trim matches the verification table.');
if (fails) process.exit(1);
