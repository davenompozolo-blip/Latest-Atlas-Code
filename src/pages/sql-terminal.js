import React from 'react';
// ============================================================
// ATLAS Terminal — SQL Terminal  (v2 · Visual + AI Edition)
// ------------------------------------------------------------
// Visual upgrade: syntax-highlighted editor, line numbers,
// schema sidebar, polished results table, ATLAS hero styling.
//
// AI integration: Claude Sonnet via claude_sql_assistant Edge
// Function — SQL generation + feature idea exploration modes.
// ============================================================

import { sb, SUPABASE_URL } from './config.js';

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const h = React.createElement;

// ── Safety ────────────────────────────────────────────────────────────────────
const WRITE_KW = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE)\b/i;
const SYS_KW   = /\b(pg_catalog|pg_class|pg_proc|pg_stat_activity|pg_toast)\b/i;

function validateSql(sql) {
    const s = sql.trim();
    if (!s) return 'Query is empty.';
    const m = WRITE_KW.exec(s);
    if (m) return `'${m[0].toUpperCase()}' is not permitted — read-only terminal.`;
    if (SYS_KW.test(s)) return 'Access to pg system catalogues is restricted.';
    return null;
}
function ensureLimit(sql, n = 10000) {
    const s = sql.trimEnd().replace(/;+$/, '');
    return /\bLIMIT\b/i.test(s) ? s : `${s}\nLIMIT ${n}`;
}

// ── Supabase / Edge Function calls ────────────────────────────────────────────
async function execSql(sql) {
    if (!sb) return { ok: false, rows: [], columns: [], ms: 0, err: 'No Supabase connection. Configure your API key.' };
    const t0 = Date.now();
    try {
        const { data, error } = await sb.rpc('run_read_sql', { sql_text: sql });
        const ms = Date.now() - t0;
        if (error) return { ok: false, rows: [], columns: [], ms, err: error.message };
        const rows = Array.isArray(data) ? data : (data ? [data] : []);
        return { ok: true, rows, columns: rows.length ? Object.keys(rows[0]) : [], ms, err: null };
    } catch (e) {
        return { ok: false, rows: [], columns: [], ms: Date.now() - t0, err: String(e) };
    }
}

async function callClaude(messages, schema, mode) {
    if (!sb) throw new Error('No Supabase connection');
    const { data, error } = await sb.functions.invoke('claude_sql_assistant', {
        body: { messages, schema, mode },
    });
    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    return data.content;
}

async function logQuery(sql, ms, rows, err) {
    if (!sb) return;
    try { await sb.from('query_log').insert({ sql_text: sql.slice(0, 4000), execution_time_ms: ms, row_count: rows, error: err }); } catch (_) {}
}

async function fetchSchema() {
    const r = await execSql(
        "SELECT table_name, column_name, data_type FROM information_schema.columns " +
        "WHERE table_schema='public' ORDER BY table_name, ordinal_position"
    );
    const s = {};
    for (const row of r.rows) (s[row.table_name] = s[row.table_name] || []).push({ name: row.column_name, type: row.data_type });
    return s;
}

async function loadSaved() {
    if (!sb) return [];
    const { data } = await sb.from('saved_queries').select('*').order('is_pinned', { ascending: false }).order('updated_at', { ascending: false });
    return data || [];
}

function downloadCsv(rows, cols, fn) {
    const esc = v => { const s = v == null ? '' : String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: fn });
    a.click();
}

// ── SQL syntax highlighter ────────────────────────────────────────────────────
const KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|NULL|IS|IN|BETWEEN|LIKE|ILIKE|ORDER|GROUP|HAVING|LIMIT|OFFSET|DISTINCT|AS|CASE|WHEN|THEN|ELSE|END|WITH|UNION|ALL|EXISTS|RETURNING|COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|EXTRACT|DATE_TRUNC|NOW|CURRENT_DATE|CURRENT_TIMESTAMP|TRUE|FALSE|BY|ASC|DESC|USING|LATERAL|WINDOW|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|ARRAY_AGG|STRING_AGG|JSONB_AGG|ROUND|FLOOR|CEIL|ABS|GREATEST|LEAST|GENERATE_SERIES|UNNEST|FORMAT|CONCAT|TRIM|LOWER|UPPER|LENGTH|SUBSTRING|POSITION|REPLACE|SPLIT_PART)\b/gi;

function highlightSql(raw) {
    return raw
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(--[^\n]*)/g, '\x00comment\x00$1\x00/comment\x00')
        .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '\x00str\x00$1\x00/str\x00')
        .replace(KW, '\x00kw\x00$1\x00/kw\x00')
        .replace(/\b(\d+(?:\.\d+)?)\b/g, '\x00num\x00$1\x00/num\x00')
        .replace(/\x00comment\x00(.*?)\x00\/comment\x00/gs, '<span class="sq-c">$1</span>')
        .replace(/\x00str\x00(.*?)\x00\/str\x00/gs, '<span class="sq-s">$1</span>')
        .replace(/\x00kw\x00(.*?)\x00\/kw\x00/gs, '<span class="sq-k">$1</span>')
        .replace(/\x00num\x00(.*?)\x00\/num\x00/gs, '<span class="sq-n">$1</span>');
}

// ── AI message parser (extract ```sql blocks) ─────────────────────────────────
function parseAiMessage(text) {
    const parts = [];
    const re = /```(?:sql|SQL)?\n?([\s\S]*?)```/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) });
        parts.push({ type: 'sql', content: m[1].trim() });
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });
    return parts;
}

// ── Type icon + colour ─────────────────────────────────────────────────────────
function typeInfo(dt) {
    const d = (dt || '').toLowerCase();
    if (/int|float|numeric|double|decimal|real|money/.test(d)) return ['#', '#10b981'];
    if (/timestamp|date|time/.test(d)) return ['◷', '#60a5fa'];
    if (/bool/.test(d)) return ['✓', '#f59e0b'];
    if (/json|array|\[\]/.test(d)) return ['{}', '#c084fc'];
    return ['T', 'rgba(255,255,255,0.35)'];
}

