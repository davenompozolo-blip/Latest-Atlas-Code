// ============================================================
// ATLAS Terminal — SQL Terminal
// ------------------------------------------------------------
// Interactive Supabase query interface. Wired into the main
// TABS registry in app.js as a first-class SYSTEM page.
//
// Features:
//   • SQL editor (JetBrains Mono, Ctrl+Enter to run)
//   • Read-only enforcement (client + DB-level via run_read_sql RPC)
//   • Schema sidebar (collapsible table/column browser)
//   • Sortable results table + CSV export
//   • Saved queries (Supabase-backed, pin/load/delete)
//   • 10 pre-seeded starter queries using real table names
//   • Query history (session, last 50)
//   • "Route to Supabase" — materialize results as insight_ tables
// ============================================================

import { sb, SUPABASE_URL } from './config.js';

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const h = React.createElement;

// ── Safety ────────────────────────────────────────────────────────────────────
const WRITE_KW = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE)\b/i;
const SYS_KW   = /\b(pg_catalog|pg_class|pg_proc|pg_stat_activity|pg_toast)\b/i;
const DEFAULT_LIMIT = 10000;

function validateSql(sql) {
    const s = sql.trim();
    if (!s) return 'Query is empty.';
    const m = WRITE_KW.exec(s);
    if (m) return `'${m[0].toUpperCase()}' is not permitted — SQL Terminal is read-only.`;
    if (SYS_KW.test(s)) return 'Access to pg system catalogues is restricted.';
    return null;
}

function ensureLimit(sql) {
    const s = sql.trimEnd().replace(/;+$/, '');
    return /\bLIMIT\b/i.test(s) ? s : `${s}\nLIMIT ${DEFAULT_LIMIT}`;
}

// ── Supabase calls ────────────────────────────────────────────────────────────
async function execSql(sql) {
    if (!sb) return { ok: false, rows: [], columns: [], ms: 0, err: 'No Supabase connection. Configure your API key.' };
    const t0 = Date.now();
    try {
        const { data, error } = await sb.rpc('run_read_sql', { sql_text: sql });
        const ms = Date.now() - t0;
        if (error) return { ok: false, rows: [], columns: [], ms, err: error.message };
        const rows = Array.isArray(data) ? data : (data ? [data] : []);
        const columns = rows.length ? Object.keys(rows[0]) : [];
        return { ok: true, rows, columns, ms, err: null };
    } catch (e) {
        return { ok: false, rows: [], columns: [], ms: Date.now() - t0, err: String(e) };
    }
}

async function logQuery(sql, ms, rowCount, err) {
    if (!sb) return;
    try {
        await sb.from('query_log').insert({ sql_text: sql.slice(0, 4000), execution_time_ms: ms, row_count: rowCount, error: err });
    } catch (_) {}
}

async function fetchSchema() {
    const r = await execSql(
        "SELECT table_name, column_name, data_type FROM information_schema.columns " +
        "WHERE table_schema='public' ORDER BY table_name, ordinal_position"
    );
    const schema = {};
    for (const row of r.rows) {
        (schema[row.table_name] = schema[row.table_name] || [])
            .push({ name: row.column_name, type: row.data_type });
    }
    return schema;
}

async function loadSavedQueries() {
    if (!sb) return [];
    const { data } = await sb.from('saved_queries').select('*')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
    return data || [];
}

async function saveQuery(name, description, sql_text, tags) {
    if (!sb) return false;
    const { error } = await sb.from('saved_queries').insert({ name, description, sql_text, tags });
    return !error;
}

async function deleteQuery(id) {
    if (!sb) return;
    await sb.from('saved_queries').delete().eq('id', id);
}

async function togglePin(id, pinned) {
    if (!sb) return;
    await sb.from('saved_queries').update({ is_pinned: pinned }).eq('id', id);
}

