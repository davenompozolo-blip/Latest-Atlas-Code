// ============================================================
// ATLAS Terminal — Shared Utilities
// ------------------------------------------------------------
// Formatters, CSS class helpers, portfolio column config, quant
// helpers (corrBg, rsiFillStyle, returnChip), schema detection,
// and the Chart.js wrapper hook.
//
// Consumes globals:  React, Chart (UMD)
// ============================================================

const { useEffect, useRef } = React;

// --- Formatters ---
export function fmt(n, d = 2) { return n != null ? Number(n).toFixed(d) : '\u2014'; }
export function fmtPct(n) { return n != null ? (Number(n) * 100).toFixed(2) + '%' : '\u2014'; }
export function fmtCurrency(n) {
    if (n == null) return '\u2014';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function cls(val) { return val > 0 ? 'positive' : val < 0 ? 'negative' : ''; }

// --- Hero card status helpers ---
export function heroBadgeCls(s) {
    if (!s) return '';
    const l = s.toLowerCase();
    if (['excellent','strong','low','low vol'].includes(l)) return 'b-excellent';
    if (['good','positive'].includes(l)) return 'b-good';
    if (['fair','moderate','elevated','weak'].includes(l)) return 'b-fair';
    if (['poor','negative','severe','high','high vol'].includes(l)) return 'b-poor';
    return 'b-good';
}
export function sharpeStatus(v) {
    if (v == null) return '';
    if (v > 1.5) return 'Excellent';
    if (v > 1.0) return 'Good';
    if (v > 0.5) return 'Fair';
    return 'Poor';
}
export function volStatus(v) {
    if (v == null) return '';
    if (v < 0.12) return 'Low Vol';
    if (v < 0.20) return 'Moderate';
    if (v < 0.30) return 'Elevated';
    return 'High Vol';
}
export function returnStatus(v) {
    if (v == null) return '';
    if (v > 0.15) return 'Strong';
    if (v > 0)    return 'Positive';
    if (v > -0.10) return 'Weak';
    return 'Negative';
}
export function ddStatus(v) {
    if (v == null) return '';
    const abs = Math.abs(v);
    if (abs < 0.10) return 'Low';
    if (abs < 0.20) return 'Moderate';
    return 'Severe';
}
export function calmarStatus(v) {
    if (v == null) return '';
    if (v > 1.5) return 'Excellent';
    if (v > 0.5) return 'Good';
    if (v > 0)   return 'Fair';
    return 'Poor';
}

export function badgeCls(tier) {
    const t = (tier || '').toLowerCase();
    if (t.includes('high') || t.includes('downtrend') || t.includes('overbought') || t.includes('needs')) return 'red';
    if (t.includes('moderate') || t.includes('sideways') || t.includes('amber') || t.includes('expanding')) return 'amber';
    if (t.includes('low') || t.includes('uptrend') || t.includes('oversold') || t.includes('strong') || t.includes('compressing')) return 'green';
    return 'blue';
}
export function healthCls(score) { return score >= 75 ? 'strong' : score >= 50 ? 'moderate' : 'weak'; }

// --- Portfolio Column Config ---
export const DEFAULT_COLS = ['symbol','name','quantity','current_price','market_value','daily_change_pct','return_5d_pct','weight_equity_pct','weight_gross_pct','total_gain_loss_dollar','unrealised_return_pct','quality_score'];
export const ALL_COLS = [
    { key: 'symbol', label: 'Ticker' },
    { key: 'name', label: 'Asset Name' },
    { key: 'side', label: 'Side' },
    { key: 'quantity', label: 'Shares' },
    { key: 'cost_basis', label: 'Avg Cost' },
    { key: 'current_price', label: 'Price' },
    { key: 'market_value', label: 'Total Value' },
    { key: 'daily_change_pct', label: 'Daily Chg %' },
    { key: 'return_5d_pct', label: '5D Return' },
    { key: 'weight_equity_pct', label: 'Wt% Equity' },
    { key: 'weight_gross_pct', label: 'Wt% Gross' },
    { key: 'total_gain_loss_dollar', label: 'Gain/Loss $' },
    { key: 'unrealised_return_pct', label: 'Gain/Loss %' },
    { key: 'quality_score', label: 'Quality' },
    { key: 'annualised_vol', label: 'Ann. Vol' },
    { key: 'sharpe_approx', label: 'Sharpe' },
    { key: 'asset_class', label: 'Class' },
    { key: 'sector', label: 'Sector' },
];
export function getVisibleCols() {
    try { return JSON.parse(localStorage.getItem('atlas_cols')) || DEFAULT_COLS; }
    catch(e) { return DEFAULT_COLS; }
}
export function cellValue(p, key) {
    switch(key) {
        case 'symbol': return p.symbol;
        case 'name': return p.name || p.symbol;
        case 'side': return p.side === 'short' ? 'SHORT' : 'LONG';
        case 'quantity': return fmt(p.quantity, 0);
        case 'cost_basis': return fmtCurrency(p.cost_basis);
        case 'current_price': return fmtCurrency(p.current_price);
        case 'market_value': return fmtCurrency(p.market_value);
        case 'daily_change_pct': return fmtPct(p.daily_change_pct);
        case 'return_5d_pct': return fmtPct(p.return_5d_pct);
        case 'weight_equity_pct': return fmtPct(p.weight_equity_pct);
        case 'weight_gross_pct': return fmtPct(p.weight_gross_pct);
        case 'total_gain_loss_dollar': return fmtCurrency(p.total_gain_loss_dollar != null ? p.total_gain_loss_dollar : ((p.current_price - p.cost_basis) * p.quantity));
        case 'unrealised_return_pct': return fmtPct(p.unrealised_return_pct);
        case 'quality_score': return Math.round(p.quality_score || 0);
        case 'annualised_vol': return fmtPct(p.annualised_vol);
        case 'sharpe_approx': return fmt(p.sharpe_approx);
        case 'asset_class': return p.asset_class || '\u2014';
        case 'sector': return p.sector || '\u2014';
        default: return '\u2014';
    }
}
export function cellClass(p, key) {
    switch(key) {
        case 'daily_change_pct': return cls(p.daily_change_pct);
        case 'return_5d_pct': return cls(p.return_5d_pct);
        case 'total_gain_loss_dollar': return cls(p.total_gain_loss_dollar != null ? p.total_gain_loss_dollar : ((p.current_price - p.cost_basis) * p.quantity));
        case 'unrealised_return_pct': return cls(p.unrealised_return_pct);
        case 'quality_score': return '';
        case 'side': return p.side === 'short' ? 'negative' : '';
        default: return '';
    }
}
export function cellStyle(key) {
    if (key === 'symbol') return { fontWeight: 600, color: '#00d4ff' };
    if (key === 'name') return { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.6)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    return {};
}
export function qualityPill(score) {
    var s = Math.round(score || 0);
    var tier = s >= 60 ? 'high' : s >= 40 ? 'mid' : 'low';
    return React.createElement('span', { className: 'quality-pill ' + tier }, s);
}

// --- Quant helpers --------------------------------------------------
export function quantTile(label, value, valueClass, sub) {
    return React.createElement('div', { className: 'metric-card' },
        React.createElement('div', { className: 'label' }, label),
        React.createElement('div', { className: 'value' + (valueClass ? ' ' + valueClass : '') }, value),
        sub ? React.createElement('div', { className: 'sub' }, sub) : null
    );
}

// Return a background colour for a correlation cell (-1..+1).
// Cyan = uncorrelated/negative (good diversifier).
// Red  = strongly positive correlation (redundant exposure).
export function corrBg(c) {
    if (c == null || isNaN(c)) return 'transparent';
    const v = Math.max(-1, Math.min(1, Number(c)));
    if (v >= 0) {
        // 0 → transparent, 1 → strong red
        const a = Math.pow(v, 1.4) * 0.7;
        return 'rgba(239,68,68,' + a.toFixed(3) + ')';
    }
    // Negative correlation — desirable, cyan tint
    const a = Math.pow(-v, 1.4) * 0.5;
    return 'rgba(0,212,255,' + a.toFixed(3) + ')';
}
export function corrTextColor(c) {
    return Math.abs(Number(c) || 0) > 0.55 ? '#fff' : 'rgba(255,255,255,0.85)';
}

// RSI 0..100 → coloured fill width and tone
export function rsiFillStyle(rsi) {
    if (rsi == null || isNaN(rsi)) return { width: '0%', background: 'transparent' };
    const v = Math.max(0, Math.min(100, Number(rsi)));
    let bg = '#10b981';                // neutral green
    if (v >= 70) bg = '#ef4444';       // overbought
    else if (v <= 30) bg = '#00d4ff';  // oversold
    else if (v >= 60) bg = '#f59e0b';
    return { width: v.toFixed(0) + '%', background: bg };
}

// Format a return value into a coloured chip (used in rolling-returns matrix)
export function returnChip(v, decimals) {
    if (v == null || isNaN(v)) {
        return React.createElement('span', { className: 'ret-chip', style: { color: 'var(--text-muted)' } }, '\u2014');
    }
    const num = Number(v);
    const pct = num * 100;
    const bg = num > 0 ? 'rgba(16,185,129,0.12)'
             : num < 0 ? 'rgba(239,68,68,0.12)'
             : 'rgba(255,255,255,0.04)';
    const color = num > 0 ? 'var(--green)' : num < 0 ? 'var(--red)' : 'var(--text-sec)';
    const txt = (num > 0 ? '+' : '') + pct.toFixed(decimals != null ? decimals : 2) + '%';
    return React.createElement('span', { className: 'ret-chip', style: { background: bg, color: color } }, txt);
}

// ------------------------------------------------------------
// Schema auto-detection (defensive against view name variance)
// ------------------------------------------------------------

// Detect first/second symbol columns from a pairwise correlation row
export function detectSymbolPair(sample) {
    if (!sample) return [null, null];
    const candidates = [
        ['symbol_a', 'symbol_b'],
        ['sym_a', 'sym_b'],
        ['asset_a', 'asset_b'],
        ['ticker_a', 'ticker_b'],
        ['symbol_1', 'symbol_2'],
        ['sym_1', 'sym_2'],
        ['asset_1', 'asset_2'],
        ['from_symbol', 'to_symbol'],
        ['symbol_x', 'symbol_y'],
        ['x_symbol', 'y_symbol'],
    ];
    for (const [a, b] of candidates) {
        if (a in sample && b in sample) return [a, b];
    }
    // Heuristic fallback
    const keys = Object.keys(sample);
    const a = keys.find(k => /(_a|_1|_x|_from)$/i.test(k));
    const b = keys.find(k => /(_b|_2|_y|_to)$/i.test(k));
    return [a || null, b || null];
}

export function detectCorrelationCol(sample) {
    if (!sample) return null;
    const candidates = ['correlation', 'corr', 'pearson', 'rho', 'r', 'value', 'coef'];
    for (const c of candidates) if (c in sample) return c;
    // Find the first numeric, non-symbol column
    const keys = Object.keys(sample);
    return keys.find(k => typeof sample[k] === 'number' && !/symbol|asset|ticker|date/i.test(k)) || null;
}

// Map period -> actual column name. Returns ordered { '1d': 'return_1d', ... }.
export function detectReturnCols(sample) {
    if (!sample) return [];
    const periods = [
        { label: '1D',  aliases: ['1d',  'day',  '1day',  'daily']  },
        { label: '1W',  aliases: ['1w',  '5d',   'week',  '1week']  },
        { label: '1M',  aliases: ['1m',  '21d',  'month', '1month'] },
        { label: '3M',  aliases: ['3m',  '63d',  '3month', 'qtr', 'quarter'] },
        { label: '6M',  aliases: ['6m',  '126d', '6month'] },
        { label: 'YTD', aliases: ['ytd', 'year_to_date'] },
        { label: '1Y',  aliases: ['1y',  '252d', 'year',  '1year', 'annual'] },
    ];
    const prefixes = ['return_', 'ret_', 'r_', 'pct_', '', 'roi_', 'change_'];
    const suffixes = ['_return', '_ret', '_pct', ''];
    const out = [];
    const seen = new Set();
    for (const p of periods) {
        for (const alias of p.aliases) {
            let found = null;
            for (const pre of prefixes) {
                for (const suf of suffixes) {
                    const k = pre + alias + suf;
                    if (k in sample && !seen.has(k)) { found = k; break; }
                }
                if (found) break;
            }
            if (found) {
                seen.add(found);
                out.push({ key: found, label: p.label });
                break;
            }
        }
    }
    return out;
}

// True if values look like percentages (e.g. -76.43) rather than decimals (-0.7643).
// Uses median magnitude — robust against outliers and zeros.
export function isPercentScale(values) {
    const nums = values.filter(v => v != null && !isNaN(v) && Number(v) !== 0).map(v => Math.abs(Number(v)));
    if (nums.length < 3) return false;
    const sorted = [...nums].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // Decimals (e.g. 0.05 = 5%) virtually never exceed 1.5 in magnitude.
    // Percent representation (e.g. 5 = 5%) very rarely sits below 1.5 at the median.
    return median > 1.5;
}

// Convert a value to a 0..1 ratio for display, given a known scale.
export function toRatio(val, isPct) {
    if (val == null || isNaN(val)) return null;
    return isPct ? Number(val) / 100 : Number(val);
}

// Render a return chip when you already know the scale
export function returnChipScaled(v, isPct, decimals) {
    const ratio = toRatio(v, isPct);
    if (ratio == null) return React.createElement('span', { className: 'ret-chip', style: { color: 'var(--text-muted)' } }, '\u2014');
    const pct = ratio * 100;
    const bg = ratio > 0 ? 'rgba(16,185,129,0.12)' : ratio < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)';
    const color = ratio > 0 ? 'var(--green)' : ratio < 0 ? 'var(--red)' : 'var(--text-sec)';
    const txt = (ratio > 0 ? '+' : '') + pct.toFixed(decimals != null ? decimals : 2) + '%';
    return React.createElement('span', { className: 'ret-chip', style: { background: bg, color: color } }, txt);
}

// Reusable Chart.js wrapper hook
export function useChart(containerRef, configFactory, deps) {
    const instanceRef = useRef(null);
    useEffect(() => {
        if (!containerRef.current) return;
        if (instanceRef.current) { instanceRef.current.destroy(); instanceRef.current = null; }
        const cfg = configFactory();
        if (!cfg) return;
        instanceRef.current = new Chart(containerRef.current, cfg);
        return () => { if (instanceRef.current) { instanceRef.current.destroy(); instanceRef.current = null; } };
    }, deps);
}
