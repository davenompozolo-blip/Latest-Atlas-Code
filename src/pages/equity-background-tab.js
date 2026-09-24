// ============================================================
// Equity Research — Company Background.
//
// Identity, classification and phase. What it shows is what the platform can
// actually support, and it says plainly what it cannot: a description, the
// customer base and segments, the addressable market and geographic exposure
// are NOT in any feed this platform holds. Rendering an empty box for those
// would repeat the failure this whole rebuild is correcting.
//
// The phase read (Growth / Mature / Early stage) is DERIVED from the
// statements and shows its own evidence, rather than being asserted from a
// vendor tag. Absolute bands, printed on the card: a quantile rule would
// relabel a company because its peers changed.
// ============================================================
import React from 'react';
import { T } from './equity/equityTheme.js';
import { sb } from './config.js';
import {
    loadStatementLayer, STATE_LOADED, STATE_FAILED,
} from './equity/equityStatements.js';
import { companyPhase, revenueCagr, numOrNull, finite } from './equity/statementRows.js';
import { loadCompanyProfile } from './equity/companyProfile.js';
import {
    buildProfileView, fiscalYearEndLabel, PROFILE_LOADED, PROFILE_FAILED,
} from '../lib/companyProfileView.js';

const { useState, useEffect } = React;
const h = React.createElement;


function Card(p) {
    return h('div', {
        style: Object.assign({ border: '1px solid ' + T.border, borderRadius: 13, background: T.card, padding: 20 }, p.style || {}),
    },
        p.title && h('div', {
            style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase', marginBottom: 14 },
        }, p.title),
        p.children);
}

function Field({ label, value, mono }) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { style: { fontFamily: T.mono, fontSize: 9, letterSpacing: '.1em', color: T.muted2, textTransform: 'uppercase' } }, label),
        h('span', { style: { fontFamily: mono ? T.mono : T.display, fontSize: 13.5, color: value ? T.text : T.muted2 } },
            value || '—'));
}

function money(v) {
    if (!finite(v)) return '—';
    var x = Number(v), a = Math.abs(x), s = x < 0 ? '-' : '';
    if (a >= 1e12) return s + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9)  return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6)  return s + '$' + (a / 1e6).toFixed(1) + 'M';
    return s + '$' + a.toFixed(0);
}
function pct(v, dp) { return finite(v) ? (Number(v) * 100).toFixed(dp == null ? 1 : dp) + '%' : '—'; }

