<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Status Terminal</title>
    <style>
        /* CRT / terminal aesthetic */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #0b0e14;
            color: #b3ffb3;
            font-family: 'Courier New', 'Fira Code', monospace;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
        }

        .terminal {
            background: #0f1219;
            border: 2px solid #2a3a3a;
            border-radius: 12px;
            box-shadow: 0 0 30px rgba(0, 255, 100, 0.08);
            width: 100%;
            max-width: 900px;
            padding: 2rem 1.8rem;
            position: relative;
            backdrop-filter: blur(1px);
        }

        .terminal::before {
            content: "ATLAS STATUS v1.0 — LIVE";
            display: block;
            font-size: 0.8rem;
            letter-spacing: 2px;
            color: #6a9a7a;
            border-bottom: 1px solid #1f2e2e;
            padding-bottom: 0.6rem;
            margin-bottom: 1.8rem;
            text-transform: uppercase;
        }

        .scanline {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: repeating-linear-gradient(
                0deg,
                rgba(0, 0, 0, 0.03) 0px,
                rgba(0, 0, 0, 0.03) 2px,
                transparent 2px,
                transparent 4px
            );
            pointer-events: none;
            border-radius: 12px;
        }

        .status-grid {
            display: flex;
            flex-direction: column;
            gap: 1.2rem;
        }

        .status-row {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            border-bottom: 1px dashed #1e2a2a;
            padding-bottom: 0.8rem;
        }

        .status-row:last-child {
            border-bottom: none;
        }

        .service-icon {
            width: 2rem;
            color: #5f9ea0;
        }

        .service-name {
            width: 8rem;
            font-weight: 600;
            color: #b0e0b0;
            letter-spacing: 0.5px;
        }

        .status-badge {
            display: inline-block;
            padding: 0.2rem 1rem;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            background: #1a2a1a;
            color: #7ab07a;
            border: 1px solid #2a4a2a;
            margin-right: 1.5rem;
            min-width: 80px;
            text-align: center;
        }

        .status-badge.ok {
            background: #0f2f0f;
            color: #8bff8b;
            border-color: #2f8f2f;
            box-shadow: 0 0 6px #1f6f1f;
        }

        .status-badge.warn {
            background: #2f2f0f;
            color: #ffd966;
            border-color: #8f8f2f;
        }

        .status-badge.error {
            background: #2f0f0f;
            color: #ff7a7a;
            border-color: #8f2f2f;
        }

        .detail-meta {
            color: #7a9a7a;
            font-size: 0.8rem;
            margin-left: auto;
            white-space: nowrap;
        }

        .detail-meta span {
            margin-left: 1rem;
        }

        .timestamp {
            margin-top: 1.8rem;
            font-size: 0.7rem;
            color: #4a6a5a;
            border-top: 1px solid #1a2a2a;
            padding-top: 1rem;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
        }

        .blink {
            animation: blink 1.2s step-end infinite;
        }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .loading-dots::after {
            content: ".";
            animation: dots 1.5s steps(3, end) infinite;
        }

        @keyframes dots {
            0% { content: "."; }
            33% { content: ".."; }
            66% { content: "..."; }
        }

        .footer-note {
            font-size: 0.65rem;
            color: #3a5a4a;
            margin-top: 0.5rem;
        }

        @media (max-width: 600px) {
            .terminal { padding: 1.5rem 1rem; }
            .service-name { width: 6rem; }
            .status-badge { margin-right: 0.5rem; min-width: 60px; }
            .detail-meta { margin-left: 0; width: 100%; margin-top: 0.3rem; }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="scanline"></div>
        <div class="status-grid" id="statusGrid">
            <!-- Supabase -->
            <div class="status-row" id="row-supabase">
                <span class="service-icon">◉</span>
                <span class="service-name">Supabase</span>
                <span class="status-badge" id="badge-supabase">⏳</span>
                <span class="detail-meta" id="meta-supabase">—</span>
            </div>
            <!-- Vercel -->
            <div class="status-row" id="row-vercel">
                <span class="service-icon">◉</span>
                <span class="service-name">Vercel</span>
                <span class="status-badge" id="badge-vercel">⏳</span>
                <span class="detail-meta" id="meta-vercel">—</span>
            </div>
            <!-- GitHub -->
            <div class="status-row" id="row-github">
                <span class="service-icon">◉</span>
                <span class="service-name">GitHub</span>
                <span class="status-badge" id="badge-github">⏳</span>
                <span class="detail-meta" id="meta-github">—</span>
            </div>
        </div>
        <div class="timestamp">
            <span id="lastUpdate">⏱️ last check: —</span>
            <span id="refreshIndicator" class="blink">⬤ LIVE</span>
        </div>
        <div class="footer-note">[ CTRL+C ] to quit · auto-refresh 30s</div>
    </div>

    <script>
        (function() {
            "use strict";

            // ---- UI helpers ----
            const $ = (id) => document.getElementById(id);
            const badge = (service) => $(`badge-${service}`);
            const meta = (service) => $(`meta-${service}`);

            function setStatus(service, status, message, detail = '') {
                const b = badge(service);
                const m = meta(service);
                if (!b || !m) return;

                // remove previous status classes
                b.classList.remove('ok', 'warn', 'error');

                if (status === 'ok') {
                    b.classList.add('ok');
                    b.textContent = '✓ OK';
                } else if (status === 'warn') {
                    b.classList.add('warn');
                    b.textContent = '⚠ WARN';
                } else if (status === 'error') {
                    b.classList.add('error');
                    b.textContent = '✗ ERROR';
                } else {
                    b.textContent = '⋯';
                }

                let metaText = message || '';
                if (detail) metaText += ` · ${detail}`;
                m.textContent = metaText;
            }

            function setLoading(service) {
                const b = badge(service);
                if (b) {
                    b.classList.remove('ok', 'warn', 'error');
                    b.textContent = '⏳';
                }
                const m = meta(service);
                if (m) m.textContent = 'fetching...';
            }

            function updateTimestamp() {
                const now = new Date();
                const ts = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const el = $('lastUpdate');
                if (el) el.textContent = `⏱️ last check: ${ts}`;
            }

            // ---- data fetching (serverless proxies) ----
            async function fetchSupabaseStatus() {
                // Supabase uses their own status API (no token needed)
                try {
                    const resp = await fetch('https://status.supabase.com/api/v1/status', {
                        signal: AbortSignal.timeout(8000)
                    });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const data = await resp.json();
                    // expected: { status: { indicator: "none", description: "All Systems Operational" } }
                    const indicator = data?.status?.indicator;
                    const desc = data?.status?.description || 'unknown';
                    if (indicator === 'none') {
                        setStatus('supabase', 'ok', 'Operational', desc);
                    } else if (indicator === 'minor' || indicator === 'major') {
                        setStatus('supabase', 'warn', desc, `indicator: ${indicator}`);
                    } else {
                        setStatus('supabase', 'warn', desc || 'unexpected response');
                    }
                } catch (err) {
                    setStatus('supabase', 'error', err.message || 'fetch failed');
                }
            }

            async function fetchVercelStatus() {
                // uses /api/vercel-status (serverless proxy)
                try {
                    const resp = await fetch('/api/vercel-status', {
                        signal: AbortSignal.timeout(10000)
                    });
                    if (!resp.ok) {
                        let errMsg = `HTTP ${resp.status}`;
                        try {
                            const errData = await resp.json();
                            if (errData?.error) errMsg = errData.error;
                        } catch (_) {}
                        throw new Error(errMsg);
                    }
                    const data = await resp.json();
                    // expected: { status: "ok" | "warn" | "error", message: "...", detail: "..." }
                    const status = data?.status || 'error';
                    const message = data?.message || 'no message';
                    const detail = data?.detail || '';
                    setStatus('vercel', status, message, detail);
                } catch (err) {
                    setStatus('vercel', 'error', err.message || 'fetch failed');
                }
            }

            async function fetchGitHubStatus() {
                // uses /api/github-status (serverless proxy)
                try {
                    const resp = await fetch('/api/github-status', {
                        signal: AbortSignal.timeout(10000)
                    });
                    if (!resp.ok) {
                        let errMsg = `HTTP ${resp.status}`;
                        try {
                            const errData = await resp.json();
                            if (errData?.error) errMsg = errData.error;
                        } catch (_) {}
                        throw new Error(errMsg);
                    }
                    const data = await resp.json();
                    // expected: { status: "ok" | "warn" | "error", message: "...", detail: "..." }
                    const status = data?.status || 'error';
                    const message = data?.message || 'no message';
                    const detail = data?.detail || '';
                    setStatus('github', status, message, detail);
                } catch (err) {
                    setStatus('github', 'error', err.message || 'fetch failed');
                }
            }

            // ---- master refresh ----
            async function refreshAll() {
                // set loading placeholders
                setLoading('supabase');
                setLoading('vercel');
                setLoading('github');

                // fire all (parallel)
                await Promise.allSettled([
                    fetchSupabaseStatus(),
                    fetchVercelStatus(),
                    fetchGitHubStatus()
                ]);

                updateTimestamp();
            }

            // ---- initial load & interval ----
            refreshAll();
            setInterval(refreshAll, 30000); // 30s

            // optional: manual refresh on focus (user returns to tab)
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    refreshAll();
                }
            });

        })();
    </script>
</body>
</html>
