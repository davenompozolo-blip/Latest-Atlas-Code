"""
ATLAS Command Centre — Alpaca trading execution hub.

Tabs
----
1. Order Ticket     — Market / Limit / Stop / Bracket order entry
2. Position Sizer   — Kelly / Fixed-Fractional / Volatility sizing engine
3. Open Orders      — Live order book with cancel controls
4. Executions       — Recent fill history
5. Watchlists       — Create and manage Alpaca watchlists
"""

from __future__ import annotations

import streamlit as st
import pandas as pd
from typing import Optional

from services.trading_service import TradingService, ALPACA_AVAILABLE


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def render_command_centre():
    st.markdown("## Command Centre")

    if not ALPACA_AVAILABLE:
        st.error(
            "**alpaca-py not installed.** "
            "Run `pip install alpaca-py` then restart the app."
        )
        return

    # Check connection
    svc = TradingService.from_session_state()
    if svc is None:
        _render_connect_prompt()
        return

    # Account strip
    _render_account_strip(svc)

    st.markdown("---")

    tab_order, tab_sizer, tab_openorders, tab_fills, tab_watchlist = st.tabs([
        "Order Ticket",
        "Position Sizer",
        "Open Orders",
        "Executions",
        "Watchlists",
    ])

    with tab_order:
        _render_order_ticket(svc)

    with tab_sizer:
        _render_position_sizer(svc)

    with tab_openorders:
        _render_open_orders(svc)

    with tab_fills:
        _render_executions(svc)

    with tab_watchlist:
        _render_watchlists(svc)


# ---------------------------------------------------------------------------
# Connection prompt
# ---------------------------------------------------------------------------

def _render_connect_prompt():
    st.info(
        "Connect your Alpaca account first — go to **Portfolio Home** "
        "and use the Alpaca setup widget, then return here."
    )
    with st.expander("Quick credentials entry"):
        api_key = st.text_input("API Key", type="password")
        secret_key = st.text_input("Secret Key", type="password")
        paper = st.checkbox("Paper trading", value=True)
        if st.button("Connect", type="primary"):
            if api_key and secret_key:
                try:
                    svc = TradingService(api_key, secret_key, paper=paper)
                    acct = svc.get_account()
                    if acct:
                        st.session_state["alpaca_configured"] = True
                        st.session_state["alpaca_api_key"] = api_key
                        st.session_state["alpaca_secret_key"] = secret_key
                        st.session_state["alpaca_paper"] = paper
                        st.success("Connected!")
                        st.rerun()
                    else:
                        st.error("Credentials rejected or account inactive.")
                except Exception as e:
                    st.error(f"Connection failed: {e}")
            else:
                st.warning("Enter both API Key and Secret Key.")


# ---------------------------------------------------------------------------
# Account overview strip
# ---------------------------------------------------------------------------

def _render_account_strip(svc: TradingService):
    acct = svc.get_account()
    if not acct:
        st.warning("Could not fetch account data.")
        return

    mode_color = "#FF6B6B" if not svc.is_paper() else "#4ECDC4"
    mode_label = acct.get("mode", "PAPER")

    st.markdown(
        f'<span style="background:{mode_color};color:#000;padding:3px 10px;'
        f'border-radius:4px;font-weight:700;font-size:0.8rem;">'
        f'{mode_label}</span>',
        unsafe_allow_html=True,
    )
    st.markdown("")

    c1, c2, c3, c4, c5 = st.columns(5)
    equity = acct.get("equity", 0)
    last_equity = acct.get("last_equity", equity)
    day_chg = equity - last_equity
    day_chg_pct = (day_chg / last_equity * 100) if last_equity else 0

    c1.metric("Portfolio Equity", f"${equity:,.2f}", f"{day_chg:+,.2f} ({day_chg_pct:+.2f}%)")
    c2.metric("Cash", f"${acct.get('cash', 0):,.2f}")
    c3.metric("Buying Power", f"${acct.get('buying_power', 0):,.2f}")
    c4.metric("Long Exposure", f"${acct.get('long_market_value', 0):,.2f}")
    c5.metric("Day Trades (PDT)", str(acct.get("daytrade_count", 0)))


