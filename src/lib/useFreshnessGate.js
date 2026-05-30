// Freshness thresholds (minutes): fresh ≤18, stale ≤45, critical >45
// Returns { ageMin, tier: 'fresh'|'stale'|'critical', lastOkAt, loading, error }

import { useState, useEffect, useRef } from 'react';
import { sb } from './supabase.js';

const FRESH_MIN   = 18;
const CRITICAL_MIN = 45;
const POLL_MS     = 60_000;

export function useFreshnessGate() {
    const [state, setState] = useState({ ageMin: null, tier: 'fresh', lastOkAt: null, loading: true, error: null });
    const timer = useRef(null);

    async function check() {
        if (!sb) { setState(s => ({ ...s, loading: false })); return; }
        try {
            const { data, error } = await sb
                .from('system_health')
                .select('last_ok_at, status, detail')
                .eq('component', 'parser')
                .single();
            if (error) throw error;
            const last = data?.last_ok_at ? new Date(data.last_ok_at) : null;
            const ageMin = last ? Math.floor((Date.now() - last.getTime()) / 60_000) : 999;
            const tier = ageMin <= FRESH_MIN ? 'fresh' : ageMin <= CRITICAL_MIN ? 'stale' : 'critical';
            setState({ ageMin, tier, lastOkAt: last, loading: false, error: null });
        } catch (e) {
            setState(s => ({ ...s, loading: false, error: e.message }));
        }
    }

    useEffect(function() {
        check();
        timer.current = setInterval(check, POLL_MS);
        return () => clearInterval(timer.current);
    }, []);

    return state;
}
