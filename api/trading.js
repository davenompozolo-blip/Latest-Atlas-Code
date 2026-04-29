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
            return res.status(400).json({ error: 'Unknown action. Use: quote|chart|account|search' });
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
