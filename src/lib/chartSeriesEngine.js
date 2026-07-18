// ============================================================
// chartSeriesEngine.js — single source for comparison-series
// alignment and window-scoped metrics.
// ------------------------------------------------------------
// Consumed by BOTH chart surfaces (spec §6 of the realized layer):
//   • Nexus beat 08 — Evidence bench
//   • PERF → Charts (AdvancedChart)
// Both are thin renderers over this engine; do not fork the maths.
//
// Contract (§6.2):
//   alignSeries({ raw, ids, timeframe, normalise, today })
//       → { dates, series: [{ id, values, ohlc, meta }], warnings: [] }
//   computeMetrics({ dates, series, referenceId, rf })
//       → [{ id, insufficient, totalReturn, annReturn, vol, maxDD,
//            sharpe, beta, corr, upCapture, downCapture, obs }]
//   rollingBeta({ dates, series, referenceId, window })
//       → { dates, values } aligned to the display axis
//
// Alignment rules (fixes the verified §6.1 failure modes):
//   • The union date axis is the REFERENCE series' calendar (portfolio
//     when present, else the first series). Every other series is
//     left-joined onto it by date and forward-filled through gaps.
//   • Leading dates where a series has no history yet stay null (the
//     line starts when the asset starts) — and a warning is emitted.
//   • Normalise rebases every series to 100 at the COMMON start date:
//     the first axis date where every plotted series has a value. A
//     series with no value on that date rebases at its own first
//     observation and is flagged in warnings — visible, not silent.
//   • warnings[] is part of the return value and must be rendered.
//
// Pure ES module — no React, no DOM, no IO. The fetch layer stays in
// the consuming components (they already own their Supabase access);
// makeRequestGate() below gives them stale-response protection.
// ============================================================

export var TIMEFRAMES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];
var MIN_OBS = 20; // below this a metrics row renders "insufficient history"

export function timeframeCutoff(tf, today) {
    var now = today ? new Date(today) : new Date();
    var c = new Date(now);
    if      (tf === '1M')  c.setMonth(c.getMonth() - 1);
    else if (tf === '3M')  c.setMonth(c.getMonth() - 3);
    else if (tf === '6M')  c.setMonth(c.getMonth() - 6);
    else if (tf === 'YTD') { c.setMonth(0); c.setDate(1); }
    else if (tf === '1Y')  c.setFullYear(c.getFullYear() - 1);
    else if (tf === '3Y')  c.setFullYear(c.getFullYear() - 3);
    else if (tf === '5Y')  c.setFullYear(c.getFullYear() - 5);
    else return null;
    return c.toISOString().slice(0, 10);
}

