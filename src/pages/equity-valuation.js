import React from 'react';
import { fmt, fmtCurrency, fmtPct, cls, useChart } from './utils.js';

const { useState, useRef } = React;

function Tile(p) {
    return React.createElement('div', { className: 'metric-card' },
        React.createElement('div', { className: 'label' }, p.label),
        React.createElement('div', { className: 'value', style: p.color ? { color: p.color } : null }, p.value),
        p.sub ? React.createElement('div', { className: 'sub' }, p.sub) : null
    );
}

function SubTab(p) {
    return React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 } },
        p.tabs.map(function(t) {
            var a = t.id === p.active;
            return React.createElement('button', {
                key: t.id, onClick: function() { p.onSelect(t.id); },
                style: {
                    background: a ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 6, padding: '6px 14px', fontSize: 11,
                    fontWeight: a ? 600 : 400, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: 0.8,
                }
            }, t.label);
        })
    );
}

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }
function fB(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return fmtCurrency(n);
}

function grade(label, value, low, mid, high, invert) {
    if (value == null || !isFinite(value)) return { color: null, tag: '\u2014' };
    if (invert) {
        if (value <= low) return { color: '#10b981', tag: 'Attractive' };
        if (value <= mid) return { color: '#f59e0b', tag: 'Fair' };
        return { color: '#ef4444', tag: 'Expensive' };
    }
    if (value >= high) return { color: '#10b981', tag: 'Attractive' };
    if (value >= mid) return { color: '#f59e0b', tag: 'Fair' };
    return { color: '#ef4444', tag: 'Expensive' };
}

// ---- Sub-tab 1: Multiples ----

function MultiplesPanel(p) {
    var s = p.snap, o = p.overview, price = p.price;
    if (!s) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No valuation data.');

    var pe = o && o.PERatio ? Number(o.PERatio) : null;
    var divYield = o && o.DividendYield ? Number(o.DividendYield) : null;
    var fcfYield = s.freeCashflow && s.enterpriseValue ? s.freeCashflow / s.enterpriseValue : null;
    var earningsYield = pe && pe > 0 ? 1 / pe : null;

    var multiples = [
        { label: 'Trailing P/E', value: pe, fmt: function(v) { return fN(v, 1) + 'x'; }, g: grade('pe', pe, 15, 25, 35, true) },
        { label: 'Forward P/E', value: s.forwardPE, fmt: function(v) { return fN(v, 1) + 'x'; }, g: grade('fpe', s.forwardPE, 12, 20, 30, true) },
        { label: 'PEG Ratio', value: s.pegRatio, fmt: function(v) { return fN(v, 2); }, g: grade('peg', s.pegRatio, 1, 1.5, 2.5, true) },
        { label: 'Price / Book', value: s.priceToBook, fmt: function(v) { return fN(v, 1) + 'x'; }, g: grade('pb', s.priceToBook, 3, 8, 20, true) },
        { label: 'EV / Revenue', value: s.evToRevenue, fmt: function(v) { return fN(v, 1) + 'x'; }, g: grade('evr', s.evToRevenue, 3, 8, 15, true) },
        { label: 'EV / EBITDA', value: s.evToEbitda, fmt: function(v) { return fN(v, 1) + 'x'; }, g: grade('eve', s.evToEbitda, 10, 18, 30, true) },
    ];

    var yields = [
        { label: 'Earnings Yield', value: earningsYield },
        { label: 'FCF Yield', value: fcfYield },
        { label: 'Dividend Yield', value: divYield },
    ];

    return React.createElement('div', null,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 } },
            multiples.map(function(m) {
                return React.createElement('div', { key: m.label, className: 'metric-card' },
                    React.createElement('div', { className: 'label' }, m.label),
                    React.createElement('div', { className: 'value' }, m.value != null ? m.fmt(m.value) : '\u2014'),
                    React.createElement('div', { style: { marginTop: 6, fontSize: 11, fontWeight: 600, color: m.g.color } }, m.g.tag)
                );
            })
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 16 } },
            yields.map(function(y) {
                return React.createElement(Tile, { key: y.label, label: y.label, value: y.value != null ? (y.value * 100).toFixed(2) + '%' : '\u2014', color: y.value != null && y.value > 0.04 ? '#10b981' : null });
            })
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 } },
            React.createElement(Tile, { label: 'Enterprise Value', value: fB(s.enterpriseValue) }),
            React.createElement(Tile, { label: 'Market Cap', value: o && o.MarketCapitalization ? fB(Number(o.MarketCapitalization)) : '\u2014' }),
            React.createElement(Tile, { label: 'Current Price', value: price != null ? fmtCurrency(price) : '\u2014' }),
            React.createElement(Tile, { label: 'Book Value / Share', value: s.bookValue != null ? '$' + fN(s.bookValue) : '\u2014' })
        )
    );
}

