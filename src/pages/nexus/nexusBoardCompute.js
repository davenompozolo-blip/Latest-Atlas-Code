// ============================================================
// Nexus Macro & Breadth board — pure transforms
// ------------------------------------------------------------
// Side-effect-free, IO-free. The endpoint (/api/nexus-board) and
// the React panels both lean on these so the maths is unit-testable
// under plain node and the charts stay dumb.
//
//   • closeSeriesFromAlpaca  — Alpaca daily payload → [{t,c}]
//   • ratioSeries            — EW/CW breadth, rebased to 100
//   • lastChange             — latest close + day %change
//   • computeFearGreed       — transparent 0–100 composite + parts
//   • eventMarkers           — FOMC / CPI / NFP calendar in a window
// ============================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = v => Math.round(v * 10) / 10;

// Map x in [a,b] onto [0,100] (or reversed when a>b). Clamped.
function scale01(x, a, b) {
    if (a === b) return 50;
    return clamp(((x - a) / (b - a)) * 100, 0, 100);
}

// ── Alpaca daily payload → ascending [{t:'YYYY-MM-DD', c:Number}] ──
export function closeSeriesFromAlpaca(daily) {
    const ts = daily && daily['Time Series (Daily)'];
    if (!ts) return [];
    const out = [];
    for (const date in ts) {
        const c = Number(ts[date]['4. close']);
        if (!Number.isNaN(c)) out.push({ t: date, c });
    }
    out.sort((a, b) => (a.t < b.t ? -1 : 1));
    return out;
}

// ── Breadth ratio (equal-weight / cap-weight), rebased to 100 ─────
// Aligns two close series on common dates and returns the ratio
// indexed to 100 at the first common date — a rising line = the
// equal-weight index is outperforming = broadening participation.
export function ratioSeries(ewSeries, cwSeries) {
    const cw = new Map((cwSeries || []).map(p => [p.t, p.c]));
    const common = [];
    for (const p of ewSeries || []) {
        const d = cw.get(p.t);
        if (d != null && d > 0 && p.c > 0) common.push({ t: p.t, r: p.c / d });
    }
    if (!common.length) return [];
    const base = common[0].r;
    return common.map(p => ({ t: p.t, v: round1((p.r / base) * 100) }));
}

// Latest close + day-over-day % change.
export function lastChange(series) {
    if (!series || series.length === 0) return { last: null, changePct: null };
    const last = series[series.length - 1].c;
    const prev = series.length > 1 ? series[series.length - 2].c : null;
    return { last, changePct: prev ? round1(((last - prev) / prev) * 100) : null };
}

// Trailing return over n trading days.
function retN(series, n) {
    if (!series || series.length <= n) return null;
    const a = series[series.length - 1 - n].c, b = series[series.length - 1].c;
    return a > 0 ? b / a - 1 : null;
}
// Simple moving average of the last n closes.
function sma(series, n) {
    if (!series || series.length < n) return null;
    let s = 0;
    for (let i = series.length - n; i < series.length; i++) s += series[i].c;
    return s / n;
}

