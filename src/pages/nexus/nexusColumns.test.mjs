// ============================================================
// Fixture for the holdings column registry and the treemap layout.
// Run: node src/pages/nexus/nexusColumns.test.mjs
// ============================================================

import { COLUMNS, DEFAULT_VISIBLE, columnGroups, premiumBand } from './nexusColumns.js';
import { squarify, moveFill, CLIP_PCT } from './NexusSpineTreemap.js';

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

// ── Treemap colour ramp ───────────────────────────────────────
// Matched to the NAME IMPACT heatmap. Three properties carry the design:
const rgbaOf = (s) => s.match(/[\d.]+/g).map(Number);

// 1. A dead zone at zero, so a bucket that barely moved reads as neutral
//    ground rather than faint green. Without it every tile is tinted.
check('zero move is slate',        rgbaOf(moveFill(0)).slice(0, 3), [15, 23, 42]);
check('tiny +move still slate',    rgbaOf(moveFill(0.05)).slice(0, 3), [15, 23, 42]);
check('tiny -move still slate',    rgbaOf(moveFill(-0.05)).slice(0, 3), [15, 23, 42]);

// 2. Direction is never ambiguous: up is green, down is red.
ok('a strong gain is green', (() => { const c = rgbaOf(moveFill(CLIP_PCT)); return c[1] > c[0]; })());
ok('a strong loss is red',   (() => { const c = rgbaOf(moveFill(-CLIP_PCT)); return c[0] > c[1]; })());

// 3. Clipping is saturating, not wrapping — a bucket past the ramp must not
//    come back round and read as the opposite sign.
check('beyond +clip is pinned', moveFill(CLIP_PCT * 12), moveFill(CLIP_PCT));
check('beyond -clip is pinned', moveFill(-CLIP_PCT * 12), moveFill(-CLIP_PCT));
check('missing move is neutral', moveFill(null), 'rgba(15,23,42,0.55)');
check('NaN move is neutral',     moveFill(NaN), 'rgba(15,23,42,0.55)');

// 4. Dominance grows with magnitude. The green channel alone is NOT monotone
//    across the ramp — deep red (28) carries more green than slate (23) — so
//    the property that actually holds is that the winning channel's lead over
//    the other widens as the move gets bigger.
const lead = (v) => { const c = rgbaOf(moveFill(v)); return v < 0 ? c[0] - c[1] : c[1] - c[0]; };
const losses = [-0.5, -1.5, -CLIP_PCT].map(lead);
const gains = [0.5, 1.5, CLIP_PCT].map(lead);
ok('red lead widens as losses deepen', losses.every((d, i) => i === 0 || d > losses[i - 1]));
ok('green lead widens as gains build', gains.every((d, i) => i === 0 || d > gains[i - 1]));
ok('every non-zero move picks a side', [...losses, ...gains].every((d) => d > 0));

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
