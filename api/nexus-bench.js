// api/nexus-bench.js
// ------------------------------------------------------------
// The Bench — the verdict layer's data plane. One payload: the docket
// (holdings × latest assessment × claims × sleeve rank), price series
// for the tapes/jaws, thesis freshness, and the diagnostics the strip
// renders. Sources: vw_nexus_holdings, opportunity_assessments (the
// writer's table — empty is a VISIBLE state, not an error),
// bench_claims (may not be provisioned yet), vw_funding_sleeve,
// vw_bench_contribution (pending — falls back to today's contribution,
// labelled), scrapbook_companies/narratives (freshness + thesis ticks),
// vw_nexus_price_freshness (verdict suspension), price_history (tapes).
// Degrades explicitly, never throws, never invents.

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;

const TAPE_DAYS = 95;          // window for tapes + jaws
const TAPE_POINTS = 60;        // downsample cap per symbol
const PRICE_STALE_DAYS = 3;    // vw_nexus_price_freshness → verdict suspension

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const ymd = d => d.toISOString().slice(0, 10);

// null = source unreachable/absent (degrade visibly); [] = genuinely empty.
async function sb(path, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 9000);
    try {
        const r = await fetch(SB_URL + '/rest/v1/' + path, { signal: ac.signal, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
        return r.ok ? await r.json() : null;
    } catch { return null; }
    finally { clearTimeout(t); }
}

// Paged fetch — PostgREST caps responses at max-rows (1000 here), which
// SILENTLY truncates a big window; page with Range headers until a short
// page so the tape never loses its most recent months. null on failure.
async function sbPaged(path, pages, ms) {
    const out = [];
    for (let p = 0; p < pages; p++) {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), ms || 12000);
        try {
            const r = await fetch(SB_URL + '/rest/v1/' + path, {
                signal: ac.signal,
                headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Range: (p * 1000) + '-' + (p * 1000 + 999) },
            });
            if (!r.ok) return p === 0 ? null : out;
            const rows = await r.json();
            out.push(...rows);
            if (rows.length < 1000) break;
        } catch { return p === 0 ? null : out; }
        finally { clearTimeout(t); }
    }
    return out;
}

// Latest assessments: try the extended (Bench) columns first; before the
// section-4 migration lands the select 400s → retry with the base shape,
// mapping survives/portfolio_verdict through for continuity.
async function fetchAssessments() {
    const ext = await sb('opportunity_assessments?select=symbol,as_of_date,verdict,thesis_integrity,synthesis,verdict_condition,overridden_by_user,user_verdict,survives,portfolio_verdict,model_used,created_at&order=as_of_date.desc,created_at.desc&limit=400');
    if (ext) return { rows: ext, extended: true };
    const base = await sb('opportunity_assessments?select=symbol,as_of_date,survives,portfolio_verdict,model_used,created_at&order=as_of_date.desc,created_at.desc&limit=400');
    return { rows: base, extended: false };
}

