import React from 'react';
import { Chart, registerables } from 'chart.js';
import { perSymbolFactors } from './pcm-optimizer.js';
import { Loading } from './components.js';

Chart.register(...registerables);

var useState = React.useState, useEffect = React.useEffect;
var useMemo = React.useMemo, useRef = React.useRef;
var h = React.createElement;

// ── Design tokens ─────────────────────────────────────────────────────────────
var T = {
    cardBg:    'rgba(255,255,255,0.025)',
    cardBorder:'rgba(255,255,255,0.07)',
    teal:      '#00d4b8',
    gold:      '#f4b942',
    green:     '#22c55e',
    red:       '#ef4444',
    blue:      '#3b82f6',
    purple:    '#a855f7',
    amber:     '#f59e0b',
    text1:     'rgba(255,255,255,0.88)',
    text2:     'rgba(255,255,255,0.45)',
    text3:     'rgba(255,255,255,0.22)',
    mono:      "'JetBrains Mono', ui-monospace, monospace",
};

// ── Cluster definitions ───────────────────────────────────────────────────────
var CLUSTERS = [
    { id: 'amd',      label: 'AMD',          symbols: ['AMD'],                                                                    color: '#22c55e' },
    { id: 'energy',   label: 'Energy',        symbols: ['PBR','PBRA','BKR','HAL','CVX','KMI','OILK','USL','SHEL'],                color: '#f59e0b' },
    { id: 'tech',     label: 'Tech ex-AMD',   symbols: ['ASML','TSM','NVDA','AAPL','GOOGL','AVGO','MSFT','META','TCEHY','SNDK'], color: '#3b82f6' },
    { id: 'consumer', label: 'Consumer',      symbols: ['AMZN','TGT','BABA','SONY','PROSY','UL','NPSNY'],                        color: '#a855f7' },
    { id: 'intl',     label: 'International', symbols: ['EWY','ACWI','AVEE','AVEM','DFEV','EWA','EWZ','UAE','EZA'],              color: '#00d4b8' },
    { id: 'other',    label: 'Other',         symbols: [],                                                                        color: '#64748b' },
];

// ── Regime windows ────────────────────────────────────────────────────────────
var REGIME_WINDOWS = [
    { name: 'Goldilocks',   start: '2026-01-02', end: '2026-02-04', color: '#10b981' },
    { name: 'Tariff Shock', start: '2026-02-05', end: '2026-03-08', color: '#ef4444' },
    { name: 'Reflation',    start: '2026-03-09', end: '2026-05-21', color: '#f59e0b' },
];

// ── Factor weights ────────────────────────────────────────────────────────────
var FACTOR_WEIGHTS = { mom: 0.40, quality: 0.24, value: 0.18, lowvol: 0.08, sector: 0.10 };

// ── Sector → best regime mapping ─────────────────────────────────────────────
var SECTOR_BEST_REGIME = {
    'Technology':             'Goldilocks',
    'Consumer Discretionary': 'Goldilocks',
    'Energy':                 'Reflation',
    'Materials':              'Reflation',
    'Consumer Staples':       'Stagflation',
    'Healthcare':             'Stagflation',
    'Fixed Income':           'Deflation',
    'Utilities':              'Deflation',
    'International':          'Reflation',
    'Financials':             'Reflation',
};

// ── Shared helpers ────────────────────────────────────────────────────────────
function isOption(symbol) {
    if (!symbol) return false;
    return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol) || (symbol.length > 10 && /\d{6}/.test(symbol));
}

function fmtPct(v, decimals) {
    if (v == null || !isFinite(v)) return '—';
    var d = decimals != null ? decimals : 2;
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
}

function fmtDollar(v) {
    if (v == null || !isFinite(v)) return '—';
    var abs = Math.abs(v);
    var str;
    if (abs >= 1e6) str = '$' + (abs / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e3) str = '$' + (abs / 1e3).toFixed(1) + 'k';
    else str = '$' + abs.toFixed(0);
    return v < 0 ? '-' + str : str;
}

function clusterForSymbol(symbol) {
    for (var i = 0; i < CLUSTERS.length - 1; i++) {
        if (CLUSTERS[i].symbols.indexOf(symbol) >= 0) return CLUSTERS[i];
    }
    return CLUSTERS[CLUSTERS.length - 1]; // 'other'
}

var DARK_CHART_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
        legend: { display: false },
    },
    scales: {
        x: {
            grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.35)', font: { family: "'JetBrains Mono', monospace", size: 10 }, maxTicksLimit: 12 },
            border: { display: false },
        },
        y: {
            grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
            ticks: { color: 'rgba(255,255,255,0.35)', font: { family: "'JetBrains Mono', monospace", size: 10 } },
            border: { display: false },
        },
    },
};

// ── Shared styles ─────────────────────────────────────────────────────────────
var cardStyle = {
    background:   T.cardBg,
    border:       '1px solid ' + T.cardBorder,
    borderRadius: 10,
    padding:      '18px 20px',
    marginBottom: 16,
};
var cardTitleStyle = {
    fontSize:      10,
    fontWeight:    700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color:         T.text2,
    fontFamily:    T.mono,
    marginBottom:  14,
};
var thStyle = {
    padding:       '6px 10px',
    fontSize:      9,
    fontWeight:    700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color:         T.text3,
    fontFamily:    T.mono,
    borderBottom:  '1px solid ' + T.cardBorder,
    textAlign:     'left',
    whiteSpace:    'nowrap',
};
var tdBase = {
    padding:      '7px 10px',
    fontSize:     11,
    fontFamily:   T.mono,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    color:        T.text1,
};

// ── Shared FilterBar component ────────────────────────────────────────────────
// props: { search, onSearch, sectors, activeSector, onSector, onClear, extra }
function FilterBar(props) {
    var search       = props.search       || '';
    var onSearch     = props.onSearch     || function() {};
    var sectors      = props.sectors      || [];
    var activeSector = props.activeSector || '';
    var onSector     = props.onSector     || function() {};
    var onClear      = props.onClear      || function() {};
    var extra        = props.extra        || null;

    var hasFilters = search || activeSector;

    return h('div', {
        style: {
            display:      'flex',
            alignItems:   'flex-start',
            gap:          10,
            flexWrap:     'wrap',
            marginBottom: 14,
            padding:      '10px 14px',
            background:   'rgba(255,255,255,0.018)',
            border:       '1px solid ' + T.cardBorder,
            borderRadius: 8,
        }
    },
        // Symbol search
        h('input', {
            type:        'text',
            placeholder: 'Search symbol…',
            value:       search,
            onChange:    function(e) { onSearch(e.target.value); },
            style: {
                background:   'rgba(255,255,255,0.06)',
                border:       '1px solid rgba(255,255,255,0.12)',
                borderRadius: 5,
                padding:      '5px 10px',
                color:        T.text1,
                fontSize:     11,
                fontFamily:   T.mono,
                width:        130,
                outline:      'none',
            },
        }),
        // Sector chips
        sectors.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
            sectors.map(function(sec) {
                var active = activeSector === sec;
                return h('button', {
                    key:     sec,
                    onClick: function() { onSector(active ? '' : sec); },
                    style: {
                        padding:      '3px 9px',
                        borderRadius: 4,
                        fontSize:     9,
                        fontFamily:   T.mono,
                        fontWeight:   700,
                        letterSpacing: 0.8,
                        cursor:       'pointer',
                        border:       '1px solid ' + (active ? T.teal : 'rgba(255,255,255,0.12)'),
                        background:   active ? 'rgba(0,212,184,0.12)' : 'transparent',
                        color:        active ? T.teal : T.text2,
                        transition:   'all 0.12s',
                    },
                }, sec);
            })
        ),
        // Extra panel-specific controls
        extra,
        // Clear button
        hasFilters && h('button', {
            onClick: onClear,
            style: {
                marginLeft:   'auto',
                padding:      '3px 10px',
                borderRadius: 4,
                fontSize:     9,
                fontFamily:   T.mono,
                cursor:       'pointer',
                border:       '1px solid rgba(255,255,255,0.12)',
                background:   'transparent',
                color:        T.text3,
            }
        }, '✕ Clear')
    );
}

