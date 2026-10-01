// AUTH-2: every same-origin /api/* request carries the signed-in user's access
// token. Installed once at the transport, like the portfolio tag (MP-2): ~70
// call sites fetch /api, and a header added at each one is how one gets missed.
// Third-party hosts and Supabase itself are never given the token here --
// supabase-js attaches it to its own requests.

/** Whether a URL is a same-origin /api/ path. */
export function isApiUrl(url, origin = null) {
    if (typeof url !== 'string') return false;
    let path = url;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
        if (!origin || url.indexOf(origin + '/') !== 0) return false;
        path = url.slice(origin.length);
    }
    return path.indexOf('/api/') === 0;
}

function hasAuthHeader(headers) {
    if (!headers) return false;
    if (typeof headers.has === 'function') return headers.has('authorization');
    if (Array.isArray(headers)) return headers.some(([k]) => String(k).toLowerCase() === 'authorization');
    return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
}

/**
 * Wrap win.fetch. `getToken` returns the current access token (or null) and may
 * be async; supabase-js refreshes an expiring session inside getSession(), so
 * asking per request never sends a stale token. A call that already sets its
 * own Authorization (none do today) is left alone.
 */
export function installApiAuth(win = globalThis, getToken) {
    if (!win || typeof win.fetch !== 'function' || typeof getToken !== 'function') return false;
    if (win.fetch.__atlasApiAuth) return true;
    const orig = win.fetch.bind(win);
    const origin = (win.location && win.location.origin) || null;
    const authed = async function (input, init) {
        let url = null;
        if (typeof input === 'string') url = input;
        else if (typeof URL !== 'undefined' && input instanceof URL) url = input.href;
        else if (typeof Request !== 'undefined' && input instanceof Request) url = input.url;
        if (!isApiUrl(url, origin)) return orig(input, init);
        if (hasAuthHeader(init && init.headers) || (input && input.headers && hasAuthHeader(input.headers))) {
            return orig(input, init);
        }
        let token = null;
        try { token = await getToken(); } catch (_) { token = null; }
        if (!token) return orig(input, init);   // the route answers 401; nothing to attach
        if (typeof Request !== 'undefined' && input instanceof Request) {
            const h = new Headers(input.headers);
            h.set('Authorization', 'Bearer ' + token);
            return orig(new Request(input, { headers: h }), init);
        }
        const h = new Headers((init && init.headers) || undefined);
        h.set('Authorization', 'Bearer ' + token);
        return orig(input, Object.assign({}, init, { headers: h }));
    };
    authed.__atlasApiAuth = true;
    authed.__atlasPortfolioTagged = win.fetch.__atlasPortfolioTagged;
    win.fetch = authed;
    return true;
}