// ── Starter queries (real column/table names verified against live schema) ────
const STARTERS = [
    {
        name: 'Current Open Positions',
        description: 'Live holdings with symbol & asset metadata',
        tags: ['positions', 'holdings'],
        is_pinned: true,
        sql_text:
`SELECT
  a.symbol,
  a.name,
  a.asset_class,
  a.sector,
  p.quantity,
  p.average_cost,
  p.market_value,
  ROUND((p.market_value - p.quantity * p.average_cost)::numeric, 2) AS unrealized_pl,
  p.as_of_date
FROM positions p
JOIN assets a ON a.id = p.asset_id
WHERE p.quantity > 0
ORDER BY p.market_value DESC
LIMIT 50;`,
    },
    {
        name: 'Top Transactions by Notional',
        description: 'Largest trades — quantity × price',
        tags: ['transactions', 'trades'],
        is_pinned: true,
        sql_text:
`SELECT
  a.symbol,
  t.transaction_type,
  t.quantity,
  t.price,
  ROUND((t.quantity * t.price)::numeric, 2) AS notional_value,
  t.fees,
  t.transaction_date
FROM transactions t
JOIN assets a ON a.id = t.asset_id
ORDER BY notional_value DESC
LIMIT 30;`,
    },
    {
        name: 'Transaction Volume by Symbol',
        description: 'Trade count and total notional per ticker',
        tags: ['transactions', 'activity'],
        sql_text:
`SELECT
  a.symbol,
  COUNT(*) AS trades,
  SUM(CASE WHEN t.transaction_type='buy'  THEN 1 ELSE 0 END) AS buys,
  SUM(CASE WHEN t.transaction_type='sell' THEN 1 ELSE 0 END) AS sells,
  ROUND(SUM(t.quantity * t.price)::numeric, 2) AS total_notional
FROM transactions t
JOIN assets a ON a.id = t.asset_id
GROUP BY a.symbol
ORDER BY trades DESC
LIMIT 30;`,
    },
    {
        name: 'Portfolio Equity Curve',
        description: 'Equity and P&L over time',
        tags: ['performance', 'history'],
        sql_text:
`SELECT
  ts,
  ROUND(equity::numeric, 2)         AS equity,
  ROUND(profit_loss::numeric, 2)     AS profit_loss,
  ROUND(profit_loss_pct::numeric, 4) AS pnl_pct,
  timeframe
FROM portfolio_equity_curve
ORDER BY ts DESC
LIMIT 90;`,
    },
    {
        name: 'Account Snapshots — Latest 30',
        description: 'Cash, equity, buying power from Alpaca sync',
        tags: ['account', 'snapshot'],
        sql_text:
`SELECT
  as_of,
  ROUND(cash::numeric, 2)             AS cash,
  ROUND(equity::numeric, 2)            AS equity,
  ROUND(buying_power::numeric, 2)      AS buying_power,
  ROUND(portfolio_value::numeric, 2)   AS portfolio_value,
  ROUND(long_market_value::numeric, 2) AS long_market_value
FROM account_snapshots
ORDER BY as_of DESC
LIMIT 30;`,
    },
    {
        name: 'Position History — Daily Snapshots',
        description: 'Open position count and total MV per date',
        tags: ['positions', 'history'],
        sql_text:
`SELECT
  as_of_date,
  COUNT(*) AS position_rows,
  SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) AS open_positions,
  ROUND(SUM(market_value)::numeric, 2)            AS total_market_value
FROM positions
GROUP BY as_of_date
ORDER BY as_of_date DESC
LIMIT 60;`,
    },
    {
        name: 'Latest Closing Prices',
        description: 'Most recent close for every asset',
        tags: ['prices', 'market-data'],
        sql_text:
`SELECT
  a.symbol,
  ph.price_date,
  ph.open, ph.high, ph.low, ph.close,
  ph.volume
FROM price_history ph
JOIN assets a ON a.id = ph.asset_id
WHERE ph.price_date = (SELECT MAX(price_date) FROM price_history)
ORDER BY a.symbol;`,
    },
    {
        name: 'Assets by Class & Sector',
        description: 'Universe grouped by asset class and sector',
        tags: ['assets', 'diversification'],
        sql_text:
`SELECT
  asset_class,
  sector,
  COUNT(*) AS count,
  STRING_AGG(symbol, ', ' ORDER BY symbol) AS symbols
FROM assets
GROUP BY asset_class, sector
ORDER BY asset_class, count DESC;`,
    },
    {
        name: 'Sync Log — Recent Runs',
        description: 'Alpaca → Supabase pipeline health',
        tags: ['sync', 'ops'],
        sql_text:
`SELECT
  started_at,
  status,
  source,
  positions_upserted,
  transactions_upserted,
  prices_upserted,
  duration_ms,
  error_message
FROM sync_log
ORDER BY started_at DESC
LIMIT 20;`,
    },
    {
        name: 'Schema Explorer',
        description: 'All public tables and their columns',
        tags: ['meta', 'schema'],
        sql_text:
`SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`,
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function typeIcon(dt) {
    const d = (dt || '').toLowerCase();
    if (/int|float|numeric|double|decimal|real|money/.test(d)) return '#';
    if (/timestamp|date|time/.test(d)) return '◷';
    if (/bool/.test(d)) return '✓';
    if (/json|array|\[\]/.test(d)) return '{}';
    return 'T';
}

function fmtNum(n) {
    if (n == null) return '—';
    return typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(n);
}

function downloadCsv(rows, columns, filename) {
    const escape = v => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [columns.join(','), ...rows.map(r => columns.map(c => escape(r[c])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
    card: { background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 20px' },
    label: { fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontFamily: 'DM Sans' },
    btn: (accent) => ({
        padding: '7px 14px', border: `1px solid ${accent}44`, borderRadius: 6,
        background: `${accent}14`, color: accent, cursor: 'pointer',
        fontSize: 11, fontWeight: 600, fontFamily: 'DM Sans', letterSpacing: 0.3,
        transition: 'all 0.15s',
    }),
    btnGhost: {
        padding: '5px 11px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5,
        background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)',
        cursor: 'pointer', fontSize: 10, fontFamily: 'DM Sans',
    },
    tag: { padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,0.14)', color: '#818cf8', fontSize: 10, fontFamily: 'DM Sans' },
    mono: { fontFamily: 'JetBrains Mono', fontSize: 11 },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SchemaPanel({ schema, onInsert }) {
    const [open, setOpen] = useState({});
    const tables = Object.keys(schema).sort();

    if (!tables.length) return h('div', { style: { color: 'rgba(255,255,255,0.28)', fontSize: 11, padding: 12 } }, 'Loading schema…');

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        tables.map(tbl =>
            h('div', { key: tbl },
                h('div', {
                    onClick: () => setOpen(o => ({ ...o, [tbl]: !o[tbl] })),
                    style: {
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                        cursor: 'pointer', borderRadius: 5, userSelect: 'none',
                        background: open[tbl] ? 'rgba(99,102,241,0.08)' : 'transparent',
                        color: open[tbl] ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
                        fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 600,
                        transition: 'all 0.12s',
                    },
                },
                    h('span', { style: { fontSize: 8, opacity: 0.6 } }, open[tbl] ? '▼' : '▶'),
                    tbl
                ),
                open[tbl] && h('div', { style: { paddingLeft: 8, paddingBottom: 4 } },
                    schema[tbl].map(col =>
                        h('div', {
                            key: col.name,
                            onClick: () => onInsert(tbl + '.' + col.name),
                            title: `Insert ${tbl}.${col.name}`,
                            style: {
                                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px',
                                cursor: 'pointer', borderRadius: 4, userSelect: 'none',
                                color: 'rgba(255,255,255,0.38)',
                                transition: 'color 0.12s, background 0.12s',
                                fontSize: 10, fontFamily: 'JetBrains Mono',
                            },
                            onMouseEnter: e => { e.currentTarget.style.color = '#a5b4fc'; e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; },
                            onMouseLeave: e => { e.currentTarget.style.color = 'rgba(255,255,255,0.38)'; e.currentTarget.style.background = 'transparent'; },
                        },
                            h('span', { style: { color: 'rgba(139,92,246,0.65)', minWidth: 10 } }, typeIcon(col.type)),
                            h('span', null, col.name),
                            h('span', { style: { color: 'rgba(255,255,255,0.2)', marginLeft: 'auto', fontSize: 9 } }, col.type.slice(0, 14))
                        )
                    )
                )
            )
        )
    );
}

function ResultsTable({ rows, columns, sortCol, sortDir, onSort }) {
    const ROW_H = 34;
    const MAX_ROWS_SHOWN = 500; // virtual cap for DOM perf

    const visibleRows = rows.slice(0, MAX_ROWS_SHOWN);

    return h('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: 340, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', ...S.mono } },
            h('thead', null,
                h('tr', null,
                    columns.map(col =>
                        h('th', {
                            key: col,
                            onClick: () => onSort(col),
                            style: {
                                padding: '8px 12px', textAlign: 'left', background: 'rgba(0,0,0,0.4)',
                                color: sortCol === col ? '#00d4ff' : 'rgba(255,255,255,0.45)',
                                fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
                                fontFamily: 'DM Sans', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: '1px solid rgba(255,255,255,0.07)',
                                position: 'sticky', top: 0,
                                userSelect: 'none',
                            },
                        },
                            col, ' ',
                            sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''
                        )
                    )
                )
            ),
            h('tbody', null,
                visibleRows.map((row, i) =>
                    h('tr', {
                        key: i,
                        style: { background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.016)' },
                        onMouseEnter: e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; },
                        onMouseLeave: e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.016)'; },
                    },
                        columns.map(col =>
                            h('td', {
                                key: col,
                                style: {
                                    padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    color: 'rgba(255,255,255,0.78)', whiteSpace: 'nowrap',
                                    maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
                                },
                            }, fmtNum(row[col]))
                        )
                    )
                ),
                rows.length > MAX_ROWS_SHOWN && h('tr', null,
                    h('td', { colSpan: columns.length, style: { padding: '8px 12px', color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'DM Sans', textAlign: 'center' } },
                        `Showing first ${MAX_ROWS_SHOWN.toLocaleString()} of ${rows.length.toLocaleString()} rows. Export CSV for full results.`
                    )
                )
            )
        )
    );
}

