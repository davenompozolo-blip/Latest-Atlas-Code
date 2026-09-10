// ============================================================
// ATLAS Nexus — pair explorer transforms (A2.2). Pure, IO-free.
// ------------------------------------------------------------
// The analytical point this module exists to serve: A RATIO MOVING TELLS
// YOU THE SPREAD MOVED, NOT WHY. XLI/XLU rising because industrials
// rallied is risk appetite; the same ratio rising because utilities sold
// off is a rates move hitting bond proxies. Opposite meanings, identical
// ratio line. Only the legs — and both legs against SPY — separate them.
//
// There is NO pair-to-axis map in this file. Grouping is derived from
// factor_axis_loadings, which is the object A1 produced and the only one
// entitled to say which axis a pair belongs to. `ratio_pairs.dimension`
// carried a parallel classification that A1 contradicted on three pairs;
// it is deprecated and is deliberately not read here.
// ============================================================

// ── Axis assignment ──────────────────────────────────────────
// EVERY pair loads on ALL THREE axes — the loadings are a dense matrix,
// not a partition. So "the pair's axis" has to mean something, and the
// only defensible reading is the axis it loads on most strongly by
// magnitude. The sign is carried separately and is never dropped: RSP/SPY
// loads −0.47 on concentration, and a reader shown a rising RSP/SPY line
// beside a positive concentration score without that minus sign would
// conclude the panel contradicts itself.
//
// `runnerUp` is published because the assignment is not always
// comfortable: on the live matrix HYG/TLT sits at 0.3712 on dollar and
// 0.3677 on cyclical — a 1% margin. A surface that shows only the winner
// there is asserting more than the data supports, so the caller is given
// what it needs to say so.
export const NEAR_TIE_RATIO = 0.15;   // runner-up within 15% of the winner

export function assignAxis(loadingRows) {
    const rows = (loadingRows || [])
        .filter(r => r && r.axis_key && r.loading != null && Number.isFinite(Number(r.loading)))
        .map(r => ({ axisKey: r.axis_key, loading: Number(r.loading) }))
        .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading));

    if (!rows.length) {
        // CPER/GLD has no loading on any axis. It renders as unassigned —
        // never blank, and never quietly filed under one of the three.
        return {
            axisKey: null,
            loading: null,
            unassigned: true,
            reason: 'unassigned — loads below the noise threshold',
            all: [],
            nearTie: false,
            runnerUp: null,
        };
    }

    const top = rows[0];
    const second = rows[1] || null;
    const nearTie = !!second && Math.abs(top.loading) > 0
        && (Math.abs(top.loading) - Math.abs(second.loading)) / Math.abs(top.loading) < NEAR_TIE_RATIO;

    return {
        axisKey: top.axisKey,
        loading: top.loading,
        unassigned: false,
        reason: null,
        all: rows,
        nearTie,
        runnerUp: second,
    };
}

// Group pairs under their dominant axis, ordered by the axes' own pc_rank
// so the panel and the explorer agree on ordering without either knowing
// the axis names.
export function groupPairsByAxis({ pairs, loadings, axes }) {
    const byPair = {};
    for (const l of loadings || []) (byPair[l.pair_key] = byPair[l.pair_key] || []).push(l);

    const axisMeta = {};
    for (const a of axes || []) axisMeta[a.axis_key] = a;

    const enriched = (pairs || []).map(p => ({
        pairKey: p.pair_key,
        numerator: p.numerator_symbol,
        denominator: p.denominator_symbol,
        label: (p.numerator_symbol || '?') + '/' + (p.denominator_symbol || '?'),
        measures: p.thesis || null,
        caveats: p.caveats || null,
        axis: assignAxis(byPair[p.pair_key]),
    }));

    const groups = [];
    const ordered = (axes || []).slice().sort((a, b) => Number(a.pc_rank) - Number(b.pc_rank));
    for (const a of ordered) {
        const members = enriched.filter(e => e.axis.axisKey === a.axis_key);
        if (members.length) {
            groups.push({
                axisKey: a.axis_key,
                label: a.label || a.axis_key,
                positiveMeans: a.positive_means || null,
                marginal: a.marginal === true,
                pairs: members.sort((x, y) => Math.abs(y.axis.loading) - Math.abs(x.axis.loading)),
            });
        }
    }
    const orphans = enriched.filter(e => e.axis.unassigned || !axisMeta[e.axis.axisKey]);
    if (orphans.length) {
        groups.push({
            axisKey: null, label: 'unassigned', positiveMeans: null, marginal: false,
            pairs: orphans,
        });
    }
    return groups;
}

