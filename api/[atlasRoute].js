// ============================================================
// The ONE Vercel function behind every /api/<name> route (VD-1).
//
// The Hobby plan allows 12 Serverless Functions per deployment and Atlas has
// 36 routes, so each route's handler lives in server/api/<name>.js and this
// file dispatches to it. URLs are unchanged: /api/equity?endpoint=daily still
// reaches server/api/equity.js with req.query.endpoint = 'daily'.
//
// The table is literal on purpose: each import() names its file, so Vercel's
// bundler traces every handler into this function, and an unknown name is a
// 404 here rather than a path built from the request. Handlers load lazily, so
// a call to one route does not pay for parsing the other 35.
// src/lib/apiDispatch.test.mjs fails when a file in server/api/ is missing
// from the table, or a second function appears in api/.
// ============================================================

export const ROUTES = Object.freeze({
    'access-request': () => import('../server/api/access-request.js'),
    'account-notify': () => import('../server/api/account-notify.js'),
    'broker-accounts': () => import('../server/api/broker-accounts.js'),
    'calendar': () => import('../server/api/calendar.js'),
    'claude-analyse': () => import('../server/api/claude-analyse.js'),
    'claude-sector': () => import('../server/api/claude-sector.js'),
    'command-centre': () => import('../server/api/command-centre.js'),
    'diag': () => import('../server/api/diag.js'),
    'edgar': () => import('../server/api/edgar.js'),
    'equity': () => import('../server/api/equity.js'),
    'funds': () => import('../server/api/funds.js'),
    'github-status': () => import('../server/api/github-status.js'),
    'health': () => import('../server/api/health.js'),
    'ledger-export': () => import('../server/api/ledger-export.js'),
    'ledger-snapshot': () => import('../server/api/ledger-snapshot.js'),
    'macro': () => import('../server/api/macro.js'),
    'movers': () => import('../server/api/movers.js'),
    'news': () => import('../server/api/news.js'),
    'nexus-bench': () => import('../server/api/nexus-bench.js'),
    'nexus-board': () => import('../server/api/nexus-board.js'),
    'nexus-cot': () => import('../server/api/nexus-cot.js'),
    'nexus-earnings': () => import('../server/api/nexus-earnings.js'),
    'nexus-opportunities': () => import('../server/api/nexus-opportunities.js'),
    'nexus-theme': () => import('../server/api/nexus-theme.js'),
    'onboarding': () => import('../server/api/onboarding.js'),
    'options-snapshot': () => import('../server/api/options-snapshot.js'),
    'price-backfill': () => import('../server/api/price-backfill.js'),
    'screener-market': () => import('../server/api/screener-market.js'),
    'sync-financials': () => import('../server/api/sync-financials.js'),
    'sync-statements-edgar': () => import('../server/api/sync-statements-edgar.js'),
    'sync-valuations': () => import('../server/api/sync-valuations.js'),
    'theme-leadership-snapshot': () => import('../server/api/theme-leadership-snapshot.js'),
    'trade-sync': () => import('../server/api/trade-sync.js'),
    'trading': () => import('../server/api/trading.js'),
    'vercel-status': () => import('../server/api/vercel-status.js'),
    'vol-dispersion-sync': () => import('../server/api/vol-dispersion-sync.js'),
});

/** The route name: Vercel's [atlasRoute] segment, else the path itself. */
export function routeName(req) {
    const q = req.query || {};
    if (typeof q.atlasRoute === 'string' && q.atlasRoute) return q.atlasRoute;
    const m = /^\/api\/([^/?#]+)/.exec(String(req.url || ''));
    return m ? decodeURIComponent(m[1]) : '';
}

// Vercel puts the [atlasRoute] path segment into req.query beside the real
// query string. It is removed before the handler runs, so no route ever sees
// a parameter it did not ask for.
export default async function dispatch(req, res) {
    const name = routeName(req);
    if (req.query) delete req.query.atlasRoute;
    const load = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
    if (!load) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'not_found' });
    }
    const mod = await load();
    return mod.default(req, res);
}