# ---------------------------------------------------------------------------
# Tab 1 — Order Ticket
# ---------------------------------------------------------------------------

def _render_order_ticket(svc: TradingService):
    # Pre-fill ticker from Valuation House bridge if set
    prefill_symbol = st.session_state.pop("cc_prefill_symbol", "")
    prefill_price = st.session_state.pop("cc_prefill_limit_price", None)
    prefill_side = st.session_state.pop("cc_prefill_side", "buy")

    st.markdown("### Order Ticket")

    col_sym, col_side = st.columns([3, 1])
    with col_sym:
        symbol = st.text_input(
            "Ticker",
            value=prefill_symbol,
            placeholder="e.g. AAPL",
            key="cc_symbol",
        ).upper().strip()

    with col_side:
        side = st.radio(
            "Side",
            ["Buy", "Sell"],
            index=0 if prefill_side.lower() == "buy" else 1,
            horizontal=True,
            key="cc_side",
        ).lower()

    order_type = st.radio(
        "Order Type",
        ["Market", "Limit", "Stop", "Stop-Limit", "Bracket"],
        horizontal=True,
        key="cc_order_type",
    )

    st.markdown("")

    # Sizing mode
    sizing_mode = st.radio(
        "Size by",
        ["Shares", "Notional ($)"],
        horizontal=True,
        key="cc_sizing_mode",
    )

    col_qty, col_tif = st.columns(2)
    with col_qty:
        if sizing_mode == "Shares":
            qty = st.number_input(
                "Shares",
                min_value=0.0001,
                value=1.0,
                step=1.0,
                format="%.4f",
                key="cc_qty",
            )
            notional = None
        else:
            notional = st.number_input(
                "Dollar Amount ($)",
                min_value=1.0,
                value=1000.0,
                step=100.0,
                format="%.2f",
                key="cc_notional",
            )
            qty = None

    with col_tif:
        tif_options = ["day", "gtc", "ioc", "fok"]
        tif = st.selectbox(
            "Time in Force",
            tif_options,
            format_func=lambda x: x.upper(),
            key="cc_tif",
        )

    # Order-type specific fields
    limit_price = stop_price = stop_limit_price = tp_price = sl_price = None

    if order_type in ("Limit", "Stop-Limit", "Bracket"):
        limit_price = st.number_input(
            "Limit Price ($)",
            min_value=0.01,
            value=float(prefill_price) if prefill_price else 100.00,
            step=0.01,
            format="%.2f",
            key="cc_limit_price",
        )

    if order_type in ("Stop", "Stop-Limit"):
        stop_price = st.number_input(
            "Stop Price ($)",
            min_value=0.01,
            value=95.00,
            step=0.01,
            format="%.2f",
            key="cc_stop_price",
        )

    if order_type == "Bracket":
        col_tp, col_sl = st.columns(2)
        with col_tp:
            tp_price = st.number_input(
                "Take Profit ($)",
                min_value=0.01,
                value=(float(prefill_price) * 1.10) if prefill_price else 110.00,
                step=0.01,
                format="%.2f",
                key="cc_tp_price",
            )
        with col_sl:
            sl_price = st.number_input(
                "Stop Loss ($)",
                min_value=0.01,
                value=(float(prefill_price) * 0.95) if prefill_price else 95.00,
                step=0.01,
                format="%.2f",
                key="cc_sl_price",
            )

    extended_hours = st.checkbox(
        "Extended hours (pre/after market)",
        value=False,
        key="cc_extended",
        help="Only valid for limit orders during extended hours sessions.",
    )

    # Order summary preview
    if symbol:
        _render_order_preview(
            symbol=symbol,
            side=side,
            order_type=order_type,
            qty=qty,
            notional=notional,
            limit_price=limit_price,
            stop_price=stop_price,
            tp_price=tp_price,
            sl_price=sl_price,
            tif=tif,
        )

    st.markdown("")

    # Confirmation flow
    if "cc_confirm_pending" not in st.session_state:
        st.session_state["cc_confirm_pending"] = False

    if not st.session_state["cc_confirm_pending"]:
        if st.button(
            f"Review Order",
            type="primary",
            use_container_width=True,
            key="cc_review_btn",
        ):
            if not symbol:
                st.error("Enter a ticker symbol.")
            elif sizing_mode == "Shares" and (qty is None or qty <= 0):
                st.error("Quantity must be > 0.")
            elif sizing_mode == "Notional ($)" and (notional is None or notional <= 0):
                st.error("Dollar amount must be > 0.")
            else:
                st.session_state["cc_confirm_pending"] = True
                st.rerun()
    else:
        _render_confirmation_modal(
            svc=svc,
            symbol=symbol,
            side=side,
            order_type=order_type,
            qty=qty,
            notional=notional,
            limit_price=limit_price,
            stop_price=stop_price,
            stop_limit_price=stop_limit_price,
            tp_price=tp_price,
            sl_price=sl_price,
            tif=tif,
            extended_hours=extended_hours,
        )


