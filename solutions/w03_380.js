<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Status Terminal</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #0a0a0a;
            color: #00ff41;
            font-family: 'Fira Code', monospace;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .terminal {
            background: #0d0d0d;
            border: 1px solid #00ff41;
            border-radius: 8px;
            padding: 30px;
            max-width: 800px;
            width: 100%;
            box-shadow: 0 0 20px rgba(0, 255, 65, 0.1);
        }

        .header {
            border-bottom: 1px solid #00ff41;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }

        .header h1 {
            font-size: 1.5rem;
            color: #00ff41;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .header .subtitle {
            color: #008f28;
            font-size: 0.8rem;
            margin-top: 5px;
        }

        .status-grid {
            display: grid;
            gap: 20px;
        }

        .status-card {
            border: 1px solid #00ff41;
            border-radius: 4px;
            padding: 15px;
            background: #0a0a0a;
        }

        .status-card h2 {
            font-size: 1rem;
            color: #00ff41;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-card h2 .indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }

        .indicator.online {
            background: #00ff41;
            box-shadow: 0 0 8px #00ff41;
        }

        .indicator.offline {
            background: #ff0040;
            box-shadow: 0 0 8px #ff0040;
        }

        .indicator.warning {
            background: #ffaa00;
            box-shadow: 0 0 8px #ffaa00;
        }

        .status-detail {
            font-size: 0.85rem;
            color: #00cc33;
            line-height: 1.6;
        }

        .status-detail .label {
            color: #008f28;
        }

        .status-detail .value {
            color: #00ff41;
        }

        .error-message {
            color: #ff0040;
            font-size: 0.8rem;
            margin-top: 5px;
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
            padding-top: 15px;
            border-top: 1px solid #00ff41;
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: #008f28;
        }

        .footer .timestamp {
            color: #00cc33;
        }

        @media (max-width: 600px) {
            .terminal {
                padding: 15px;
            }
            .header h1 {
                font-size: 1.2rem;
            }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="header">
            <h1>┌─ ATLAS STATUS TERMINAL ─┐</h1>
            <div class="subtitle">> Live system health monitoring</div>
        </div>
        <div class="status-grid" id="statusGrid">
            <div class="status-card" id="supabaseCard">
                <h2><span class="indicator loading" id="supabaseIndicator"></span> SUPABASE</h2>
                <div class="status-detail" id="supabaseDetail">
                    <span class="loading">> Connecting...</span>
                </div>
            </div>
            <div class="status-card" id="vercelCard">
                <h2><span class="indicator loading" id="vercelIndicator"></span> VERCEL</h2>
                <div class="status-detail" id="vercelDetail">
                    <span class="loading">> Connecting...</span>
                </div>
            </div>
            <div class="status-card" id="githubCard">
                <h2><span class="indicator loading" id="githubIndicator"></span> GITHUB</h2>
                <div class="status-detail" id="githubDetail">
                    <span class="loading">> Connecting...</span>
                </div>
            </div>
        </div>
        <div class="footer">
            <span>ATLAS v1.0.0</span>
            <span class="timestamp" id="timestamp">> Last updated: --</span>
        </div>
    </div>

    <script>
        async function fetchStatus() {
            const timestamp = document.getElementById('timestamp');
            const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
            timestamp.textContent = `> Last updated: ${now}`;

            // Fetch Supabase status (direct check)
            const supabaseCard = document.getElementById('supabaseCard');
            const supabaseIndicator = document.getElementById('supabaseIndicator');
            const supabaseDetail = document.getElementById('supabaseDetail');

            try {
                const supabaseUrl = window.location.origin.includes('localhost') 
                    ? 'http://localhost:3000' 
                    : window.location.origin;
                const response = await fetch(`${supabaseUrl}/api/supabase-status`);
                const data = await response.json();
                
                if (data.status === 'online') {
                    supabaseIndicator.className = 'indicator online';
                    supabaseDetail.innerHTML = `
                        <div><span class="label">> Status:</span> <span class="value">ONLINE</span></div>
                        <div><span class="label">> Response:</span> <span class="value">${data.responseTime || 'N/A'}ms</span></div>
                        <div><span class="label">> Region:</span> <span class="value">${data.region || 'N/A'}</span></div>
                    `;
                } else {
                    supabaseIndicator.className = 'indicator offline';
                    supabaseDetail.innerHTML = `
                        <div><span class="label">> Status:</span> <span class="value">OFFLINE</span></div>
                        <div class="error-message">> ${data.error || 'Connection failed'}</div>
                    `;
                }
            } catch (error) {
                supabaseIndicator.className = 'indicator offline';
                supabaseDetail.innerHTML = `
                    <div><span class="label">> Status:</span> <span class="value">OFFLINE</span></div>
                    <div class="error-message">> ${error.message}</div>
                `;
            }

            // Fetch Vercel status
            const vercelCard = document.getElementById('vercelCard');
            const vercelIndicator = document.getElementById('vercelIndicator');
            const vercelDetail = document.getElementById('vercelDetail');

            try {
                const response = await fetch('/api/vercel-status');
                const data = await response.json();
                
                if (data.status === 'online') {
                    vercelIndicator.className = 'indicator online';
                    vercelDetail.innerHTML = `
                        <div><span class="label">> Status:</span> <span class="value">ONLINE</span></div>
                        <div><span class="label">> Deployments:</span> <span class="value">${data.deployments || 'N/A'}</span></div>
                        <div><span class="label">> Projects:</span> <span class="value">${data.projects || 'N/A'}</span></div>
                    `;
                } else {
                    vercelIndicator.className = 'indicator offline';
                    vercelDetail.innerHTML = `
                        <div><span class="label">> Status:</span> <span class="value">OFFLINE</span></div>
                        <div class="error-message">> ${data.error || 'Connection failed'}</div>
                    `;
                }
            } catch (error) {
                vercelIndicator.className = 'indicator offline';
                vercelDetail.innerHTML = `
                    <div><span class="label">> Status:</span> <span class="value">OFFLINE</span></div>
                    <div class="error-message">> ${error.message}</div>
                `;
            }

            // Fetch GitHub status
            const githubCard = document.getElementById('githubCard');
            const githubIndicator = document.getElementById('githubIndicator');
            const githubDetail = document.getElementById('githubDetail');

            try {
                const response = await fetch('/api/github-status');
                const data = await response.json();
                
                if (data.status === 'online') {
                    githubIndicator.className = 'indicator online';
                    githubDetail.innerHTML = `
                        <div><span class="label">> Status:</span> <span class="value">ONLINE</span></div>
                        <div><span class="label">> Repos:</span> <span class="value">${data.repos || 'N/A'}</span></div>
                        <div><span class="label">> Last Commit:</span> <span class="value">${data.lastCommit || 'N/A'}</span></div>
                    `;
                } else {
                    githubIndicator.className = 'indicator offline';
                    githubDetail.innerHTML = `
                        <div><span class="label">> Status:</span> <span class="value">OFFLINE</span></div>
                        <div class="error-message">> ${data.error || 'Connection failed'}</div>
                    `;
                }
            } catch (error) {
                githubIndicator.className = 'indicator offline';
                githubDetail.innerHTML = `
                    <div><span class="label">> Status:</span> <span class="value">OFFLINE</span></div>
                    <div class="error-message">> ${error.message}</div>
                `;
            }
        }

        // Initial fetch
        fetchStatus();

        // Refresh every 30 seconds
        setInterval(fetchStatus, 30000);
    </script>
</body>
</html>
