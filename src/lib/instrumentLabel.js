// ============================================================
// What an instrument is CALLED on screen, as against how it is stored.
//
// `assets.asset_class` is vendor storage vocabulary and it carries EIGHT
// spellings for four kinds (measured 2026-09-24):
//
//     Stock 7847 | us_equity 72 | equity 24      <- all common stock
//     option 10  | us_option 3                    <- all option contracts
//     cash 1     | etf 1        | crypto 1
//
// So the Background tab rendered `us_equity` for one symbol and would render
// `Stock` for the next -- the same instrument under two names, in a field a
// reader is using to tell instruments apart. The raw token was the visible
// half of the defect; the INCONSISTENCY is the whole of it.
//
// THE VENDOR PREFIX IS PROVENANCE, NOT A PROPERTY OF THE INSTRUMENT. `us_` is
// which API wrote the row, not a fact about the security -- and it cannot be
// rendered as a market scope either, because the book holds ADRs and foreign
// listings (ASML, TSM, SONY) stored as plain `Stock`. Reading it as "US" would
// assert a domicile the field does not carry, which is this codebase's own
// `fwd_pe` rule: check the field, not the alias.
//
// An unrecognised value is HUMANISED, never dropped and never mapped to a
// guess: `foo_bar` -> `Foo bar` is a presentation transform and claims nothing,
// where silently returning null would hide a vocabulary the platform started
// storing without anyone noticing.
// ============================================================

// Keyed on the lower-cased stored value. Kinds, not spellings.
const KIND = {
    stock:     'Equity',
    equity:    'Equity',
    us_equity: 'Equity',
    etf:       'ETF',
    option:    'Option',
    us_option: 'Option',
    cash:      'Cash',
    crypto:    'Crypto',
};

/**
 * @param {?string} assetClass a raw `assets.asset_class` value
 * @returns {?string} the display label, or null when there is nothing stored
 */
export function instrumentLabel(assetClass) {
    if (typeof assetClass !== 'string') return null;
    const raw = assetClass.trim();
    if (!raw) return null;

    const known = KIND[raw.toLowerCase()];
    if (known) return known;

    // Unknown vocabulary: present it readably and claim nothing about it.
    const spaced = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** The kinds this module recognises, for tests and for callers that group. */
export const INSTRUMENT_KINDS = KIND;

export default instrumentLabel;
