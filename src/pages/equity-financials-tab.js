// ============================================================
// Equity Research — Financials tab.
//
// The three statements, as many periods as are loaded, a period-over-period
// toggle, the CFA ratio framework with its own trend, and a REAL peer median
// computed from peers' own filings — never a vendor composite and never a
// default. Where no peer carries a measured value the comparison is absent and
// says so; it is not rendered as a zero or a dash that reads like one.
//
// This is the only surface reading vw_company_fundamentals. It computes no
// ratio of its own: the arithmetic lives in the view so Valuation and this tab
// cannot drift apart, which is the whole point of the source-discipline the
// brief asked for.
// ============================================================
import React from 'react';
import { T } from './equity/equityTheme.js';
import {
    loadStatementLayer, STATE_LOADED, STATE_NOT_LOADED, STATE_FAILED,
} from './equity/equityStatements.js';
import {
    statementPeriodAvailability, periodAbsentReason,
    NOT_LOADED, PERIOD_ABSENT, INCOMPLETE, COVERAGE_DISAGREES,
} from '../lib/statementPeriodAvailability.js';
import {
    INCOME_LINES, BALANCE_LINES, CASHFLOW_LINES,
    buildColumns, visibleLines, visibleRatioGroups,
    periodChange, finite, numOrNull, indexPeers, peerComparison,
} from './equity/statementRows.js';
import {
    loadInstitutionLayer, buildInstitutionView, withheldSentence,
    INST_LOADED, INST_NO_FRAMEWORK, INST_FAILED,
} from './equity/institutionRatios.js';

const { useState, useEffect, useMemo } = React;
const h = React.createElement;


function Card(p) {
    return h('div', {
        style: Object.assign({
            border: '1px solid ' + T.border, borderRadius: 13,
            background: T.card, padding: 20,
        }, p.style || {}),
    },
        (p.title || p.badge || p.meta) && h('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' },
        },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                p.title && h('div', {
                    style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase' },
                }, p.title),
                p.badge && h('span', {
                    style: { fontFamily: T.mono, fontSize: 8.5, letterSpacing: '.1em', color: T.cyan, border: '1px solid rgba(34,211,238,.4)', borderRadius: 4, padding: '2px 5px' },
                }, p.badge)
            ),
            p.meta && h('div', { style: { fontFamily: T.mono, fontSize: 10, color: T.muted2 } }, p.meta)
        ),
        p.children
    );
}

// ── formatters. Absent renders as an em dash, never as 0. ────────────────────
function money(v) {
    if (!finite(v)) return '—';
    var x = Number(v), a = Math.abs(x), s = x < 0 ? '-' : '';
    if (a >= 1e12) return s + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9)  return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6)  return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3)  return s + '$' + (a / 1e3).toFixed(1) + 'K';
    return s + '$' + a.toFixed(0);
}
function pct(v, dp) { return finite(v) ? (Number(v) * 100).toFixed(dp == null ? 1 : dp) + '%' : '—'; }
function dec(v, dp) { return finite(v) ? Number(v).toFixed(dp == null ? 2 : dp) : '—'; }
function signedPct(v) {
    if (!finite(v)) return '—';
    var x = Number(v) * 100;
    return (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
}
function toneOf(v) { return !finite(v) ? T.muted2 : Number(v) > 0 ? T.green : Number(v) < 0 ? T.red : T.muted; }

function Th(p) {
    return h('th', {
        style: Object.assign({
            textAlign: p.left ? 'left' : 'right', padding: '7px 10px',
            fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.08em',
            color: T.muted2, textTransform: 'uppercase', fontWeight: 500,
            borderBottom: '1px solid ' + T.border2, whiteSpace: 'nowrap',
        }, p.style || {}),
    }, p.children);
}
function Td(p) {
    return h('td', {
        style: Object.assign({
            textAlign: p.left ? 'left' : 'right', padding: '6px 10px',
            fontFamily: T.mono, fontSize: 11.5,
            color: p.color || T.text, whiteSpace: 'nowrap',
            fontWeight: p.emphasis ? 600 : 400,
            borderBottom: '1px solid rgba(255,255,255,.04)',
        }, p.style || {}),
    }, p.children);
}

// ── statement table ──────────────────────────────────────────────────────────
function StatementTable({ title, lines, columns, showPoP }) {
    const rows = visibleLines(columns, lines);
    if (!rows.length) {
        return h(Card, { title },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted2 } },
                'No line items reported for this statement.'));
    }
    return h(Card, { title, meta: columns.length + ' periods' },
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null, h('tr', null,
                    h(Th, { left: true }, 'Line'),
                    columns.map(function (c) { return h(Th, { key: c.key }, c.label); }),
                    showPoP && h(Th, { key: '__pop', style: { color: T.cyan } }, 'Δ latest')
                )),
                h('tbody', null, rows.map(function (l) {
                    const latest = columns[0] && columns[0].row;
                    const prior  = columns[0] && columns[0].prior;
                    const ch = showPoP ? periodChange(latest && latest[l.key], prior && prior[l.key]) : null;
                    return h('tr', { key: l.key },
                        h(Td, { left: true, emphasis: l.emphasis, color: l.emphasis ? T.text : T.muted }, l.label),
                        columns.map(function (c) {
                            return h(Td, { key: c.key, emphasis: l.emphasis }, money(c.row[l.key]));
                        }),
                        showPoP && h(Td, { key: '__pop', color: ch ? toneOf(ch.pct != null ? ch.pct : ch.abs) : T.muted2 },
                            ch ? (ch.pct != null ? signedPct(ch.pct) : money(ch.abs)) : '—')
                    );
                }))
            )
        )
    );
}

