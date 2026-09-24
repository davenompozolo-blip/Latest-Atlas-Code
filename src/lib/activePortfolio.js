// MP-2: which portfolio this browser is looking at.
//
// The database decides what a portfolio id MEANS: atlas_active_portfolio()
// reads the x-atlas-portfolio request header, validates it against
// `portfolios`, and falls back to the default. This module only carries the
// choice -- it never decides, on its own, which book is shown. The switcher
// renders what vw_portfolios says the SERVER resolved (`is_active`), not what
// this module believes, so a stale or unknown id can never display one book
// under another's name.
//
// The choice is read ONCE, at module load, and is fixed for the life of the
// page. Switching reloads. That is deliberate: loaders cache in module-level
// promises and memos across the app, and a partial switch would put two books
// on one screen -- the failure this whole feature exists to prevent.
//
// Two transports, one choice:
//   - direct Supabase reads carry it as the x-atlas-portfolio HEADER
//     (supabase.js sets it on the client);
//   - /api/* routes take it as a ?portfolio= QUERY PARAM, because those
//     responses are CDN-cached by URL (up to 6h) and a header is not part of
//     the cache key -- one account's cached answer would be served to the other.

export const STORAGE_KEY = 'atlas.portfolio.v1';
export const PORTFOLIO_HEADER = 'x-atlas-portfolio';
export const PORTFOLIO_PARAM = 'portfolio';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPortfolioId(v) {
    return typeof v === 'string' && UUID_RE.test(v);
}

function defaultStorage() {
    try { return globalThis.localStorage || null; } catch (_) { return null; }
}

/** The stored choice, or null. Storage can be absent or throw (private window,
 *  blocked site data); either way the answer is "no choice", never an error. */
export function readStoredPortfolio(storage = defaultStorage()) {
    try {
        const v = storage ? storage.getItem(STORAGE_KEY) : null;
        return isPortfolioId(v) ? v.toLowerCase() : null;
    } catch (_) {
        return null;
    }
}

/** Persist a choice; null (or anything that is not a portfolio id) clears it,
 *  which means "the default portfolio". Returns whether storage accepted it. */
export function writeStoredPortfolio(id, storage = defaultStorage()) {
    try {
        if (!storage) return false;
        if (isPortfolioId(id)) storage.setItem(STORAGE_KEY, id.toLowerCase());
        else storage.removeItem(STORAGE_KEY);
        return true;
    } catch (_) {
        return false;
    }
}

/** The choice for this page load. Fixed until reload. */
export const ACTIVE_PORTFOLIO = readStoredPortfolio();

/** Headers for a direct Supabase request. Empty when no choice was made, so
 *  the server resolves the default -- exactly the pre-MP-2 behaviour. */
export function portfolioHeaders(id = ACTIVE_PORTFOLIO) {
    return isPortfolioId(id) ? { [PORTFOLIO_HEADER]: id.toLowerCase() } : {};
}

/** An /api/* URL carrying the choice as a query param (part of the CDN cache
 *  key). Unchanged when no choice was made. */
export function withPortfolio(url, id = ACTIVE_PORTFOLIO) {
    if (!isPortfolioId(id)) return url;
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + PORTFOLIO_PARAM + '=' + encodeURIComponent(id.toLowerCase());
}

/**
 * The switcher's state from vw_portfolios rows. `active` is the row the SERVER
 * resolved (is_active), never a client-side guess; `mismatch` is true when the
 * stored choice names a portfolio the server did not resolve to (deleted, or a
 * stale id), so the UI can say it fell back rather than silently showing the
 * default under the chosen name.
 */
export function switcherState(rows, chosen = ACTIVE_PORTFOLIO) {
    const list = Array.isArray(rows) ? rows.filter((r) => r && isPortfolioId(r.id)) : [];
    const active = list.find((r) => r.is_active === true) || null;
    const onDefault = active ? active.is_default === true : null;
    const mismatch = Boolean(isPortfolioId(chosen) && active && active.id.toLowerCase() !== chosen.toLowerCase());
    return { options: list, active, onDefault, mismatch };
}

/**
 * Tag a same-origin /api/* URL with the choice. Anything else -- Supabase
 * (another origin), third-party hosts, non-API paths -- is returned untouched,
 * and a URL that already carries ?portfolio= is never double-tagged.
 */
export function tagApiUrl(url, id = ACTIVE_PORTFOLIO, origin = null) {
    if (!isPortfolioId(id) || typeof url !== 'string') return url;
    let path = url;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
        if (!origin || url.indexOf(origin + '/') !== 0) return url;
        path = url.slice(origin.length);
    }
    if (path.indexOf('/api/') !== 0) return url;
    if (/[?&]portfolio=/.test(url)) return url;
    return withPortfolio(url, id);
}

/**
 * FAIL-CLOSED: tag every same-origin /api/* request with the choice, once, at
 * startup. The account-level Alpaca actions in api/trading.js (account, orders,
 * order status, ORDER SUBMISSION) still use the default account's keys until
 * MP-3, and refuse any request that names another portfolio. Tagging at the
 * transport means a call site cannot forget to name the account -- the
 * alternative, a withPortfolio() at every one of ~20 call sites, is how one gets
 * missed and an order meant for one account executes in the other.
 * A no-op when no choice was made (the default account), so the default
 * account's requests are byte-for-byte what they were.
 */
export function installApiPortfolioTagging(win = globalThis, id = ACTIVE_PORTFOLIO) {
    if (!isPortfolioId(id) || !win || typeof win.fetch !== 'function') return false;
    if (win.fetch.__atlasPortfolioTagged) return true;
    const orig = win.fetch.bind(win);
    const origin = (win.location && win.location.origin) || null;
    const tagged = function (input, init) {
        if (typeof input === 'string') {
            input = tagApiUrl(input, id, origin);
        } else if (typeof URL !== 'undefined' && input instanceof URL) {
            const u = tagApiUrl(input.href, id, origin);
            if (u !== input.href) input = new URL(u);
        } else if (typeof Request !== 'undefined' && input instanceof Request) {
            const u = tagApiUrl(input.url, id, origin);
            if (u !== input.url) input = new Request(u, input);
        }
        return orig(input, init);
    };
    tagged.__atlasPortfolioTagged = true;
    win.fetch = tagged;
    return true;
}