function SavedQueriesTab({ savedQueries, onLoad, onRefresh }) {
    const [busy, setBusy] = useState(null);

    async function handleDelete(id) {
        setBusy(id + '_del');
        await deleteQuery(id);
        await onRefresh();
        setBusy(null);
    }

    async function handlePin(id, current) {
        setBusy(id + '_pin');
        await togglePin(id, !current);
        await onRefresh();
        setBusy(null);
    }

    if (!savedQueries.length) return h('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: 20, textAlign: 'center', fontFamily: 'DM Sans' } },
        'No saved queries yet. Run a query and click Save.');

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        savedQueries.map(q =>
            h('div', { key: q.id, style: { ...S.card, padding: '12px 16px' } },
                h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 } },
                    h('div', { style: { flex: 1 } },
                        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 } },
                            h('span', { style: { color: q.is_pinned ? '#f59e0b' : 'rgba(255,255,255,0.25)', fontSize: 13 } }, '★'),
                            h('span', { style: { fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)' } }, q.name),
                            ...(q.tags || []).map(t => h('span', { key: t, style: S.tag }, t))
                        ),
                        q.description && h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans' } }, q.description)
                    ),
                    h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                        h('button', { onClick: () => onLoad(q.sql_text), style: S.btn('#00d4ff') }, '▶ Load'),
                        h('button', { onClick: () => handlePin(q.id, q.is_pinned), disabled: busy === q.id + '_pin', style: S.btnGhost }, q.is_pinned ? 'Unpin' : 'Pin'),
                        h('button', { onClick: () => handleDelete(q.id), disabled: busy === q.id + '_del', style: { ...S.btnGhost, color: 'rgba(239,68,68,0.6)' } }, 'Delete')
                    )
                ),
                h('pre', { style: { margin: 0, padding: '8px 12px', background: 'rgba(0,0,0,0.35)', borderRadius: 6, fontSize: 10.5, fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', maxHeight: 80, textOverflow: 'ellipsis', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } },
                    q.sql_text.slice(0, 300) + (q.sql_text.length > 300 ? '…' : '')
                )
            )
        )
    );
}

