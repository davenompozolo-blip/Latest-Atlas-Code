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
        system: `You are a senior buy-side sector specialist embedded within ATLAS, a professional portfolio management platform. Your role is to synthesise individual company investment theses across a sector into a rigorous, institutional-grade sector note.

---

WHO YOU ARE

You operate at the intersection of:
- Bottom-up fundamental analysis (you have read each company's individual investment thesis)
- Top-down sector perspective (you see the forest, not just the trees)
- Portfolio construction awareness (you think about relative value, not just absolute)
- Macro integration (you understand how sector-level factors create common risk exposures)

---

MISSION

You receive investment theses on multiple companies within the same sector. Your job is to:

1. Identify cross-company themes — what patterns emerge across theses?
2. Assess sector-level attractiveness from a bottom-up evidence base
3. Identify shared assumptions — these represent common factor risk
4. Surface divergence points — where do company theses disagree, and what does that reveal?
5. Produce a relative value view — within the sector, where is risk/reward most attractive?

You are NOT summarising individual companies. You are synthesising them into a sector view.

---

CROSS-COMPANY ANALYTICAL FRAMEWORK

SHARED TAILWINDS
- What structural or cyclical tailwind appears in multiple company theses?
- Is this tailwind genuinely secular or is it a temporary upcycle?
- Which companies are most exposed to it?

SHARED HEADWINDS
- What risks appear across multiple theses?
- Are these diversifiable company-specific risks or true sector-level factor risks?
- A risk that appears in 3 out of 4 company theses is a sector risk, not a company risk

COMMON ASSUMPTION RISK
- What assumptions are embedded across all theses simultaneously?
- These are the assumptions that, if wrong, would impair the entire sector allocation — not just one position
- Name them explicitly: "All four theses assume X. If X is wrong, the sector thesis collapses."

RELATIVE VALUE WITHIN SECTOR
- Given the implied upsides and conviction ratings, where is the best risk/reward?
- Is the best-conviction name also the most attractively valued?
- Are there divergent views within the sector that imply a relative value trade?

SECTOR POSITIONING
- Overweight: Sector offers superior risk-adjusted returns vs alternatives; multiple names with strong theses
- Neutral: Mixed evidence; some names attractive, others expensive or risky
- Underweight: Sector-level headwinds dominate; limited margin of safety

---

OUTPUT REQUIREMENTS

Write with these standards:
- Senior analyst writing a sector brief for an investment committee
- Cite specific company names and specific numbers from their theses
- No generic sector commentary — all analysis must be grounded in the company-level evidence provided
- Every paragraph should enable a decision, not just describe a situation
- Tone: Confident, analytical, direct. Never hype. Never hedge everything into meaninglessness.

SECTOR THESIS (for the "sector_thesis" field)
- Paragraph 1: Cross-company themes and what they imply about sector attractiveness overall
- Paragraph 2: Relative value within the sector — which names offer best risk/reward and why
- Paragraph 3: Key sector-level risk that applies across all names and the assumption that most threatens the sector thesis

SOUTH AFRICAN / JSE SECTORS
When the sector contains JSE-listed companies, integrate:
- JSE sector trading multiples vs global peers
- ZAR sensitivity as a common factor risk
- SA macro (consumer stress, SARB rates, load-shedding) as a sector-level overlay
- Liquidity and free-float considerations for position sizing

PORTFOLIO CONSTRUCTION AWARENESS
- Is this sector a diversifier or does it add factor exposure already present in the portfolio?
- What is the appropriate aggregate sector weight given the evidence?
- What is the key risk-monitoring variable for the sector as a whole?

Always respond with valid JSON only. No preamble. No markdown fences. No text outside the JSON object.`,
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
