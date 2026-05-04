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
            background: #0a0a0a;
            color: #00ff88;
            font-family: 'Courier New', Courier, monospace;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .terminal {
            background: #111;
            border: 2px solid #00ff88;
            border-radius: 12px;
            padding: 30px;
            max-width: 800px;
            width: 100%;
            box-shadow: 0 0 30px rgba(0,255,136,0.2);
        }
        .header {
            border-bottom: 1px solid #00ff88;
            padding-bottom: 10px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            font-size: 1.5rem;
            letter-spacing: 2px;
        }
        .blink {
            animation: blink 1s step-end infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }
        .status-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        .status-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }
        .status-card h2 {
            font-size: 1rem;
            margin-bottom: 10px;
            color: #aaa;
        }
        .status-indicator {
            font-size: 2rem;
            margin-bottom: 5px;
        }
        .status-text {
            font-size: 0.9rem;
        }
        .status-ok { color: #00ff88; }
        .status-warn { color: #ffaa00; }
        .status-err { color: #ff3355; }
        .details {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 15px;
            margin-top: 10px;
        }
        .details h3 {
            color: #aaa;
            font-size: 0.9rem;
            margin-bottom: 10px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            border-bottom: 1px solid #222;
            font-size: 0.85rem;
        }
        .detail-row:last-child { border-bottom: none; }
        .footer {
            margin-top: 20px;
            text-align: center;
            color: #555;
            font-size: 0.8rem;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #00ff88;
        }
        .error {
            color: #ff3355;
            text-align: center;
            padding: 20px;
        }
        @media (max-width: 600px) {
            .status-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="header">
            <h1>ATLAS STATUS <span class="blink">_</span></h1>
            <span id="timestamp" style="font-size:0.8rem;color:#888;">--</span>
        </div>
        <div class="status-grid" id="statusGrid">
            <div class="status-card">
                <h2>Supabase</h2>
                <div class="status-indicator" id="supabaseIndicator">⏳</div>
                <div class="status-text" id="supabaseText">Checking...</div>
            </div>
            <div class="status-card">
                <h2>Vercel</h2>
                <div class="status-indicator" id="vercelIndicator">⏳</div>
                <div class="status-text" id="vercelText">Checking...</div>
            </div>
            <div class="status-card">
                <h2>GitHub</h2>
                <div class="status-indicator" id="githubIndicator">⏳</div>
                <div class="status-text" id="githubText">Checking...</div>
            </div>
        </div>
        <div class="details" id="detailsPanel">
            <h3>Details</h3>
            <div id="detailsContent">
                <div class="detail-row"><span>Waiting for data...</span><span></span></div>
            </div>
        </div>
        <div class="footer">
            <span>ATLAS Terminal v1.0 | Live updates every 30s</span>
        </div>
    </div>
    <script>
        (function() {
            const supabaseIndicator = document.getElementById('supabaseIndicator');
            const supabaseText = document.getElementById('supabaseText');
            const vercelIndicator = document.getElementById('vercelIndicator');
            const vercelText = document.getElementById('vercelText');
            const githubIndicator = document.getElementById('githubIndicator');
            const githubText = document.getElementById('githubText');
            const detailsContent = document.getElementById('detailsContent');
            const timestampEl = document.getElementById('timestamp');

            function updateTimestamp() {
                const now = new Date();
                timestampEl.textContent = now.toISOString().replace('T', ' ').slice(0,19) + ' UTC';
            }

            function setStatus(element, text, indicator, ok) {
                if (ok === true) {
                    element.className = 'status-ok';
                    indicator.textContent = '✔';
                } else if (ok === false) {
                    element.className = 'status-err';
                    indicator.textContent = '✘';
                } else {
                    element.className = 'status-warn';
                    indicator.textContent = '⚠';
                }
                element.textContent = text;
            }

            function setDetails(rows) {
                if (!rows || rows.length === 0) {
                    detailsContent.innerHTML = '<div class="detail-row"><span>No details available</span><span></span></div>';
                    return;
                }
                let html = '';
                rows.forEach(r => {
                    html += `<div class="detail-row"><span>${r.label}</span><span>${r.value}</span></div>`;
                });
                detailsContent.innerHTML = html;
            }

            async function fetchStatus() {
                try {
                    // Supabase health check (direct ping to project)
                    let supabaseOk = null;
                    let supabaseMsg = 'Unknown';
                    try {
                        const supabaseResp = await fetch('https://<YOUR_SUPABASE_PROJECT>.supabase.co/rest/v1/', {
                            method: 'HEAD',
                            headers: { 'Accept': 'application/json' }
                        });
                        supabaseOk = supabaseResp.ok;
                        supabaseMsg = supabaseOk ? 'Operational' : `HTTP ${supabaseResp.status}`;
                    } catch (e) {
                        supabaseOk = false;
                        supabaseMsg = 'Unreachable';
                    }
                    setStatus(supabaseText, supabaseMsg, supabaseIndicator, supabaseOk);

                    // Vercel status via serverless function
                    let vercelOk = null;
                    let vercelMsg = 'Unknown';
                    try {
                        const vercelResp = await fetch('/api/vercel-status');
                        if (vercelResp.ok) {
                            const data = await vercelResp.json();
                            vercelOk = data.ok;
                            vercelMsg = data.message || (data.ok ? 'Operational' : 'Degraded');
                        } else {
                            vercelOk = false;
                            vercelMsg = `HTTP ${vercelResp.status}`;
                        }
                    } catch (e) {
                        vercelOk = false;
                        vercelMsg = 'Unreachable';
                    }
                    setStatus(vercelText, vercelMsg, vercelIndicator, vercelOk);

                    // GitHub status via serverless function
                    let githubOk = null;
                    let githubMsg = 'Unknown';
                    try {
                        const githubResp = await fetch('/api/github-status');
                        if (githubResp.ok) {
                            const data = await githubResp.json();
                            githubOk = data.ok;
                            githubMsg = data.message || (data.ok ? 'Operational' : 'Degraded');
                        } else {
                            githubOk = false;
                            githubMsg = `HTTP ${githubResp.status}`;
                        }
                    } catch (e) {
                        githubOk = false;
                        githubMsg = 'Unreachable';
                    }
                    setStatus(githubText, githubMsg, githubIndicator, githubOk);

                    // Build details
                    const details = [
                        { label: 'Supabase Status', value: supabaseMsg },
                        { label: 'Vercel Status', value: vercelMsg },
                        { label: 'GitHub Status', value: githubMsg },
                        { label: 'Last Check', value: new Date().toISOString().slice(0,19) + 'Z' }
                    ];
                    setDetails(details);
                    updateTimestamp();
                } catch (err) {
                    // Fallback error display
                    setStatus(supabaseText, 'Error', supabaseIndicator, false);
                    setStatus(vercelText, 'Error', vercelIndicator, false);
                    setStatus(githubText, 'Error', githubIndicator, false);
                    setDetails([{ label: 'Fatal Error', value: err.message || 'Unknown' }]);
                    updateTimestamp();
                }
            }

            // Initial fetch and then every 30 seconds
            fetchStatus();
            setInterval(fetchStatus, 30000);
        })();
    </script>
</body>
</html>
