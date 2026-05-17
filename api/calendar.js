// Vercel Serverless Function: economic calendar for ATLAS Terminal.
//
// Generates upcoming key US economic release dates from known schedules
// (NFP, CPI, FOMC, PCE, PPI, Retail Sales, GDP, Initial Claims, etc.).
// FOMC dates are hard-coded from the Fed's published 2026-2027 schedule.
// All other releases are computed from well-established monthly patterns.
//
// Environment variables:
//   SUPABASE_URL / ATLAS_SUPABASE_URL   -- optional, for durable cache
//   SUPABASE_SERVICE_ROLE_KEY           -- optional, for durable cache
//   ATLAS_ALLOWED_ORIGIN                -- optional CORS allow-list

var CACHE_KEY = 'calendar_data';
var CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---- date helpers ----

function ymd(d) { return d.toISOString().slice(0, 10); }

function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }

// nth occurrence of weekday (0=Sun, 1=Mon … 6=Sat) in a given month
function nthWeekdayOfMonth(n, wd, year, month) {
    var d = new Date(year, month, 1), cnt = 0;
    while (d.getMonth() === month) {
        if (d.getDay() === wd) { cnt++; if (cnt === n) return new Date(d); }
        d.setDate(d.getDate() + 1);
    }
    return null;
}

// Last occurrence of weekday in a month
function lastWeekdayOfMonth(wd, year, month) {
    var d = new Date(year, month + 1, 0); // last calendar day of month
    while (d.getDay() !== wd) d.setDate(d.getDate() - 1);
    return d;
}

// First weekday on or after a given date
function nextWeekday(wd, fromDate) {
    var d = new Date(fromDate);
    while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
    return d;
}

// Advance past weekend (Sat→Mon, Sun→Mon)
function skipWeekend(d) {
    var r = new Date(d);
    if (r.getDay() === 6) r.setDate(r.getDate() + 2);
    if (r.getDay() === 0) r.setDate(r.getDate() + 1);
    return r;
}

function daysUntil(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
}

// ---- FOMC published schedule ----
// Fed announces FOMC meeting end-dates (decision day) well in advance.
// These are the dates for 2026 and 2027 FOMC meetings.
var FOMC_DATES = [
    // 2026
    '2026-01-29', '2026-03-19', '2026-04-30',
    '2026-06-18', '2026-07-30', '2026-09-17',
    '2026-10-29', '2026-12-10',
    // 2027
    '2027-01-28', '2027-03-18', '2027-04-29',
    '2027-06-17', '2027-07-29', '2027-09-16',
    '2027-10-28', '2027-12-09',
];

// ---- Generate schedule ----