// ── Shared inline style helpers ───────────────────────────────────────────────
const card  = (extra) => ({ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, ...extra });
const label = { fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Sans' };
const btnPrimary = (accent, extra) => ({ padding: '7px 16px', border: `1px solid ${accent}55`, borderRadius: 6, background: `${accent}18`, color: accent, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'DM Sans', letterSpacing: 0.4, transition: 'all 0.15s', ...extra });
const btnGhost   = (extra) => ({ padding: '5px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 10, fontFamily: 'DM Sans', transition: 'all 0.12s', ...extra });

// ── CSS injection ─────────────────────────────────────────────────────────────
const STYLES = `
.sq-k { color: #00d4ff; }
.sq-s { color: #f59e0b; }
.sq-c { color: rgba(255,255,255,0.28); font-style: italic; }
.sq-n { color: #34d399; }

.atl-editor-wrap { position: relative; }
.atl-hl {
  position: absolute; inset: 0;
  padding: 14px 16px 14px 52px;
  font: 13px/1.65 'JetBrains Mono', monospace;
  white-space: pre-wrap; word-break: break-word;
  pointer-events: none; overflow: hidden;
  color: rgba(255,255,255,0.82);
}
.atl-ta {
  position: relative; display: block; width: 100%; box-sizing: border-box;
  background: transparent; color: transparent; caret-color: #00d4ff;
  font: 13px/1.65 'JetBrains Mono', monospace;
  padding: 14px 16px 14px 52px;
  border: none; outline: none; resize: vertical; min-height: 180px;
  white-space: pre-wrap; word-break: break-word; overflow: auto;
  tab-size: 2;
}
.atl-ta::selection { background: rgba(99,102,241,0.35); color: transparent; }
.atl-gutter {
  position: absolute; left: 0; top: 0; width: 40px; bottom: 0;
  background: rgba(0,0,0,0.25); border-right: 1px solid rgba(255,255,255,0.04);
  display: flex; flex-direction: column; align-items: flex-end;
  padding: 14px 8px 14px 0;
  font: 11px/1.65 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.13); user-select: none; pointer-events: none;
  overflow: hidden; gap: 0;
}

.atl-schema-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px 3px 16px; border-radius: 4px;
  font: 10.5px 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.4); cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.atl-schema-row:hover { background: rgba(99,102,241,0.09); color: #a5b4fc; }

.atl-schema-tbl {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 8px; border-radius: 5px;
  font: 11.5px/1 'JetBrains Mono', monospace; font-weight: 600;
  color: rgba(255,255,255,0.58); cursor: pointer;
  user-select: none; transition: background 0.12s, color 0.12s;
}
.atl-schema-tbl:hover { background: rgba(99,102,241,0.1); color: #c7d2fe; }
.atl-schema-tbl.open { color: #a5b4fc; background: rgba(99,102,241,0.08); }

/* Scrollbars */
.atl-schema-scroll::-webkit-scrollbar,
.atl-ai-scroll::-webkit-scrollbar { width: 3px; }
.atl-schema-scroll::-webkit-scrollbar-track,
.atl-ai-scroll::-webkit-scrollbar-track { background: transparent; }
.atl-schema-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 2px; }
.atl-ai-scroll::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.35); border-radius: 2px; }

/* Results table */
.atl-tbl { width: 100%; border-collapse: collapse; font: 11.5px/1 'JetBrains Mono', monospace; }
.atl-tbl th {
  padding: 8px 12px; text-align: left; position: sticky; top: 0;
  background: rgba(0,212,255,0.06); border-bottom: 1px solid rgba(0,212,255,0.12);
  font: 9px 'DM Sans', sans-serif; font-weight: 700; letter-spacing: 1.4;
  text-transform: uppercase; color: rgba(0,212,255,0.6);
  cursor: pointer; user-select: none; white-space: nowrap;
  transition: color 0.12s;
}
.atl-tbl th:hover { color: #00d4ff; }
.atl-tbl th.sort-active { color: #00d4ff; }
.atl-tbl td {
  padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.75); white-space: nowrap;
  max-width: 260px; overflow: hidden; text-overflow: ellipsis;
}
.atl-tbl tr:hover td { background: rgba(99,102,241,0.06); }
.atl-tbl tr:nth-child(even) td { background: rgba(255,255,255,0.012); }

/* AI chat bubbles */
.atl-ai-user {
  align-self: flex-end; max-width: 88%;
  background: rgba(99,102,241,0.16); border: 1px solid rgba(99,102,241,0.28);
  border-radius: 12px 12px 3px 12px;
  padding: 9px 13px; font: 12px 'DM Sans', sans-serif;
  color: rgba(255,255,255,0.85); line-height: 1.5;
}
.atl-ai-asst {
  align-self: flex-start; max-width: 95%;
  background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2);
  border-radius: 3px 12px 12px 12px;
  padding: 9px 13px; font: 12px 'DM Sans', sans-serif;
  color: rgba(255,255,255,0.82); line-height: 1.6;
  white-space: pre-wrap;
}
.atl-ai-code {
  margin: 8px 0; border-radius: 7px; overflow: hidden;
  border: 1px solid rgba(0,212,255,0.18);
  background: rgba(0,0,0,0.45);
}
.atl-ai-code-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 10px; background: rgba(0,212,255,0.07);
  font: 9px 'DM Sans'; font-weight: 700; letter-spacing: 1.2;
  text-transform: uppercase; color: rgba(0,212,255,0.5);
}
.atl-ai-code pre {
  margin: 0; padding: 10px 14px;
  font: 11.5px/1.6 'JetBrains Mono', monospace;
  color: rgba(0,212,255,0.85);
  white-space: pre-wrap; word-break: break-word;
}
.atl-ai-typing {
  display: flex; gap: 4px; padding: 8px 12px;
}
.atl-ai-typing span {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(139,92,246,0.7);
  animation: atl-bounce 1.2s ease-in-out infinite;
}
.atl-ai-typing span:nth-child(2) { animation-delay: 0.2s; }
.atl-ai-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes atl-bounce {
  0%,80%,100% { transform: translateY(0); opacity: 0.4; }
  40%          { transform: translateY(-6px); opacity: 1; }
}
@keyframes atl-glow-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
  50%      { box-shadow: 0 0 18px 2px rgba(99,102,241,0.18); }
}
.atl-editor-focused { animation: atl-glow-pulse 2.5s ease-in-out infinite; }

@keyframes atl-slide-in {
  from { opacity: 0; transform: translateX(18px); }
  to   { opacity: 1; transform: translateX(0); }
}
.atl-ai-panel { animation: atl-slide-in 0.22s ease-out both; }

.atl-run-btn {
  position: relative; overflow: hidden;
}
.atl-run-btn::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.12) 50%, transparent 100%);
  transform: translateX(-100%); transition: transform 0.6s ease;
}
.atl-run-btn:hover::after { transform: translateX(100%); }
`;

// ── Sub-components ────────────────────────────────────────────────────────────

function SqlEditor({ value, onChange, onRun, editorRef }) {
    const hlRef  = useRef(null);
    const gutRef = useRef(null);
    const [focused, setFocused] = useState(false);

    const lines = useMemo(() => value.split('\n').length, [value]);

    function syncScroll(e) {
        if (hlRef.current)  hlRef.current.scrollTop  = e.target.scrollTop;
        if (gutRef.current) gutRef.current.scrollTop = e.target.scrollTop;
    }

    function handleKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); return; }
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target, s = ta.selectionStart, en = ta.selectionEnd;
            onChange(value.slice(0, s) + '  ' + value.slice(en));
            setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2; }, 0);
        }
    }

    const highlighted = useMemo(() => ({ __html: highlightSql(value) }), [value]);

    const borderColor = focused ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)';

    return h('div', {
        className: 'atl-editor-wrap',
        style: {
            background: 'rgba(3,4,12,0.97)', border: `1px solid ${borderColor}`,
            borderRadius: '0 0 8px 8px', transition: 'border-color 0.2s',
            ...(focused ? { boxShadow: '0 0 0 1px rgba(99,102,241,0.2), 0 4px 24px rgba(99,102,241,0.07)' } : {}),
        },
        className: 'atl-editor-wrap' + (focused ? ' atl-editor-focused' : ''),
    },
        // Line number gutter
        h('div', { ref: gutRef, className: 'atl-gutter' },
            Array.from({ length: lines }, (_, i) =>
                h('div', { key: i, style: { lineHeight: '1.65', height: '1.65em', flexShrink: 0 } }, i + 1)
            )
        ),
        // Syntax highlight layer
        h('div', { ref: hlRef, className: 'atl-hl', dangerouslySetInnerHTML: highlighted }),
        // Actual textarea (transparent text, visible caret)
        h('textarea', {
            ref: editorRef,
            value,
            className: 'atl-ta',
            spellCheck: false,
            autoComplete: 'off',
            autoCorrect: 'off',
            autoCapitalize: 'off',
            onChange: e => onChange(e.target.value),
            onKeyDown: handleKeyDown,
            onScroll: syncScroll,
            onFocus: () => setFocused(true),
            onBlur:  () => setFocused(false),
        })
    );
}

