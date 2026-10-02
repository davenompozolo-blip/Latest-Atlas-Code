// ============================================================
// ATLAS Edge Function: claude_sql_assistant
// ------------------------------------------------------------
// Proxies Claude API calls from the static Vercel frontend.
// Keeps ANTHROPIC_API_KEY server-side (Supabase secret).
//
// POST body: { messages, schema, mode }
//   messages  — array of { role: 'user'|'assistant', content: string }
//   schema    — object { tableName: [{ name, type }] }
//   mode      — 'sql' | 'ideas'
//
// Required Supabase secret: ANTHROPIC_API_KEY
// Optional Supabase secret: ANTHROPIC_MODEL (override default)
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { serveGuarded } from '../_shared/edge_auth.js'

const CLAUDE_API     = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL  = 'claude-sonnet-4-6'
const MAX_TOKENS     = 4096
const CLAUDE_TIMEOUT = 90_000  // 90s — well under Supabase gateway timeout

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function schemaToText(schema: Record<string, { name: string; type: string }[]>): string {
  return Object.entries(schema)
    .map(([tbl, cols]) =>
      `${tbl}:\n` + cols.map(c => `  ${c.name} (${c.type})`).join('\n')
    )
    .join('\n\n')
}

function buildSystem(schema: Record<string, unknown[]>, mode: string): string {
  const schemaText = schemaToText(schema as Record<string, { name: string; type: string }[]>)

  if (mode === 'ideas') {
    return `You are ATLAS AI — a creative analytics strategist embedded in ATLAS Terminal, an institutional investment analytics platform backed by live Alpaca portfolio data.

The user has this live PostgreSQL schema available:

${schemaText}

Your job: suggest compelling analytics features, views, and investigations that can be built with this specific data. Be concrete — reference actual table and column names. Format ideas as numbered lists. Include a short SQL snippet for each idea. Focus on performance attribution, risk analysis, behavioural patterns, portfolio construction, and data quality.

Keep each idea to 2-3 sentences max + one SQL example. Be direct and specific.`
  }

  return `You are ATLAS AI — an expert PostgreSQL analyst embedded in ATLAS Terminal, an institutional investment analytics platform. The user's live portfolio data is in Supabase PostgreSQL, synced from Alpaca.

Live schema:

${schemaText}

Rules:
- Always use exact table/column names from the schema above
- Use proper JOINs (e.g. positions p JOIN assets a ON a.id = p.asset_id)
- Format SQL cleanly with indentation
- Wrap ALL SQL in \`\`\`sql code blocks — this triggers the Insert button in the UI
- After the SQL, give one concise sentence explaining what it does
- If the request is ambiguous, ask one focused clarifying question
- NEVER generate INSERT / UPDATE / DELETE / DROP — this is a read-only terminal
- NEVER make up table or column names not in the schema

When the user asks for query ideas or what they can explore, suggest 3-5 concrete queries using the real schema.`
}

serveGuarded({ user: true }, async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured in Supabase secrets. Add it under Project Settings → Edge Functions → Secrets.' }, 500)
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL

  let body: { messages?: unknown[]; schema?: unknown; mode?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { messages = [], schema = {}, mode = 'sql' } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array is required and must be non-empty' }, 400)
  }

  const system = buildSystem(schema as Record<string, { name: string; type: string }[]>, mode)

  const ctrl   = new AbortController()
  const timer  = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT)

  try {
    const claudeRes = await fetch(CLAUDE_API, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages,
      }),
    })

    clearTimeout(timer)

    const text = await claudeRes.text()
    let claudeData: { content?: { text?: string }[]; usage?: unknown; error?: { message?: string } } = {}
    try { claudeData = JSON.parse(text) } catch {
      return json({ error: 'Claude returned non-JSON response', detail: text.slice(0, 400), status: claudeRes.status }, 502)
    }

    if (!claudeRes.ok) {
      return json({
        error:  claudeData.error?.message ?? 'Claude API error',
        status: claudeRes.status,
        detail: claudeData,
      }, 502)
    }

    return json({
      content: claudeData.content?.[0]?.text ?? '',
      model,
      usage: claudeData.usage,
    })
  } catch (e) {
    clearTimeout(timer)
    const msg = (e instanceof Error) ? e.message : String(e)
    const isAbort = (e instanceof Error) && (e.name === 'AbortError' || msg.includes('aborted'))
    return json({
      error: isAbort
        ? `Claude request timed out after ${CLAUDE_TIMEOUT / 1000}s. Try simplifying your question or retry — the API was likely under load.`
        : `Edge function error: ${msg}`,
    }, isAbort ? 504 : 500)
  }
})
