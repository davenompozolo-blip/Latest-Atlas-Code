// src/lib/rateWindow.js
//
// A rolling-window request budget, reserved BEFORE the work it covers.
//
// api/sync-valuations.js first paced Finnhub with a fixed pause AFTER each
// symbol. That bounds the average but not the window: three 12-call symbols
// followed by a 26-call one put 62 calls inside 60 seconds, because the pause
// that would have made room comes after the burst (CodeRabbit, PR #835).
// Reserving the worst case up front makes the limit hold for any sequence;
// `release` gives back a reservation the work turned out not to spend (a cache
// hit), so cached names cost nothing.
//
// Pure apart from the clock, which is injected so the arithmetic is testable.

export function rateWindow({ limit, windowMs, now = () => Date.now() }) {
    if (!(limit > 0) || !(windowMs > 0)) throw new Error('rateWindow: limit and windowMs must be positive');
    const held = [];   // { t, n } reservations still inside the window

    const prune = t => { while (held.length && held[0].t <= t - windowMs) held.shift(); };
    const used = () => held.reduce((s, r) => s + r.n, 0);

    return {
        // Milliseconds to wait before `n` more calls fit. 0 means now.
        // A request larger than the whole limit can never fit: Infinity.
        waitFor(n) {
            if (n > limit) return Infinity;
            const t = now();
            prune(t);
            let total = used();
            if (total + n <= limit) return 0;
            // Walk the oldest reservations until enough have aged out.
            for (const r of held) {
                total -= r.n;
                if (total + n <= limit) return r.t + windowMs - t;
            }
            return windowMs;
        },
        // Record `n` calls at the current instant. Returns a handle for release.
        reserve(n) {
            const r = { t: now(), n };
            held.push(r);
            return r;
        },
        release(handle) { if (handle) handle.n = 0; },
        used() { prune(now()); return used(); },
    };
}
