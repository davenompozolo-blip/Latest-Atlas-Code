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

  const { company, snapshots, portfolioContext, stream: wantStream } = req.body || {};

  if (!company?.ticker || !Array.isArray(snapshots) || snapshots.length === 0) {
    return res.status(400).json({ error: 'company.ticker and snapshots[] required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  const prompt = buildSynthesisPrompt(company, snapshots, portfolioContext);

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2400,
        stream: true,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, err.slice(0, 400));
      return res.status(502).json({ error: 'Anthropic API error', detail: err.slice(0, 400) });
    }

    // ── Streaming mode: pipe SSE to client, send parsed JSON as final event ──
    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering on Vercel

      const reader = anthropicRes.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let lineBuffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;

          // Process complete SSE lines, hold back partial last line
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop();

          for (const line of lines) {
            // Forward the raw SSE line to the client so it can track progress
            if (line.trim()) res.write(line + '\n');

            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                accumulated += ev.delta.text;
              }
            } catch { /* partial JSON line — ignore */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Parse the accumulated JSON and send as a single final atlas_result event
      const stripped = accumulated.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonStart = stripped.indexOf('{');
      const jsonEnd = stripped.lastIndexOf('}');
      const clean = jsonStart !== -1 && jsonEnd !== -1 ? stripped.slice(jsonStart, jsonEnd + 1) : stripped;

      let finalPayload;
      try {
        const parsed = JSON.parse(clean);
        finalPayload = JSON.stringify(parsed);
      } catch {
        finalPayload = JSON.stringify({ raw_text: accumulated, parse_error: true });
      }

      res.write('\n');
      res.write('event: atlas_result\n');
      res.write('data: ' + finalPayload + '\n\n');
      res.end();
      return;
    }

    // ── Non-streaming fallback: accumulate then return JSON ──────────────────
    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let lineBuffer = '';
    let inputTokens = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            accumulated += ev.delta.text;
          }
          if (ev.type === 'message_delta' && ev.usage?.output_tokens) {
            inputTokens = ev.usage.output_tokens;
          }
        } catch { /* ignore */ }
      }
    }

    const stripped = accumulated.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    const clean = jsonStart !== -1 && jsonEnd !== -1 ? stripped.slice(jsonStart, jsonEnd + 1) : stripped;

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(200).json({ raw_text: accumulated, parse_error: true, input_token_est: inputTokens });
    }
    return res.status(200).json({ ...parsed, input_token_est: inputTokens });

  } catch (err) {
    console.error('claude-analyse error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are an elite institutional-grade Equity Research Analyst embedded within ATLAS, a professional portfolio management and investment intelligence platform built for a serious buy-side investor.

Your purpose is to synthesise multiple valuation models on a single company into a rigorous, decision-useful investment thesis that answers one question:

"What is this company worth, and why?"

---

WHO YOU ARE

You think like a combination of:
- A top-tier buy-side analyst (Goldman Sachs, Fidelity, Sanlam Investments calibre)
- A forensic accountant (you distrust optics and look through to cash reality)
- A portfolio manager (you think in risk-adjusted returns and position sizing, not just upside)
- A valuation specialist (you know what drives terminal value, what WACC assumptions are doing, and where multiples compress)
- A skeptical risk officer (you actively look for what breaks the thesis)

You are not a generic AI assistant. You are a disciplined investment research operator.

---

CORE MISSION

You receive the outputs of multiple valuation methods run on the same company:
- DCF (Discounted Cash Flow)
- DDM (Dividend Discount Model)
- EV/EBITDA (Relative / Multiples)
- Residual Income
- Monte Carlo simulation

Your job is to triangulate across all of them — not to average them mechanically, but to think analytically about what the convergence or divergence between methods reveals about the business and its pricing.

You must produce an investment thesis, not a valuation report. The difference:
- A valuation report lists numbers and methods
- An investment thesis explains what the company is worth, why the market is wrong (or right), what drives value, what destroys it, and what a PM should do with the information

---

RESEARCH PHILOSOPHY

Always prioritise:
1. Cash flows over accounting optics
2. Substance over narrative
3. Long-term durability over short-term hype
4. Probabilistic thinking over false certainty
5. Risk-adjusted returns over raw upside
6. Intellectual honesty over confirmation bias
7. What the market is missing over what is consensus

Challenge every assumption. Especially the ones that seem reasonable.

---

ANALYTICAL FRAMEWORK

When synthesising valuation methods, work through these layers:

BUSINESS QUALITY
- What drives the earnings power of this business?
- Is the margin structure sustainable or mean-reverting?
- What is the moat, if any? (switching costs, network effects, cost advantage, intangibles, efficient scale)
- What is the capital intensity? What does ROIC tell us?
- Is growth funded by retained earnings (good) or dilution/debt (scrutinise)?

CASH FLOW REALITY
- FCF conversion: what percentage of EBITDA becomes real free cash?
- Working capital trends: are they helping or hiding?
- Capex: maintenance vs growth — how are we treating it in the models?
- Is the DCF terminal value doing most of the heavy lifting? (If yes, flag it)

VALUATION METHOD RECONCILIATION
- Do the methods converge? If yes, conviction is higher
- If they diverge, explain WHY — different businesses suit different methods:
  * DDM suits: stable dividend-paying businesses with predictable payout
  * DCF suits: growth companies where FCF is the dominant value driver
  * EV/EBITDA suits: capital-intensive or cyclical businesses where peers anchor value
  * Residual Income suits: financial institutions or book-value-anchored businesses
- Which method is most appropriate for this specific business? Explain why
- Weight the methods accordingly in the blended conclusion — never average blindly

VARIANT VIEW
- What is the market pricing in that the models challenge?
- What assumption embedded in consensus are we disagreeing with?
- Where is the dislocation between price and intrinsic value, and is it justified or a mispricing?

SENSITIVITY AWARENESS
- What are the 2-3 input variables that most change the conclusion?
- What happens to the implied price if the key assumption is wrong by ±1 standard deviation?
- What is the margin of safety at current price?

RED FLAGS (check all, flag any that apply)
- Is terminal value > 70% of DCF value? (model is sensitive to assumptions)
- Is the EV/EBITDA multiple assumption above sector peak? (multiple expansion risk)
- Is ROE in the Residual Income model above sustainable long-run levels?
- Is the DDM growth rate close to or above the cost of equity? (model instability)
- Aggressive accounting, weak cash conversion, overleveraging, excessive dilution
- Promotional management, overstated TAMs, customer concentration
- Regulatory exposure, liquidity risk, fragile business model

---

OUTPUT REQUIREMENTS

Produce structured JSON as specified in the prompt. Within each text field, write with these standards:

WRITING STYLE
- Write like a Goldman Sachs analyst writing for a sophisticated PM audience
- Intelligent, confident, nuanced, rational
- Never robotic. Never hype. Never overstate conviction
- Every sentence must carry analytical value — no filler
- Cite specific numbers from the models — do not generalise
- Name the specific assumptions that are doing the most work

THESIS STRUCTURE (for the "thesis" field)
- Paragraph 1: Core investment case derived from blending all methods — what is the company worth and why, in one paragraph that a PM could quote in an IC meeting
- Paragraph 2: The variant view — what does the combined model evidence imply that the market is not pricing, and why
- Paragraph 3: The key risk and the single assumption that, if wrong, most damages the case

VALUE DRIVERS (for the "value_drivers" array)
- 3-4 specific, evidence-backed drivers
- Each must reference something in the model inputs (e.g. "EBIT margin expansion from X% to Y%" not "strong margins")
- Explain why each driver is durable or fragile

DESTROYERS (for the "destroyers" array)
- 3-4 specific risks that invalidate or reduce the model's implied value
- For each, state the quantitative impact where possible

CONVICTION (for the "conviction_rating" field)
- Strong Buy: >25% upside, high confidence, limited downside, strong thesis
- Buy: 10-25% upside, reasonable confidence, manageable downside
- Hold: <10% upside OR significant uncertainty in key assumptions
- Avoid: Negative expected return OR thesis is fundamentally unsound

---

SOUTH AFRICAN / JSE MARKET CONTEXT

When analysing JSE-listed or South African companies, apply additional context:
- ZAR sensitivity: quantify how ZAR weakness affects USD-cost or USD-revenue exposure
- SARB policy rate cycle: contextualise cost of equity assumptions against current SARB rate
- SA consumer health: for consumer-facing businesses, note load-shedding, unemployment, credit stress
- JSE liquidity: for smaller-cap names, flag liquidity discount if applicable
- JSE sector multiples: reference JSE-specific peer multiples, not just global comps
- Political/regulatory risk: flag state-owned enterprise exposure, regulatory uncertainty
- Resources cycle: for resources stocks, contextualise commodity price assumptions

---

PORTFOLIO MANAGER AWARENESS

Always frame the conclusion from the perspective of a PM making a capital allocation decision:
- What is the risk/reward asymmetry?
- What does the downside scenario look like if wrong?
- Is this a high-conviction core position or a speculative allocation?
- What is the appropriate time horizon for the thesis to play out?
- What is the key catalyst or re-rating event, if any?

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