// ── ratio table, with the real peer median beside each latest figure ─────────
function RatioTable({ columns, peerIndex }) {
    const groups = visibleRatioGroups(columns);
    if (!groups.length) return null;
    const latest = columns[0];
    const alignedYear = latest ? latest.alignedYear : null;

    return h(Card, {
        title: 'Ratio analysis',
        badge: 'CFA FRAMEWORK',
        meta: 'latest vs peer median · ' + columns.length + ' periods of trend',
    },
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null, h('tr', null,
                    h(Th, { left: true }, 'Ratio'),
                    columns.map(function (c) { return h(Th, { key: c.key }, c.label); }),
                    h(Th, { style: { color: T.cyan } }, 'Peer median'),
                    h(Th, { style: { color: T.cyan } }, 'vs peers')
                )),
                h('tbody', null, groups.map(function (g) {
                    return [
                        h('tr', { key: 'g-' + g.group },
                            h('td', {
                                colSpan: columns.length + 3,
                                style: {
                                    padding: '12px 10px 5px', fontFamily: T.mono, fontSize: 9.5,
                                    letterSpacing: '.12em', color: T.cyan, textTransform: 'uppercase',
                                },
                            }, g.group)
                        ),
                    ].concat(g.rows.map(function (r) {
                        const cmp = peerComparison(peerIndex, alignedYear, r.key);
                        const own = latest ? numOrNull(latest.row[r.key]) : null;
                        const fmt = function (v) { return r.pct ? pct(v) : dec(v, r.dp); };
                        return h('tr', { key: r.key },
                            h(Td, { left: true, color: T.muted }, r.label),
                            columns.map(function (c) {
                                return h(Td, { key: c.key }, fmt(c.row[r.key]));
                            }),
                            // No peers with a measured value → no comparison.
                            h(Td, { key: '__pm', color: T.muted },
                                cmp && cmp.measurable && cmp.median != null ? fmt(cmp.median) : '—'),
                            h(Td, { key: '__vs', color: cmp && cmp.measurable && cmp.vsMedian != null ? toneOf(cmp.vsMedian) : T.muted2 },
                                cmp && cmp.measurable && cmp.vsMedian != null && own != null
                                    ? (r.pct ? signedPct(cmp.vsMedian) : (cmp.vsMedian >= 0 ? '+' : '') + dec(cmp.vsMedian, r.dp))
                                    : '—')
                        );
                    }));
                }))
            )
        ),
        h(PeerNote, { peerIndex, alignedYear })
    );
}

/**
 * State the denominator. A comparison with no measured peers is not a weak
 * comparison, it is no comparison, and the reader has to be able to tell.
 */
