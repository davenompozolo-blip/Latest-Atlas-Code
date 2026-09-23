/**
 * ONE PALETTE FOR THE EQUITY RESEARCH MODULE.
 *
 * Five files each carried their own `var T = {...}` and no two agreed:
 *
 *   file                       green      red        text       muted2
 *   equity-research-panels     #41d18a    #f76d6d    #e7eef5    #5a6573
 *   equity-background-tab      #22c55e    -          #e6edf5    #63748c
 *   equity-financials-tab      #22c55e    #ef4444    #e6edf5    #63748c
 *   equity-valuation-tab       #22c55e    #ef4444    #e6edf5    #63748c
 *   equity-technicals          #22c55e    #ef4444    rgba(255,255,255,.88)
 *
 * and `equity-research.js` carried no palette at all, only literals -- among
 * them a FOURTH ACCENT, #00d4b8, which exists in no ramp in this repo. The
 * shell unification records the same shape one layer out: "The chrome carried
 * two accents at once." This module had three, plus #3b82f6 in technicals.
 *
 * The values below are the `:root` ramp in src/styles/globals.css, which is
 * itself `.nexus-flagship`'s ramp -- that unification already happened and the
 * Equity Research module simply never moved onto it. So this is not a new
 * scheme; it is the module joining the one that exists.
 *
 * RAW HEX, NOT `var(--token)`, AND THAT IS DELIBERATE. `cyan` reaches Chart.js
 * as `borderColor` (equity-technicals.js:148, :232), and a canvas cannot
 * resolve a CSS custom property -- it would paint nothing and report no error.
 * The cost of raw hex is that these values can drift from globals.css, so
 * `src/lib/equityTheme.test.mjs` parses that file and asserts every one of
 * them still matches. "Move them together" is a CI gate here, not a comment.
 *
 * NOTE THE NAME TRAP: `--border` is rgba(255,255,255,0.11) in globals.css and
 * rgba(255,255,255,0.07) in nexus-flagship.css -- the same name, the two
 * alpha steps swapped between the files. Convert on VALUES, never on names.
 */

/** Token name in globals.css `:root` -> the value this module mirrors. */
export const RAMP = {
    '--navy':         '#080b0e',
    '--navy-1':       '#0d1117',
    '--navy-2':       '#121821',
    '--navy-3':       '#171f2a',
    '--navy-4':       '#1d2734',
    '--teal':         '#22d3ee',
    '--gold':         '#f5a623',
    '--green':        '#22c55e',
    '--red':          '#ef4444',
    '--purple':       '#8b5cf6',
    '--text-1':       '#e3e9f2',
    '--text-2':       '#8aa0bb',
    '--text-3':       '#51647b',
    '--border':       'rgba(255, 255, 255, 0.11)',
    '--border-2':     'rgba(255, 255, 255, 0.07)',
    '--font-mono':    "'JetBrains Mono', monospace",
    '--font-display': "'Syne', sans-serif",
};

/**
 * The tinted background behind a coloured chip.
 *
 * DERIVED, never typed. The five palettes carried dim variants at .09, .13 and
 * .15 for no stated reason, and a hand-typed rgba() can drift from the colour
 * it is supposed to be a wash of -- silently, because it still renders. One
 * alpha, applied by one function, makes that impossible rather than merely
 * discouraged. 0.13 is `.nexus-flagship`'s own `-b` step and is what three of
 * the five already used; violetDim moves .09 -> .13, which is a real and
 * intended change.
 */
export const DIM_ALPHA = 0.13;

export function dim(hex, alpha) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const a = alpha == null ? DIM_ALPHA : alpha;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

const cyan = RAMP['--teal'];
const amber = RAMP['--gold'];
const green = RAMP['--green'];
const red = RAMP['--red'];
const violet = RAMP['--purple'];

export const T = {
    // Surfaces. The old palettes used rgba(17,23,31,.97) and rgba(20,27,37,.97);
    // translucency earned its place only where a rule pairs it with
    // backdrop-filter, and none of these panels do, so they take the ramp's
    // opaque steps.
    bg: RAMP['--navy'],
    bg1: RAMP['--navy-1'],
    card: RAMP['--navy-2'],
    card2: RAMP['--navy-3'],
    cardHi: RAMP['--navy-4'],

    border: RAMP['--border-2'],
    border2: RAMP['--border'],

    text: RAMP['--text-1'],
    muted: RAMP['--text-2'],
    muted2: RAMP['--text-3'],

    cyan: cyan,
    amber: amber,
    green: green,
    red: red,
    violet: violet,

    cyanDim: dim(cyan),
    amberDim: dim(amber),
    greenDim: dim(green),
    redDim: dim(red),
    violetDim: dim(violet),

    mono: RAMP['--font-mono'],
    display: RAMP['--font-display'],
};

export default T;