// ── Series ───────────────────────────────────────────────────
// Alignment first, always. The legs and SPY are three independent series
// and a missing bar in any one of them makes that session uncomparable.
// Rebasing an unaligned window silently shifts one line against the
// others, which is a fabricated divergence on a chart whose entire job is
// to show divergence.
export function alignedWindow({ bySymbol, numerator, denominator, benchmark, sessions }) {
    const n = bySymbol[numerator] || {};
    const d = bySymbol[denominator] || {};
    const b = bySymbol[benchmark] || {};
    const dates = Object.keys(n)
        .filter(dt => d[dt] != null && b[dt] != null && n[dt] != null)
        .sort();
    const win = sessions > 0 ? dates.slice(-sessions) : dates;
    return {
        dates: win,
        num: win.map(dt => Number(n[dt])),
        den: win.map(dt => Number(d[dt])),
        bench: win.map(dt => Number(b[dt])),
        // Published so a short window is legible as a short window rather
        // than read as a full one.
        requestedSessions: sessions,
        actualSessions: win.length,
        truncated: win.length < sessions,
    };
}

const rebase = arr => (arr && arr.length && arr[0] ? arr.map(v => (v / arr[0]) * 100) : []);
const retPct = arr => (arr && arr.length > 1 && arr[0] ? (arr[arr.length - 1] / arr[0] - 1) * 100 : null);

export function buildSeries(win) {
    if (!win || win.length === 0) return null;
    const { num, den, bench, dates } = win;
    if (!num.length || !den.length || !bench.length) return null;
    // The ratio is rebased from the raw legs. Dividing the rebased legs
    // gives the identical curve — (n_t/n_0)/(d_t/d_0) — so either is
    // correct; this way is one fewer place for a zero to divide.
    const raw = num.map((v, i) => (den[i] ? v / den[i] : null));
    return {
        dates,
        numRebased: rebase(num),
        denRebased: rebase(den),
        benchRebased: rebase(bench),
        ratioRebased: rebase(raw),
        returns: {
            ratio: retPct(raw),
            num: retPct(num),
            den: retPct(den),
            bench: retPct(bench),
        },
    };
}

// ── Metrics (§3.4) ───────────────────────────────────────────
// Five tiles: the ratio, each leg, and each leg NET OF SPY. The last two
// are what make the read possible at all.
export function metricTiles(series, pair, benchmark = 'SPY') {
    if (!series) return [];
    const r = series.returns;
    const netNum = r.num == null || r.bench == null ? null : r.num - r.bench;
    const netDen = r.den == null || r.bench == null ? null : r.den - r.bench;
    const tiles = [
        { key: 'ratio', label: 'ratio', value: r.ratio, tone: true },
        { key: 'num', label: pair.numerator, value: r.num, tone: false },
        { key: 'den', label: pair.denominator, value: r.den, tone: false },
        { key: 'numNet', label: pair.numerator + ' vs ' + benchmark, value: netNum, tone: true },
        { key: 'denNet', label: pair.denominator + ' vs ' + benchmark, value: netDen, tone: true },
    ];
    // SEVEN OF THE TWELVE PAIRS HAVE SPY AS A LEG. "SPY vs SPY" is exactly
    // 0.0% by construction -- true, and vacuous. A tile that can only ever
    // read zero teaches nothing and invites a reader to look for meaning in
    // it, so it is dropped rather than rendered. §3.4's fifth tile survives
    // wherever it carries information.
    return tiles.filter(t => !(
        (t.key === 'numNet' && pair.numerator === benchmark) ||
        (t.key === 'denNet' && pair.denominator === benchmark)));
}

