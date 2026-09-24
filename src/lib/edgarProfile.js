// ============================================================
// EDGAR submissions -> company identity and classification.
//
// PURE. No network, no database.
//
// WHY THIS EXISTS. The Background tab showed `SECTOR Technology` and
// `INDUSTRY Technology` for Apple, because `mapFinnhubOverview` in
// `api/equity.js` sets BOTH from `p.finnhubIndustry`:
//
//     Sector:   p.finnhubIndustry || '',
//     Industry: p.finnhubIndustry || '',
//
// So the row asserted a two-level taxonomy the platform does not have -- the
// same defect EQ-7 measured one layer down, where `equity_screener_universe`
// carries `industry` as a straight copy of `sector` (896 rows identical, 0
// rows where both are present and differ).
//
// EDGAR publishes the SEC's own SIC classification per filer, free and with
// no key. It is a genuine level BELOW sector, measured 2026-09-24:
//
//     AAPL   Technology  ->  3571  Electronic Computers
//     TGT    Retail      ->  5331  Retail-Variety Stores
//     JPM    Banking     ->  6021  National Commercial Banks
//     ASML   Technology  ->  3559  Special Industry Machinery, NEC
//
// JPM's is the one worth noting: `National Commercial Banks` separates a bank
// from an insurer where the vendor's `Financials` pools them, which is the
// discriminator EQ-4's institution layer picks its framework with.
//
// WHAT EDGAR DOES NOT HAVE IS PROSE. `description`, `website` and
// `investorWebsite` are present as keys and EMPTY on every filer measured --
// so a business description is not available from this source either, and the
// Background tab's own note stands: Item 1 of the 10-K is the only route.
// **An empty string is not a description.** Every text field here is NULL
// when blank rather than '', so a renderer cannot print an empty box and a
// consumer cannot mistake "" for an answer.
// ============================================================

export const SOURCE_EDGAR = 'edgar';

/** '' and '   ' are absent, not values. */
function text(v) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
}

/** A non-empty array of non-empty strings, or null. */
function strings(v) {
    if (!Array.isArray(v)) return null;
    const out = v.map(text).filter(Boolean);
    return out.length ? out : null;
}

/**
 * EDGAR's `fiscalYearEnd` is MMDD with no year -- '0926' for Apple, '0201'
 * for Target. Returned verbatim rather than parsed into a date: it is a
 * recurring calendar position, not a date, and this file records that no
 * arithmetic rule names a filer's own fiscal year correctly for every filer.
 */
function fiscalYearEnd(v) {
    const t = text(v);
    return t && /^\d{4}$/.test(t) ? t : null;
}

/**
 * One profile row from a `submissions/CIK##########.json` payload.
 *
 * @returns {object|null} null when the payload carries no CIK at all -- a
 *   response that cannot identify a filer is not a profile.
 */
export function profileFromSubmissions(submissions, symbol) {
    if (!submissions || typeof submissions !== 'object') return null;
    const cik = text(submissions.cik);
    if (!cik) return null;

    const former = Array.isArray(submissions.formerNames)
        ? submissions.formerNames
            .map(f => (f && typeof f === 'object'
                ? { name: text(f.name), from: text(f.from), to: text(f.to) }
                : null))
            .filter(f => f && f.name)
        : [];

    return {
        symbol,
        cik,
        entity_name: text(submissions.name),
        // The SEC's own classification. INDUSTRY, and never a sector -- the
        // two are different objects and this platform has conflated them
        // twice already.
        sic: text(submissions.sic),
        sic_description: text(submissions.sicDescription),
        // The SEC office that reviews the filer, e.g. '06 Technology'. A
        // coarser grouping than SIC and NOT the vendor's sector; stored under
        // its own name so nothing can read it as one.
        sec_owner_org: text(submissions.ownerOrg),
        // 'Large accelerated filer' / 'Accelerated filer' / 'Non-accelerated
        // filer'. A size class the SEC assigns, useful as a scale check that
        // does not depend on a price.
        filer_category: text(submissions.category),
        entity_type: text(submissions.entityType),
        fiscal_year_end: fiscalYearEnd(submissions.fiscalYearEnd),
        exchanges: strings(submissions.exchanges),
        tickers: strings(submissions.tickers),
        state_of_incorporation: text(submissions.stateOfIncorporation),
        ein: text(submissions.ein),
        // EMPTY ON EVERY FILER MEASURED. Mapped anyway so that the day EDGAR
        // populates it the layer carries it -- and NULL rather than '' so an
        // empty one is absent rather than an empty box on screen.
        description: text(submissions.description),
        website: text(submissions.website),
        investor_website: text(submissions.investorWebsite),
        former_names: former.length ? former : null,
        source: SOURCE_EDGAR,
    };
}

export default profileFromSubmissions;
