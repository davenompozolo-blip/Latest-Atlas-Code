<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATLAS · status terminal</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: #0b0e14;
      color: #b3ffc6;
      font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .terminal {
      background: #0d1117;
      border: 1px solid #2b3b4a;
      border-radius: 14px;
      box-shadow: 0 0 30px rgba(0, 255, 170, 0.08);
      width: 100%;
      max-width: 820px;
      padding: 1.8rem 2rem 2.2rem;
      transition: box-shadow 0.2s;
    }

    .terminal:hover {
      box-shadow: 0 0 40px rgba(0, 255, 170, 0.15);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid #2a3a44;
      padding-bottom: 0.6rem;
      margin-bottom: 1.6rem;
      color: #8affc1;
      font-weight: 500;
      letter-spacing: 0.3px;
    }

    .header-left {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .header-left span:first-child {
      color: #7ec8a0;
      font-weight: 600;
    }

    .blink {
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.3; }
      100% { opacity: 1; }
    }

    .timestamp {
      font-size: 0.8rem;
      color: #6f8f88;
      background: #1a262e;
      padding: 0.2rem 0.8rem;
      border-radius: 30px;
    }

    .grid {
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }

    .service-row {
      background: #0f171f;
      border-left: 4px solid #2f4d4a;
      padding: 0.9rem 1.2rem;
      border-radius: 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      transition: 0.15s;
    }

    .service-row:hover {
      background: #131e28;
      border-left-color: #4dba87;
    }

    .service-name {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
      font-size: 1.05rem;
      min-width: 140px;
    }

    .service-name i {
      font-style: normal;
      display: inline-block;
      width: 22px;
      color: #6f9f8a;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1a2a2e;
      padding: 0.2rem 1rem 0.2rem 0.8rem;
      border-radius: 40px;
      font-size: 0.85rem;
      letter-spacing: 0.2px;
    }

    .dot {
      height: 12px;
      width: 12px;
      border-radius: 50%;
      display: inline-block;
      background: #3f5b5a;
      transition: background 0.2s;
    }

    .dot.ok {
      background: #2ed573;
      box-shadow: 0 0 8px #2ed57388;
    }

    .dot.warn {
      background: #f9ca24;
      box-shadow: 0 0 8px #f9ca2488;
    }

    .dot.err {
      background: #ff6b6b;
      box-shadow: 0 0 8px #ff6b6b88;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 20px;
      font-size: 0.8rem;
      color: #8baaa2;
    }

    .meta .label {
      color: #5f7d78;
      margin-right: 2px;
    }

    .meta .value {
      color: #b3e6d4;
      font-weight: 450;
    }

    .footer {
      margin-top: 2rem;
      border-top: 1px solid #1f3138;
      padding-top: 1rem;
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #4b6b66;
    }

    .footer a {
      color: #6bb59a;
      text-decoration: none;
      border-bottom: 1px dotted #2f5a4e;
    }

    .footer a:hover {
      color: #b3ffd6;
    }

    .loading-text {
      color: #4f7a72;
      animation: pulse 1.2s infinite;
    }

    @media (max-width: 600px) {
      .terminal { padding: 1.2rem; }
      .service-row { flex-direction: column; align-items: flex-start; gap: 8px; }
      .meta { width: 100%; justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="terminal" role="main">
    <div class="header">
      <div class="header-left">
        <span>⏣</span>
        <span>ATLAS</span>
        <span style="color:#4f7f72;">/status</span>
        <span class="blink" style="margin-left:6px;">▍</span>
      </div>
      <div class="timestamp" id="liveTimestamp">⏱ LOADING</div>
    </div>

    <div class="grid" id="statusGrid">
      <!-- SUPABASE -->
      <div class="service-row" data-service="supabase">
        <div class="service-name">
          <i>◈</i> Supabase
          <span class="status-badge"><span class="dot" id="dot-supabase"></span><span id="label-supabase">checking</span></span>
        </div>
        <div class="meta">
          <span><span class="label">region</span> <span class="value" id="supabase-region">—</span></span>
          <span><span class="label">project</span> <span class="value" id="supabase-project">—</span></span>
          <span><span class="label">status</span> <span class="value" id="supabase-status-text">—</span></span>
        </div>
      </div>

      <!-- VERCEL -->
      <div class="service-row" data-service="vercel">
        <div class="service-name">
          <i>◈</i> Vercel
          <span class="status-badge"><span class="dot" id="dot-vercel"></span><span id="label-vercel">checking</span></span>
        </div>
        <div class="meta">
          <span><span class="label">deployments</span> <span class="value" id="vercel-deployments">—</span></span>
          <span><span class="label">latest</span> <span class="value" id="vercel-latest">—</span></span>
        </div>
      </div>

      <!-- GITHUB -->
      <div class="service-row" data-service="github">
        <div class="service-name">
          <i>◈</i> GitHub
          <span class="status-badge"><span class="dot" id="dot-github"></span><span id="label-github">checking</span></span>
        </div>
        <div class="meta">
          <span><span class="label">commits</span> <span class="value" id="github-commits">—</span></span>
          <span><span class="label">open issues</span> <span class="value" id="github-issues">—</span></span>
          <span><span class="label">stars</span> <span class="value" id="github-stars">—</span></span>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>⏲ <span id="footer-refresh">auto</span></span>
      <span><a href="https://github.com/atlas-project/status" target="_blank" rel="noopener">github/atlas-status</a> · v0.2.0</span>
    </div>
  </div>

  <script>
    (function() {
      'use strict';

      // ---------- DOM refs ----------
      const $ = id => document.getElementById(id);
      const dot = {
        supabase: $('dot-supabase'),
        vercel: $('dot-vercel'),
        github: $('dot-github'),
      };
      const label = {
        supabase: $('label-supabase'),
        vercel: $('label-vercel'),
        github: $('label-github'),
      };

      // ---------- helpers ----------
      function setStatus(service, ok, text) {
        const d = dot[service];
        const l = label[service];
        if (!d || !l) return;
        d.className = 'dot ' + (ok === true ? 'ok' : ok === null ? 'warn' : 'err');
        l.textContent = text || (ok ? 'operational' : 'degraded');
      }

      function setMeta(id, val) {
        const el = $(id);
        if (el) el.textContent = val ?? '—';
      }

      function updateTimestamp() {
        const ts = $('liveTimestamp');
        if (ts) {
          const now = new Date();
          ts.textContent = '⏱ ' + now.toISOString().replace(/T/, ' ').replace(/\.\d+Z/, ' UTC');
        }
      }

      // ---------- fetch with timeout ----------
      async function fetchWithTimeout(url, timeout = 12000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(id);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.json();
        } catch (e) {
          clearTimeout(id);
          throw e;
        }
      }

      // ---------- load all statuses ----------
      async function loadAll() {
        // set loading placeholders
        setStatus('supabase', null, '…');
        setStatus('vercel', null, '…');
        setStatus('github', null, '…');
        setMeta('supabase-region', '…');
        setMeta('supabase-project', '…');
        setMeta('supabase-status-text', '…');
        setMeta('vercel-deployments', '…');
        setMeta('vercel-latest', '…');
        setMeta('github-commits', '…');
        setMeta('github-issues', '…');
        setMeta('github-stars', '…');

        const results = await Promise.allSettled([
          fetchWithTimeout('/api/vercel-status'),
          fetchWithTimeout('/api/github-status'),
          // Supabase health via public API (no token needed for basic status)
          fetchWithTimeout('https://status.supabase.com/api/v2/status.json').catch(() => null),
        ]);

        // --- SUPABASE (index 2) ---
        const supabaseRaw = results[2];
        if (supabaseRaw.status === 'fulfilled' && supabaseRaw.value) {
          try {
            const data = supabaseRaw.value;
            const indicator = data?.status?.indicator; // 'none' | 'minor' | 'major' | 'critical'
            const description = data?.status?.description || 'unknown';
            const ok = indicator === 'none';
            setStatus('supabase', ok, ok ? 'operational' : description);
            setMeta('supabase-region', 'global');
            setMeta('supabase-project', 'shared');
            setMeta('supabase-status-text', description);
          } catch (e) {
            setStatus('supabase', false, 'parse error');
            setMeta('supabase-status-text', 'error');
          }
        } else {
          setStatus('supabase', false, 'unreachable');
          setMeta('supabase-status-text', 'offline');
        }

        // --- VERCEL (index 0) ---
        const vercelRaw = results[0];
        if (vercelRaw.status === 'fulfilled' && vercelRaw.value) {
          try {
            const d = vercelRaw.value;
            const ok = d.ok === true;
            setStatus('vercel', ok, ok ? 'operational' : (d.error || 'degraded'));
            setMeta('vercel-deployments', d.deployments ?? '—');
            setMeta('vercel-latest', d.latestDeployment ?? '—');
          } catch (e) {
            setStatus('vercel', false, 'bad response');
          }
        } else {
          setStatus('vercel', false, 'API error');
          setMeta('vercel-deployments', 'err');
        }

        // --- GITHUB (index 1) ---
        const githubRaw = results[1];
        if (githubRaw.status === 'fulfilled' && githubRaw.value) {
          try {
            const d = githubRaw.value;
            const ok = d.ok === true;
            setStatus('github', ok, ok ? 'operational' : (d.error || 'degraded'));
            setMeta('github-commits', d.commits ?? '—');
            setMeta('github-issues', d.openIssues ?? '—');
            setMeta('github-stars', d.stars ?? '—');
          } catch (e) {
            setStatus('github', false, 'bad response');
          }
        } else {
          setStatus('github', false, 'API error');
          setMeta('github-commits', 'err');
        }

        // final timestamp
        updateTimestamp();
        const refreshEl = $('footer-refresh');
        if (refreshEl) refreshEl.textContent = new Date().toLocaleTimeString();
      }

      // ---------- init & interval ----------
      loadAll();
      setInterval(loadAll, 45_000);   // refresh every 45s
      setInterval(updateTimestamp, 15_000);  // keep timestamp fresh
      updateTimestamp();
    })();
  </script>
</body>
</html>