def _render_order_preview(
    symbol, side, order_type, qty, notional,
    limit_price, stop_price, tp_price, sl_price, tif
):
    side_color = "#4ECDC4" if side == "buy" else "#FF6B6B"
    side_label = side.upper()
    size_str = f"{qty:,.4f} shares" if qty else f"${notional:,.2f}"

    lines = [f"**{side_label}** {size_str} **{symbol}** — {order_type}"]
    if limit_price:
        lines.append(f"Limit: **${limit_price:,.2f}**")
    if stop_price:
        lines.append(f"Stop: **${stop_price:,.2f}**")
    if tp_price:
        lines.append(f"Take Profit: **${tp_price:,.2f}**")
    if sl_price:
        lines.append(f"Stop Loss: **${sl_price:,.2f}**")
    lines.append(f"TIF: **{tif.upper()}**")

    st.markdown(
        f'<div style="background:#1E2D3D;border-left:3px solid {side_color};'
        f'padding:12px 16px;border-radius:6px;margin-top:8px;">'
        + " &nbsp;|&nbsp; ".join(lines)
        + "</div>",
        unsafe_allow_html=True,
    )


def _render_confirmation_modal(
    svc, symbol, side, order_type, qty, notional,
    limit_price, stop_price, stop_limit_price, tp_price, sl_price, tif, extended_hours
):
    mode_warning = (
        ":red[**LIVE ACCOUNT — this will use real money.**]"
        if not svc.is_paper()
        else ":blue[Paper trading account — no real money at risk.]"
    )

    st.warning(
        f"Confirm order submission\n\n{mode_warning}"
    )

    col_confirm, col_cancel = st.columns(2)

    with col_confirm:
        if st.button("Confirm & Submit", type="primary", use_container_width=True, key="cc_submit"):
            result = _dispatch_order(
                svc=svc,
                symbol=symbol,
                side=side,
                order_type=order_type,
                qty=qty,
                notional=notional,
                limit_price=limit_price,
                stop_price=stop_price,
                tp_price=tp_price,
                sl_price=sl_price,
                tif=tif,
                extended_hours=extended_hours,
            )
            st.session_state["cc_confirm_pending"] = False
            if result.success:
                st.success(f"Order submitted! {result.message}")
                if result.order_id:
                    st.caption(f"Order ID: `{result.order_id}`")
            else:
                st.error(f"Submission failed: {result.message}")
            st.rerun()

    with col_cancel:
        if st.button("Cancel", use_container_width=True, key="cc_cancel"):
            st.session_state["cc_confirm_pending"] = False
            st.rerun()


