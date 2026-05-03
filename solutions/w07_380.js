<!-- public/status/index.html -->
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
            letter-spacing: 2px;
            color: #00ff41;
            text-shadow: 0 0 10px rgba(0, 255, 65, 0.5);
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

        .service-card {
            border: 1px solid #00ff41;
            padding: 15px;
            border-radius: 4px;
            background: #0a0a0a;
        }

        .service-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px dashed #00ff41;
        }

        .service-name {
            font-weight: bold;
            font-size: 1.1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-dot.online {
            background: #00ff41;
            box-shadow: 0 0 8px #00ff41;
        }

        .status-dot.offline {
            background: #ff0040;
            box-shadow: 0 0 8px #ff0040;
        }

        .status-dot.warning {
            background: #ffaa00;
            box-shadow: 0 0 8px #ffaa00;
        }

        .status-text {
            font-size: 0.9rem;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 0.85rem;
            color: #00cc33;
        }

        .detail-row .label {
            color: #008f28;
        }

        .detail-row .value {
            color: #00ff41;
        }

        .error-message {
            color: #ff0040;
            font-size: 0.85rem;
            margin-top: 5px;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #00ff41;
            animation: blink 1s infinite;
        }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .timestamp {
            text-align: right;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #00ff41;
            font-size: 0.75rem;
            color: #008f28;
        }

        .footer {
            margin-top: 15px;
            text-align: center;
            font-size: 0.7rem;
            color: #005a1a;
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="header">
            <h1>┌─[ ATLAS STATUS ]─────────────────────────┐</h1>
            <div class="subtitle">> live system health · refresh every 30s</div>
        </div>
        <div id="status-content">
            <div class="loading">> connecting to services...</div>
        </div>
        <div class="timestamp" id="timestamp">> last update: --</div>
        <div class="footer">[ ctrl+c ] to exit · all systems nominal</div>
    </div>

    <script>
        const STATUS_ENDPOINTS = {
            supabase: '/api/status',
            vercel: '/api/vercel-status',
            github: '/api/github-status'
        };

        const SERVICE_NAMES = {
            supabase: 'SUPABASE',
            vercel: 'VERCEL',
            github: 'GITHUB'
        };

        async function fetchServiceStatus(service) {
            const url = STATUS_ENDPOINTS[service];
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                return { error: error.message, status: 'offline' };
            }
        }

        function createServiceCard(service, data) {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.id = `card-${service}`;

            const isError = data.error || data.status === 'offline';
            const statusClass = isError ? 'offline' : (data.status === 'warning' ? 'warning' : 'online');
            const statusText = isError ? 'OFFLINE' : (data.status || 'ONLINE').toUpperCase();

            let detailsHTML = '';
            if (!isError && data) {
                const detailKeys = Object.keys(data).filter(k => k !== 'status' && k !== 'error');
                detailKeys.forEach(key => {
                    let value = data[key];
                    if (typeof value === 'object') {
                        value = JSON.stringify(value);
                    }
                    detailsHTML += `
                        <div class="detail-row">
                            <span class="label">${key.replace(/_/g, ' ').toUpperCase()}</span>
                            <span class="value">${value}</span>
                        </div>
                    `;
                });
            }

            if (data.error) {
                detailsHTML += `<div class="error-message">! ${data.error}</div>`;
            }

            card.innerHTML = `
                <div class="service-header">
                    <span class="service-name">${SERVICE_NAMES[service]}</span>
                    <div class="status-indicator">
                        <span class="status-dot ${statusClass}"></span>
                        <span class="status-text">${statusText}</span>
                    </div>
                </div>
                ${detailsHTML}
            `;

            return card;
        }

        async function updateDashboard() {
            const content = document.getElementById('status-content');
            content.innerHTML = '<div class="loading">> refreshing status...</div>';

            try {
                const [supabaseData, vercelData, githubData] = await Promise.all([
                    fetchServiceStatus('supabase'),
                    fetchServiceStatus('vercel'),
                    fetchServiceStatus('github')
                ]);

                content.innerHTML = '';
                const grid = document.createElement('div');
                grid.className = 'status-grid';

                grid.appendChild(createServiceCard('supabase', supabaseData));
                grid.appendChild(createServiceCard('vercel', vercelData));
                grid.appendChild(createServiceCard('github', githubData));

                content.appendChild(grid);

                const now = new Date();
                document.getElementById('timestamp').textContent = `> last update: ${now.toLocaleString()}`;
            } catch (error) {
                content.innerHTML = `<div class="error-message">! FATAL: ${error.message}</div>`;
            }
        }

        // Initial load
        updateDashboard();

        // Refresh every 30 seconds
        setInterval(updateDashboard, 30000);
    </script>
</body>
</html>