function SchemaPanel({ schema, onInsert }) {
    const [open, setOpen]       = useState({});
    const [filter, setFilter]   = useState('');

    const tables = useMemo(() => {
        const all = Object.keys(schema).sort();
        if (!filter) return all;
        const f = filter.toLowerCase();
        return all.filter(t => t.includes(f) || schema[t].some(c => c.name.includes(f)));
    }, [schema, filter]);

    if (!Object.keys(schema).length) return h('div', { style: { padding: 16, color: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'DM Sans' } }, 'Loading schema…');

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
        // Header
        h('div', { style: { padding: '10px 10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
                h('span', { style: { ...label } }, 'SCHEMA'),
                h('button', {
                    onClick: () => window._atlasSchemaRefresh && window._atlasSchemaRefresh(),
                    style: btnGhost({ padding: '2px 6px', fontSize: 9 }),
                    title: 'Refresh schema',
                }, '↺')
            ),
            h('input', {
                value: filter,
                onChange: e => setFilter(e.target.value),
                placeholder: 'Filter tables…',
                style: {
                    width: '100%', boxSizing: 'border-box', padding: '5px 9px',
                    background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 5, color: 'rgba(255,255,255,0.7)', fontSize: 10.5,
                    fontFamily: 'JetBrains Mono', outline: 'none',
                },
            })
        ),
        // Table list
        h('div', { className: 'atl-schema-scroll', style: { overflowY: 'auto', flex: 1, padding: '6px 0' } },
            tables.map(tbl =>
                h('div', { key: tbl },
                    h('div', {
                        className: 'atl-schema-tbl' + (open[tbl] ? ' open' : ''),
                        onClick: () => setOpen(o => ({ ...o, [tbl]: !o[tbl] })),
                    },
                        h('span', { style: { fontSize: 7, opacity: 0.5, minWidth: 8 } }, open[tbl] ? '▼' : '▶'),
                        h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, tbl)
                    ),
                    open[tbl] && schema[tbl]
                        .filter(c => !filter || c.name.toLowerCase().includes(filter.toLowerCase()))
                        .map(col => {
                            const [icon, iconColor] = typeInfo(col.type);
                            return h('div', {
                                key: col.name,
                                className: 'atl-schema-row',
                                onClick: () => onInsert(`${tbl}.${col.name}`),
                                title: `Insert ${tbl}.${col.name}  (${col.type})`,
                            },
                                h('span', { style: { color: iconColor, minWidth: 10, fontSize: 10 } }, icon),
                                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, col.name),
                                h('span', { style: { fontSize: 9, color: 'rgba(255,255,255,0.18)', flexShrink: 0 } }, col.type.slice(0, 10))
                            );
                        })
                )
            )
        )
    );
}

