<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Status Terminal</title>
    <style>
        /* Terminal aesthetic - dark, green, monospace */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #0c0c0c;
            color: #00ff41;
            font-family: 'Courier New', Courier, monospace;
            font-size: 14px;
            line-height: 1.5;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .terminal {
            background: #0a0a0a;
            border: 1px solid #00ff41;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
            width: 100%;
            max-width: 780px;
            padding: 20px 25px;
            position: relative;
        }

        .terminal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #00ff41;
            padding-bottom: 10px;
            margin-bottom: 20px;
            color: #00cc33;
            font-weight: bold;
            letter-spacing: 1px;
        }

        .terminal-header .title {
            font-size: 16px;
        }

        .terminal-header .blink {
            animation: blink-anim 1.2s step-end infinite;
        }

        @keyframes blink-anim {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        .status-grid {
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .service-row {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            border-bottom: 1px dashed #1a3a1a;
            padding-bottom: 12px;
        }

        .service-name {
            width: 110px;
            font-weight: bold;
            color: #00ff41;
            text-transform: uppercase;
        }

        .service-indicator {
            width: 90px;
            font-weight: bold;
        }

        .service-detail {
            flex: 1;
            min-width: 150px;
            color: #b0ffb0;
        }

        .status-ok {
            color: #00ff41;
        }

        .status-warn {
            color: #ffaa00;
        }

        .status-error {
            color: #ff3355;
        }

        .status-neutral {
            color: #88aa88;
        }

        .footer-line {
            margin-top: 20px;
            border-top: 1px solid #00ff41;
            padding-top: 14px;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #00aa33;
        }

        .footer-line .timestamp {
            color: #66cc66;
        }

        .error-message {
            color: #ff3355;
            background: #1a0a0a;
            padding: 6px 10px;
            border-left: 3px solid #ff3355;
            margin-top: 8px;
            font-size: 13px;
        }

        .loading-text {
            color: #88aa88;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
        }

        .badge {
            display: inline-block;
            background: #0f2f0f;
            padding: 0 8px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 6px;
        }

        @media (max-width: 600px) {
            .terminal {
                padding: 15px;
            }
            .service-name {
                width: 80px;
            }
            .service-indicator {
                width: 70px;
            }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <span class="title">┌─[ ATLAS STATUS ]─────────────────────────────────</span>
            <span class="blink">█</span>
        </div>

        <div id="statusContainer" class="status-grid">
            <!-- Supabase -->
            <div class="service-row" id="row-supabase">
                <span class="service-name">Supabase</span>
                <span class="service-indicator" id="indicator-supabase">⏳</span>
                <span class="service-detail" id="detail-supabase">checking...</span>
            </div>
            <!-- Vercel -->
            <div class="service-row" id="row-vercel">
                <span class="service-name">Vercel</span>
                <span class="service-indicator" id="indicator-vercel">⏳</span>
                <span class="service-detail" id="detail-vercel">checking...</span>
            </div>
            <!-- GitHub -->
            <div class="service-row" id="row-github">
                <span class="service-name">GitHub</span>
                <span class="service-indicator" id="indicator-github">⏳</span>
                <span class="service-detail" id="detail-github">checking...</span>
            </div>
        </div>

        <div id="errorContainer" class="error-message" style="display: none;"></div>

        <div class="footer-line">
            <span>LIVE · auto-refresh 30s</span>
            <span class="timestamp" id="timestamp">⏱️ --:--:--</span>
        </div>
    </div>

    <script>
        (function() {
            // --- Configuration ---
            // In production, these are set via Vercel environment variables.
            // For local dev, you can override with .env (not committed).
            // The serverless functions will use the server-side env vars.
            const API_BASE = '/api';  // Vercel serverless functions

            // DOM refs
            const indicatorSupabase = document.getElementById('indicator-supabase');
            const detailSupabase = document.getElementById('detail-supabase');
            const indicatorVercel = document.getElementById('indicator-vercel');
            const detailVercel = document.getElementById('detail-vercel');
            const indicatorGithub = document.getElementById('indicator-github');
            const detailGithub = document.getElementById('detail-github');
            const errorContainer = document.getElementById('errorContainer');
            const timestampEl = document.getElementById('timestamp');

            // Helper: format timestamp
            function updateTimestamp() {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
                timestampEl.textContent = `⏱️ ${timeStr}`;
            }

            // Helper: set status for a service row
            function setStatus(service, ok, message, extra = '') {
                const indicatorMap = {
                    supabase: indicatorSupabase,
                    vercel: indicatorVercel,
                    github: indicatorGithub
                };
                const detailMap = {
                    supabase: detailSupabase,
                    vercel: detailVercel,
                    github: detailGithub
                };
                const indicator = indicatorMap[service];
                const detail = detailMap[service];
                if (!indicator || !detail) return;

                if (ok === true) {
                    indicator.innerHTML = '✓ OK';
                    indicator.className = 'service-indicator status-ok';
                    detail.textContent = message || 'operational';
                    detail.className = 'service-detail status-ok';
                } else if (ok === false) {
                    indicator.innerHTML = '✗ FAIL';
                    indicator.className = 'service-indicator status-error';
                    detail.textContent = message || 'error';
                    detail.className = 'service-detail status-error';
                } else {
                    // neutral / unknown
                    indicator.innerHTML = '?';
                    indicator.className = 'service-indicator status-neutral';
                    detail.textContent = message || 'unknown';
                    detail.className = 'service-detail status-neutral';
                }
                if (extra) {
                    detail.textContent += ` ${extra}`;
                }
            }

            // Show error banner
            function showError(msg) {
                if (!msg) {
                    errorContainer.style.display = 'none';
                    return;
                }
                errorContainer.textContent = `⚠ ${msg}`;
                errorContainer.style.display = 'block';
            }

            // --- Fetch status from serverless functions ---
            async function fetchSupabaseStatus() {
                // Supabase health: we check via a simple query to the REST API.
                // We'll use the /api/vercel-status?service=supabase pattern or direct.
                // For simplicity, we call a dedicated endpoint or reuse vercel-status with param.
                // Actually we have api/vercel-status.js and api/github-status.js.
                // Supabase status can be derived from Vercel's side or we call a public health endpoint.
                // Let's create a lightweight check: call /api/vercel-status?type=supabase
                // But the issue says we have vercel-status and github-status functions.
                // We'll add a small inline check for supabase using public API (no token needed for basic health).
                // However to keep consistency, we'll call a custom endpoint.
                // Since we only have two serverless functions defined, we'll reuse vercel-status with a query param.
                // In production, you'd have a dedicated supabase-status function.
                // For this demo, we'll do a direct fetch to Supabase's health endpoint (if available) or a mock.
                // Let's try to call the Supabase project's API health (no auth needed for basic status).
                // But we don't know the project URL. We'll use a placeholder and fallback.
                // Better: we call /api/vercel-status?target=supabase which we will implement in vercel-status.js.
                // For now, we simulate with a fetch to a known Supabase status page? Not reliable.
                // I'll implement a direct check using the Supabase project URL from env (but client-side can't).
                // So we rely on the serverless function to proxy.
                // Let's define: /api/vercel-status.js will accept ?service=supabase and return status.
                // We'll implement that in the serverless function.
                // For the client, we call:
                try {
                    const resp = await fetch(`${API_BASE}/vercel-status?service=supabase`);
                    if (!resp.ok) {
                        throw new Error(`HTTP ${resp.status}`);
                    }
                    const data = await resp.json();
                    if (data.ok) {
                        setStatus('supabase', true, data.message || 'connected');
                    } else {
                        setStatus('supabase', false, data.message || 'unreachable');
                    }
                } catch (err) {
                    setStatus('supabase', false, `fetch error: ${err.message}`);
                }
            }

            async function fetchVercelStatus() {
                try {
                    const resp = await fetch(`${API_BASE}/vercel-status?service=vercel`);
                    if (!resp.ok) {
                        throw new Error(`HTTP ${resp.status}`);
                    }
                    const data = await resp.json();
                    if (data.ok) {
                        setStatus('vercel', true, data.message || 'deployments ok');
                    } else {
                        setStatus('vercel', false, data.message || 'error');
                    }
                } catch (err) {
                    setStatus('vercel', false, `fetch error: ${err.message}`);
                }
            }

            async function fetchGithubStatus() {
                try {
                    const resp = await fetch(`${API_BASE}/github-status`);
                    if (!resp.ok) {
                        throw new Error(`HTTP ${resp.status}`);
                    }
                    const data = await resp.json();
                    if (data.ok) {
                        setStatus('github', true, data.message || 'api ok');
                    } else {
                        setStatus('github', false, data.message || 'error');
                    }
                } catch (err) {
                    setStatus('github', false, `fetch error: ${err.message}`);
                }
            }

            // Master fetch
            async function fetchAllStatus() {
                showError(null); // clear previous errors
                // Run all in parallel
                await Promise.allSettled([
                    fetchSupabaseStatus(),
                    fetchVercelStatus(),
                    fetchGithubStatus()
                ]);
                updateTimestamp();
            }

            // Initial load
            fetchAllStatus();

            // Auto-refresh every 30 seconds
            setInterval(fetchAllStatus, 30000);

            // Also update timestamp every minute
            setInterval(updateTimestamp, 60000);
            updateTimestamp();

            // Expose for debugging
            window.__status = { fetchAllStatus };
        })();
    </script>
</body>
</html>