function HistoryTab({ history, onLoad }) {
    if (!history.length) return h('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: 20, textAlign: 'center', fontFamily: 'DM Sans' } }, 'No queries run this session.');
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        history.map((sql, i) =>
            h('div', { key: i, style: { ...S.card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 } },
                h('span', { style: { ...S.mono, fontSize: 10, color: 'rgba(255,255,255,0.25)', minWidth: 20 } }, i + 1),
                h('pre', { style: { flex: 1, margin: 0, fontSize: 10.5, fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    sql.replace(/\s+/g, ' ').trim().slice(0, 120)
                ),
                h('button', { onClick: () => onLoad(sql), style: S.btn('#00d4ff') }, '▶ Load')
            )
        )
    );
}

function InsightsTab({ insights, onQuery }) {
    const schedBadge = { manual: ['rgba(148,163,184,0.15)', '#94a3b8', '● Manual'], on_sync: ['rgba(52,211,153,0.15)', '#34d399', '↻ On Sync'], daily: ['rgba(96,165,250,0.15)', '#60a5fa', '◷ Daily'] };
    if (!insights.length) return h('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: 20, textAlign: 'center', fontFamily: 'DM Sans' } },
        'No materialized insight tables yet. Run a query and click Route to Supabase.');
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        insights.map(ins => {
            const [bg, col, lbl] = schedBadge[ins.refresh_schedule] || schedBadge.manual;
            return h('div', { key: ins.id, style: { ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 } },
                h('div', { style: { flex: 1 } },
                    h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 4 } }, ins.table_name),
                    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
                        h('span', { style: { padding: '2px 8px', borderRadius: 4, background: bg, color: col, fontSize: 10, fontFamily: 'DM Sans' } }, lbl),
                        h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans' } },
                            (ins.row_count || 0).toLocaleString() + ' rows · last refresh ' + (ins.last_refreshed_at ? ins.last_refreshed_at.slice(0, 10) : '—'))
                    )
                ),
                h('button', { onClick: () => onQuery(`SELECT *\nFROM ${ins.table_name}\nLIMIT 100;`), style: S.btn('#6366f1') }, '▶ Query')
            );
        })
    );
}

