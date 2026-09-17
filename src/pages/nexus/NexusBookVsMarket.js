// ============================================================
// ATLAS Nexus — the book against the market (G-6)
// ------------------------------------------------------------
// The unit the rest of the G-series exists to make possible. Every other
// panel puts a market reading on the flagship; this one asks the
// expensive question against the cheap ones.
//
// Three readings, in the order the question is actually asked:
//
//   1. WHAT HAPPENED   the book's move against the benchmark's.
//   2. WHAT SHOULD     beta x the benchmark, from B0/C3's fitted panel.
//   3. WHAT IS LEFT    the residual, which is where the day's story is.
//
// Plus the sector cut: where the book's weight sat against where the
// market moved.
//
// The panel renders NOTHING it cannot support. An insignificant beta
// gives no expectation and no residual, and says why; a missing
// benchmark gives no excess; a book move on 84% of the book says 84%.
// ============================================================

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import { useMacroFeed } from './useMacroFeed.js';
import {
    bookVsMarket, residualRead, sectorAlignment, latestMarketBeta,
} from './nexusBookVsMarketCompute.js';

const { useState, useEffect, useMemo } = React;
const e = React.createElement;

const PATHS = ['/api/macro'];

const pct = (v, d = 2) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%');
const tone = v => (v == null ? '' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : '');

// ── The betas ────────────────────────────────────────────────
function useMarketBeta() {
    const [s, setS] = useState({ loaded: false, beta: null });
    useEffect(function () {
        let alive = true;
        if (!supabase) { setS({ loaded: true, beta: null }); return; }
        supabase.from('book_factor_betas')
            .select('factor_key,beta,t_stat,significant,n_obs,estimated_at')
            .eq('factor_key', 'market')
            .then(({ data, error }) => {
                if (!alive) return;
                if (error) {
                    // A transport failure is never a statement about the book.
                    console.error('[ATLAS] book_factor_betas read failed:', error.message);
                    setS({ loaded: true, beta: null });
                    return;
                }
                setS({ loaded: true, beta: latestMarketBeta(data) });
            });
        return () => { alive = false; };
    }, []);
    return s;
}

// ── Readings ─────────────────────────────────────────────────
function Reading({ label, value, sub, tone: t }) {
    return e('div', { className: 'nbm-read' },
        e('div', { className: 'nbm-read-l' }, label),
        e('div', { className: 'nbm-read-v ' + (t || '') }, value),
        sub ? e('div', { className: 'nbm-read-s' }, sub) : null
    );
}

// An absent reading is a named absence, never a dash in a slot that
// looks like every other slot.
function Absent({ label, why }) {
    return e('div', { className: 'nbm-read nbm-absent' },
        e('div', { className: 'nbm-read-l' }, label),
        e('div', { className: 'nbm-read-s' }, why)
    );
}

