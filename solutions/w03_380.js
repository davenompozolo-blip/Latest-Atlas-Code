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
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .terminal-header {
      background: #161b22;
      padding: 14px 20px;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      gap: 12px;
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
      padding: 24px 24px 28px;
      background: #0d1117;
    }
    .line {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 6px 0;
      font-size: 15px;
      line-height: 1.5;
      flex-wrap: wrap;
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
      padding: 2px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.3px;
      background: #21262d;
      color: #8b949e;
      border: 1px solid #30363d;
    }
    .status-ok {
      background: #1b3a2b;
      color: #7ee787;
      border-color: #2ea043;
    }
    .status-warn {
      background: #3d2e00;
      color: #d29922;
      border-color: #bb8009;
    }
    .status-error {
      background: #3d1117;
      color: #ff7b72;
      border-color: #da3633;
    }
    .status-loading {
      background: #1c2128;
      color: #8b949e;
      border-color: #30363d;
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.5; }
      50% { opacity: 1; }
      100% { opacity: 0.5; }
    }
    .separator {
      border: none;
      border-top: 1px dashed #21262d;
      margin: 16px 0;
    }
    .footer-line {
      color: #484f58;
      font-size: 13px;
      margin-top: 12px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .timestamp {
      color: #484f58;
      font-size: 12px;
      margin-top: 8px;
    }
    .service-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      width: 100%;
    }
    .service-name {
      min-width: 100px;
      color: #f0f6fc;
    }
    .latency {
      color: #8b949e;
      font-size: 13px;
      margin-left: auto;
    }
    @media (max-width: 600px) {
      .terminal-body { padding: 16px; }
      .line { font-size: 14px; gap: 8px; }
      .service-name { min-width: 80px; }
    }
  </style>
</head>
<body>
<div class="terminal">
  <div class="terminal-header">
    <span class="terminal-dot dot-red"></span>
    <span class="terminal-dot dot-yellow"></span>
    <span class="terminal-dot dot-green"></span>
    <span class="terminal-title">ATLAS status terminal — v1.0</span>
  </div>
  <div class="terminal-body" id="terminalBody">
    <div class="line"><span class="prompt">➜</span><span class="cmd">~ systemctl status atlas</span></div>
    <div class="line"><span class="prompt">  ⚡</span><span>ATLAS · live health dashboard</span></div>
    <hr class="separator">

    <!-- Supabase -->
    <div class="line" id="supabase-row">
      <span class="prompt">◆</span>
      <span class="service-name">supabase</span>
      <span id="supabase-badge" class="status-badge status-loading">checking...</span>
      <span id="supabase-latency" class="latency"></span>
    </div>

    <!-- Vercel -->
    <div class="line" id="vercel-row">
      <span class="prompt">◆</span>
      <span class="service-name">vercel</span>
      <span id="vercel-badge" class="status-badge status-loading">checking...</span>
      <span id="vercel-latency" class="latency"></span>
    </div>

    <!-- GitHub -->
    <div class="line" id="github-row">
      <span class="prompt">◆</span>
      <span class="service-name">github</span>
      <span id="github-badge" class="status-badge status-loading">checking...</span>
      <span id="github-latency" class="latency"></span>
    </div>

    <hr class="separator">
    <div class="footer-line">
      <span>🔌 endpoints: /api/vercel-status · /api/github-status</span>
    </div>
    <div class="timestamp" id="timestamp">⏱ last refresh: —</div>
  </div>
</div>

