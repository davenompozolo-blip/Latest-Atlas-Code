import { fmtPct, fmtCurrency } from './utils.js';
var h = React.createElement;

var REGIME_TILTS = {
    'Goldilocks': { Growth: 'Overweight', Quality: 'Neutral', Momentum: 'Overweight', Value: 'Underweight', 'Low Vol': 'Underweight' },
    'Reflation':  { Growth: 'Neutral', Quality: 'Underweight', Momentum: 'Overweight', Value: 'Overweight', 'Low Vol': 'Underweight' },
    'Stagflation':{ Growth: 'Underweight', Quality: 'Overweight', Momentum: 'Underweight', Value: 'Neutral', 'Low Vol': 'Overweight' },
    'Deflation':  { Growth: 'Underweight', Quality: 'Overweight', Momentum: 'Underweight', Value: 'Underweight', 'Low Vol': 'Overweight' },
};

var REGIME_ASSETS = {
    'Goldilocks': { Equities: 'Bullish', Bonds: 'Neutral', Commodities: 'Neutral', USD: 'Bearish' },
    'Reflation':  { Equities: 'Bullish', Bonds: 'Bearish', Commodities: 'Bullish', USD: 'Neutral' },
    'Stagflation':{ Equities: 'Bearish', Bonds: 'Neutral', Commodities: 'Bullish', USD: 'Bullish' },
    'Deflation':  { Equities: 'Bearish', Bonds: 'Bullish', Commodities: 'Bearish', USD: 'Bullish' },
};

var QUADRANTS = [
    { key: 'Reflation',  row: 0, col: 0, color: '#f59e0b', desc: 'Growth \u2191 / Inflation \u2191' },
    { key: 'Stagflation', row: 0, col: 1, color: '#ef4444', desc: 'Growth \u2193 / Inflation \u2191' },
    { key: 'Goldilocks',  row: 1, col: 0, color: '#10b981', desc: 'Growth \u2191 / Inflation \u2193' },
    { key: 'Deflation',   row: 1, col: 1, color: '#a855f7', desc: 'Growth \u2193 / Inflation \u2193' },
];

function latest(arr) {
    if (!arr || !arr.length) return null;
    return arr[arr.length - 1].value;
}

function tiltColor(t) {
    if (t === 'Overweight' || t === 'Bullish') return '#10b981';
    if (t === 'Neutral') return '#f59e0b';
    return '#ef4444';
}

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }

// --- 1. Regime Badge ---
function RegimeBadge(p) {
    var r = p.regime;
    return h('div', { className: 'card', style: {
        textAlign: 'center', padding: 24,
        background: 'linear-gradient(135deg, ' + r.color + '1a 0%, rgba(0,0,0,0) 70%)',
    }},
        h('div', { style: { fontSize: 24, fontWeight: 700, color: r.color, marginBottom: 4 } }, r.label),
        h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12 } }, r.quadrant),
        h('div', { style: { width: '60%', margin: '0 auto', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' } },
            h('div', { style: {
                width: ((r.confidence || 0) * 100) + '%', height: '100%',
                borderRadius: 3, background: r.color,
            }})
        ),
        h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 } },
            'Confidence: ' + fN((r.confidence || 0) * 100, 0) + '%')
    );
}

// --- 2. Quadrant Visual ---
function QuadrantGrid(p) {
    var active = p.activeLabel;
    return h('div', { className: 'card', style: { padding: 16 } },
        h('div', { className: 'card-title' }, 'Regime Quadrant'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gridTemplateRows: '1fr 1fr 24px', gap: 6 } },
            // Y-axis label spanning rows 1-2
            h('div', { style: {
                gridRow: '1 / 3', gridColumn: '1', writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase',
            }}, 'INFLATION \u2192'),
            // Quadrant cells
            QUADRANTS.map(function(q) {
                var isActive = active && active.toLowerCase() === q.key.toLowerCase();
                return h('div', {
                    key: q.key,
                    style: {
                        gridRow: q.row + 1, gridColumn: q.col + 2,
                        padding: 16, borderRadius: 8, textAlign: 'center',
                        background: isActive ? q.color + '33' : 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (isActive ? q.color + '88' : 'rgba(255,255,255,0.06)'),
                    }
                },
                    h('div', { style: { fontWeight: 600, fontSize: 13, color: isActive ? q.color : 'rgba(255,255,255,0.7)', marginBottom: 4 } }, q.key),
                    h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.45)' } }, q.desc)
                );
            }),
            // Spacer bottom-left corner
            h('div', { key: 'spacer', style: { gridRow: 3, gridColumn: 1 } }),
            // X-axis label spanning cols 2-3
            h('div', { key: 'xaxis', style: {
                gridRow: 3, gridColumn: '2 / 4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase',
            }}, 'GROWTH \u2192')
        )
    );
}

