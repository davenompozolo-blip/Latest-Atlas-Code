// ============================================================
// Nexus COT — Commitments of Traders, pure transforms
// ------------------------------------------------------------
// Side-effect-free, IO-free. The endpoint (/api/nexus-cot) pulls the
// CFTC legacy futures-only report for the markets that drive the book
// and hands the raw weekly rows here; the panel renders the result.
//
//   • net spec position   — non-commercial (large spec) long − short
//   • net spec % of OI     — that net, scaled by open interest
//   • wow change           — week-over-week change in the spec net
//   • 1y percentile        — where this week's net %OI sits in a year
//   • read                 — crowding: extreme positioning is a risk
//                            flag on the correlated holdings
// ============================================================

const n = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Percentile rank (0..100) of `val` within `arr` (nulls ignored).
export function pctRank(arr, val) {
    const xs = (arr || []).filter(x => x != null);
    if (!xs.length || val == null) return null;
    const below = xs.filter(x => x <= val).length;
    return Math.round((below / xs.length) * 100);
}

// net-spec % of OI for one weekly row (null when the row is incomplete).
export function netSpecPctOi(row) {
    const oi = n(row.open_interest_all);
    const l = n(row.noncomm_positions_long_all);
    const s = n(row.noncomm_positions_short_all);
    if (oi == null || oi === 0 || l == null || s == null) return null;
    return ((l - s) / oi) * 100;
}

// One market's history (newest-first) → display row.
export function buildCotMarket(meta, rows) {
    if (!rows || !rows.length) return null;
    const latest = rows[0];
    const specLong = n(latest.noncomm_positions_long_all), specShort = n(latest.noncomm_positions_short_all);
    const commLong = n(latest.comm_positions_long_all), commShort = n(latest.comm_positions_short_all);
    const netSpec = (specLong != null && specShort != null) ? specLong - specShort : null;
    const netComm = (commLong != null && commShort != null) ? commLong - commShort : null;
    const pctOi = netSpecPctOi(latest);
    const wowNet = (n(latest.change_in_noncomm_long_all) != null && n(latest.change_in_noncomm_short_all) != null)
        ? n(latest.change_in_noncomm_long_all) - n(latest.change_in_noncomm_short_all) : null;
    const rank = pctRank(rows.map(netSpecPctOi), pctOi);

    // Crowding read — extreme positioning is a reversal/risk flag on the
    // correlated holdings. Contrarian framing: crowded long = stretched.
    let read = 'Balanced', tone = 'neutral';
    if (rank != null) {
        if (rank >= 85) { read = 'Crowded long'; tone = 'rich'; }
        else if (rank <= 15) { read = 'Crowded short'; tone = 'cheap'; }
        else if (pctOi != null && pctOi > 5) { read = 'Net long'; tone = 'neutral'; }
        else if (pctOi != null && pctOi < -5) { read = 'Net short'; tone = 'neutral'; }
    }
    return {
        code: meta.code,
        market: meta.label,
        exposure: meta.tickers,
        date: String(latest.report_date_as_yyyy_mm_dd || '').slice(0, 10),
        netSpec,
        netSpecPctOi: pctOi == null ? null : +pctOi.toFixed(1),
        netComm,
        wowNet,
        pctRank: rank,
        read,
        tone,
    };
}

// Group raw rows by contract code, newest report first within each.
export function groupByCode(rows) {
    const m = new Map();
    for (const r of rows || []) {
        const c = r.cftc_contract_market_code;
        if (!m.has(c)) m.set(c, []);
        m.get(c).push(r);
    }
    for (const arr of m.values()) {
        arr.sort((a, b) => (String(a.report_date_as_yyyy_mm_dd) < String(b.report_date_as_yyyy_mm_dd) ? 1 : -1));
    }
    return m;
}

// markets meta + grouped rows → display rows (skips markets with no data).
export function buildCotRows(markets, byCode) {
    return (markets || []).map(m => buildCotMarket(m, byCode.get(m.code) || [])).filter(Boolean);
}
