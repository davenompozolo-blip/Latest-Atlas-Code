"""
ATLAS SQL Terminal — Interactive Supabase query interface.

A first-class ATLAS module for exploring the portfolio database in real time,
saving discoveries, and routing insights back to Supabase as materialised tables.

Read-only by default. Write path (materialise) is isolated to a separate RPC.
"""

from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Optional

import pandas as pd
import streamlit as st

# ── Safety constants ───────────────────────────────────────────────────────────
_WRITE_KW = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE)\b",
    re.IGNORECASE,
)
_SYS_SCHEMA = re.compile(
    r"\b(pg_catalog|pg_class|pg_proc|pg_stat_activity|pg_toast)\b",
    re.IGNORECASE,
)
_DEFAULT_LIMIT = 10_000


# ── Supabase helpers ────────────────────────────────────────────────────────────

def _client():
    from services.supabase_client import get_supabase_client
    return get_supabase_client()


def _validate_sql(sql: str) -> tuple[bool, str]:
    s = sql.strip()
    if not s:
        return False, "Query is empty."
    m = _WRITE_KW.search(s)
    if m:
        return False, f"'{m.group(0).upper()}' is not permitted — SQL Terminal is read-only."
    if _SYS_SCHEMA.search(s):
        return False, "Access to pg system catalogues is restricted."
    return True, ""


def _ensure_limit(sql: str, limit: int = _DEFAULT_LIMIT) -> str:
    sql = sql.rstrip().rstrip(";")
    if re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
        return sql
    return f"{sql}\nLIMIT {limit}"


def _exec_sql(sql: str) -> dict:
    t0 = time.time()
    try:
        res = _client().rpc("run_read_sql", {"sql_text": sql}).execute()
        elapsed = int((time.time() - t0) * 1000)
        data = res.data
        # PostgREST may return the jsonb as-is (list) or wrapped
        if isinstance(data, list):
            rows = data
        elif data is None:
            rows = []
        else:
            rows = [data] if isinstance(data, dict) else []

        df = pd.DataFrame(rows) if rows else pd.DataFrame()
        return {"ok": True, "df": df, "rows": len(df), "ms": elapsed, "err": None}
    except Exception as exc:
        elapsed = int((time.time() - t0) * 1000)
        return {"ok": False, "df": pd.DataFrame(), "rows": 0, "ms": elapsed, "err": str(exc)}


def _log_query(sql: str, ms: int, rows: int, err: Optional[str], saved: bool = False):
    try:
        _client().table("query_log").insert({
            "sql_text": sql[:4000],
            "execution_time_ms": ms,
            "row_count": rows,
            "was_saved": saved,
            "error": err,
        }).execute()
    except Exception:
        pass  # Non-critical


@st.cache_data(ttl=300, show_spinner=False)
def _fetch_schema() -> dict:
    schema_sql = """
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT IN ('spatial_ref_sys')
    ORDER BY table_name, ordinal_position
    """
    r = _exec_sql(schema_sql)
    schema: dict = {}
    if r["ok"] and not r["df"].empty:
        for _, row in r["df"].iterrows():
            tbl = row["table_name"]
            schema.setdefault(tbl, []).append({
                "name": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
            })
    return schema


