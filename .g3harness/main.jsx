import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/globals.css';
import '../src/styles/nexus-flagship.css';
import '../src/styles/nexus-flagship-v2.css';

import map from './map.json';
import pos from './pos.json';
import acct from './acct.json';
import stats from './stats.json';
import clusters from './clusters.json';
import pairs from './pairs.json';

// The browser in this container cannot reach Supabase, so the ROWS are replayed
// by patching fetch for /rest/v1/*. The real supabase-js client, its query
// builders and the real component all still run; only the socket differs.
// Range IS honoured, which means the paged correlation read is genuinely
// exercised here rather than stubbed past.
const TABLES = {
    mv_book_candidate_map: map,
    positions: pos,
    account_snapshots: acct,
    universe_risk_stats: stats,
    universe_clusters: clusters,
    universe_correlations: pairs,
};
const ASOF = (acct[0] && String(acct[0].as_of).slice(0, 10)) || '2026-09-17';
const real = window.fetch.bind(window);
window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const m = /\/rest\/v1\/([a-z_0-9]+)/.exec(url || '');
    if (!m) return real(input, init);
    const name = m[1];
    let rows = TABLES[name];
    if (!rows) { console.warn('[harness] no fixture for', name); rows = []; }

    // `positions?select=as_of_date&order=as_of_date.desc&limit=1`
    if (name === 'positions' && /select=as_of_date/.test(url)) {
        rows = [{ as_of_date: ASOF }];
    }
    // supabase-js `.range(a, b)` and `.limit(n)` are URL params (`offset`,
    // `limit`), NOT a Range header — so the pager has to be replayed off the
    // query string. Getting this wrong made the paging loop spin forever, which
    // is how the production loop's missing page cap was found.
    const qs = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    const off = Number(qs.get('offset') || 0);
    const lim = qs.get('limit') == null ? rows.length : Number(qs.get('limit'));
    const slice = rows.slice(off, off + lim);
    const cr = `${off}-${off + Math.max(slice.length - 1, 0)}/*`;
    if (name === 'universe_correlations') console.log('[harness] page', off, '->', slice.length);
    return new Response(JSON.stringify(slice), {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-range': cr },
    });
};

const { NexusBookMap } = await import('../src/pages/nexus/NexusBookMap.js');
const e = React.createElement;
createRoot(document.getElementById('root')).render(
    e('div', { className: 'nexus-flagship nexus-flagship-v2' },
        e('div', { className: 'nf-card nf-holdings' },
            e('div', { className: 'nf-card-h' },
                e('h3', null, 'Holdings'),
                e('span', { className: 'nf-sub' }, 'the book inside its candidate universe'),
                e('span', { className: 'nf-viewsel' },
                    e('button', { className: 'nf-viewbtn' }, 'TABLE'),
                    e('button', { className: 'nf-viewbtn is-on' }, 'MAP'))),
            e(NexusBookMap, null)))
);