function ResultsTable({ rows, columns, sortCol, sortDir, onSort }) {
    return h('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: 360, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' } },
        h('table', { className: 'atl-tbl' },
            h('thead', null,
                h('tr', null,
                    columns.map(col =>
                        h('th', {
                            key: col,
                            className: 'atl-tbl-th' + (sortCol === col ? ' sort-active' : ''),
                            onClick: () => onSort(col),
                        }, col, ' ', sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '')
                    )
                )
            ),
            h('tbody', null,
                rows.slice(0, 500).map((row, i) =>
                    h('tr', { key: i },
                        columns.map(col => {
                            const v = row[col];
                            const isNum = typeof v === 'number';
                            return h('td', { key: col, style: { textAlign: isNum ? 'right' : 'left' } },
                                v == null ? h('span', { style: { color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' } }, 'null')
                                          : String(v).slice(0, 200)
                            );
                        })
                    )
                ),
                rows.length > 500 && h('tr', null,
                    h('td', { colSpan: columns.length, style: { textAlign: 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'DM Sans' } },
                        `Showing 500 of ${rows.length.toLocaleString()} rows — export CSV for full dataset`
                    )
                )
            )
        )
    );
}

// ── AI Panel ──────────────────────────────────────────────────────────────────
function AiPanel({ schema, onInsertSql }) {
    const [mode, setMode]       = useState('sql');
    const [input, setInput]     = useState('');
    const [messages, setMsgs]   = useState([]);  // { role, content }
    const [thinking, setThink]  = useState(false);
    const [err, setErr]         = useState('');
    const scrollRef             = useRef(null);
    const inputRef              = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, thinking]);

    async function send() {
        const text = input.trim();
        if (!text || thinking) return;
        setInput('');
        setErr('');
        const newMsgs = [...messages, { role: 'user', content: text }];
        setMsgs(newMsgs);
        setThink(true);
        try {
            const apiMsgs = newMsgs.slice(-10);  // keep context tight
            const reply = await callClaude(apiMsgs, schema, mode);
            setMsgs(m => [...m, { role: 'assistant', content: reply }]);
        } catch (e) {
            setErr(String(e));
        } finally {
            setThink(false);
            setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
        }
    }

    function handleKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    }

    function AiMessage({ msg }) {
        if (msg.role === 'user') return h('div', { className: 'atl-ai-user' }, msg.content);
        const parts = parseAiMessage(msg.content);
        return h('div', { className: 'atl-ai-asst' },
            parts.map((p, i) =>
                p.type === 'sql'
                    ? h('div', { key: i, className: 'atl-ai-code' },
                        h('div', { className: 'atl-ai-code-header' },
                            h('span', null, 'SQL'),
                            h('button', {
                                onClick: () => onInsertSql(p.content),
                                style: btnPrimary('#00d4ff', { padding: '3px 10px', fontSize: 9, letterSpacing: 0.6 }),
                            }, '↑ Insert into editor')
                        ),
                        h('pre', null, p.content)
                    )
                    : h('span', { key: i }, p.content)
            )
        );
    }

    const SUGGESTED = mode === 'sql'
        ? ['Show my open positions by value', 'What are my largest transactions?', 'Visualise portfolio equity over time', 'Which assets have I traded most?']
        : ['What analytics can I build?', 'What P&L views are possible?', 'Suggest risk-monitoring queries', 'Ideas for a daily briefing view'];

    return h('div', {
        className: 'atl-ai-panel',
        style: {
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'linear-gradient(175deg, rgba(88,28,135,0.08) 0%, rgba(7,8,15,0) 60%)',
            border: '1px solid rgba(139,92,246,0.18)', borderRadius: 10, overflow: 'hidden',
        },
    },
        // Header
        h('div', { style: { padding: '12px 14px 10px', borderBottom: '1px solid rgba(139,92,246,0.12)', flexShrink: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
                h('div', { style: { width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 } }, '◈'),
                h('span', { style: { fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.82)', letterSpacing: 0.3 } }, 'ATLAS AI'),
                h('span', { style: { marginLeft: 'auto', padding: '2px 7px', borderRadius: 4, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 9, color: 'rgba(167,139,250,0.8)', fontFamily: 'DM Sans' } }, 'Claude Sonnet'),
                messages.length > 0 && h('button', {
                    onClick: () => setMsgs([]),
                    style: btnGhost({ padding: '2px 7px', fontSize: 9 }),
                    title: 'Clear conversation',
                }, '✕ Clear')
            ),
            // Mode toggle
            h('div', { style: { display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 3 } },
                [['sql', '⚡ SQL'], ['ideas', '💡 Ideas']].map(([m, lbl]) =>
                    h('button', {
                        key: m, onClick: () => setMode(m),
                        style: {
                            flex: 1, padding: '5px 0', border: 'none', borderRadius: 4, cursor: 'pointer',
                            background: mode === m ? 'rgba(139,92,246,0.25)' : 'transparent',
                            color: mode === m ? '#c084fc' : 'rgba(255,255,255,0.35)',
                            fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: mode === m ? 700 : 400,
                            transition: 'all 0.15s',
                        },
                    }, lbl)
                )
            )
        ),

        // Messages
        h('div', {
            ref: scrollRef,
            className: 'atl-ai-scroll',
            style: { flex: 1, overflowY: 'auto', padding: '12px 12px 4px', display: 'flex', flexDirection: 'column', gap: 10 },
        },
            messages.length === 0 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 } },
                h('div', { style: { fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Sans', marginBottom: 6 } },
                    mode === 'sql' ? 'Describe the data you want — I\'ll write the SQL.' : 'Ask me what analytics to build with your portfolio data.'),
                SUGGESTED.map((s, i) =>
                    h('button', {
                        key: i, onClick: () => { setInput(s); setTimeout(send, 0); },
                        style: {
                            textAlign: 'left', padding: '7px 10px', borderRadius: 6,
                            background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.14)',
                            color: 'rgba(255,255,255,0.5)', fontSize: 10.5, fontFamily: 'DM Sans', cursor: 'pointer',
                            transition: 'all 0.12s',
                        },
                        onMouseEnter: e => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; },
                        onMouseLeave: e => { e.currentTarget.style.background = 'rgba(139,92,246,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; },
                    }, s)
                )
            ),
            messages.map((msg, i) => h(AiMessage, { key: i, msg })),
            thinking && h('div', { className: 'atl-ai-asst', style: { padding: 0 } },
                h('div', { className: 'atl-ai-typing' },
                    h('span'), h('span'), h('span')
                )
            ),
            err && h('div', { style: { color: '#f87171', fontSize: 10.5, fontFamily: 'DM Sans', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.18)' } }, err)
        ),

        // Input
        h('div', { style: { padding: '8px 10px', borderTop: '1px solid rgba(139,92,246,0.1)', flexShrink: 0 } },
            h('div', { style: { display: 'flex', gap: 6, alignItems: 'flex-end' } },
                h('textarea', {
                    ref: inputRef,
                    value: input,
                    onChange: e => setInput(e.target.value),
                    onKeyDown: handleKey,
                    placeholder: mode === 'sql' ? 'Ask for a SQL query…' : 'Ask for analytics ideas…',
                    rows: 2,
                    style: {
                        flex: 1, padding: '7px 10px', background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, resize: 'none',
                        color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontFamily: 'DM Sans',
                        outline: 'none', lineHeight: 1.5,
                    },
                }),
                h('button', {
                    onClick: send,
                    disabled: thinking || !input.trim(),
                    style: {
                        ...btnPrimary('#8b5cf6', { padding: '8px 12px', fontSize: 12, alignSelf: 'stretch' }),
                        opacity: (thinking || !input.trim()) ? 0.4 : 1,
                    },
                }, thinking ? '…' : '↑')
            ),
            h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Sans', marginTop: 4 } }, 'Enter to send · Shift+Enter for new line')
        )
    );
}

// ── Saved / History / Insights tabs ──────────────────────────────────────────
function SavedTab({ queries, onLoad, onRefresh }) {
    const [busy, setBusy] = useState(null);
    if (!queries.length) return h('div', { style: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 12, fontFamily: 'DM Sans' } }, 'No saved queries yet.');
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        queries.map(q =>
            h('div', { key: q.id, style: { ...card({ padding: '12px 16px' }) } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                    h('span', { style: { color: q.is_pinned ? '#f59e0b' : 'rgba(255,255,255,0.18)', fontSize: 13 } }, '★'),
                    h('span', { style: { fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.88)', flex: 1 } }, q.name),
                    (q.tags || []).map(t => h('span', { key: t, style: { padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,0.14)', color: '#818cf8', fontSize: 9.5, fontFamily: 'DM Sans' } }, t)),
                    h('div', { style: { display: 'flex', gap: 5, marginLeft: 4 } },
                        h('button', { onClick: () => onLoad(q.sql_text), style: btnPrimary('#00d4ff', { padding: '4px 10px', fontSize: 10 }) }, '▶ Load'),
                        h('button', {
                            disabled: busy === q.id + 'pin',
                            onClick: async () => { setBusy(q.id + 'pin'); if (sb) await sb.from('saved_queries').update({ is_pinned: !q.is_pinned }).eq('id', q.id); await onRefresh(); setBusy(null); },
                            style: btnGhost({ padding: '4px 8px', fontSize: 9 }),
                        }, q.is_pinned ? 'Unpin' : 'Pin'),
                        h('button', {
                            disabled: busy === q.id + 'del',
                            onClick: async () => { setBusy(q.id + 'del'); if (sb) await sb.from('saved_queries').delete().eq('id', q.id); await onRefresh(); setBusy(null); },
                            style: btnGhost({ color: 'rgba(239,68,68,0.55)', padding: '4px 8px', fontSize: 9 }),
                        }, 'Delete')
                    )
                ),
                q.description && h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.32)', fontFamily: 'DM Sans', marginBottom: 6 } }, q.description),
                h('pre', { style: { margin: 0, padding: '8px 12px', background: 'rgba(0,0,0,0.4)', borderRadius: 6, fontSize: 10.5, fontFamily: 'JetBrains Mono', color: 'rgba(0,212,255,0.6)', overflow: 'hidden', maxHeight: 72, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } },
                    q.sql_text.slice(0, 250) + (q.sql_text.length > 250 ? '…' : ''))
            )
        )
    );
}

function HistoryTab({ history, onLoad }) {
    if (!history.length) return h('div', { style: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 12, fontFamily: 'DM Sans' } }, 'No queries run this session.');
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        history.map((sql, i) =>
            h('div', { key: i, style: { ...card({ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }) } },
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(255,255,255,0.2)', minWidth: 18 } }, i + 1),
                h('pre', { style: { flex: 1, margin: 0, fontSize: 10.5, fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    sql.replace(/\s+/g, ' ').trim().slice(0, 110)),
                h('button', { onClick: () => onLoad(sql), style: btnPrimary('#00d4ff', { padding: '4px 10px', fontSize: 10 }) }, '▶ Load')
            )
        )
    );
}

function InsightsTab({ insights, onQuery, onRefresh }) {
    const schedBadge = { manual: ['rgba(148,163,184,0.12)', '#94a3b8', '● Manual'], on_sync: ['rgba(52,211,153,0.12)', '#34d399', '↻ On Sync'], daily: ['rgba(96,165,250,0.12)', '#60a5fa', '◷ Daily'] };
    if (!insights.length) return h('div', { style: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 12, fontFamily: 'DM Sans' } }, 'No materialized tables yet. Run a query → Route to Supabase.');
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        insights.map(ins => {
            const [bg, col, lbl] = schedBadge[ins.refresh_schedule] || schedBadge.manual;
            return h('div', { key: ins.id, style: { ...card({ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }) } },
                h('div', { style: { flex: 1 } },
                    h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#c084fc', marginBottom: 4 } }, ins.table_name),
                    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                        h('span', { style: { padding: '2px 8px', borderRadius: 4, background: bg, color: col, fontSize: 9.5, fontFamily: 'DM Sans' } }, lbl),
                        h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Sans' } },
                            (ins.row_count || 0).toLocaleString() + ' rows · refreshed ' + (ins.last_refreshed_at ? ins.last_refreshed_at.slice(0, 10) : '—'))
                    )
                ),
                h('button', { onClick: () => onQuery(`SELECT *\nFROM ${ins.table_name}\nLIMIT 100;`), style: btnPrimary('#8b5cf6', { padding: '5px 12px', fontSize: 10 }) }, '▶ Query')
            );
        })
    );
}