// ── computeIndividualContributions — per-symbol lines for Individual chart mode
function computeIndividualContributions(symbols, positions, histBySymbol) {
    var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
    if (!totalMv) return null;

    var posMap = {};
    positions.forEach(function(p) { posMap[p.symbol] = p; });

    var validSyms = symbols.filter(function(sym) {
        var hist = histBySymbol[sym];
        return hist && hist.length >= 2;
    });
    if (!validSyms.length) return null;

    // Canonical x-axis = longest history
    var longestHist = validSyms.reduce(function(best, sym) {
        var h2 = histBySymbol[sym];
        return h2.length > best.length ? h2 : best;
    }, histBySymbol[validSyms[0]]);
    var dates = longestHist.map(function(d) { return d.date || ''; });
    var n = dates.length;

    var symContribs = {};
    validSyms.forEach(function(sym) {
        var hist   = histBySymbol[sym];
        var pos    = posMap[sym];
        var weight = pos ? Math.abs(Number(pos.market_value) || 0) / totalMv : 0;
        var hLen   = hist.length;
        var offset = n - hLen;
        var cum    = 0;
        var contrib = new Array(n).fill(null);
        for (var t = 0; t < n; t++) {
            var localT = t - offset;
            if (localT >= 1 && localT < hLen) {
                var prev = hist[localT - 1].close;
                var curr = hist[localT].close;
                if (prev > 0) cum += weight * (curr - prev) / prev;
            }
            contrib[t] = localT >= 0 ? cum : null;
        }
        symContribs[sym] = contrib;
    });

    return { dates: dates, symContribs: symContribs, symbols: validSyms };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeRollingContributions
// ─────────────────────────────────────────────────────────────────────────────
function computeRollingContributions(positions, histBySymbol) {
    if (!positions || !positions.length || !histBySymbol) {
        return { dates: [], clusters: CLUSTERS, cumContribs: {} };
    }

    // Total portfolio market value (for weighting)
    var totalMv = 0;
    positions.forEach(function(pos) { totalMv += Math.abs(Number(pos.market_value) || 0); });
    if (totalMv === 0) return { dates: [], clusters: CLUSTERS, cumContribs: {} };

    // Only positions that have history data
    var validPositions = positions.filter(function(pos) {
        var hist = histBySymbol[pos.symbol];
        return hist && hist.length >= 2;
    });

    // Find the longest date series to use as canonical x-axis
    var longestDates = [];
    validPositions.forEach(function(pos) {
        var hist = histBySymbol[pos.symbol];
        var dates = hist.map(function(d) { return d.date; });
        if (dates.length > longestDates.length) longestDates = dates;
    });

    if (!longestDates.length) return { dates: [], clusters: CLUSTERS, cumContribs: {} };

    // Build a set of all dates across all histories to use as canonical axis
    var dateSet = {};
    validPositions.forEach(function(pos) {
        var hist = histBySymbol[pos.symbol];
        hist.forEach(function(d) { dateSet[d.date] = true; });
    });
    var allDates = Object.keys(dateSet).sort();
    var dateIndex = {};
    allDates.forEach(function(d, i) { dateIndex[d] = i; });
    var T_len = allDates.length;

    // Per-cluster cumulative contribution arrays
    var cumContribs = {};
    CLUSTERS.forEach(function(cl) { cumContribs[cl.id] = new Array(T_len).fill(0); });

    // For each position, compute daily returns aligned to allDates, accumulate into cluster
    validPositions.forEach(function(pos) {
        var hist = histBySymbol[pos.symbol];
        var weight = Math.abs(Number(pos.market_value) || 0) / totalMv;
        var cluster = clusterForSymbol(pos.symbol);

        // Build price lookup by date
        var priceByDate = {};
        hist.forEach(function(d) { priceByDate[d.date] = d.close; });

        // Compute daily returns on the canonical date axis (fill forward)
        var lastPrice = null;
        var prevPrice = null;
        var dailyReturns = new Array(T_len).fill(null);

        for (var i = 0; i < T_len; i++) {
            var d = allDates[i];
            if (priceByDate[d] != null) {
                lastPrice = priceByDate[d];
            }
            if (i === 0) {
                dailyReturns[i] = 0;
            } else {
                if (lastPrice != null && prevPrice != null && prevPrice !== 0) {
                    dailyReturns[i] = (lastPrice - prevPrice) / prevPrice;
                } else {
                    dailyReturns[i] = 0;
                }
            }
            prevPrice = lastPrice;
        }

        // Compute cumulative return at each date and multiply by weight
        var cumRet = 0;
        for (var j = 0; j < T_len; j++) {
            cumRet += dailyReturns[j];
            cumContribs[cluster.id][j] += weight * cumRet;
        }
    });

    return { dates: allDates, clusters: CLUSTERS, cumContribs: cumContribs };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeFactorDecomps
// ─────────────────────────────────────────────────────────────────────────────
function computeFactorDecomps(positions, histBySymbol, perfData) {
    if (!positions || !positions.length) return [];

    // Build perfData lookup by symbol
    var perfBySymbol = {};
    if (perfData && perfData.length) {
        perfData.forEach(function(row) { perfBySymbol[row.symbol] = row; });
    }

    // Filter to equity positions with history
    var equities = positions.filter(function(pos) {
        return !isOption(pos.symbol) && histBySymbol[pos.symbol] && histBySymbol[pos.symbol].length >= 30;
    });

    // Pre-compute sector medians for sector premium
    var sectorGroups = {};
    equities.forEach(function(pos) {
        var sector = pos.sector || 'Other';
        var perf = perfBySymbol[pos.symbol];
        var ret = Number((perf && perf.total_return_pct) != null ? perf.total_return_pct : 0);
        if (!sectorGroups[sector]) sectorGroups[sector] = [];
        sectorGroups[sector].push(ret);
    });
    var sectorMedians = {};
    Object.keys(sectorGroups).forEach(function(sec) {
        var vals = sectorGroups[sec].slice().sort(function(a, b) { return a - b; });
        var mid = Math.floor(vals.length / 2);
        sectorMedians[sec] = vals.length % 2 === 0
            ? (vals[mid - 1] + vals[mid]) / 2
            : vals[mid];
    });

    var results = [];

    equities.forEach(function(pos) {
        var hist = histBySymbol[pos.symbol];
        var f = perSymbolFactors(hist);
        if (!f) return;

        var perf = perfBySymbol[pos.symbol];
        var totalReturn = Number((perf && perf.total_return_pct) != null ? perf.total_return_pct : 0);

        // Normalize factors to [-1, 1] via tanh
        var nMom  = Math.tanh(f.mom     * 5);
        var nQual = Math.tanh(f.quality * 2);
        var nVal  = Math.tanh(f.value   * 5);
        var nLvol = Math.tanh(f.lowvol  * 5);

        // Sector premium: deviation from sector median
        var sector = pos.sector || 'Other';
        var secMedian = sectorMedians[sector] != null ? sectorMedians[sector] : 0;
        var sectorDelta = totalReturn - secMedian;
        var nSec = Math.tanh(sectorDelta * 5);

        // Weighted raw contributions
        var wMom  = FACTOR_WEIGHTS.mom     * nMom;
        var wQual = FACTOR_WEIGHTS.quality * nQual;
        var wVal  = FACTOR_WEIGHTS.value   * nVal;
        var wLvol = FACTOR_WEIGHTS.lowvol  * nLvol;
        var wSec  = FACTOR_WEIGHTS.sector  * nSec;

        var totalAlignScore = Math.abs(wMom) + Math.abs(wQual) + Math.abs(wVal) + Math.abs(wLvol) + Math.abs(wSec);
        var explainedFrac   = Math.min(totalAlignScore, 0.80);
        var explainedRet    = totalReturn * explainedFrac;

        var safeAlign = Math.max(totalAlignScore, 0.001);

        var factorContribs = {
            mom:     (Math.abs(wMom)  / safeAlign) * explainedRet * Math.sign(wMom),
            quality: (Math.abs(wQual) / safeAlign) * explainedRet * Math.sign(wQual),
            value:   (Math.abs(wVal)  / safeAlign) * explainedRet * Math.sign(wVal),
            lowvol:  (Math.abs(wLvol) / safeAlign) * explainedRet * Math.sign(wLvol),
            sector:  (Math.abs(wSec)  / safeAlign) * explainedRet * Math.sign(wSec),
        };

        var sumExplained = factorContribs.mom + factorContribs.quality + factorContribs.value + factorContribs.lowvol + factorContribs.sector;
        var residual = totalReturn - sumExplained;

        results.push({
            symbol:      pos.symbol,
            sector:      sector,
            totalReturn: totalReturn,
            mom:         factorContribs.mom,
            quality:     factorContribs.quality,
            value:       factorContribs.value,
            lowvol:      factorContribs.lowvol,
            sector_f:    factorContribs.sector,
            residual:    residual,
        });
    });

    // Sort by |totalReturn| descending
    results.sort(function(a, b) { return Math.abs(b.totalReturn) - Math.abs(a.totalReturn); });

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeRegimeAttribution
// ─────────────────────────────────────────────────────────────────────────────
function computeRegimeAttribution(positions, histBySymbol, perfData) {
    if (!positions || !positions.length) return [];

    var perfBySymbol = {};
    if (perfData && perfData.length) {
        perfData.forEach(function(row) { perfBySymbol[row.symbol] = row; });
    }

    var today = '2026-05-21';

    var results = [];

    positions.forEach(function(pos) {
        var hist = histBySymbol[pos.symbol];
        if (!hist || hist.length < 2) return;

        var perf = perfBySymbol[pos.symbol];
        var totalReturn = Number((perf && perf.total_return_pct) != null ? perf.total_return_pct : 0);
        var entryDate = (perf && perf.entry_date) ? perf.entry_date : null;
        var sector = pos.sector || '';

        // Build price lookup
        var priceByDate = {};
        hist.forEach(function(d) { priceByDate[d.date] = d.close; });
        var histDates = hist.map(function(d) { return d.date; }).sort();

        // Find nearest price on or after a given date
        function getPriceAtOrAfter(date) {
            for (var i = 0; i < histDates.length; i++) {
                if (histDates[i] >= date) return priceByDate[histDates[i]];
            }
            return null;
        }

        // Find nearest price on or before a given date
        function getPriceAtOrBefore(date) {
            for (var i = histDates.length - 1; i >= 0; i--) {
                if (histDates[i] <= date) return priceByDate[histDates[i]];
            }
            return null;
        }

        var windowReturns = {};

        REGIME_WINDOWS.forEach(function(win) {
            var overlapStart = entryDate && entryDate > win.start ? entryDate : win.start;
            var overlapEnd   = today < win.end ? today : win.end;

            if (overlapStart > overlapEnd) {
                windowReturns[win.name] = null;
                return;
            }

            var startPrice = getPriceAtOrAfter(overlapStart);
            var endPrice   = getPriceAtOrBefore(overlapEnd);

            if (startPrice == null || endPrice == null || startPrice === 0) {
                windowReturns[win.name] = null;
                return;
            }

            windowReturns[win.name] = (endPrice - startPrice) / startPrice;
        });

        // PCM Match logic
        var bestRegime = SECTOR_BEST_REGIME[sector] || null;
        var pcmMatch = '~';
        if (bestRegime) {
            var retInBestRegime = windowReturns[bestRegime];
            if (retInBestRegime != null) {
                if (retInBestRegime > 0) pcmMatch = 'check';
                else if (retInBestRegime < -0.05) pcmMatch = 'cross';
                else pcmMatch = 'approx';
            }
        }

        results.push({
            symbol:        pos.symbol,
            sector:        sector,
            windowReturns: windowReturns,
            totalReturn:   totalReturn,
            pcmMatch:      pcmMatch,
            bestRegime:    bestRegime,
        });
    });

    // Sort by totalReturn descending
    results.sort(function(a, b) { return b.totalReturn - a.totalReturn; });

    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell background for regime heatmap
// ─────────────────────────────────────────────────────────────────────────────
function regimeCellBg(v) {
    if (v == null) return 'rgba(255,255,255,0.03)';
    if (v >= 0.15) return 'rgba(34,197,94,0.22)';
    if (v >= 0.05) return 'rgba(34,197,94,0.12)';
    if (v >= 0)    return 'rgba(34,197,94,0.05)';
    if (v >= -0.10) return 'rgba(239,68,68,0.12)';
    return 'rgba(239,68,68,0.25)';
}


// ═════════════════════════════════════════════════════════════════════════════
// Module 1: RollingAttributionPanel
// ═════════════════════════════════════════════════════════════════════════════

export function RollingAttributionPanel(props) {
    var positions    = props.positions    || [];
    var histBySymbol = props.histBySymbol || {};
    var histReady    = props.histReady;
    var perfData     = props.perfData     || [];

    // ── Filter state ──────────────────────────────────────────────────────────
    var _mode    = useState('clusters'); // 'clusters' | 'individual'
    var mode     = _mode[0],    setMode     = _mode[1];
    var _selSyms = useState({}); // {[sym]: true} for individual selection
    var selSyms  = _selSyms[0], setSelSyms  = _selSyms[1];
    var _sector  = useState('');
    var sector   = _sector[0],  setSector   = _sector[1];
    var _search  = useState('');
    var search   = _search[0],  setSearch   = _search[1];

    // Equity positions only (no options) — the filterable universe
    var equityPositions = useMemo(function() {
        return positions.filter(function(p) {
            var ac = (p.asset_class || '').toLowerCase();
            return !ac.includes('option');
        });
    }, [positions]);

    // All distinct sectors for filter chips
    var allSectors = useMemo(function() {
        var seen = {};
        equityPositions.forEach(function(p) { if (p.sector) seen[p.sector] = true; });
        return Object.keys(seen).sort();
    }, [equityPositions]);

    // Positions filtered for the table (search + sector)
    var filteredPositions = useMemo(function() {
        return equityPositions.filter(function(p) {
            if (sector && p.sector !== sector) return false;
            if (search && p.symbol.toUpperCase().indexOf(search.toUpperCase()) === -1) return false;
            return true;
        });
    }, [equityPositions, sector, search]);

    // Positions used for the chart — in individual mode, respect symbol selection
    var chartPositions = useMemo(function() {
        if (mode === 'clusters') return equityPositions;
        var selected = Object.keys(selSyms).filter(function(s) { return selSyms[s]; });
        if (!selected.length) return equityPositions;
        return equityPositions.filter(function(p) { return selSyms[p.symbol]; });
    }, [mode, equityPositions, selSyms]);

    // Chart data — cluster or individual
    var clusterResult = useMemo(function() {
        if (!histReady || mode !== 'clusters') return null;
        return computeRollingContributions(chartPositions, histBySymbol);
    }, [chartPositions, histBySymbol, histReady, mode]);

    var individualResult = useMemo(function() {
        if (!histReady || mode !== 'individual') return null;
        var syms = chartPositions.map(function(p) { return p.symbol; });
        return computeIndividualContributions(syms, chartPositions, histBySymbol);
    }, [chartPositions, histBySymbol, histReady, mode]);

    var result = mode === 'individual' ? individualResult : clusterResult;

    // ── Chart canvas ref & Chart.js instance ──────────────────────────────────
    var canvasRef  = useRef(null);
    var chartRef   = useRef(null);

    // Palette for individual symbols — cycle through a set of distinct colors
    var INDIVIDUAL_COLORS = [
        '#22c55e','#3b82f6','#f59e0b','#a855f7','#00d4b8','#ef4444',
        '#f4b942','#8b5cf6','#10b981','#fb923c','#38bdf8','#e879f9',
    ];

    useEffect(function() {
        if (!result || !result.dates || !result.dates.length || !canvasRef.current) return;

        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

        var datasets;
        if (mode === 'individual' && result.symbols) {
            datasets = result.symbols.map(function(sym, i) {
                var color = INDIVIDUAL_COLORS[i % INDIVIDUAL_COLORS.length];
                return {
                    label:            sym,
                    data:             result.symContribs[sym],
                    fill:             false,
                    borderColor:      color,
                    backgroundColor:  color + '44',
                    borderWidth:      1.5,
                    tension:          0.3,
                    pointRadius:      0,
                    pointHoverRadius: 4,
                    spanGaps:         true,
                };
            });
        } else {
            datasets = CLUSTERS.map(function(cl) {
                return {
                    label:            cl.label,
                    data:             result.cumContribs[cl.id],
                    fill:             true,
                    backgroundColor:  cl.color + '28',
                    borderColor:      cl.color,
                    borderWidth:      1.5,
                    tension:          0.3,
                    pointRadius:      0,
                    pointHoverRadius: 4,
                };
            });
        }

        var isStacked = mode === 'clusters';
        var chartOpts = {
            responsive:          true,
            maintainAspectRatio: false,
            animation:           false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,14,26,0.92)',
                    borderColor:     'rgba(255,255,255,0.1)',
                    borderWidth:     1,
                    titleColor:      T.text2,
                    bodyColor:       T.text1,
                    titleFont:       { family: T.mono, size: 10 },
                    bodyFont:        { family: T.mono, size: 11 },
                    callbacks: {
                        label: function(ctx) {
                            var v = ctx.parsed.y;
                            if (v == null) return null;
                            return ' ' + ctx.dataset.label + ': ' + (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
                        },
                    },
                },
            },
            scales: {
                x: {
                    stacked: isStacked,
                    grid:    { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                    ticks:   { color: 'rgba(255,255,255,0.35)', font: { family: T.mono, size: 10 }, maxTicksLimit: 12 },
                    border:  { display: false },
                },
                y: {
                    stacked: isStacked,
                    grid:    { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                    ticks: {
                        color: 'rgba(255,255,255,0.35)',
                        font:  { family: T.mono, size: 10 },
                        callback: function(v) { return (v * 100).toFixed(1) + '%'; },
                    },
                    border: { display: false },
                },
            },
        };

        chartRef.current = new Chart(canvasRef.current, {
            type: 'line',
            data: { labels: result.dates, datasets: datasets },
            options: chartOpts,
        });

        return function() {
            if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        };
    }, [result, mode]);

    // ── Legend items (dynamic based on mode) ─────────────────────────────────
    var legendItems = mode === 'individual' && result && result.symbols
        ? result.symbols.map(function(sym, i) {
            return { label: sym, color: INDIVIDUAL_COLORS[i % INDIVIDUAL_COLORS.length] };
          })
        : CLUSTERS.map(function(cl) { return { label: cl.label, color: cl.color }; });

    var legendRow = h('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 10, marginBottom: 4 }
    },
        legendItems.map(function(item) {
            return h('div', {
                key:   item.label,
                style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.text1, fontFamily: T.mono }
            },
                h('span', { style: { width: 9, height: 9, background: item.color, borderRadius: 2, flexShrink: 0, display: 'inline-block' } }),
                item.label
            );
        })
    );

    // ── Individual symbol picker ──────────────────────────────────────────────
    var symbolPicker = mode === 'individual' && h('div', {
        style: { marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid ' + T.cardBorder, borderRadius: 6 }
    },
        h('div', { style: { fontSize: 9, color: T.text3, fontFamily: T.mono, letterSpacing: 1.2, marginBottom: 6 } }, 'SELECT SYMBOLS FOR CHART'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 } },
            equityPositions.map(function(p) {
                var active = selSyms[p.symbol];
                var cl     = clusterForSymbol(p.symbol);
                return h('button', {
                    key:     p.symbol,
                    onClick: (function(sym) { return function() {
                        setSelSyms(function(prev) {
                            var next = Object.assign({}, prev);
                            if (next[sym]) delete next[sym]; else next[sym] = true;
                            return next;
                        });
                    }; })(p.symbol),
                    style: {
                        padding:      '3px 8px',
                        borderRadius: 4,
                        fontSize:     9,
                        fontFamily:   T.mono,
                        fontWeight:   700,
                        cursor:       'pointer',
                        border:       '1px solid ' + (active ? cl.color : 'rgba(255,255,255,0.10)'),
                        background:   active ? cl.color + '22' : 'transparent',
                        color:        active ? cl.color : T.text2,
                        transition:   'all 0.1s',
                    },
                }, p.symbol);
            })
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
            h('button', {
                onClick: function() {
                    var all = {};
                    equityPositions.forEach(function(p) { all[p.symbol] = true; });
                    setSelSyms(all);
                },
                style: { fontSize: 9, fontFamily: T.mono, color: T.teal, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 },
            }, 'Select all'),
            h('button', {
                onClick: function() { setSelSyms({}); },
                style: { fontSize: 9, fontFamily: T.mono, color: T.text3, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 },
            }, 'Clear')
        )
    );

    // ── Mode toggle + filter bar extra controls ───────────────────────────────
    var modeToggle = h('div', { style: { display: 'flex', gap: 4 } },
        ['clusters', 'individual'].map(function(m) {
            var active = mode === m;
            return h('button', {
                key:     m,
                onClick: function() { setMode(m); },
                style: {
                    padding:      '3px 10px',
                    borderRadius: 4,
                    fontSize:     9,
                    fontFamily:   T.mono,
                    fontWeight:   700,
                    cursor:       'pointer',
                    border:       '1px solid ' + (active ? T.teal : 'rgba(255,255,255,0.12)'),
                    background:   active ? 'rgba(0,212,184,0.12)' : 'transparent',
                    color:        active ? T.teal : T.text2,
                },
            }, m === 'clusters' ? 'Clusters' : 'Individual');
        })
    );

    // ── Chart card ────────────────────────────────────────────────────────────
    var chartCard = h('div', { style: cardStyle },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
            h('div', { style: cardTitleStyle }, 'ROLLING ATTRIBUTION — CUMULATIVE CONTRIBUTION'),
            modeToggle
        ),
        symbolPicker,
        !histReady
            ? h(Loading, { text: 'Loading price history…' })
            : (result && result.dates && result.dates.length)
                ? h('div', null,
                    h('div', { style: { height: 280, width: '100%', position: 'relative' } },
                        h('canvas', { ref: canvasRef })
                    ),
                    legendRow
                )
                : h('div', {
                    style: { height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text2, fontSize: 13 }
                }, 'No price history available for attribution chart.')
    );

    // ── Contribution table ────────────────────────────────────────────────────
    var perfBySymbol = {};
    perfData.forEach(function(row) { perfBySymbol[row.symbol] = row; });

    // Filtered + sorted by |market_value|, no hard cap
    var tableRows = filteredPositions.slice().sort(function(a, b) {
        return Math.abs(Number(b.market_value) || 0) - Math.abs(Number(a.market_value) || 0);
    });

    // Sum of all positive gross P&Ls for % of Gains column (always over full universe)
    var allGrossPnls = equityPositions.map(function(pos) {
        var perf = perfBySymbol[pos.symbol];
        var ret = Number((perf && perf.total_return_pct) != null ? perf.total_return_pct : 0);
        var mv  = Number(pos.market_value) || 0;
        if (ret === -1) return 0;
        return (mv / (1 + ret)) * ret;
    });
    var totalPositiveGross = allGrossPnls.reduce(function(s, v) { return v > 0 ? s + v : s; }, 0);

    var tableCard = h('div', { style: cardStyle },
        h('div', { style: cardTitleStyle }, 'POSITION CONTRIBUTION DETAIL' + (filteredPositions.length < equityPositions.length ? ' (' + filteredPositions.length + ' of ' + equityPositions.length + ')' : '')),
        h(FilterBar, {
            search:       search,
            onSearch:     setSearch,
            sectors:      allSectors,
            activeSector: sector,
            onSector:     setSector,
            onClear:      function() { setSearch(''); setSector(''); },
        }),
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null,
                    h('tr', null,
                        h('th', { style: thStyle }, 'Symbol'),
                        h('th', { style: thStyle }, 'Sector'),
                        h('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, 'Days Held'),
                        h('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, 'Entry Eff.'),
                        h('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, 'Total Ret'),
                        h('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, 'Gross P&L'),
                        h('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, '% of Gains')
                    )
                ),
                h('tbody', null,
                    tableRows.map(function(pos, idx) {
                        var perf = perfBySymbol[pos.symbol] || {};
                        var ret  = Number(perf.total_return_pct != null ? perf.total_return_pct : 0);
                        var mv   = Number(pos.market_value) || 0;
                        var grossPnl = ret !== -1 ? (mv / (1 + ret)) * ret : 0;
                        var pctGains = totalPositiveGross > 0 && grossPnl > 0 ? grossPnl / totalPositiveGross : 0;
                        var daysHeld = perf.days_held != null ? perf.days_held : null;
                        var entEff   = perf.entry_efficiency != null ? Number(perf.entry_efficiency) : null;
                        var entEffColor = entEff == null ? T.text2 : entEff >= 90 ? T.green : entEff >= 70 ? T.amber : T.text2;
                        var retColor = ret >= 0 ? T.green : T.red;
                        var cluster  = clusterForSymbol(pos.symbol);

                        // Mini bar for % of gains
                        var barWidth = Math.min(pctGains * 100, 100);

                        return h('tr', { key: pos.symbol + idx },
                            h('td', { style: Object.assign({}, tdBase, { color: T.teal, cursor: 'pointer', fontWeight: 600 }),
                                onClick: function() {
                                    window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: pos.symbol } }));
                                }
                            }, pos.symbol),
                            h('td', { style: Object.assign({}, tdBase, { color: T.text2 }) }, pos.sector || '—'),
                            h('td', { style: Object.assign({}, tdBase, { textAlign: 'right' }) }, daysHeld != null ? daysHeld : '—'),
                            h('td', { style: Object.assign({}, tdBase, { textAlign: 'right', color: entEffColor }) },
                                entEff != null ? entEff.toFixed(0) + '%' : '—'
                            ),
                            h('td', { style: Object.assign({}, tdBase, { textAlign: 'right', color: retColor, fontWeight: 600 }) },
                                fmtPct(ret)
                            ),
                            h('td', { style: Object.assign({}, tdBase, { textAlign: 'right', color: grossPnl >= 0 ? T.green : T.red }) },
                                fmtDollar(grossPnl)
                            ),
                            h('td', { style: Object.assign({}, tdBase, { textAlign: 'right' }) },
                                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
                                    h('div', { style: {
                                        width: 40, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', flexShrink: 0
                                    }},
                                        h('div', { style: {
                                            width: barWidth + '%', height: '100%',
                                            background: cluster.color, borderRadius: 3,
                                        }})
                                    ),
                                    h('span', { style: { fontSize: 11, color: pctGains > 0 ? T.text1 : T.text3 } },
                                        pctGains > 0 ? (pctGains * 100).toFixed(1) + '%' : '—'
                                    )
                                )
                            )
                        );
                    })
                )
            )
        )
    );

    return h('div', null, chartCard, tableCard);
}

