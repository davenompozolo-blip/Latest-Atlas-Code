// ============================================================
// ATLAS Options Analysis — IV Surface Tab
// ============================================================

import { OC, oFmt, oFmtPct, apiFetch } from './options-analysis.js';

var h         = React.createElement;
var useState  = React.useState;
var useEffect = React.useEffect;
var useRef    = React.useRef;

// ── IV Heatmap (Plotly) ───────────────────────────────────────
function IVHeatmap(p) {
    var plotRef = useRef(null);

    useEffect(function () {
        if (!p.data || !plotRef.current) return;
        var d = p.data;
        var expiries = d.expiries;
        var strikes  = d.strikes;
        var mode     = p.mode; // 'call' | 'put' | 'mid'

        // Build z matrix: rows = expiries, cols = strikes
        var z = expiries.map(function (exp) {
            return strikes.map(function (stk) {
                var key  = exp + '|' + stk;
                var cell = d.ivData[key];
                if (!cell) return null;
                var iv = mode === 'call' ? cell.call
                       : mode === 'put'  ? cell.put
                       : (cell.call != null && cell.put != null ? (cell.call + cell.put) / 2
                          : cell.call != null ? cell.call : cell.put);
                return iv != null ? parseFloat((iv * 100).toFixed(2)) : null;
            });
        });

        // Format expiry labels to MM-DD-YY
        var expLabels = expiries.map(function (e) {
            var parts = e.split('-');
            return parts.length === 3 ? parts[1] + '-' + parts[2] + '-' + parts[0].slice(2) : e;
        });

        Plotly.react(plotRef.current, [{
            type: 'heatmap',
            x: strikes,
            y: expLabels,
            z: z,
            colorscale: [
                [0,    '#1a3a5c'],
                [0.25, '#1f6b9e'],
                [0.5,  '#2ca9e1'],
                [0.75, '#f5a623'],
                [1,    '#e84545'],
            ],
            zsmooth: 'best',
            colorbar: {
                title: { text: 'IV %', side: 'right', font: { color: OC.muted, size: 10 } },
                ticksuffix: '%',
                tickfont: { color: OC.muted, size: 9, family: 'JetBrains Mono' },
                len: 0.85,
                thickness: 14,
                bgcolor: 'rgba(0,0,0,0)',
                borderwidth: 0,
            },
            hovertemplate: 'Strike: $%{x}<br>Expiry: %{y}<br>IV: %{z:.1f}%<extra></extra>',
            xgap: 1,
            ygap: 1,
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor:  'rgba(0,0,0,0)',
            margin: { l: 72, r: 24, t: 16, b: 56 },
            xaxis: {
                title: { text: 'Strike Price', font: { color: OC.muted, size: 10 } },
                tickprefix: '$',
                tickfont: { color: OC.muted, size: 9, family: 'JetBrains Mono' },
                gridcolor: 'rgba(0,0,0,0)',
            },
            yaxis: {
                title: { text: 'Expiry', font: { color: OC.muted, size: 10 } },
                tickfont: { color: OC.muted, size: 9 },
                gridcolor: 'rgba(0,0,0,0)',
            },
        }, { responsive: true, displayModeBar: false });
    }, [p.data, p.mode]);

    return h('div', { ref: plotRef, style: { height: 460, width: '100%' } });
}

// ── Stats panel ───────────────────────────────────────────────
function IVStats(p) {
    if (!p.data) return null;
    var d    = p.data;
    var mode = p.mode;

    var allIVs = [];
    Object.values(d.ivData).forEach(function (cell) {
        var iv = mode === 'call' ? cell.call
               : mode === 'put'  ? cell.put
               : (cell.call != null && cell.put != null ? (cell.call + cell.put) / 2
                  : cell.call != null ? cell.call : cell.put);
        if (iv != null && isFinite(iv)) allIVs.push(iv);
    });

    if (!allIVs.length) return null;

    allIVs.sort(function (a, b) { return a - b; });
    var mean   = allIVs.reduce(function (s, v) { return s + v; }, 0) / allIVs.length;
    var median = allIVs[Math.floor(allIVs.length / 2)];
    var minIV  = allIVs[0];
    var maxIV  = allIVs[allIVs.length - 1];

    function stat(label, val, col) {
        return h('div', { key: label, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 } },
            h('span', { style: { fontSize: 9, color: OC.muted, letterSpacing: 1, textTransform: 'uppercase' } }, label),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: col || OC.text } },
                oFmtPct(val, 1))
        );
    }

    return h('div', {
        style: {
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border,
            padding: '14px 20px', marginBottom: 12,
        }
    },
        stat('Min IV',    minIV,  OC.green),
        stat('Median IV', median, OC.sec),
        stat('Mean IV',   mean,   OC.amber),
        stat('Max IV',    maxIV,  OC.red)
    );
}