// ── Save modal ─────────────────────────────────────────────────────────────────
function SaveModal({ sql, onClose, onSaved }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [tags, setTags] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState('');

    async function go() {
        if (!name.trim()) { setErr('Name is required.'); return; }
        setBusy(true);
        try {
            await sb.from('saved_queries').insert({ name: name.trim(), description: desc.trim(), sql_text: sql, tags: tags.split(',').map(t => t.trim()).filter(Boolean) });
            onSaved(); onClose();
        } catch (e) { setErr(String(e)); setBusy(false); }
    }

    const inp = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'DM Sans', outline: 'none' };
    return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } },
        h('div', { style: { background: '#0b0d17', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: 28, width: 420, maxWidth: '90vw' } },
            h('div', { style: { fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 20 } }, '💾 Save Query'),
            ['Name *', 'Description', 'Tags (comma-separated)'].map((lbl, i) =>
                h('div', { key: i, style: { marginBottom: 12 } },
                    h('div', { style: { ...label, marginBottom: 5 } }, lbl),
                    h('input', { style: inp, value: [name, desc, tags][i], onChange: e => [setName, setDesc, setTags][i](e.target.value), placeholder: ['e.g. Top Winners', 'Optional', 'e.g. positions, risk'][i] })
                )
            ),
            err && h('div', { style: { color: '#f87171', fontSize: 11, marginBottom: 12, fontFamily: 'DM Sans' } }, err),
            h('div', { style: { display: 'flex', gap: 10 } },
                h('button', { onClick: go, disabled: busy, style: { ...btnPrimary('#6366f1'), flex: 1, textAlign: 'center' } }, busy ? 'Saving…' : '✓ Save'),
                h('button', { onClick: onClose, style: { ...btnGhost(), flex: 1, textAlign: 'center', padding: '7px 14px' } }, 'Cancel')
            )
        )
    );
}

