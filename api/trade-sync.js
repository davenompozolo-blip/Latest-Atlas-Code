// api/trade-sync.js
// ------------------------------------------------------------
// ATLAS Trade — the nightly job behind the module. Spec §9 phases 0b, 3 and 5.
//
// Runs the SAME isomorphic engine the browser uses (src/lib/trade/*), so the
// number written to signal_scores and the number the ticket renders come from
// one implementation and cannot drift. Same pattern as api/sync-valuations.js.
//
// Jobs (?job=…):
//   assets        stamp broker tradability / shortability onto assets.metadata
//                 from Alpaca's own asset list. Without this the "broker
//                 tradeable" gate is an assumption, and §3.2 says it is a gate.
//   correlations  refresh_universe_correlations() + derive clusters
//   signals       family vector per covered symbol → signal_scores
//   coherence     three numbers + posture + tension → opportunity_assessments
//   universe      gates, ranking and the funnel → trade_universe_* (daily snapshot)
//   triggers      evaluate armed conditions, fire or expire them
//   all           every job above, in dependency order
//
// Trigger: Vercel Cron (GET) or manual POST with ?token=CRON_SECRET.

import {
    trendFamily, stretchFamily, volRegimeFamily, flowFamily,
    valuationFamily, macroFamily, eventFamily,
} from '../src/lib/trade/families.js';
import { assessCoherence } from '../src/lib/trade/coherence.js';
import { buildUniverse } from '../src/lib/trade/universe.js';
import { clusterByCorrelation, percentileRank } from '../src/lib/trade/stats.js';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const SB_URL = (process.env.ATLAS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_KEY
    || '';

const UNIVERSE_CODE = 'us_core';
const CORR_WINDOW = 120;
const CORR_THRESHOLD = 0.75;
const CORR_MAX_SYMBOLS = 400;

// Sector → SPDR proxy, for the trend family's relative-strength leg.
const SECTOR_ETF = {
    'Information Technology': 'XLK', 'Technology': 'XLK', 'Info Tech': 'XLK',
    'Health Care': 'XLV', 'Healthcare': 'XLV',
    'Financials': 'XLF', 'Financial Services': 'XLF',
    'Consumer Discretionary': 'XLY', 'Consumer Cyclical': 'XLY',
    'Consumer Staples': 'XLP', 'Consumer Defensive': 'XLP',
    'Energy': 'XLE', 'Industrials': 'XLI', 'Materials': 'XLB', 'Basic Materials': 'XLB',
    'Utilities': 'XLU', 'Real Estate': 'XLRE', 'Communication Services': 'XLC',
};

function hdrs() {
    return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
}

const PAGE = 1000;

/**
 * Paginated read. PostgREST caps a response at its max-rows setting (1000 on
 * this project) regardless of any `limit` in the query string, and it does so
 * silently — the first run of this job scored 6 symbols instead of 55 because
 * a 11,000-row price history came back as its first 1,000 rows with no error.
 * Every read therefore walks Range headers until a short page arrives.
 */
async function sbGet(path, { paginate = true } = {}) {
    // A small explicit limit means the caller wants exactly that many rows
    // (`order=…&limit=1`); leave it alone. A large one was only ever shorthand
    // for "everything", and combining it with Range makes PostgREST compute a
    // negative limit and 416 partway through, so it is stripped.
    const m = path.match(/[?&]limit=(\d+)/);
    if (m && Number(m[1]) <= PAGE) paginate = false;
    if (paginate && m) path = path.replace(/([?&])limit=\d+&?/, '$1').replace(/[?&]$/, '');

    const rows = [];
    let offset = 0;
    for (;;) {
        const headers = paginate
            ? { ...hdrs(), Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items' }
            : hdrs();
        const r = await fetch(SB_URL + '/rest/v1/' + path, { headers });
        if (!r.ok && r.status !== 206) {
            throw new Error(`GET ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        }
        const page = await r.json();
        if (!Array.isArray(page)) return page;           // .single() style reads
        rows.push(...page);
        if (!paginate || page.length < PAGE) return rows;
        offset += PAGE;
        if (offset > 500000) return rows;                // hard stop, never loop forever
    }
}

async function sbWrite(table, rows, { onConflict = null, method = 'POST' } = {}) {
    if (!rows.length) return 0;
    const q = onConflict ? `?on_conflict=${onConflict}` : '';
    const prefer = onConflict ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';
    let written = 0;
    // Chunked so a large universe cannot blow the request size limit.
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const r = await fetch(SB_URL + '/rest/v1/' + table + q, {
            method,
            headers: { ...hdrs(), Prefer: prefer },
            body: JSON.stringify(chunk),
        });
        if (!r.ok) throw new Error(`WRITE ${table}: ${r.status} ${(await r.text()).slice(0, 300)}`);
        written += chunk.length;
    }
    return written;
}

async function sbRpc(fn, args = {}) {
    const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: hdrs(), body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`RPC ${fn}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
}

const n = (v) => (v == null || v === '' ? null : (isFinite(Number(v)) ? Number(v) : null));
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

// ── Shared load ──────────────────────────────────────────────────────────────

/**
 * Everything the scoring jobs read, fetched once. Price history is the
 * expensive leg, so it is pulled in one pass and indexed by symbol.
 */
async function loadContext() {
    // equity_screener_universe exposes pct_ev_ebitda_z but not pct_peg or
    // pct_fcf_yield, so the value percentiles are read from their own table.
    const [assets, riskStats, screener, derived, regimes, vols, options, dispersion, positions, acctRows] = await Promise.all([
        sbGet('assets?select=id,symbol,name,sector,asset_class,exchange,listing_status,metadata&limit=20000'),
        sbGet(`universe_risk_stats?select=*&window_days=eq.${CORR_WINDOW}&order=as_of_date.desc&limit=5000`),
        sbGet('equity_screener_universe?select=symbol,sector,market_cap_usd,market_cap_bucket,forward_pe,pe_ratio,peg_ratio,ev_ebitda,beta,return_52w,return_13w,vol_3m,pct_ev_ebitda_z,pct_roic,pct_momentum_12_1&limit=2000'),
        sbGet('equity_fundamentals_derived?select=ticker,fiscal_year,pct_ev_ebitda_z,pct_peg,pct_fcf_yield,pct_revision_breadth&order=fiscal_year.desc&limit=5000'),
        sbGet('market_regime_windows?select=*&order=start_date.desc&limit=10'),
        sbGet('holding_vol_trailing?select=symbol,asof,vol_20d,z_move,ret_1d&order=asof.desc&limit=8000'),
        sbGet('options_positioning_snapshots?select=*&order=snapshot_date.desc&limit=3000'),
        sbGet('vol_dispersion_daily?select=*&order=date.desc&limit=200'),
        sbGet('positions?select=quantity,average_cost,market_value,as_of_date,assets!inner(symbol,sector,asset_class)&order=as_of_date.desc&limit=500'),
        sbGet('account_snapshots?select=*&order=as_of.desc&limit=1'),
    ]);

    // Latest risk-stat date only.
    const riskDate = riskStats.length ? riskStats[0].as_of_date : null;
    const stats = riskStats.filter((r) => r.as_of_date === riskDate);

    const posDate = positions.length ? positions[0].as_of_date : null;
    const book = positions
        .filter((p) => p.as_of_date === posDate && p.assets && Number(p.quantity) !== 0)
        .filter((p) => !['option', 'us_option', 'cash'].includes(p.assets.asset_class))
        .map((p) => ({
            symbol: p.assets.symbol,
            sector: p.assets.sector,
            quantity: Number(p.quantity),
            averageCost: n(p.average_cost),
            marketValue: Number(p.market_value || 0),
        }));

    const firstOf = (rows, key) => {
        const m = new Map();
        for (const r of rows) if (!m.has(r[key])) m.set(r[key], r);
        return m;
    };

    return {
        assets,
        assetBySymbol: new Map(assets.map((a) => [a.symbol, a])),
        stats,
        statBySymbol: new Map(stats.map((r) => [r.symbol, r])),
        riskDate,
        screener: new Map(screener.map((r) => [r.symbol, r])),
        screenerRows: screener,
        derived: firstOf(derived, 'ticker'),   // newest fiscal year per ticker
        regime: regimes.find((r) => !r.end_date) || regimes[0] || null,
        volLatest: firstOf(vols, 'symbol'),
        volSeries: vols,
        optionsLatest: firstOf(options, 'symbol'),
        dispersionLatest: dispersion.length ? dispersion[0] : null,
        book,
        bookBySymbol: new Map(book.map((p) => [p.symbol, p])),
        account: acctRows.length ? acctRows[0] : null,
    };
}

/** Daily closes per symbol, newest last, for the symbols we can actually score. */
async function loadCloses(symbols, assetBySymbol, lookbackDays = 420) {
    const ids = symbols.map((s) => assetBySymbol.get(s)).filter(Boolean).map((a) => a.id);
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    const byId = new Map();
    for (let i = 0; i < ids.length; i += 40) {
        const chunk = ids.slice(i, i + 40);
        const rows = await sbGet(
            `price_history?select=asset_id,price_date,close,volume&price_date=gte.${since}`
            + `&asset_id=in.(${chunk.join(',')})&order=price_date.asc&limit=100000`,
        );
        for (const r of rows) {
            if (!byId.has(r.asset_id)) byId.set(r.asset_id, []);
            byId.get(r.asset_id).push({ d: r.price_date, c: n(r.close), v: n(r.volume) });
        }
    }
    const out = new Map();
    for (const s of symbols) {
        const a = assetBySymbol.get(s);
        if (a && byId.has(a.id)) out.set(s, byId.get(a.id));
    }
    return out;
}

// ── Job: assets ──────────────────────────────────────────────────────────────
// assets.metadata.tradable exists on every row and is null on every row, so the
// broker gate has never had a source. This fills it from Alpaca.

async function jobAssets() {
    const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) return { skipped: 'ALPACA_API_KEY / ALPACA_API_SECRET not configured' };

    const paper = (process.env.ALPACA_PAPER || 'true').toLowerCase() !== 'false';
    const base = paper ? 'https://paper-api.alpaca.markets/v2' : 'https://api.alpaca.markets/v2';
    const r = await fetch(base + '/assets?status=active&asset_class=us_equity', {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' },
    });
    if (!r.ok) throw new Error('Alpaca assets HTTP ' + r.status);
    const alpaca = await r.json();
    const bySymbol = new Map((Array.isArray(alpaca) ? alpaca : []).map((a) => [a.symbol, a]));

    const ours = await sbGet('assets?select=id,symbol,metadata&limit=20000');
    const rows = [];
    for (const a of ours) {
        const m = bySymbol.get(a.symbol);
        const meta = { ...(a.metadata || {}) };
        const next = {
            ...meta,
            tradable: m ? !!m.tradable : false,
            shortable: m ? !!m.shortable : null,
            easy_to_borrow: m ? !!m.easy_to_borrow : null,
            fractionable: m ? !!m.fractionable : null,
            status: m ? m.status : 'not_listed',
            exchange: m ? m.exchange : (meta.exchange || null),
            broker_checked_at: new Date().toISOString(),
        };
        if (JSON.stringify(next) !== JSON.stringify(meta)) rows.push({ id: a.id, symbol: a.symbol, metadata: next });
    }
    await sbWrite('assets', rows, { onConflict: 'id' });
    return { checked: ours.length, updated: rows.length, alpaca_universe: bySymbol.size };
}

// ── Job: correlations ────────────────────────────────────────────────────────

async function jobCorrelations() {
    // p_max_symbols bounds the pairwise matrix: correlation is quadratic, so a
    // 1,500-name universe would be 1.1m pairs. Everything held is included
    // regardless of rank, so the cap never hides a position from effective
    // exposure — it only trims the unowned tail.
    const pairs = await sbRpc('refresh_universe_correlations', {
        p_window: CORR_WINDOW, p_min_days: 60, p_lambda: 0.97, p_max_symbols: CORR_MAX_SYMBOLS,
    });

    const stats = await sbGet(`universe_risk_stats?select=as_of_date,symbol&window_days=eq.${CORR_WINDOW}&order=as_of_date.desc&limit=5000`);
    if (!stats.length) return { pairs, clusters: 0, note: 'no risk stats written' };
    const date = stats[0].as_of_date;
    const symbols = stats.filter((r) => r.as_of_date === date).map((r) => r.symbol);

    const corr = await sbGet(
        `universe_correlations?select=symbol_1,symbol_2,correlation&as_of_date=eq.${date}&window_days=eq.${CORR_WINDOW}&limit=100000`,
    );
    const map = new Map(corr.map((c) => [`${c.symbol_1}|${c.symbol_2}`, Number(c.correlation)]));
    const rho = (a, b) => (a === b ? 1 : (map.get(`${a}|${b}`) ?? map.get(`${b}|${a}`) ?? null));

    // 1 − ρ distance, cut at 0.35 → members average ρ ≳ 0.65 to the group.
    const clusters = clusterByCorrelation(symbols, rho, { distanceCut: 0.35 });
    const rows = [];
    for (const c of clusters) {
        for (const s of c.members) {
            rows.push({
                as_of_date: date, symbol: s, method: 'avg_linkage_corr_distance',
                cluster_id: c.clusterId,
                cluster_label: c.size > 1 ? c.members.slice(0, 3).join('/') + (c.size > 3 ? '…' : '') : s,
                cluster_size: c.size,
                avg_intra_rho: c.avgIntraRho,
            });
        }
    }
    await sbWrite('universe_clusters', rows, { onConflict: 'as_of_date,symbol,method' });
    return { as_of: date, pairs, symbols: symbols.length, clusters: clusters.length, multi_name_clusters: clusters.filter((c) => c.size > 1).length };
}

// ── Job: signals ─────────────────────────────────────────────────────────────

/** Days to the next earnings print, where the cache knows one. */
function earningsDays(cacheRow) {
    const d = cacheRow && cacheRow.next_earnings;
    if (!d) return null;
    const days = daysBetween(d, today());
    return days >= 0 ? days : null;
}

async function buildVectors(ctx, symbols, closesBySymbol) {
    const spy = (closesBySymbol.get('SPY') || []).map((x) => x.c);
    const asOf = today();

    // Sector cross-sections for the valuation family, from the cached screener.
    const bySector = new Map();
    for (const r of ctx.screenerRows) {
        const k = r.sector || 'Unclassified';
        if (!bySector.has(k)) bySector.set(k, { fwdPe: [], evEbitda: [] });
        if (n(r.forward_pe) > 0) bySector.get(k).fwdPe.push(n(r.forward_pe));
        if (n(r.ev_ebitda) > 0) bySector.get(k).evEbitda.push(n(r.ev_ebitda));
    }

    // Trailing vol distribution per symbol, for the vol-regime percentile.
    const volHist = new Map();
    for (const v of ctx.volSeries) {
        if (!volHist.has(v.symbol)) volHist.set(v.symbol, []);
        if (n(v.vol_20d) != null) volHist.get(v.symbol).push(n(v.vol_20d));
    }

    const rows = [];
    const vectors = new Map();

    for (const symbol of symbols) {
        const bars = closesBySymbol.get(symbol) || [];
        if (bars.length < 30) continue;

        const closes = bars.map((b) => b.c).filter((c) => c != null);
        const lastBar = bars[bars.length - 1];
        const ageDays = daysBetween(asOf, lastBar.d);

        const asset = ctx.assetBySymbol.get(symbol);
        const scr = ctx.screener.get(symbol) || {};
        const der = ctx.derived.get(symbol) || {};
        const sector = scr.sector || (asset && asset.sector) || null;
        const sectorEtf = SECTOR_ETF[sector] || null;
        const sectorCloses = sectorEtf ? (closesBySymbol.get(sectorEtf) || []).map((x) => x.c) : null;

        const vt = ctx.volLatest.get(symbol);
        const op = ctx.optionsLatest.get(symbol);
        const volAge = vt ? daysBetween(asOf, vt.asof) : null;

        // 20d average dollar volume, for the flow family's volume leg.
        const recent = bars.slice(-20);
        const adv = recent.length ? recent.reduce((a, b) => a + (b.c || 0) * (b.v || 0), 0) / recent.length : null;
        const lastDollarVol = lastBar.c && lastBar.v ? lastBar.c * lastBar.v : null;

        const sectorSample = bySector.get(sector) || { fwdPe: [], evEbitda: [] };

        const families = [
            trendFamily({ closes, spyCloses: spy, sectorCloses, ageDays }),
            flowFamily({
                volume: lastDollarVol, adv,
                pcVol: n(op && op.pc_vol), pcOi: n(op && op.pc_oi), skew25d: n(op && op.skew_25d),
                ageDays: op ? daysBetween(asOf, op.snapshot_date) : ageDays,
            }),
            macroFamily({
                regime: ctx.regime, beta: n(scr.beta),
                ageDays: ctx.regime ? 0 : null,
            }),
            valuationFamily({
                forwardPe: n(scr.forward_pe) || n(scr.pe_ratio),
                sectorForwardPes: sectorSample.fwdPe,
                ownForwardPeHistory: [],           // no multiple history on file yet
                evEbitda: n(scr.ev_ebitda),
                sectorEvEbitdas: sectorSample.evEbitda,
                peg: n(scr.peg_ratio),
                pctEvEbitdaZ: n(der.pct_ev_ebitda_z) ?? n(scr.pct_ev_ebitda_z),
                pctPeg: n(der.pct_peg),
                pctFcfYield: n(der.pct_fcf_yield),
                revisionBreadth: n(der.pct_revision_breadth),
                ageDays: 0,
            }),
            stretchFamily({
                closes, vol20d: n(vt && vt.vol_20d), zMove: n(vt && vt.z_move),
                ageDays: volAge != null ? volAge : ageDays,
            }),
            volRegimeFamily({
                vol20d: n(vt && vt.vol_20d),
                volHistory: volHist.get(symbol) || [],
                atmIv: n(op && op.atm_iv), frontIv: n(op && op.front_iv), backIv: n(op && op.back_iv),
                // vol_dispersion_daily is empty in production; this resolves to
                // null, which costs the family confidence rather than being
                // silently treated as neutral.
                dispersionSpread: n(ctx.dispersionLatest && ctx.dispersionLatest.spread),
                ageDays: volAge != null ? volAge : ageDays,
            }),
            eventFamily({ daysToEarnings: scr.days_to_earnings != null ? Number(scr.days_to_earnings) : null }),
        ];

        vectors.set(symbol, families);

        for (const f of families) {
            if (f.score == null && !f.isSuppressor) continue;
            rows.push({
                symbol, as_of_date: asOf, family_code: f.code,
                score: f.score, conviction: f.conviction,
                confidence: f.confidence,
                suppression: f.suppression != null ? f.suppression : null,
                inputs: { ...f.inputs, reason: f.reason || null, conviction_method: f.convictionMethod },
            });
        }
    }

    return { rows, vectors, asOf };
}

async function jobSignals(ctx, closesBySymbol, symbols) {
    const { rows } = await buildVectors(ctx, symbols, closesBySymbol);
    const written = await sbWrite('signal_scores', rows, { onConflict: 'symbol,as_of_date,family_code' });
    return { symbols: symbols.length, rows: written };
}

// ── Job: coherence ───────────────────────────────────────────────────────────

async function jobCoherence(ctx, closesBySymbol, symbols) {
    const { vectors, asOf } = await buildVectors(ctx, symbols, closesBySymbol);
    const rows = [];

    for (const [symbol, families] of vectors) {
        const scr = ctx.screener.get(symbol) || {};
        const coh = assessCoherence(families, {
            side: 'buy',
            context: {
                valuationDetail: n(scr.forward_pe)
                    ? `at ${Number(scr.forward_pe).toFixed(0)}× forward earnings against a sector median near ${medianOf(ctx, scr.sector)}×`
                    : null,
            },
        });
        if (coh.insufficient) continue;

        rows.push({
            symbol,
            as_of_date: asOf,
            net: round(coh.net, 4),
            alignment: round(coh.alignment, 4),
            dispersion: round(coh.dispersion, 4),
            dominant_family: coh.dominantFamily,
            family_vector: coh.familyVector,
            size_multiplier: round(coh.sizeMultiplier, 4),
            posture: coh.posture,
            intended_side: 'buy',
            synthesis: coh.tension,
            model_used: 'atlas-trade-coherence/1',
            prompt_version: 'engine',
        });
    }

    const written = await sbWrite('opportunity_assessments', rows, { onConflict: 'symbol,as_of_date' });
    return { assessed: written };
}

function medianOf(ctx, sector) {
    const xs = ctx.screenerRows
        .filter((r) => r.sector === sector && n(r.forward_pe) > 0)
        .map((r) => n(r.forward_pe))
        .sort((a, b) => a - b);
    if (!xs.length) return '—';
    return xs[Math.floor(xs.length / 2)].toFixed(0);
}

const round = (x, d) => (x == null || !isFinite(x) ? null : Number(x.toFixed(d)));

// ── Job: universe ────────────────────────────────────────────────────────────

async function jobUniverse(ctx, closesBySymbol) {
    const asOf = today();

    const uniRows = await sbGet(`trade_universes?select=id,code&code=eq.${UNIVERSE_CODE}&limit=1`);
    if (!uniRows.length) throw new Error('universe ' + UNIVERSE_CODE + ' not seeded');
    const universeId = uniRows[0].id;

    const rulesRows = await sbGet(`trade_universe_rules?select=code,rule_kind,params&universe_id=eq.${universeId}&is_active=eq.true`);
    const gateParams = {};
    for (const r of rulesRows.filter((x) => x.rule_kind === 'gate')) {
        const p = r.params || {};
        if (r.code === 'liquidity_floor') {
            if (p.min_adv_usd != null) gateParams.minAdvUsd = Number(p.min_adv_usd);
            if (p.max_spread_bps != null) gateParams.maxSpreadBps = Number(p.max_spread_bps);
            if (p.max_clip_pct_of_adv != null) gateParams.maxClipPctOfAdv = Number(p.max_clip_pct_of_adv);
        }
        if (r.code === 'data_integrity') {
            if (p.max_price_age_days != null) gateParams.maxPriceAgeDays = Number(p.max_price_age_days);
            if (p.min_history_days != null) gateParams.minHistoryDays = Number(p.min_history_days);
        }
        if (r.code === 'blackout' && Array.isArray(p.symbols)) gateParams.blackout = p.symbols;
    }

    const assessments = await sbGet(`opportunity_assessments?select=symbol,net,alignment,dispersion,posture,size_multiplier&as_of_date=eq.${asOf}&limit=5000`);
    const cohBySymbol = new Map(assessments.map((a) => [a.symbol, a]));

    const equity = ctx.account ? Number(ctx.account.equity) : null;
    const bookWeight = (s) => {
        const p = ctx.bookBySymbol.get(s);
        return p && equity ? (p.marketValue / equity) * 100 : null;
    };

    // Candidates: every US-listed, non-option asset we hold a price record for.
    // A name with no price series at all cannot be gated on data integrity — it
    // has no data to have integrity — so it is reported as a candidate that the
    // data gate drops, which is exactly the visibility §3.2 asks for.
    const candidates = [];
    for (const a of ctx.assets) {
        if (['option', 'us_option', 'cash'].includes(a.asset_class)) continue;
        if (/\d{6}[CP]\d{8}$/.test(a.symbol)) continue;

        const bars = closesBySymbol.get(a.symbol) || [];
        const last = bars.length ? bars[bars.length - 1] : null;
        const stat = ctx.statBySymbol.get(a.symbol);
        const scr = ctx.screener.get(a.symbol) || {};
        const coh = cohBySymbol.get(a.symbol);
        const meta = a.metadata || {};

        candidates.push({
            symbol: a.symbol,
            tradeable: meta.tradable === null || meta.tradable === undefined ? undefined : !!meta.tradable,
            shortable: meta.shortable == null ? undefined : !!meta.shortable,
            halted: meta.status === 'halted',
            listingStatus: a.listing_status,
            advUsd: stat ? n(stat.adv_usd) : null,
            spreadBps: null,                       // no quote history stored yet
            priceAgeDays: last ? daysBetween(asOf, last.d) : null,
            historyDays: bars.length,
            close: last ? last.c : null,
            sector: scr.sector || a.sector || null,
            geography: 'US',
            marketCapUsd: n(scr.market_cap_usd),
            marketCapBucket: scr.market_cap_bucket || null,
            momentum: n(scr.return_13w),
            realisedVol: stat ? n(stat.vol_annual) : n(scr.vol_3m),
            net: coh ? n(coh.net) : null,
            alignment: coh ? n(coh.alignment) : null,
            dispersion: coh ? n(coh.dispersion) : null,
            optionsListed: ctx.optionsLatest.has(a.symbol),
            ivRank: null,
            daysToEarnings: null,
            bookState: ctx.bookBySymbol.has(a.symbol) ? 'held' : 'unowned',
            heldWeightPct: bookWeight(a.symbol),
        });
    }

    const built = buildUniverse(candidates, { gateParams });

    const memberRows = built.members.map((m) => ({
        universe_id: universeId,
        as_of_date: asOf,
        symbol: m.symbol,
        eligible: m.eligible,
        exclusion_code: m.exclusionCode,
        exclusion_detail: m.exclusionDetail,
        gate_stage: m.gateStage,
        rank: m.rank ?? null,
        composite: round(m.composite, 6),
        net: round(m.net, 4),
        alignment: round(m.alignment, 4),
        dispersion: round(m.dispersion, 4),
        sector: m.sector,
        geography: m.geography,
        market_cap_usd: m.marketCapUsd,
        market_cap_bucket: m.marketCapBucket,
        adv_usd: m.advUsd,
        spread_bps: m.spreadBps,
        momentum_pct: round(m.momentumPct, 2),
        vol_pct: round(m.volPct, 2),
        liquidity_pct: round(m.liquidityPct, 2),
        iv_rank: m.ivRank,
        options_listed: m.optionsListed,
        days_to_earnings: m.daysToEarnings,
        book_state: m.bookState,
        held_weight_pct: round(m.heldWeightPct, 4),
        metrics: { momentum_13w: m.momentum, realised_vol: m.realisedVol },
    }));

    // Replace the day rather than merge it: a snapshot is what the set WAS, and
    // a half-updated day is not a state the universe was ever in.
    await fetch(`${SB_URL}/rest/v1/trade_universe_members?universe_id=eq.${universeId}&as_of_date=eq.${asOf}`,
        { method: 'DELETE', headers: hdrs() });
    await sbWrite('trade_universe_members', memberRows);

    await sbWrite('trade_universe_snapshots', [{
        universe_id: universeId,
        as_of_date: asOf,
        funnel: built.funnel,
        candidate_count: built.counts.candidates,
        eligible_count: built.counts.eligible,
        excluded_count: built.counts.excluded,
        data_gate_count: built.counts.dataGate,
        built_at: new Date().toISOString(),
        notes: `${built.counts.eligible} eligible of ${built.counts.candidates}; ${built.counts.dataGate} held out by the data gate`,
    }], { onConflict: 'universe_id,as_of_date' });

    return { as_of: asOf, ...built.counts, funnel: built.funnel };
}

// ── Job: triggers ────────────────────────────────────────────────────────────

async function jobTriggers(ctx, closesBySymbol) {
    const expired = await sbRpc('expire_stale_trade_triggers', {});
    const armed = await sbGet('trade_triggers?select=*&status=eq.armed&limit=500');
    const fired = [];

    for (const t of armed) {
        const bars = closesBySymbol.get(t.symbol) || [];
        if (!bars.length) continue;
        const last = bars[bars.length - 1];
        const observed = evaluateTrigger(t, { bars, last, ctx });
        if (observed == null) continue;

        const patch = {
            last_checked_at: new Date().toISOString(),
            last_observed: observed.observed,
        };
        if (observed.met) {
            patch.status = 'fired';
            patch.fired_at = new Date().toISOString();
            patch.fired_value = observed.value;
            fired.push({ id: t.id, symbol: t.symbol, description: t.description });
        }
        await fetch(`${SB_URL}/rest/v1/trade_triggers?id=eq.${t.id}`, {
            method: 'PATCH', headers: { ...hdrs(), Prefer: 'return=minimal' }, body: JSON.stringify(patch),
        });
    }

    return { checked: armed.length, fired: fired.length, expired, fired_detail: fired };
}

/** Evaluate one armed condition against today's tape. */
function evaluateTrigger(t, { bars, last, ctx }) {
    const c = t.condition || {};
    const cmp = (v, op, x) => {
        if (v == null || x == null) return null;
        switch (op) {
            case '>=': return v >= x;
            case '>':  return v > x;
            case '<=': return v <= x;
            case '<':  return v < x;
            default:   return null;
        }
    };

    let value = null;
    if (c.metric === 'close') value = last.c;
    else if (c.metric === 'volume_vs_adv') {
        const recent = bars.slice(-21, -1);
        const adv = recent.length ? recent.reduce((a, b) => a + (b.v || 0), 0) / recent.length : null;
        value = adv ? (last.v || 0) / adv : null;
    } else if (c.metric === 'atm_iv') {
        const op = ctx.optionsLatest.get(t.symbol);
        value = op ? n(op.atm_iv) : null;
    } else if (c.metric === 'forward_pe') {
        const s = ctx.screener.get(t.symbol);
        value = s ? n(s.forward_pe) : null;
    } else if (c.metric === 'date') {
        value = null;
        const met = c.on && today() >= c.on;
        return { met: !!met, value: null, observed: { today: today(), on: c.on } };
    }

    const primary = cmp(value, c.op, c.threshold);
    if (primary == null) return null;

    let met = primary;
    const observed = { [c.metric]: value, threshold: c.threshold };
    if (met && c.confirm) {
        const confirmValue = c.confirm.metric === 'volume_vs_adv'
            ? (() => {
                const recent = bars.slice(-21, -1);
                const adv = recent.length ? recent.reduce((a, b) => a + (b.v || 0), 0) / recent.length : null;
                return adv ? (last.v || 0) / adv : null;
            })()
            : null;
        observed[c.confirm.metric] = confirmValue;
        met = cmp(confirmValue, c.confirm.op, c.confirm.threshold) === true;
    }
    return { met, value, observed };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!SB_KEY) return res.status(500).json({ error: 'No Supabase key configured' });

    const job = ((req.query && req.query.job) || 'all').toLowerCase();
    const started = Date.now();
    const out = { job, started_at: new Date().toISOString(), steps: {} };

    try {
        if (job === 'assets') {
            out.steps.assets = await jobAssets();
        } else {
            const ctx = await loadContext();
            // Score the names we can actually price: everything with a risk-stat
            // row, plus the book, plus SPY and the sector proxies for the
            // relative-strength legs.
            const scored = new Set([
                ...ctx.stats.map((r) => r.symbol),
                ...ctx.book.map((p) => p.symbol),
            ]);
            const support = new Set(['SPY', ...Object.values(SECTOR_ETF)]);
            const closes = await loadCloses([...new Set([...scored, ...support])], ctx.assetBySymbol);
            const symbols = [...scored].filter((s) => (closes.get(s) || []).length >= 30);

            if (job === 'all' || job === 'correlations') out.steps.correlations = await jobCorrelations();
            if (job === 'all' || job === 'signals')      out.steps.signals = await jobSignals(ctx, closes, symbols);
            if (job === 'all' || job === 'coherence')    out.steps.coherence = await jobCoherence(ctx, closes, symbols);
            if (job === 'all' || job === 'universe')     out.steps.universe = await jobUniverse(ctx, closes);
            if (job === 'all' || job === 'triggers')     out.steps.triggers = await jobTriggers(ctx, closes);
            out.scored_symbols = symbols.length;
        }

        out.ok = true;
        out.duration_ms = Date.now() - started;
        return res.status(200).json(out);
    } catch (e) {
        out.ok = false;
        out.error = e && e.message ? e.message : String(e);
        out.duration_ms = Date.now() - started;
        return res.status(500).json(out);
    }
}