// ═════════════════════════════════════════════════════════════════════════════
// Module 2: FactorEnginePanel
// ═════════════════════════════════════════════════════════════════════════════

export function FactorEnginePanel(props) {
    var positions    = props.positions    || [];
    var histBySymbol = props.histBySymbol || {};
    var histReady    = props.histReady;
    var perfData     = props.perfData     || [];

    // ── Filter / sort state ───────────────────────────────────────────────────
    var _searchQ  = useState('');
    var searchQ   = _searchQ[0],  setSearchQ  = _searchQ[1];
    var _sectorF  = useState('');
    var sectorF   = _sectorF[0],  setSectorF  = _sectorF[1];
    var _sortKey  = useState('totalReturn');
    var sortKey   = _sortKey[0],  setSortKey  = _sortKey[1];
    var _sortDir  = useState(-1); // -1 = desc, 1 = asc
    var sortDir   = _sortDir[0],  setSortDir  = _sortDir[1];
    var _showAll  = useState(false);
    var showAll   = _showAll[0],  setShowAll  = _showAll[1];

    var decomps = useMemo(function() {
        if (!histReady) return [];
        return computeFactorDecomps(positions, histBySymbol, perfData);
    }, [positions, histBySymbol, histReady, perfData]);

    // All distinct sectors for FilterBar chips
    var allSectors = useMemo(function() {
        var seen = {};
        decomps.forEach(function(d) { if (d.sector) seen[d.sector] = true; });
        return Object.keys(seen).sort();
    }, [decomps]);

    // Filtered + sorted decomps for the table
    var filteredDecomps = useMemo(function() {
        var out = decomps.filter(function(d) {
            if (sectorF && d.sector !== sectorF) return false;
            if (searchQ && d.symbol.toUpperCase().indexOf(searchQ.toUpperCase()) === -1) return false;
            return true;
        });
        out = out.slice().sort(function(a, b) {
            var av = a[sortKey] != null ? a[sortKey] : (sortKey === 'sector_f' ? a.sector_f : 0);
            var bv = b[sortKey] != null ? b[sortKey] : (sortKey === 'sector_f' ? b.sector_f : 0);
            return sortDir * (bv - av);
        });
        return out;
    }, [decomps, sectorF, searchQ, sortKey, sortDir]);

    var displayDecomps = showAll ? filteredDecomps : filteredDecomps.slice(0, 12);

    function handleSort(key) {
        if (sortKey === key) { setSortDir(function(d) { return -d; }); }
        else { setSortKey(key); setSortDir(-1); }
    }

    function sortArrow(key) {
        if (sortKey !== key) return '';
        return sortDir === -1 ? ' ↓' : ' ↑';
    }

    function sortTh(label, key, accentColor) {
        var isActive = sortKey === key;
        return h('th', {
            style: Object.assign({}, thStyle, {
                textAlign:  'right',
                color:      isActive ? (accentColor || T.teal) : (accentColor || T.text3),
                cursor:     'pointer',
                userSelect: 'none',
                opacity:    isActive ? 1 : 0.7,
            }),
            onClick: function() { handleSort(key); },
        }, label + sortArrow(key));
    }

    // ── Aggregate factor sums — always over full decomps set ──────────────────
    var aggFactors = useMemo(function() {
        var agg = { mom: 0, quality: 0, value: 0, lowvol: 0, sector: 0 };
        decomps.forEach(function(d) {
            agg.mom     += d.mom;
            agg.quality += d.quality;
            agg.value   += d.value;
            agg.lowvol  += d.lowvol;
            agg.sector  += d.sector_f;
        });
        return agg;
    }, [decomps]);

    // ── Horizontal bar chart ──────────────────────────────────────────────────
    var barCanvasRef = useRef(null);
    var barChartRef  = useRef(null);

    useEffect(function() {
        if (!barCanvasRef.current || !decomps.length) return;
        if (barChartRef.current) { barChartRef.current.destroy(); barChartRef.current = null; }

        var factorLabels = ['Momentum', 'Quality', 'Value', 'Low-Vol', 'Sector'];
        var factorValues = [aggFactors.mom, aggFactors.quality, aggFactors.value, aggFactors.lowvol, aggFactors.sector];
        var factorColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#00d4b8'];

        barChartRef.current = new Chart(barCanvasRef.current, {
            type: 'bar',
            data: {
                labels: factorLabels,
                datasets: [{
                    data:            factorValues,
                    backgroundColor: factorColors.map(function(c) { return c + 'aa'; }),
                    borderColor:     factorColors,
                    borderWidth:     1.5,
                    borderRadius:    4,
                }],
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                animation:           false,
                indexAxis:           'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)',
                        borderColor:     'rgba(255,255,255,0.1)',
                        borderWidth:     1,
                        titleColor:      T.text2,
                        bodyColor:       T.text1,
                        titleFont:       { family: T.mono, size: 10 },
                        bodyFont:        { family: T.mono, size: 11 },
                        callbacks: {
                            label: function(ctx) {
                                var v = ctx.parsed.x;
                                return ' ' + (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid:   { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                        ticks:  { color: 'rgba(255,255,255,0.35)', font: { family: T.mono, size: 10 },
                            callback: function(v) { return (v * 100).toFixed(1) + '%'; } },
                        border: { display: false },
                    },
                    y: {
                        grid:   { display: false },
                        ticks:  { color: T.text1, font: { family: T.mono, size: 11 } },
                        border: { display: false },
                    },
                },
            },
        });

        return function() {
            if (barChartRef.current) { barChartRef.current.destroy(); barChartRef.current = null; }
        };
    }, [aggFactors, decomps]);

    // ── Momentum annotation ───────────────────────────────────────────────────
    var momAbs = Math.abs(aggFactors.mom);
    var momLabel = momAbs > 0.05
        ? 'validated — momentum is the dominant return driver'
        : momAbs > 0.02
            ? 'mixed — partial momentum signal'
            : 'weak — momentum explains little of gross P&L';
    var momAnnotation = 'Momentum explains ' + (momAbs * 100).toFixed(1) + '% of gross P&L — ' + momLabel;

    // ── Factor cell formatting ────────────────────────────────────────────────
    function factorCell(v) {
        var color = v >= 0 ? T.green : T.red;
        var bg = Math.abs(v) > 0.15 ? 'rgba(245,158,11,0.15)' : 'transparent';
        return h('td', {
            style: Object.assign({}, tdBase, { textAlign: 'right', color: color, background: bg, fontWeight: 500 })
        }, (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
    }

    var tableTitle = 'FACTOR DECOMPOSITION'
        + (filteredDecomps.length < decomps.length ? ' (' + filteredDecomps.length + ' of ' + decomps.length + ')' : '')
        + (!showAll && filteredDecomps.length > 12 ? ' — TOP 12' : '');

    var tableCard = h('div', { style: cardStyle },
        h('div', { style: cardTitleStyle }, tableTitle),
        h(FilterBar, {
            search:       searchQ,
            onSearch:     setSearchQ,
            sectors:      allSectors,
            activeSector: sectorF,
            onSector:     setSectorF,
            onClear:      function() { setSearchQ(''); setSectorF(''); },
        }),
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null,
                    h('tr', null,
                        h('th', { style: thStyle }, 'Symbol'),
                        h('th', { style: thStyle }, 'Sector'),
                        sortTh('Total Ret',  'totalReturn', null),
                        sortTh('Momentum',   'mom',         '#3b82f6'),
                        sortTh('Quality',    'quality',     '#10b981'),
                        sortTh('Value',      'value',       '#f59e0b'),
                        sortTh('Low-Vol',    'lowvol',      '#8b5cf6'),
                        sortTh('Sector',     'sector_f',    '#00d4b8'),
                        sortTh('Residual',   'residual',    null)
                    )
                ),
                h('tbody', null,
                    displayDecomps.map(function(d, idx) {
                        var retColor = d.totalReturn >= 0 ? T.green : T.red;
                        var residBg  = Math.abs(d.residual) > 0.15 ? 'rgba(245,158,11,0.15)' : 'transparent';
                        return h('tr', { key: d.symbol + idx },
                            h('td', { style: Object.assign({}, tdBase, { color: T.teal, fontWeight: 600, cursor: 'pointer' }),
                                onClick: function() {
                                    window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: d.symbol } }));
                                }
                            }, d.symbol),
                            h('td', { style: Object.assign({}, tdBase, { color: T.text2, fontSize: 11 }) }, d.sector || '—'),
                            h('td', { style: Object.assign({}, tdBase, { textAlign: 'right', color: retColor, fontWeight: 700 }) }, fmtPct(d.totalReturn)),
                            factorCell(d.mom),
                            factorCell(d.quality),
                            factorCell(d.value),
                            factorCell(d.lowvol),
                            factorCell(d.sector_f),
                            h('td', { style: Object.assign({}, tdBase, {
                                textAlign:  'right',
                                color:      Math.abs(d.residual) > 0.15 ? T.amber : T.text2,
                                background: residBg,
                            }) }, fmtPct(d.residual))
                        );
                    })
                )
            )
        ),
        filteredDecomps.length > 12 && h('div', { style: { marginTop: 10, textAlign: 'center' } },
            h('button', {
                onClick: function() { setShowAll(function(v) { return !v; }); },
                style: {
                    padding:      '4px 14px',
                    borderRadius: 4,
                    fontSize:     9,
                    fontFamily:   T.mono,
                    fontWeight:   700,
                    cursor:       'pointer',
                    border:       '1px solid rgba(255,255,255,0.12)',
                    background:   'transparent',
                    color:        T.text2,
                },
            }, showAll ? '▲ Show Top 12' : '▼ Show All ' + filteredDecomps.length)
        )
    );

    var barCard = h('div', { style: cardStyle },
        h('div', { style: cardTitleStyle }, 'PORTFOLIO-LEVEL FACTOR SUMMARY'),
        decomps.length
            ? h('div', null,
                h('div', { style: { height: 180, width: '100%', position: 'relative' } },
                    h('canvas', { ref: barCanvasRef })
                ),
                h('div', {
                    style: {
                        marginTop:    10,
                        fontSize:     11,
                        fontFamily:   T.mono,
                        color:        T.text2,
                        padding:      '8px 12px',
                        background:   'rgba(0,212,184,0.04)',
                        borderLeft:   '2px solid ' + T.teal,
                        borderRadius: '0 4px 4px 0',
                    }
                }, momAnnotation)
            )
            : h('div', {
                style: { height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text2, fontSize: 13 }
            }, 'Insufficient data — need 30+ days of price history per position.')
    );

    if (!histReady) {
        return h('div', { style: cardStyle }, h(Loading, { text: 'Loading factor data…' }));
    }

    return h('div', null, tableCard, barCard);
}