function downsample(arr, cap) {
    if (!arr || arr.length <= cap) return arr || [];
    const step = arr.length / cap;
    const out = [];
    for (let i = 0; i < cap - 1; i++) out.push(arr[Math.floor(i * step)]);
    out.push(arr[arr.length - 1]);   // always keep the latest bar
    return out;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const since = ymd(new Date(Date.now() - TAPE_DAYS * 86_400_000));

        // The book is fetched FIRST so the tape query below can be scoped to
        // the names actually on the docket. It used to sit inside the
        // Promise.all, which is why the tape query could not filter and had
        // to read the whole universe — see the note on that query.
        const holdings = await sb('vw_nexus_holdings?select=symbol,asset_name,sector,theme,weight_pct,market_value,daily_return_pct,total_return_pct,unrealised_return_pct,conviction_score,var_contribution_pct,dcf_upside_pct,current_price,quant_signal,technical_signal,valuation_signal,quality_grade');
        const heldSymbols = [...new Set((holdings || []).map(h => h.symbol).filter(Boolean))];

        // TAPES. This read `price_history` for the whole 1,500-name universe
        // with no symbol filter, ordered price_date ASC, and stopped after
        // 6 pages of 1000. The 95-day window holds 89,262 rows, so the fetch
        // took the OLDEST 6.7% of it and quit: every tape stopped at
        // 2026-05-20 while the data ran to 2026-08-17, and three held names
        // got no rows at all. That is what "No price series in window — tape
        // unavailable" was reporting, on a name with 281 bars ending
        // yesterday.
        //
        // Scoped to the book it is 3,707 rows — four pages, whole window,
        // current to the last close. DESC ordering is deliberate belt-and-
        // braces: if this ever truncates again it loses the oldest bars
        // rather than the newest, so a short tape beats a stale one. The
        // series is re-sorted ascending on the way into `series` below.
        const [assess, claims, sleeve, contribView, docketView, headroom, volRows, scrapCos, freshness, prices, cortexSignals, fvRows] = await Promise.all([
            fetchAssessments(),
            sb('bench_claims?select=id,symbol,thesis_ref,claim_text,status,evidence_text,evidence_value,evidence_source,status_changed_at,created_at&order=created_at.asc&limit=1000'),
            sb('vw_funding_sleeve?select=tk,qualified,sleeve_rank,funding_score,disqualification_reason,fv_trustworthy'),
            sb('vw_bench_contribution?select=symbol,contrib_today,contrib_ytd,contrib_since_entry,covered,coverage_reason,nav_coverage_pct'),
            // the judged columns: conviction-implied target, R/VaR, damage, clock
            sb('vw_bench_docket?select=symbol,target_weight_pct,weight_gap_pp,r_var,damage_pp,days_held,component_var_pct,unrealised_return_pct,macro_regime_fit,quality_grade'),
            sb('vw_sleeve_headroom?select=sleeve,weight_pct,cap_pct,headroom_pp,headroom_usd,positions,nav_usd'),
            // §4.4 surfacing trigger — a flag on a docket row, never a panel
            sb('vw_holding_vol_latest?select=symbol,asof,ret_1d,vol_20d,z_move,days_old,vol_trigger,abstain_reason'),
            sb('scrapbook_companies?select=ticker,thesis_summary,updated_at'),
            sb('vw_nexus_price_freshness?select=symbol,days_old'),
            heldSymbols.length
                ? sbPaged('price_history?select=price_date,close,assets!inner(symbol)&interval=eq.1d'
                    + '&assets.symbol=in.(' + heldSymbols.join(',') + ')'
                    + '&price_date=gte.' + since + '&order=price_date.desc,asset_id.asc', 6)
                : Promise.resolve([]),
            sb('cortex_signals?select=signal_class,title,relevance,candidates,is_muted&is_muted=eq.false&order=generated_at.desc&limit=60'),
            // fv_untrust_reason explains the coverage number on the strip
            sb('nexus_holdings?select=tk,fv_trustworthy,fv_untrust_reason'),
        ]);

        if (!holdings || !holdings.length) {
            return res.status(200).json({ ok: false, error: 'holdings unavailable', docket: [], series: {}, diagnostics: [] });
        }
        const heldSet = new Set(holdings.map(h => h.symbol));

        // narratives (thesis ticks + FULL thesis text) need the company-id
        // map — second hop. scrapbook_companies.thesis_summary is truncated
        // at 220 chars by the upstream writer; the narrative carries the
        // full text, so the trial quotes that when it exists.
        const scrapIdRows = await sb('scrapbook_companies?select=id,ticker');
        const idToTk = new Map((scrapIdRows || []).map(c => [c.id, c.ticker]));
        const narrs = await sb('scrapbook_narratives?select=company_id,thesis,created_at&order=created_at.asc&limit=2000');
        const thesisDatesByTk = new Map();
        const fullThesisByTk = new Map();
        for (const n of narrs || []) {
            const tk = idToTk.get(n.company_id);
            if (!tk || !heldSet.has(tk)) continue;
            if (!thesisDatesByTk.has(tk)) thesisDatesByTk.set(tk, []);
            thesisDatesByTk.get(tk).push(n.created_at);
            if (n.thesis) fullThesisByTk.set(tk, n.thesis);   // ascending order → last write wins (latest)
        }

        // the ACTUAL Cortex hub signals, mapped per held name in the
        // compute layer client-side — ship them raw
        const cortex = (cortexSignals || []).map(s => ({ signal_class: s.signal_class, title: s.title, relevance: s.relevance, candidates: s.candidates }));

        // latest assessment per symbol (rows arrive newest-first)
        const assessByTk = new Map();
        for (const a of assess.rows || []) if (!assessByTk.has(a.symbol)) assessByTk.set(a.symbol, a);

        const claimsByTk = new Map();
        for (const c of claims || []) {
            if (!claimsByTk.has(c.symbol)) claimsByTk.set(c.symbol, []);
            claimsByTk.get(c.symbol).push(c);
        }

        const sleeveRows = sleeve || [];
        const sleeveByTk = new Map(sleeveRows.map(r => [r.tk, r]));
        const qualified = sleeveRows.filter(r => r.qualified).sort((a, b) => a.sleeve_rank - b.sleeve_rank);
        const disqCounts = {};
        for (const r of sleeveRows) if (!r.qualified && r.disqualification_reason) disqCounts[r.disqualification_reason] = (disqCounts[r.disqualification_reason] || 0) + 1;

        const contribByTk = new Map((contribView || []).map(r => [r.symbol, r]));
        const judgedByTk = new Map((docketView || []).map(r => [r.symbol, r]));
        const volByTk = new Map((volRows || []).map(r => [r.symbol, r]));
        const scrapByTk = new Map((scrapCos || []).map(c => [c.ticker, c]));
        const staleSet = new Set((freshness || []).filter(f => num(f.days_old) != null && f.days_old > PRICE_STALE_DAYS).map(f => f.symbol));

        // price series per held symbol, downsampled
        const series = {};
        for (const row of prices || []) {
            const tk = row.assets && row.assets.symbol;
            const close = num(row.close);
            if (!tk || !heldSet.has(tk) || !(close > 0)) continue;
            (series[tk] = series[tk] || []).push({ date: row.price_date, close });
        }
        // The tape query orders DESC (see above), so put each series back into
        // chronological order before downsampling — a reversed tape draws the
        // line backwards.
        for (const tk of Object.keys(series)) {
            series[tk].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            series[tk] = downsample(series[tk], TAPE_POINTS);
        }

        const docket = holdings.map(h => {
            const scrap = scrapByTk.get(h.symbol);
            const cv = contribByTk.get(h.symbol);
            const sl = sleeveByTk.get(h.symbol);
            const j = judgedByTk.get(h.symbol);
            const vt = volByTk.get(h.symbol);
            return {
                tk: h.symbol,
                name: (h.asset_name && h.asset_name !== h.symbol) ? h.asset_name : null,
                // Theme, not sector. The docket's sleeve logic groups on this
                // field and calls the buckets themes; feeding it sector meant
                // the Bench was recruiting and funding against a different
                // taxonomy from the one it displayed (CLAUDE.md, 2026-08-11).
                theme: h.theme || 'Unclassified',
                weightPct: num(h.weight_pct),
                conviction: num(h.conviction_score) ?? 0,
                todayPct: num(h.daily_return_pct),
                // ON COST, with no fallback. This read was
                // `unrealised ?? total`, silently substituting the
                // since-entry figure when the on-cost one was absent — two
                // measures that disagree in sign on 8 of 61 holdings, under
                // one field name. The docket already publishes
                // `judged.unrealisedPct` separately, so the substitution also
                // made two fields on one payload mean the same thing
                // sometimes and different things otherwise.
                totalReturnPct: num(h.unrealised_return_pct),
                returnBasis: 'on_cost',
                // Published beside it rather than folded into it, so a
                // consumer that wants the since-entry read asks for it.
                sinceEntryPct: num(h.total_return_pct),
                varPct: num(h.var_contribution_pct),
                fvGapPct: num(h.dcf_upside_pct),
                signals: { quant: h.quant_signal || null, technical: h.technical_signal || null, valuation: h.valuation_signal || null },
                priceStale: staleSet.has(h.symbol),
                thesis: fullThesisByTk.get(h.symbol) || (scrap && scrap.thesis_summary) || null,
                // summary-only + exactly 220 chars = the upstream truncation;
                // the trial labels it instead of quoting a cut-off sentence silently
                thesisTruncated: !fullThesisByTk.has(h.symbol) && !!(scrap && scrap.thesis_summary && scrap.thesis_summary.length === 220),
                thesisUpdatedAt: (scrap && scrap.updated_at) || null,
                thesisDates: thesisDatesByTk.get(h.symbol) || [],
                claims: claimsByTk.get(h.symbol) || [],
                assessment: assessByTk.get(h.symbol) || null,
                sleeveRank: sl && sl.qualified ? sl.sleeve_rank : null,
                fvTrustworthy: sl ? !!sl.fv_trustworthy : false,
                // Measured contribution only. A name with no position history
                // reports null with the reason attached — never a weight x
                // return estimate dressed up as a measured number.
                contrib: {
                    today: cv ? num(cv.contrib_today) : null,
                    ytd: cv ? num(cv.contrib_ytd) : null,
                    sinceEntry: cv ? num(cv.contrib_since_entry) : null,
                    covered: cv ? !!cv.covered : false,
                    reason: cv ? (cv.coverage_reason || null) : 'not_in_contribution_view',
                },
                // §3.1 judged columns. Every one of these is nullable on
                // purpose: a null renders an em dash and its reason, never a
                // substituted average.
                judged: {
                    targetWeightPct: j ? num(j.target_weight_pct) : null,
                    weightGapPp: j ? num(j.weight_gap_pp) : null,
                    rVar: j ? num(j.r_var) : null,
                    damagePp: j ? num(j.damage_pp) : null,
                    daysHeld: j ? num(j.days_held) : null,
                    componentVarPct: j ? num(j.component_var_pct) : null,
                    unrealisedPct: j ? num(j.unrealised_return_pct) : null,
                    macro: (j && j.macro_regime_fit) || null,
                    quality: (j && j.quality_grade) || null,
                },
                // §4.4 the move measured against the name's own trailing vol,
                // not against the tape. Absent = no reading at all, which is
                // a different thing from a reading that says "calm".
                vol: vt ? {
                    z: num(vt.z_move),
                    ret1d: num(vt.ret_1d),
                    vol20d: num(vt.vol_20d),
                    asOf: vt.asof || null,
                    daysOld: num(vt.days_old),
                    trigger: !!vt.vol_trigger,
                    abstainReason: vt.abstain_reason || null,
                } : null,
            };
        });

        // writer status straight off the table — "never fired" is a visible
        // warning on the strip, not a hidden state
        const writerRows = (assess.rows || []).length;
        const writerLastRun = writerRows ? (assess.rows[0].created_at || assess.rows[0].as_of_date) : null;

        // fv coverage + the reason breakdown behind it
        const fvReasonCounts = {};
        for (const r of fvRows || []) {
            if (r.fv_trustworthy || !r.fv_untrust_reason) continue;
            // collapse "valuation 50d stale" / "valuation 44d stale" into one bucket
            const bucket = r.fv_untrust_reason.replace(/^valuation \d+d stale$/, 'stale valuations');
            fvReasonCounts[bucket] = (fvReasonCounts[bucket] || 0) + 1;
        }
        const fvReasons = Object.entries(fvReasonCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, n]) => ({ reason, n }));

        const diagnostics = {
            fvTrusted: (fvRows || []).filter(r => r.fv_trustworthy).length || sleeveRows.filter(r => r.fv_trustworthy).length,
            fvTotal: (fvRows || []).length || sleeveRows.length || null,
            fvReasons,
            writerRows,
            writerLastRun,
            writerExtended: assess.extended,
            claimsAvailable: claims != null,
            contributionBasis: contribView ? 'view' : 'today-only',
            // the contribution waterfall spans only the names with position
            // history; the strip states that share rather than letting a
            // partial chart read as the whole book
            navCoveragePct: (contribView || []).length ? num(contribView[0].nav_coverage_pct) : null,
            contribUncovered: (contribView || []).filter(r => !r.covered).length,
            contribCovered: (contribView || []).filter(r => r.covered).length,
            docketJudged: (docketView || []).length,
            volRows: (volRows || []).length,
            volTriggered: (volRows || []).filter(r => r.vol_trigger).length,
            volAbstaining: (volRows || []).filter(r => r.z_move == null).length,
            // §5.2: the clock is missing precisely where it matters most, so
            // the count is a diagnostic, not a rendering detail
            clockMissing: (docketView || []).filter(r => r.days_held == null).length,
        };
        const funding = {
            sleeve: qualified.slice(0, 3).map(r => ({ tk: r.tk, score: num(r.funding_score), rank: r.sleeve_rank })),
            unresolved: qualified.length === 0,
            disqualifications: Object.entries(disqCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, n]) => ({ reason, n })),
        };

        const sleeves = (headroom || []).map(r => ({
            sleeve: r.sleeve || 'Unclassified',
            weightPct: num(r.weight_pct),
            capPct: num(r.cap_pct),
            headroomPp: num(r.headroom_pp),
            headroomUsd: num(r.headroom_usd),
            positions: num(r.positions),
        }));

        // one NAV, read off the same view the headroom figures come from
        const navUsd = (headroom || []).length ? num(headroom[0].nav_usd) : null;

        res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
        return res.status(200).json({ ok: true, asOf: new Date().toISOString(), docket, series, funding, diagnostics, cortex, sleeves, navUsd });
    } catch (e) {
        return res.status(200).json({ ok: false, error: (e && e.message) || 'bench error', docket: [], series: {}, diagnostics: [] });
    }
}
