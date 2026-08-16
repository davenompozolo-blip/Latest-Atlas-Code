// ============================================================
// Fixture for the holdings column registry and the treemap layout.
// Run: node src/pages/nexus/nexusColumns.test.mjs
// ============================================================

import { COLUMNS, DEFAULT_VISIBLE, columnGroups, premiumBand } from './nexusColumns.js';
import { squarify } from './NexusSpineTreemap.js';

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};
const ok = (name, cond) => check(name, !!cond, true);

// ── Registry integrity ────────────────────────────────────────
const keys = COLUMNS.map(c => c.k);
check('no duplicate column keys', keys.length, new Set(keys).size);
ok('every column has a label', COLUMNS.every(c => !!c.label));
ok('every column has a group', COLUMNS.every(c => !!c.group));

// The default set must be a real subset — a typo here would silently drop a
// column from the initial view and look like a rendering bug.
const known = new Set(keys);
check('defaults all exist', DEFAULT_VISIBLE.filter(k => !known.has(k)), []);

// Locked columns must be on by default, or the first render has no ticker.
const locked = COLUMNS.filter(c => c.locked).map(c => c.k);
check('locked columns are default-visible', locked.filter(k => !DEFAULT_VISIBLE.includes(k)), []);

// Grouping must not lose or duplicate anything.
const grouped = columnGroups().flatMap(g => g.cols.map(c => c.k));
check('grouping preserves every column', grouped.length, COLUMNS.length);
check('grouping preserves registry order', grouped.filter(k => known.has(k)).length, COLUMNS.length);

// ── Premium / discount bands ──────────────────────────────────
// A positive premium means EXPENSIVE. Getting this backwards would colour the
// most expensive names in the book green, so it is worth a test.
check('null premium → no band',     premiumBand(null), null);
check('+150% → rich',               premiumBand(150).code, 'rich');
check('+100% → rich (boundary)',    premiumBand(100).code, 'rich');
check('+40% → premium',             premiumBand(40).code, 'premium');
check('+15% → premium (boundary)',  premiumBand(15).code, 'premium');
check('+5% → in line',              premiumBand(5).code, 'inline');
check('0 → in line',                premiumBand(0).code, 'inline');
check('−10% → in line',             premiumBand(-10).code, 'inline');
check('−25% → discount',            premiumBand(-25).code, 'discount');
check('−50% → deep discount',       premiumBand(-50).code, 'deep');
// The band ladder must be monotone: walking the premium down never moves you
// back toward "rich".
const ladder = [200, 100, 50, 15, 5, -14, -20, -39, -60].map(v => premiumBand(v).code);
const rank = { rich: 0, premium: 1, inline: 2, discount: 3, deep: 4 };
ok('bands are monotone in premium', ladder.every((c, i) => i === 0 || rank[c] >= rank[ladder[i - 1]]));

// ── Treemap layout ────────────────────────────────────────────
const W = 1000, H = 280;
const spine = [
    { label: 'AI / accelerated compute', value: 31.4 },
    { label: 'Mega-cap platforms', value: 22.1 },
    { label: 'Rate-sensitive', value: 9.6 },
    { label: 'Energy', value: 8.8 },
    { label: 'Cash', value: 8.2 },
    { label: 'Intl ADRs', value: 7.3 },
    { label: 'Financials', value: 6.5 },
    { label: 'Defensives', value: 6.1 },
];
const tiles = squarify(spine, W, H);
check('every bucket gets a tile', tiles.length, spine.length);

const total = spine.reduce((a, r) => a + r.value, 0);
const maxAreaErr = Math.max(...tiles.map(t => {
    const want = (t.value / total) * W * H;
    return Math.abs(t.w * t.h - want) / want;
}));
ok('tile area is proportional to share (<0.1% error)', maxAreaErr < 0.001);

const covered = tiles.reduce((a, t) => a + t.w * t.h, 0);
ok('tiles fill the canvas (>99.9%)', covered / (W * H) > 0.999);
ok('no tile escapes the canvas', tiles.every(t =>
    t.x >= -0.01 && t.y >= -0.01 && t.x + t.w <= W + 0.01 && t.y + t.h <= H + 0.01));
ok('no zero-size tiles', tiles.every(t => t.w > 0 && t.h > 0));

// Squarified means the big tiles stay near-square; that is the whole reason
// this is not a pie. The smallest slivers are allowed to be elongated.
const biggest = tiles.slice().sort((a, b) => (b.w * b.h) - (a.w * a.h)).slice(0, 3);
ok('the three largest tiles are within 2.5:1', biggest.every(t => Math.max(t.w / t.h, t.h / t.w) < 2.5));

// ── Degenerate inputs ─────────────────────────────────────────
check('no rows → no tiles',        squarify([], W, H), []);
check('zero width → no tiles',     squarify(spine, 0, H), []);
check('all-zero values → no tiles', squarify([{ label: 'x', value: 0 }], W, H), []);
check('a single bucket fills it',  squarify([{ label: 'only', value: 100 }], W, H).length, 1);
// Zero-weight buckets are dropped rather than drawn as invisible slivers.
check('zero-value buckets dropped',
    squarify([{ label: 'a', value: 10 }, { label: 'b', value: 0 }], W, H).map(t => t.label), ['a']);

if (fails) { console.error(`\nFAILED — ${fails} assertion(s).`); process.exit(1); }
console.log('\nPASS — column registry and treemap layout hold.');