// ── The read (§3.5) ──────────────────────────────────────────
// Generated from the numbers, never authored. Three components, and the
// third is the one a ratio-only view hides entirely.
export function pairRead(series, pair, axisMeta, benchmark = 'SPY') {
    if (!series || series.returns.ratio == null) {
        return { sentences: [], derivation: null, marketRelation: null, unavailable: true };
    }
    const r = series.returns;
    const f = v => Math.abs(v).toFixed(1) + '%';
    const sentences = [];

    // 1. Direction and magnitude.
    const dir = r.ratio > 0 ? 'risen' : r.ratio < 0 ? 'fallen' : 'not moved';
    sentences.push(
        pair.label + ' has ' + dir + (r.ratio === 0 ? '' : ' ' + f(r.ratio))
        + ' over ' + series.dates.length + ' sessions.');

    // 2. Which leg drove it — the §1 distinction. A ratio rising on
    //    numerator strength and one rising on denominator weakness are
    //    different market states behind an identical line.
    const drovNum = Math.abs(r.num) >= Math.abs(r.den);
    const driver = drovNum ? pair.numerator : pair.denominator;
    const driverRet = drovNum ? r.num : r.den;
    const otherRet = drovNum ? r.den : r.num;
    const other = drovNum ? pair.denominator : pair.numerator;
    sentences.push(
        'It is driven mainly by ' + (driverRet >= 0 ? 'strength in ' : 'weakness in ') + driver
        + ', which moved ' + (driverRet >= 0 ? '+' : '−') + f(driverRet)
        + ' against ' + (otherRet >= 0 ? '+' : '−') + f(otherRet) + ' on ' + other + '.');

    // 3. Whether it is real, from the legs net of the benchmark.
    //
    // FIRST: if the benchmark IS one of the legs -- true for seven of the
    // twelve pairs, every `X/SPY` -- the three-case comparison degenerates.
    // Its own net return is 0 by construction, and the branch below would
    // emit "Only SPY is beating SPY". The ratio in that case ALREADY is the
    // other leg measured against the market, which is worth saying plainly
    // instead.
    const benchIsNum = pair.numerator === benchmark;
    const benchIsDen = pair.denominator === benchmark;
    if (benchIsNum || benchIsDen) {
        const other = benchIsNum ? pair.denominator : pair.numerator;
        const otherNet = (benchIsNum ? r.den : r.num) - r.bench;
        sentences.push(
            benchmark + ' is one leg, so this ratio already measures ' + other
            + ' against the market: ' + other + ' '
            + (otherNet >= 0 ? 'led it by ' : 'lagged it by ') + f(otherNet) + '.');
        return {
            sentences,
            marketRelation: 'benchmark_is_leg',
            derivation: derivationLine(axisMeta, series, benchmark, true),
            unavailable: false,
        };
    }

    const netNum = r.num - r.bench;
    const netDen = r.den - r.bench;
    const nB = netNum >= 0, dB = netDen >= 0;
    let marketRelation;
    if (nB && dB) {
        marketRelation = 'rotation_in_rising_market';
        sentences.push('Both legs are beating ' + benchmark + ', so this is rotation inside a rising market rather than a defensive shift.');
    } else if (!nB && !dB) {
        marketRelation = 'sorting_losers';
        sentences.push('Both legs are lagging ' + benchmark + ', so the ratio is sorting losers — treat the signal with care.');
    } else {
        marketRelation = 'genuine_relative';
        sentences.push('Only ' + (nB ? pair.numerator : pair.denominator)
            + ' is beating ' + benchmark + ', so the spread carries genuine relative information.');
    }

    return {
        sentences,
        marketRelation,
        derivation: derivationLine(axisMeta, series, benchmark, false),
        unavailable: false,
    };
}

function derivationLine(axisMeta, series, benchmark, benchIsLeg) {
    const load = axisMeta && !axisMeta.unassigned && axisMeta.loading != null
        ? 'loads ' + (axisMeta.loading >= 0 ? '+' : '−') + Math.abs(axisMeta.loading).toFixed(2)
          + ' on ' + axisMeta.axisKey
        : 'no axis loading';
    const basis = benchIsLeg
        ? benchmark + ' is a leg, so the ratio is the net-of-market figure'
        : 'leg returns net of ' + benchmark;
    return load + ' · ' + basis + ' · ' + series.dates.length + ' sessions';
}