export function BackgroundTab({ symbol, rawOverview }) {
    const [theme, setTheme]   = useState(undefined); // undefined = loading, null = none
    const [asset, setAsset]   = useState(null);
    const [rows,  setRows]    = useState(null);
    const [rowsState, setRowsState] = useState(null);
    const [rowsError, setRowsError] = useState(null);
    const [profile, setProfile] = useState(null); // null = loading

    useEffect(function () {
        let cancelled = false;
        if (!symbol) return;
        setTheme(undefined); setAsset(null); setRows(null); setProfile(null);
        setRowsState(null); setRowsError(null);
        sb.from('position_themes').select('theme').eq('symbol', symbol).maybeSingle()
            .then(function (r) { if (!cancelled) setTheme((r.data && r.data.theme) || null); })
            .catch(function () { if (!cancelled) setTheme(null); });
        sb.from('assets').select('symbol,name,sector,asset_class,exchange').eq('symbol', symbol).maybeSingle()
            .then(function (r) { if (!cancelled && r.data) setAsset(r.data); })
            .catch(function () {});
        loadStatementLayer(symbol, 'annual').then(function (res) {
            // KEEP THE STATE. This was `res.state === STATE_LOADED ? res.rows : []`,
            // so a transport failure arrived as an empty array and the Company
            // phase panel printed "statements are not loaded" — a claim about
            // the company, printed when the query had been cancelled. That is
            // the split `equityStatements` publishes three states for.
            if (!cancelled) {
                setRows(res.state === STATE_LOADED ? res.rows : []);
                setRowsState(res.state);
                setRowsError(res.state === STATE_FAILED ? (res.error || null) : null);
            }
        });
        loadCompanyProfile(symbol).then(function (res) {
            if (!cancelled) setProfile(res);
        });
        return function () { cancelled = true; };
    }, [symbol]);

    const ov = rawOverview || {};
    // SECTOR AND INDUSTRY ARE DIFFERENT OBJECTS AND NEITHER FALLS BACK TO THE
    // OTHER. `mapFinnhubOverview` sets `Sector` and `Industry` BOTH from
    // `p.finnhubIndustry`, so this card read `SECTOR Technology / INDUSTRY
    // Technology` for Apple -- a two-level taxonomy the vendor does not have.
    // EQ-7 measured the same copy one layer down in `equity_screener_universe`
    // (896 rows identical, 0 where both are present and differ).
    //
    // The industry now comes from the SEC's own SIC classification, which over
    // the 52 loaded symbols gives 33 distinct industries against the vendor's
    // 17 and equals the sector on NONE of them. `industrySource` travels with
    // it so the taxonomy is named rather than assumed comparable.
    const prof = buildProfileView(
        profile && profile.row,
        { sector: (asset && asset.sector) || ov.Sector || null },
        profile ? profile.state : null);
    const phase = rows && rows.length ? companyPhase(rows) : null;
    const cagr = rows && rows.length ? revenueCagr(rows) : null;
    const latest = rows && rows.length ? rows[0] : null;

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },

        // ── identity ────────────────────────────────────────────────────────
        h(Card, null,
            h('div', { style: { display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' } },
                ov._logo
                    ? h('img', {
                        src: ov._logo, alt: '',
                        // An image that fails to load leaves nothing behind
                        // rather than a broken-image glyph.
                        onError: function (e) { e.target.style.display = 'none'; },
                        style: { width: 56, height: 56, borderRadius: 10, background: '#fff', objectFit: 'contain', padding: 4, flexShrink: 0 },
                    })
                    : null,
                h('div', { style: { flex: 1, minWidth: 220 } },
                    h('div', { style: { fontFamily: T.display, fontSize: 21, color: T.text, marginBottom: 3 } },
                        ov.Name || (asset && asset.name) || symbol),
                    h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted } },
                        [symbol, ov.Exchange || (asset && asset.exchange), ov._country].filter(Boolean).join('  ·  ')),
                    ov._weburl && h('a', {
                        href: ov._weburl, target: '_blank', rel: 'noopener noreferrer',
                        style: { fontFamily: T.mono, fontSize: 10.5, color: T.cyan, textDecoration: 'none', marginTop: 6, display: 'inline-block' },
                    }, ov._weburl.replace(/^https?:\/\//, ''))
                ),
                h('div', {
                    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 16, flex: 2, minWidth: 280 },
                },
                    h(Field, { label: 'Market cap', value: money(ov.MarketCapitalization), mono: true }),
                    h(Field, { label: 'Shares out', value: finite(ov._sharesOutstanding) ? (Number(ov._sharesOutstanding) / 1e6).toFixed(0) + 'M' : '—', mono: true }),
                    h(Field, { label: 'Listed since', value: ov._ipo || '—', mono: true })
                )
            )
        ),

        // ── classification ──────────────────────────────────────────────────
        h(Card, { title: 'Classification' },
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 18 } },
                h(Field, { label: 'Sector', value: prof.sector || null }),
                h(Field, {
                    label: prof.industrySource ? 'Industry · ' + prof.industrySource : 'Industry',
                    // ABSENT, never a fallback to the sector and never ''.
                    value: prof.industry || null,
                }),
                h(Field, {
                    label: 'Theme',
                    value: theme === undefined ? '…' : theme,
                }),
                h(Field, { label: 'Instrument', value: (asset && asset.asset_class) || null, mono: true })
            ),
            // Theme is NULL for an unmapped name and is never coalesced to
            // sector: they are two taxonomies and conflating them is a mistake
            // this codebase has already had to correct once.
            // A dead feed and an unloaded symbol are different facts and get
            // different sentences. Never let a transport failure render as a
            // statement about the company.
            profile && !prof.industry && h('div', {
                style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2 },
            }, prof.state === PROFILE_FAILED
                ? 'The classification feed did not answer, so no industry is shown. That is a '
                  + 'statement about the feed, not about this company.'
                : 'No SEC filer profile loaded for this symbol, so no industry is shown. The '
                  + 'vendor sector is kept as its own field and is never shown as an industry.'),
            prof.industry && (prof.filerCategory || prof.fiscalYearEnd || prof.stateOfIncorporation) && h('div', {
                style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7 },
            }, [
                prof.sicCode ? 'SIC ' + prof.sicCode : null,
                prof.filerCategory,
                prof.stateOfIncorporation ? 'Incorporated in ' + prof.stateOfIncorporation : null,
                prof.fiscalYearEnd ? 'Fiscal year ends ' + fiscalYearEndLabel(prof.fiscalYearEnd) : null,
            ].filter(Boolean).join('  ·  ')),
            theme === null && h('div', { style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2 } },
                'No theme mapped for this name. Theme is a hand-kept taxonomy and is deliberately '
              + 'not defaulted to the sector — they answer different questions.')
        ),

        // ── phase, derived ──────────────────────────────────────────────────
        h(Card, { title: 'Company phase', style: null },
            rows == null
                ? h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted2 } }, 'Reading the statements…')
                : !rows.length
                    ? h('div', { style: { fontFamily: T.mono, fontSize: 11, color: rowsState === STATE_FAILED ? T.amber : T.muted, lineHeight: 1.7 } },
                        rowsState === STATE_FAILED
                            ? 'The statement feed did not answer, so the phase cannot be established. '
                              + 'This is a transport failure, not a statement about ' + symbol + ' — the '
                              + 'filings may well be loaded.' + (rowsError ? ' (' + rowsError + ')' : '')
                            : 'Statements for ' + symbol + ' are not loaded, so the phase cannot be established. '
                              + 'It is not assumed to be mature by default.')
                    : !phase
                        ? h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.7 } },
                            'Not enough of a filing history to place this company in a phase.')
                        : h('div', null,
                            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 } },
                                h('span', { style: { fontFamily: T.display, fontSize: 24, color: T.cyan } }, phase.phase),
                                h('span', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted } }, '— ' + phase.why)
                            ),
                            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16 } },
                                h(Field, { label: 'Revenue CAGR', value: pct(cagr), mono: true }),
                                h(Field, { label: 'Over', value: phase.evidence.periods + ' periods', mono: true }),
                                h(Field, { label: 'Payout ratio', value: pct(phase.evidence.payoutRatio), mono: true }),
                                h(Field, { label: 'Reinvestment', value: pct(phase.evidence.reinvestmentRate), mono: true }),
                                h(Field, { label: 'Profitable', value: phase.evidence.profitable == null ? null : (phase.evidence.profitable ? 'Yes' : 'No') })
                            ),
                            h('div', { style: { marginTop: 14, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.6 } },
                                'Derived from the filed statements, not from a vendor tag. Bands are absolute and fixed: '
                              + 'growth above ' + Math.round(phase.bands.highGrowth * 100) + '% revenue CAGR, mature below '
                              + Math.round(phase.bands.lowGrowth * 100) + '% with a payout above '
                              + Math.round(phase.bands.maturePayout * 100) + '%. A quantile rule would relabel this '
                              + 'company because its peers changed, which is a ranking dressed as a classification.')
                        )
        ),

        // ── scale ───────────────────────────────────────────────────────────
        latest && h(Card, { title: 'Scale · ' + String(latest.fiscal_date_ending).slice(0, 7) },
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 18 } },
                h(Field, { label: 'Revenue', value: money(latest.total_revenue), mono: true }),
                h(Field, { label: 'Operating income', value: money(latest.operating_income), mono: true }),
                h(Field, { label: 'Net income', value: money(latest.net_income), mono: true }),
                h(Field, { label: 'Total assets', value: money(latest.total_assets), mono: true }),
                h(Field, { label: 'Equity', value: money(latest.total_shareholder_equity), mono: true })
            )
        ),

        // ── what this tab cannot source ─────────────────────────────────────
        h(Card, { title: 'Not sourced' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.8, maxWidth: 720 } },
                'A business description, the customer base and reporting segments, the addressable '
              + 'market and geographic exposure are not in any feed this platform holds. The vendor '
              + 'profile carries identity only and its description field is empty for every symbol — '
              + 'and so is EDGAR\'s, which publishes a `description` key and leaves it blank on every '
              + 'filer measured. Classification and filer identity ARE sourced, from the SEC; prose is not.'),
            h('div', { style: { marginTop: 10, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7, maxWidth: 720 } },
                'The route that exists is the 10-K: segment tables, the geographic breakdown and the '
              + 'business description are all in Item 1 and the segment footnote, and the thesis '
              + 'synthesiser already fetches filings from EDGAR. That is its own unit. Showing an '
              + 'empty panel for these in the meantime would repeat exactly the failure this rebuild '
              + 'is correcting.')
        )
    );
}

export default BackgroundTab;