// ═════════════════════════════════════════════════════════════════════════════
// Module 3: RegimeSlicerPanel
// ═════════════════════════════════════════════════════════════════════════════

export function RegimeSlicerPanel(props) {
    var positions    = props.positions    || [];
    var histBySymbol = props.histBySymbol || {};
    var histReady    = props.histReady;
    var perfData     = props.perfData     || [];

    // ── Filter state ──────────────────────────────────────────────────────────
    var _searchQ     = useState('');
    var searchQ      = _searchQ[0],     setSearchQ      = _searchQ[1];
    var _sectorF     = useState('');
    var sectorF      = _sectorF[0],     setSectorF      = _sectorF[1];
    var _matchFilter = useState('all'); // 'all' | 'check' | 'cross' | 'approx'
    var matchFilter  = _matchFilter[0], setMatchFilter  = _matchFilter[1];
    var _regimeFilter= useState('all'); // 'all' | window name
    var regimeFilter = _regimeFilter[0],setRegimeFilter = _regimeFilter[1];

    var regimeData = useMemo(function() {
        if (!histReady) return [];
        return computeRegimeAttribution(positions, histBySymbol, perfData);
    }, [positions, histBySymbol, histReady, perfData]);

    // All distinct sectors
    var allSectors = useMemo(function() {
        var seen = {};
        regimeData.forEach(function(d) { if (d.sector) seen[d.sector] = true; });
        return Object.keys(seen).sort();
    }, [regimeData]);

    // Apply all filters
    var filteredData = useMemo(function() {
        return regimeData.filter(function(row) {
            if (sectorF && row.sector !== sectorF) return false;
            if (searchQ && row.symbol.toUpperCase().indexOf(searchQ.toUpperCase()) === -1) return false;
            if (matchFilter !== 'all' && row.pcmMatch !== matchFilter) return false;
            if (regimeFilter !== 'all') {
                var v = row.windowReturns[regimeFilter];
                if (v == null) return false;
            }
            return true;
        });
    }, [regimeData, sectorF, searchQ, matchFilter, regimeFilter]);

    if (!histReady) {
        return h('div', { style: cardStyle }, h(Loading, { text: 'Loading regime data…' }));
    }

    // ── PCM Match icon ────────────────────────────────────────────────────────
    function pcmIcon(match) {
        if (match === 'check')  return h('span', { style: { color: T.green,  fontSize: 14, fontWeight: 700 } }, '✓');
        if (match === 'cross')  return h('span', { style: { color: T.red,    fontSize: 14, fontWeight: 700 } }, '✗');
        return h('span', { style: { color: T.amber, fontSize: 14 } }, '~');
    }

    // ── PCM Match filter chips ────────────────────────────────────────────────
    var MATCH_CHIPS = [
        { key: 'all',    label: 'All',     color: T.text2 },
        { key: 'check',  label: '✓ Match', color: T.green },
        { key: 'cross',  label: '✗ Mis',   color: T.red   },
        { key: 'approx', label: '~ Ambig', color: T.amber },
    ];

    var matchChips = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
        MATCH_CHIPS.map(function(chip) {
            var active = matchFilter === chip.key;
            return h('button', {
                key:     chip.key,
                onClick: function() { setMatchFilter(chip.key); },
                style: {
                    padding:       '3px 9px',
                    borderRadius:  4,
                    fontSize:      9,
                    fontFamily:    T.mono,
                    fontWeight:    700,
                    letterSpacing: 0.8,
                    cursor:        'pointer',
                    border:        '1px solid ' + (active ? chip.color : 'rgba(255,255,255,0.12)'),
                    background:    active ? chip.color + '22' : 'transparent',
                    color:         active ? chip.color : T.text2,
                    transition:    'all 0.12s',
                },
            }, chip.label);
        })
    );

    // ── Regime filter chips ───────────────────────────────────────────────────
    var regimeChips = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
        [{ name: 'all', color: T.text2 }].concat(REGIME_WINDOWS).map(function(win) {
            var active = regimeFilter === win.name;
            var color  = win.color || T.text2;
            return h('button', {
                key:     win.name,
                onClick: function() { setRegimeFilter(win.name); },
                style: {
                    padding:       '3px 9px',
                    borderRadius:  4,
                    fontSize:      9,
                    fontFamily:    T.mono,
                    fontWeight:    700,
                    letterSpacing: 0.8,
                    cursor:        'pointer',
                    border:        '1px solid ' + (active ? color : 'rgba(255,255,255,0.12)'),
                    background:    active ? color + '22' : 'transparent',
                    color:         active ? color : T.text2,
                    transition:    'all 0.12s',
                },
            }, win.name === 'all' ? 'All Regimes' : win.name);
        })
    );

    var hasFilters = searchQ || sectorF || matchFilter !== 'all' || regimeFilter !== 'all';

    // ── Regime window column headers ──────────────────────────────────────────
    var regimeHeaders = REGIME_WINDOWS.map(function(win) {
        return h('th', {
            key: win.name,
            style: Object.assign({}, thStyle, {
                textAlign:     'center',
                color:         win.color,
                borderBottom:  '2px solid ' + win.color,
                paddingBottom: 6,
            })
        }, win.name);
    });

    var titleSuffix = filteredData.length < regimeData.length
        ? ' (' + filteredData.length + ' of ' + regimeData.length + ')'
        : '';

    return h('div', { style: cardStyle },
        h('div', { style: cardTitleStyle }, 'REGIME SLICER — POSITION RETURNS BY MACRO WINDOW' + titleSuffix),

        // Regime window date legend
        h('div', { style: { display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' } },
            REGIME_WINDOWS.map(function(win) {
                return h('div', {
                    key:   win.name,
                    style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: T.mono, color: T.text2 }
                },
                    h('span', { style: { width: 8, height: 8, background: win.color, borderRadius: 2, display: 'inline-block', flexShrink: 0 } }),
                    h('span', { style: { color: win.color } }, win.name),
                    h('span', null, ' ' + win.start + ' → ' + win.end)
                );
            })
        ),

        // Filter bar: search + sector chips
        h(FilterBar, {
            search:       searchQ,
            onSearch:     setSearchQ,
            sectors:      allSectors,
            activeSector: sectorF,
            onSector:     setSectorF,
            onClear:      function() { setSearchQ(''); setSectorF(''); setMatchFilter('all'); setRegimeFilter('all'); },
            extra:        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } },
                h('div', { style: { fontSize: 9, color: T.text3, fontFamily: T.mono, whiteSpace: 'nowrap' } }, 'PCM:'),
                matchChips,
                h('div', { style: { fontSize: 9, color: T.text3, fontFamily: T.mono, whiteSpace: 'nowrap', marginLeft: 6 } }, 'Regime:'),
                regimeChips
            ),
        }),

        filteredData.length === 0
            ? h('div', {
                style: { padding: '32px 0', textAlign: 'center', color: T.text2, fontSize: 13, fontFamily: T.mono }
            }, regimeData.length === 0
                ? 'No position data with sufficient price history for regime analysis.'
                : 'No positions match the active filters.'
            )
            : h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    h('thead', null,
                        h('tr', null,
                            h('th', { style: thStyle }, 'Symbol'),
                            h('th', { style: thStyle }, 'Sector'),
                            regimeHeaders,
                            h('th', { style: Object.assign({}, thStyle, { textAlign: 'right' }) }, 'Total Ret'),
                            h('th', { style: Object.assign({}, thStyle, { textAlign: 'center' }) }, 'PCM Match')
                        )
                    ),
                    h('tbody', null,
                        filteredData.map(function(row, idx) {
                            var retColor = row.totalReturn >= 0 ? T.green : T.red;

                            var regimeCells = REGIME_WINDOWS.map(function(win) {
                                var v  = row.windowReturns[win.name];
                                var bg = regimeCellBg(v);
                                var fc = v == null ? T.text3 : v >= 0 ? T.green : T.red;
                                return h('td', {
                                    key:   win.name,
                                    style: Object.assign({}, tdBase, {
                                        textAlign:  'center',
                                        background: bg,
                                        color:      fc,
                                        fontWeight: 500,
                                    })
                                }, v != null ? fmtPct(v, 1) : '—');
                            });

                            return h('tr', { key: row.symbol + idx },
                                h('td', { style: Object.assign({}, tdBase, { color: T.teal, fontWeight: 600, cursor: 'pointer' }),
                                    onClick: function() {
                                        window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: row.symbol } }));
                                    }
                                }, row.symbol),
                                h('td', { style: Object.assign({}, tdBase, { color: T.text2, fontSize: 11 }) }, row.sector || '—'),
                                regimeCells,
                                h('td', { style: Object.assign({}, tdBase, { textAlign: 'right', color: retColor, fontWeight: 700 }) },
                                    fmtPct(row.totalReturn)
                                ),
                                h('td', { style: Object.assign({}, tdBase, { textAlign: 'center' }) },
                                    pcmIcon(row.pcmMatch),
                                    row.bestRegime
                                        ? h('span', { style: { fontSize: 9, color: T.text3, display: 'block', fontFamily: T.mono } }, row.bestRegime)
                                        : null
                                )
                            );
                        })
                    )
                )
            )
    );
}