// ── Save modal ─────────────────────────────────────────────────────────────────
function SaveModal({ sql, onClose, onSaved }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [tags, setTags] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    async function handleSave() {
        if (!name.trim()) { setErr('Name is required.'); return; }
        setSaving(true);
        const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
        const ok = await saveQuery(name.trim(), desc.trim(), sql, tagList);
        setSaving(false);
        if (ok) { onSaved(); onClose(); }
        else setErr('Save failed — check console.');
    }

    const inputStyle = { width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'DM Sans', boxSizing: 'border-box', outline: 'none' };
    return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } },
        h('div', { style: { background: '#0d0f1a', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: 28, width: 420, maxWidth: '90vw' } },
            h('div', { style: { fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 20 } }, '💾 Save Query'),
            h('div', { style: { marginBottom: 12 } },
                h('div', { style: S.label }, 'Name *'),
                h('input', { value: name, onChange: e => setName(e.target.value), style: inputStyle, placeholder: 'e.g. Top Winners' })
            ),
            h('div', { style: { marginBottom: 12 } },
                h('div', { style: S.label }, 'Description'),
                h('input', { value: desc, onChange: e => setDesc(e.target.value), style: inputStyle, placeholder: 'Optional' })
            ),
            h('div', { style: { marginBottom: 20 } },
                h('div', { style: S.label }, 'Tags (comma-separated)'),
                h('input', { value: tags, onChange: e => setTags(e.target.value), style: inputStyle, placeholder: 'e.g. positions, holdings' })
            ),
            err && h('div', { style: { color: '#ef4444', fontSize: 11, marginBottom: 12, fontFamily: 'DM Sans' } }, err),
            h('div', { style: { display: 'flex', gap: 10 } },
                h('button', { onClick: handleSave, disabled: saving, style: { ...S.btn('#6366f1'), flex: 1, textAlign: 'center' } }, saving ? 'Saving…' : '✓ Save'),
                h('button', { onClick: onClose, style: { ...S.btnGhost, flex: 1, textAlign: 'center', padding: '7px 14px' } }, 'Cancel')
            )
        )
    );
}