def _dispatch_order(
    svc, symbol, side, order_type, qty, notional,
    limit_price, stop_price, tp_price, sl_price, tif, extended_hours
):
    if order_type == "Market":
        if notional:
            return svc.submit_dollar_order(symbol, notional, side, tif)
        return svc.submit_market_order(symbol, qty, side, tif, extended_hours)

    elif order_type == "Limit":
        if notional:
            # Approximate shares from notional/limit_price for limit orders
            approx_qty = notional / limit_price if limit_price else notional
            return svc.submit_limit_order(symbol, approx_qty, side, limit_price, tif, extended_hours)
        return svc.submit_limit_order(symbol, qty, side, limit_price, tif, extended_hours)

    elif order_type == "Stop":
        shares = qty or (notional / stop_price if stop_price else 1)
        return svc.submit_stop_order(symbol, shares, side, stop_price, tif)

    elif order_type == "Stop-Limit":
        shares = qty or 1
        return svc.submit_stop_limit_order(symbol, shares, side, stop_price, limit_price, tif)

    elif order_type == "Bracket":
        shares = qty or (notional / limit_price if limit_price else 1)
        return svc.submit_bracket_order(
            symbol, shares, side, limit_price, tp_price, sl_price, tif
        )

    from services.trading_service import TradeResult
    return TradeResult(success=False, message=f"Unknown order type: {order_type}")


# ---------------------------------------------------------------------------
# Tab 2 — Position Sizer
# ---------------------------------------------------------------------------

def _render_position_sizer(svc: TradingService):
    from analytics.position_sizer import (
        kelly_fraction,
        fixed_fractional,
        volatility_based,
        annual_vol_to_daily,
        PositionSize,
    )

    st.markdown("### Position Sizer")

    acct = svc.get_account()
    portfolio_equity = acct.get("equity", 100_000)

    st.caption(f"Portfolio equity: **${portfolio_equity:,.2f}**")

    col_sym, col_price = st.columns(2)
    with col_sym:
        ps_symbol = st.text_input("Ticker", placeholder="AAPL", key="ps_symbol").upper().strip()
    with col_price:
        ps_price = st.number_input(
            "Current Price ($)", min_value=0.01, value=150.00, step=0.01, format="%.2f", key="ps_price"
        )

    method = st.radio(
        "Sizing Method",
        ["Kelly Criterion", "Fixed Fractional", "Volatility-Based"],
        horizontal=True,
        key="ps_method",
    )

    result: Optional[PositionSize] = None

    if method == "Kelly Criterion":
        st.markdown("**Trade Statistics**")
        col_wr, col_aw, col_al = st.columns(3)
        with col_wr:
            win_rate = st.slider("Win Rate", 0.10, 0.90, 0.55, 0.01, format="%.0f%%", key="ps_wr") / 100
        with col_aw:
            avg_win = st.slider("Avg Win", 1, 30, 8, 1, format="%d%%", key="ps_aw") / 100
        with col_al:
            avg_loss = st.slider("Avg Loss", 1, 20, 4, 1, format="%d%%", key="ps_al") / 100
        kelly_mult = st.select_slider(
            "Kelly Multiplier",
            options=[0.25, 0.33, 0.50, 0.75, 1.0],
            value=0.5,
            format_func=lambda x: f"{x:.0%}",
            key="ps_kelly_mult",
        )
        max_pos = st.slider("Max Position Size", 5, 50, 20, 5, format="%d%%", key="ps_max_pos") / 100
        result = kelly_fraction(win_rate, avg_win, avg_loss, portfolio_equity, ps_price, kelly_mult, max_pos)

    elif method == "Fixed Fractional":
        risk_pct = st.slider("Risk per Trade", 0.5, 10.0, 2.0, 0.5, format="%.1f%%", key="ps_risk_pct") / 100
        use_stop = st.checkbox("Use stop-loss for precise risk sizing", key="ps_use_stop")
        stop = None
        if use_stop:
            stop = st.number_input(
                "Stop-Loss Price ($)", min_value=0.01, value=ps_price * 0.95, step=0.01, format="%.2f", key="ps_stop"
            )
        result = fixed_fractional(risk_pct, portfolio_equity, ps_price, stop)

    elif method == "Volatility-Based":
        ann_vol = st.slider("Annualised Volatility", 5, 80, 25, 1, format="%d%%", key="ps_ann_vol") / 100
        daily_vol = annual_vol_to_daily(ann_vol)
        target_risk = st.slider("Daily Risk Target", 0.25, 3.0, 1.0, 0.25, format="%.2f%%", key="ps_target_risk") / 100
        max_pos_v = st.slider("Max Position Size", 5, 50, 20, 5, format="%d%%", key="ps_max_pos_v") / 100
        st.caption(f"Daily vol: {daily_vol:.2%} of price = ${ps_price * daily_vol:.2f}/share")
        result = volatility_based(daily_vol, portfolio_equity, ps_price, target_risk, max_pos_v)

    if result:
        st.markdown("---")
        st.markdown(f"#### {result.method} — Recommendation")

        col_s, col_n, col_p = st.columns(3)
        col_s.metric("Shares", f"{result.shares:,.2f}")
        col_n.metric("Notional", f"${result.notional:,.2f}")
        col_p.metric("% of Portfolio", f"{result.pct_of_portfolio:.2f}%")

        st.caption(result.notes)

        # Send to order ticket
        if ps_symbol and st.button(
            f"Send to Order Ticket — BUY {result.shares:,.2f} {ps_symbol}",
            type="primary",
            key="ps_send_to_ticket",
        ):
            st.session_state["cc_prefill_symbol"] = ps_symbol
            st.session_state["cc_prefill_side"] = "buy"
            st.session_state["cc_confirm_pending"] = False
            st.rerun()


