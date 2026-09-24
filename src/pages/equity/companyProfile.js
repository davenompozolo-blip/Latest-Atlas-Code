// ============================================================
// Transport for `company_profile`. Decides NOTHING about what may be
// rendered -- `src/lib/companyProfileView.js` is pure and does that.
//
// NEVER THROWS. A dead feed must reach the surface as a NAMED state, not as
// an exception that a catch turns into "no data" -- this codebase records the
// contribution panel printing a sentence about the data for a week while the
// truth was that the query was cancelled.
// ============================================================

import { sb } from '../config.js';
import {
    PROFILE_LOADED, PROFILE_NOT_LOADED, PROFILE_FAILED,
} from '../../lib/companyProfileView.js';

export { PROFILE_LOADED, PROFILE_NOT_LOADED, PROFILE_FAILED };

/**
 * One symbol's profile row.
 * @returns {Promise<{state: string, row: object|null}>}
 */
export async function loadCompanyProfile(symbol) {
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym) return { state: PROFILE_NOT_LOADED, row: null };
    try {
        const res = await sb
            .from('company_profile')
            .select('symbol,cik,entity_name,sic,sic_description,sec_owner_org,'
                  + 'filer_category,entity_type,fiscal_year_end,exchanges,tickers,'
                  + 'state_of_incorporation,ein,description,website,investor_website,'
                  + 'former_names,source,loaded_at')
            .eq('symbol', sym)
            .maybeSingle();
        if (res.error) {
            // Logged at error level: a swallowed transport failure is how the
            // contribution panel read "not measurable" for over a week.
            console.error('company_profile: load failed for', sym,
                res.error.code || '', String(res.error.message || '').slice(0, 200));
            return { state: PROFILE_FAILED, row: null };
        }
        if (!res.data) return { state: PROFILE_NOT_LOADED, row: null };
        return { state: PROFILE_LOADED, row: res.data };
    } catch (e) {
        console.error('company_profile: load threw for', sym, String(e && e.message).slice(0, 200));
        return { state: PROFILE_FAILED, row: null };
    }
}

export default loadCompanyProfile;