function PeerNote({ peerIndex, alignedYear }) {
    const forYear = peerIndex && peerIndex.get(alignedYear);
    let best = null;
    if (forYear) {
        forYear.forEach(function (row) {
            const n = Number(row.peer_count) || 0;
            if (!best || n > best.n) best = { n, peers: row.peer_symbols || [], group: row.peer_group };
        });
    }
    const style = { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.6 };
    if (!best || !best.n) {
        return h('div', { style },
            'No peer median: no other company in this sector has statements loaded yet, '
          + 'so there is nothing to compare against. This is an absence of peers, not a peer average of zero.');
    }
    return h('div', { style },
        'Peer median over ' + best.n + ' ' + (best.n === 1 ? 'peer' : 'peers')
        + (best.peers.length ? ' (' + best.peers.join(', ') + ')' : '')
        + ' in ' + (best.group || 'the same sector')
        + ', from their own filings. The company is excluded from its own peer group.'
        + (best.n < 3 ? ' A median over fewer than three peers is thin — read it as a single comparison, not a benchmark.' : '')
    );
}

// ── FCFF / FCFE derivation, shown as a bridge rather than a number ───────────
function CashFlowBridge({ columns }) {
    const c = columns[0];
    if (!c) return null;
    const r = c.row;
    if (!finite(r.fcff) && !finite(r.fcfe) && !finite(r.free_cash_flow)) return null;
    const taxRate = numOrNull(r.effective_tax_rate);
    const steps = [
        { label: 'Cash from operations', value: r.operating_cashflow },
        { label: 'Interest × (1 − t)' + (taxRate != null ? '  ·  t = ' + pct(taxRate) : ''),
          value: finite(r.interest_expense) && taxRate != null ? Math.abs(Number(r.interest_expense)) * (1 - taxRate) : null, add: true },
        { label: 'Capital expenditure', value: finite(r.capital_expenditures) ? -Math.abs(Number(r.capital_expenditures)) : null },
        { label: 'FCFF', value: r.fcff, total: true },
        { label: 'Net borrowing', value: r.net_borrowing },
        { label: 'FCFE', value: r.fcfe, total: true },
    ];
    return h(Card, { title: 'FCFF / FCFE derivation', badge: 'FROM THE STATEMENTS', meta: c.label },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            steps.map(function (s, i) {
                return h('div', {
                    key: i,
                    style: {
                        display: 'flex', justifyContent: 'space-between', gap: 16,
                        padding: '7px 10px', borderRadius: 6,
                        background: s.total ? 'rgba(34,211,238,.06)' : 'transparent',
                        borderTop: s.total ? '1px solid ' + T.border2 : 'none',
                    },
                },
                    h('span', { style: { fontFamily: T.mono, fontSize: 11, color: s.total ? T.text : T.muted } }, s.label),
                    h('span', { style: { fontFamily: T.mono, fontSize: 11.5, fontWeight: s.total ? 600 : 400, color: s.total ? T.cyan : T.text } },
                        money(s.value))
                );
            })
        ),
        h('div', { style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.6 } },
            'FCFF is taken on the CFO basis — cash from operations plus the after-tax '
          + 'interest shield, less capital expenditure — because it captures every non-cash '
          + 'item the filer actually reported rather than a list someone chose to enumerate. '
          + 'The effective rate is clamped to [0,1]: a loss year produces a rate outside that '
          + 'range, and a tax shield outside it is not a measurement.')
    );
}