// raw: { id → [{ date:'YYYY-MM-DD', close, open?, high?, low?, volume? }] }
// ids: ordered series ids to align (first portfolio when present).
// Returns the §6.2 shape. Values are closes; ohlc kept for candle mode.
export function alignSeries(opts) {
    var raw = opts.raw || {};
    var ids = (opts.ids || []).slice();
    var timeframe = opts.timeframe;
    var normalise = !!opts.normalise;
    var warnings = [];

    // Reference calendar: the portfolio when present, else the first series.
    var refId = ids.indexOf('portfolio') >= 0 ? 'portfolio' : ids[0];
    var refRows = (raw[refId] || []).slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });

    // Drop ids with no data at all — fail loud, not blank.
    var live = [];
    ids.forEach(function(id) {
        if (raw[id] && raw[id].length) live.push(id);
        else warnings.push({ id: id, kind: 'no_data', text: id + ': no price history — not plotted' });
    });
    if (!live.length || !refRows.length) return { dates: [], series: [], warnings: warnings };

    var cutoff = timeframeCutoff(timeframe, opts.today);
    var dates = refRows
        .map(function(r) { return r.date; })
        .filter(function(d) { return !cutoff || d >= cutoff; });
    if (!dates.length) return { dates: [], series: [], warnings: warnings };

    // Left-join each series onto the reference axis, forward-filling gaps.
    var joined = live.map(function(id) {
        var byDate = {};
        (raw[id] || []).forEach(function(r) {
            var c = Number(r.close);
            if (isFinite(c) && c > 0) byDate[r.date] = r;
        });
        // Seed the forward-fill with the last observation BEFORE the window,
        // so a series that traded before the window but not on its first day
        // doesn't lose its opening value.
        var seed = null;
        (raw[id] || []).forEach(function(r) {
            var c = Number(r.close);
            if (isFinite(c) && c > 0 && r.date < dates[0] && (!seed || r.date > seed.date)) seed = r;
        });
        var last = seed, filled = 0, values = [], ohlc = [];
        dates.forEach(function(d) {
            var row = byDate[d];
            if (row) last = row;
            else if (last) filled++;
            values.push(last ? Number(last.close) : null);
            ohlc.push(last ? {
                open: Number(last.open != null ? last.open : last.close),
                high: Number(last.high != null ? last.high : last.close),
                low:  Number(last.low  != null ? last.low  : last.close),
                close: Number(last.close),
                volume: Number(last.volume || 0),
            } : null);
        });
        if (filled > 0 && id !== refId) {
            warnings.push({ id: id, kind: 'forward_filled', text: id + ': ' + filled + ' non-trading day' + (filled === 1 ? '' : 's') + ' forward-filled to the ' + (refId === 'portfolio' ? 'portfolio' : refId) + ' calendar' });
        }
        var firstIdx = values.findIndex(function(v) { return v != null; });
        if (firstIdx > 0) {
            warnings.push({ id: id, kind: 'truncated_history', text: id + ': history starts ' + dates[firstIdx] + ' — earlier dates not plotted' });
        }
        return { id: id, values: values, ohlc: ohlc, firstIdx: firstIdx < 0 ? null : firstIdx };
    });

    // Common start = first axis date where every plottable series has a value.
    var commonIdx = 0;
    joined.forEach(function(s) {
        if (s.firstIdx != null && s.firstIdx > commonIdx) commonIdx = s.firstIdx;
    });

    if (normalise) {
        joined.forEach(function(s) {
            var baseIdx = (s.firstIdx != null && s.firstIdx > commonIdx) ? s.firstIdx : commonIdx;
            var base = s.values[baseIdx];
            if (baseIdx !== commonIdx) {
                warnings.push({ id: s.id, kind: 'late_rebase', text: s.id + ': rebased at its own first observation (' + dates[baseIdx] + '), not the common start' });
            }
            if (base == null || !(base > 0)) return;
            s.values = s.values.map(function(v) { return v == null ? null : +(v / base * 100).toFixed(4); });
            s.ohlc = s.ohlc.map(function(o) {
                return o == null ? null : {
                    open: +(o.open / base * 100).toFixed(4),
                    high: +(o.high / base * 100).toFixed(4),
                    low:  +(o.low  / base * 100).toFixed(4),
                    close: +(o.close / base * 100).toFixed(4),
                    volume: o.volume,
                };
            });
        });
    }

    return {
        dates: dates,
        commonStart: dates[commonIdx] || null,
        series: joined.map(function(s) {
            return { id: s.id, values: s.values, ohlc: s.ohlc, meta: { firstDate: s.firstIdx == null ? null : dates[s.firstIdx] } };
        }),
        warnings: warnings,
    };
}

// Simple daily returns from an aligned value array (nulls skipped).
function alignedReturns(values) {
    var out = [];
    for (var i = 1; i < values.length; i++) {
        var a = values[i - 1], b = values[i];
        out.push(a != null && b != null && a > 0 ? b / a - 1 : null);
    }
    return out;
}