// ---- Sub-tab 2: Fair Value Models ----

function FairValuePanel(p) {
    var s = p.snap, o = p.overview, price = p.price;
    if (!s || !price) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Insufficient data for fair value models.');

    var eps = s.trailingEps || (o && o.EPS ? Number(o.EPS) : null);
    var fwdEps = s.forwardEps;
    var bv = s.bookValue;
    var growth = s.earningsGrowth;

    var models = [];

    if (eps && bv && eps > 0 && bv > 0) {
        var graham = Math.sqrt(22.5 * eps * bv);
        models.push({ name: 'Graham Number', value: graham, desc: '\u221A(22.5 \u00D7 EPS \u00D7 Book Value)' });
    }

    if (eps && growth && growth > 0) {
        var lynch = eps * (growth * 100) * 2;
        models.push({ name: 'Peter Lynch Fair Value', value: lynch, desc: 'EPS \u00D7 Growth Rate \u00D7 2 (PEG=2 ceiling)' });
    }

    if (fwdEps && fwdEps > 0) {
        var fwdPE15 = fwdEps * 15;
        var fwdPE20 = fwdEps * 20;
        models.push({ name: 'Forward PE (15x)', value: fwdPE15, desc: 'Forward EPS \u00D7 15 (value)' });
        models.push({ name: 'Forward PE (20x)', value: fwdPE20, desc: 'Forward EPS \u00D7 20 (growth)' });
    }

    if (eps && eps > 0) {
        var epv = eps / 0.10;
        models.push({ name: 'Earnings Power Value', value: epv, desc: 'EPS / 10% required return' });
    }

    if (s.freeCashflow && o && o.MarketCapitalization) {
        var mktCap = Number(o.MarketCapitalization);
        var sharesApprox = mktCap / price;
        if (sharesApprox > 0) {
            var fcfPS = s.freeCashflow / sharesApprox;
            if (fcfPS > 0) {
                var fcfVal = fcfPS / 0.08;
                models.push({ name: 'FCF Yield (8%)', value: fcfVal, desc: 'FCF/share / 8% required yield' });
            }
        }
    }

    if (!models.length) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Not enough data for valuation models.');

    var avg = models.reduce(function(s, m) { return s + m.value; }, 0) / models.length;
    var upside = (avg / price - 1);

    return React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { marginBottom: 16, textAlign: 'center' } },
            React.createElement('div', { className: 'label', style: { marginBottom: 8 } }, 'Composite Fair Value (avg. of models)'),
            React.createElement('div', { style: { fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: upside >= 0 ? '#10b981' : '#ef4444' } }, fmtCurrency(avg)),
            React.createElement('div', { style: { fontSize: 14, marginTop: 6, color: upside >= 0 ? '#10b981' : '#ef4444' } },
                (upside >= 0 ? '+' : '') + (upside * 100).toFixed(1) + '% vs current $' + fN(price))
        ),
        React.createElement('table', { className: 'data-table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Model', 'Fair Value', 'vs Current', 'Signal'].map(function(h) { return React.createElement('th', { key: h }, h); })
                )
            ),
            React.createElement('tbody', null,
                models.map(function(m) {
                    var diff = m.value / price - 1;
                    var signal = diff > 0.15 ? 'Undervalued' : diff < -0.15 ? 'Overvalued' : 'Fair';
                    var sigColor = diff > 0.15 ? '#10b981' : diff < -0.15 ? '#ef4444' : '#f59e0b';
                    return React.createElement('tr', { key: m.name },
                        React.createElement('td', null,
                            React.createElement('div', { style: { fontWeight: 600, color: 'var(--text)' } }, m.name),
                            React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Figtree', sans-serif" } }, m.desc)
                        ),
                        React.createElement('td', { style: { fontWeight: 600 } }, fmtCurrency(m.value)),
                        React.createElement('td', { style: { color: diff >= 0 ? '#10b981' : '#ef4444' } }, (diff >= 0 ? '+' : '') + (diff * 100).toFixed(1) + '%'),
                        React.createElement('td', null, React.createElement('span', { className: 'badge', style: { color: sigColor, borderColor: sigColor, background: sigColor + '15' } }, signal))
                    );
                })
            )
        )
    );
}