// ── Materialize modal ─────────────────────────────────────────────────────────
function MatModal({ sql, onClose, onDone }) {
    const [suffix, setSuffix]   = useState('');
    const [sched, setSched]     = useState('manual');
    const [busy, setBusy]       = useState(false);
    const [err, setErr]         = useState('');

    async function go() {
        const s = suffix.trim().toLowerCase();
        if (!s) { setErr('Table name suffix is required.'); return; }
        if (!/^[a-z][a-z0-9_]{0,54}$/.test(s)) { setErr('Lowercase letters, digits, underscores only (max 55 chars).'); return; }
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('materialize_insight', { p_table_name: s, p_sql_text: sql, p_source_query_id: null, p_refresh_schedule: sched });
            if (error) throw new Error(error.message);
            onDone(data); onClose();
        } catch (e) { setErr(String(e)); setBusy(false); }
    }

    return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } },
        h('div', { style: { background: '#0b0d17', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 12, padding: 28, width: 440, maxWidth: '90vw' } },
            h('div', { style: { fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 6 } }, '🚀 Route to Supabase'),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.32)', fontFamily: 'DM Sans', marginBottom: 18 } }, 'Materialise this query result as a persistent table prefixed with insight_.'),
            h('div', { style: { marginBottom: 14 } },
                h('div', { style: { ...label, marginBottom: 5 } }, 'TABLE NAME SUFFIX *'),
                h('div', { style: { display: 'flex' } },
                    h('span', { style: { padding: '8px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRight: 'none', borderRadius: '6px 0 0 6px', fontSize: 11.5, fontFamily: 'JetBrains Mono', color: '#34d399' } }, 'insight_'),
                    h('input', { value: suffix, onChange: e => setSuffix(e.target.value), placeholder: 'top_winners', style: { flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.09)', borderLeft: 'none', borderRadius: '0 6px 6px 0', color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'JetBrains Mono', outline: 'none' } })
                )
            ),
            h('div', { style: { marginBottom: 20 } },
                h('div', { style: { ...label, marginBottom: 5 } }, 'REFRESH SCHEDULE'),
                h('div', { style: { display: 'flex', gap: 6 } },
                    ['manual', 'on_sync', 'daily'].map(s =>
                        h('button', { key: s, onClick: () => setSched(s), style: { ...btnGhost({ flex: 1, textAlign: 'center', padding: '6px 0' }), ...(sched === s ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' } : {}) } }, s)
                    )
                )
            ),
            err && h('div', { style: { color: '#f87171', fontSize: 11, marginBottom: 12, fontFamily: 'DM Sans' } }, err),
            h('div', { style: { display: 'flex', gap: 10 } },
                h('button', { onClick: go, disabled: busy, style: { ...btnPrimary('#10b981'), flex: 1, textAlign: 'center' } }, busy ? 'Materialising…' : '✓ Materialise'),
                h('button', { onClick: onClose, style: { ...btnGhost(), flex: 1, textAlign: 'center', padding: '7px 14px' } }, 'Cancel')
            )
        )
    );
}

// ── Main component ────────────────────────────────────────────────────────────
const STARTER_SQL = `-- ATLAS SQL Terminal  ·  Ctrl+Enter / ⌘+Enter to run
-- Read-only · 10,000-row auto-limit · Ask ATLAS AI for query ideas

SELECT
  a.symbol,
  a.asset_class,
  p.quantity,
  p.average_cost,
  p.market_value,
  ROUND((p.market_value - p.quantity * p.average_cost)::numeric, 2) AS unrealized_pl,
  p.as_of_date
FROM positions p
JOIN assets a ON a.id = p.asset_id
WHERE p.quantity > 0
ORDER BY p.market_value DESC
LIMIT 20;`;

const STARTERS = [
    { name: 'Current Open Positions', description: 'Live holdings with symbol & metadata', tags: ['positions', 'holdings'], is_pinned: true, sql_text: `SELECT\n  a.symbol, a.name, a.asset_class, a.sector,\n  p.quantity, p.average_cost, p.market_value,\n  ROUND((p.market_value - p.quantity * p.average_cost)::numeric, 2) AS unrealized_pl,\n  p.as_of_date\nFROM positions p JOIN assets a ON a.id = p.asset_id\nWHERE p.quantity > 0 ORDER BY p.market_value DESC LIMIT 50;` },
    { name: 'Top Transactions by Notional', description: 'Largest trades — qty × price', tags: ['transactions', 'trades'], is_pinned: true, sql_text: `SELECT a.symbol, t.transaction_type, t.quantity, t.price,\n  ROUND((t.quantity * t.price)::numeric, 2) AS notional_value,\n  t.fees, t.transaction_date\nFROM transactions t JOIN assets a ON a.id = t.asset_id\nORDER BY notional_value DESC LIMIT 30;` },
    { name: 'Transaction Volume by Symbol', description: 'Trade count and total notional per ticker', tags: ['transactions'], sql_text: `SELECT a.symbol, COUNT(*) AS trades,\n  SUM(CASE WHEN t.transaction_type='buy' THEN 1 ELSE 0 END) AS buys,\n  SUM(CASE WHEN t.transaction_type='sell' THEN 1 ELSE 0 END) AS sells,\n  ROUND(SUM(t.quantity * t.price)::numeric, 2) AS total_notional\nFROM transactions t JOIN assets a ON a.id = t.asset_id\nGROUP BY a.symbol ORDER BY trades DESC LIMIT 30;` },
    { name: 'Portfolio Equity Curve', description: 'Historical equity and P&L', tags: ['performance', 'history'], sql_text: `SELECT ts, ROUND(equity::numeric, 2) AS equity,\n  ROUND(profit_loss::numeric, 2) AS profit_loss,\n  ROUND(profit_loss_pct::numeric, 4) AS pnl_pct, timeframe\nFROM portfolio_equity_curve ORDER BY ts DESC LIMIT 90;` },
    { name: 'Account Snapshots — Latest 30', description: 'Cash, equity, buying power from Alpaca sync', tags: ['account'], sql_text: `SELECT as_of, ROUND(cash::numeric, 2) AS cash,\n  ROUND(equity::numeric, 2) AS equity,\n  ROUND(buying_power::numeric, 2) AS buying_power,\n  ROUND(portfolio_value::numeric, 2) AS portfolio_value\nFROM account_snapshots ORDER BY as_of DESC LIMIT 30;` },
    { name: 'Latest Closing Prices', description: 'Most recent close per asset', tags: ['prices', 'market-data'], sql_text: `SELECT a.symbol, ph.price_date, ph.open, ph.high, ph.low, ph.close, ph.volume\nFROM price_history ph JOIN assets a ON a.id = ph.asset_id\nWHERE ph.price_date = (SELECT MAX(price_date) FROM price_history)\nORDER BY a.symbol;` },
    { name: 'Assets by Class & Sector', description: 'Universe diversification overview', tags: ['assets'], sql_text: `SELECT asset_class, sector, COUNT(*) AS count,\n  STRING_AGG(symbol, ', ' ORDER BY symbol) AS symbols\nFROM assets GROUP BY asset_class, sector ORDER BY asset_class, count DESC;` },
    { name: 'Sync Log — Recent Runs', description: 'Alpaca pipeline health', tags: ['sync', 'ops'], sql_text: `SELECT started_at, status, source, positions_upserted,\n  transactions_upserted, prices_upserted, duration_ms, error_message\nFROM sync_log ORDER BY started_at DESC LIMIT 20;` },
    { name: 'Position History — Daily Snapshots', description: 'Open positions and MV per date', tags: ['positions', 'history'], sql_text: `SELECT as_of_date, COUNT(*) AS rows,\n  SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) AS open,\n  ROUND(SUM(market_value)::numeric, 2) AS total_mv\nFROM positions GROUP BY as_of_date ORDER BY as_of_date DESC LIMIT 60;` },
    { name: 'Schema Explorer', description: 'All public tables and columns', tags: ['meta', 'schema'], sql_text: `SELECT table_name, column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_schema = 'public'\nORDER BY table_name, ordinal_position;` },
];

export function SqlTerminal() {
    // CSS injection
    useEffect(() => {
        if (!document.getElementById('atl-sql-css')) {
            const s = document.createElement('style');
            s.id = 'atl-sql-css';
            s.textContent = STYLES;
            document.head.appendChild(s);
        }
    }, []);

    const editorRef = useRef(null);

    // State
    const [sql, setSql]           = useState(STARTER_SQL);
    const [result, setResult]     = useState(null);
    const [running, setRunning]   = useState(false);
    const [sortCol, setSortCol]   = useState(null);
    const [sortDir, setSortDir]   = useState('asc');
    const [schema, setSchema]     = useState({});
    const [saved, setSaved]       = useState([]);
    const [history, setHistory]   = useState([]);
    const [insights, setInsights] = useState([]);
    const [seeded, setSeeded]     = useState(false);
    const [activeTab, setTabA]    = useState('saved');
    const [showAi, setShowAi]     = useState(false);
    const [showSave, setShowSave] = useState(false);
    const [showMat, setShowMat]   = useState(false);
    const [toast, setToast]       = useState('');

    function showT(msg, ms = 3000) { setToast(msg); setTimeout(() => setToast(''), ms); }

    // Wire schema refresh to window global (used by SchemaPanel refresh button)
    window._atlasSchemaRefresh = () => fetchSchema().then(setSchema);

    // Load on mount
    useEffect(() => {
        fetchSchema().then(setSchema);
        refreshSaved();
        refreshInsights();
    }, []);

    async function refreshSaved() {
        const qs = await loadSaved();
        setSaved(qs);
        if (qs.length === 0 && !seeded) {
            setSeeded(true);
            if (sb) { try { await sb.from('saved_queries').insert(STARTERS); } catch (_) {} const fresh = await loadSaved(); setSaved(fresh); }
        }
    }
    async function refreshInsights() {
        if (!sb) return;
        const { data } = await sb.from('materialized_insights').select('*').order('created_at', { ascending: false });
        setInsights(data || []);
    }

    // Run query
    async function runQuery() {
        const err = validateSql(sql);
        if (err) { showT('🚫 ' + err); return; }
        const bounded = ensureLimit(sql);
        setRunning(true);
        const r = await execSql(bounded);
        setRunning(false);
        setSortCol(null);
        setResult(r);
        setHistory(h => [sql, ...h.filter(x => x !== sql)].slice(0, 50));
        logQuery(sql, r.ms, r.rows.length, r.err);
    }

    // Sorted rows
    const sortedRows = useMemo(() => {
        if (!result || !sortCol) return result ? result.rows : [];
        return [...result.rows].sort((a, b) => {
            const va = a[sortCol], vb = b[sortCol];
            if (va == null) return 1; if (vb == null) return -1;
            const cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [result, sortCol, sortDir]);

    function onSort(col) { setSortCol(c => c === col ? col : col); setSortDir(d => sortCol === col ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }

    function insertAtCursor(text) {
        const ta = editorRef.current;
        if (!ta) { setSql(s => s + ' ' + text); return; }
        const s = ta.selectionStart, e = ta.selectionEnd;
        setSql(sql.slice(0, s) + text + sql.slice(e));
        setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length; }, 0);
    }

    // Bottom tabs
    const BTABS = [
        { id: 'saved',    label: '💾 Saved', count: saved.length },
        { id: 'history',  label: '📜 History', count: history.length },
        { id: 'insights', label: '🗄 Materialized', count: insights.length },
    ];

    // Grid layout
    const gridCols = showAi ? '1fr 340px 200px' : '1fr 220px';

    return h('div', { style: { paddingBottom: 48 } },

        // Toast
        toast && h('div', { style: { position: 'fixed', top: 18, right: 22, zIndex: 10000, background: '#0d0f1c', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '9px 18px', color: '#fca5a5', fontSize: 12, fontFamily: 'DM Sans', boxShadow: '0 4px 32px rgba(0,0,0,0.6)', animation: 'fadeInUp 0.2s ease-out' } }, toast),

        // Modals
        showSave && h(SaveModal, { sql, onClose: () => setShowSave(false), onSaved: () => { refreshSaved(); showT('✓ Query saved'); } }),
        showMat  && result && h(MatModal, { sql: ensureLimit(sql), onClose: () => setShowMat(false), onDone: d => { refreshInsights(); showT(`✓ Created ${d?.table_name || 'insight table'}`); } }),

        // ── Hero header ─────────────────────────────────────────────────────────
        h('div', { style: {
            position: 'relative', marginBottom: 20, borderRadius: 12, overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 40%, rgba(0,212,255,0.04) 100%)',
            border: '1px solid rgba(99,102,241,0.18)',
        } },
            h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #00d4ff)' } }),
            h('div', { style: { padding: '20px 24px 18px', display: 'flex', alignItems: 'center', gap: 18 } },
                h('div', { style: { width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 0 20px rgba(99,102,241,0.35)' } }, '▣'),
                h('div', null,
                    h('div', { style: { fontSize: 8, letterSpacing: 2.5, color: 'rgba(99,102,241,0.7)', fontFamily: 'DM Sans', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 } }, 'ATLAS · SYSTEM'),
                    h('h2', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.94)', margin: '0 0 3px', letterSpacing: -0.3 } }, 'SQL Terminal'),
                    h('div', { style: { fontSize: 11.5, color: 'rgba(255,255,255,0.32)', fontFamily: 'DM Sans' } }, 'Query your portfolio universe · Read-only · Supabase PostgreSQL · 10k row cap')
                ),
                h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' } },
                    sb && h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' } },
                        h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', animation: 'glowPulse 2s ease-in-out infinite' } }),
                        h('span', { style: { fontSize: 10, fontFamily: 'DM Sans', fontWeight: 600, color: '#10b981', letterSpacing: 0.5 } }, 'LIVE')
                    ),
                    h('button', {
                        onClick: () => setShowAi(v => !v),
                        style: {
                            ...btnPrimary('#8b5cf6', { padding: '8px 16px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 7 }),
                            ...(showAi ? { background: 'rgba(139,92,246,0.28)', borderColor: 'rgba(139,92,246,0.55)' } : {}),
                        },
                    },
                        h('div', { style: { width: 16, height: 16, borderRadius: 4, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 } }, '◈'),
                        showAi ? 'Close ATLAS AI' : 'Open ATLAS AI'
                    )
                )
            )
        ),

        // ── Main grid ─────────────────────────────────────────────────────────────
        h('div', { style: { display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 14, transition: 'grid-template-columns 0.2s ease', alignItems: 'start' } },

            // LEFT: editor + results
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 } },

                // Editor card
                h('div', { style: { borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.18)' } },
                    // Toolbar
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(0,0,0,0.3))', borderBottom: '1px solid rgba(99,102,241,0.1)' } },
                        h('span', { style: { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', fontFamily: 'DM Sans' } }, 'SQL EDITOR'),
                        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center' } },
                            h('button', {
                                onClick: runQuery, disabled: running,
                                className: 'atl-run-btn',
                                style: {
                                    ...btnPrimary('#00d4ff', { minWidth: 130, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }),
                                    ...(running ? { opacity: 0.6 } : { boxShadow: '0 0 14px rgba(0,212,255,0.2)' }),
                                },
                            }, h('span', null, running ? '⟳' : '▶'), running ? ' Running…' : ' Run  ⌘↵'),
                            h('button', { onClick: () => setShowSave(true), style: btnPrimary('#6366f1', {}) }, '💾 Save'),
                            result && result.rows.length > 0 && h('button', {
                                onClick: () => downloadCsv(sortedRows, result.columns, `atlas_${new Date().toISOString().slice(0,10)}.csv`),
                                style: btnGhost({}),
                            }, '↓ CSV'),
                            result && result.rows.length > 0 && h('button', { onClick: () => setShowMat(true), style: btnPrimary('#10b981', {}) }, '🚀 Route to DB'),
                        )
                    ),
                    h(SqlEditor, { value: sql, onChange: setSql, onRun: runQuery, editorRef })
                ),

                // Metadata bar
                result && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '7px 14px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, flexWrap: 'wrap', gap: 10 } },
                    result.err
                        ? h('span', { style: { color: '#f87171', fontFamily: 'DM Sans', fontSize: 11.5 } }, '✗ ' + result.err)
                        : [
                            h('span', { key: 'ok', style: { color: '#10b981', fontSize: 12 } }, '✓'),
                            h('span', { key: 'rows', style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: '#a5b4fc' } }, `${result.rows.length.toLocaleString()} rows`),
                            h('span', { key: 'ms', style: { color: 'rgba(255,255,255,0.25)', fontSize: 10.5, fontFamily: 'DM Sans' } }, `· ${result.ms}ms`),
                            result.columns.length > 0 && h('span', { key: 'cols', style: { color: 'rgba(0,212,255,0.45)', fontSize: 10, fontFamily: 'DM Sans' } }, `· ${result.columns.length} columns`),
                        ]
                ),

                // Results
                result && !result.err && result.rows.length > 0 && h(ResultsTable, { rows: sortedRows, columns: result.columns, sortCol, sortDir, onSort }),
                result && !result.err && result.rows.length === 0 && h('div', { style: { color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Sans', fontSize: 12, padding: '10px 0' } }, 'Query returned 0 rows.'),
            ),

            // CENTRE: AI panel (when open)
            showAi && h(AiPanel, {
                schema,
                onInsertSql: newSql => { setSql(newSql); editorRef.current && editorRef.current.focus(); showT('✓ SQL inserted into editor'); },
            }),

            // RIGHT: schema sidebar
            h('div', { style: { ...card({ padding: 0, overflow: 'hidden' }), height: 560, display: 'flex', flexDirection: 'column' } },
                h(SchemaPanel, { schema, onInsert: insertAtCursor })
            )
        ),

        // ── Bottom tabs ───────────────────────────────────────────────────────────
        h('div', { style: card({ padding: 0, overflow: 'hidden' }) },
            h('div', { style: { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingLeft: 4 } },
                BTABS.map(tab => {
                    const active = activeTab === tab.id;
                    return h('button', {
                        key: tab.id, onClick: () => setTabA(tab.id),
                        style: {
                            padding: '11px 18px 13px', border: 'none', cursor: 'pointer',
                            borderBottom: '2px solid ' + (active ? '#00d4ff' : 'transparent'),
                            background: 'transparent', color: active ? '#00d4ff' : 'rgba(255,255,255,0.35)',
                            fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: active ? 700 : 400,
                            transition: 'all 0.14s', marginBottom: -1,
                            display: 'flex', alignItems: 'center', gap: 7,
                        },
                    },
                        tab.label,
                        tab.count > 0 && h('span', { style: { padding: '1px 7px', borderRadius: 10, background: active ? 'rgba(0,212,255,0.14)' : 'rgba(255,255,255,0.05)', color: active ? '#00d4ff' : 'rgba(255,255,255,0.28)', fontSize: 9 } }, tab.count)
                    );
                })
            ),
            h('div', { style: { padding: '14px 16px' } },
                activeTab === 'saved'    && h(SavedTab, { queries: saved, onLoad: q => { setSql(q); window.scrollTo({ top: 0, behavior: 'smooth' }); }, onRefresh: refreshSaved }),
                activeTab === 'history'  && h(HistoryTab, { history, onLoad: q => { setSql(q); window.scrollTo({ top: 0, behavior: 'smooth' }); } }),
                activeTab === 'insights' && h(InsightsTab, { insights, onQuery: q => { setSql(q); window.scrollTo({ top: 0, behavior: 'smooth' }); }, onRefresh: refreshInsights })
            )
        )
    );
}
