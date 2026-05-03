<!-- public/status/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ATLAS Status Terminal</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: #0d0d0d;
            color: #00ff9d;
            font-family: 'Courier New', Courier, monospace;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .terminal {
            background: #111;
            border: 1px solid #00ff9d44;
            border-radius: 12px;
            width: 100%;
            max-width: 900px;
            box-shadow: 0 0 30px #00ff9d22;
            overflow: hidden;
        }
        .terminal-header {
            background: #1a1a1a;
            padding: 12px 20px;
            border-bottom: 1px solid #00ff9d33;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            color: #aaa;
        }
        .terminal-header .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }
        .dot.red { background: #ff5f56; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #27c93f; }
        .terminal-title {
            margin-left: auto;
            letter-spacing: 1px;
            font-weight: bold;
            color: #00ff9d;
        }
        .terminal-body {
            padding: 24px 20px;
            font-size: 15px;
            line-height: 1.6;
        }
        .line {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0;
            border-bottom: 1px solid #00ff9d0c;
        }
        .line:last-child {
            border-bottom: none;
        }
        .prompt {
            color: #00ff9d;
            font-weight: bold;
        }
        .service-name {
            min-width: 140px;
            color: #f0f0f0;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: bold;
            letter-spacing: 0.5px;
            background: #222;
        }
        .status-badge.ok {
            background: #00ff9d22;
            color: #00ff9d;
            border: 1px solid #00ff9d66;
        }
        .status-badge.warn {
            background: #ffbd2e22;
            color: #ffbd2e;
            border: 1px solid #ffbd2e66;
        }
        .status-badge.error {
            background: #ff5f5622;
            color: #ff5f56;
            border: 1px solid #ff5f5666;
        }
        .status-badge.loading {
            background: #555;
            color: #aaa;
            border: 1px solid #555;
            animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
        }
        .detail {
            margin-left: auto;
            font-size: 13px;
            color: #888;
            text-align: right;
        }
        .timestamp {
            margin-top: 20px;
            text-align: right;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #00ff9d11;
            padding-top: 16px;
        }
        .error-detail {
            color: #ff5f56;
            font-size: 13px;
            margin-left: 10px;
        }
        .footer {
            margin-top: 12px;
            font-size: 12px;
            color: #555;
            text-align: center;
        }
        .footer a {
            color: #00ff9d88;
            text-decoration: none;
        }
        .footer a:hover {
            color: #00ff9d;
        }
        @media (max-width: 600px) {
            .terminal-body { font-size: 13px; padding: 16px; }
            .service-name { min-width: 100px; }
            .detail { font-size: 11px; }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
            <span class="terminal-title">ATLAS STATUS :: LIVE</span>
        </div>
        <div class="terminal-body" id="statusContainer">
            <div class="line"><span class="prompt">$</span><span class="service-name">supabase</span><span class="status-badge loading" id="supabaseBadge">checking...</span><span class="detail" id="supabaseDetail"></span></div>
            <div class="line"><span class="prompt">$</span><span class="service-name">vercel</span><span class="status-badge loading" id="vercelBadge">checking...</span><span class="detail" id="vercelDetail"></span></div>
            <div class="line"><span class="prompt">$</span><span class="service-name">github</span><span class="status-badge loading" id="githubBadge">checking...</span><span class="detail" id="githubDetail"></span></div>
            <div class="timestamp" id="timestamp">⏱ waiting for update...</div>
            <div class="footer">
                <a href="/">← back to atlas</a> &nbsp;|&nbsp; <span id="counter">0</span>s ago
            </div>
        </div>
    </div>

    <script>
        (function() {
            const SUPABASE_URL = 'https://your-project.supabase.co'; // override via env if needed
            const REFRESH_INTERVAL = 15000; // 15 seconds

            const elements = {
                supabaseBadge: document.getElementById('supabaseBadge'),
                supabaseDetail: document.getElementById('supabaseDetail'),
                vercelBadge: document.getElementById('vercelBadge'),
                vercelDetail: document.getElementById('vercelDetail'),
                githubBadge: document.getElementById('githubBadge'),
                githubDetail: document.getElementById('githubDetail'),
                timestamp: document.getElementById('timestamp'),
                counter: document.getElementById('counter')
            };

            let lastUpdate = Date.now();
            let secondsSinceUpdate = 0;

            function updateCounter() {
                secondsSinceUpdate = Math.floor((Date.now() - lastUpdate) / 1000);
                if (elements.counter) {
                    elements.counter.textContent = secondsSinceUpdate;
                }
            }

            // ---- helpers ----
            function setBadge(el, status, text) {
                if (!el) return;
                el.className = 'status-badge';
                if (status === 'ok') el.classList.add('ok');
                else if (status === 'warn') el.classList.add('warn');
                else if (status === 'error') el.classList.add('error');
                else el.classList.add('loading');
                el.textContent = text || status;
            }

            function setDetail(el, text) {
                if (el) el.textContent = text || '';
            }

            function setTimestamp() {
                const now = new Date();
                const str = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                if (elements.timestamp) {
                    elements.timestamp.textContent = `⏱ last refresh: ${str} UTC`;
                }
                lastUpdate = Date.now();
                updateCounter();
            }

            // ---- fetch functions ----
            async function checkSupabase() {
                // simple health check: try to fetch from supabase (public anon key needed if not using serverless)
                // For demo, we simulate. In production, call your own api/status or direct.
                try {
                    // We'll use a lightweight endpoint: if SUPABASE_URL is set, try /rest/v1/ (needs anon key)
                    // But to keep it simple and avoid CORS issues, we call our own serverless proxy if available.
                    // Here we simulate a fetch to a public health endpoint.
                    const resp = await fetch('/api/vercel-status?service=supabase', { 
                        signal: AbortSignal.timeout(8000) 
                    });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    const data = await resp.json();
                    if (data.status === 'ok') {
                        setBadge(elements.supabaseBadge, 'ok', 'OPERATIONAL');
                        setDetail(elements.supabaseDetail, data.latency ? `${data.latency}ms` : '');
                    } else {
                        setBadge(elements.supabaseBadge, 'warn', 'DEGRADED');
                        setDetail(elements.supabaseDetail, data.message || '');
                    }
                } catch (err) {
                    setBadge(elements.supabaseBadge, 'error', 'UNREACHABLE');
                    setDetail(elements.supabaseDetail, err.message || 'network error');
                }
            }

            async function checkVercel() {
                try {
                    const resp = await fetch('/api/vercel-status', { 
                        signal: AbortSignal.timeout(8000) 
                    });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    const data = await resp.json();
                    if (data.status === 'ok') {
                        setBadge(elements.vercelBadge, 'ok', 'OPERATIONAL');
                        setDetail(elements.vercelDetail, data.latency ? `${data.latency}ms` : '');
                    } else {
                        setBadge(elements.vercelBadge, 'warn', 'DEGRADED');
                        setDetail(elements.vercelDetail, data.message || '');
                    }
                } catch (err) {
                    setBadge(elements.vercelBadge, 'error', 'UNREACHABLE');
                    setDetail(elements.vercelDetail, err.message || 'network error');
                }
            }

            async function checkGithub() {
                try {
                    const resp = await fetch('/api/github-status', { 
                        signal: AbortSignal.timeout(8000) 
                    });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    const data = await resp.json();
                    if (data.status === 'ok') {
                        setBadge(elements.githubBadge, 'ok', 'OPERATIONAL');
                        setDetail(elements.githubDetail, data.latency ? `${data.latency}ms` : '');
                    } else {
                        setBadge(elements.githubBadge, 'warn', 'DEGRADED');
                        setDetail(elements.githubDetail, data.message || '');
                    }
                } catch (err) {
                    setBadge(elements.githubBadge, 'error', 'UNREACHABLE');
                    setDetail(elements.githubDetail, err.message || 'network error');
                }
            }

            async function refreshAll() {
                await Promise.allSettled([
                    checkSupabase(),
                    checkVercel(),
                    checkGithub()
                ]);
                setTimestamp();
            }

            // initial load
            refreshAll();

            // periodic refresh
            setInterval(refreshAll, REFRESH_INTERVAL);

            // update counter every second
            setInterval(updateCounter, 1000);
        })();
    </script>
</body>
</html>