def _load_saved() -> list:
    try:
        res = (
            _client()
            .table("saved_queries")
            .select("*")
            .order("is_pinned", desc=True)
            .order("updated_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def _save_query(name: str, desc: str, sql: str, tags: list) -> bool:
    try:
        _client().table("saved_queries").insert({
            "name": name,
            "description": desc,
            "sql_text": sql,
            "tags": tags,
        }).execute()
        return True
    except Exception as e:
        st.error(f"Save failed: {e}")
        return False


def _delete_query(qid: str):
    try:
        _client().table("saved_queries").delete().eq("id", qid).execute()
    except Exception as e:
        st.error(f"Delete failed: {e}")


def _toggle_pin(qid: str, pinned: bool):
    try:
        _client().table("saved_queries").update({"is_pinned": pinned}).eq("id", qid).execute()
    except Exception as e:
        st.error(f"Pin failed: {e}")


def _type_icon(dt: str) -> str:
    dt = dt.lower()
    if any(x in dt for x in ("int", "float", "numeric", "double", "decimal", "real", "money")):
        return "#"
    if "timestamp" in dt or "date" in dt or "time" in dt:
        return "📅"
    if "bool" in dt:
        return "✓"
    if "[]" in dt or "array" in dt or "json" in dt:
        return "[]"
    return "T"


# ── Starter query library (seeded once, uses real column names) ────────────────

_STARTER_QUERIES = [
    {
        "name": "Current Open Positions",
        "description": "Live holdings with symbol and asset metadata",
        "sql_text": (
            "SELECT\n"
            "  a.symbol,\n"
            "  a.name,\n"
            "  a.asset_class,\n"
            "  a.sector,\n"
            "  p.quantity,\n"
            "  p.average_cost,\n"
            "  p.market_value,\n"
            "  ROUND((p.market_value - p.quantity * p.average_cost)::numeric, 2) AS unrealized_pl,\n"
            "  p.as_of_date\n"
            "FROM positions p\n"
            "JOIN assets a ON a.id = p.asset_id\n"
            "WHERE p.quantity > 0\n"
            "ORDER BY p.market_value DESC\n"
            "LIMIT 50;"
        ),
        "tags": ["positions", "holdings"],
        "is_pinned": True,
    },
    {
        "name": "Top Transactions by Notional Value",
        "description": "Largest trades — quantity × price",
        "sql_text": (
            "SELECT\n"
            "  a.symbol,\n"
            "  t.transaction_type,\n"
            "  t.quantity,\n"
            "  t.price,\n"
            "  ROUND((t.quantity * t.price)::numeric, 2) AS notional_value,\n"
            "  t.fees,\n"
            "  t.transaction_date\n"
            "FROM transactions t\n"
            "JOIN assets a ON a.id = t.asset_id\n"
            "ORDER BY notional_value DESC\n"
            "LIMIT 30;"
        ),
        "tags": ["transactions", "trades"],
        "is_pinned": True,
    },
    {
        "name": "Transaction Volume by Symbol",
        "description": "How many times each ticker has been traded",
        "sql_text": (
            "SELECT\n"
            "  a.symbol,\n"
            "  COUNT(*) AS trades,\n"
            "  SUM(CASE WHEN t.transaction_type = 'buy'  THEN 1 ELSE 0 END) AS buys,\n"
            "  SUM(CASE WHEN t.transaction_type = 'sell' THEN 1 ELSE 0 END) AS sells,\n"
            "  ROUND(SUM(t.quantity * t.price)::numeric, 2) AS total_notional\n"
            "FROM transactions t\n"
            "JOIN assets a ON a.id = t.asset_id\n"
            "GROUP BY a.symbol\n"
            "ORDER BY trades DESC\n"
            "LIMIT 30;"
        ),
        "tags": ["transactions", "activity"],
    },
    {
        "name": "Portfolio Equity Curve",
        "description": "Equity and P&L over time",
        "sql_text": (
            "SELECT\n"
            "  ts,\n"
            "  ROUND(equity::numeric, 2)          AS equity,\n"
            "  ROUND(profit_loss::numeric, 2)      AS profit_loss,\n"
            "  ROUND(profit_loss_pct::numeric, 4)  AS pnl_pct,\n"
            "  timeframe\n"
            "FROM portfolio_equity_curve\n"
            "ORDER BY ts DESC\n"
            "LIMIT 90;"
        ),
        "tags": ["performance", "history"],
    },
    {
        "name": "Account Snapshots — Latest 30",
        "description": "Account-level cash, equity, and buying power from Alpaca sync",
        "sql_text": (
            "SELECT\n"
            "  as_of,\n"
            "  ROUND(cash::numeric, 2)             AS cash,\n"
            "  ROUND(equity::numeric, 2)            AS equity,\n"
            "  ROUND(buying_power::numeric, 2)      AS buying_power,\n"
            "  ROUND(portfolio_value::numeric, 2)   AS portfolio_value,\n"
            "  ROUND(long_market_value::numeric, 2) AS long_market_value\n"
            "FROM account_snapshots\n"
            "ORDER BY as_of DESC\n"
            "LIMIT 30;"
        ),
        "tags": ["account", "snapshot"],
    },
    {
        "name": "Position History — Daily Snapshot Count",
        "description": "How many position rows exist per date (shows sync cadence)",
        "sql_text": (
            "SELECT\n"
            "  as_of_date,\n"
            "  COUNT(*)                                    AS position_rows,\n"
            "  SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) AS open_positions,\n"
            "  ROUND(SUM(market_value)::numeric, 2)        AS total_market_value\n"
            "FROM positions\n"
            "GROUP BY as_of_date\n"
            "ORDER BY as_of_date DESC\n"
            "LIMIT 60;"
        ),
        "tags": ["positions", "history"],
    },
    {
        "name": "Price History — Latest Closes",
        "description": "Most recent closing price for every asset",
        "sql_text": (
            "SELECT\n"
            "  a.symbol,\n"
            "  ph.price_date,\n"
            "  ph.open,\n"
            "  ph.high,\n"
            "  ph.low,\n"
            "  ph.close,\n"
            "  ph.volume\n"
            "FROM price_history ph\n"
            "JOIN assets a ON a.id = ph.asset_id\n"
            "WHERE ph.price_date = (SELECT MAX(price_date) FROM price_history)\n"
            "ORDER BY a.symbol;"
        ),
        "tags": ["prices", "market-data"],
    },
    {
        "name": "Assets by Class & Sector",
        "description": "Asset universe — diversification overview",
        "sql_text": (
            "SELECT\n"
            "  asset_class,\n"
            "  sector,\n"
            "  COUNT(*)                         AS count,\n"
            "  STRING_AGG(symbol, ', ' ORDER BY symbol) AS symbols\n"
            "FROM assets\n"
            "GROUP BY asset_class, sector\n"
            "ORDER BY asset_class, count DESC;"
        ),
        "tags": ["assets", "diversification"],
    },
    {
        "name": "Sync Log — Recent Runs",
        "description": "Alpaca → Supabase pipeline health",
        "sql_text": (
            "SELECT\n"
            "  started_at,\n"
            "  status,\n"
            "  source,\n"
            "  positions_upserted,\n"
            "  transactions_upserted,\n"
            "  prices_upserted,\n"
            "  duration_ms,\n"
            "  error_message\n"
            "FROM sync_log\n"
            "ORDER BY started_at DESC\n"
            "LIMIT 20;"
        ),
        "tags": ["sync", "ops"],
    },
    {
        "name": "Schema Explorer",
        "description": "Browse all public tables and columns",
        "sql_text": (
            "SELECT\n"
            "  table_name,\n"
            "  column_name,\n"
            "  data_type,\n"
            "  is_nullable\n"
            "FROM information_schema.columns\n"
            "WHERE table_schema = 'public'\n"
            "ORDER BY table_name, ordinal_position;"
        ),
        "tags": ["meta", "schema"],
    },
]


def _seed_starters():
    """Insert starter queries if the table is empty. Idempotent."""
    if st.session_state.get("_sql_starters_seeded"):
        return
    try:
        existing = _client().table("saved_queries").select("id").limit(1).execute()
        if existing.data:
            st.session_state["_sql_starters_seeded"] = True
            return
        _client().table("saved_queries").insert(_STARTER_QUERIES).execute()
        st.session_state["_sql_starters_seeded"] = True
    except Exception:
        st.session_state["_sql_starters_seeded"] = True


# ── CSS ─────────────────────────────────────────────────────────────────────────

_CSS = """
<style>
/* SQL editor textarea */
textarea[data-testid="stTextArea"] {
    font-family: 'Space Mono', 'Fira Code', monospace !important;
    font-size: 0.78rem !important;
    background: rgba(7, 8, 15, 0.95) !important;
    color: rgba(255, 255, 255, 0.92) !important;
    border: 1px solid rgba(139, 92, 246, 0.35) !important;
    border-radius: 8px !important;
    line-height: 1.55 !important;
}
textarea[data-testid="stTextArea"]:focus {
    border-color: rgba(139, 92, 246, 0.65) !important;
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15) !important;
}
.sql-meta {
    font-family: 'Space Mono', monospace;
    font-size: 0.68rem;
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.03);
    margin: 0.4rem 0 0.6rem 0;
    color: rgba(255,255,255,0.5);
}
.sql-meta .ok  { color: #10b981; font-weight: 700; }
.sql-meta .err { color: #ef4444; font-weight: 700; }
.sql-meta .num { color: rgba(165,180,252,0.9); }
.schema-hdr {
    font-family: 'Space Mono', monospace;
    font-size: 0.6rem;
    color: rgba(139,92,246,0.75);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin: 0.75rem 0 0.25rem 0;
}
.schema-col-row {
    font-family: 'Space Mono', monospace;
    font-size: 0.6rem;
    color: rgba(255,255,255,0.45);
    padding: 0.08rem 0 0.08rem 0.6rem;
    white-space: nowrap;
    overflow: hidden;
}
.schema-type { color: rgba(139,92,246,0.6); margin-left: 0.3rem; }
.insight-badge-manual  { color: #94a3b8; }
.insight-badge-on_sync { color: #34d399; }
.insight-badge-daily   { color: #60a5fa; }
</style>
"""

# ── Keyboard shortcut injection ──────────────────────────────────────────────────
_KBD_JS = """
<script>
(function() {
  function attachShortcut() {
    var frame = window.parent.document;
    frame.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        var btns = frame.querySelectorAll('[data-testid="baseButton-primary"]');
        if (btns.length > 0) btns[0].click();
      }
    }, { capture: true });
  }
  if (document.readyState === 'complete') attachShortcut();
  else window.addEventListener('load', attachShortcut);
})();
</script>
"""


# ── Sub-renderers ────────────────────────────────────────────────────────────────

def _render_schema_sidebar():
    st.markdown('<p class="schema-hdr">📋 Schema Browser</p>', unsafe_allow_html=True)
    if st.button("↺ Refresh", key="schema_refresh", help="Reload schema from Supabase"):
        _fetch_schema.clear()
        st.rerun()

    with st.spinner("Loading…"):
        schema = _fetch_schema()

    if not schema:
        st.caption("Schema unavailable — check Supabase connection.")
        return

    for tbl, cols in sorted(schema.items()):
        with st.expander(f"**{tbl}**", expanded=False):
            for col in cols:
                icon = _type_icon(col["type"])
                short_type = col["type"][:14]
                st.markdown(
                    f'<div class="schema-col-row">{icon} {col["name"]}'
                    f'<span class="schema-type">{short_type}</span></div>',
                    unsafe_allow_html=True,
                )
            # Click-to-insert buttons per column
            for col in cols:
                if st.button(
                    f"+ {col['name']}",
                    key=f"ins_{tbl}_{col['name']}",
                    help=f"Insert {tbl}.{col['name']} into editor",
                ):
                    cur = st.session_state.get("sql_text", "")
                    st.session_state["sql_text"] = cur.rstrip() + f"\n{tbl}.{col['name']}"
                    st.rerun()


def _render_save_modal(sql: str):
    st.markdown("---")
    st.markdown("#### 💾 Save Query")
    name = st.text_input("Name *", key="save_name")
    desc = st.text_input("Description (optional)", key="save_desc")
    tags_raw = st.text_input("Tags — comma-separated", key="save_tags")
    c1, c2 = st.columns(2)
    with c1:
        if st.button("✓ Confirm Save", type="primary", key="confirm_save_btn"):
            if name.strip():
                tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
                if _save_query(name.strip(), desc.strip(), sql, tags):
                    st.success(f"Saved '{name.strip()}'")
                    st.session_state["show_save_modal"] = False
                    st.rerun()
            else:
                st.warning("Please provide a query name.")
    with c2:
        if st.button("Cancel", key="cancel_save_btn"):
            st.session_state["show_save_modal"] = False
            st.rerun()


def _render_materialize_modal(sql: str):
    st.markdown("---")
    st.markdown("#### 🚀 Route to Supabase")
    st.caption(
        "Creates a persistent table from this query result. "
        "Table name will be prefixed with `insight_`."
    )
    suffix = st.text_input(
        "Table name suffix *",
        placeholder="e.g. top_winners  →  insight_top_winners",
        key="mat_suffix",
    )
    schedule = st.selectbox(
        "Refresh schedule",
        ["manual", "on_sync", "daily"],
        key="mat_schedule",
        help="'on_sync' auto-refreshes when the Alpaca sync pipeline runs.",
    )
    c1, c2 = st.columns(2)
    with c1:
        if st.button("✓ Materialize", type="primary", key="confirm_mat_btn"):
            if not suffix.strip():
                st.warning("Please provide a table name suffix.")
                return
            clean = suffix.strip().lower()
            if not re.match(r"^[a-z][a-z0-9_]{0,54}$", clean):
                st.error("Use lowercase letters, digits, and underscores only (max 55 chars).")
                return
            _do_materialize(clean, sql, None, schedule)
    with c2:
        if st.button("Cancel", key="cancel_mat_btn"):
            st.session_state["show_mat_modal"] = False
            st.rerun()


def _do_materialize(suffix: str, sql: str, source_id, schedule: str):
    try:
        res = _client().rpc("materialize_insight", {
            "p_table_name": suffix,
            "p_sql_text": sql,
            "p_source_query_id": source_id,
            "p_refresh_schedule": schedule,
        }).execute()
        data = res.data or {}
        tbl = data.get("table_name", f"insight_{suffix}")
        rows = data.get("row_count", "?")
        st.success(f"✅ Created `{tbl}` — {rows:,} rows." if isinstance(rows, int) else f"✅ Created `{tbl}`.")
        st.session_state["show_mat_modal"] = False
        st.rerun()
    except Exception as e:
        st.error(f"Materialisation failed: {e}")


def _render_saved_queries_tab():
    _seed_starters()
    queries = _load_saved()
    if not queries:
        st.info("No saved queries yet. Run a query and click **Save**.")
        return

    for q in queries:
        pin = "★" if q.get("is_pinned") else "☆"
        tags_md = "  ".join(f"`{t}`" for t in (q.get("tags") or []))
        label = f"{pin} **{q['name']}**  {tags_md}"
        with st.expander(label, expanded=False):
            if q.get("description"):
                st.caption(q["description"])
            st.code(q["sql_text"], language="sql")

            parts = []
            if q.get("last_run_at"):
                parts.append(f"Last run: {str(q['last_run_at'])[:10]}")
            if q.get("result_row_count") is not None:
                parts.append(f"{q['result_row_count']:,} rows returned")
            if parts:
                st.caption(" · ".join(parts))

            c1, c2, c3 = st.columns(3)
            with c1:
                if st.button("▶ Load into editor", key=f"load_{q['id']}", use_container_width=True):
                    st.session_state["sql_text"] = q["sql_text"]
                    st.rerun()
            with c2:
                pin_lbl = "☆ Unpin" if q.get("is_pinned") else "★ Pin"
                if st.button(pin_lbl, key=f"pin_{q['id']}", use_container_width=True):
                    _toggle_pin(q["id"], not q.get("is_pinned", False))
                    st.rerun()
            with c3:
                if st.button("🗑 Delete", key=f"del_{q['id']}", use_container_width=True):
                    _delete_query(q["id"])
                    st.rerun()


def _render_history_tab():
    history: list = st.session_state.get("sql_history", [])
    if not history:
        st.info("No queries run yet this session.")
        return
    for i, sql in enumerate(history):
        preview = sql.strip().replace("\n", " ")
        label = preview[:70] + ("…" if len(preview) > 70 else "")
        with st.expander(f"**{i + 1}.** `{label}`", expanded=False):
            st.code(sql, language="sql")
            if st.button("▶ Load", key=f"hist_{i}"):
                st.session_state["sql_text"] = sql
                st.rerun()


def _render_insights_tab():
    try:
        res = (
            _client()
            .table("materialized_insights")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        insights = res.data or []
    except Exception as e:
        st.error(f"Could not load materialized insights: {e}")
        return

    if not insights:
        st.info(
            "No materialised insight tables yet. Run a query, then click "
            "**Route to Supabase** to promote it to a persistent table."
        )
        return

    sched_label = {"manual": "🔵 Manual", "on_sync": "🔄 On Sync", "daily": "📅 Daily"}
    for ins in insights:
        badge = sched_label.get(ins.get("refresh_schedule", "manual"), "🔵 Manual")
        with st.expander(f"**`{ins['table_name']}`**  ·  {badge}", expanded=False):
            c1, c2 = st.columns(2)
            with c1:
                st.metric("Row count", f"{ins.get('row_count', 0):,}")
            with c2:
                lr = str(ins.get("last_refreshed_at", ""))[:10] or "—"
                st.metric("Last refreshed", lr)

            if st.button(f"📊 Query this table", key=f"qi_{ins['id']}"):
                st.session_state["sql_text"] = (
                    f"SELECT *\nFROM {ins['table_name']}\nLIMIT 100;"
                )
                st.rerun()


# ── Main entry point ─────────────────────────────────────────────────────────────

def render_sql_terminal():
    """Render the ATLAS SQL Terminal page."""

    st.markdown(_CSS, unsafe_allow_html=True)
    st.components.v1.html(_KBD_JS, height=0)

    # ── Session state init ─────────────────────────────────────────────────────
    if "sql_text" not in st.session_state:
        st.session_state["sql_text"] = (
            "-- ATLAS SQL Terminal  ·  Ctrl+Enter / ⌘+Enter to run\n"
            "-- Read-only · auto-limited to 10,000 rows\n\n"
            "SELECT\n"
            "  a.symbol,\n"
            "  p.quantity,\n"
            "  p.average_cost,\n"
            "  p.market_value,\n"
            "  p.as_of_date\n"
            "FROM positions p\n"
            "JOIN assets a ON a.id = p.asset_id\n"
            "WHERE p.quantity > 0\n"
            "ORDER BY p.market_value DESC\n"
            "LIMIT 20;"
        )
    st.session_state.setdefault("sql_results", None)
    st.session_state.setdefault("sql_meta", None)
    st.session_state.setdefault("sql_history", [])
    st.session_state.setdefault("show_save_modal", False)
    st.session_state.setdefault("show_mat_modal", False)

    # ── Header ─────────────────────────────────────────────────────────────────
    st.markdown(
        """
        <div style="margin-bottom:1rem">
          <p style="font-family:'Space Mono',monospace;font-size:0.6rem;
                    color:rgba(139,92,246,0.85);text-transform:uppercase;
                    letter-spacing:0.15em;margin:0 0 0.2rem 0">
            ATLAS · SQL TERMINAL
          </p>
          <h2 style="font-family:'Space Mono',monospace;font-size:1.35rem;
                     font-weight:700;color:rgba(255,255,255,0.92);margin:0">
            🛢 Query Your Portfolio Universe
          </h2>
          <p style="font-size:0.7rem;color:rgba(255,255,255,0.38);margin-top:0.2rem">
            Read-only · Supabase PostgreSQL · Auto-limited to 10,000 rows ·
            Ctrl+Enter / ⌘+Enter to execute
          </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ── Two-column layout: editor (3) | schema sidebar (1) ────────────────────
    col_editor, col_schema = st.columns([3, 1], gap="medium")

    # ── Schema sidebar ─────────────────────────────────────────────────────────
    with col_schema:
        _render_schema_sidebar()

    # ── Editor panel ───────────────────────────────────────────────────────────
    with col_editor:
        with st.form("sql_form", clear_on_submit=False):
            sql_input = st.text_area(
                "SQL Editor",
                value=st.session_state["sql_text"],
                height=220,
                label_visibility="collapsed",
                placeholder="SELECT * FROM positions LIMIT 20;",
                help="Ctrl+Enter / ⌘+Enter to run. Write operations are blocked.",
            )
            c1, c2, c3, c4 = st.columns([2, 2, 2, 4])
            with c1:
                run = st.form_submit_button("▶ Run (⌘↵)", type="primary", use_container_width=True)
            with c2:
                save_btn = st.form_submit_button("💾 Save", use_container_width=True)
            with c3:
                clear_btn = st.form_submit_button("✕ Clear", use_container_width=True)

        # Persist editor text on any form submit
        if run or save_btn or clear_btn:
            st.session_state["sql_text"] = sql_input

        if clear_btn:
            st.session_state["sql_text"] = ""
            st.session_state["sql_results"] = None
            st.session_state["sql_meta"] = None
            st.rerun()

        # ── Execute ────────────────────────────────────────────────────────────
        if run and sql_input.strip():
            ok, err_msg = _validate_sql(sql_input)
            if not ok:
                st.error(f"🚫 {err_msg}")
            else:
                bounded = _ensure_limit(sql_input)
                with st.spinner("Executing…"):
                    result = _exec_sql(bounded)

                st.session_state["sql_results"] = result["df"]
                st.session_state["sql_meta"] = {
                    "rows": result["rows"],
                    "ms": result["ms"],
                    "err": result["err"],
                    "sql": bounded,
                }

                # History (last 50, no duplicates)
                hist: list = st.session_state["sql_history"]
                if sql_input not in hist:
                    hist.insert(0, sql_input)
                    st.session_state["sql_history"] = hist[:50]

                _log_query(sql_input, result["ms"], result["rows"], result["err"])
                st.rerun()

        # ── Save modal trigger ─────────────────────────────────────────────────
        if save_btn and sql_input.strip():
            st.session_state["show_save_modal"] = True

        if st.session_state["show_save_modal"]:
            _render_save_modal(st.session_state["sql_text"])

        # ── Metadata bar ───────────────────────────────────────────────────────
        meta = st.session_state.get("sql_meta")
        if meta:
            if meta["err"]:
                st.markdown(
                    f'<div class="sql-meta"><span class="err">✗ Error</span> · '
                    f'<span class="num">{meta["ms"]}ms</span></div>',
                    unsafe_allow_html=True,
                )
                st.error(meta["err"])
            else:
                st.markdown(
                    f'<div class="sql-meta"><span class="ok">✓</span> '
                    f'<span class="num">{meta["rows"]:,} rows</span> · '
                    f'<span class="num">{meta["ms"]}ms</span></div>',
                    unsafe_allow_html=True,
                )

        # ── Results table ──────────────────────────────────────────────────────
        df: pd.DataFrame = st.session_state.get("sql_results")
        if df is not None and not df.empty:
            st.dataframe(
                df,
                use_container_width=True,
                height=min(420, 38 * min(len(df), 20) + 42),
            )

            c_csv, c_mat = st.columns(2)
            with c_csv:
                csv_bytes = df.to_csv(index=False).encode("utf-8")
                st.download_button(
                    "📥 Export CSV",
                    data=csv_bytes,
                    file_name=f"atlas_query_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                    mime="text/csv",
                    use_container_width=True,
                )
            with c_mat:
                if st.button(
                    "🚀 Route to Supabase",
                    use_container_width=True,
                    help="Materialise this result as a persistent Supabase table",
                ):
                    st.session_state["show_mat_modal"] = True
                    st.rerun()

        elif df is not None and df.empty and meta and not meta["err"]:
            st.info("Query returned 0 rows.")

        # ── Materialize modal ──────────────────────────────────────────────────
        if st.session_state.get("show_mat_modal") and meta:
            _render_materialize_modal(meta["sql"])

    # ── Bottom tabs ────────────────────────────────────────────────────────────
    st.markdown("---")
    tab_saved, tab_hist, tab_insights = st.tabs([
        "💾 Saved Queries",
        "📜 Query History",
        "🗄 Materialized Insights",
    ])

    with tab_saved:
        _render_saved_queries_tab()

    with tab_hist:
        _render_history_tab()

    with tab_insights:
        _render_insights_tab()