# ---------------------------------------------------------------------------
# Tab 3 — Open Orders
# ---------------------------------------------------------------------------

def _render_open_orders(svc: TradingService):
    st.markdown("### Open Orders")

    col_refresh, col_cancel_all = st.columns([4, 1])
    with col_refresh:
        if st.button("Refresh", key="oo_refresh"):
            st.rerun()
    with col_cancel_all:
        if st.button("Cancel All", type="secondary", key="oo_cancel_all"):
            r = svc.cancel_all_orders()
            if r.success:
                st.success(r.message)
                st.rerun()
            else:
                st.error(r.message)

    orders = svc.get_open_orders()
    if not orders:
        st.info("No open orders.")
        return

    for order in orders:
        with st.container():
            col_info, col_action = st.columns([6, 1])
            with col_info:
                side_color = "#4ECDC4" if "buy" in str(order["side"]).lower() else "#FF6B6B"
                limit_str = f" @ ${order['limit_price']:.2f}" if order.get("limit_price") else ""
                stop_str = f" stop ${order['stop_price']:.2f}" if order.get("stop_price") else ""
                st.markdown(
                    f'<span style="color:{side_color};font-weight:700;">'
                    f'{str(order["side"]).upper()}</span> &nbsp; '
                    f'**{order["symbol"]}** &nbsp; '
                    f'{order["qty"]:,.4f} shares{limit_str}{stop_str} &nbsp; '
                    f'<span style="color:#888;">{str(order["order_type"]).upper()} · '
                    f'{str(order["time_in_force"]).upper()} · '
                    f'{str(order["status"]).upper()}</span>',
                    unsafe_allow_html=True,
                )
                if order.get("submitted_at"):
                    st.caption(f"Submitted: {order['submitted_at']}")
            with col_action:
                if st.button("Cancel", key=f"cancel_{order['id']}", use_container_width=True):
                    r = svc.cancel_order(order["id"])
                    if r.success:
                        st.success("Cancelled")
                        st.rerun()
                    else:
                        st.error(r.message)
            st.markdown('<hr style="margin:6px 0;border-color:#2A3A4A;">', unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Tab 4 — Recent Executions
# ---------------------------------------------------------------------------

def _render_executions(svc: TradingService):
    st.markdown("### Recent Executions")

    limit = st.number_input("Show last N orders", min_value=10, max_value=200, value=50, step=10, key="exec_limit")

    if st.button("Load", key="exec_load"):
        orders = svc.get_recent_orders(limit=int(limit))
        if not orders:
            st.info("No order history found.")
            return

        rows = []
        for o in orders:
            rows.append({
                "Symbol": o["symbol"],
                "Side": str(o["side"]).upper(),
                "Type": str(o["order_type"]).upper(),
                "Qty": o["qty"],
                "Filled Qty": o["filled_qty"],
                "Fill Price": f"${o['filled_avg_price']:.4f}" if o.get("filled_avg_price") else "-",
                "Status": str(o["status"]).upper(),
                "Submitted": str(o["submitted_at"])[:16] if o.get("submitted_at") else "-",
                "Filled": str(o["filled_at"])[:16] if o.get("filled_at") else "-",
            })

        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True, hide_index=True)

        filled = df[df["Status"] == "FILLED"]
        col1, col2 = st.columns(2)
        col1.metric("Total Orders", len(df))
        col2.metric("Filled", len(filled))
    else:
        st.caption("Click Load to fetch order history.")


