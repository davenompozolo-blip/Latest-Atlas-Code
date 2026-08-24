import React from 'react';
// ============================================================
// ATLAS — return basis toggle
// ------------------------------------------------------------
// Two-state control shared by Performance and Nexus. React.createElement, no
// JSX, per repo convention.
//
// The left label is per-surface because the two modules' plain bases are
// genuinely different numbers (see src/lib/returnBasis.js). The right is
// always MWR, which means the same thing everywhere — that asymmetry is the
// point of the control.
// ============================================================

import {
    BASIS_MWR, BASIS_PLAIN, loadBasis, saveBasis,
    PLAIN_LABEL, PLAIN_HINT, MWR_HINT,
} from '../lib/returnBasis.js';

var h = React.createElement;
var useState = React.useState, useEffect = React.useEffect;

/**
 * Subscribes to the shared basis. Returns [basis, setBasis].
 * Any mounted surface follows a change made on any other.
 */
export function useReturnBasis() {
    var _b = useState(loadBasis);
    var basis = _b[0], set = _b[1];

    useEffect(function() {
        function onBasis(e) {
            var next = e && e.detail && e.detail.basis;
            if (next) set(next);
        }
        function onStorage(e) {
            if (e.key === 'atlas.return.basis.v1') set(loadBasis());
        }
        window.addEventListener('atlas:return-basis', onBasis);
        window.addEventListener('storage', onStorage);   // other tabs
        return function() {
            window.removeEventListener('atlas:return-basis', onBasis);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    return [basis, function(next) { saveBasis(next); set(next); }];
}

export function ReturnBasisToggle(p) {
    var surface = p.surface || 'performance';
    var basis = p.basis, onBasis = p.onBasis;

    function btn(id, label, hint) {
        var on = basis === id;
        return h('button', {
            key: id,
            title: hint,
            onClick: function() { if (!on) onBasis(id); },
            style: {
                padding: '4px 11px',
                border: '1px solid ' + (on ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.07)'),
                borderRadius: 4,
                background: on ? 'rgba(0,212,255,0.1)' : 'transparent',
                color: on ? '#00d4ff' : 'rgba(255,255,255,0.38)',
                fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono',
                letterSpacing: 0.8, cursor: on ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
            },
        }, label);
    }

    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
        h('span', {
            style: {
                fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'Figtree',
                letterSpacing: 1, textTransform: 'uppercase', marginRight: 4,
            },
        }, 'Return basis'),
        btn(BASIS_PLAIN, PLAIN_LABEL[surface] || 'PLAIN', PLAIN_HINT[surface]),
        btn(BASIS_MWR, 'MWR', MWR_HINT)
    );
}
