// api/claude-analyse.js
// Vercel serverless function — proxies synthesis requests to Anthropic API.
// Follows the same pattern as api/equity.js (API key stays server-side only).
// Called by: ScrapbookSaveBar component (POST with company + all snapshots).

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  const allowed = process.env.ATLAS_ALLOWED_ORIGIN || '';
  if (allowed && origin && origin !== allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company, snapshots, portfolioContext } = req.body || {};

  if (!company?.ticker || !Array.isArray(snapshots) || snapshots.length === 0) {
    return res.status(400).json({ error: 'company.ticker and snapshots[] required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  const prompt = buildSynthesisPrompt(company, snapshots, portfolioContext);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2400,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err.slice(0, 400));
      return res.status(502).json({ error: 'Anthropic API error', detail: err.slice(0, 400) });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const inputTokens = data.usage?.input_tokens || null;

    // Strip markdown fences then parse JSON
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(200).json({ raw_text: raw, parse_error: true, input_token_est: inputTokens });
    }

    return res.status(200).json({ ...parsed, input_token_est: inputTokens });
  } catch (err) {
    console.error('claude-analyse error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a senior buy-side portfolio manager and CFA charterholder writing institutional investment research. Your role is to synthesise multiple valuation approaches into a coherent investment thesis that answers one question: "What is this company worth, and why?"

You write with precision, cite specific numbers from the models provided, and acknowledge where methods diverge and why. You identify the most appropriate valuation method for the company's characteristics and explain how the others either corroborate or challenge it.

You always respond with a valid JSON object and nothing else — no preamble, no markdown fences, no commentary outside the JSON.`;
}

// ── Synthesis prompt ──────────────────────────────────────────────────────────
function buildSynthesisPrompt(company, snapshots, portfolioContext) {
  const currency = company.currency || 'USD';
  const currentPrice = company.current_price;

  const methodBlocks = snapshots.map((s, i) => {
    const upside = s.upside_pct != null
      ? `${s.upside_pct >= 0 ? '+' : ''}${(s.upside_pct * 100).toFixed(1)}%`
      : 'N/A';
    return `METHOD ${i + 1}: ${s.method_label || s.method}
  Run date: ${s.run_date}
  Implied price: ${currency} ${s.implied_price}  (Upside vs current: ${upside})
  ${s.terminal_value ? `Terminal value: ${currency} ${s.terminal_value}` : ''}
  ${s.implied_ev ? `Implied EV: ${currency} ${s.implied_ev}` : ''}

  Inputs:
${formatObj(s.inputs)}

  Assumptions:
${formatObj(s.assumptions)}

  Analyst note: ${s.analyst_note || 'None'}`.trim();
  }).join('\n\n');

  const prices = snapshots.map(s => Number(s.implied_price)).filter(Boolean);
  const avgFV = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : 'N/A';
  const minFV = prices.length ? Math.min(...prices).toFixed(2) : 'N/A';
  const maxFV = prices.length ? Math.max(...prices).toFixed(2) : 'N/A';

  const ctxBlock = portfolioContext ? `
LIVE PORTFOLIO CONTEXT (company is held in the ATLAS portfolio):
  Technical regime: ${portfolioContext.price_regime || 'N/A'}
  Vol regime: ${portfolioContext.vol_regime || 'N/A'}
  RSI (14): ${portfolioContext.rsi_14 || 'N/A'}
  Annualised vol: ${portfolioContext.annualised_vol_20d ? (portfolioContext.annualised_vol_20d * 100).toFixed(1) + '%' : 'N/A'}
  Rolling returns — 1M: ${portfolioContext.return_1m_pct || 'N/A'}%  3M: ${portfolioContext.return_3m_pct || 'N/A'}%  1Y: ${portfolioContext.return_1y_pct || 'N/A'}%
  Next earnings: ${portfolioContext.earnings_date || 'N/A'}
  Analyst target: ${portfolioContext.analyst_target ? `${currency} ${portfolioContext.analyst_target}` : 'N/A'}` : '';

  return `COMPANY: ${company.company_name || company.ticker} (${company.ticker})
Exchange: ${company.exchange || 'N/A'}  |  Sector: ${company.sector || 'N/A'}  |  Currency: ${currency}
Current market price: ${currency} ${currentPrice}
Blended fair value range across all methods: ${currency} ${minFV} – ${currency} ${maxFV}  (Average: ${currency} ${avgFV})
Number of valuation methods run: ${snapshots.length}
${ctxBlock}

─── VALUATION METHODS ───
${methodBlocks}

─── SYNTHESIS REQUEST ───
Based on all ${snapshots.length} valuation method(s) above, provide a full investment analysis synthesising ALL methods to answer: "What is this company worth, and why?"

Return ONLY this JSON object:
{
  "thesis": "<2-3 paragraph synthesis>",
  "value_drivers": [
    { "driver": "<specific driver>", "evidence": "<model evidence>" },
    { "driver": "<specific driver>", "evidence": "<model evidence>" },
    { "driver": "<specific driver>", "evidence": "<model evidence>" }
  ],
  "destroyers": [
    { "risk": "<specific risk>", "impact": "<model impact>" },
    { "risk": "<specific risk>", "impact": "<model impact>" },
    { "risk": "<specific risk>", "impact": "<model impact>" }
  ],
  "bull_case": "<one paragraph>",
  "bear_case": "<one paragraph>",
  "key_sensitivities": "<one paragraph naming 2-3 critical input variables>",
  "method_reconciliation": "<one paragraph explaining method convergence/divergence and weighting>",
  "investment_verdict": "<one sentence>",
  "conviction_rating": "<Strong Buy | Buy | Hold | Avoid>",
  "blended_fair_value": <number>,
  "implied_range_low": <number>,
  "implied_range_high": <number>,
  "avg_upside_pct": <decimal, e.g. 0.195 for 19.5%>
}`;
}

function formatObj(obj) {
  if (!obj || typeof obj !== 'object') return '  (none)';
  return Object.entries(obj).map(([k, v]) => `  ${k}: ${v}`).join('\n');
}