// ---- Sub-tab 3: Sensitivity ----

function SensitivityPanel(p) {
    var s = p.snap, price = p.price;
    var eps = s && s.trailingEps;
    if (!eps || !price) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Need EPS data for sensitivity analysis.');

    var peRange = [10, 15, 20, 25, 30, 35, 40];
    var growthRange = [0, 0.05, 0.10, 0.15, 0.20, 0.25];

    var rows = growthRange.map(function(g) {
        var futureEps = eps * (1 + g);
        var cells = peRange.map(function(pe) {
            var implied = futureEps * pe;
            var diff = implied / price - 1;
            return { implied: implied, diff: diff };
        });
        return { growth: g, cells: cells };
    });

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Implied Price: EPS Growth \u00D7 P/E Multiple'),
            React.createElement('div', { style: { fontSize: 12, color: 'var(--text-sec)', marginBottom: 12 } },
                'Base EPS: $' + fN(eps) + ' | Current: ' + fmtCurrency(price)),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'data-table', style: { minWidth: 600 } },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'EPS Growth \u2193 / P\u2044E \u2192'),
                            peRange.map(function(pe) { return React.createElement('th', { key: pe, style: { textAlign: 'center' } }, pe + 'x'); })
                        )
                    ),
                    React.createElement('tbody', null,
                        rows.map(function(row) {
                            return React.createElement('tr', { key: row.growth },
                                React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, (row.growth * 100).toFixed(0) + '%'),
                                row.cells.map(function(c, ci) {
                                    var bg = c.diff > 0.2 ? 'rgba(16,185,129,0.12)' : c.diff < -0.2 ? 'rgba(239,68,68,0.12)' : 'transparent';
                                    var color = c.diff > 0.1 ? '#10b981' : c.diff < -0.1 ? '#ef4444' : 'var(--text)';
                                    return React.createElement('td', { key: ci, style: { textAlign: 'center', background: bg, color: color, fontWeight: 500 } },
                                        '$' + fN(c.implied, 0),
                                        React.createElement('div', { style: { fontSize: 9, opacity: 0.7 } }, (c.diff >= 0 ? '+' : '') + (c.diff * 100).toFixed(0) + '%')
                                    );
                                })
                            );
                        })
                    )
                )
            )
        )
    );
}

// ---- Sub-tab 4: Valuation Score ----

