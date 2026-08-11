// ATLAS Trade — data access.
//
// Everything the three routes read, in one place. Two rules hold throughout:
//
//   1. Read what was written, do not recompute. The universe, the family vector
//      and the correlation matrix are all snapshotted daily (§3.1, §4.1), so
//      looking at a past date returns the set as it actually was rather than
//      today's data wearing yesterday's date.
//   2. Degrade loudly. Every loader reports what it could not get, and the
//      panes render that rather than a confident-looking zero.

import { sb } from '../supabase.js';

const UNIVERSE_CODE = 'us_core';

function fail(scope, error) {
    if (error) console.warn(`[trade] ${scope}:`, error.message || error);
    return error || null;
}

/** The most recent snapshot date at or before `asOf`, or null if none exists. */
export async function latestUniverseDate(asOf = null) {
    if (!sb) return null;
    let q = sb.from('trade_universe_snapshots')
        .select('as_of_date, trade_universes!inner(code)')
        .eq('trade_universes.code', UNIVERSE_CODE)
        .order('as_of_date', { ascending: false })
        .limit(1);
    if (asOf) q = q.lte('as_of_date', asOf);
    const { data, error } = await q;
    if (error) { fail('latestUniverseDate', error); return null; }
    return data && data.length ? data[0].as_of_date : null;
}

/**
 * The universe as at a date: the funnel, every member (eligible and not), and
 * the rules that produced them.
 */
export async function loadUniverse({ asOf = null } = {}) {
    if (!sb) return { available: false, reason: 'Supabase not configured', members: [], funnel: [], rules: [] };

    const date = await latestUniverseDate(asOf);
    if (!date) {
        return {
            available: false,
            reason: 'No universe snapshot has been written yet. Run the trade sync job.',
            members: [], funnel: [], rules: [], asOfDate: null,
        };
    }

    const uni = await sb.from('trade_universes').select('id, code, label').eq('code', UNIVERSE_CODE).single();
    if (uni.error) { fail('universe', uni.error); return { available: false, reason: uni.error.message, members: [], funnel: [], rules: [] }; }
    const universeId = uni.data.id;

    const [snap, members, rules] = await Promise.all([
        sb.from('trade_universe_snapshots').select('*').eq('universe_id', universeId).eq('as_of_date', date).single(),
        sb.from('trade_universe_members').select('*').eq('universe_id', universeId).eq('as_of_date', date),
        sb.from('trade_universe_rules').select('*').eq('universe_id', universeId).eq('is_active', true).order('sort_order'),
    ]);

    fail('snapshot', snap.error); fail('members', members.error); fail('rules', rules.error);

    return {
        available: !members.error && !!(members.data || []).length,
        reason: members.error ? members.error.message : null,
        asOfDate: date,
        universeId,
        label: uni.data.label,
        funnel: snap.data ? snap.data.funnel : [],
        counts: snap.data ? {
            candidates: snap.data.candidate_count,
            eligible: snap.data.eligible_count,
            excluded: snap.data.excluded_count,
            dataGate: snap.data.data_gate_count,
        } : null,
        builtAt: snap.data ? snap.data.built_at : null,
        notes: snap.data ? snap.data.notes : null,
        members: (members.data || []).map(normaliseMember),
        rules: rules.data || [],
    };
}

function normaliseMember(m) {
    return {
        symbol: m.symbol,
        eligible: m.eligible,
        exclusionCode: m.exclusion_code,
        exclusionDetail: m.exclusion_detail,
        gateStage: m.gate_stage,
        rank: m.rank,
        composite: numOrNull(m.composite),
        net: numOrNull(m.net),
        alignment: numOrNull(m.alignment),
        dispersion: numOrNull(m.dispersion),
        sector: m.sector,
        geography: m.geography,
        marketCapUsd: numOrNull(m.market_cap_usd),
        marketCapBucket: m.market_cap_bucket,
        advUsd: numOrNull(m.adv_usd),
        spreadBps: numOrNull(m.spread_bps),
        momentumPct: numOrNull(m.momentum_pct),
        volPct: numOrNull(m.vol_pct),
        liquidityPct: numOrNull(m.liquidity_pct),
        ivRank: numOrNull(m.iv_rank),
        optionsListed: m.options_listed,
        daysToEarnings: m.days_to_earnings,
        bookState: m.book_state,
        heldWeightPct: numOrNull(m.held_weight_pct),
        metrics: m.metrics || {},
    };
}

