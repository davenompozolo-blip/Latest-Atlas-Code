// ============================================================
// Nexus Spine — the typed data contract (NexusModel)
// ------------------------------------------------------------
// This file is documentation only. It defines, via JSDoc, the
// single shape every Nexus component consumes. The mock provider
// (nexusMock.js) and — later — the real Supabase-backed provider
// both resolve to this exact shape, so components never change
// when the data source is swapped.
//
// Spine rule: nothing reads a hardcoded literal inside a
// component. Everything flows from a resolved NexusModel.
// ============================================================

/**
 * @typedef {Object} NexusModel
 * @property {string} asOf                 ISO timestamp
 * @property {string} marketStatus         e.g. "US cash open in 1h 50m · futures -1.2%"
 * @property {DataIntegrity} dataIntegrity Computed LIVE (feed freshness + staleness flags)
 * @property {Windshield} windshield
 * @property {Gauges} gauges
 * @property {SpineRow[]} spine
 * @property {Holding[]} holdings
 * @property {Read} read
 * @property {Chef} chef
 * @property {Seasonal} seasonal
 */

/**
 * @typedef {Object} DataIntegrity
 * @property {number} staleFeedCount        e.g. 4 (the OTC ADRs)
 * @property {number} positioningAgeDays    e.g. 3
 * @property {"ok"|"warn"|"bad"} status     drives the oil-light colour
 * @property {string[]} staleTickers        ["TCEHY","NPSNY","PROSY","VWAGY"]
 */

/**
 * @typedef {Object} Windshield
 * @property {string} driver                "Hot jobs report repriced the rate path"
 * @property {string} driverEmphasis        "rates, not earnings"
 * @property {Stat[]} stats                 VIX, 2Y, cuts, Nasdaq, skew
 */

/**
 * @typedef {Object} Stat
 * @property {string} label
 * @property {string} value
 * @property {string=} change
 * @property {"up"|"down"|"warn"|"neutral"} tone
 */

/**
 * @typedef {Object} Gauges
 * @property {RiskGauge} risk
 * @property {PerfGauge} performance
 * @property {ConcGauge} concentration
 */

/**
 * @typedef {Object} RiskGauge
 * @property {number} budgetUsedPct
 * @property {number} limitPct
 * @property {number} deltaTodayPts
 * @property {string} verdictChip
 * @property {string} note
 */

/**
 * @typedef {Object} PerfGauge
 * @property {number} bookPct
 * @property {number} benchPct
 * @property {number} concentratedContribPct
 * @property {{tk:string,pct:number}[]} topMovers
 * @property {string} verdictChip
 * @property {string} note
 */

/**
 * @typedef {Object} ConcGauge
 * @property {number} effectiveN
 * @property {number} nominalN
 * @property {number} topFactorPct
 * @property {string[]} fragilityCluster
 * @property {string} verdictChip
 * @property {string} note
 */

/**
 * @typedef {Object} SpineRow
 * @property {string} theme
 * @property {number} sharePct
 * @property {number} movePct
 * @property {-1|0|1|2} riskShift
 * @property {boolean=} stale
 * @property {boolean=} fragility
 */

/**
 * @typedef {Object} Holding            one Live Object row
 * @property {string} tk
 * @property {string} theme
 * @property {number} conviction        0–100   (PCM)
 * @property {number} todayPct          (Performance)
 * @property {number} contribPct        to book P&L (Performance)
 * @property {number} componentVar      signed % of total VaR (Risk)
 * @property {number} fvGapPct          signed (Valuation)
 * @property {?string} signal           Cortex label or null
 * @property {"add"|"hold"|"trim"|"watch"} read   (Nexus)
 * @property {boolean=} stale
 * @property {string} objectId          for Live Object navigation
 */

/**
 * @typedef {Object} Read
 * @property {"market"|"hfl"} default
 * @property {Object<string,{dotTone:string, html:string}>} variants  keyed by rate-view stance
 */

/**
 * @typedef {Object} Chef
 * @property {"flagship"|"theme"|"regime"|"opp"|"drift"} hotTab
 * @property {string} reason            one line shown in the chefbar
 */

/**
 * @typedef {Object} Seasonal          spine renders whatever the mock supplies, structure only
 * @property {Object} theme
 * @property {Object} regime
 * @property {Object} opportunities
 * @property {Object} drift
 */

// No runtime exports — types only.
export {};