<script>
  (function() {
    const TERMINAL = {
      SUPABASE_URL: 'https://api.supabase.com',
      // In production, these are proxied via Vercel serverless functions.
      // For demo/self-contained, we call relative API routes.
    };

    const badgeEls = {
      supabase: document.getElementById('supabase-badge'),
      vercel: document.getElementById('vercel-badge'),
      github: document.getElementById('github-badge'),
    };
    const latencyEls = {
      supabase: document.getElementById('supabase-latency'),
      vercel: document.getElementById('vercel-latency'),
      github: document.getElementById('github-latency'),
    };
    const timestampEl = document.getElementById('timestamp');

    function setBadge(service, status, latency = null) {
      const badge = badgeEls[service];
      const latEl = latencyEls[service];
      if (!badge) return;

      // remove all status classes
      badge.classList.remove('status-ok', 'status-warn', 'status-error', 'status-loading');

      if (status === 'ok') {
        badge.classList.add('status-ok');
        badge.textContent = '● operational';
      } else if (status === 'warn') {
        badge.classList.add('status-warn');
        badge.textContent = '● degraded';
      } else if (status === 'error') {
        badge.classList.add('status-error');
        badge.textContent = '● down';
      } else {
        badge.classList.add('status-loading');
        badge.textContent = 'checking...';
      }

      if (latency !== null && latEl) {
        latEl.textContent = `${latency}ms`;
      } else if (latEl) {
        latEl.textContent = '';
      }
    }

    function updateTimestamp() {
      const now = new Date();
      const str = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      timestampEl.textContent = `⏱ last refresh: ${str}`;
    }

    // --- Supabase health check (direct via fetch to public API) ---
    async function checkSupabase() {
      const start = performance.now();
      try {
        const resp = await fetch('https://api.supabase.com/health', {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
        });
        const latency = Math.round(performance.now() - start);
        if (resp.ok) {
          setBadge('supabase', 'ok', latency);
        } else {
          setBadge('supabase', 'warn', latency);
        }
      } catch (err) {
        const latency = Math.round(performance.now() - start);
        setBadge('supabase', 'error', latency);
      }
    }

    // --- Vercel status (via serverless proxy /api/vercel-status) ---
    async function checkVercel() {
      const start = performance.now();
      try {
        const resp = await fetch('/api/vercel-status', {
          method: 'GET',
          cache: 'no-cache',
        });
        const latency = Math.round(performance.now() - start);
        if (resp.ok) {
          const data = await resp.json();
          // data: { status: 'ok'|'warn'|'error', latency: number }
          if (data && data.status === 'ok') {
            setBadge('vercel', 'ok', data.latency || latency);
          } else if (data && data.status === 'warn') {
            setBadge('vercel', 'warn', data.latency || latency);
          } else {
            setBadge('vercel', 'error', data.latency || latency);
          }
        } else {
          setBadge('vercel', 'error', latency);
        }
      } catch (err) {
        const latency = Math.round(performance.now() - start);
        setBadge('vercel', 'error', latency);
      }
    }

    // --- GitHub status (via serverless proxy /api/github-status) ---
    async function checkGithub() {
      const start = performance.now();
      try {
        const resp = await fetch('/api/github-status', {
          method: 'GET',
          cache: 'no-cache',
        });
        const latency = Math.round(performance.now() - start);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.status === 'ok') {
            setBadge('github', 'ok', data.latency || latency);
          } else if (data && data.status === 'warn') {
            setBadge('github', 'warn', data.latency || latency);
          } else {
            setBadge('github', 'error', data.latency || latency);
          }
        } else {
          setBadge('github', 'error', latency);
        }
      } catch (err) {
        const latency = Math.round(performance.now() - start);
        setBadge('github', 'error', latency);
      }
    }

    // --- initial load ---
    function refreshAll() {
      checkSupabase();
      checkVercel();
      checkGithub();
      updateTimestamp();
    }

    refreshAll();

    // auto-refresh every 30 seconds
    setInterval(refreshAll, 30000);
  })();
</script>

<!--
  ============================================================
  Serverless API stubs (for Vercel deployment)
  Place these in /api/ directory:

  /api/vercel-status.js
  /api/github-status.js

  vercel.json rewrite:
  {
    "rewrites": [
      { "source": "/status", "destination": "/public/status/index.html" }
    ]
  }
  ============================================================
-->

<!-- hidden comment: api/vercel-status.js template -->
<!--
// /api/vercel-status.js
const https = require('https');

module.exports = async (req, res) => {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return res.status(200).json({ status: 'warn', latency: 0, message: 'VERCEL_TOKEN not set' });
  }
  const start = Date.now();
  try {
    const options = {
      hostname: 'api.vercel.com',
      path: '/v1/teams?limit=1',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    const proxyReq = https.request(options, (proxyRes) => {
      const latency = Date.now() - start;
      if (proxyRes.statusCode === 200) {
        res.status(200).json({ status: 'ok', latency });
      } else {
        res.status(200).json({ status: 'warn', latency });
      }
    });
    proxyReq.on('error', () => {
      const latency = Date.now() - start;
      res.status(200).json({ status: 'error', latency });
    });
    proxyReq.end();
  } catch (e) {
    res.status(200).json({ status: 'error', latency: 0 });
  }
};
-->

<!-- hidden comment: api/github-status.js template -->
<!--
// /api/github-status.js
const https = require('https');

module.exports = async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(200).json({ status: 'warn', latency: 0, message: 'GITHUB_TOKEN not set' });
  }
  const start = Date.now();
  try {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/atlas-app/atlas/commits?per_page=1',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'atlas-status-terminal',
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    const proxyReq = https.request(options, (proxyRes) => {
      const latency = Date.now() - start;
      if (proxyRes.statusCode === 200) {
        res.status(200).json({ status: 'ok', latency });
      } else {
        res.status(200).json({ status: 'warn', latency });
      }
    });
    proxyReq.on('error', () => {
      const latency = Date.now() - start;
      res.status(200).json({ status: 'error', latency });
    });
    proxyReq.end();
  } catch (e) {
    res.status(200).json({ status: 'error', latency: 0 });
  }
};
-->

<!-- .env.example additions:
VERCEL_TOKEN=your_vercel_api_token
GITHUB_TOKEN=your_github_personal_access_token
SUPABASE_URL_OVERRIDE=https://your-project.supabase.co
-->
</body>
</html>
