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
            background: #0a0a0a;
            color: #00ff41;
            font-family: 'Courier New', monospace;
            padding: 20px;
            min-height: 100vh;
        }
        .terminal {
            max-width: 900px;
            margin: 0 auto;
            border: 1px solid #00ff41;
            border-radius: 8px;
            padding: 20px;
            background: #0d0d0d;
            box-shadow: 0 0 20px rgba(0,255,65,0.1);
        }
        .header {
            border-bottom: 1px solid #00ff41;
            padding-bottom: 10px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            font-size: 1.2em;
            letter-spacing: 2px;
        }
        .header .timestamp {
            font-size: 0.8em;
            color: #008f28;
        }
        .service {
            margin-bottom: 15px;
            padding: 10px;
            border-left: 3px solid #00ff41;
            background: #111;
        }
        .service-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        .service-name {
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-badge {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.8em;
        }
        .status-badge.online {
            background: #003b00;
            color: #00ff41;
            border: 1px solid #00ff41;
        }
        .status-badge.offline {
            background: #3b0000;
            color: #ff4141;
            border: 1px solid #ff4141;
        }
        .status-badge.warning {
            background: #3b3b00;
            color: #ffff41;
            border: 1px solid #ffff41;
        }
        .service-detail {
            font-size: 0.85em;
            color: #00aa33;
            margin-top: 5px;
        }
        .service-detail span {
            margin-right: 15px;
        }
        .error {
            color: #ff4141;
        }
        .loading {
            color: #008f28;
            animation: blink 1s infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .footer {
            margin-top: 20px;
            border-top: 1px solid #00ff41;
            padding-top: 10px;
            font-size: 0.75em;
            color: #008f28;
            text-align: center;
        }
        .refresh-btn {
            background: transparent;
            border: 1px solid #00ff41;
            color: #00ff41;
            padding: 5px 15px;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.8em;
            margin-top: 10px;
        }
        .refresh-btn:hover {
            background: #00ff41;
            color: #0a0a0a;
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="header">
            <h1>ATLAS STATUS TERMINAL v1.0</h1>
            <div class="timestamp" id="timestamp">LOADING...</div>
        </div>
        <div id="services">
            <div class="service">
                <div class="service-header">
                    <span class="service-name">SUPABASE</span>
                    <span class="status-badge loading" id="supabase-badge">CHECKING...</span>
                </div>
                <div class="service-detail" id="supabase-detail">
                    <span>Region: --</span>
                    <span>Latency: --</span>
                    <span>Status: --</span>
                </div>
            </div>
            <div class="service">
                <div class="service-header">
                    <span class="service-name">VERCEL</span>
                    <span class="status-badge loading" id="vercel-badge">CHECKING...</span>
                </div>
                <div class="service-detail" id="vercel-detail">
                    <span>Region: --</span>
                    <span>Latency: --</span>
                    <span>Status: --</span>
                </div>
            </div>
            <div class="service">
                <div class="service-header">
                    <span class="service-name">GITHUB</span>
                    <span class="status-badge loading" id="github-badge">CHECKING...</span>
                </div>
                <div class="service-detail" id="github-detail">
                    <span>Region: --</span>
                    <span>Latency: --</span>
                    <span>Status: --</span>
                </div>
            </div>
        </div>
        <div style="text-align: center;">
            <button class="refresh-btn" onclick="fetchStatus()">⟳ REFRESH</button>
        </div>
        <div class="footer">
            ATLAS PROJECT — LIVE MONITORING SYSTEM<br>
            Last updated: <span id="last-updated">--</span>
        </div>
    </div>
    <script>
        async function fetchStatus() {
            const timestamp = document.getElementById('timestamp');
            const lastUpdated = document.getElementById('last-updated');
            const now = new Date();
            timestamp.textContent = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
            lastUpdated.textContent = now.toLocaleString();

            // Supabase check (direct health endpoint)
            const supabaseBadge = document.getElementById('supabase-badge');
            const supabaseDetail = document.getElementById('supabase-detail');
            supabaseBadge.textContent = 'CHECKING...';
            supabaseBadge.className = 'status-badge loading';
            try {
                const start = performance.now();
                const res = await fetch('https://status.supabase.com/api/v1/status');
                const latency = Math.round(performance.now() - start);
                if (res.ok) {
                    const data = await res.json();
                    const status = data.status ? data.status.description : 'Operational';
                    supabaseBadge.textContent = 'ONLINE';
                    supabaseBadge.className = 'status-badge online';
                    supabaseDetail.innerHTML = `<span>Region: Global</span><span>Latency: ${latency}ms</span><span>Status: ${status}</span>`;
                } else {
                    throw new Error('Non-OK response');
                }
            } catch (e) {
                supabaseBadge.textContent = 'OFFLINE';
                supabaseBadge.className = 'status-badge offline';
                supabaseDetail.innerHTML = `<span class="error">Region: --</span><span class="error">Latency: --</span><span class="error">Status: Unreachable</span>`;
            }

            // Vercel check via serverless function
            const vercelBadge = document.getElementById('vercel-badge');
            const vercelDetail = document.getElementById('vercel-detail');
            vercelBadge.textContent = 'CHECKING...';
            vercelBadge.className = 'status-badge loading';
            try {
                const start = performance.now();
                const res = await fetch('/api/vercel-status');
                const latency = Math.round(performance.now() - start);
                if (res.ok) {
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    vercelBadge.textContent = 'ONLINE';
                    vercelBadge.className = 'status-badge online';
                    vercelDetail.innerHTML = `<span>Region: ${data.region || '--'}</span><span>Latency: ${latency}ms</span><span>Status: ${data.status || 'Operational'}</span>`;
                } else {
                    throw new Error('Non-OK response');
                }
            } catch (e) {
                vercelBadge.textContent = 'OFFLINE';
                vercelBadge.className = 'status-badge offline';
                vercelDetail.innerHTML = `<span class="error">Region: --</span><span class="error">Latency: --</span><span class="error">Status: ${e.message}</span>`;
            }

            // GitHub check via serverless function
            const githubBadge = document.getElementById('github-badge');
            const githubDetail = document.getElementById('github-detail');
            githubBadge.textContent = 'CHECKING...';
            githubBadge.className = 'status-badge loading';
            try {
                const start = performance.now();
                const res = await fetch('/api/github-status');
                const latency = Math.round(performance.now() - start);
                if (res.ok) {
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    githubBadge.textContent = 'ONLINE';
                    githubBadge.className = 'status-badge online';
                    githubDetail.innerHTML = `<span>Region: ${data.region || '--'}</span><span>Latency: ${latency}ms</span><span>Status: ${data.status || 'Operational'}</span>`;
                } else {
                    throw new Error('Non-OK response');
                }
            } catch (e) {
                githubBadge.textContent = 'OFFLINE';
                githubBadge.className = 'status-badge offline';
                githubDetail.innerHTML = `<span class="error">Region: --</span><span class="error">Latency: --</span><span class="error">Status: ${e.message}</span>`;
            }
        }

        // Initial fetch
        fetchStatus();
        // Auto-refresh every 60 seconds
        setInterval(fetchStatus, 60000);
    </script>
</body>
</html>
