<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATLAS Status Terminal</title>
  <style>
    /* Reset & base */
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
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .terminal {
      background: #12171f;
      border: 1px solid #2a3a4a;
      border-radius: 12px;
      box-shadow: 0 0 30px rgba(0, 255, 100, 0.08);
      width: 100%;
      max-width: 820px;
      padding: 1.8rem 1.8rem 2rem;
      position: relative;
    }

    /* scanline effect */
    .terminal::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 255, 100, 0.02) 0px,
        rgba(0, 0, 0, 0.02) 2px,
        transparent 2px,
        transparent 4px
      );
      pointer-events: none;
      border-radius: 12px;
    }

    .header {
      border-bottom: 1px solid #2a4a3a;
      padding-bottom: 0.75rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .header h1 {
      font-size: 1.6rem;
      font-weight: 400;
      letter-spacing: 2px;
      color: #7affb7;
      text-shadow: 0 0 6px #00cc66;
    }

    .header .blink {
      font-size: 0.9rem;
      color: #66dd99;
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { opacity: 0.4; }
      50% { opacity: 1; }
      100% { opacity: 0.4; }
    }

    .grid {
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }

    .service-card {
      background: #0f151e;
      border-left: 4px solid #2a5a3a;
      padding: 1rem 1.2rem;
      border-radius: 0 8px 8px 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      transition: border-color 0.2s;
      box-shadow: 0 2px 0 #1a2a2a;
    }

    .service-card .label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
      font-size: 1.1rem;
      min-width: 140px;
    }

    .service-card .label .icon {
      font-size: 1.4rem;
    }

    .service-card .status-badge {
      font-size: 0.9rem;
      background: #1a2a2a;
      padding: 0.3rem 1rem;
      border-radius: 30px;
      border: 1px solid #2a4a3a;
      color: #b3ffb3;
      letter-spacing: 0.5px;
    }

    .service-card .meta {
      font-size: 0.8rem;
      color: #88bbaa;
      display: flex;
      gap: 1.2rem;
      flex-wrap: wrap;
      margin-top: 0.2rem;
      width: 100%;
    }

    .service-card .meta span {
      background: #1a2626;
      padding: 0.2rem 0.8rem;
      border-radius: 20px;
      border: 1px solid #2a3a3a;
    }

    .status-ok {
      border-left-color: #33cc77;
    }
    .status-ok .status-badge {
      background: #1a3a2a;
      border-color: #33cc77;
      color: #99ffbb;
    }

    .status-warn {
      border-left-color: #e6b800;
    }
    .status-warn .status-badge {
      background: #3a3a1a;
      border-color: #e6b800;
      color: #ffe066;
    }

    .status-error {
      border-left-color: #e65c5c;
    }
    .status-error .status-badge {
      background: #3a1a1a;
      border-color: #e65c5c;
      color: #ff9999;
    }

    .footer {
      margin-top: 1.8rem;
      border-top: 1px solid #1a3a2a;
      padding-top: 1rem;
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #5a8a7a;
      flex-wrap: wrap;
    }

    .footer .timestamp {
      color: #66bb99;
    }

    .loading-dots::after {
      content: '';
      animation: dots 1.5s steps(3, end) infinite;
    }

    @keyframes dots {
      0% { content: ''; }
      33% { content: '.'; }
      66% { content: '..'; }
      100% { content: '...'; }
    }

    .error-message {
      color: #ff8866;
      background: #1a1a1a;
      padding: 0.2rem 0.8rem;
      border-radius: 20px;
      font-size: 0.75rem;
      border: 1px solid #5a3a3a;
    }

    @media (max-width: 550px) {
      .terminal { padding: 1rem; }
      .service-card { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      .service-card .meta { width: 100%; }
    }
  </style>
</head>
<body>
<div class="terminal" role="main" aria-label="ATLAS status terminal dashboard">
  <div class="header">
    <h1>⏣ ATLAS /status</h1>
    <span class="blink">● LIVE</span>
  </div>

  <div class="grid" id="statusGrid">
    <!-- Supabase card -->
    <div class="service-card" id="card-supabase">
      <div class="label">
        <span class="icon">▣</span> Supabase
      </div>
      <span class="status-badge" id="badge-supabase">⟳ probing...</span>
      <div class="meta" id="meta-supabase">
        <span>latency: --</span>
        <span>region: --</span>
      </div>
    </div>

    <!-- Vercel card -->
    <div class="service-card" id="card-vercel">
      <div class="label">
        <span class="icon">▲</span> Vercel
      </div>
      <span class="status-badge" id="badge-vercel">⟳ probing...</span>
      <div class="meta" id="meta-vercel">
        <span>deployments: --</span>
        <span>status: --</span>
      </div>
    </div>

    <!-- GitHub card -->
    <div class="service-card" id="card-github">
      <div class="label">
        <span class="icon">⌘</span> GitHub
      </div>
      <span class="status-badge" id="badge-github">⟳ probing...</span>
      <div class="meta" id="meta-github">
        <span>api: --</span>
        <span>rate limit: --</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <span class="timestamp" id="timestamp">⏱ initializing...</span>
    <span>⎇ ATLAS terminal v0.2</span>
  </div>
</div>

<script>
  (function() {
    'use strict';

    // DOM refs
    const badge = {
      supabase: document.getElementById('badge-supabase'),
      vercel: document.getElementById('badge-vercel'),
      github: document.getElementById('badge-github')
    };
    const meta = {
      supabase: document.getElementById('meta-supabase'),
      vercel: document.getElementById('meta-vercel'),
      github: document.getElementById('meta-github')
    };
    const card = {
      supabase: document.getElementById('card-supabase'),
      vercel: document.getElementById('card-vercel'),
      github: document.getElementById('card-github')
    };
    const timestampEl = document.getElementById('timestamp');

    // helper: update card styling
    function setCardStatus(service, status, badgeText, metaHTML) {
      const b = badge[service];
      const m = meta[service];
      const c = card[service];
      if (!b || !m || !c) return;

      // remove existing status classes
      c.classList.remove('status-ok', 'status-warn', 'status-error');

      if (status === 'ok') {
        c.classList.add('status-ok');
        b.textContent = badgeText || '✓ operational';
      } else if (status === 'warn') {
        c.classList.add('status-warn');
        b.textContent = badgeText || '⚠ degraded';
      } else if (status === 'error') {
        c.classList.add('status-error');
        b.textContent = badgeText || '✗ error';
      } else {
        // loading / unknown
        b.textContent = badgeText || '⟳ ...';
      }

      if (metaHTML) {
        m.innerHTML = metaHTML;
      }
    }

    // fetch with timeout helper
    async function fetchWithTimeout(url, options = {}, timeout = 12000) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    }

    // ---------- Supabase health (direct, no token needed for basic status) ----------
    async function checkSupabase() {
      try {
        // Using Supabase public health endpoint (no token required)
        const resp = await fetchWithTimeout('https://status.supabase.com/api/v1/status', {}, 10000);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        // expected: { status: { indicator: "none", description: "All Systems Operational" } }
        const indicator = data?.status?.indicator || 'unknown';
        const desc = data?.status?.description || 'Operational';
        let status = 'ok';
        let badgeText = '✓ ' + desc;
        if (indicator === 'critical' || indicator === 'major') {
          status = 'error';
          badgeText = '✗ ' + desc;
        } else if (indicator === 'minor') {
          status = 'warn';
          badgeText = '⚠ ' + desc;
        }
        // meta: we don't have latency/region from statuspage, show uptime
        const metaHTML = `<span>indicator: ${indicator}</span><span>updated: ${new Date().toLocaleTimeString()}</span>`;
        setCardStatus('supabase', status, badgeText, metaHTML);
      } catch (err) {
        setCardStatus('supabase', 'error', '✗ unreachable', `<span class="error-message">${err.message || 'fetch error'}</span>`);
      }
    }

    // ---------- Vercel status (proxy via /api/vercel-status) ----------
    async function checkVercel() {
      try {
        const resp = await fetchWithTimeout('/api/vercel-status', {}, 12000);
        if (!resp.ok) {
          let errMsg = `HTTP ${resp.status}`;
          try {
            const errData = await resp.json();
            if (errData.error) errMsg = errData.error;
          } catch (_) {}
          throw new Error(errMsg);
        }
        const data = await resp.json();
        // expected: { deployments: number, status: string, region: string }
        const deployments = data.deployments ?? '--';
        const status = data.status || 'unknown';
        const region = data.region || '--';
        let badgeText = '✓ active';
        let cardStatus = 'ok';
        if (status === 'error' || status === 'critical') {
          cardStatus = 'error';
          badgeText = '✗ ' + status;
        } else if (status === 'degraded' || status === 'warning') {
          cardStatus = 'warn';
          badgeText = '⚠ ' + status;
        }
        const metaHTML = `<span>deployments: ${deployments}</span><span>region: ${region}</span>`;
        setCardStatus('vercel', cardStatus, badgeText, metaHTML);
      } catch (err) {
        setCardStatus('vercel', 'error', '✗ proxy error', `<span class="error-message">${err.message || 'fetch error'}</span>`);
      }
    }

    // ---------- GitHub status (proxy via /api/github-status) ----------
    async function checkGithub() {
      try {
        const resp = await fetchWithTimeout('/api/github-status', {}, 12000);
        if (!resp.ok) {
          let errMsg = `HTTP ${resp.status}`;
          try {
            const errData = await resp.json();
            if (errData.error) errMsg = errData.error;
          } catch (_) {}
          throw new Error(errMsg);
        }
        const data = await resp.json();
        // expected: { api: string, rate_limit_remaining: number, rate_limit_total: number }
        const apiStatus = data.api || 'unknown';
        const rateRemaining = data.rate_limit_remaining ?? '--';
        const rateTotal = data.rate_limit_total ?? '--';
        let badgeText = '✓ operational';
        let cardStatus = 'ok';
        if (apiStatus === 'error' || apiStatus === 'critical') {
          cardStatus = 'error';
          badgeText = '✗ ' + apiStatus;
        } else if (apiStatus === 'degraded' || apiStatus === 'warning') {
          cardStatus = 'warn';
          badgeText = '⚠ ' + apiStatus;
        }
        const metaHTML = `<span>api: ${apiStatus}</span><span>rate: ${rateRemaining}/${rateTotal}</span>`;
        setCardStatus('github', cardStatus, badgeText, metaHTML);
      } catch (err) {
        setCardStatus('github', 'error', '✗ proxy error', `<span class="error-message">${err.message || 'fetch error'}</span>`);
      }
    }

    // update timestamp
    function updateTimestamp() {
      const now = new Date();
      timestampEl.textContent = `⏱ ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${now.toLocaleTimeString()}`;
    }

    // initial load + refresh every 45 seconds
    function refreshAll() {
      checkSupabase();
      checkVercel();
      checkGithub();
      updateTimestamp();
    }

    // first run
    refreshAll();

    // periodic refresh
    setInterval(refreshAll, 45000);

    // also update timestamp every 30s (even if fetch not fired)
    setInterval(updateTimestamp, 30000);

    // expose for debugging
    window.__atlasStatus = { refreshAll, checkSupabase, checkVercel, checkGithub };
  })();
</script>

<!-- serverless function placeholders: api/vercel-status.js and api/github-status.js must exist -->
</body>
</html>
