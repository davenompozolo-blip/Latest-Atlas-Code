<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Status Terminal</title>
    <style>
        /* Terminal aesthetic – dark, monospace, green glow */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: #0b0e14;
            color: #b3ffb3;
            font-family: 'Courier New', Courier, monospace;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .terminal {
            background: #0f1219;
            border: 1px solid #2a3a2a;
            border-radius: 12px;
            box-shadow: 0 0 30px rgba(0, 255, 100, 0.1);
            width: 100%;
            max-width: 900px;
            padding: 25px 30px;
            position: relative;
        }
        .terminal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #2a4a2a;
            padding-bottom: 12px;
            margin-bottom: 20px;
            color: #8fbc8f;
            font-size: 0.9rem;
            letter-spacing: 1px;
        }
        .terminal-header .title {
            font-weight: bold;
            color: #a0f0a0;
        }
        .terminal-header .blink {
            animation: blink-anim 1.2s step-end infinite;
            background: #2a5a2a;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 0.7rem;
            text-transform: uppercase;
        }
        @keyframes blink-anim {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
        }
        .card {
            background: #111a1a;
            border: 1px solid #1f3a1f;
            border-radius: 8px;
            padding: 18px 12px 12px 12px;
            transition: 0.2s;
            position: relative;
        }
        .card:hover {
            border-color: #3f7a3f;
            box-shadow: 0 0 12px #1f4a1f;
        }
        .card h3 {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #7fbf7f;
            border-bottom: 1px dashed #2a4a2a;
            padding-bottom: 8px;
            margin-bottom: 12px;
        }
        .stat {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 0.85rem;
            border-bottom: 1px dotted #1f2f1f;
        }
        .stat:last-child {
            border-bottom: none;
        }
        .stat-label {
            color: #8aaa8a;
        }
        .stat-value {
            font-weight: bold;
            color: #d0ffd0;
        }
        .stat-value.ok { color: #6fcf6f; }
        .stat-value.warn { color: #f5b342; }
        .stat-value.err { color: #e66767; }
        .badge {
            display: inline-block;
            background: #1f2f1f;
            padding: 0 8px;
            border-radius: 12px;
            font-size: 0.7rem;
        }
        .footer {
            margin-top: 25px;
            border-top: 1px solid #1f3a1f;
            padding-top: 15px;
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: #5f8f5f;
        }
        .footer .update-info {
            color: #6f9f6f;
        }
        .error-message {
            background: #1f1a1a;
            border-left: 4px solid #e66767;
            padding: 12px;
            margin: 10px 0;
            color: #f5b0b0;
            font-size: 0.8rem;
        }
        .loading {
            text-align: center;
            padding: 30px;
            color: #5f9f5f;
        }
        .loading span {
            animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 0.3; }
            50% { opacity: 1; }
            100% { opacity: 0.3; }
        }
        @media (max-width: 700px) {
            .grid {
                grid-template-columns: 1fr;
                gap: 15px;
            }
            .terminal {
                padding: 15px;
            }
        }
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 6px;
        }
        .status-indicator.green { background: #4caf50; box-shadow: 0 0 8px #4caf50; }
        .status-indicator.yellow { background: #f5b342; box-shadow: 0 0 8px #f5b342; }
        .status-indicator.red { background: #e66767; box-shadow: 0 0 8px #e66767; }
        .status-indicator.gray { background: #5a5a5a; }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <span class="title">⏣ ATLAS STATUS TERMINAL v1.0</span>
            <span class="blink">● live</span>
        </div>

        <div id="dashboard-content">
            <!-- grid will be populated by JS -->
            <div class="loading"><span>⟳ connecting to subsystems ...</span></div>
        </div>

        <div class="footer">
            <span>⎈ /status · health endpoint</span>
            <span class="update-info" id="timestamp">—</span>
        </div>
    </div>

    <script>
        (function() {
            'use strict';

            // ----- configuration (matches .env.example) -----
            // In production these are set via Vercel environment variables.
            // For local dev, you can override with query params ?vercel_token=xxx&github_token=xxx
            const CONFIG = {
                vercelToken: window.VERCEL_TOKEN || '{{VERCEL_TOKEN}}',   // placeholder, replaced by env
                githubToken: window.GITHUB_TOKEN || '{{GITHUB_TOKEN}}',
                // optional overrides for self-hosted or testing
                vercelApiBase: 'https://api.vercel.com',
                githubApiBase: 'https://api.github.com',
                // project identifiers
                vercelProjectId: '{{VERCEL_PROJECT_ID}}',   // override if needed
                githubRepo: '{{GITHUB_REPO}}'               // e.g. 'owner/repo'
            };

            // try to extract from query params (for dev/testing)
            const params = new URLSearchParams(window.location.search);
            if (params.get('vercel_token')) CONFIG.vercelToken = params.get('vercel_token');
            if (params.get('github_token')) CONFIG.githubToken = params.get('github_token');
            // also allow project/repo override
            if (params.get('vercel_project')) CONFIG.vercelProjectId = params.get('vercel_project');
            if (params.get('github_repo')) CONFIG.githubRepo = params.get('github_repo');

            // DOM refs
            const container = document.getElementById('dashboard-content');
            const timestampEl = document.getElementById('timestamp');

            // ----- helper: fetch with timeout & error handling -----
            async function fetchWithTimeout(url, options = {}, timeout = 12000) {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), timeout);
                try {
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal,
                        headers: {
                            'Accept': 'application/json',
                            ...(options.headers || {})
                        }
                    });
                    clearTimeout(id);
                    if (!response.ok) {
                        let errorBody = '';
                        try { errorBody = await response.text(); } catch (_) {}
                        throw new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
                    }
                    return await response.json();
                } catch (err) {
                    clearTimeout(id);
                    throw err;
                }
            }

            // ----- fetch Vercel status (via serverless proxy) -----
            async function fetchVercelStatus() {
                // use internal proxy: /api/vercel-status
                const proxyUrl = '/api/vercel-status';
                // pass token via header (server reads Authorization)
                const data = await fetchWithTimeout(proxyUrl, {
                    headers: {
                        'Authorization': `Bearer ${CONFIG.vercelToken}`,
                        'X-Vercel-Project-Id': CONFIG.vercelProjectId || ''
                    }
                });
                return data;
            }

            // ----- fetch GitHub status (via serverless proxy) -----
            async function fetchGitHubStatus() {
                const proxyUrl = '/api/github-status';
                const data = await fetchWithTimeout(proxyUrl, {
                    headers: {
                        'Authorization': `Bearer ${CONFIG.githubToken}`,
                        'X-GitHub-Repo': CONFIG.githubRepo || ''
                    }
                });
                return data;
            }

            // ----- fetch Supabase status (direct, no token needed for basic health) -----
            async function fetchSupabaseStatus() {
                // Supabase status page is public: https://status.supabase.com/
                // we use their public API: https://status.supabase.com/api/v2/status.json
                const url = 'https://status.supabase.com/api/v2/status.json';
                const data = await fetchWithTimeout(url, {}, 8000);
                return data;
            }

            // ----- render dashboard -----
            function renderDashboard(vercelData, githubData, supabaseData, errors) {
                // build cards
                const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
                timestampEl.textContent = `last update: ${now}`;

                // helper: determine status indicator class
                function indicator(ok) {
                    if (ok === true) return 'green';
                    if (ok === false) return 'red';
                    return 'gray';
                }

                // ----- Vercel card -----
                let vercelOk = null;
                let vercelDeployments = '—';
                let vercelError = null;
                if (errors.vercel) {
                    vercelError = errors.vercel;
                } else if (vercelData) {
                    // expected shape: { ok: boolean, deployments: number, message?: string }
                    vercelOk = vercelData.ok === true;
                    vercelDeployments = (vercelData.deployments !== undefined) ? vercelData.deployments : '—';
                    if (vercelData.message) vercelError = vercelData.message;
                }

                // ----- GitHub card -----
                let githubOk = null;
                let githubStars = '—';
                let githubError = null;
                if (errors.github) {
                    githubError = errors.github;
                } else if (githubData) {
                    githubOk = githubData.ok === true;
                    githubStars = (githubData.stars !== undefined) ? githubData.stars : '—';
                    if (githubData.message) githubError = githubData.message;
                }

                // ----- Supabase card -----
                let supabaseOk = null;
                let supabaseIncidents = '—';
                let supabaseError = null;
                if (errors.supabase) {
                    supabaseError = errors.supabase;
                } else if (supabaseData) {
                    // supabase status API returns: { status: { indicator: "none"|"minor"|"major"|"critical", description } }
                    const indicatorStr = supabaseData?.status?.indicator;
                    supabaseOk = (indicatorStr === 'none');
                    supabaseIncidents = supabaseData?.status?.description || 'all systems operational';
                    if (!supabaseOk && indicatorStr) {
                        supabaseError = `indicator: ${indicatorStr}`;
                    }
                }

                // build HTML
                const html = `
                    <div class="grid">
                        <!-- Vercel -->
                        <div class="card">
                            <h3><span class="status-indicator ${indicator(vercelOk)}"></span> ▲ VERCEL</h3>
                            <div class="stat"><span class="stat-label">health</span><span class="stat-value ${vercelOk === true ? 'ok' : (vercelOk === false ? 'err' : '')}">${vercelOk === true ? 'OPERATIONAL' : (vercelOk === false ? 'DEGRADED' : 'UNKNOWN')}</span></div>
                            <div class="stat"><span class="stat-label">deployments</span><span class="stat-value">${vercelDeployments}</span></div>
                            ${vercelError ? `<div class="error-message">⚠ ${vercelError}</div>` : ''}
                        </div>

                        <!-- GitHub -->
                        <div class="card">
                            <h3><span class="status-indicator ${indicator(githubOk)}"></span> ⌨ GITHUB</h3>
                            <div class="stat"><span class="stat-label">health</span><span class="stat-value ${githubOk === true ? 'ok' : (githubOk === false ? 'err' : '')}">${githubOk === true ? 'OPERATIONAL' : (githubOk === false ? 'DEGRADED' : 'UNKNOWN')}</span></div>
                            <div class="stat"><span class="stat-label">stars</span><span class="stat-value">${githubStars}</span></div>
                            ${githubError ? `<div class="error-message">⚠ ${githubError}</div>` : ''}
                        </div>

                        <!-- Supabase -->
                        <div class="card">
                            <h3><span class="status-indicator ${indicator(supabaseOk)}"></span> ⚡ SUPABASE</h3>
                            <div class="stat"><span class="stat-label">health</span><span class="stat-value ${supabaseOk === true ? 'ok' : (supabaseOk === false ? 'err' : '')}">${supabaseOk === true ? 'OPERATIONAL' : (supabaseOk === false ? 'INCIDENT' : 'UNKNOWN')}</span></div>
                            <div class="stat"><span class="stat-label">status</span><span class="stat-value">${supabaseIncidents}</span></div>
                            ${supabaseError ? `<div class="error-message">⚠ ${supabaseError}</div>` : ''}
                        </div>
                    </div>
                    <div style="font-size:0.7rem; color:#4f7f4f; text-align:right; margin-top:8px;">
                        ⚡ proxies: /api/vercel-status · /api/github-status
                    </div>
                `;
                container.innerHTML = html;
            }

            // ----- main fetch & render loop -----
            async function refreshDashboard() {
                // show loading
                container.innerHTML = `<div class="loading"><span>⟳ polling subsystems ...</span></div>`;

                const errors = { vercel: null, github: null, supabase: null };
                let vercelData = null, githubData = null, supabaseData = null;

                // fetch all three in parallel
                const results = await Promise.allSettled([
                    fetchVercelStatus().catch(err => { errors.vercel = err.message || 'vercel proxy error'; throw err; }),
                    fetchGitHubStatus().catch(err => { errors.github = err.message || 'github proxy error'; throw err; }),
                    fetchSupabaseStatus().catch(err => { errors.supabase = err.message || 'supabase status error'; throw err; })
                ]);

                // assign data if fulfilled
                if (results[0].status === 'fulfilled') vercelData = results[0].value;
                else if (!errors.vercel) errors.vercel = results[0].reason?.message || 'vercel fetch failed';

                if (results[1].status === 'fulfilled') githubData = results[1].value;
                else if (!errors.github) errors.github = results[1].reason?.message || 'github fetch failed';

                if (results[2].status === 'fulfilled') supabaseData = results[2].value;
                else if (!errors.supabase) errors.supabase = results[2].reason?.message || 'supabase fetch failed';

                // render
                renderDashboard(vercelData, githubData, supabaseData, errors);
            }

            // initial load
            refreshDashboard();

            // auto-refresh every 60 seconds
            setInterval(refreshDashboard, 60000);

            // expose for debugging
            window.__refreshStatus = refreshDashboard;
        })();
    </script>
</body>
</html>