// ── absent / failed states, kept apart ───────────────────────────────────────
function NotLoaded({ symbol, coverage, period, onPeriod }) {
    // "This symbol is not loaded" and "this symbol has nothing on THIS period
    // basis" are different facts. The old code tested only
    // `statements_present > 0 && !is_complete`, which is FALSE for a symbol
    // that is complete on the other basis -- so switching AAPL to Quarterly
    // fell through to the generic unloaded copy and blamed an Alpha Vantage
    // quota that never applied to it: AAPL carries 19 annual periods, loaded
    // from EDGAR, which has no key and no daily cap. 43 of the loaded symbols
    // are annual-only, so the wrong sentence was the modal one.
    const view = statementPeriodAvailability(coverage, period);

    const title = view.state === PERIOD_ABSENT
            ? 'No ' + view.requested + ' statements for ' + symbol
        : view.state === INCOMPLETE
            ? 'Statements for ' + symbol + ' are incomplete'
        : view.state === COVERAGE_DISAGREES
            ? 'The ' + view.requested + ' statements for ' + symbol + ' did not come back'
        : 'Statements for ' + symbol + ' are not loaded yet';

    const body = view.state === PERIOD_ABSENT
            ? periodAbsentReason(view)
        : view.state === INCOMPLETE
            ? ('Only ' + view.statementsPresent + ' of the three statements landed, and no single fiscal '
               + 'period carries all three, so no ratio can be computed. The loader retries incomplete '
               + 'symbols rather than treating them as done.')
        : view.state === COVERAGE_DISAGREES
            // Coverage claims periods on the very basis asked for, and the view
            // returned none. That is two objects disagreeing, not an absence,
            // and saying "not loaded" would be this panel's own defect again.
            ? ('Coverage reports ' + view.requestedCount + ' ' + view.requested + ' period'
               + (view.requestedCount === 1 ? '' : 's') + ' for this symbol and the ratio view returned '
               + 'none. Those two disagree, so this is a fault to chase rather than a symbol to load.')
        : ('This is an absence, not a failure. The statement layer is loaded per symbol; the EDGAR '
           + 'reader has no key and no daily cap, and the Alpha Vantage key is on the free tier '
           + '— 25 requests a day against three per symbol. Held names are loaded first.');

    return h(Card, { title: 'Financial statements' },
        h('div', { style: { fontFamily: T.display, fontSize: 15, color: T.text, marginBottom: 8 } }, title),
        h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.7, maxWidth: 680 } }, body),
        // Offered ONLY when the other basis genuinely carries periods --
        // `available` is absent from the shape otherwise, so a switch to an
        // equally empty basis cannot be rendered.
        view.available && onPeriod && h('button', {
            onClick: function () { onPeriod(view.available); },
            style: {
                marginTop: 14, cursor: 'pointer', fontFamily: T.mono, fontSize: 11,
                color: T.cyan, background: T.cyanDim, border: '1px solid ' + T.cyan,
                borderRadius: 6, padding: '7px 13px', letterSpacing: '.04em',
            },
        }, 'Show the ' + view.available + ' statements →'),
        h('div', { style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2 } },
            'Nothing on this tab is estimated or defaulted while statements are missing.')
    );
}

function Failed({ symbol, error }) {
    return h(Card, { title: 'Financial statements' },
        h('div', { style: { fontFamily: T.display, fontSize: 15, color: T.amber, marginBottom: 8 } },
            'The statement feed did not answer'),
        h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.7, maxWidth: 680 } },
            'This is a transport failure reading the statements for ' + symbol + ', not a statement '
          + 'about the company. The figures may well exist; this request could not reach them.'),
        error && h('div', { style: { marginTop: 10, fontFamily: T.mono, fontSize: 10, color: T.muted2 } }, String(error))
    );
}

// ── the tab ──────────────────────────────────────────────────────────────────
// ── EQ-4 · the CFA L2 V3 LM4 institution framework ──────────────────────────
//
// EQ-2's `statement_profile` gate correctly nulls a bank's operating cycle,
// free cash flow, EBITDA multiples and interest coverage: for a depository,
// interest expense is a cost of revenue and CFO is not a free-cash-flow base.
// Until now the tab said so and stopped, with a note reading "a CAMELS
// framework is the right instrument here and is not built yet". It is built,
// and a sentence on screen asserting otherwise is the wrong-entry defect this
// codebase already records twice — once about a dead feed that had recovered.
//
// Nothing here computes a ratio. The arithmetic lives in
// `vw_company_institution_ratios`, gated on the framework the FILING supports,
// and `buildInstitutionView` decides only what may be RENDERED.