export function NexusBookVsMarket({ gauge, holdings }) {
    const feed = useMacroFeed(PATHS);
    const macro = feed.data['/api/macro'];
    const { loaded: betaLoaded, beta } = useMarketBeta();

    const model = useMemo(
        () => bookVsMarket({ gauge, marketBeta: beta }),
        [gauge, beta]);
    const read = useMemo(() => residualRead(model), [model]);
    const sectors = useMemo(
        () => sectorAlignment(holdings, macro && macro.sectors),
        [holdings, macro]);

    const head = e('div', { className: 'nf-card-h' },
        e('div', null,
            e('h3', null, 'The book against the market'),
            e('div', { className: 'nf-sub', style: { marginTop: 3 } },
                'what happened, what the exposure says should have, and what is left')));

    if (!gauge) {
        return e('div', { className: 'nf-card nbm' }, head,
            e('div', { className: 'nbm-empty' }, 'No book move to read today.'));
    }

    const covered = model.measuredWeightPct != null
        ? model.measuredWeightPct.toFixed(1) + '% of book measured'
          + (model.withheldWeightPct ? ' · ' + model.withheldWeightPct.toFixed(1) + '% withheld on stale marks' : '')
        : null;

    return e('div', { className: 'nf-card nf-fade nbm' }, head,
        e('div', { className: 'nbm-reads' },
            // An em dash in a slot that looks like every other slot is
            // indistinguishable from a measurement -- which is the whole
            // reason the absent variant exists. A refused gauge takes the
            // absent treatment here too, not just downstream of it.
            model.bookPct != null
                ? e(Reading, { label: 'Book, today', value: pct(model.bookPct), tone: tone(model.bookPct), sub: covered })
                : e(Absent, { label: 'Book, today', why: model.reason || 'no measurable book move' }),
            model.benchPct != null
                ? e(Reading, { label: model.benchSymbol + ', today', value: pct(model.benchPct), tone: tone(model.benchPct) })
                : e(Absent, { label: model.benchSymbol + ', today', why: model.reason || 'no benchmark move' }),
            model.excessPct != null
                ? e(Reading, { label: 'Excess', value: pct(model.excessPct), tone: tone(model.excessPct), sub: 'book − benchmark, unadjusted' })
                : e(Absent, { label: 'Excess', why: model.reason || 'not measurable' }),
            // The expensive half. Absent whenever the evidence is absent,
            // and the reason is the panel's content rather than a footnote.
            model.expectedPct != null
                ? e(Reading, {
                    label: 'Expected', value: pct(model.expectedPct),
                    sub: 'β ' + model.beta.toFixed(3) + ' × ' + model.benchSymbol,
                })
                : e(Absent, { label: 'Expected', why: betaLoaded ? (model.reason || 'no expectation to form') : 'reading the fitted beta…' }),
            model.residualPct != null
                ? e(Reading, {
                    label: 'Residual', value: pct(model.residualPct), tone: tone(model.residualPct),
                    sub: 'what market exposure does not explain',
                })
                : e(Absent, {
                    label: 'Residual',
                    // The blocker is whatever actually blocked it. "needs a
                    // significant beta" is wrong when the gauge was refused.
                    why: model.expectedPct == null && model.reason ? model.reason : 'needs a significant beta',
                })
        ),

        read ? e('div', { className: 'nbm-verdict ' + read.key },
            e('span', { className: 'nbm-verdict-t' }, read.text)) : null,

        // Two bases, named, reconciled nowhere.
        model.alignment
            ? e('div', { className: 'nbm-basis' },
                e('span', { className: 'nbm-basis-k' }, 'BASIS'),
                model.alignment.live + '  vs  ' + model.alignment.model + ' — ' + model.alignment.note)
            : null,

        // ── Sector cut ──
        sectors.rows.length
            ? e('div', { className: 'nbm-sec' },
                e('div', { className: 'nbm-sec-h' }, 'Where your weight sat against where the market moved'),
                e('div', { className: 'nbm-sec-rows' },
                    sectors.rows.slice(0, 8).map(r => e('div', { className: 'nbm-sec-row', key: r.etf },
                        e('span', { className: 'nbm-sec-n' }, r.sector),
                        e('span', { className: 'nbm-sec-w' }, r.weightPct.toFixed(1) + '%'),
                        e('span', { className: 'nbm-sec-m ' + tone(r.movePct) }, r.etf + ' ' + pct(r.movePct)),
                        e('span', { className: 'nbm-sec-c ' + tone(r.sectorContribPct) }, pct(r.sectorContribPct))))),
                e('div', { className: 'nbm-sec-f' },
                    'The last column is the SECTOR ETF’s move at your weight in it — not your names’ own return.'
                    // Named, never dropped: a partial match reads as a data
                    // gap rather than as a join that did not land.
                    + (sectors.unmatchedWeightPct
                        ? ' · ' + sectors.unmatchedWeightPct.toFixed(1) + '% of book unmatched ('
                          + sectors.unmatched.slice(0, 4).map(u => u.sector).join(', ') + ')'
                        : '')))
            : e('div', { className: 'nbm-sec-f' },
                feed.loaded && !macro
                    ? 'Sector cut unavailable — /api/macro did not answer.'
                    : 'No sector quotes to align the book against.')
    );
}

export default NexusBookVsMarket;