// ── IV Smile for selected expiry ──────────────────────────────
function IVSmile(p) {
    var plotRef = useRef(null);

    useEffect(function () {
        if (!p.data || !p.expiry || !plotRef.current) return;
        var d      = p.data;
        var mode   = p.mode;
        var strikes = d.strikes;

        var callIVs = [], putIVs = [];
        strikes.forEach(function (stk) {
            var cell = d.ivData[p.expiry + '|' + stk];
            callIVs.push(cell && cell.call != null ? cell.call * 100 : null);
            putIVs.push(cell && cell.put  != null ? cell.put  * 100 : null);
        });

        var traces = [];
        if (mode !== 'put') {
            traces.push({
                x: strikes, y: callIVs, mode: 'lines+markers',
                name: 'Call IV',
                line: { color: OC.green, width: 2 },
                marker: { size: 5, color: OC.green },
                hovertemplate: '$%{x} Call IV: %{y:.1f}%<extra></extra>',
            });
        }
        if (mode !== 'call') {
            traces.push({
                x: strikes, y: putIVs, mode: 'lines+markers',
                name: 'Put IV',
                line: { color: OC.red, width: 2 },
                marker: { size: 5, color: OC.red },
                hovertemplate: '$%{x} Put IV: %{y:.1f}%<extra></extra>',
            });
        }

        Plotly.react(plotRef.current, traces, {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 52, r: 16, t: 24, b: 48 },
            title: { text: 'IV Smile — ' + p.expiry, font: { color: OC.sec, size: 11 }, x: 0.5 },
            xaxis: {
                title: { text: 'Strike', font: { color: OC.muted, size: 10 } },
                tickprefix: '$',
                tickfont: { color: OC.muted, size: 9, family: 'JetBrains Mono' },
                gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
            },
            yaxis: {
                title: { text: 'IV %', font: { color: OC.muted, size: 10 } },
                ticksuffix: '%',
                tickfont: { color: OC.muted, size: 9, family: 'JetBrains Mono' },
                gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
            },
            legend: { font: { color: OC.muted, size: 10 }, bgcolor: 'rgba(0,0,0,0)' },
            showlegend: mode === 'mid',
        }, { responsive: true, displayModeBar: false });
    }, [p.data, p.expiry, p.mode]);

    return h('div', { ref: plotRef, style: { height: 240, width: '100%' } });
}

// ── IVSurface tab ─────────────────────────────────────────────
export function IVSurfaceTab(p) {
    var _data     = useState(null);  var data     = _data[0];     var setData     = _data[1];
    var _loading  = useState(false); var loading  = _loading[0];  var setLoading  = _loading[1];
    var _error    = useState(null);  var error    = _error[0];    var setError    = _error[1];
    var _mode     = useState('call'); var mode    = _mode[0];     var setMode     = _mode[1];
    var _smileExp = useState(null);  var smileExp = _smileExp[0]; var setSmileExp = _smileExp[1];

    function load() {
        if (!p.symbol) return;
        setLoading(true); setError(null);
        apiFetch('/api/trading?action=iv_surface&symbol=' + encodeURIComponent(p.symbol))
            .then(function (j) {
                setData(j);
                setSmileExp(j.expiries && j.expiries.length ? j.expiries[0] : null);
                setLoading(false);
            })
            .catch(function (e) { setError(e.message || 'Failed to load IV surface'); setLoading(false); });
    }

    useEffect(function () { load(); }, [p.symbol]);

    function modeBtn(label, val) {
        var active = mode === val;
        return h('button', {
            key: val,
            onClick: function () { setMode(val); },
            style: {
                padding: '5px 16px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
                background: active ? OC.blue + '22' : 'transparent',
                border: '1px solid ' + (active ? OC.blue + '66' : 'rgba(255,255,255,0.08)'),
                color: active ? OC.blue : OC.muted,
            }
        }, label);
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        // Toolbar
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 10, color: OC.muted, letterSpacing: 1, textTransform: 'uppercase' } }, 'Show:'),
            modeBtn('Calls', 'call'),
            modeBtn('Puts',  'put'),
            modeBtn('Mid',   'mid'),
            h('button', {
                onClick: load,
                disabled: loading,
                style: {
                    marginLeft: 'auto', padding: '5px 16px', borderRadius: 5, fontSize: 11,
                    fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                    color: loading ? OC.muted : OC.sec, letterSpacing: 0.5,
                }
            }, loading ? 'Loading…' : 'Refresh')
        ),

        !p.symbol && h('div', {
            style: { height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OC.muted, fontSize: 12, background: OC.card, borderRadius: 8,
                border: '1px solid ' + OC.border }
        }, 'Enter a ticker symbol above to load the IV surface'),

        error && h('div', {
            style: { padding: '14px 16px', background: 'rgba(232,69,69,0.08)', borderRadius: 8,
                border: '1px solid rgba(232,69,69,0.25)', color: OC.red, fontSize: 12 }
        }, error),

        loading && h('div', {
            style: { height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OC.muted, fontSize: 12, background: OC.card, borderRadius: 8,
                border: '1px solid ' + OC.border }
        },
            h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 } },
                h('div', { style: {
                    width: 28, height: 28, borderRadius: '50%',
                    border: '3px solid rgba(255,255,255,0.08)',
                    borderTopColor: OC.blue, animation: 'spin 0.8s linear infinite'
                } }),
                h('span', {}, 'Fetching IV surface…')
            )
        ),

        data && !loading && h(IVStats, { data: data, mode: mode }),

        data && !loading && h('div', {
            style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '16px' }
        },
            h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2,
                textTransform: 'uppercase', marginBottom: 12 } }, 'IV Surface — ' + (p.symbol || '')),
            h(IVHeatmap, { data: data, mode: mode })
        ),

        data && !loading && data.expiries && data.expiries.length > 0 && h('div', {
            style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '16px' }
        },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
                h('span', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2,
                    textTransform: 'uppercase' } }, 'IV Smile'),
                h('select', {
                    value: smileExp || '',
                    onChange: function (e) { setSmileExp(e.target.value); },
                    style: {
                        background: OC.bg, color: OC.text, border: '1px solid ' + OC.border,
                        borderRadius: 4, padding: '3px 8px', fontSize: 11, fontFamily: 'JetBrains Mono',
                    }
                },
                    data.expiries.map(function (exp) {
                        return h('option', { key: exp, value: exp }, exp);
                    })
                )
            ),
            smileExp && h(IVSmile, { data: data, expiry: smileExp, mode: mode })
        )
    );
}
