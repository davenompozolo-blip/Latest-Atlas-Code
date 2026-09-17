// ============================================================
// ATLAS Nexus — cross-asset read (G-4). Pure, IO-free.
// ------------------------------------------------------------
// The Markets module's heatmap, credit levels and risk barometer, moved
// onto the flagship and made auditable on the way.
//
// THE BAROMETER WAS TWO DIFFERENT THINGS AT ONCE. `macro-markets.js`
// computes one from SPY, TLT and HY spreads; the terminal's top bar in
// `nexus-page.js` rendered the STRING 'RISK-ON', hardcoded, computed from
// nothing and green forever. So the app could show RISK-ON in the chrome
// and NEUTRAL on the Markets page in the same session, and did.
//
// That is the "a gauge carried from the mock looks exactly like a working
// gauge" failure this codebase already recorded once, in a second place.
// One computation now, here, published with its parts.
//
// IT IS A HEURISTIC AND IS LABELLED ONE. Three signs averaged against a
// ±0.3 band is not a measured regime — B0's factor betas and E3's
// regime-conditional covariance are the measured ones, and they live a
// long way from a three-quote average. The barometer is the CHEAP signal:
// useful because it is instant, and worth nothing if it is mistaken for
// the expensive one. `basis: 'heuristic'` travels on the reading so a
// surface cannot render it without saying what it is.
// ============================================================

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export const RISK_BAND = 0.3;

// ── Barometer ────────────────────────────────────────────────
// Ported from `computeRiskSignal` with the same inputs, the same weights
// and the same band, so the number does not move — what changes is that
// every component is published rather than summed behind a label.
export function riskBarometer(market, credit) {
    const find = s => (market || []).find(q => q && q.symbol === s) || null;
    const components = [];

    const spy = find('SPY');
    const spyMove = spy ? num(spy.changePct) : null;
    if (spyMove != null) {
        components.push({
            key: 'spy', label: 'SPY',
            reading: spyMove,
            contribution: spyMove > 0 ? 1 : -1,
            says: spyMove > 0 ? 'equities bid' : 'equities offered',
        });
    }

    // Inverse by design: a bid for duration is a flight to safety, so a
    // rising TLT pushes the reading toward risk-off.
    const tlt = find('TLT');
    const tltMove = tlt ? num(tlt.changePct) : null;
    if (tltMove != null) {
        components.push({
            key: 'tlt', label: 'TLT',
            reading: tltMove,
            contribution: tltMove > 0 ? -0.5 : 0.5,
            says: tltMove > 0 ? 'duration bid — flight to safety' : 'duration offered',
        });
    }

    const hySeries = credit && credit.hySpreads;
    const hy = hySeries && hySeries.length ? num(hySeries[hySeries.length - 1].value) : null;
    if (hy != null) {
        components.push({
            key: 'hy', label: 'HY OAS',
            reading: hy,
            contribution: hy > 5 ? -1 : hy > 4 ? -0.5 : 0.5,
            says: hy > 5 ? 'spreads stressed' : hy > 4 ? 'spreads widening' : 'spreads contained',
        });
    }

    // No components is UNKNOWN, never a default label. A barometer that
    // reads RISK-ON when it has been handed nothing is the exact defect
    // this module exists to close.
    if (!components.length) {
        return { label: 'UNKNOWN', tone: 'flat', score: null, components: [], basis: 'heuristic', measured: 0 };
    }

    const score = components.reduce((s, c) => s + c.contribution, 0) / components.length;
    const label = score > RISK_BAND ? 'RISK-ON' : score < -RISK_BAND ? 'RISK-OFF' : 'NEUTRAL';
    return {
        label,
        tone: label === 'RISK-ON' ? 'up' : label === 'RISK-OFF' ? 'down' : 'flat',
        score,
        components,
        basis: 'heuristic',
        measured: components.length,
        // Three inputs and one of them missing is a different reading from
        // three inputs all present, and the surface has to be able to say so.
        partial: components.length < 3,
    };
}

// ── Heatmap ──────────────────────────────────────────────────
// Cells keep the registry's class grouping. Intensity is capped at 3%
// because beyond that the scale stops discriminating — a 9% day and a 3%
// day would render identically anyway, and the cap makes that explicit
// rather than emergent.
export const HEAT_CAP_PCT = 3;

export function heatIntensity(pct) {
    if (pct == null) return null;
    return Math.min(Math.abs(pct) / HEAT_CAP_PCT, 1);
}

export function heatmapRows(market, classes) {
    const bySym = new Map((market || [])
        .filter(q => q && q.symbol && num(q.changePct) != null)
        .map(q => [q.symbol, num(q.changePct)]));
    const rows = [];
    const withheld = [];
    for (const cls of classes || []) {
        const cells = [];
        for (const sym of cls.symbols) {
            const move = bySym.has(sym) ? bySym.get(sym) : null;
            // A symbol with no quote is an ABSENT cell, not a grey zero:
            // a heatmap renders every cell as a measurement and a blank
            // that looks like "flat" is the worst available outcome.
            if (move == null) { withheld.push(sym); continue; }
            cells.push({ symbol: sym, move, intensity: heatIntensity(move), proxiesFor: cls.proxies[sym] || null });
        }
        if (cells.length) rows.push({ key: cls.key, label: cls.label, cells });
    }
    return { rows, withheld: withheld.sort() };
}

// ── Credit ───────────────────────────────────────────────────
// The levels the barometer's third component reads, published beside it
// so the reading can be checked rather than trusted.
export function creditLevels(credit) {
    const last = arr => (arr && arr.length ? num(arr[arr.length - 1].value) : null);
    const hy = last(credit && credit.hySpreads);
    const ig = last(credit && credit.igSpreads);
    const nfci = last(credit && credit.nfci);
    return {
        hy, ig, nfci,
        hySays: hy == null ? null : hy > 5 ? 'stressed' : hy > 4 ? 'widening' : 'contained',
        // A NEGATIVE NFCI is LOOSE. The sign is counter-intuitive and a
        // panel that prints the number without the direction invites the
        // reader to get it exactly backwards.
        nfciSays: nfci == null ? null : nfci < 0 ? 'loose financial conditions' : 'tight financial conditions',
        measured: [hy, ig, nfci].filter(v => v != null).length,
    };
}
