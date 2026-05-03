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
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            width: 100%;
            max-width: 820px;
            overflow: hidden;
            backdrop-filter: blur(2px);
        }

        .terminal-header {
            background: #161b22;
            padding: 14px 20px;
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
            flex-wrap: wrap;
            gap: 6px 10px;
            padding: 6px 0;
            border-bottom: 1px solid #21262d;
            min-height: 40px;
        }

        .line:last-child {
            border-bottom: none;
        }

        .prompt {
            color: #58a6ff;
            font-weight: bold;
            white-space: nowrap;
        }

        .service-name {
            color: #f0f6fc;
            font-weight: 600;
            min-width: 100px;
        }

        .status-badge {
            display: inline-block;
            padding: 2px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.3px;
            background: #21262d;
            color: #8b949e;
            min-width: 80px;
            text-align: center;
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
            background: #3d1c1c;
            color: #f85149;
            border: 1px solid #da3633;
        }

        .status-loading {
            background: #1c2128;
            color: #8b949e;
            border: 1px solid #30363d;
            animation: pulse 1.2s infinite;
        }

        .detail {
            color: #7d8590;
            font-size: 13px;
            margin-left: auto;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 260px;
        }

        .timestamp {
            color: #484f58;
            font-size: 12px;
            margin-top: 16px;
            text-align: right;
            border-top: 1px solid #21262d;
            padding-top: 14px;
            letter-spacing: 0.3px;
        }

        .divider {
            color: #30363d;
            margin: 0 4px;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
        }

        .blink {
            animation: blink-cursor 1s step-end infinite;
        }

        @keyframes blink-cursor {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        .footer-note {
            color: #484f58;
            font-size: 12px;
            margin-top: 12px;
            text-align: center;
        }

        @media (max-width: 600px) {
            .terminal-body { padding: 16px; font-size: 14px; }
            .service-name { min-width: 70px; }
            .detail { max-width: 140px; font-size: 12px; }
            .status-badge { min-width: 65px; font-size: 12px; }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <span class="terminal-dot dot-red"></span>
            <span class="terminal-dot dot-yellow"></span>
            <span class="terminal-dot dot-green"></span>
            <span class="terminal-title">ATLAS Status Terminal — v1.0</span>
        </div>
        <div class="terminal-body" id="terminalBody">
            <div class="line">
                <span class="prompt">$</span>
                <span class="service-name">supabase</span>
                <span class="status-badge status-loading" id="supabaseBadge">⟳ probing</span>
                <span class="detail" id="supabaseDetail">connecting...</span>
            </div>
            <div class="line">
                <span class="prompt">$</span>
                <span class="service-name">vercel</span>
                <span class="status-badge status-loading" id="vercelBadge">⟳ probing</span>
                <span class="detail" id="vercelDetail">connecting...</span>
            </div>
            <div class="line">
                <span class="prompt">$</span>
                <span class="service-name">github</span>
                <span class="status-badge status-loading" id="githubBadge">⟳ probing</span>
                <span class="detail" id="githubDetail">connecting...</span>
            </div>
            <div class="timestamp" id="timestamp">⏱ waiting for signal...</div>
        </div>
    </div>
    <div class="footer-note">[ CTRL+C ] to interrupt • live refresh every 30s</div>

    <script>
        (function() {
            // ----- DOM refs -----
            const supabaseBadge = document.getElementById('supabaseBadge');
            const supabaseDetail = document.getElementById('supabaseDetail');
            const vercelBadge = document.getElementById('vercelBadge');
            const vercelDetail = document.getElementById('vercelDetail');
            const githubBadge = document.getElementById('githubBadge');
            const githubDetail = document.getElementById('githubDetail');
            const timestampEl = document.getElementById('timestamp');

            // ----- helpers -----
            function setBadge(el, status, text) {
                el.className = 'status-badge';
                if (status === 'ok') el.classList.add('status-ok');
                else if (status === 'warn') el.classList.add('status-warn');
                else if (status === 'error') el.classList.add('status-error');
                else el.classList.add('status-loading');
                el.textContent = text;
            }

            function formatTime(isoString) {
                const d = new Date(isoString);
                return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }

            function updateTimestamp(isoString) {
                const time = formatTime(isoString);
                timestampEl.textContent = `⏱ last probe: ${time} UTC`;
            }

            // ----- fetch functions -----
            async function checkSupabase() {
                // public health endpoint (no token needed)
                try {
                    const resp = await fetch('https://status.supabase.com/api/v1/status', { 
                        signal: AbortSignal.timeout(8000) 
                    });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const data = await resp.json();
                    // supabase status page returns { status: { indicator: "none"|"minor"|"major" } }
                    const indicator = data?.status?.indicator || 'unknown';
                    if (indicator === 'none') {
                        setBadge(supabaseBadge, 'ok', '✓ operational');
                        supabaseDetail.textContent = 'all systems nominal';
                    } else if (indicator === 'minor') {
                        setBadge(supabaseBadge, 'warn', '⚠ degraded');
                        supabaseDetail.textContent = 'minor incident reported';
                    } else {
                        setBadge(supabaseBadge, 'error', '✗ outage');
                        supabaseDetail.textContent = 'major outage / unknown';
                    }
                } catch (err) {
                    setBadge(supabaseBadge, 'error', '✗ unreachable');
                    supabaseDetail.textContent = err.message || 'fetch failed';
                }
            }

            async function checkVercel() {
                // uses serverless proxy: /api/vercel-status
                try {
                    const resp = await fetch('/api/vercel-status', { 
                        signal: AbortSignal.timeout(10000) 
                    });
                    if (!resp.ok) {
                        let msg = `HTTP ${resp.status}`;
                        try {
                            const errData = await resp.json();
                            if (errData.error) msg = errData.error;
                        } catch (_) {}
                        throw new Error(msg);
                    }
                    const data = await resp.json();
                    // expected: { status: 'ok'|'degraded'|'down', message: '...', timestamp: '...' }
                    const status = data.status || 'unknown';
                    const message = data.message || 'no message';
                    if (status === 'ok') {
                        setBadge(vercelBadge, 'ok', '✓ operational');
                        vercelDetail.textContent = message;
                    } else if (status === 'degraded') {
                        setBadge(vercelBadge, 'warn', '⚠ degraded');
                        vercelDetail.textContent = message;
                    } else {
                        setBadge(vercelBadge, 'error', '✗ down');
                        vercelDetail.textContent = message;
                    }
                    if (data.timestamp) updateTimestamp(data.timestamp);
                } catch (err) {
                    setBadge(vercelBadge, 'error', '✗ error');
                    vercelDetail.textContent = err.message || 'proxy fetch failed';
                }
            }

            async function checkGithub() {
                // uses serverless proxy: /api/github-status
                try {
                    const resp = await fetch('/api/github-status', { 
                        signal: AbortSignal.timeout(10000) 
                    });
                    if (!resp.ok) {
                        let msg = `HTTP ${resp.status}`;
                        try {
                            const errData = await resp.json();
                            if (errData.error) msg = errData.error;
                        } catch (_) {}
                        throw new Error(msg);
                    }
                    const data = await resp.json();
                    // expected: { status: 'ok'|'degraded'|'down', message: '...', timestamp: '...' }
                    const status = data.status || 'unknown';
                    const message = data.message || 'no message';
                    if (status === 'ok') {
                        setBadge(githubBadge, 'ok', '✓ operational');
                        githubDetail.textContent = message;
                    } else if (status === 'degraded') {
                        setBadge(githubBadge, 'warn', '⚠ degraded');
                        githubDetail.textContent = message;
                    } else {
                        setBadge(githubBadge, 'error', '✗ down');
                        githubDetail.textContent = message;
                    }
                    if (data.timestamp) updateTimestamp(data.timestamp);
                } catch (err) {
                    setBadge(githubBadge, 'error', '✗ error');
                    githubDetail.textContent = err.message || 'proxy fetch failed';
                }
            }

            // ----- run all probes -----
            async function runAllChecks() {
                // reset to loading
                setBadge(supabaseBadge, 'loading', '⟳ probing');
                setBadge(vercelBadge, 'loading', '⟳ probing');
                setBadge(githubBadge, 'loading', '⟳ probing');
                supabaseDetail.textContent = 'connecting...';
                vercelDetail.textContent = 'connecting...';
                githubDetail.textContent = 'connecting...';
                timestampEl.textContent = '⏱ probing...';

                // run in parallel (supabase independent, vercel+github via proxy)
                await Promise.allSettled([
                    checkSupabase(),
                    checkVercel(),
                    checkGithub()
                ]);

                // ensure timestamp is updated if proxy didn't return one
                const now = new Date().toISOString();
                if (!timestampEl.textContent.includes(':')) {
                    updateTimestamp(now);
                }
            }

            // ----- initial load & interval -----
            runAllChecks();
            setInterval(runAllChecks, 30000); // every 30 seconds
        })();
    </script>
</body>
</html>
