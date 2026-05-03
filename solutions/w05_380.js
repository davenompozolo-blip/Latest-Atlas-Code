<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Status Terminal</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #0a0e14;
            color: #b3b1ad;
            font-family: 'Courier New', 'Consolas', monospace;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .terminal {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 8px;
            width: 100%;
            max-width: 820px;
            box-shadow: 0 0 30px rgba(0, 255, 100, 0.05);
            overflow: hidden;
        }

        .terminal-header {
            background: #161b22;
            padding: 12px 20px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .terminal-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }

        .dot-red { background: #ff5f56; }
        .dot-yellow { background: #ffbd2e; }
        .dot-green { background: #27c93f; }

        .terminal-title {
            color: #8b949e;
            font-size: 14px;
            letter-spacing: 0.5px;
            margin-left: 8px;
        }

        .terminal-body {
            padding: 24px 28px;
            font-size: 15px;
            line-height: 1.7;
        }

        .line {
            display: flex;
            align-items: baseline;
            gap: 12px;
            padding: 4px 0;
            border-bottom: 1px solid #21262d;
        }

        .line:last-child {
            border-bottom: none;
        }

        .prompt {
            color: #58a6ff;
            font-weight: bold;
            min-width: 100px;
        }

        .service-name {
            color: #f0f6fc;
            font-weight: 600;
            min-width: 120px;
        }

        .status-badge {
            display: inline-block;
            padding: 2px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            letter-spacing: 0.3px;
            text-transform: uppercase;
        }

        .status-ok {
            background: #1b3a2d;
            color: #3fb950;
            border: 1px solid #2ea043;
        }

        .status-warn {
            background: #3d2e00;
            color: #d29922;
            border: 1px solid #bb8009;
        }

        .status-error {
            background: #3d1114;
            color: #f85149;
            border: 1px solid #da3633;
        }

        .status-loading {
            background: #1c2128;
            color: #8b949e;
            border: 1px solid #30363d;
        }

        .meta {
            color: #484f58;
            font-size: 13px;
            margin-left: auto;
        }

        .divider {
            color: #21262d;
            text-align: center;
            padding: 12px 0 8px;
            font-size: 13px;
            letter-spacing: 2px;
        }

        .footer {
            margin-top: 16px;
            text-align: center;
            color: #484f58;
            font-size: 12px;
        }

        .blink {
            animation: blink-animation 1.2s step-end infinite;
        }

        @keyframes blink-animation {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        .cursor {
            background: #58a6ff;
            width: 8px;
            height: 16px;
            display: inline-block;
            margin-left: 4px;
            vertical-align: middle;
        }

        .timestamp {
            color: #484f58;
            font-size: 12px;
            margin-top: 12px;
            text-align: right;
        }

        @media (max-width: 600px) {
            .terminal-body {
                padding: 16px;
                font-size: 13px;
            }
            .line {
                flex-wrap: wrap;
                gap: 6px;
            }
            .prompt {
                min-width: 70px;
            }
            .service-name {
                min-width: 90px;
            }
            .meta {
                margin-left: 0;
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <span class="terminal-dot dot-red"></span>
            <span class="terminal-dot dot-yellow"></span>
            <span class="terminal-dot dot-green"></span>
            <span class="terminal-title">ATLAS · STATUS TERMINAL v1.0</span>
        </div>
        <div class="terminal-body" id="terminalBody">
            <div class="line">
                <span class="prompt">$</span>
                <span style="color:#58a6ff;">atlasctl</span>
                <span style="color:#8b949e;">status --live</span>
            </div>
            <div class="divider">─── live health dashboard ───</div>

            <!-- Supabase -->
            <div class="line" id="supabase-line">
                <span class="prompt">▶</span>
                <span class="service-name">supabase</span>
                <span class="status-badge status-loading" id="supabase-status">loading...</span>
                <span class="meta" id="supabase-meta">—</span>
            </div>

            <!-- Vercel -->
            <div class="line" id="vercel-line">
                <span class="prompt">▶</span>
                <span class="service-name">vercel</span>
                <span class="status-badge status-loading" id="vercel-status">loading...</span>
                <span class="meta" id="vercel-meta">—</span>
            </div>

            <!-- GitHub -->
            <div class="line" id="github-line">
                <span class="prompt">▶</span>
                <span class="service-name">github</span>
                <span class="status-badge status-loading" id="github-status">loading...</span>
                <span class="meta" id="github-meta">—</span>
            </div>

            <div class="divider">───</div>
            <div class="line">
                <span class="prompt">$</span>
                <span style="color:#8b949e;">_</span>
                <span class="cursor blink"></span>
            </div>
            <div class="timestamp" id="timestamp">last refresh: —</div>
        </div>
    </div>
    <div class="footer">
        <span>⚡ ATLAS · </span>
        <span id="countdown">next update in 30s</span>
    </div>

    <script>
        (function() {
            // --- Configuration ---
            const REFRESH_INTERVAL = 30000; // 30 seconds
            const SUPABASE_PROJECT = 'your-supabase-project-ref'; // override via env if needed
            const VERCEL_PROJECT = 'your-vercel-project-id';
            const GITHUB_REPO = 'owner/repo';

            // DOM refs
            const supabaseStatus = document.getElementById('supabase-status');
            const supabaseMeta = document.getElementById('supabase-meta');
            const vercelStatus = document.getElementById('vercel-status');
            const vercelMeta = document.getElementById('vercel-meta');
            const githubStatus = document.getElementById('github-status');
            const githubMeta = document.getElementById('github-meta');
            const timestampEl = document.getElementById('timestamp');
            const countdownEl = document.getElementById('countdown');

            let countdownValue = REFRESH_INTERVAL / 1000;
            let countdownInterval = null;

            // --- Helper: update status badge ---
            function setStatus(element, status, label) {
                element.textContent = label || status;
                element.className = 'status-badge';
                if (status === 'ok' || status === 'healthy') {
                    element.classList.add('status-ok');
                } else if (status === 'warn' || status === 'degraded') {
                    element.classList.add('status-warn');
                } else if (status === 'error' || status === 'down') {
                    element.classList.add('status-error');
                } else {
                    element.classList.add('status-loading');
                }
            }

            // --- Helper: update meta text ---
            function setMeta(element, text) {
                element.textContent = text || '—';
            }

            // --- Helper: update timestamp ---
            function updateTimestamp() {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                timestampEl.textContent = `last refresh: ${timeStr}`;
            }

            // --- Fetch Supabase health ---
            async function fetchSupabase() {
                try {
                    // Using public health endpoint (no token needed for basic status)
                    const response = await fetch('https://status.supabase.com/api/v1/status', {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const data = await response.json();
                    // Supabase status API returns { status: { indicator: "none"|"minor"|"major"|"critical" } }
                    const indicator = data?.status?.indicator || 'unknown';
                    if (indicator === 'none') {
                        setStatus(supabaseStatus, 'ok', 'OPERATIONAL');
                        setMeta(supabaseMeta, 'all systems nominal');
                    } else if (indicator === 'minor') {
                        setStatus(supabaseStatus, 'warn', 'DEGRADED');
                        setMeta(supabaseMeta, 'minor incident');
                    } else if (indicator === 'major' || indicator === 'critical') {
                        setStatus(supabaseStatus, 'error', 'OUTAGE');
                        setMeta(supabaseMeta, 'major outage');
                    } else {
                        setStatus(supabaseStatus, 'warn', 'UNKNOWN');
                        setMeta(supabaseMeta, 'unexpected status');
                    }
                } catch (err) {
                    setStatus(supabaseStatus, 'error', 'UNREACHABLE');
                    setMeta(supabaseMeta, 'fetch failed: ' + err.message);
                }
            }

            // --- Fetch Vercel status via serverless proxy ---
            async function fetchVercel() {
                try {
                    const response = await fetch('/api/vercel-status', {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const data = await response.json();
                    // Expected: { status: "ok"|"degraded"|"down", message: "..." }
                    const status = data?.status || 'unknown';
                    const message = data?.message || '';
                    if (status === 'ok') {
                        setStatus(vercelStatus, 'ok', 'OPERATIONAL');
                        setMeta(vercelMeta, message || 'all systems nominal');
                    } else if (status === 'degraded') {
                        setStatus(vercelStatus, 'warn', 'DEGRADED');
                        setMeta(vercelMeta, message || 'performance issues');
                    } else if (status === 'down') {
                        setStatus(vercelStatus, 'error', 'DOWN');
                        setMeta(vercelMeta, message || 'service unavailable');
                    } else {
                        setStatus(vercelStatus, 'warn', 'UNKNOWN');
                        setMeta(vercelMeta, message || 'unexpected response');
                    }
                } catch (err) {
                    setStatus(vercelStatus, 'error', 'UNREACHABLE');
                    setMeta(vercelMeta, 'proxy error: ' + err.message);
                }
            }

            // --- Fetch GitHub status via serverless proxy ---
            async function fetchGithub() {
                try {
                    const response = await fetch('/api/github-status', {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const data = await response.json();
                    // Expected: { status: "ok"|"degraded"|"down", message: "..." }
                    const status = data?.status || 'unknown';
                    const message = data?.message || '';
                    if (status === 'ok') {
                        setStatus(githubStatus, 'ok', 'OPERATIONAL');
                        setMeta(githubMeta, message || 'all systems nominal');
                    } else if (status === 'degraded') {
                        setStatus(githubStatus, 'warn', 'DEGRADED');
                        setMeta(githubMeta, message || 'performance issues');
                    } else if (status === 'down') {
                        setStatus(githubStatus, 'error', 'DOWN');
                        setMeta(githubMeta, message || 'service unavailable');
                    } else {
                        setStatus(githubStatus, 'warn', 'UNKNOWN');
                        setMeta(githubMeta, message || 'unexpected response');
                    }
                } catch (err) {
                    setStatus(githubStatus, 'error', 'UNREACHABLE');
                    setMeta(githubMeta, 'proxy error: ' + err.message);
                }
            }

            // --- Refresh all ---
            async function refreshAll() {
                await Promise.allSettled([
                    fetchSupabase(),
                    fetchVercel(),
                    fetchGithub()
                ]);
                updateTimestamp();
                // reset countdown
                countdownValue = REFRESH_INTERVAL / 1000;
            }

            // --- Countdown tick ---
            function tickCountdown() {
                countdownValue = Math.max(0, countdownValue - 1);
                countdownEl.textContent = `next update in ${countdownValue}s`;
                if (countdownValue <= 0) {
                    refreshAll();
                }
            }

            // --- Initial load & interval ---
            function init() {
                refreshAll();
                countdownInterval = setInterval(tickCountdown, 1000);
                // Also refresh on interval (backup)
                setInterval(refreshAll, REFRESH_INTERVAL);
            }

            // Start when DOM ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
        })();
    </script>
</body>
</html>
