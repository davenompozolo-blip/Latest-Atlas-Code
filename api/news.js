// Vercel Serverless Function: financial news RSS aggregator for ATLAS Terminal.
//
// Fetches RSS/Atom feeds from multiple financial news sources, parses with
// regex (no external packages), deduplicates by title, and caches in
// Supabase (15 min TTL).
//
// Environment variables:
//   SUPABASE_URL / ATLAS_SUPABASE_URL   -- optional, for durable cache
//   SUPABASE_SERVICE_ROLE_KEY           -- optional, for durable cache
//   ATLAS_ALLOWED_ORIGIN                -- optional CORS allow-list

var SOURCES = [
    { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', color: '#10b981' },
    { name: 'CNBC',        url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',        color: '#00a0dd' },
    { name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/businessNews',               color: '#f59e0b' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex',                   color: '#8b5cf6' },
];

var CACHE_KEY = 'news_data';
var CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ---- XML / RSS helpers (no external packages) ----

async function fetchWithTimeout(url, opts, ms) {
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, ms || 9000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

function stripHtml(s) {
    return (s || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\s{2,}/g, ' ').trim();
}

function extractTag(block, tag) {
    var cdRe = new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/' + tag + '>', 'i');
    var plRe  = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
    var m = cdRe.exec(block) || plRe.exec(block);
    return m ? m[1].trim() : null;
}

function extractImage(block) {
    // media:thumbnail url="..."
    var m = /<media:thumbnail[^>]+url=["']([^"']+)["']/i.exec(block);
    if (m) return m[1];
    // media:content with image type
    m = /<media:content[^>]+url=["']([^"']+)["'][^>]*(?:medium=["']image["']|type=["']image[^"']*["'])/i.exec(block)
     || /<media:content[^>]+(?:medium=["']image["']|type=["']image[^"']*["'])[^>]+url=["']([^"']+)["']/i.exec(block);
    if (m) return m[1];
    // media:content any URL that looks like an image
    m = /<media:content[^>]+url=["']([^"']+)["']/i.exec(block);
    if (m && /\.(jpe?g|png|webp|gif)/i.test(m[1])) return m[1];
    // enclosure with image type
    m = /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image[^"']*["']/i.exec(block)
     || /<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i.exec(block);
    if (m) return m[1];
    return null;
}

function extractLink(block) {
    // Atom <link href="..."/> or RSS <link>url</link>
    var m = /<link[^>]+href=["']([^"'>]+)["']/i.exec(block)
         || /<link[^>]*>\s*(https?:\/\/[^\s<]+)/i.exec(block);
    return m ? m[1].trim() : null;
}

function parseDate(s) {
    if (!s) return Date.now();
    try { var t = new Date(s).getTime(); return isNaN(t) ? Date.now() : t; }
    catch (_) { return Date.now(); }
}

function timeAgo(ts) {
    var ms = Date.now() - ts;
    if (ms < 60000) return 'Just now';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
    if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
    return Math.floor(ms / 86400000) + 'd ago';
}

async function fetchSource(src, limit) {
    try {
        var r = await fetchWithTimeout(src.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ATLAS-Terminal/2.0; +https://atlas.finance)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
            }
        }, 9000);
        if (!r.ok) return [];
        var xml = await r.text();

        // Parse <item> (RSS) or <entry> (Atom) blocks
        var items = [];
        var re = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
        var m;
        while ((m = re.exec(xml)) !== null && items.length < (limit || 10)) {
            var block = m[1] || m[2];
            var title   = stripHtml(extractTag(block, 'title') || '');
            var link    = extractLink(block) || stripHtml(extractTag(block, 'link') || '');
            var pubRaw  = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated') || '';
            var rawDesc = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content:encoded') || extractTag(block, 'content') || '';
            var summary = stripHtml(rawDesc).slice(0, 240);
            if (summary.length === 240) summary += '…';
            var ts        = parseDate(pubRaw);
            var thumbnail = extractImage(block);
            if (title && link) {
                items.push({ title: title, source: src.name, color: src.color, link: link, published: ts, timeAgo: timeAgo(ts), summary: summary, thumbnail: thumbnail || null });
            }
        }
        return items;
    } catch (_) { return []; }
}

// ---- Supabase cache (mirrors macro.js) ----

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

        // Fetch all sources in parallel; tolerate individual failures
        var results = await Promise.all(SOURCES.map(function(src) { return fetchSource(src, 10); }));
        var items = [].concat.apply([], results);

        // Sort newest first, deduplicate by title prefix
        items.sort(function(a, b) { return b.published - a.published; });
        var seen = {};
        items = items.filter(function(item) {
            var key = item.title.slice(0, 55).toLowerCase().replace(/\s+/g, ' ');
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
        items = items.slice(0, 50);

        var sourceStats = SOURCES.map(function(s) {
            var count = items.filter(function(i) { return i.source === s.name; }).length;
            return { name: s.name, color: s.color, count: count };
        });

        var payload = { items: items, sources: sourceStats, _ts: Date.now() };
        writeCache(CACHE_KEY, payload, CACHE_TTL_MS);
        return res.status(200).json(payload);
    } catch (err) {
        return res.status(500).json({ error: (err && err.message) || 'Internal error' });
    }
};
