// ============================================================
// What the Background tab may render about a company's identity.
//
// PURE -- no network, no database. `src/pages/equity/companyProfile.js` is
// transport. Same split as `clusterView.js` / `institutionView.js`, and it is
// what lets the shape be tested without a bundler.
//
// THE RULE THIS EXISTS FOR: SECTOR AND INDUSTRY ARE DIFFERENT OBJECTS.
// The tab rendered `SECTOR Technology` / `INDUSTRY Technology` for Apple,
// because `mapFinnhubOverview` sets both from `p.finnhubIndustry`. Measured
// over the 52 symbols now carrying profiles:
//
//     distinct EDGAR SIC industries   33
//     distinct vendor industries      17
//     vendor industry == its sector   10 of 52
//     EDGAR industry == vendor sector  0 of 52
//
// So SIC is a genuine level below sector and never merely repeats it. The two
// are carried as separate fields that are never coalesced into each other --
// the same rule `position_themes` already needs, where `theme` stays NULL for
// an unmapped name rather than falling back to sector.
//
// AND THE TAXONOMY IS NAMED. `industrySource` travels with the value, because
// EQ-7 measured that these vendor buckets mix GICS sector names with GICS
// industry names and are neither level cleanly. A classification rendered
// without saying whose it is invites exactly the comparison that is invalid.
// ============================================================

export const PROFILE_LOADED = 'loaded';
export const PROFILE_NOT_LOADED = 'not_loaded';
export const PROFILE_FAILED = 'failed';

/** '' is not a value. */
function val(v) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
}

/**
 * The identity block for one symbol.
 *
 * @param {object|null} row  a `company_profile` row, or null when none exists
 * @param {object} vendor    { sector } from the vendor/asset row
 * @param {string} state     PROFILE_LOADED | PROFILE_NOT_LOADED | PROFILE_FAILED
 *
 * Every field is ABSENT from the returned object when unmeasured -- not null,
 * not '' -- so a renderer cannot print a value it was never handed. Same
 * construction as `nexusReturnBasis.js` and `institutionView.js`.
 */
export function buildProfileView(row, vendor, state) {
    const out = { state: state || PROFILE_NOT_LOADED };
    const sector = val(vendor && vendor.sector);
    if (sector) out.sector = sector;

    if (out.state !== PROFILE_LOADED || !row) {
        // A transport failure and an unloaded symbol are DIFFERENT FACTS and
        // need different sentences. Never let a failure render as a statement
        // about the company.
        if (out.state === PROFILE_FAILED) out.reason = 'profile_feed_unavailable';
        else if (out.state === PROFILE_NOT_LOADED) out.reason = 'profile_not_loaded';
        return out;
    }

    const industry = val(row.sic_description);
    if (industry) {
        out.industry = industry;
        // NEVER rendered bare. The reader has to know this is the SEC's SIC
        // classification and not the vendor's bucket, because the two are not
        // comparable and sit at different levels.
        out.industrySource = 'SEC SIC';
        const code = val(row.sic);
        if (code) out.sicCode = code;
    }

    const name = val(row.entity_name);       if (name) out.entityName = name;
    const cik = val(row.cik);                if (cik) out.cik = cik;
    const cat = val(row.filer_category);     if (cat) out.filerCategory = cat;
    const inc = val(row.state_of_incorporation); if (inc) out.stateOfIncorporation = inc;
    const fye = val(row.fiscal_year_end);
    if (fye && /^\d{4}$/.test(fye)) out.fiscalYearEnd = fye;
    if (Array.isArray(row.exchanges) && row.exchanges.length) {
        const ex = row.exchanges.map(val).filter(Boolean);
        if (ex.length) out.exchanges = ex;
    }
    if (Array.isArray(row.former_names) && row.former_names.length) {
        const fn = row.former_names.map(f => val(f && f.name)).filter(Boolean);
        if (fn.length) out.formerNames = fn;
    }

    // Deliberately NOT mapped onto the object: `description`, `website`,
    // `investor_website`. EDGAR carries those keys and leaves them EMPTY on
    // every filer measured, so emitting them would put a field on screen that
    // is loaded and blank -- indistinguishable from one that failed. A real
    // one is carried if it ever arrives.
    const desc = val(row.description);       if (desc) out.description = desc;
    const web = val(row.website);            if (web) out.website = web;

    return out;
}

/**
 * MMDD -> a readable recurring calendar position. Never a date: this codebase
 * records that no arithmetic rule names a filer's own fiscal year correctly
 * for every filer (Target calls the year ending Feb 2025 FY2024; NVIDIA calls
 * the year ending Jan 2025 FY2025), so this says WHEN the year ends and makes
 * no claim about what the filer calls it.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
export function fiscalYearEndLabel(mmdd) {
    if (typeof mmdd !== 'string' || !/^\d{4}$/.test(mmdd)) return null;
    const m = Number(mmdd.slice(0, 2)), d = Number(mmdd.slice(2));
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return MONTHS[m - 1] + ' ' + d;
}

export default buildProfileView;
