// Diagnostic endpoint: reports which env vars are present at runtime.
// Returns booleans only — never exposes secret values.
// Visit: https://<your-vercel-domain>/api/diag

const KEYS = [
    'SUPABASE_URL',
    'ATLAS_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'ATLAS_SUPABASE_KEY',
    'ALPACA_API_KEY',
    'ALPACA_API_SECRET',
    'ALPACA_PAPER',
    'FINNHUB_API_KEY',
    'FRED_API_KEY',
    'ALPHA_VANTAGE_API_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'ATLAS_ALLOWED_ORIGIN',
    'GITHUB_TOKEN',
    'VERCEL_TOKEN'
];

export default function handler(req, res) {
    var presence = {};
    KEYS.forEach(function (k) {
        var v = process.env[k];
        presence[k] = {
            present: typeof v === 'string' && v.length > 0,
            length: typeof v === 'string' ? v.length : 0
        };
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        ok: true,
        runtime: 'node',
        node_version: process.version,
        vercel_env: process.env.VERCEL_ENV || null,
        vercel_region: process.env.VERCEL_REGION || null,
        env_presence: presence
    });
};
