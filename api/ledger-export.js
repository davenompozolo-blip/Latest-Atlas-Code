'use strict';
// /api/ledger-export — full ledger export as a signed JSON artifact
//
// Returns every decision row with its hash chain, integrity status,
// and summary stats. Suitable for download as a tamper-evident audit file.
// The chain_ok flag in the integrity section tells the recipient whether
// the chain was intact at export time.

import { createClient } from '@supabase/supabase-js';

function sbAnon() {
    // ATLAS_ overrides first — SUPABASE_URL may be integration-injected and
    // point at a non-ATLAS Supabase project (see api/options-snapshot.js).
    const url = process.env.ATLAS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vdmojjszvvcithuxwexx.supabase.co';
    const key = process.env.ATLAS_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const sb = sbAnon();
    if (!sb) return res.status(503).json({ error: 'supabase misconfigured' });

    const [intRes, decRes, outRes, fwdRes] = await Promise.all([
        sb.from('vw_ledger_integrity').select('*').single(),
        sb.from('decisions').select('*').order('seq', { ascending: true }),
        sb.from('decision_outcomes').select('*, decisions(symbol,conviction,intent)').order('snapshot_at', { ascending: true }),
        sb.from('vw_forward_summary').select('*').single(),
    ]);

    if (decRes.error) return res.status(500).json({ error: decRes.error.message });

    const artifact = {
        exported_at: new Date().toISOString(),
        generator: 'ATLAS Ledger Phase 5',
        integrity: intRes.data || null,
        forward_summary: fwdRes.data || null,
        decisions: decRes.data || [],
        outcomes: (outRes.data || []).map(o => ({
            ...o,
            symbol:     o.decisions?.symbol,
            conviction: o.decisions?.conviction,
            intent:     o.decisions?.intent,
            decisions:  undefined,
        })),
        stats: {
            total_decisions:  (decRes.data || []).length,
            total_outcomes:   (outRes.data || []).length,
            chain_ok:         intRes.data?.chain_ok ?? null,
        },
    };

    const filename = `atlas-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).json(artifact);
}