function ScorePanel(p) {
    var s = p.snap, o = p.overview, price = p.price;
    if (!s) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No data for scoring.');

    var pe = o && o.PERatio ? Number(o.PERatio) : null;
    var checks = [
        { label: 'Trailing P/E < 25', pass: pe != null && pe < 25, value: pe != null ? fN(pe, 1) + 'x' : '\u2014' },
        { label: 'Forward P/E < 20', pass: s.forwardPE != null && s.forwardPE < 20, value: s.forwardPE != null ? fN(s.forwardPE, 1) + 'x' : '\u2014' },
        { label: 'PEG < 1.5', pass: s.pegRatio != null && s.pegRatio < 1.5, value: s.pegRatio != null ? fN(s.pegRatio) : '\u2014' },
        { label: 'Price/Book < 5', pass: s.priceToBook != null && s.priceToBook < 5, value: s.priceToBook != null ? fN(s.priceToBook, 1) + 'x' : '\u2014' },
        { label: 'EV/EBITDA < 15', pass: s.evToEbitda != null && s.evToEbitda < 15, value: s.evToEbitda != null ? fN(s.evToEbitda, 1) + 'x' : '\u2014' },
        { label: 'EV/Revenue < 5', pass: s.evToRevenue != null && s.evToRevenue < 5, value: s.evToRevenue != null ? fN(s.evToRevenue, 1) + 'x' : '\u2014' },
        { label: 'Earnings Yield > 4%', pass: pe != null && pe > 0 && (1 / pe) > 0.04, value: pe && pe > 0 ? ((1 / pe) * 100).toFixed(2) + '%' : '\u2014' },
        { label: 'Profit Margin > 10%', pass: s.profitMargins != null && s.profitMargins > 0.10, value: s.profitMargins != null ? (s.profitMargins * 100).toFixed(1) + '%' : '\u2014' },
        { label: 'ROE > 15%', pass: s.returnOnEquity != null && s.returnOnEquity > 0.15, value: s.returnOnEquity != null ? (s.returnOnEquity * 100).toFixed(1) + '%' : '\u2014' },
        { label: 'Debt/Equity < 100%', pass: s.debtToEquity != null && s.debtToEquity < 100, value: s.debtToEquity != null ? fN(s.debtToEquity, 1) + '%' : '\u2014' },
    ];

    var scored = checks.filter(function(c) { return c.pass != null; });
    var passed = scored.filter(function(c) { return c.pass; }).length;
    var total = scored.length;
    var pct = total > 0 ? passed / total : 0;
    var scoreColor = pct >= 0.7 ? '#10b981' : pct >= 0.4 ? '#f59e0b' : '#ef4444';
    var scoreLabel = pct >= 0.7 ? 'Attractively Valued' : pct >= 0.4 ? 'Fairly Valued' : 'Richly Valued';

    return React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { textAlign: 'center', marginBottom: 16 } },
            React.createElement('div', { style: { fontSize: 48, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: scoreColor } }, passed + '/' + total),
            React.createElement('div', { style: { fontSize: 14, color: scoreColor, fontWeight: 600, marginTop: 4 } }, scoreLabel),
            React.createElement('div', { style: { height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginTop: 16, maxWidth: 300, margin: '16px auto 0' } },
                React.createElement('div', { style: { height: '100%', width: (pct * 100) + '%', borderRadius: 4, background: scoreColor, transition: 'width 0.6s ease' } })
            )
        ),
        React.createElement('table', { className: 'data-table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Criterion', 'Value', 'Result'].map(function(h) { return React.createElement('th', { key: h }, h); })
                )
            ),
            React.createElement('tbody', null,
                checks.map(function(c) {
                    var icon = c.pass == null ? '\u2014' : c.pass ? '\u2713' : '\u2717';
                    var color = c.pass == null ? 'var(--text-muted)' : c.pass ? '#10b981' : '#ef4444';
                    return React.createElement('tr', { key: c.label },
                        React.createElement('td', null, c.label),
                        React.createElement('td', null, c.value),
                        React.createElement('td', { style: { color: color, fontWeight: 700, fontSize: 16 } }, icon)
                    );
                })
            )
        )
    );
}

// ---- Sub-tab 5: Fair Value Band Synthesizer ----

var mono2 = "'JetBrains Mono', ui-monospace, monospace";
var T2 = { green: '#22c55e', red: '#ef4444', gold: '#f4b942', teal: '#00d4b8', blue: '#3b82f6', purple: '#a855f7', slate: '#64748b', amber: '#f59e0b' };