const numOrNull = (v) => (v == null ? null : Number(v));

/** The family vector for one symbol as at a date. */
export async function loadSignalScores(symbol, { asOf = null } = {}) {
    if (!sb) return { families: [], asOfDate: null, available: false };

    let q = sb.from('signal_scores')
        .select('*, signal_families!inner(label, is_suppressor, conviction_method, display_order)')
        .eq('symbol', symbol)
        .order('as_of_date', { ascending: false })
        .limit(40);
    if (asOf) q = q.lte('as_of_date', asOf);

    const { data, error } = await q;
    if (error || !data || !data.length) {
        fail('signal_scores', error);
        return { families: [], asOfDate: null, available: false, reason: error ? error.message : 'no scores on file for ' + symbol };
    }

    // Take the newest complete day only — mixing days would silently blend a
    // stale trend read with a fresh flow read.
    const date = data[0].as_of_date;
    const rows = data.filter((r) => r.as_of_date === date);

    return {
        available: true,
        asOfDate: date,
        families: rows
            .sort((a, b) => a.signal_families.display_order - b.signal_families.display_order)
            .map((r) => ({
                code: r.family_code,
                label: r.signal_families.label,
                isSuppressor: r.signal_families.is_suppressor,
                convictionMethod: r.signal_families.conviction_method,
                score: numOrNull(r.score),
                conviction: numOrNull(r.conviction),
                confidence: numOrNull(r.confidence),
                suppression: numOrNull(r.suppression),
                reason: r.inputs && r.inputs.reason ? r.inputs.reason : null,
                inputs: r.inputs || {},
            })),
    };
}

/** The stored coherence assessment, if the sync job has written one. */
export async function loadAssessment(symbol, { asOf = null } = {}) {
    if (!sb) return null;
    let q = sb.from('opportunity_assessments').select('*')
        .eq('symbol', symbol).order('as_of_date', { ascending: false }).limit(1);
    if (asOf) q = q.lte('as_of_date', asOf);
    const { data, error } = await q;
    if (error) { fail('assessment', error); return null; }
    return data && data.length ? data[0] : null;
}

/** Book state: positions, account, and the risk stats the ticket prices against. */
export async function loadBook() {
    if (!sb) return { positions: [], account: null, available: false };

    const posDate = await sb.from('positions').select('as_of_date').order('as_of_date', { ascending: false }).limit(1);
    const asOf = posDate.data && posDate.data.length ? posDate.data[0].as_of_date : null;
    if (!asOf) return { positions: [], account: null, available: false, reason: 'no positions on file' };

    const [pos, acct] = await Promise.all([
        sb.from('positions').select('quantity, average_cost, market_value, side, assets!inner(symbol, name, sector, asset_class)').eq('as_of_date', asOf),
        sb.from('account_snapshots').select('*').order('as_of', { ascending: false }).limit(1),
    ]);
    fail('positions', pos.error); fail('account', acct.error);

    const positions = (pos.data || [])
        .filter((p) => p.assets && p.quantity != null && Number(p.quantity) !== 0)
        .filter((p) => !['option', 'us_option', 'cash'].includes(p.assets.asset_class))
        .map((p) => ({
            symbol: p.assets.symbol,
            name: p.assets.name,
            sector: p.assets.sector,
            quantity: Number(p.quantity),
            averageCost: numOrNull(p.average_cost),
            marketValue: Number(p.market_value || 0),
            side: p.side,
        }));

    const a = acct.data && acct.data.length ? acct.data[0] : null;
    return {
        available: true,
        asOfDate: asOf,
        positions,
        account: a ? {
            equity: Number(a.equity),
            cash: Number(a.cash),
            buyingPower: Number(a.buying_power),
            long_market_value: Number(a.long_market_value),
            short_market_value: Number(a.short_market_value),
            maintenance_margin: a.raw && a.raw.maintenance_margin != null ? Number(a.raw.maintenance_margin) : null,
            asOf: a.as_of,
        } : null,
    };
}