// ── Fear & Greed — transparent composite (0 fear … 100 greed) ─────
// Each component is scored 0–100 from data we already pull; the
// headline is their average over whatever is available. Showing the
// parts is the point — no black-box dial.
//
// inputs: { vix:[{t,v}], spy:[{t,c}], tlt:[{t,c}], hySpreadPct:Number, breadth:[{t,v}] }
export function computeFearGreed(inputs = {}) {
    const parts = [];

    // 1. Volatility — low VIX = greed. 12→greed, 34→fear.
    const vix = inputs.vix && inputs.vix.length ? inputs.vix[inputs.vix.length - 1].v : null;
    if (vix != null) parts.push({ name: 'Volatility', value: round1(vix) + ' VIX', score: Math.round(scale01(vix, 34, 12)) });

    // 2. Momentum — S&P vs its 125-day average. Above = greed.
    const ma = sma(inputs.spy, 125);
    const spyLast = inputs.spy && inputs.spy.length ? inputs.spy[inputs.spy.length - 1].c : null;
    if (ma && spyLast) {
        const gap = spyLast / ma - 1; // e.g. +0.05 = 5% above trend
        parts.push({ name: 'Momentum', value: (gap >= 0 ? '+' : '') + Math.round(gap * 1000) / 10 + '% vs 125d', score: Math.round(scale01(gap, -0.08, 0.08)) });
    }

    // 3. Safe-haven demand — stocks vs bonds, 20d. Stocks winning = greed.
    const spyR = retN(inputs.spy, 20), tltR = retN(inputs.tlt, 20);
    if (spyR != null && tltR != null) {
        const spread = spyR - tltR;
        parts.push({ name: 'Safe haven', value: (spread >= 0 ? '+' : '') + Math.round(spread * 1000) / 10 + '% SPY−TLT 20d', score: Math.round(scale01(spread, -0.06, 0.06)) });
    }

    // 4. Junk-bond demand — HY spread. Tight = greed (risk appetite).
    if (inputs.hySpreadPct != null) {
        parts.push({ name: 'Credit', value: round1(inputs.hySpreadPct) + '% HY OAS', score: Math.round(scale01(inputs.hySpreadPct, 6, 2.5)) });
    }

    // 5. Breadth — RSP/SPY trend over 20d. Broadening = greed.
    if (inputs.breadth && inputs.breadth.length > 20) {
        const b = inputs.breadth, t = b[b.length - 1].v / b[b.length - 21].v - 1;
        parts.push({ name: 'Breadth', value: (t >= 0 ? '+' : '') + Math.round(t * 1000) / 10 + '% RSP/SPY 20d', score: Math.round(scale01(t, -0.03, 0.03)) });
    }

    if (!parts.length) return null;
    const score = Math.round(parts.reduce((s, p) => s + p.score, 0) / parts.length);
    return { score, label: fgLabel(score), parts };
}

export function fgLabel(score) {
    if (score < 25) return 'Extreme Fear';
    if (score < 45) return 'Fear';
    if (score <= 55) return 'Neutral';
    if (score <= 75) return 'Greed';
    return 'Extreme Greed';
}

// ── Event calendar — FOMC / CPI / NFP within [from,to] ───────────
// FOMC decision days and CPI release days are published schedules
// (hardcoded, 2025–26). NFP is the first Friday of each month, so we
// compute it. Returns ascending [{time:'YYYY-MM-DD', kind, label}].
const FOMC_DAYS = [
    '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
    '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];
const CPI_DAYS = [
    '2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11', '2025-07-15', '2025-08-12',
    '2025-09-11', '2025-10-15', '2025-11-13', '2025-12-10',
    '2026-01-13', '2026-02-11', '2026-03-11', '2026-04-10', '2026-05-13', '2026-06-10', '2026-07-14', '2026-08-12',
    '2026-09-11', '2026-10-13', '2026-11-12', '2026-12-10',
];

// First Friday of each month between from..to (the jobs report).
function nfpDays(from, to) {
    const out = [];
    const start = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (d <= end) {
        const first = new Date(d);
        // day 5 = Friday; offset to first Friday
        const off = (5 - first.getUTCDay() + 7) % 7;
        first.setUTCDate(1 + off);
        const iso = first.toISOString().slice(0, 10);
        if (iso >= from && iso <= to) out.push(iso);
        d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
}

export function eventMarkers(from, to) {
    const within = d => d >= from && d <= to;
    const ev = [];
    FOMC_DAYS.filter(within).forEach(t => ev.push({ time: t, kind: 'FOMC', label: 'FOMC' }));
    CPI_DAYS.filter(within).forEach(t => ev.push({ time: t, kind: 'CPI', label: 'CPI' }));
    nfpDays(from, to).forEach(t => ev.push({ time: t, kind: 'NFP', label: 'Jobs' }));
    ev.sort((a, b) => (a.time < b.time ? -1 : 1));
    return ev;
}