# ---------------------------------------------------------------------------
# Tab 5 — Watchlists
# ---------------------------------------------------------------------------

def _render_watchlists(svc: TradingService):
    st.markdown("### Watchlists")

    if st.button("Refresh Watchlists", key="wl_refresh"):
        st.rerun()

    watchlists = svc.get_watchlists()

    if not watchlists:
        st.info("No watchlists found.")
    else:
        for wl in watchlists:
            with st.expander(f"**{wl['name']}** ({len(wl['assets'])} symbols)"):
                assets = wl.get("assets", [])
                if assets:
                    cols = st.columns(min(6, len(assets)))
                    for i, sym in enumerate(assets):
                        with cols[i % 6]:
                            st.code(sym)
                            if st.button("Remove", key=f"wl_rm_{wl['id']}_{sym}"):
                                r = svc.remove_from_watchlist(wl["id"], sym)
                                if r.success:
                                    st.success(f"Removed {sym}")
                                    st.rerun()
                                else:
                                    st.error(r.message)
                else:
                    st.caption("Empty watchlist.")

                # Add symbol to this watchlist
                new_sym = st.text_input(
                    "Add symbol", placeholder="TSLA", key=f"wl_add_sym_{wl['id']}"
                ).upper().strip()
                if st.button("Add", key=f"wl_add_btn_{wl['id']}"):
                    if new_sym:
                        r = svc.add_to_watchlist(wl["id"], new_sym)
                        if r.success:
                            st.success(r.message)
                            st.rerun()
                        else:
                            st.error(r.message)

                # Delete watchlist
                if st.button("Delete Watchlist", key=f"wl_del_{wl['id']}", type="secondary"):
                    r = svc.delete_watchlist(wl["id"])
                    if r.success:
                        st.success("Deleted")
                        st.rerun()
                    else:
                        st.error(r.message)

    st.markdown("---")
    st.markdown("#### Create New Watchlist")
    new_name = st.text_input("Name", placeholder="My Watchlist", key="wl_new_name")
    new_syms_raw = st.text_input(
        "Symbols (comma-separated)", placeholder="AAPL, MSFT, GOOGL", key="wl_new_syms"
    )
    if st.button("Create Watchlist", type="primary", key="wl_create"):
        if not new_name:
            st.error("Enter a watchlist name.")
        else:
            syms = [s.strip().upper() for s in new_syms_raw.split(",") if s.strip()]
            r = svc.create_watchlist(new_name, syms)
            if r.success:
                st.success(r.message)
                st.rerun()
            else:
                st.error(r.message)
