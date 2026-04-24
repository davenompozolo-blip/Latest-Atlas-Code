// Vercel serverless function — proxies GitHub REST API calls.
// GITHUB_TOKEN is optional but raises the rate limit from 60 to 5000 req/hr.
// Uses only built-in Node.js modules (no npm install required).
const https = require('https');

function fetchJSON(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error('Non-JSON response from GitHub API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const owner = process.env.GITHUB_OWNER || 'davenompozolo-blip';
  const repo  = process.env.GITHUB_REPO  || 'Latest-Atlas-Code';
  const token = process.env.GITHUB_TOKEN;

  const headers = {
    Accept:               'application/vnd.github+json',
    'User-Agent':         'ATLAS-Terminal/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const [commitsRes, branchesRes, prsRes] = await Promise.all([
      fetchJSON(`${base}/commits?sha=main&per_page=5`, headers),
      fetchJSON(`${base}/branches?per_page=20`,       headers),
      fetchJSON(`${base}/pulls?state=open`,           headers),
    ]);

    // Surface rate-limit errors clearly
    for (const { status, data } of [commitsRes, branchesRes, prsRes]) {
      if (status === 403 && data.message?.includes('rate limit')) {
        return res.status(200).json({
          error: 'GitHub API rate limit exceeded — add GITHUB_TOKEN to Vercel env vars',
          commits: [], branches: [], openPRs: 0,
        });
      }
      if (status === 404) {
        return res.status(200).json({
          error: `GitHub repo not found: ${owner}/${repo}`,
          commits: [], branches: [], openPRs: 0,
        });
      }
    }

    const commits = Array.isArray(commitsRes.data)
      ? commitsRes.data.map((c) => ({
          sha:    c.sha,
          message: (c.commit?.message || '').split('\n')[0],
          date:   c.commit?.committer?.date || c.commit?.author?.date || null,
          author: c.commit?.author?.name || 'unknown',
        }))
      : [];

    const branches = Array.isArray(branchesRes.data)
      ? branchesRes.data.map((b) => ({
          name:      b.name,
          protected: b.protected || false,
        }))
      : [];

    const openPRs = Array.isArray(prsRes.data) ? prsRes.data.length : 0;

    res.status(200).json({ commits, branches, openPRs });
  } catch (e) {
    res.status(200).json({
      error: e.message,
      commits: [], branches: [], openPRs: 0,
    });
  }
};