const METRIC_META = {
    // ── CAMELS · E ──
    efficiency_ratio: {
        group: 'Earnings', label: 'Efficiency ratio', fmt: 'pct',
        note: 'Noninterest expense over net interest income plus noninterest income. Lower is better.',
    },
    noninterest_income_share: {
        group: 'Earnings', label: 'Noninterest income share', fmt: 'pct',
        note: 'How much of revenue does not come from the spread.',
    },
    nii_to_assets: {
        // NOT "net interest margin": that is NII over average EARNING assets,
        // and earning assets are not a line the face statements carry.
        group: 'Earnings', label: 'Net interest income / assets', fmt: 'pct2',
        note: 'Not the net interest margin — that needs average earning assets, which the face statements do not report.',
    },
    // ── CAMELS · A ──
    allowance_to_loans: {
        group: 'Asset quality', label: 'Allowance / loans', fmt: 'pct2',
        note: 'The credit-loss allowance against the loan book it is held for.',
    },
    loans_to_assets: {
        group: 'Asset quality', label: 'Loans / assets', fmt: 'pct',
        note: 'How much of the balance sheet is lending rather than markets.',
    },
    // ── CAMELS · L ──
    deposits_to_assets: {
        group: 'Liquidity', label: 'Deposits / assets', fmt: 'pct',
        note: 'The share of funding that is deposits.',
    },
    // ── short-duration contracts ──
    loss_and_lae_ratio: {
        group: 'Underwriting', label: 'Loss and LAE ratio', fmt: 'pct',
        note: 'Losses and loss-adjustment expense over premiums earned. For a health insurer this is the medical care ratio.',
    },
    reserves_to_premiums: {
        group: 'Underwriting', label: 'Claim reserves / premiums', fmt: 'x',
        note: 'Reserve size against the premium base the reserves were written on.',
    },
    // ── long-duration contracts ──
    benefits_to_premiums: {
        group: 'Long-duration', label: 'Benefits / premiums', fmt: 'x',
        note: null, // supplied by the caveat, which travels with the figure
    },
    separate_account_share: {
        group: 'Long-duration', label: 'Separate accounts / assets', fmt: 'pct',
        note: 'Policyholder-directed assets, where the investment risk is not the insurer’s.',
    },
};

const CAVEAT_SENTENCE = {
    premiums_are_a_minority_of_long_duration_revenue:
        'READ THIS AS A COVERAGE RATIO, NOT A LOSS RATIO. A long-duration insurer earns most '
      + 'of its revenue as net investment income and policy fees, so premiums are a minority '
      + 'denominator and this figure runs near or above 1.0 in an ordinary year without saying '
      + 'anything about underwriting.',
};

const GROUP_ORDER = ['Earnings', 'Asset quality', 'Liquidity', 'Underwriting', 'Long-duration'];

function fmtMetric(v, kind) {
    if (kind === 'x')    return Number(v).toFixed(3) + '×';
    if (kind === 'pct2') return pct(v, 2);
    return pct(v, 1);
}

function InstitutionMetric({ k, value, series }) {
    const meta = METRIC_META[k];
    if (!meta) return null;
    // The trend is the last five MEASURED years. A year the filing did not
    // support the metric is absent from it rather than plotted as zero.
    const pts = series ? series(k).slice(-5) : [];
    return h('div', {
        style: {
            border: '1px solid ' + T.border, borderRadius: 9, padding: '11px 13px',
            background: T.card2, display: 'flex', flexDirection: 'column', gap: 5,
        },
    },
        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.07em', color: T.muted2, textTransform: 'uppercase' } }, meta.label),
        h('div', { style: { fontFamily: T.mono, fontSize: 19, color: T.text, letterSpacing: '-.01em' } }, fmtMetric(value, meta.fmt)),
        pts.length > 1 && h('div', { style: { fontFamily: T.mono, fontSize: 9, color: T.muted2, display: 'flex', gap: 9, flexWrap: 'wrap' } },
            pts.map(function (pt) {
                return h('span', { key: pt.year },
                    String(pt.year).slice(2) + ' ' + fmtMetric(pt.value, meta.fmt));
            })
        ),
        meta.note && h('div', { style: { fontFamily: T.mono, fontSize: 10, color: T.muted, lineHeight: 1.5 } }, meta.note)
    );
}

function Withheld({ code }) {
    const sentence = withheldSentence(code);
    if (!sentence) return null;
    return h('div', {
        style: {
            border: '1px dashed ' + T.border2, borderRadius: 9, padding: '11px 13px',
            display: 'flex', flexDirection: 'column', gap: 5,
        },
    },
        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.07em', color: T.amber, textTransform: 'uppercase' } }, 'Withheld'),
        // NO VALUE NODE AT ALL. An em dash in a slot that looks like every
        // other slot is indistinguishable from a measurement; F-4 records the
        // same near miss.
        h('div', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.muted, lineHeight: 1.55 } }, sentence)
    );
}

