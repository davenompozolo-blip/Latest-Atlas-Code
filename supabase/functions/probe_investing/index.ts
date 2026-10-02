// Disabled. One-off probe used to confirm investing.com (tvc6) is
// Cloudflare-blocked from the Supabase edge network (403). Kept as a
// tombstone so the slug isn't reused accidentally.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serveGuarded } from '../_shared/edge_auth.js'
serveGuarded({ user: false }, () => new Response(
  JSON.stringify({ disabled: true, reason: 'investing.com is Cloudflare-blocked; probe retired' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } }
))