function generateSchedule(fromDate, daysAhead) {
    var events = [];
    var f = new Date(fromDate); f.setHours(0, 0, 0, 0);
    var t = addDays(f, daysAhead);

    function push(dateObj, time, event, category, importance) {
        if (!dateObj) return;
        var d = new Date(dateObj); d.setHours(0, 0, 0, 0);
        if (d >= f && d <= t) {
            events.push({
                date: ymd(d),
                time: time,
                event: event,
                category: category,
                importance: importance,
                country: 'United States',
                daysUntil: daysUntil(ymd(d)),
            });
        }
    }

    // FOMC meetings
    FOMC_DATES.forEach(function(ds) {
        var d = new Date(ds + 'T00:00:00');
        if (d >= f && d <= t) {
            events.push({
                date: ds, time: '14:00 ET',
                event: 'FOMC Rate Decision',
                category: 'Monetary Policy',
                importance: 'High',
                country: 'United States',
                daysUntil: daysUntil(ds),
            });
        }
    });

    // Monthly events — iterate over each month in range
    var cur = new Date(f.getFullYear(), f.getMonth(), 1);
    while (cur <= t) {
        var y = cur.getFullYear(), mo = cur.getMonth(); // 0-based

        // Non-Farm Payrolls (Employment Situation): 1st Friday of month
        push(nthWeekdayOfMonth(1, 5, y, mo), '08:30 ET', 'Non-Farm Payrolls', 'Employment', 'High');

        // CPI: typically 2nd or 3rd Wednesday (~10-14 days after month end)
        var cpi = nthWeekdayOfMonth(2, 3, y, mo);  // 2nd Wednesday
        if (cpi) cpi = addDays(cpi, 2);             // shift +2 to approx mid-month
        push(cpi, '08:30 ET', 'Consumer Price Index (CPI)', 'Inflation', 'High');

        // PPI: typically 1 day before CPI
        if (cpi) push(skipWeekend(addDays(cpi, -1)), '08:30 ET', 'Producer Price Index (PPI)', 'Inflation', 'Medium');

        // Retail Sales: 2nd Thursday of month
        push(nthWeekdayOfMonth(2, 4, y, mo), '08:30 ET', 'Retail Sales (MoM)', 'Consumer', 'High');

        // PCE (Personal Income & Outlays): last Friday of month
        push(lastWeekdayOfMonth(5, y, mo), '08:30 ET', 'PCE Price Index', 'Inflation', 'High');

        // ISM Manufacturing PMI: 1st business day of month
        push(skipWeekend(new Date(y, mo, 1)), '10:00 ET', 'ISM Manufacturing PMI', 'Manufacturing', 'Medium');

        // ISM Services PMI: 3rd business day of month
        var ismsvc = skipWeekend(new Date(y, mo, 3));
        if (ismsvc.getMonth() !== mo) ismsvc = skipWeekend(new Date(y, mo, 4));
        push(ismsvc, '10:00 ET', 'ISM Services PMI', 'Services', 'Medium');

        // JOLTS Job Openings: ~3rd Tuesday of month
        push(nthWeekdayOfMonth(3, 2, y, mo), '10:00 ET', 'JOLTS Job Openings', 'Employment', 'Medium');

        // GDP Advance Estimate: quarters Jan / Apr / Jul / Oct (~4th Wednesday of month)
        if (mo === 0 || mo === 3 || mo === 6 || mo === 9) {
            push(nthWeekdayOfMonth(4, 3, y, mo), '08:30 ET', 'GDP (Advance Estimate)', 'Growth', 'High');
        }

        // Housing Starts: 3rd Wednesday
        push(nthWeekdayOfMonth(3, 3, y, mo), '08:30 ET', 'Housing Starts', 'Housing', 'Low');

        // Durable Goods Orders: 4th Friday (approximately)
        push(nthWeekdayOfMonth(4, 5, y, mo), '08:30 ET', 'Durable Goods Orders', 'Manufacturing', 'Medium');

        // Initial Jobless Claims: every Thursday (weekly)
        var thurs = nextWeekday(4, new Date(y, mo, 1));
        while (thurs.getMonth() === mo) {
            push(thurs, '08:30 ET', 'Initial Jobless Claims', 'Employment', 'Medium');
            thurs = addDays(thurs, 7);
        }

        cur.setMonth(cur.getMonth() + 1);
    }

    // Sort by date, remove duplicates within same date+event
    events.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var seen = {};
    events = events.filter(function(e) {
        var k = e.date + '|' + e.event;
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });

    return events;
}

// ---- Supabase cache ----

async function fetchWithTimeout(url, opts, ms) {
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, ms || 8000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

function supaCfg() {
    var url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key: key };
}

async function readCache(cacheKey) {
    var cfg = supaCfg(); if (!cfg) return null;
    try {
        var r = await fetchWithTimeout(
            cfg.url + '/rest/v1/cache?cache_key=eq.' + encodeURIComponent(cacheKey) + '&select=payload,expires_at',
            { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' } }, 4000
        );
        if (!r.ok) return null;
        var rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
        return rows[0].payload;
    } catch (_) { return null; }
}

async function writeCache(cacheKey, payload, ttlMs) {
    var cfg = supaCfg(); if (!cfg) return;
    try {
        await fetchWithTimeout(cfg.url + '/rest/v1/cache', {
            method: 'POST',
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{ cache_key: cacheKey, payload: payload, cached_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlMs).toISOString() }]),
        }, 4000);
    } catch (_) { /* non-fatal */ }
}

// ---- CORS ----

function applyCors(res) {
    var origin = process.env.ATLAS_ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---- handler ----

export default async function handler(req, res) {
    applyCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    try {
        var nocache = req.query && (req.query.nocache === '1' || req.query.nocache === 'true');

        if (!nocache) {
            var cached = await readCache(CACHE_KEY);
            if (cached) return res.status(200).json(cached);
        }

        var today = new Date();
        var events = generateSchedule(today, 60); // next 60 days

        var high  = events.filter(function(e) { return e.importance === 'High'; }).length;
        var upcoming3 = events.filter(function(e) { return e.daysUntil >= 0; }).slice(0, 3);

        var payload = {
            events: events,
            summary: { total: events.length, high: high, upcoming3: upcoming3 },
            _ts: Date.now(),
            window: { start: ymd(today), end: ymd(addDays(today, 60)) },
        };
        writeCache(CACHE_KEY, payload, CACHE_TTL_MS);
        return res.status(200).json(payload);
    } catch (err) {
        return res.status(500).json({ error: (err && err.message) || 'Internal error' });
    }
};
