// Caller check for every edge function (EF-1).
//
// The functions run with verify_jwt off: pg_cron and the nightly chain call
// them with no JWT, and verify_jwt would not help anyway -- the project's
// anon key is itself a valid JWT, so the gateway check passes for anyone
// holding the public key. So the check lives here, in the function.
//
// Three callers are accepted, and nothing else:
//   cron     Authorization: Bearer <CRON_SECRET>. The secret lives in Vault
//            and is compared INSIDE the database by atlas_check_cron_secret()
//            (service_role only), so it never has to be an edge secret too.
//   service  Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
//   user     a signed-in Supabase session, verified against /auth/v1/user --
//            only for functions the terminal calls from the browser
//            ({ user: true }). The anon key is refused: it carries no user.
//
// A check that cannot be completed (the database or auth server did not
// answer) refuses with 503. Failing open is how a lock becomes decoration.
//
// Plain JS, so `node --test` covers it (src/lib/edgeAuth.test.mjs), the same
// arrangement as alpaca_fill.js.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const CACHE_MS = 60_000
const cache = new Map()   // token -> { kind, until }

function bearer(req) {
  const h = (req && req.headers && req.headers.get && req.headers.get('authorization')) || ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : ''
}

// A JWT is three base64url segments. The cron secret is not one, so a JWT is
// never sent to the cron check and the secret is never sent to the auth server.
export function looksLikeJwt(t) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t)
}

function refuse(status, error) {
  return new Response(JSON.stringify({ error }), { status, headers: CORS })
}

// Returns null when the caller may proceed, or the Response to send.
// deps: { env: (name) => string|undefined, fetch, now }
export async function checkCaller(req, opts, deps) {
  const allowUser = !!(opts && opts.user)
  const env = deps.env
  const doFetch = deps.fetch
  const now = deps.now ? deps.now() : Date.now()

  // CORS preflight carries no credentials by design; the function's own
  // handler answers it and the real request that follows is checked.
  if (req.method === 'OPTIONS') return null

  const token = bearer(req)
  if (!token) return refuse(401, 'unauthorized')

  const hit = cache.get(token)
  if (hit && hit.until > now && (hit.kind !== 'user' || allowUser)) return null

  const url = (env('SUPABASE_URL') || '').replace(/\/+$/, '')
  const service = env('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !service) return refuse(503, 'auth check unavailable: service credentials missing')

  if (token === service) return null

  try {
    if (looksLikeJwt(token)) {
      if (!allowUser) return refuse(401, 'unauthorized')
      const r = await doFetch(url + '/auth/v1/user', {
        headers: { Authorization: 'Bearer ' + token, apikey: env('SUPABASE_ANON_KEY') || service },
      })
      if (r.status === 401 || r.status === 403) return refuse(401, 'unauthorized')
      if (!r.ok) return refuse(503, 'auth check unavailable: ' + r.status)
      const u = await r.json().catch(() => null)
      if (!u || !u.id) return refuse(401, 'unauthorized')
      cache.set(token, { kind: 'user', until: now + CACHE_MS })
      return null
    }
    const r = await doFetch(url + '/rest/v1/rpc/atlas_check_cron_secret', {
      method: 'POST',
      headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    })
    if (!r.ok) return refuse(503, 'auth check unavailable: ' + r.status)
    if ((await r.json().catch(() => false)) !== true) return refuse(401, 'unauthorized')
    cache.set(token, { kind: 'cron', until: now + CACHE_MS })
    return null
  } catch (e) {
    return refuse(503, 'auth check unavailable: ' + String((e && e.message) || e))
  }
}

export function clearCallerCache() { cache.clear() }

export function requireCaller(req, opts) {
  const D = globalThis.Deno
  return checkCaller(req, opts, { env: (n) => D.env.get(n), fetch: globalThis.fetch })
}

// What every function calls instead of Deno.serve: the handler runs only for
// an accepted caller. One wrapper, not a check pasted into each handler, so a
// function cannot be deployed with the check placed after the work it guards.
// edgeFunctionsGuarded.test.mjs fails any function that calls Deno.serve.
export function serveGuarded(opts, handler) {
  return globalThis.Deno.serve(async (req, info) => {
    const denied = await requireCaller(req, opts)
    return denied ?? handler(req, info)
  })
}
