// ============================================================
// Nexus — Holdings, geography projection: the arithmetic
// ------------------------------------------------------------
// The second projection behind the Holdings MAP toggle. Same rows as the
// positioning map (the book plus its candidate universe), placed in physical
// space instead of risk space.
//
// The asymmetry this module exists to keep honest:
//
//   HELD names come from the look-through resolver: where their revenue is
//   (or, lacking a disclosure, where they are domiciled -- flagged).
//   CANDIDATES are not in the book, so the resolver has nothing to say about
//   them. They are placed by recorded DOMICILE, and every sentence that
//   filters or counts them says so.
//
// A candidate with no recorded domicile is not placed anywhere. It is counted,
// and it stays on the positioning map. Defaulting it to the US is the defect
// security_domicile was created to stop.
// ============================================================

import { gaps, COVERAGE_FLOOR, pct } from '../../geo/geoCompute.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * symbol -> Set of iso2 codes the held name places weight in, on one basis.
 *
 * A name the resolver returned ONLY in XX gets an EMPTY set, not no entry.
 * The difference is the fund rule: EWY's resolver answer is "unallocated", and
 * treating a missing entry as "ask the domicile instead" would put it back on
 * the United States by the side door.
 */
export function heldCountriesBySymbol(detail) {
    const m = new Map();
    for (const d of detail || []) {
        if (!m.has(d.symbol)) m.set(d.symbol, new Set());
        if (!(Number(d.weight) > 0) || d.iso2 === 'XX') continue;
        m.get(d.symbol).add(d.iso2);
    }
    return m;
}

/**
 * Does this row belong to the selected country?
 *
 * Held: it places weight there on the active basis (revenue or domicile).
 * Candidate: it is DOMICILED there -- the only fact on file for it.
 */
export function inCountry(row, iso2, { heldCountries, domicileBySymbol }) {
    if (!iso2) return true;
    if (row.held) {
        const set = heldCountries.get(row.symbol);
        if (set) return set.has(iso2);
        // A held name the resolver did not place (an option, say) falls to
        // its domicile like a candidate would, never to "everywhere".
        return domicileBySymbol.get(row.symbol) === iso2;
    }
    return domicileBySymbol.get(row.symbol) === iso2;
}

export function filterByCountry(rows, iso2, ctx) {
    return iso2 ? rows.filter((r) => inCountry(r, iso2, ctx)) : rows;
}

/**
 * One marker pair per domicile: a ring for the book's weight there, a dot for
 * the candidates. Per country, not per name -- there is no issuer headquarters
 * coordinate on file, and scattering 57 US names at invented positions around
 * one centroid would draw a precision the data does not have.
 */
export function bookPointsByDomicile(rows, domicileBySymbol, centroids) {
    const acc = new Map();
    let unplacedHeld = 0, unplacedCand = 0, unplacedHeldWeight = 0;
    for (const r of rows || []) {
        const iso2 = domicileBySymbol.get(r.symbol);
        const c = iso2 && centroids.get(iso2);
        if (!c) {
            if (r.held) { unplacedHeld += 1; unplacedHeldWeight += r.weightPct || 0; } else unplacedCand += 1;
            continue;
        }
        const cur = acc.get(iso2) || { iso2, lon: c[0], lat: c[1], heldWeightPct: 0, heldCount: 0, candCount: 0 };
        if (r.held) { cur.heldCount += 1; cur.heldWeightPct += r.weightPct || 0; } else cur.candCount += 1;
        acc.set(iso2, cur);
    }
    return {
        points: [...acc.values()].sort((a, b) => b.heldWeightPct - a.heldWeightPct || b.candCount - a.candCount || a.iso2.localeCompare(b.iso2)),
        unplacedHeld, unplacedCand, unplacedHeldWeight,
    };
}

/**
 * The rail's ranking. "Where you earn, not where you are listed" is a gap,
 * and a gap needs revenue coverage above the floor to mean anything: under it
 * every gap is a fund moving into XX. Below the floor the rail ranks the book
 * by DOMICILE instead and says why, rather than presenting fallbacks as
 * findings.
 */
export function railRanking({ revenue, domicile, revenueSummary, names, n = 10 }) {
    const cov = revenueSummary && isNum(Number(revenueSummary.book_coverage)) ? Number(revenueSummary.book_coverage) : null;
    if (!revenue || !domicile) return { mode: 'unavailable', rows: [], reason: 'A basis did not load, so nothing is ranked.' };
    const g = gaps(revenue, domicile, cov);
    if (!g.withheld) {
        return {
            mode: 'gap',
            rows: g.rows.slice(0, n).map((r) => ({
                iso2: r.iso2, name: (names && names.get(r.iso2)) || r.iso2, value: r.gap,
                coverage: (revenue.map.get(r.iso2) || {}).coverage ?? null,
            })),
            reason: null,
        };
    }
    const rows = [...domicile.map.entries()]
        .map(([iso2, e]) => ({ iso2, name: (names && names.get(iso2)) || iso2, value: e.weight, coverage: null }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value || a.iso2.localeCompare(b.iso2))
        .slice(0, n);
    return {
        mode: 'domicile',
        rows,
        reason: `The earn-versus-listed gap is withheld: revenue coverage is ${pct(cov)} against an `
            + `${pct(COVERAGE_FLOOR, 0)} floor, so every gap today would be a fallback moving into unallocated. `
            + 'Ranked by domicile instead.',
    };
}

/** The footer sentence. Coverage, and what the remainder is -- and is not. */
export function coverageSentence(summary) {
    if (!summary) return 'Revenue coverage unknown -- the resolver did not answer.';
    const cov = Number(summary.book_coverage);
    const rest = 1 - cov;
    return `Coverage is ${pct(cov, 0)} of book revenue by weight. The remaining ${pct(rest, 0)} is domicile `
        + 'fallback and unallocated revenue -- a gap in disclosure, not revenue earned nowhere.';
}

/** How the rail describes the held names that are only estimated. */
export function fallbackNote(summary) {
    if (!summary) return null;
    const fb = Number(summary.domicile_fallback_count || 0);
    const fu = Number(summary.fund_unresolved_count || 0);
    if (!fb && !fu) return null;
    const parts = [];
    if (fb) parts.push(`${fb} holding${fb === 1 ? ' has' : 's have'} no segment revenue on file and fall back to domicile`);
    if (fu) parts.push(`${fu} fund${fu === 1 ? ' has' : 's have'} no look-through and sit in unallocated`);
    return parts.join('; ') + '. A fallback is a guess about where a company earns, so it plots but does not rank.';
}