/**
 * The cached risk layer: correlations, vols, betas and clusters. §4.1 requires
 * this be read, never recomputed per keystroke.
 */
export async function loadRiskLayer({ symbols = null, window = 120 } = {}) {
    if (!sb) return { rho: () => null, vols: {}, betas: {}, clusters: [], available: false };

    const latest = await sb.from('universe_risk_stats').select('as_of_date')
        .order('as_of_date', { ascending: false }).limit(1);
    const date = latest.data && latest.data.length ? latest.data[0].as_of_date : null;
    if (!date) {
        return {
            rho: () => null, vols: {}, betas: {}, clusters: [], available: false, asOfDate: null,
            reason: 'No correlation snapshot yet. Run refresh_universe_correlations().',
        };
    }

    const [statsRes, corrRes, clusterRes] = await Promise.all([
        sb.from('universe_risk_stats').select('*').eq('as_of_date', date).eq('window_days', window),
        sb.from('universe_correlations').select('symbol_1, symbol_2, correlation, correlation_simple, common_days')
            .eq('as_of_date', date).eq('window_days', window),
        sb.from('universe_clusters').select('*').eq('as_of_date', date),
    ]);
    fail('risk_stats', statsRes.error); fail('correlations', corrRes.error); fail('clusters', clusterRes.error);

    const vols = {}, betas = {}, advs = {}, lastClose = {};
    for (const r of statsRes.data || []) {
        vols[r.symbol] = numOrNull(r.vol_annual);
        betas[r.symbol] = numOrNull(r.beta_spy);
        advs[r.symbol] = numOrNull(r.adv_usd);
        lastClose[r.symbol] = numOrNull(r.last_close);
    }

    const map = new Map();
    const raw = new Map();
    for (const c of corrRes.data || []) {
        const key = `${c.symbol_1}|${c.symbol_2}`;
        map.set(key, Number(c.correlation));
        raw.set(key, { ewma: Number(c.correlation), simple: numOrNull(c.correlation_simple), days: c.common_days });
    }
    const rho = (a, b) => {
        if (a === b) return 1;
        const v = map.get(`${a}|${b}`);
        return v !== undefined ? v : (map.get(`${b}|${a}`) ?? null);
    };
    const rhoDetail = (a, b) => raw.get(`${a}|${b}`) || raw.get(`${b}|${a}`) || null;

    const byCluster = new Map();
    for (const r of clusterRes.data || []) {
        if (!byCluster.has(r.cluster_id)) {
            byCluster.set(r.cluster_id, { clusterId: r.cluster_id, label: r.cluster_label, members: [], size: r.cluster_size, avgIntraRho: numOrNull(r.avg_intra_rho) });
        }
        byCluster.get(r.cluster_id).members.push(r.symbol);
    }

    return {
        available: true,
        asOfDate: date,
        window,
        rho, rhoDetail, vols, betas, advs, lastClose,
        clusters: Array.from(byCluster.values()),
        pairCount: (corrRes.data || []).length,
        coveredSymbols: Object.keys(vols),
    };
}

/** Portfolio vol at 90 / 60 / 30 days ago against today (§10 residual q1). */
export async function loadVolDrift() {
    if (!sb) return null;
    const { data, error } = await sb
        .from('portfolio_equity_curve')
        .select('*')
        .order('as_of_date', { ascending: true })
        .limit(500);
    if (error || !data || data.length < 40) { fail('vol drift', error); return null; }

    const key = Object.keys(data[0]).find((k) => /nav|equity|value/i.test(k) && typeof data[0][k] !== 'string');
    const dateKey = Object.keys(data[0]).find((k) => /date|as_of/i.test(k));
    if (!key || !dateKey) return null;

    const rets = [];
    for (let i = 1; i < data.length; i++) {
        const a = Number(data[i - 1][key]), b = Number(data[i][key]);
        if (a > 0 && b > 0) rets.push({ date: data[i][dateKey], r: b / a - 1 });
    }
    // Trailing 60-session realised vol, annualised, sampled along the curve.
    const series = [];
    for (let i = 60; i < rets.length; i++) {
        const w = rets.slice(i - 60, i).map((x) => x.r);
        const m = w.reduce((s, x) => s + x, 0) / w.length;
        const v = Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / w.length) * Math.sqrt(252);
        series.push({ date: rets[i].date, vol: v });
    }
    return series;
}

