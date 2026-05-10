// api/claude-sector.js
// Generates a sector-level synthesis note from all company theses in a sector.
// Called when the user clicks "Generate sector note" in the Sector Playbook.

export default async function handler(req, res) {
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

  const { sector, companies, narratives } = req.body || {};
  if (!sector || !companies?.length) {
    return res.status(400).json({ error: 'sector and companies[] required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const prompt = buildSectorPrompt(sector, companies, narratives);

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
        max_tokens: 2000,
        system: `You are a senior buy-side sector specialist writing institutional sector research. You synthesise individual company investment theses into a coherent sector-level view. You identify cross-company themes, shared risks, and relative value within the sector. You always respond with valid JSON only — no preamble, no markdown fences.`,
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
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(200).json({ raw_text: raw, parse_error: true, sector_conviction: 'Under Review' });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('claude-sector error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}

function buildSectorPrompt(sector, companies, narratives) {
  const companyBlocks = companies.map((c, i) => {
    const narrative = narratives?.[i];
    return `COMPANY ${i + 1}: ${c.company_name || c.ticker} (${c.ticker})
  Conviction: ${c.conviction_rating || 'N/A'}
  Valuation methods run: ${c.run_count || 0}${c.fair_value_low ? ` (fair value range: ${c.currency || '$'}${c.fair_value_low}–${c.fair_value_high})` : ''}
  ${c.thesis_summary ? `Thesis summary: ${c.thesis_summary}` : ''}
  ${narrative?.investment_verdict ? `Investment verdict: ${narrative.investment_verdict}` : ''}
  ${narrative?.value_drivers?.length ? `Key value drivers: ${narrative.value_drivers.map(d => d.driver).join('; ')}` : ''}
  ${narrative?.destroyers?.length ? `Key risks: ${narrative.destroyers.map(d => d.risk).join('; ')}` : ''}`.trim();
  }).join('\n\n');

  const convDist = {
    StrongBuy: companies.filter(c => c.conviction_rating === 'Strong Buy').length,
    Buy:       companies.filter(c => c.conviction_rating === 'Buy').length,
    Hold:      companies.filter(c => c.conviction_rating === 'Hold').length,
    Avoid:     companies.filter(c => c.conviction_rating === 'Avoid').length,
  };

  return `SECTOR: ${sector}
Companies analysed: ${companies.length}
Conviction distribution: Strong Buy: ${convDist.StrongBuy}, Buy: ${convDist.Buy}, Hold: ${convDist.Hold}, Avoid: ${convDist.Avoid}

─── COMPANY THESES ───
${companyBlocks}

─── SECTOR SYNTHESIS REQUEST ───
Based on all ${companies.length} company investment thes${companies.length === 1 ? 'is' : 'es'} in the ${sector} sector above, write an institutional sector note that:
1. Identifies cross-company themes — what do these theses have in common?
2. Assesses overall sector attractiveness from a bottom-up perspective
3. Identifies the best and worst risk/reward opportunities within the sector
4. Names the 2-3 assumptions that are shared across most theses (common factor risk)
5. Notes where theses diverge — and what that disagreement reveals

Return ONLY this JSON:
{
  "sector_thesis": "<2-3 paragraph sector view>",
  "sector_tailwinds": [
    { "theme": "<sector tailwind>", "evidence": "<which companies' theses support this>" },
    { "theme": "<sector tailwind>", "evidence": "<which companies' theses support this>" }
  ],
  "sector_headwinds": [
    { "risk": "<sector headwind>", "exposure": "<which companies are most exposed>" },
    { "risk": "<sector headwind>", "exposure": "<which companies are most exposed>" }
  ],
  "shared_assumptions": "<paragraph on shared key assumptions — common factor risk>",
  "divergence_points": "<paragraph on where company theses disagree within the sector>",
  "relative_value": "<one paragraph: which company/companies offer best risk/reward and why>",
  "sector_verdict": "<one sentence on overall sector attractiveness>",
  "sector_conviction": "<one of: Overweight | Neutral | Underweight>"
}`;
}