// ----------------------------------------------------------------
// computeMetrics — every number is computed over the displayed
// window ONLY (the aligned arrays from alignSeries). Beta, corr and
// up/down capture are always measured against the reference series
// (ATLAS Portfolio), even in asset-vs-asset mode.
//   rf: annual risk-free rate (fraction) for Sharpe.
// ----------------------------------------------------------------
export function computeMetrics(opts) {
    var dates = opts.dates || [];
    var series = opts.series || [];
    var refId = opts.referenceId || 'portfolio';
    var rf = opts.rf != null ? opts.rf : 0.045;

    var ref = series.find(function(s) { return s.id === refId; }) || null;
    var refRets = ref ? alignedReturns(ref.values) : null;

    return series.map(function(s) {
        var vals = s.values.filter(function(v) { return v != null; });
        if (vals.length < MIN_OBS) {
            return { id: s.id, insufficient: true, obs: vals.length };
        }
        var first = null, last = null;
        s.values.forEach(function(v) { if (v != null) { if (first == null) first = v; last = v; } });
        var totalReturn = first > 0 ? last / first - 1 : null;

        var firstIdx = s.values.findIndex(function(v) { return v != null; });
        var lastIdx = s.values.length - 1;
        while (lastIdx > 0 && s.values[lastIdx] == null) lastIdx--;
        var days = Math.max((new Date(dates[lastIdx]) - new Date(dates[firstIdx])) / 86400000, 1);
        var annReturn = totalReturn != null ? Math.pow(1 + totalReturn, 365.25 / days) - 1 : null;

        var rets = alignedReturns(s.values);
        var live = rets.filter(function(r) { return r != null; });
        var mean = live.reduce(function(a, b) { return a + b; }, 0) / (live.length || 1);
        var variance = live.reduce(function(a, b) { return a + (b - mean) * (b - mean); }, 0) / (live.length || 1);
        var vol = Math.sqrt(variance) * Math.sqrt(252);
        var sharpe = vol > 0 && annReturn != null ? (annReturn - rf) / vol : null;

        var peak = null, maxDD = 0;
        s.values.forEach(function(v) {
            if (v == null) return;
            if (peak == null || v > peak) peak = v;
            var dd = (v - peak) / peak;
            if (dd < maxDD) maxDD = dd;
        });

        // Beta / corr / capture vs the reference over paired observations.
        var beta = null, corr = null, upCapture = null, downCapture = null;
        if (refRets && s.id !== refId) {
            var xs = [], ys = [];
            for (var i = 0; i < rets.length; i++) {
                if (rets[i] != null && refRets[i] != null) { ys.push(rets[i]); xs.push(refRets[i]); }
            }
            if (xs.length >= MIN_OBS) {
                var mx = xs.reduce(function(a, b) { return a + b; }, 0) / xs.length;
                var my = ys.reduce(function(a, b) { return a + b; }, 0) / ys.length;
                var cov = 0, vx = 0, vy = 0;
                for (var j = 0; j < xs.length; j++) {
                    cov += (xs[j] - mx) * (ys[j] - my);
                    vx += (xs[j] - mx) * (xs[j] - mx);
                    vy += (ys[j] - my) * (ys[j] - my);
                }
                beta = vx > 0 ? cov / vx : null;
                corr = (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : null;
                var upS = 0, upR = 0, dnS = 0, dnR = 0;
                for (var k = 0; k < xs.length; k++) {
                    if (xs[k] > 0) { upS += ys[k]; upR += xs[k]; }
                    else if (xs[k] < 0) { dnS += ys[k]; dnR += xs[k]; }
                }
                upCapture = upR !== 0 ? (upS / upR) * 100 : null;
                downCapture = dnR !== 0 ? (dnS / dnR) * 100 : null;
            }
        } else if (s.id === refId) {
            beta = 1; corr = 1;
        }

        return {
            id: s.id, insufficient: false, obs: vals.length,
            totalReturn: totalReturn, annReturn: annReturn, vol: vol, maxDD: maxDD,
            sharpe: sharpe, beta: beta, corr: corr,
            upCapture: upCapture, downCapture: downCapture,
        };
    });
}

// ----------------------------------------------------------------
// rollingBeta — rolling window beta of one series vs the reference,
// on the aligned axis. The beat-08 subplot ("rolling 60d beta vs
// portfolio") is this with window=60.
// Returns { dates, values } where values[i] is null until a full
// window of paired observations exists.
// ----------------------------------------------------------------
export function rollingBeta(opts) {
    var dates = opts.dates || [];
    var series = opts.series || [];
    var refId = opts.referenceId || 'portfolio';
    var id = opts.id;
    var window = opts.window || 60;

    var ref = series.find(function(s) { return s.id === refId; });
    var tgt = series.find(function(s) { return s.id === id; });
    if (!ref || !tgt) return { dates: dates, values: dates.map(function() { return null; }) };

    var rr = alignedReturns(ref.values);
    var tr = alignedReturns(tgt.values);
    var values = [null]; // index 0 has no return
    for (var i = 0; i < rr.length; i++) {
        if (i + 1 < window) { values.push(null); continue; }
        var xs = [], ys = [];
        for (var j = i - window + 1; j <= i; j++) {
            if (rr[j] != null && tr[j] != null) { xs.push(rr[j]); ys.push(tr[j]); }
        }
        if (xs.length < Math.floor(window * 0.8)) { values.push(null); continue; }
        var mx = xs.reduce(function(a, b) { return a + b; }, 0) / xs.length;
        var my = ys.reduce(function(a, b) { return a + b; }, 0) / ys.length;
        var cov = 0, vx = 0;
        for (var k = 0; k < xs.length; k++) {
            cov += (xs[k] - mx) * (ys[k] - my);
            vx += (xs[k] - mx) * (xs[k] - mx);
        }
        values.push(vx > 0 ? cov / vx : null);
    }
    return { dates: dates, values: values };
}

// ----------------------------------------------------------------
// Technical indicators — shared by both chart surfaces (previously
// private to advanced-chart.js). All operate on plain close arrays
// and return arrays of the same length with leading nulls.
// ----------------------------------------------------------------
export function sma(prices, period) {
    return prices.map(function(_, i) {
        if (i < period - 1) return null;
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += prices[j];
        return sum / period;
    });
}

export function ema(prices, period) {
    var k = 2 / (period + 1);
    var result = new Array(prices.length).fill(null);
    var prev = null;
    prices.forEach(function(v, i) {
        if (i < period - 1) return;
        if (prev === null) {
            prev = 0;
            for (var j = 0; j < period; j++) prev += prices[j];
            prev /= period;
            result[i] = prev;
            return;
        }
        prev = v * k + prev * (1 - k);
        result[i] = prev;
    });
    return result;
}

export function bollingerBands(prices, period, mult) {
    period = period || 20; mult = mult || 2;
    var mid = sma(prices, period);
    return prices.map(function(_, i) {
        if (mid[i] === null) return { upper: null, mid: null, lower: null };
        var slice = prices.slice(Math.max(0, i - period + 1), i + 1);
        var avg = mid[i];
        var variance = 0;
        slice.forEach(function(v) { variance += (v - avg) * (v - avg); });
        var std = Math.sqrt(variance / slice.length);
        return { upper: avg + mult * std, mid: avg, lower: avg - mult * std };
    });
}

export function rsi(closes, period) {
    period = period || 14;
    var gains = [], losses = [];
    for (var i = 1; i < closes.length; i++) {
        var diff = closes[i] - closes[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    var result = [null];
    var avgGain = 0, avgLoss = 0;
    for (var j = 0; j < period && j < gains.length; j++) { avgGain += gains[j]; avgLoss += losses[j]; }
    avgGain /= period; avgLoss /= period;
    for (var k = 0; k < gains.length; k++) {
        if (k < period) { result.push(null); continue; }
        avgGain = (avgGain * (period - 1) + gains[k])  / period;
        avgLoss = (avgLoss * (period - 1) + losses[k]) / period;
        result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return result;
}

export function macd(closes, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    var emaFast = ema(closes, fast);
    var emaSlow = ema(closes, slow);
    var macdLine = closes.map(function(_, i) {
        return emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null;
    });
    var signalLine = ema(macdLine.map(function(v) { return v !== null ? v : 0; }), signal);
    var histogram = macdLine.map(function(v, i) {
        return v !== null && signalLine[i] !== null ? v - signalLine[i] : null;
    });
    return { macdLine: macdLine, signalLine: signalLine, histogram: histogram };
}

// ----------------------------------------------------------------
// makeRequestGate — stale-response protection for the fetch layer
// (§6.1 #4). Each call to gate() returns a token; isCurrent(token)
// is false once a newer request started, so late responses are
// discarded instead of overwriting fresh state.
// ----------------------------------------------------------------
export function makeRequestGate() {
    var seq = 0;
    return {
        next: function() { return ++seq; },
        isCurrent: function(token) { return token === seq; },
    };
}
