// Vercel Serverless Function: trading data + order execution for ATLAS Terminal.
//
// Actions:
//   GET  ?action=quote&symbol=AAPL        — live quote from Alpaca snapshot
//   GET  ?action=chart&symbol=AAPL&range=1Y — OHLCV bars (LightweightCharts format)
//   GET  ?action=account                   — Alpaca account summary
//   GET  ?action=search&q=apple            — symbol search
//   POST ?action=order                     — submit order (paper or live)
//
// Environment variables:
//   ALPACA_API_KEY        — required
//   ALPACA_API_SECRET     — required
//   ALPACA_PAPER          — 'true' (default) | 'false' for live
//   ATLAS_ALLOWED_ORIGIN  — optional CORS allow-list

'use strict';

const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,14}$/;
const ALPACA_DATA = 'https://data.alpaca.markets/v2';

function alpacaHdrs() {
    var key = process.env.ALPACA_API_KEY;
    var secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) throw new Error('ALPACA_API_KEY / ALPACA_API_SECRET not configured');
    return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' };
}

function brokerBase() {
    var paper = (process.env.ALPACA_PAPER || 'true').toLowerCase() !== 'false';
    return paper
        ? 'https://paper-api.alpaca.markets/v2'
        : 'https://api.alpaca.markets/v2';
}

function isPaper() {
    return (process.env.ALPACA_PAPER || 'true').toLowerCase() !== 'false';
}

