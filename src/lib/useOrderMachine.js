import { useState, useEffect, useRef, useCallback } from 'react';

// Circuit breaker state (module-level so it's shared page-wide)
let cbFailures = [];
let cbTripped = false;
let cbResetTimer = null;
const CB_WINDOW_MS = 120_000;
const CB_THRESHOLD = 3;
const CB_COOLDOWN_MS = 60_000;
const CB_LISTENERS = new Set();

function notifyCB() { CB_LISTENERS.forEach(fn => fn({ tripped: cbTripped })); }

export function useCircuitBreaker() {
    const [tripped, setTripped] = useState(cbTripped);
    useEffect(function() {
        const fn = ({ tripped: t }) => setTripped(t);
        CB_LISTENERS.add(fn);
        return () => CB_LISTENERS.delete(fn);
    }, []);
    return tripped;
}

function recordFailure() {
    const now = Date.now();
    cbFailures = cbFailures.filter(t => now - t < CB_WINDOW_MS);
    cbFailures.push(now);
    if (cbFailures.length >= CB_THRESHOLD && !cbTripped) {
        cbTripped = true;
        notifyCB();
        if (cbResetTimer) clearTimeout(cbResetTimer);
        cbResetTimer = setTimeout(function() {
            cbTripped = false;
            cbFailures = [];
            cbResetTimer = null;
            notifyCB();
        }, CB_COOLDOWN_MS);
    }
}

export function useOrderMachine() {
    const [order, setOrder] = useState(null); // { status, symbol, side, notional, qty, clientOrderId, alpacaId, filledQty, filledAvg, rejectReason }
    const pollRef = useRef(null);

    function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

    async function checkStatus(clientOrderId) {
        try {
            const r = await fetch('/api/trading?action=order_status&client_order_id=' + encodeURIComponent(clientOrderId));
            const j = await r.json().catch(() => ({}));
            if (!r.ok) return null;
            return j;
        } catch (_) { return null; }
    }

    function startPoll(clientOrderId) {
        let tries = 0;
        pollRef.current = setInterval(async function() {
            tries++;
            const st = await checkStatus(clientOrderId);
            if (st) {
                if (st.status === 'filled' || st.status === 'partially_filled') {
                    setOrder(o => ({ ...o, status: 'FILLED', filledQty: st.filled_qty, filledAvg: st.filled_avg_price, alpacaId: st.id }));
                    stopPoll();
                } else if (st.status === 'rejected' || st.status === 'canceled') {
                    setOrder(o => ({ ...o, status: 'REJECTED', rejectReason: st.reject_reason || st.status, alpacaId: st.id }));
                    stopPoll();
                } else if (st.status === 'accepted' || st.status === 'new' || st.status === 'pending_new') {
                    setOrder(o => ({ ...o, status: 'CONFIRMING', alpacaId: st.id }));
                }
            }
            if (tries >= 5) {
                setOrder(o => o.status === 'CONFIRMING' || o.status === 'SUBMITTING' ? { ...o, status: 'UNKNOWN' } : o);
                stopPoll();
            }
        }, 3000);
    }

    const submit = useCallback(async function(params) {
        // params: { symbol, side, notional?, qty?, type?, tif? }
        if (cbTripped) { alert('Execution paused — circuit breaker active. Try again in ~60s.'); return; }
        const clientOrderId = crypto.randomUUID();
        setOrder({ status: 'SUBMITTING', symbol: params.symbol, side: params.side, notional: params.notional, qty: params.qty, clientOrderId, alpacaId: null, filledQty: null, filledAvg: null, rejectReason: null });
        stopPoll();

        let r, j;
        try {
            r = await fetch('/api/trading?action=order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...params, client_order_id: clientOrderId }),
            });
            j = await r.json().catch(() => ({}));
        } catch (networkErr) {
            recordFailure();
            setOrder(o => ({ ...o, status: 'UNKNOWN' }));
            startPoll(clientOrderId);
            return;
        }

        if (r.status >= 500 || r.status === 0) {
            recordFailure();
            setOrder(o => ({ ...o, status: 'UNKNOWN' }));
            startPoll(clientOrderId);
            return;
        }

        if (r.status >= 400 && r.status < 500) {
            // 4xx = deterministic rejection, do NOT retry, do NOT trip breaker
            const reason = (j && (j.message || j.error)) || ('HTTP ' + r.status);
            setOrder(o => ({ ...o, status: 'REJECTED', rejectReason: reason }));
            return;
        }

        // 2xx
        const alpacaId = j?.order?.id || j?.id;
        setOrder(o => ({ ...o, status: 'CONFIRMING', alpacaId }));
        startPoll(clientOrderId);
    }, []);

    const recheck = useCallback(async function(clientOrderId) {
        if (!clientOrderId) return;
        const st = await checkStatus(clientOrderId);
        if (!st) return;
        if (st.status === 'filled' || st.status === 'partially_filled') {
            setOrder(o => ({ ...o, status: 'FILLED', filledQty: st.filled_qty, filledAvg: st.filled_avg_price }));
        } else if (st.status === 'rejected' || st.status === 'canceled') {
            setOrder(o => ({ ...o, status: 'REJECTED', rejectReason: st.reject_reason || st.status }));
        }
    }, []);

    const reset = useCallback(function() { stopPoll(); setOrder(null); }, []);

    return { order, submit, recheck, reset };
}
