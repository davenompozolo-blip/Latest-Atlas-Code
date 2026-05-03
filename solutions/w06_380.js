<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Status Terminal</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #0a0a0a;
            color: #00ff41;
            font-family: 'JetBrains Mono', monospace;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .terminal {
            background: #0d0d0d;
            border: 1px solid #1a1a1a;
            border-radius: 8px;
            width: 100%;
            max-width: 900px;
            box-shadow: 0 0 40px rgba(0, 255, 65, 0.05);
            overflow: hidden;
        }

        .terminal-header {
            background: #1a1a1a;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid #2a2a2a;
        }

        .terminal-dots {
            display: flex;
            gap: 8px;
        }

        .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }

        .dot.red { background: #ff5f56; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #27c93f; }

        .terminal-title {
            color: #888;
            font-size: 14px;
            font-weight: 300;
            letter-spacing: 1px;
        }

        .terminal-body {
            padding: 24px;
        }

        .status-line {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid #1a1a1a;
            font-size: 14px;
        }

        .status-line:last-child {
            border-bottom: none;
        }

        .indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .indicator.online {
            background: #00ff41;
            box-shadow: 0 0 8px #00ff41;
        }

        .indicator.offline {
            background: #ff3355;
            box-shadow: 0 0 8px #ff3355;
        }

        .indicator.warning {
            background: #ffaa00;
            box-shadow: 0 0 8px #ffaa00;
        }

        .service-name {
            color: #00ff41;
            font-weight: 700;
            min-width: 100px;
        }

        .service-status {
            color: #aaa;
            flex: 1;
        }

        .service-time {
            color: #666;
            font-size: 12px;
            min-width: 80px;
            text-align: right;
        }

        .section-title {
            color: #555;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            padding: 16px 0 8px 0;
            border-bottom: 1px solid #1a1a1a;
            margin-top: 16px;
        }

        .section-title:first-of-type {
            margin-top: 0;
        }

        .blink {
            animation: blink 1s step-end infinite;
        }

        @keyframes blink {
            50% { opacity: 0; }
        }

        .cursor {
            display: inline-block;
            width: 8px;
            height: 16px;
            background: #00ff41;
            margin-left: 4px;
            vertical-align: middle;
        }

        .loading-text {
            color: #555;
            font-size: 13px;
        }

        .error-text {
            color: #ff3355;
        }

        .timestamp {
            color: #444;
            font-size: 11px;
            margin-top: 20px;
            padding-top: 12px;
            border-top: 1px solid #1a1a1a;
        }

        @media (max-width: 600px) {
            .terminal-body {
                padding: 16px;
            }
            .status-line {
                flex-wrap: wrap;
                gap: 6px;
                font-size: 13px;
            }
            .service-name {
                min-width: 80px;
            }
            .service-time {
                min-width: auto;
            }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <div class="terminal-dots">
                <div class="dot red"></div>
                <div class="dot yellow"></div>
                <div class="dot green"></div>
            </div>
            <div class="terminal-title">ATLAS STATUS TERMINAL v1.0</div>
        </div>
        <div class="terminal-body" id="terminalBody">
            <div class="section-title">// SYSTEM STATUS</div>
            <div id="statusContainer">
                <div class="loading-text">Connecting to services...</div>
            </div>
            <div class="timestamp" id="timestamp">Last updated: --</div>
        </div>
    </div>

    <script>
        const STATUS_ENDPOINTS = {
            supabase: '/api/vercel-status?service=supabase',
            vercel: '/api/vercel-status?service=vercel',
            github: '/api/github-status'
        };

        const SERVICE_NAMES = {
            supabase: 'SUPABASE',
            vercel: 'VERCEL',
            github: 'GITHUB'
        };

        const container = document.getElementById('statusContainer');
        const timestampEl = document.getElementById('timestamp');

        function createStatusLine(service, indicatorClass, statusText, timeText) {
            const div = document.createElement('div');
            div.className = 'status-line';
            div.innerHTML = `
                <div class="indicator ${indicatorClass}"></div>
                <div class="service-name">${SERVICE_NAMES[service] || service.toUpperCase()}</div>
                <div class="service-status">${statusText}</div>
                <div class="service-time">${timeText}</div>
            `;
            return div;
        }

        function formatTime(isoString) {
            if (!isoString) return '--';
            const d = new Date(isoString);
            return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        function getTimeAgo(isoString) {
            if (!isoString) return '';
            const diff = Date.now() - new Date(isoString).getTime();
            const seconds = Math.floor(diff / 1000);
            if (seconds < 60) return `${seconds}s ago`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            return `${hours}h ago`;
        }

        async function fetchStatus() {
            container.innerHTML = '<div class="loading-text">⏳ Fetching live status...</div>';

            const results = await Promise.allSettled([
                fetch(STATUS_ENDPOINTS.supabase).then(r => r.json()),
                fetch(STATUS_ENDPOINTS.vercel).then(r => r.json()),
                fetch(STATUS_ENDPOINTS.github).then(r => r.json())
            ]);

            const services = ['supabase', 'vercel', 'github'];
            container.innerHTML = '';

            let allOk = true;
            let latestTimestamp = null;

            results.forEach((result, index) => {
                const service = services[index];
                let indicatorClass = 'offline';
                let statusText = 'OFFLINE / ERROR';
                let timeText = '--';

                if (result.status === 'fulfilled' && result.value) {
                    const data = result.value;
                    if (data.status === 'ok' || data.status === 'online') {
                        indicatorClass = 'online';
                        statusText = 'ONLINE';
                        allOk = false;
                    } else if (data.status === 'degraded' || data.status === 'warning') {
                        indicatorClass = 'warning';
                        statusText = 'DEGRADED';
                        allOk = false;
                    } else {
                        indicatorClass = 'offline';
                        statusText = 'OFFLINE';
                        allOk = false;
                    }

                    if (data.timestamp) {
                        timeText = getTimeAgo(data.timestamp);
                        if (!latestTimestamp || data.timestamp > latestTimestamp) {
                            latestTimestamp = data.timestamp;
                        }
                    }

                    if (data.message) {
                        statusText += ` — ${data.message}`;
                    }
                } else {
                    statusText = 'FETCH ERROR';
                    allOk = false;
                }

                container.appendChild(createStatusLine(service, indicatorClass, statusText, timeText));
            });

            // Overall status header
            const overallDiv = document.createElement('div');
            overallDiv.style.cssText = 'padding: 8px 0; margin-bottom: 8px; font-size: 13px; color: #888;';
            if (allOk) {
                overallDiv.innerHTML = '✅ ALL SYSTEMS OPERATIONAL';
                overallDiv.style.color = '#00ff41';
            } else {
                overallDiv.innerHTML = '⚠️ SOME SYSTEMS DEGRADED';
                overallDiv.style.color = '#ffaa00';
            }
            container.prepend(overallDiv);

            if (latestTimestamp) {
                timestampEl.textContent = `Last updated: ${formatTime(latestTimestamp)} (${getTimeAgo(latestTimestamp)})`;
            } else {
                timestampEl.textContent = `Last updated: ${formatTime(new Date().toISOString())}`;
            }
        }

        // Initial fetch
        fetchStatus();

        // Refresh every 30 seconds
        setInterval(fetchStatus, 30000);
    </script>
</body>
</html>