async function fetchT(url, opts, ms) {
    var ac = new AbortController();
    var t = setTimeout(function () { ac.abort(); }, ms || 9000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

function cors(res) {
    var origin = process.env.ATLAS_ALLOWED_ORIGIN;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
    }
}

// ── Quote ─────────────────────────────────────────────────────────────────────

async function getQuote(symbol) {
    var hdrs = alpacaHdrs();
    var r = await fetchT(
        ALPACA_DATA + '/stocks/' + encodeURIComponent(symbol) + '/snapshot',
        { headers: hdrs }, 8000
    );
    if (r.status === 404) throw new Error('Symbol not found: ' + symbol);
    if (r.status === 403 || r.status === 401) throw new Error('Alpaca auth failed');
    if (!r.ok) throw new Error('Alpaca snapshot HTTP ' + r.status);
    var s = await r.json();
    var lq = s.latestQuote || {};
    var lt = s.latestTrade || {};
    var db = s.dailyBar || {};
    var pb = s.prevDailyBar || {};
    var last = lt.p != null ? lt.p : db.c;
    var prev = pb.c;
    var change = (last != null && prev != null) ? last - prev : null;
    var changePct = (change != null && prev) ? change / prev * 100 : null;
    return {
        symbol:    symbol,
        last:      last,
        change:    change,
        changePct: changePct,
        bid:       lq.bp || null,
        ask:       lq.ap || null,
        bidSize:   lq.bs || null,
        askSize:   lq.as || null,
        open:      db.o  || null,
        high:      db.h  || null,
        low:       db.l  || null,
        prevClose: prev  || null,
        volume:    db.v  || null,
        vwap:      db.vw || null,
    };
}

// ── Chart ─────────────────────────────────────────────────────────────────────

var RANGES = {
    '1D':  { tf: '5Min',  days: 1   },
    '5D':  { tf: '15Min', days: 5   },
    '1M':  { tf: '1Hour', days: 30  },
    '3M':  { tf: '1Day',  days: 90  },
    '6M':  { tf: '1Day',  days: 180 },
    '1Y':  { tf: '1Day',  days: 365 },
    '5Y':  { tf: '1Week', days: 1825 },
};

async function getBars(symbol, range) {
    var cfg = RANGES[range] || RANGES['1Y'];
    var end   = new Date();
    var start = new Date(end.getTime() - cfg.days * 86400000);
    var url = ALPACA_DATA + '/stocks/' + encodeURIComponent(symbol) + '/bars'
        + '?timeframe=' + cfg.tf
        + '&start='     + start.toISOString().slice(0, 10)
        + '&end='       + end.toISOString().slice(0, 10)
        + '&limit=10000&adjustment=raw&feed=iex';
    var r = await fetchT(url, { headers: alpacaHdrs() }, 12000);
    if (r.status === 404) throw new Error('Symbol not found: ' + symbol);
    if (!r.ok) throw new Error('Alpaca bars HTTP ' + r.status);
    var j = await r.json();
    return ((j && j.bars) || []).map(function (b) {
        return {
            time:   Math.floor(new Date(b.t).getTime() / 1000),
            open:   b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
        };
    });
}

// ── Account ───────────────────────────────────────────────────────────────────

async function getAccount() {
    var r = await fetchT(brokerBase() + '/account', { headers: alpacaHdrs() }, 8000);
    if (!r.ok) throw new Error('Alpaca account HTTP ' + r.status);
    var a = await r.json();
    var eq  = parseFloat(a.equity)      || 0;
    var leq = parseFloat(a.last_equity) || 0;
    return {
        mode:        isPaper() ? 'PAPER' : 'LIVE',
        equity:      eq,
        cash:        parseFloat(a.cash)          || 0,
        buyingPower: parseFloat(a.buying_power)  || 0,
        dayPnl:      eq - leq,
        dayPnlPct:   leq ? (eq - leq) / leq * 100 : 0,
    };
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchAssets(q) {
    var url = brokerBase() + '/assets?status=active&asset_class=us_equity'
        + '&search=' + encodeURIComponent(q);
    var r = await fetchT(url, { headers: alpacaHdrs() }, 6000);
    if (!r.ok) return [];
    var assets = await r.json();
    return (Array.isArray(assets) ? assets : [])
        .filter(function (a) { return a.tradable; })
        .slice(0, 8)
        .map(function (a) { return { symbol: a.symbol, name: a.name || a.symbol, exchange: a.exchange || '' }; });
}

// ── Order ─────────────────────────────────────────────────────────────────────

async function submitOrder(body) {
    var payload = {
        symbol:        ((body.symbol || '').toUpperCase()),
        side:          body.side   || 'buy',
        type:          body.type   || 'market',
        time_in_force: body.tif    || 'day',
    };
    if (body.notional && !body.qty) {
        payload.notional = String(body.notional);
    } else {
        payload.qty = String(body.qty || 1);
    }
    if (body.limitPrice) payload.limit_price = String(body.limitPrice);
    if (body.stopPrice)  payload.stop_price  = String(body.stopPrice);

    var hdrs = Object.assign({}, alpacaHdrs(), { 'Content-Type': 'application/json' });
    var r = await fetchT(brokerBase() + '/orders', {
        method: 'POST', headers: hdrs, body: JSON.stringify(payload),
    }, 10000);
    var j = await r.json();
    if (!r.ok) throw new Error((j && j.message) || ('Alpaca order HTTP ' + r.status));
    return { id: j.id, status: j.status, symbol: j.symbol, qty: j.qty, side: j.side, type: j.order_type };
}

// ── Handler ───────────────────────────────────────────────────────────────────

// ── Order history ─────────────────────────────────────────────────────────────

async function getOrders(status, limit) {
    var url = brokerBase() + '/orders?status=' + (status || 'all')
        + '&limit=' + (limit || 50) + '&direction=desc';
    var r = await fetchT(url, { headers: alpacaHdrs() }, 8000);
    if (!r.ok) throw new Error('Alpaca orders HTTP ' + r.status);
    var orders = await r.json();
    return (Array.isArray(orders) ? orders : []).map(function (o) {
        return {
            id:         o.id,
            symbol:     o.symbol,
            side:       o.side,
            type:       o.order_type || o.type,
            qty:        o.qty,
            filledQty:  o.filled_qty,
            limitPrice: o.limit_price,
            stopPrice:  o.stop_price,
            filledAvg:  o.filled_avg_price,
            status:     o.status,
            tif:        o.time_in_force,
            createdAt:  o.created_at,
            updatedAt:  o.updated_at,
        };
    });
}

// ── Options chain ─────────────────────────────────────────────────────────────

var OPTS_DATA = 'https://data.alpaca.markets/v1beta1';

// Parse OCC symbol → { expiry, type, strike }
function parseOCC(sym, underlying) {
    var rest = sym.slice(underlying.length);            // e.g. 260501C00087000
    if (rest.length < 15) return null;
    var yy = rest.slice(0, 2), mm = rest.slice(2, 4), dd = rest.slice(4, 6);
    var type   = rest[6];                              // C or P
    var strike = parseInt(rest.slice(7), 10) / 1000;  // 00087000 → 87.00
    return { expiry: '20' + yy + '-' + mm + '-' + dd, type: type, strike: strike };
}

async function getOptionExpiries(underlying) {
    var today = new Date().toISOString().slice(0, 10);

    // Try broker API first (paper-api or api) — contract metadata lives here
    var brokerUrl = brokerBase() + '/options/contracts?underlying_symbols='
        + encodeURIComponent(underlying)
        + '&expiration_date_gte=' + today
        + '&status=active&limit=500';
    var r = await fetchT(brokerUrl, { headers: alpacaHdrs() }, 10000);

    // Fall back to data API if broker returns 404/403
    if (!r.ok && (r.status === 404 || r.status === 422)) {
        var dataUrl = OPTS_DATA + '/options/contracts?underlying_symbols='
            + encodeURIComponent(underlying)
            + '&expiration_date_gte=' + today + '&status=active&limit=500';
        r = await fetchT(dataUrl, { headers: alpacaHdrs() }, 10000);
    }

    if (!r.ok) {
        var errBody = {};
        try { errBody = await r.json(); } catch (_) {}
        throw new Error(
            'Options contracts HTTP ' + r.status +
            (errBody.message ? ': ' + errBody.message : '') +
            ' — options data may require options trading to be enabled on your Alpaca account'
        );
    }

    var j = await r.json();
    var contracts = (j && j.option_contracts) || (Array.isArray(j) ? j : []);
    if (!contracts.length) {
        throw new Error('No active options contracts found for ' + underlying + '. The symbol may not have listed options, or options trading may not be enabled on your account.');
    }
    var expiries = {};
    contracts.forEach(function (c) {
        var d = c.expiration_date;
        if (d) expiries[d] = true;
    });
    var sorted = Object.keys(expiries).sort();
    if (!sorted.length) throw new Error('Options contracts returned but no expiry dates found for ' + underlying);
    return sorted.slice(0, 20);
}

async function getOptionsChain(underlying, expiry) {
    // Try indicative feed first; if that returns no data try without feed param
    var feeds = ['indicative', ''];
    var lastErr = null;

    for (var fi = 0; fi < feeds.length; fi++) {
        var feedParam = feeds[fi] ? '&feed=' + feeds[fi] : '';
        var url = OPTS_DATA + '/options/snapshots/' + encodeURIComponent(underlying)
            + '?expiration_date=' + encodeURIComponent(expiry) + feedParam + '&limit=500';
        var r;
        try { r = await fetchT(url, { headers: alpacaHdrs() }, 12000); }
        catch (e) { lastErr = e; continue; }

        if (!r.ok) {
            var eb = {};
            try { eb = await r.json(); } catch (_) {}
            lastErr = new Error('Options snapshots HTTP ' + r.status + (eb.message ? ': ' + eb.message : ''));
            continue;
        }

        var j = await r.json();
        var snaps = (j && j.snapshots) || {};
        var keys = Object.keys(snaps);
        if (!keys.length) { lastErr = new Error('No snapshot data returned for ' + underlying + ' expiry ' + expiry); continue; }

        var calls = [], puts = [];
        keys.forEach(function (sym) {
            var parsed = parseOCC(sym, underlying);
            if (!parsed) return;
            var s = snaps[sym];
            var lq = s.latestQuote   || {};
            var lt = s.latestTrade   || {};
            var db = s.dailyBar      || {};
            var pb = s.prevDailyBar  || {};
            var last = lt.p != null ? lt.p : db.c;
            var prev = pb.c;
            var chg  = (last != null && prev != null) ? last - prev : null;
            var row = {
                symbol: sym, strike: parsed.strike, type: parsed.type,
                bid:    lq.bp != null ? lq.bp : null,
                ask:    lq.ap != null ? lq.ap : null,
                last:   last, chg: chg,
                volume: db.v  || lt.s || 0,
                oi:     s.openInterest  || null,
                iv:     s.impliedVolatility || null,
                delta:  s.greeks ? s.greeks.delta : null,
                gamma:  s.greeks ? s.greeks.gamma : null,
                theta:  s.greeks ? s.greeks.theta : null,
                vega:   s.greeks ? s.greeks.vega  : null,
                rho:    s.greeks ? s.greeks.rho   : null,
            };
            if (parsed.type === 'C') calls.push(row);
            else puts.push(row);
        });
        calls.sort(function (a, b) { return a.strike - b.strike; });
        puts.sort(function (a, b)  { return a.strike - b.strike;  });
        return { calls: calls, puts: puts, expiry: expiry };
    }
    throw lastErr || new Error('Options chain unavailable for ' + underlying + ' ' + expiry);
}

// ── IV Surface ────────────────────────────────────────────────────────────────

async function getIVSurface(underlying) {
    var sym = underlying.toUpperCase();

    // Get the list of available expiries first (reuse existing function)
    var expiries = await getExpiries(sym);
    // Limit to 10 nearest expiries to keep parallel fetch fast
    expiries = expiries.slice(0, 10);

    // Fetch each expiry in parallel using the same snapshot path that works for the chain
    async function fetchExpiry(expiry) {
        var feeds = ['indicative', ''];
        for (var fi = 0; fi < feeds.length; fi++) {
            var feedParam = feeds[fi] ? '&feed=' + feeds[fi] : '';
            var url = OPTS_DATA + '/options/snapshots/' + encodeURIComponent(sym)
                + '?expiration_date=' + encodeURIComponent(expiry) + feedParam + '&limit=500';
            var r;
            try { r = await fetchT(url, { headers: alpacaHdrs() }, 15000); }
            catch (e) { continue; }
            if (!r.ok) continue;
            var j = await r.json();
            return (j && j.snapshots) || {};
        }
        return {};
    }

    var results = await Promise.all(expiries.map(fetchExpiry));

    var strikesSet = {};
    var ivData = {};

    expiries.forEach(function (expiry, i) {
        var snaps = results[i];
        Object.keys(snaps).forEach(function (occSym) {
            var parsed = parseOCC(occSym, sym);
            if (!parsed) return;
            var s = snaps[occSym];
            var iv = s.impliedVolatility;
            if (!iv || !isFinite(iv) || iv <= 0 || iv > 20) return;
            strikesSet[parsed.strike] = true;
            var key = expiry + '|' + parsed.strike;
            if (!ivData[key]) ivData[key] = {};
            if (parsed.type === 'C') ivData[key].call = iv;
            else ivData[key].put = iv;
        });
    });

    if (!Object.keys(ivData).length) throw new Error('No IV data available for ' + sym);

    return {
        expiries: expiries,
        strikes:  Object.keys(strikesSet).map(Number).sort(function (a, b) { return a - b; }),
        ivData:   ivData,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
    cors(res);

    var action = ((req.query && req.query.action) || '').toLowerCase();

    try {
        // ── GET ──────────────────────────────────────────────────────────────
        if (req.method === 'GET') {
            if (action === 'quote') {
                var sym = ((req.query.symbol) || '').toUpperCase().trim();
                if (!sym || !SYMBOL_RE.test(sym)) return res.status(400).json({ error: 'Bad symbol' });
                return res.status(200).json(await getQuote(sym));
            }
            if (action === 'chart') {
                var sym = ((req.query.symbol) || '').toUpperCase().trim();
                var range = (req.query.range || '1Y').toUpperCase();
                if (!sym || !SYMBOL_RE.test(sym)) return res.status(400).json({ error: 'Bad symbol' });
                var bars = await getBars(sym, range);
                return res.status(200).json({ symbol: sym, range: range, bars: bars });
            }
            if (action === 'account') {
                return res.status(200).json(await getAccount());
            }
            if (action === 'search') {
                var q = ((req.query.q) || '').trim();
                if (!q) return res.status(200).json([]);
                return res.status(200).json(await searchAssets(q));
            }
            if (action === 'orders') {
                var status = req.query.status || 'all';
                var limit  = parseInt(req.query.limit) || 50;
                return res.status(200).json(await getOrders(status, limit));
            }
            if (action === 'option_expiries') {
                var sym = ((req.query.symbol) || '').toUpperCase().trim();
                if (!sym || !SYMBOL_RE.test(sym)) return res.status(400).json({ error: 'Bad symbol' });
                return res.status(200).json(await getOptionExpiries(sym));
            }
            if (action === 'options_chain') {
                var sym    = ((req.query.symbol) || '').toUpperCase().trim();
                var expiry = (req.query.expiry || '').trim();
                if (!sym || !SYMBOL_RE.test(sym)) return res.status(400).json({ error: 'Bad symbol' });
                if (!expiry) return res.status(400).json({ error: 'expiry required (YYYY-MM-DD)' });
                return res.status(200).json(await getOptionsChain(sym, expiry));
            }
            if (action === 'iv_surface') {
                var sym = ((req.query.symbol) || '').toUpperCase().trim();
                if (!sym || !SYMBOL_RE.test(sym)) return res.status(400).json({ error: 'Bad symbol' });
                return res.status(200).json(await getIVSurface(sym));
            }
            return res.status(400).json({ error: 'Unknown action. Use: quote|chart|account|search|orders|option_expiries|options_chain|iv_surface' });
        }

        // ── POST ─────────────────────────────────────────────────────────────
        if (req.method === 'POST') {
            if (action === 'order') {
                var body = req.body || {};
                if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }
                var order = await submitOrder(body);
                return res.status(200).json({ success: true, order: order });
            }
            return res.status(400).json({ error: 'Unknown POST action: ' + action });
        }

        return res.status(405).json({ error: req.method + ' not allowed' });

    } catch (e) {
        var msg = (e && e.message) ? e.message : String(e);
        var status = /not found|404/i.test(msg) ? 404
                   : /auth|401|403/i.test(msg) ? 502
                   : /rate limit|429/i.test(msg) ? 429
                   : 502;
        return res.status(status).json({ error: msg });
    }
};
