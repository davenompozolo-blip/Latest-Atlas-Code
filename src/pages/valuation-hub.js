import React from 'react';
// ============================================================
// ATLAS Terminal — Valuation Hub
// Top-level component for the /valuation tab.
// Routes between ValuationScreener (landing) and ValuationHouse
// (method calculators). Clicking "Value →" in the screener
// navigates to ValuationHouse with the ticker pre-loaded.
// ============================================================

import { ValuationHouse } from './valuation-house.js';
import { ValuationScreener } from './valuation-screener.js';

const { useState, useEffect } = React;
const h = React.createElement;

export function ValuationHub(props) {
    var _v = useState('screener');
    var view = _v[0], setView = _v[1];
    var _t = useState(null);
    var ticker = _t[0], setTicker = _t[1];

    function handleNavigate(symbol) {
        setTicker(symbol);
        setView('house');
    }

    // Accept symbol from cross-module navigation → jump straight to house
    useEffect(function() {
        var sym = props && props.initialSymbol;
        if (!sym) return;
        handleNavigate(sym);
    }, [props && props.initialSymbol]);

    function handleBack() {
        setView('screener');
        setTicker(null);
    }

    if (view === 'house') {
        return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
            // Back-to-screener strip
            h('div', {
                style: {
                    padding: '8px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(0,0,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }
            },
                h('button', {
                    onClick: handleBack,
                    style: {
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: 'rgba(255,255,255,0.55)',
                        borderRadius: 5,
                        padding: '4px 12px',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'JetBrains Mono, monospace',
                        letterSpacing: 0.5,
                        transition: 'color 0.15s, border-color 0.15s',
                    },
                    onMouseEnter: function(e) {
                        e.currentTarget.style.color = '#00d4ff';
                        e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)';
                    },
                    onMouseLeave: function(e) {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                    }
                }, '← Back to Screener'),
                ticker && h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace' } }, 'Valuing ' + ticker)
            ),
            h('div', { style: { flex: 1, overflow: 'auto' } },
                h(ValuationHouse, { initialTicker: ticker })
            )
        );
    }

    return h(ValuationScreener, { onNavigate: handleNavigate });
}
