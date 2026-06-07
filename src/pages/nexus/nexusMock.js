// ============================================================
// Nexus Spine — mock provider
// ------------------------------------------------------------
// getNexusModel(): Promise<NexusModel>
//
// Populated with the synthetic figures from nexus-flagship.html so
// the spine build is visually verifiable against the mockup. The
// page calls this on mount and renders from the resolved model —
// nothing reads a hardcoded literal inside a component.
//
// dataIntegrity is the one exception to "mocked": it is computed
// LIVE (computeDataIntegrity) and spliced in here, so swapping this
// whole file for a real provider keeps the same signature AND keeps
// integrity real. See nexusDataIntegrity.js.
// ============================================================

import { computeDataIntegrity } from './nexusDataIntegrity.js';

/** @returns {Promise<import('./nexusModel.js').NexusModel>} */
export async function getNexusModel() {
    // The only non-mock field this pass — computed from feed freshness.
    const dataIntegrity = await computeDataIntegrity();

    return {
        asOf: new Date().toISOString(),
        marketStatus: 'US cash open in 1h 50m · futures −1.2%',

        dataIntegrity,

        windshield: {
            driver: 'Hot jobs report repriced the rate path',
            driverEmphasis: 'rates, not earnings',
            stats: [
                { label: 'VIX',          value: '18.4',   change: '+2.1',  tone: 'warn'    },
                { label: '2Y UST',       value: '4.62%',  change: '+11bp', tone: 'down'    },
                { label: 'Cuts priced ’26', value: '1.4', change: '−0.6',  tone: 'down'    },
                { label: 'Nasdaq fut',   value: '−1.2%',  change: '',      tone: 'down'    },
                { label: 'Put skew',     value: '1.31',   change: '+0.08', tone: 'warn'    },
            ],
        },

        gauges: {
            risk: {
                budgetUsedPct: 73,
                limitPct: 100,
                deltaTodayPts: 4,
                verdictChip: 'Within budget',
                note: 'Marginal VaR rose on the rate move; still inside the 100% cap.',
            },
            performance: {
                bookPct: -0.9,
                benchPct: -1.2,
                concentratedContribPct: 62,
                topMovers: [
                    { tk: 'NVDA', pct: -2.1 },
                    { tk: 'AVGO', pct: -1.4 },
                    { tk: 'MSFT', pct:  0.3 },
                ],
                verdictChip: 'Beating bench',
                note: 'Down less than the tape — semis did the damage, mega-cap cushioned.',
            },
            concentration: {
                effectiveN: 11.2,
                nominalN: 57,
                topFactorPct: 38,
                fragilityCluster: ['NVDA', 'AVGO', 'AMD', 'ASML'],
                verdictChip: 'Fragile',
                note: 'Effective N of 11 against 57 names — AI capex carries 38% of factor risk.',
            },
        },

        spine: [
            { theme: 'AI / Accelerated compute', sharePct: 31.4, movePct: -1.8, riskShift:  2, fragility: true },
            { theme: 'Mega-cap platforms',       sharePct: 22.1, movePct: -0.4, riskShift:  1 },
            { theme: 'Energy / Real assets',     sharePct:  8.8, movePct:  0.9, riskShift: -1 },
            { theme: 'Rate-sensitive / Duration',sharePct:  9.6, movePct: -1.1, riskShift:  2 },
            { theme: 'Financials',               sharePct:  6.5, movePct:  0.3, riskShift:  0 },
            { theme: 'Defensives / Health',      sharePct:  6.1, movePct:  0.2, riskShift: -1 },
            { theme: 'Intl ADRs (OTC)',          sharePct:  7.3, movePct:  0.1, riskShift:  0, stale: true },
            { theme: 'Cash & T-bills',           sharePct:  8.2, movePct:  0.0, riskShift:  0 },
        ],

        holdings: [
            { tk: 'NVDA',  theme: 'AI / Accelerated compute', conviction: 78, todayPct: -2.1, contribPct: -0.62, componentVar: 18.4, fvGapPct:  6.2, signal: 'Momentum cooling', read: 'hold',  objectId: 'obj-nvda'  },
            { tk: 'AVGO',  theme: 'AI / Accelerated compute', conviction: 72, todayPct: -1.4, contribPct: -0.21, componentVar:  9.1, fvGapPct: -3.4, signal: 'Rich vs DCF',      read: 'trim',  objectId: 'obj-avgo'  },
            { tk: 'MSFT',  theme: 'Mega-cap platforms',       conviction: 81, todayPct:  0.3, contribPct:  0.04, componentVar:  7.7, fvGapPct:  9.8, signal: 'Quality A+',       read: 'hold',  objectId: 'obj-msft'  },
            { tk: 'AMZN',  theme: 'Mega-cap platforms',       conviction: 69, todayPct: -0.6, contribPct: -0.05, componentVar:  5.2, fvGapPct: 12.1, signal: null,               read: 'add',   objectId: 'obj-amzn'  },
            { tk: 'AMD',   theme: 'AI / Accelerated compute', conviction: 58, todayPct: -2.8, contribPct: -0.14, componentVar:  6.8, fvGapPct: -1.2, signal: 'High beta',        read: 'watch', objectId: 'obj-amd'   },
            { tk: 'ASML',  theme: 'AI / Accelerated compute', conviction: 74, todayPct: -1.9, contribPct: -0.11, componentVar:  5.9, fvGapPct:  4.5, signal: 'Cheap vs peers',   read: 'add',   objectId: 'obj-asml'  },
            { tk: 'CVX',   theme: 'Energy / Real assets',     conviction: 63, todayPct:  1.1, contribPct:  0.06, componentVar:  3.1, fvGapPct:  8.0, signal: 'Macro tailwind',   read: 'add',   objectId: 'obj-cvx'   },
            { tk: 'BAC',   theme: 'Financials',               conviction: 55, todayPct:  0.4, contribPct:  0.02, componentVar:  2.4, fvGapPct:  2.1, signal: null,               read: 'hold',  objectId: 'obj-bac'   },
            { tk: 'TCEHY', theme: 'Intl ADRs (OTC)',          conviction: 64, todayPct:  0.0, contribPct:  0.00, componentVar:  1.8, fvGapPct: 18.4, signal: 'Stale feed',       read: 'hold',  stale: true, objectId: 'obj-tcehy' },
            { tk: 'PROSY', theme: 'Intl ADRs (OTC)',          conviction: 61, todayPct:  0.0, contribPct:  0.00, componentVar:  1.1, fvGapPct: 22.0, signal: 'Stale feed',       read: 'hold',  stale: true, objectId: 'obj-prosy' },
            { tk: 'NPSNY', theme: 'Intl ADRs (OTC)',          conviction: 57, todayPct:  0.0, contribPct:  0.00, componentVar:  0.9, fvGapPct:  6.0, signal: 'Stale feed',       read: 'hold',  stale: true, objectId: 'obj-npsny' },
            { tk: 'VWAGY', theme: 'Intl ADRs (OTC)',          conviction: 52, todayPct:  0.0, contribPct:  0.00, componentVar:  0.7, fvGapPct: 14.0, signal: 'Stale feed',       read: 'watch', stale: true, objectId: 'obj-vwagy' },
        ],

        read: {
            default: 'market',
            variants: {
                market: {
                    dotTone: 'warn',
                    html: '<strong>The market</strong> has quietly walked back 2026 cuts to ~1.4 after the jobs print. ' +
                          'Your book is positioned for <strong>easier</strong> policy — long-duration AI capex and ' +
                          'rate-sensitive names carry 41% of risk. If the market is right, today’s −0.9% is noise. ' +
                          'The read: <strong>hold the core, trim the duration tail</strong>.',
                },
                hfl: {
                    dotTone: 'bad',
                    html: '<strong>Higher-for-longer</strong> is the tail you’re under-hedged for. If the 2Y holds above ' +
                          '4.6% into the summer, the AI-capex + duration cluster (38% of factor risk) re-rates together — ' +
                          'that’s the fragility the concentration gauge is flagging. The read: ' +
                          '<strong>take the AMD / AVGO trims now</strong> and raise the T-bill sleeve toward 10%.',
                },
            },
        },

        chef: {
            hotTab: 'theme',
            reason: 'Theme rotation is doing the work today — rates repriced the AI-capex cluster, not earnings. Start there.',
        },

        seasonal: {
            theme: {
                title: 'Theme transmission',
                subtitle: 'How today’s macro is propagating through your themes',
                tags: ['AI capex', 'Duration', 'Rotation'],
                body: [
                    'The rate repricing is hitting long-duration cash flows hardest. AI / accelerated compute is the transmission node — it is both your largest theme (31%) and the most rate-sensitive on a discount-rate basis.',
                    'Energy and financials are the natural offsets and are green on the day; the question is whether you want to lean into that rotation or treat it as noise.',
                ],
            },
            regime: {
                title: 'Regime',
                subtitle: 'Where we are in the cycle, and what breaks the read',
                tags: ['Late cycle', 'Restrictive', 'Risk-on (fragile)'],
                body: [
                    'Still risk-on, but the cushion is thin: a restrictive front end with a market leaning on cuts that keep getting pushed out.',
                    'Regime flips to risk-off if the 2Y breaks decisively above 4.75% or VIX term structure inverts.',
                ],
            },
            opportunities: {
                title: 'Opportunities',
                subtitle: 'Where the gap between price and value is widest',
                tags: ['Value gaps', 'Mispriced'],
                body: [
                    'Largest fair-value gaps sit in the OTC ADR sleeve (Prosus +22%, Tencent +18%) — but those feeds are stale, so treat the gaps as unconfirmed until prices refresh.',
                    'Cleanest live gap: MSFT at +9.8% with an A+ quality grade.',
                ],
            },
            drift: {
                title: 'Drift',
                subtitle: 'How far the book has wandered from its targets',
                tags: ['Concentration', 'Rebalance'],
                body: [
                    'Effective N has fallen to 11 against 57 names — concentration is drifting toward the AI-capex cluster faster than conviction justifies.',
                    'A rebalance back toward target would trim AVGO/AMD and lift the cash & T-bill sleeve.',
                ],
            },
        },
    };
}