export function InstitutionFrameworkPanel({ symbol }) {
    const [res, setRes] = useState(null);

    useEffect(function () {
        let cancelled = false;
        setRes(null);
        if (!symbol) return;
        loadInstitutionLayer(symbol).then(function (r) { if (!cancelled) setRes(r); });
        return function () { cancelled = true; };
    }, [symbol]);

    if (!res) {
        return h(Card, { title: 'CFA institution framework' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted2 } }, 'Loading as-reported lines…'));
    }

    // A TRANSPORT FAILURE IS NEVER A STATEMENT ABOUT THE DATA.
    if (res.state === INST_FAILED) {
        return h(Card, { title: 'CFA institution framework' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.amber, lineHeight: 1.6 } },
                'The as-reported line feed did not answer, so nothing is shown. This says nothing '
              + 'about whether ' + symbol + ' has an institution framework — the query failed.'));
    }

    const v = buildInstitutionView(res.rows);

    if (v.state === INST_NO_FRAMEWORK) {
        return h(Card, { title: 'CFA institution framework', meta: 'FY' + v.fiscalYear },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.6 } },
                symbol + '’s as-reported filings are loaded and carry no depository or insurance '
              + 'contract lines, so no LM4 framework applies. That is an answer about the filer, '
              + 'not a gap in the data.'));
    }

    if (v.state !== INST_LOADED) {
        // NOT LOADED is different from NO FRAMEWORK and says what to do.
        return h(Card, { title: 'CFA institution framework' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.6 } },
                'No as-reported lines are loaded for ' + symbol + '. The institution layer covers the '
              + 'filers loaded so far, not the whole universe — an unloaded symbol is not a symbol '
              + 'without a framework.'));
    }

    const keys = Object.keys(v.metrics).filter(function (k) { return METRIC_META[k]; });
    const byGroup = {};
    keys.forEach(function (k) {
        const g = METRIC_META[k].group;
        (byGroup[g] = byGroup[g] || []).push(k);
    });
    const caveat = v.metrics.benefits_ratio_caveat
        ? CAVEAT_SENTENCE[v.metrics.benefits_ratio_caveat] || v.metrics.benefits_ratio_caveat
        : null;
    const withheldCodes = Object.keys(v.withheld)
        .map(function (k) { return v.withheld[k]; })
        .filter(function (c) { return withheldSentence(c); });

    return h(Card, {
        title: 'CFA institution framework',
        badge: v.frameworkLabel,
        meta: 'FY' + v.fiscalYear + '  ·  ' + v.periods + ' periods  ·  as-reported XBRL',
    },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
            GROUP_ORDER.filter(function (g) { return byGroup[g]; }).map(function (g) {
                return h('div', { key: g },
                    h('div', {
                        style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 8 },
                    }, g),
                    h('div', {
                        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 },
                    }, byGroup[g].map(function (k) {
                        return h(InstitutionMetric, { key: k, k, value: v.metrics[k], series: v.series });
                    }))
                );
            }),

            // The caveat sits WITH the figure's group, not in a footnote.
            caveat && h('div', {
                style: {
                    border: '1px solid ' + T.border2, borderRadius: 9, padding: '11px 13px',
                    fontFamily: T.mono, fontSize: 10.5, color: T.amber, lineHeight: 1.55,
                },
            }, caveat),

            withheldCodes.length > 0 && h('div', null,
                h('div', {
                    style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 8 },
                }, 'Refused, with a reason'),
                h('div', {
                    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 },
                }, withheldCodes.map(function (c) { return h(Withheld, { key: c, code: c }); }))
            )
        )
    );
}