function FairValueSynthesizerPanel(p) {
    var s = p.snap, o = p.overview, price = p.price;
    if (!price || (!s && !o)) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Insufficient data.');

    function n(v) { var x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; }

    var eps       = (s && n(s.trailingEps)) || n(o && o.EPS);
    var fwdEps    = s && n(s.forwardEps);
    var fwdPE     = s && n(s.forwardPE);
    var ebitda    = (s && n(s.ebitda)) || n(o && o.EBITDA);
    var sharesOut = n(o && o.SharesOutstanding);
    var mktCap    = n(o && o.MarketCapitalization);
    var analystT  = n(o && o.AnalystTargetPrice);
    var growthRaw = s && parseFloat(s.revenueGrowth);
    var growth    = isFinite(growthRaw) && growthRaw > 0 ? growthRaw : null;
    // Derive fwdEps from fwdPE + price if not directly available
    if (!fwdEps && fwdPE && price) fwdEps = price / fwdPE;

    var methods = [];

    // Method 1: Trailing P/E at 22×
    if (eps) methods.push({ label: 'Trailing P/E (mkt avg 22×)', value: eps * 22, color: T2.slate });

    // Method 2: EV/EBITDA 25× (semiconductor avg)
    if (ebitda && sharesOut && mktCap) {
        var ev25 = (ebitda * 25) / sharesOut;
        if (ev25 > 0) methods.push({ label: 'EV/EBITDA (semi avg 25×)', value: ev25, color: T2.purple });
    }

    // Method 3: PEG = 1.0
    if (fwdEps && growth) {
        var peg1 = fwdEps * (growth * 100);
        if (peg1 > 0) methods.push({ label: 'PEG = 1.0 (growth-adjusted)', value: peg1, color: T2.blue });
    }

    // Method 4: DCF proxy (analyst target × 0.85 conservative)
    if (analystT) methods.push({ label: 'DCF proxy (analyst × 0.85)', value: analystT * 0.85, color: T2.gold });

    // Method 5: Analyst consensus
    if (analystT) methods.push({ label: 'Analyst consensus', value: analystT, color: T2.green });

    if (!methods.length) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Not enough data for synthesizer.');

    var vals   = methods.map(function(m) { return m.value; });
    var bandMin = Math.min.apply(null, vals);
    var bandMax = Math.max.apply(null, vals);
    var spread = bandMax - bandMin;

    function toPos(v) { return spread > 0 ? ((v - bandMin) / spread) * 100 : 50; }
    var currentPos = toPos(price);
    var clampedPos = Math.max(2, Math.min(98, currentPos));

    var position = currentPos > 75 ? 'in the expensive tier of its own model' : currentPos > 40 ? 'near the fair value midpoint' : 'in the undervalued range of its own model';
    var posColor = currentPos > 75 ? T2.red : currentPos > 40 ? T2.amber : T2.green;

    return React.createElement('div', null,
        // Insight
        React.createElement('div', { style: { padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid ' + posColor, borderRadius: '0 8px 8px 0', marginBottom: 16, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: mono2 } },
            (o && o.Symbol || 'This stock') + ' is ' + position + '. ' +
            'Method range: $' + fN(bandMin, 0) + ' – $' + fN(bandMax, 0) + '. ' +
            'Current price ($' + fN(price, 2) + ') sits at the ' + currentPos.toFixed(0) + 'th percentile of model outputs.'
        ),

        // Band chart
        React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
            React.createElement('div', { style: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', fontFamily: mono2, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 } }, 'Fair Value Band'),
            React.createElement('div', { style: { position: 'relative', height: 48, marginBottom: 8 } },
                // Band track
                React.createElement('div', { style: { position: 'absolute', top: '50%', left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, transform: 'translateY(-50%)' } }),
                // Method ticks
                methods.map(function(m) {
                    var pos = toPos(m.value);
                    return React.createElement('div', {
                        key: m.label,
                        style: { position: 'absolute', top: 4, left: pos + '%', transform: 'translateX(-50%)' }
                    },
                        React.createElement('div', { style: { width: 2, height: 20, background: m.color, borderRadius: 1 } }),
                        React.createElement('div', { style: { position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', fontSize: 7.5, color: m.color, fontFamily: mono2, whiteSpace: 'nowrap' } },
                            '$' + fN(m.value, 0)
                        )
                    );
                }),
                // Current price marker
                React.createElement('div', {
                    style: { position: 'absolute', top: 0, left: clampedPos + '%', transform: 'translateX(-50%)' }
                },
                    React.createElement('div', { style: { width: 3, height: 28, background: T2.teal, borderRadius: 2, boxShadow: '0 0 8px rgba(0,212,184,0.5)' } }),
                    React.createElement('div', { style: { position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 700, color: T2.teal, fontFamily: mono2, whiteSpace: 'nowrap' } }, '● $' + fN(price, 0))
                ),
                // Labels
                React.createElement('div', { style: { position: 'absolute', bottom: -20, left: 0, fontSize: 8.5, color: 'rgba(255,255,255,0.35)', fontFamily: mono2 } }, '$' + fN(bandMin, 0)),
                React.createElement('div', { style: { position: 'absolute', bottom: -20, right: 0, fontSize: 8.5, color: 'rgba(255,255,255,0.35)', fontFamily: mono2 } }, '$' + fN(bandMax, 0))
            ),
            React.createElement('div', { style: { marginTop: 32 } })
        ),

        // Method breakdown table
        React.createElement('table', { className: 'data-table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Method', 'Implied Price', 'vs Current', 'Signal'].map(function(h) { return React.createElement('th', { key: h }, h); })
                )
            ),
            React.createElement('tbody', null,
                methods.map(function(m) {
                    var diff = price > 0 ? (m.value / price - 1) : 0;
                    var sigLabel = diff > 0.15 ? 'Undervalued' : diff < -0.15 ? 'Overvalued' : 'Fair';
                    var sigColor = diff > 0.15 ? T2.green : diff < -0.15 ? T2.red : T2.amber;
                    return React.createElement('tr', { key: m.label },
                        React.createElement('td', null,
                            React.createElement('span', { style: { display: 'inline-block', width: 8, height: 8, background: m.color, borderRadius: 2, marginRight: 7, verticalAlign: 'middle' } }),
                            m.label
                        ),
                        React.createElement('td', { style: { fontWeight: 600, fontFamily: mono2 } }, '$' + fN(m.value, 2)),
                        React.createElement('td', { style: { color: diff >= 0 ? T2.green : T2.red, fontFamily: mono2 } }, (diff >= 0 ? '+' : '') + (diff * 100).toFixed(1) + '%'),
                        React.createElement('td', null, React.createElement('span', { className: 'badge', style: { color: sigColor, borderColor: sigColor, background: sigColor + '15' } }, sigLabel))
                    );
                })
            )
        )
    );
}

// ---- Main export ----

var TABS = [
    { id: 'multiples', label: 'Multiples' },
    { id: 'fairvalue', label: 'Fair Value' },
    { id: 'synthesizer', label: 'Synthesizer' },
    { id: 'sensitivity', label: 'Sensitivity' },
    { id: 'score', label: 'Valuation Score' },
];

export function ValuationEngine(p) {
    var _t = useState('multiples');
    var tab = _t[0], setTab = _t[1];

    var snap = p.financials && p.financials.snapshot;
    var price = p.series && p.series.length ? p.series[p.series.length - 1].close : null;

    if (!snap && !price) {
        return React.createElement('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)' } }, 'Valuation data unavailable.');
    }

    var content = null;
    if (tab === 'multiples')   content = React.createElement(MultiplesPanel,           { snap: snap, overview: p.overview, price: price });
    if (tab === 'fairvalue')   content = React.createElement(FairValuePanel,            { snap: snap, overview: p.overview, price: price });
    if (tab === 'synthesizer') content = React.createElement(FairValueSynthesizerPanel, { snap: snap, overview: p.overview, price: price });
    if (tab === 'sensitivity') content = React.createElement(SensitivityPanel,          { snap: snap, price: price });
    if (tab === 'score')       content = React.createElement(ScorePanel,                { snap: snap, overview: p.overview, price: price });

    return React.createElement('div', null,
        React.createElement(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