/** Claims on file for a symbol (§4.2). */
export async function loadClaims(symbol) {
    if (!sb) return [];
    const { data, error } = await sb.from('bench_claims').select('*')
        .eq('symbol', symbol).order('created_at', { ascending: false });
    if (error) { fail('claims', error); return []; }
    return data || [];
}

export async function loadTriggers({ symbol = null, status = 'armed', limit = 200 } = {}) {
    if (!sb) return [];
    let q = sb.from('trade_triggers').select('*').order('armed_at', { ascending: false }).limit(limit);
    if (symbol) q = q.eq('symbol', symbol);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) { fail('triggers', error); return []; }
    return data || [];
}

/** The blotter: intents, their orders, their outcomes, and armed triggers. */
export async function loadBlotter({ limit = 300 } = {}) {
    if (!sb) return { decisions: [], outcomes: [], triggers: [], integrity: null };
    const [dec, out, trg, integ] = await Promise.all([
        sb.from('decisions').select('*, orders(client_order_id, alpaca_order_id, status, filled_qty, filled_avg_price, submitted_at)')
            .order('seq', { ascending: false }).limit(limit),
        sb.from('decision_outcomes').select('*, decisions(symbol, intent, conviction, coherence_alignment, coherence_net, size_multiplier, multiplier_applied, is_override)')
            .order('snapshot_at', { ascending: false }).limit(2000),
        sb.from('trade_triggers').select('*').order('armed_at', { ascending: false }).limit(200),
        sb.from('vw_ledger_integrity').select('*').limit(1),
    ]);
    fail('decisions', dec.error); fail('outcomes', out.error); fail('triggers', trg.error);
    return {
        decisions: dec.data || [],
        outcomes: out.data || [],
        triggers: trg.data || [],
        integrity: integ.data && integ.data.length ? integ.data[0] : null,
    };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Write the claim (§4.2). New claims land as UNTESTED; an existing claim for
 * the symbol is amended rather than duplicated.
 */
export async function upsertClaim({ symbol, claimText, falsifierText, reviewBy, existingId = null }) {
    if (!sb) throw new Error('Supabase not configured');
    const row = {
        symbol,
        claim_text: claimText,
        falsifier_text: falsifierText || null,
        review_by: reviewBy || null,
        status: 'untested',
    };
    if (existingId) {
        const { data, error } = await sb.from('bench_claims').update(row).eq('id', existingId).select('id').single();
        if (error) throw error;
        return data.id;
    }
    const { data, error } = await sb.from('bench_claims').insert(row).select('id').single();
    if (error) throw error;
    return data.id;
}

/**
 * Arm the triggers a non-Act posture owes (§5.7), and write the 'deferred'
 * decision that turns "not yet" into a row — which is also what finally gives
 * §6 a control group.
 */
export async function armTriggers({ symbol, triggers, intentPayload, decisionId = null, assessmentId = null }) {
    if (!sb) throw new Error('Supabase not configured');
    const rows = triggers.map((t) => ({
        symbol,
        decision_id: decisionId,
        assessment_id: assessmentId,
        trigger_type: t.type,
        condition: t.condition,
        description: t.description,
        detail: t.detail || null,
        expires_at: t.expiresAt || null,
        intent_payload: intentPayload || {},
    }));
    const { data, error } = await sb.from('trade_triggers').insert(rows).select('id');
    if (error) throw error;
    return data;
}

export async function recordDeferredDecision(payload) {
    if (!sb) throw new Error('Supabase not configured');
    const { data, error } = await sb.from('decisions').insert(payload).select('id').single();
    if (error) throw error;
    return data.id;
}