export function FinancialsTab({ symbol }) {
    const [period,  setPeriod]  = useState('annual');
    const [showPoP, setShowPoP] = useState(true);
    const [maxCols, setMaxCols] = useState(6);
    const [state,   setState]   = useState({ state: STATE_NOT_LOADED, rows: [], peers: [], coverage: null });
    const [loading, setLoading] = useState(false);

    useEffect(function () {
        let cancelled = false;
        if (!symbol) return;
        setLoading(true);
        loadStatementLayer(symbol, period).then(function (res) {
            if (!cancelled) { setState(res); setLoading(false); }
        });
        return function () { cancelled = true; };
    }, [symbol, period]);

    const columns   = useMemo(function () { return buildColumns(state.rows, maxCols); }, [state.rows, maxCols]);
    const peerIndex = useMemo(function () { return indexPeers(state.peers); }, [state.peers]);

    if (loading) {
        return h(Card, { title: 'Financial statements' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted2 } }, 'Loading statements…'));
    }
    if (state.state === STATE_FAILED)     return h(Failed, { symbol, error: state.error });
    if (state.state === STATE_NOT_LOADED) return h(NotLoaded, { symbol, coverage: state.coverage, period, onPeriod: setPeriod });

    const profile = columns[0] && columns[0].row.statement_profile;

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h(Card, { style: { padding: '12px 16px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' } },
                h(Toggle, {
                    label: 'Period', value: period, onChange: setPeriod,
                    options: [{ v: 'annual', l: 'Annual' }, { v: 'quarterly', l: 'Quarterly' }],
                }),
                h(Toggle, {
                    // `Max` is UNBOUNDED, not 20. buildColumns treats a null
                    // limit as every loaded period, so a quarterly load showing
                    // 81 periods can actually show 81.
                    label: 'Columns', value: maxCols == null ? 'all' : String(maxCols),
                    onChange: function (v) { setMaxCols(v === 'all' ? null : Number(v)); },
                    options: [{ v: '4', l: '4' }, { v: '6', l: '6' }, { v: '10', l: '10' }, { v: 'all', l: 'Max' }],
                }),
                h('label', { style: { display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' } },
                    h('input', {
                        type: 'checkbox', checked: showPoP,
                        onChange: function (e) { setShowPoP(e.target.checked); },
                        style: { accentColor: T.cyan, cursor: 'pointer' },
                    }),
                    h('span', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.muted, letterSpacing: '.05em' } },
                        'Period-over-period')
                ),
                h('div', { style: { marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.muted2 } },
                    state.rows.length + ' periods loaded'
                    + (profile === 'financial' ? '  ·  FINANCIAL-INSTITUTION PROFILE' : ''))
            ),
            profile === 'financial' && h('div', {
                style: { marginTop: 10, fontFamily: T.mono, fontSize: 10, color: T.amber, lineHeight: 1.6 },
            },
                'This is a financial institution. Ratios that are undefined for one — the operating '
              + 'cycle, free cash flow, EBITDA multiples and interest coverage — are withheld rather '
              + 'than computed, because for a bank interest expense is a cost of revenue and CFO is '
              + 'not a free-cash-flow base. The right instrument is the CFA L2 V3 LM4 framework '
              + 'below, computed from as-reported XBRL lines rather than from the normalised '
              + 'statements these ratios come from.')
        ),
        // Only for a financial filer: for everyone else the LM4 frameworks do
        // not apply and a panel saying so on every retailer is noise.
        profile === 'financial' && h(InstitutionFrameworkPanel, { symbol }),
        h(RatioTable,      { columns, peerIndex }),
        h(CashFlowBridge,  { columns }),
        h(StatementTable,  { title: 'Income statement', lines: INCOME_LINES,   columns, showPoP }),
        h(StatementTable,  { title: 'Balance sheet',    lines: BALANCE_LINES,  columns, showPoP }),
        h(StatementTable,  { title: 'Cash flow',        lines: CASHFLOW_LINES, columns, showPoP })
    );
}

function Toggle({ label, value, onChange, options }) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', color: T.muted2, textTransform: 'uppercase' } }, label),
        h('div', { style: { display: 'flex', gap: 3 } },
            options.map(function (o) {
                const on = String(value) === String(o.v);
                return h('button', {
                    key: o.v,
                    onClick: function () { onChange(o.v); },
                    style: {
                        fontFamily: T.mono, fontSize: 10, padding: '4px 9px', cursor: 'pointer',
                        borderRadius: 5, border: '1px solid ' + (on ? 'rgba(34,211,238,.45)' : T.border),
                        background: on ? 'rgba(34,211,238,.10)' : 'transparent',
                        color: on ? T.cyan : T.muted,
                    },
                }, o.l);
            })
        )
    );
}

export default FinancialsTab;