// --- 3. Key Signals Row ---
function SignalTiles(p) {
    var d = p.data;
    var spread = d.yields && d.yields.curve ? d.yields.curve.spread2s10s : null;
    var cpi = d.regime ? d.regime.cpiYoY : null;
    var unrate = latest(d.growth ? d.growth.unrate : null);
    var hy = latest(d.credit ? d.credit.hySpreads : null);

    var tiles = [
        { label: '2s10s Spread', value: spread != null ? fN(spread, 2) + '%' : '\u2014',
          color: spread != null ? (spread < 0 ? '#ef4444' : '#10b981') : null },
        { label: 'CPI YoY', value: cpi != null ? fN(cpi, 1) + '%' : '\u2014',
          color: cpi != null ? (cpi > 5 ? '#ef4444' : cpi > 3 ? '#f59e0b' : '#10b981') : null },
        { label: 'Unemployment', value: unrate != null ? fN(unrate, 1) + '%' : '\u2014', color: null },
        { label: 'HY Spread', value: hy != null ? fN(hy, 2) + '%' : '\u2014',
          color: hy != null ? (hy > 5 ? '#ef4444' : null) : null },
    ];

    return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 } },
        tiles.map(function(t) {
            return h('div', { key: t.label, className: 'metric-card' },
                h('div', { className: 'label' }, t.label),
                h('div', { className: 'value', style: t.color ? { color: t.color } : null }, t.value)
            );
        })
    );
}

// --- 4. Factor Tilts ---
function FactorTilts(p) {
    var tilts = REGIME_TILTS[p.regime] || {};
    var keys = Object.keys(tilts);
    if (!keys.length) return null;
    return h('div', { className: 'card', style: { padding: 16 } },
        h('div', { className: 'card-title' }, 'Factor Tilts'),
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' } },
            keys.map(function(k) {
                var t = tilts[k];
                var c = tiltColor(t);
                return h('div', { key: k, style: { textAlign: 'center', minWidth: 80 } },
                    h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4 } }, k),
                    h('div', { style: {
                        display: 'inline-block', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: c + '22', color: c, border: '1px solid ' + c + '44',
                    }}, t)
                );
            })
        )
    );
}

// --- 5. Asset Implications ---
function AssetImplications(p) {
    var assets = REGIME_ASSETS[p.regime] || {};
    var keys = Object.keys(assets);
    if (!keys.length) return null;
    return h('div', { className: 'card', style: { padding: 16 } },
        h('div', { className: 'card-title' }, 'Asset Implications'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 } },
            keys.map(function(k) {
                var v = assets[k];
                var c = tiltColor(v);
                return h('div', { key: k, style: {
                    textAlign: 'center', padding: 14, borderRadius: 8,
                    background: c + '11', border: '1px solid ' + c + '33',
                }},
                    h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 } }, k),
                    h('div', { style: { fontSize: 14, fontWeight: 600, color: c } }, v)
                );
            })
        )
    );
}

// --- Main Export ---
export function RegimePanel(p) {
    var d = p.data;
    if (!d || !d.regime) {
        return h('div', { className: 'card', style: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' } },
            'Regime data unavailable.');
    }
    var label = d.regime.label || '';
    // Normalize label to title-case key for config lookup
    var regimeKey = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h(RegimeBadge, { regime: d.regime }),
        h(QuadrantGrid, { activeLabel: label }),
        h(SignalTiles, { data: d }),
        h(FactorTilts, { regime: regimeKey }),
        h(AssetImplications, { regime: regimeKey })
    );
}
