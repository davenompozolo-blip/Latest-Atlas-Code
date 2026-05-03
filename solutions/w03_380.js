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
      font-family: 'Courier New', 'Fira Code', monospace;
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
      font-size: 14px;
      line-height: 1.6;
    }

    .terminal-header {
      background: #161b22;
      padding: 12px 20px;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #8b949e;
      font-size: 13px;
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
      letter-spacing: 0.5px;
      font-weight: 600;
      color: #58a6ff;
    }

    .terminal-body {
      padding: 24px 24px 32px;
      background: #0d1117;
    }

    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 10px;
      margin-bottom: 10px;
    }

    .prompt {
      color: #58a6ff;
      font-weight: bold;
      white-space: nowrap;
    }

    .cmd {
      color: #f0f6fc;
    }

    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      background: #21262d;
      color: #8b949e;
      border: 1px solid #30363d;
    }

    .status-badge.ok {
      background: #1b3a2d;
      color: #7ee787;
      border-color: #2ea043;
    }

    .status-badge.warn {
      background: #3a2f1b;
      color: #e3b341;
      border-color: #d29922;
    }

    .status-badge.err {
      background: #3d1c1c;
      color: #ff7b72;
      border-color: #da3633;
    }

    .service-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      padding: 8px 12px;
      margin: 4px 0;
      background: #161b22;
      border-radius: 6px;
      border-left: 3px solid #30363d;
    }

    .service-row.ok { border-left-color: #2ea043; }
    .service-row.warn { border-left-color: #d29922; }
    .service-row.err { border-left-color: #da3633; }

    .service-name {
      font-weight: 600;
      color: #f0f6fc;
      min-width: 100px;
    }

    .service-meta {
      color: #8b949e;
      font-size: 13px;
      flex: 1;
    }

    .service-latency {
      color: #7ee787;
      font-size: 12px;
      background: #1b3a2d;
      padding: 0 8px;
      border-radius: 12px;
    }

    .divider {
      border: none;
      border-top: 1px dashed #30363d;
      margin: 18px 0;
    }

    .footer {
      margin-top: 12px;
      color: #484f58;
      font-size: 12px;
      text-align: center;
      border-top: 1px solid #21262d;
      padding-top: 16px;
    }

    .blink {
      animation: blink-anim 1.2s step-end infinite;
    }

    @keyframes blink-anim {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    .cursor {
      display: inline-block;
      width: 8px;
      height: 16px;
      background: #58a6ff;
      margin-left: 4px;
      vertical-align: middle;
    }

    .loading-dots::after {
      content: '...';
      animation: dots 1.5s steps(4, end) infinite;
    }

    @keyframes dots {
      0% { content: ''; }
      25% { content: '.'; }
      50% { content: '..'; }
      75% { content: '...'; }
    }

    @media (max-width: 600px) {
      .terminal-body { padding: 16px; }
      .service-row { flex-direction: column; align-items: flex-start; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="terminal-header">
      <span class="dot red"></span>
      <span class="dot yellow"></span>
      <span class="dot green"></span>
      <span class="terminal-title">ATLAS :: status-terminal v1.0</span>
    </div>
    <div class="terminal-body" id="terminalBody">
      <div class="line">
        <span class="prompt">atlas@status:~$</span>
        <span class="cmd">./healthcheck --live --dashboard</span>
      </div>
      <div class="line">
        <span class="prompt">⏳</span>
        <span class="cmd">initializing probes ...</span>
        <span class="loading-dots"></span>
      </div>
      <hr class="divider">
      <div id="servicesContainer">
        <!-- service rows injected by JS -->
      </div>
      <hr class="divider">
      <div class="line">
        <span class="prompt">atlas@status:~$</span>
        <span class="cmd" id="timestampCmd">last check: <span id="timestamp">--</span></span>
        <span class="cursor blink"></span>
      </div>
      <div class="footer">
        ⚡ live · auto-refresh 30s · <span id="uptimeCounter">0</span>s uptime
      </div>
    </div>
  </div>

  <script>
    (function() {
      'use strict';

      // ---------- configuration ----------
      const REFRESH_INTERVAL = 30000; // 30s
      const STATUS_API_BASE = '/api';  // vercel serverless functions

      // ---------- DOM refs ----------
      const container = document.getElementById('servicesContainer');
      const timestampEl = document.getElementById('timestamp');
      const uptimeEl = document.getElementById('uptimeCounter');

      // ---------- state ----------
      let startTime = Date.now();
      let uptimeInterval = null;

      // ---------- helpers ----------
      function formatLatency(ms) {
        if (ms === null || ms === undefined) return '—';
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
      }

      function statusBadge(status) {
        const map = {
          ok: 'ok',
          healthy: 'ok',
          operational: 'ok',
          degraded: 'warn',
          warning: 'warn',
          error: 'err',
          critical: 'err',
          down: 'err',
        };
        const cls = map[status?.toLowerCase()] || 'warn';
        return `<span class="status-badge ${cls}">${status || 'unknown'}</span>`;
      }

      function serviceRowHTML(name, status, latency, meta) {
        const cls = status?.toLowerCase() === 'ok' || status?.toLowerCase() === 'healthy' || status?.toLowerCase() === 'operational' ? 'ok' : 
                    status?.toLowerCase() === 'degraded' || status?.toLowerCase() === 'warning' ? 'warn' : 'err';
        return `
          <div class="service-row ${cls}">
            <span class="service-name">${name}</span>
            <span class="service-meta">${meta || ''}</span>
            <span class="service-latency">${formatLatency(latency)}</span>
            ${statusBadge(status)}
          </div>
        `;
      }

      // ---------- fetch status from serverless ----------
      async function fetchServiceStatus(service) {
        const endpoints = {
          supabase: `${STATUS_API_BASE}/supabase-status`,
          vercel: `${STATUS_API_BASE}/vercel-status`,
          github: `${STATUS_API_BASE}/github-status`,
        };
        const url = endpoints[service];
        if (!url) return { error: 'unknown service' };

        try {
          const start = performance.now();
          const res = await fetch(url, { cache: 'no-store' });
          const latency = performance.now() - start;
          const data = await res.json();
          return { ...data, latency };
        } catch (err) {
          return { status: 'error', error: err.message || 'fetch failed', latency: null };
        }
      }

      // ---------- render dashboard ----------
      async function refreshDashboard() {
        // show loading state
        container.innerHTML = `
          <div style="padding: 12px; color: #8b949e; text-align: center;">
            <span class="loading-dots">scanning endpoints</span>
          </div>
        `;

        const results = await Promise.allSettled([
          fetchServiceStatus('supabase'),
          fetchServiceStatus('vercel'),
          fetchServiceStatus('github'),
        ]);

        const services = [
          { name: 'Supabase', key: 'supabase' },
          { name: 'Vercel', key: 'vercel' },
          { name: 'GitHub', key: 'github' },
        ];

        let html = '';
        let allOk = true;

        results.forEach((result, idx) => {
          const service = services[idx];
          let status = 'error';
          let latency = null;
          let meta = '';

          if (result.status === 'fulfilled' && result.value) {
            const data = result.value;
            status = data.status || 'unknown';
            latency = data.latency || null;
            // build meta from extra fields
            const extra = [];
            if (data.environment) extra.push(`env:${data.environment}`);
            if (data.region) extra.push(`region:${data.region}`);
            if (data.version) extra.push(`v${data.version}`);
            if (data.message) extra.push(data.message);
            if (data.error) extra.push(`⚠ ${data.error}`);
            meta = extra.join(' · ');
            if (status !== 'ok' && status !== 'healthy' && status !== 'operational') allOk = false;
          } else {
            meta = result.reason?.message || 'unreachable';
            allOk = false;
          }

          html += serviceRowHTML(service.name, status, latency, meta);
        });

        // overall status line
        const overall = allOk ? '✅ all systems operational' : '⚠️  some services degraded';
        const overallBadge = allOk 
          ? '<span class="status-badge ok">healthy</span>' 
          : '<span class="status-badge warn">attention</span>';

        html = `
          <div class="line" style="margin-bottom: 12px;">
            <span class="prompt">🔍</span>
            <span class="cmd">${overall}</span>
            ${overallBadge}
          </div>
          ${html}
        `;

        container.innerHTML = html;
        timestampEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
      }

      // ---------- uptime counter ----------
      function updateUptime() {
        const seconds = Math.floor((Date.now() - startTime) / 1000);
        uptimeEl.textContent = seconds;
      }

      // ---------- init ----------
      function init() {
        // initial fetch
        refreshDashboard();

        // periodic refresh
        setInterval(refreshDashboard, REFRESH_INTERVAL);

        // uptime tick
        updateUptime();
        uptimeInterval = setInterval(updateUptime, 1000);

        // update timestamp every 10s
        setInterval(() => {
          timestampEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
        }, 10000);
      }

      // run after DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  </script>
</body>
</html>
