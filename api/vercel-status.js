// Vercel serverless function — proxies Vercel REST API to protect VERCEL_TOKEN.
// Uses only built-in Node.js modules (no npm install required).
const https = require('https');

function fetchJSON(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error('Non-JSON response from Vercel API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return res.status(200).json({
      error: 'VERCEL_TOKEN not configured — add it in Vercel dashboard → Settings → Environment Variables',
      deployments: [],
      latest: null,
    });
  }

  try {
    const teamId = process.env.VERCEL_TEAM_ID;
    const qs     = teamId ? `?limit=5&teamId=${encodeURIComponent(teamId)}` : '?limit=5';

    const { status, data } = await fetchJSON(
      `https://api.vercel.com/v6/deployments${qs}`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    );

    if (status !== 200) {
      return res.status(200).json({ error: `Vercel API returned HTTP ${status}`, deployments: [], latest: null });
    }

    const deployments = (data.deployments || []).map((d) => ({
      uid:        d.uid,
      name:       d.name,
      url:        d.url,
      state:      d.state,
      target:     d.target,
      meta:       d.meta || {},
      createdAt:  d.createdAt,
      buildingAt: d.buildingAt,
      ready:      d.ready,
    }));

    res.status(200).json({ deployments, latest: deployments[0] || null });
  } catch (e) {
    res.status(200).json({ error: e.message, deployments: [], latest: null });
  }
};
