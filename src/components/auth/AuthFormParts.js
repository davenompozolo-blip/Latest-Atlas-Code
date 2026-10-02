// The landing page's form pieces, shared by the sign-in gate (AuthGate.js)
// and onboarding (Onboarding.js) so the two screens are one design. Colours
// are --nx-* tokens; layout is auth-gate.css.

import React from 'react';
import { AuthBackdrop } from './AuthBackdrop.js';
import { AuthBrandPanel } from './AuthBrandPanel.js';
import { CapabilityRail } from './CapabilityRail.js';
import { AtlasWordmark } from './AtlasWordmark.js';
import { AuthIcon } from './AuthIcons.js';

const e = React.createElement;

export function Field({ id, label, icon, ...rest }) {
    return e('div', { className: 'ag-field' },
        e('label', { htmlFor: id, className: 'ag-label' }, label),
        e('div', { className: 'ag-input-wrap' },
            icon && e(AuthIcon, { name: icon, size: 19, className: 'ag-input-icon' }),
            e('input', { id, className: 'ag-input' + (icon ? ' ag-input--icon' : ''), ...rest })));
}

const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z';
const EYE_OFF = 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2';

function EyeIcon({ open }) {
    return e('svg', {
        width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    },
        e('path', { d: open ? EYE : EYE_OFF }),
        open && e('circle', { cx: 12, cy: 12, r: 3 }));
}

/** A password input with a show/hide control. Showing is per field and resets
 *  when the form unmounts; the browser's password manager still sees the field
 *  through its autocomplete hint either way. */
export function PasswordField({ id, label, ...rest }) {
    const [shown, setShown] = React.useState(false);
    return e('div', { className: 'ag-field' },
        e('label', { htmlFor: id, className: 'ag-label' }, label),
        e('div', { className: 'ag-input-wrap ag-pw' },
            e(AuthIcon, { name: 'lock', size: 19, className: 'ag-input-icon' }),
            e('input', {
                id, className: 'ag-input ag-input--icon', ...rest,
                type: shown ? 'text' : 'password', autoCapitalize: 'none', spellCheck: false,
            }),
            e('button', {
                type: 'button', className: 'ag-eye',
                'aria-label': shown ? 'Hide password' : 'Show password',
                'aria-pressed': shown, 'aria-controls': id,
                onClick: () => setShown((v) => !v),
            }, e(EyeIcon, { open: !shown }))));
}

export function SubmitButton({ busy, busyLabel, label, arrow }) {
    return e('button', { type: 'submit', className: 'ag-submit', disabled: busy, 'aria-busy': busy || undefined },
        e('span', null, busy ? busyLabel : label),
        arrow && !busy && e(AuthIcon, { name: 'arrow', size: 18, strokeWidth: 2 }));
}

/** The glass card: wordmark, a title, a line under it, then the form. */
export function AuthCard({ title, subtitle, children }) {
    return e('div', { className: 'ag-card' },
        e(AtlasWordmark, { className: 'ag-card-mark' }),
        title && e('h1', { className: 'ag-title' }, title),
        subtitle && e('p', { className: 'ag-sub' }, subtitle),
        children,
        e('div', { className: 'ag-foot' },
            'PORTFOLIO', e('span', { 'aria-hidden': 'true' }, ' \u2022 '),
            'RISK', e('span', { 'aria-hidden': 'true' }, ' \u2022 '), 'RESEARCH'));
}

/** The landing page: scene, brand panel, card, capability rail. */
export function Shell(props) {
    return e('main', { className: 'ag-page' },
        e(AuthBackdrop, null),
        e(AuthBrandPanel, null),
        e(AuthCard, props),
        e(CapabilityRail, null));
}
