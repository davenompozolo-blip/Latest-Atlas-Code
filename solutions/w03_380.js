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
      font-family: 'Courier New', Courier, monospace;
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
      width: 100%;
      max-width: 820px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .terminal-header {
      background: #161b22;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #30363d;
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
      padding: 24px 20px 20px;
      font-size: 15px;
      line-height: 1.6;
    }
    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 6px;
    }
    .prompt {
      color: #58a6ff;
      font-weight: bold;
      margin-right: 10px;
    }
    .timestamp {
      color: #484f58;
      font-size: 13px;
    }
    .service-name {
      color: #d2a8ff;
      font-weight: 600;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      margin-left: 6px;
    }
    .status-ok {
      background: #1b3a2b;
      color: #3fb950;
      border: 1px solid #3fb950;
    }
    .status-warn {
      background: #3d2e00;
      color: #d29922;
      border: 1px solid #d29922;
    }
    .status-error {
      background: #3d1114;
      color: #f85149;
      border: 1px solid #f85149;
    }
    .status-loading {
      background: #1f2937;
      color: #8b949e;
      border: 1px solid #30363d;
    }
    .detail-line {
      margin-left: 28px;
      color: #8b949e;
      font-size: 14px;
      border-left: 2px solid #21262d;
      padding-left: 14px;
      margin-bottom: 4px;
    }
    .divider {
      border: none;
      border-top: 1px dashed #21262d;
      margin: 16px 0;
    }
    .footer {
      margin-top: 12px;
      color: #484f58;
      font-size: 13px;
      text-align: center;
    }
    .blink {
      animation: blink 1.2s step-end infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .error-message {
      color: #f85149;
      font-size: 13px;
      margin-left: 28px;
    }
    a {
      color: #58a6ff;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
<div class="terminal">
  <div class="terminal-header">
    <span class="terminal-dot dot-red"></span>
    <span class="terminal-dot dot-yellow"></span>
    <span class="terminal-dot dot-green"></span>
    <span class="terminal-title">ATLAS STATUS TERMINAL v1.0</span>
  </div>
  <div class="terminal-body" id="terminalBody">
    <div class="line">
      <span class="prompt">$</span>
      <span>atlas status --live</span>
      <span class="timestamp" id="timestamp">[ --:--:-- ]</span>
    </div>
    <div class="line">
      <span class="prompt">></span>
      <span>initializing health checks ...</span>
    </div>
    <hr class="divider">
    <div id="statusContainer">
      <!-- Supabase -->
      <div class="line">
        <span class="prompt">◆</span>
        <span class="service-name">supabase</span>
        <span id="supabaseBadge" class="status-badge status-loading">checking...</span>
      </div>
      <div id="supabaseDetail" class="detail-line">⏳ querying project status</div>

      <!-- Vercel -->
      <div class="line">
        <span class="prompt">◆</span>
        <span class="service-name">vercel</span>
        <span id="vercelBadge" class="status-badge status-loading">checking...</span>
      </div>
      <div id="vercelDetail" class="detail-line">⏳ fetching deployments</div>

      <!-- GitHub -->
      <div class="line">
        <span class="prompt">◆</span>
        <span class="service-name">github</span>
        <span id="githubBadge" class="status-badge status-loading">checking...</span>
      </div>
      <div id="githubDetail" class="detail-line">⏳ checking API rate & status</div>

      <hr class="divider">
      <div class="line">
        <span class="prompt">■</span>
        <span>system health</span>
        <span id="overallBadge" class="status-badge status-loading">aggregating...</span>
      </div>
      <div id="overallDetail" class="detail-line">waiting for all signals</div>
    </div>
    <div class="footer">
      <span class="blink">▌</span> live · refresh every 30s · <a href="#" id="manualRefresh">force update</a>
    </div>
  </div>
</div>

<script>
  (function() {
    // ---------- configuration ----------
    const API_BASE = '/api';  // Vercel serverless functions

    // ---------- DOM refs ----------
    const timestampEl = document.getElementById('timestamp');
    const supabaseBadge = document.getElementById('supabaseBadge');
    const supabaseDetail = document.getElementById('supabaseDetail');
    const vercelBadge = document.getElementById('vercelBadge');
    const vercelDetail = document.getElementById('vercelDetail');
    const githubBadge = document.getElementById('githubBadge');
    const githubDetail = document.getElementById('githubDetail');
    const overallBadge = document.getElementById('overallBadge');
    const overallDetail = document.getElementById('overallDetail');

    // ---------- helpers ----------
    function updateTimestamp() {
      const now = new Date();
      const time = now.toTimeString().split(' ')[0];
      timestampEl.textContent = `[ ${time} ]`;
    }
    updateTimestamp();
    setInterval(updateTimestamp, 1000);

    function setBadge(el, status, text) {
      el.className = 'status-badge';
      if (status === 'ok') el.classList.add('status-ok');
      else if (status === 'warn') el.classList.add('status-warn');
      else if (status === 'error') el.classList.add('status-error');
      else el.classList.add('status-loading');
      el.textContent = text || status.toUpperCase();
    }

    function setDetail(el, text, isError = false) {
      el.textContent = text;
      if (isError) {
        el.style.color = '#f85149';
      } else {
        el.style.color = '#8b949e';
      }
    }

    // ---------- fetch functions ----------
    async function checkSupabase() {
      setBadge(supabaseBadge, 'loading', 'checking...');
      setDetail(supabaseDetail, '⏳ querying project status');
      try {
        // We use a simple health endpoint: if SUPABASE_URL is set, we can ping it.
        // For demo, we call a relative endpoint that proxies (or we simulate).
        // In production, you'd call /api/supabase-status (not part of this issue, but we simulate)
        // Since issue only specifies vercel-status.js and github-status.js, we simulate supabase as "ok"
        // but we make a real fetch to a known supabase health endpoint (public).
        // If you have a custom endpoint, replace. We'll use https://status.supabase.com/api/v1/status
        const resp = await fetch('https://status.supabase.com/api/v1/status', {
          signal: AbortSignal.timeout(8000)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        // Supabase status API returns { page: { ... }, status: { indicator: "none", description: "All Systems Operational" } }
        const indicator = data?.status?.indicator;
        if (indicator === 'none') {
          setBadge(supabaseBadge, 'ok', 'OPERATIONAL');
          setDetail(supabaseDetail, '✓ all systems nominal · ' + (data.status.description || ''));
        } else if (indicator === 'minor' || indicator === 'major') {
          setBadge(supabaseBadge, 'warn', 'DEGRADED');
          setDetail(supabaseDetail, '⚠️ ' + (data.status.description || 'partial outage'));
        } else {
          setBadge(supabaseBadge, 'error', 'UNKNOWN');
          setDetail(supabaseDetail, '⚠️ unexpected status format', true);
        }
      } catch (err) {
        setBadge(supabaseBadge, 'error', 'UNREACHABLE');
        setDetail(supabaseDetail, '✗ ' + err.message, true);
      }
    }

    async function checkVercel() {
      setBadge(vercelBadge, 'loading', 'checking...');
      setDetail(vercelDetail, '⏳ fetching deployments');
      try {
        const resp = await fetch(`${API_BASE}/vercel-status`, {
          signal: AbortSignal.timeout(10000)
        });
        if (!resp.ok) {
          let msg = 'HTTP ' + resp.status;
          try {
            const errData = await resp.json();
            if (errData.error) msg = errData.error;
          } catch (_) {}
          throw new Error(msg);
        }
        const data = await resp.json();
        // expected: { status: 'ok'|'warn'|'error', message: '...', deployments?: number }
        const status = data.status || 'error';
        const message = data.message || 'no message';
        if (status === 'ok') {
          setBadge(vercelBadge, 'ok', 'HEALTHY');
          setDetail(vercelDetail, `✓ ${message}${data.deployments !== undefined ? ' · ' + data.deployments + ' deployments' : ''}`);
        } else if (status === 'warn') {
          setBadge(vercelBadge, 'warn', 'DEGRADED');
          setDetail(vercelDetail, `⚠️ ${message}`);
        } else {
          setBadge(vercelBadge, 'error', 'FAULT');
          setDetail(vercelDetail, `✗ ${message}`, true);
        }
      } catch (err) {
        setBadge(vercelBadge, 'error', 'UNREACHABLE');
        setDetail(vercelDetail, '✗ ' + err.message, true);
      }
    }

    async function checkGitHub() {
      setBadge(githubBadge, 'loading', 'checking...');
      setDetail(githubDetail, '⏳ checking API rate & status');
      try {
        const resp = await fetch(`${API_BASE}/github-status`, {
          signal: AbortSignal.timeout(10000)
        });
        if (!resp.ok) {
          let msg = 'HTTP ' + resp.status;
          try {
            const errData = await resp.json();
            if (errData.error) msg = errData.error;
          } catch (_) {}
          throw new Error(msg);
        }
        const data = await resp.json();
        // expected: { status: 'ok'|'warn'|'error', message: '...', rate?: { remaining, limit } }
        const status = data.status || 'error';
        const message = data.message || 'no message';
        if (status === 'ok') {
          setBadge(githubBadge, 'ok', 'OPERATIONAL');
          let detail = `✓ ${message}`;
          if (data.rate) {
            detail += ` · API ${data.rate.remaining}/${data.rate.limit}`;
          }
          setDetail(githubDetail, detail);
        } else if (status === 'warn') {
          setBadge(githubBadge, 'warn', 'DEGRADED');
          setDetail(githubDetail, `⚠️ ${message}`);
        } else {
          setBadge(githubBadge, 'error', 'FAULT');
          setDetail(githubDetail, `✗ ${message}`, true);
        }
      } catch (err) {
        setBadge(githubBadge, 'error', 'UNREACHABLE');
        setDetail(githubDetail, '✗ ' + err.message, true);
      }
    }

    function computeOverall() {
      const badges = [supabaseBadge, vercelBadge, githubBadge];
      const statuses = badges.map(el => {
        if (el.classList.contains('status-ok')) return 'ok';
        if (el.classList.contains('status-warn')) return 'warn';
        if (el.classList.contains('status-error')) return 'error';
        return 'loading';
      });
      if (statuses.some(s => s === 'error')) {
        setBadge(overallBadge, 'error', 'CRITICAL');
        setDetail(overallDetail, '✗ one or more services are unreachable or faulty');
      } else if (statuses.some(s => s === 'warn')) {
        setBadge(overallBadge, 'warn', 'DEGRADED');
        setDetail(overallDetail, '⚠️ some services have degraded performance');
      } else if (statuses.every(s => s === 'ok')) {
        setBadge(overallBadge, 'ok', 'ALL CLEAR');
        setDetail(overallDetail, '✓ all monitored services are operational');
      } else {
        setBadge(overallBadge, 'loading', 'PENDING');
        setDetail(overallDetail, '⏳ still gathering data...');
      }
    }

    // ---------- main refresh ----------
    async function refreshAll() {
      // run all in parallel
      await Promise.allSettled([
        checkSupabase(),
        checkVercel(),
        checkGitHub()
      ]);
      computeOverall();
    }

    // initial load
    refreshAll();

    // auto refresh every 30s
    let interval = setInterval(refreshAll, 30000);

    // manual refresh
    document.getElementById('manualRefresh').addEventListener('click', function(e) {
      e.preventDefault();
      clearInterval(interval);
      refreshAll().then(() => {
        interval = setInterval(refreshAll, 30000);
      });
    });

  })();
</script>

<!--
  Serverless functions (Vercel):
  - /api/vercel-status.js
  - /api/github-status.js
  Must be deployed alongside this HTML.
  vercel.json rewrite:
  { "source": "/status", "destination": "/public/status/index.html" }
-->
</body>
</html>