// ── Materialize modal ─────────────────────────────────────────────────────────
function MaterializeModal({ sql, onClose, onDone }) {
    const [suffix, setSuffix] = useState('');
    const [schedule, setSchedule] = useState('manual');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    async function handleMat() {
        const s = suffix.trim().toLowerCase();
        if (!s) { setErr('Table name suffix is required.'); return; }
        if (!/^[a-z][a-z0-9_]{0,54}$/.test(s)) { setErr('Use lowercase letters, digits, underscores only (max 55 chars).'); return; }
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('materialize_insight', {
                p_table_name: s, p_sql_text: sql,
                p_source_query_id: null, p_refresh_schedule: schedule,
            });
            if (error) throw new Error(error.message);
            setBusy(false);
            onDone(`insight_${s}`, data && data.row_count);
            onClose();
        } catch (e) {
            setErr(String(e));
            setBusy(false);
        }
    }

    const inputStyle = { width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'JetBrains Mono', boxSizing: 'border-box', outline: 'none' };
    const schedules = ['manual', 'on_sync', 'daily'];
    return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } },
        h('div', { style: { background: '#0d0f1a', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: 28, width: 440, maxWidth: '90vw' } },
            h('div', { style: { fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 6 } }, '🚀 Route to Supabase'),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans', marginBottom: 20 } }, 'Creates a persistent table from this query result. Prefixed with insight_.'),
            h('div', { style: { marginBottom: 12 } },
                h('div', { style: S.label }, 'Table name suffix *'),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 0 } },
                    h('span', { style: { padding: '8px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRight: 'none', borderRadius: '6px 0 0 6px', fontSize: 11, fontFamily: 'JetBrains Mono', color: '#34d399' } }, 'insight_'),
                    h('input', { value: suffix, onChange: e => setSuffix(e.target.value), style: { ...inputStyle, borderRadius: '0 6px 6px 0' }, placeholder: 'top_winners' })
                )
            ),
            h('div', { style: { marginBottom: 20 } },
                h('div', { style: S.label }, 'Refresh schedule'),
                h('div', { style: { display: 'flex', gap: 8 } },
                    schedules.map(s =>
                        h('button', {
                            key: s, onClick: () => setSchedule(s),
                            style: { ...S.btnGhost, flex: 1, textAlign: 'center', padding: '6px 8px', ...(schedule === s ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' } : {}) }
                        }, s)
                    )
                )
            ),
            err && h('div', { style: { color: '#ef4444', fontSize: 11, marginBottom: 12, fontFamily: 'DM Sans' } }, err),
            h('div', { style: { display: 'flex', gap: 10 } },
                h('button', { onClick: handleMat, disabled: busy, style: { ...S.btn('#10b981'), flex: 1, textAlign: 'center' } }, busy ? 'Materializing…' : '✓ Materialize'),
                h('button', { onClick: onClose, style: { ...S.btnGhost, flex: 1, textAlign: 'center', padding: '7px 14px' } }, 'Cancel')
            )
        )
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SqlTerminal() {
    // Editor state
    const [sql, setSql] = useState(
`-- ATLAS SQL Terminal · Ctrl+Enter / ⌘+Enter to run
-- Read-only · auto-limited to 10,000 rows

SELECT
  a.symbol,
  p.quantity,
  p.average_cost,
  p.market_value,
  p.as_of_date
FROM positions p
JOIN assets a ON a.id = p.asset_id
WHERE p.quantity > 0
ORDER BY p.market_value DESC
LIMIT 20;`
    );
    const textareaRef = useRef(null);

    // Query result state
    const [result, setResult] = useState(null);   // { rows, columns, ms, err }
    const [running, setRunning] = useState(false);
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    // Schema
    const [schema, setSchema] = useState({});

    // Saved / history / insights
    const [savedQueries, setSavedQueries] = useState([]);
    const [history, setHistory] = useState([]);
    const [insights, setInsights] = useState([]);
    const [activeTab, setActiveTab] = useState('saved');
    const [seeded, setSeeded] = useState(false);

    // Modals
    const [showSave, setShowSave] = useState(false);
    const [showMat, setShowMat] = useState(false);
    const [matNotice, setMatNotice] = useState('');

    // Toast
    const [toast, setToast] = useState('');

    function showToast(msg) {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }

    // ── Load schema + saved queries + insights on mount ───────────────────────
    useEffect(function() {
        fetchSchema().then(setSchema);
        refreshSaved();
        refreshInsights();
    }, []);

    async function refreshSaved() {
        const qs = await loadSavedQueries();
        setSavedQueries(qs);
        // Seed starter queries once if table is empty
        if (qs.length === 0 && !seeded) {
            setSeeded(true);
            if (sb) {
                try { await sb.from('saved_queries').insert(STARTERS); } catch (_) {}
                const fresh = await loadSavedQueries();
                setSavedQueries(fresh);
            }
        }
    }

    async function refreshInsights() {
        if (!sb) return;
        const { data } = await sb.from('materialized_insights').select('*').order('created_at', { ascending: false });
        setInsights(data || []);
    }

    // ── Run query ─────────────────────────────────────────────────────────────
    async function runQuery() {
        const err = validateSql(sql);
        if (err) { showToast('🚫 ' + err); return; }
        const bounded = ensureLimit(sql);
        setRunning(true);
        const r = await execSql(bounded);
        setRunning(false);
        setSortCol(null);
        setResult(r);
        // Add to history
        setHistory(h => [sql, ...h.filter(x => x !== sql)].slice(0, 50));
        logQuery(sql, r.ms, r.rows.length, r.err);
    }

    // ── Keyboard shortcut ─────────────────────────────────────────────────────
    function handleKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runQuery();
        }
        // Tab → insert 2 spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target;
            const start = ta.selectionStart, end = ta.selectionEnd;
            const newSql = sql.slice(0, start) + '  ' + sql.slice(end);
            setSql(newSql);
            setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
        }
    }

    // ── Schema insert-at-cursor ───────────────────────────────────────────────
    function insertAtCursor(text) {
        const ta = textareaRef.current;
        if (!ta) { setSql(s => s + ' ' + text); return; }
        const start = ta.selectionStart, end = ta.selectionEnd;
        setSql(sql.slice(0, start) + text + sql.slice(end));
        setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length; }, 0);
    }

    // ── Sorted rows ───────────────────────────────────────────────────────────
    const sortedRows = useMemo(function() {
        if (!result || !sortCol) return result ? result.rows : [];
        return [...result.rows].sort(function(a, b) {
            const va = a[sortCol], vb = b[sortCol];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [result, sortCol, sortDir]);

    function handleSort(col) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    }

    // ── Bottom tabs ───────────────────────────────────────────────────────────
    const TABS = [
        { id: 'saved', label: '💾 Saved Queries', count: savedQueries.length },
        { id: 'history', label: '📜 History', count: history.length },
        { id: 'insights', label: '🗄 Materialized', count: insights.length },
    ];

    // ── Render ─────────────────────────────────────────────────────────────────
    return h('div', { style: { padding: '0 0 40px 0' } },

        // Toast
        toast && h('div', { style: { position: 'fixed', top: 20, right: 20, zIndex: 10000, background: '#0d0f1a', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '10px 18px', color: '#fca5a5', fontSize: 12, fontFamily: 'DM Sans', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' } }, toast),

        // Modals
        showSave && h(SaveModal, { sql, onClose: () => setShowSave(false), onSaved: () => { refreshSaved(); showToast('✓ Query saved'); } }),
        showMat  && result && h(MaterializeModal, { sql: ensureLimit(sql), onClose: () => setShowMat(false), onDone: (tbl, rows) => { setMatNotice(`✓ Created ${tbl} (${(rows||'?').toLocaleString()} rows)`); showToast(`✓ Created ${tbl}`); refreshInsights(); } }),

        // Page header
        h('div', { style: { marginBottom: 20 } },
            h('div', { style: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(99,102,241,0.7)', marginBottom: 4, fontFamily: 'DM Sans' } }, 'ATLAS · SYSTEM'),
            h('h2', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.92)', margin: '0 0 4px 0' } }, '🛢 SQL Terminal'),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans' } },
                'Read-only · Supabase PostgreSQL · Auto-limited to 10,000 rows · Ctrl+Enter / ⌘+Enter to execute')
        ),

        // Main two-column layout
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16, marginBottom: 16 } },

            // LEFT: editor + results
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 } },

                // Editor card
                h('div', { style: { ...S.card, padding: 0, overflow: 'hidden' } },
                    // Editor toolbar
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' } },
                        h('span', { style: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'DM Sans' } }, 'SQL EDITOR'),
                        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
                            h('button', {
                                onClick: runQuery,
                                disabled: running,
                                style: { ...S.btn('#00d4ff'), minWidth: 120 },
                            }, running ? '⟳ Running…' : '▶ Run  ⌘↵'),
                            h('button', { onClick: () => setShowSave(true), style: S.btn('#6366f1') }, '💾 Save'),
                            result && result.rows.length > 0 && h('button', {
                                onClick: () => downloadCsv(sortedRows, result.columns, `atlas_query_${new Date().toISOString().slice(0,10)}.csv`),
                                style: S.btnGhost,
                            }, '↓ CSV'),
                            result && result.rows.length > 0 && h('button', { onClick: () => setShowMat(true), style: S.btn('#10b981') }, '🚀 Route to Supabase'),
                        )
                    ),
                    // Textarea
                    h('textarea', {
                        ref: textareaRef,
                        value: sql,
                        onChange: e => setSql(e.target.value),
                        onKeyDown: handleKeyDown,
                        spellCheck: false,
                        style: {
                            width: '100%', height: 200, padding: '14px 16px',
                            background: 'rgba(0,0,0,0.3)', border: 'none', resize: 'vertical',
                            color: 'rgba(255,255,255,0.88)', fontFamily: 'JetBrains Mono',
                            fontSize: 12.5, lineHeight: 1.6, outline: 'none',
                            boxSizing: 'border-box', display: 'block',
                        }
                    })
                ),

                // Metadata bar
                result && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 } },
                    result.err
                        ? h('span', { style: { color: '#ef4444', fontSize: 11, fontFamily: 'DM Sans' } }, '✗ Error')
                        : h('span', { style: { color: '#10b981', fontSize: 11, fontFamily: 'DM Sans' } }, '✓'),
                    result.err
                        ? h('span', { style: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'DM Sans' } }, result.err)
                        : h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: '#a5b4fc' } }, `${result.rows.length.toLocaleString()} rows`),
                    !result.err && h('span', { style: { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'DM Sans' } }, `· ${result.ms}ms`),
                    matNotice && h('span', { style: { marginLeft: 'auto', color: '#34d399', fontSize: 10, fontFamily: 'DM Sans' } }, matNotice)
                ),

                // Results table
                result && !result.err && result.rows.length > 0 && h(ResultsTable, { rows: sortedRows, columns: result.columns, sortCol, sortDir, onSort: handleSort }),
                result && !result.err && result.rows.length === 0 && h('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'DM Sans', padding: '12px 0' } }, 'Query returned 0 rows.'),
            ),

            // RIGHT: schema sidebar
            h('div', { style: { ...S.card, padding: '12px', overflowY: 'auto', maxHeight: 600 } },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
                    h('div', { style: { ...S.label, margin: 0 } }, 'SCHEMA'),
                    h('button', {
                        onClick: () => { fetchSchema().then(setSchema); },
                        title: 'Refresh schema',
                        style: { ...S.btnGhost, padding: '2px 7px', fontSize: 10 },
                    }, '↺')
                ),
                h(SchemaPanel, { schema, onInsert: insertAtCursor })
            )
        ),

        // Bottom tabs
        h('div', { style: S.card },
            // Tab bar
            h('div', { style: { display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', marginLeft: -20, marginRight: -20, paddingLeft: 20 } },
                TABS.map(function(tab) {
                    const active = activeTab === tab.id;
                    return h('button', {
                        key: tab.id,
                        onClick: () => setActiveTab(tab.id),
                        style: {
                            padding: '10px 18px 12px', border: 'none', cursor: 'pointer',
                            borderBottom: '2px solid ' + (active ? '#00d4ff' : 'transparent'),
                            background: 'transparent', color: active ? '#00d4ff' : 'rgba(255,255,255,0.38)',
                            fontSize: 11, fontFamily: 'DM Sans', fontWeight: active ? 600 : 400,
                            transition: 'all 0.15s', marginBottom: -1,
                            display: 'flex', alignItems: 'center', gap: 6,
                        },
                    },
                        tab.label,
                        tab.count > 0 && h('span', { style: { padding: '1px 6px', borderRadius: 10, background: active ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)', color: active ? '#00d4ff' : 'rgba(255,255,255,0.3)', fontSize: 9 } }, tab.count)
                    );
                })
            ),
            activeTab === 'saved'    && h(SavedQueriesTab, { savedQueries, onLoad: sql => { setSql(sql); window.scrollTo({ top: 0, behavior: 'smooth' }); }, onRefresh: refreshSaved }),
            activeTab === 'history'  && h(HistoryTab, { history, onLoad: sql => { setSql(sql); window.scrollTo({ top: 0, behavior: 'smooth' }); } }),
            activeTab === 'insights' && h(InsightsTab, { insights, onQuery: sql => { setSql(sql); window.scrollTo({ top: 0, behavior: 'smooth' }); } }),
        )
    );
}
