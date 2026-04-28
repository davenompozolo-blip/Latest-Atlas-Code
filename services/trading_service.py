"""
ATLAS Trading Service — Alpaca order execution layer.

All order operations go through this module. It is intentionally
stateless: every method creates a client from credentials on-demand
so it works both from the Streamlit session (where keys may live in
session_state) and from background jobs (where keys come from env vars).

Usage:
    svc = TradingService()           # uses env / Streamlit secrets
    svc = TradingService(api_key, secret_key, paper=True)  # explicit keys
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Alpaca SDK — optional (page renders a graceful error if missing)
# ---------------------------------------------------------------------------
try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import (
        MarketOrderRequest,
        LimitOrderRequest,
        StopOrderRequest,
        StopLimitOrderRequest,
        TrailingStopOrderRequest,
        GetOrdersRequest,
        CancelOrderResponse,
        ClosePositionRequest,
        CreateWatchlistRequest,
        UpdateWatchlistRequest,
    )
    from alpaca.trading.enums import (
        OrderSide,
        TimeInForce,
        OrderStatus,
        QueryOrderStatus,
    )
    ALPACA_AVAILABLE = True
except ImportError:
    ALPACA_AVAILABLE = False


# ---------------------------------------------------------------------------
# Result container — avoids raising exceptions into UI code
# ---------------------------------------------------------------------------
@dataclass
class TradeResult:
    success: bool
    message: str
    data: Any = None
    order_id: Optional[str] = None
    errors: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class TradingService:
    """
    Thin, testable wrapper around Alpaca TradingClient.

    All public methods return TradeResult so callers never have to catch
    SDK exceptions. Raw Alpaca objects are stored in TradeResult.data when
    useful.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        paper: Optional[bool] = None,
    ):
        if not ALPACA_AVAILABLE:
            raise ImportError(
                "alpaca-py is not installed. Run: pip install alpaca-py"
            )

        # Fall back to env / Streamlit secrets when not explicitly provided
        if api_key is None or secret_key is None:
            from services.secrets_helper import get_secret
            api_key = api_key or get_secret("ALPACA_API_KEY", "")
            secret_key = secret_key or get_secret("ALPACA_API_SECRET", "")
            if paper is None:
                paper = get_secret("ALPACA_PAPER", "true").lower() == "true"

        if not api_key or not secret_key:
            raise ValueError(
                "Alpaca credentials not found. Set ALPACA_API_KEY and "
                "ALPACA_API_SECRET environment variables."
            )

        self.paper = paper if paper is not None else True
        self.account_mode = "PAPER" if self.paper else "LIVE"
        self._client = TradingClient(
            api_key=api_key, secret_key=secret_key, paper=self.paper
        )

    # ------------------------------------------------------------------
    # Account
    # ------------------------------------------------------------------
    def get_account(self) -> Dict:
        """Return account summary as a plain dict."""
        try:
            acct = self._client.get_account()
            return {
                "mode": self.account_mode,
                "status": str(acct.status),
                "equity": float(acct.equity or 0),
                "cash": float(acct.cash or 0),
                "buying_power": float(acct.buying_power or 0),
                "long_market_value": float(acct.long_market_value or 0),
                "short_market_value": float(acct.short_market_value or 0),
                "last_equity": float(acct.last_equity or 0),
                "daytrade_count": int(acct.daytrade_count or 0),
                "pattern_day_trader": bool(acct.pattern_day_trader),
                "currency": str(acct.currency),
            }
        except Exception as exc:
            logger.warning("get_account failed: %s", exc)
            return {}

    # ------------------------------------------------------------------
    # Positions
    # ------------------------------------------------------------------
    def get_position(self, symbol: str) -> Optional[Dict]:
        """Return single position dict or None if not held."""
        try:
            pos = self._client.get_open_position(symbol.upper())
            return self._position_to_dict(pos)
        except Exception:
            return None

    def get_all_positions(self) -> List[Dict]:
        """Return all open positions as a list of dicts."""
        try:
            positions = self._client.get_all_positions()
            return [self._position_to_dict(p) for p in positions]
        except Exception as exc:
            logger.warning("get_all_positions failed: %s", exc)
            return []

    @staticmethod
    def _position_to_dict(pos) -> Dict:
        return {
            "symbol": str(pos.symbol),
            "qty": float(pos.qty or 0),
            "side": str(pos.side),
            "avg_entry_price": float(pos.avg_entry_price or 0),
            "current_price": float(pos.current_price or 0),
            "market_value": float(pos.market_value or 0),
            "cost_basis": float(pos.cost_basis or 0),
            "unrealized_pl": float(pos.unrealized_pl or 0),
            "unrealized_plpc": float(pos.unrealized_plpc or 0),
            "change_today": float(pos.change_today or 0),
        }

    # ------------------------------------------------------------------
    # Order submission
    # ------------------------------------------------------------------
    def submit_market_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        time_in_force: str = "day",
        extended_hours: bool = False,
    ) -> TradeResult:
        """Submit a market order."""
        try:
            req = MarketOrderRequest(
                symbol=symbol.upper(),
                qty=qty,
                side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
                time_in_force=self._tif(time_in_force),
                extended_hours=extended_hours,
            )
            order = self._client.submit_order(req)
            return TradeResult(
                success=True,
                message=f"Market {side.upper()} {qty} {symbol} submitted",
                order_id=str(order.id),
                data=order,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def submit_limit_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        limit_price: float,
        time_in_force: str = "day",
        extended_hours: bool = False,
    ) -> TradeResult:
        """Submit a limit order."""
        try:
            req = LimitOrderRequest(
                symbol=symbol.upper(),
                qty=qty,
                side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
                limit_price=round(limit_price, 2),
                time_in_force=self._tif(time_in_force),
                extended_hours=extended_hours,
            )
            order = self._client.submit_order(req)
            return TradeResult(
                success=True,
                message=f"Limit {side.upper()} {qty} {symbol} @ ${limit_price:.2f}",
                order_id=str(order.id),
                data=order,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def submit_stop_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        stop_price: float,
        time_in_force: str = "gtc",
    ) -> TradeResult:
        """Submit a stop order."""
        try:
            req = StopOrderRequest(
                symbol=symbol.upper(),
                qty=qty,
                side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
                stop_price=round(stop_price, 2),
                time_in_force=self._tif(time_in_force),
            )
            order = self._client.submit_order(req)
            return TradeResult(
                success=True,
                message=f"Stop {side.upper()} {qty} {symbol} @ ${stop_price:.2f}",
                order_id=str(order.id),
                data=order,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def submit_stop_limit_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        stop_price: float,
        limit_price: float,
        time_in_force: str = "gtc",
    ) -> TradeResult:
        """Submit a stop-limit order."""
        try:
            req = StopLimitOrderRequest(
                symbol=symbol.upper(),
                qty=qty,
                side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
                stop_price=round(stop_price, 2),
                limit_price=round(limit_price, 2),
                time_in_force=self._tif(time_in_force),
            )
            order = self._client.submit_order(req)
            return TradeResult(
                success=True,
                message=f"StopLimit {side.upper()} {qty} {symbol} stop ${stop_price:.2f} / lmt ${limit_price:.2f}",
                order_id=str(order.id),
                data=order,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def submit_dollar_order(
        self,
        symbol: str,
        notional: float,
        side: str,
        time_in_force: str = "day",
    ) -> TradeResult:
        """Submit a notional (dollar-amount) market order — Alpaca fractional shares."""
        try:
            req = MarketOrderRequest(
                symbol=symbol.upper(),
                notional=round(notional, 2),
                side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
                time_in_force=self._tif(time_in_force),
            )
            order = self._client.submit_order(req)
            return TradeResult(
                success=True,
                message=f"Notional {side.upper()} ${notional:,.2f} of {symbol}",
                order_id=str(order.id),
                data=order,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def submit_bracket_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        limit_price: float,
        take_profit_price: float,
        stop_loss_price: float,
        time_in_force: str = "gtc",
    ) -> TradeResult:
        """Submit a bracket (OCO) order: entry + take-profit + stop-loss."""
        try:
            # Bracket orders require LimitOrderRequest with order_class
            from alpaca.trading.requests import TakeProfitRequest, StopLossRequest
            req = LimitOrderRequest(
                symbol=symbol.upper(),
                qty=qty,
                side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
                limit_price=round(limit_price, 2),
                time_in_force=self._tif(time_in_force),
                order_class="bracket",
                take_profit=TakeProfitRequest(limit_price=round(take_profit_price, 2)),
                stop_loss=StopLossRequest(stop_price=round(stop_loss_price, 2)),
            )
            order = self._client.submit_order(req)
            return TradeResult(
                success=True,
                message=(
                    f"Bracket {side.upper()} {qty} {symbol} "
                    f"entry ${limit_price:.2f} / TP ${take_profit_price:.2f} "
                    f"/ SL ${stop_loss_price:.2f}"
                ),
                order_id=str(order.id),
                data=order,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    # ------------------------------------------------------------------
    # Order management
    # ------------------------------------------------------------------
    def get_open_orders(self) -> List[Dict]:
        """Return all open / pending orders."""
        try:
            req = GetOrdersRequest(status=QueryOrderStatus.OPEN)
            orders = self._client.get_orders(req)
            return [self._order_to_dict(o) for o in orders]
        except Exception as exc:
            logger.warning("get_open_orders failed: %s", exc)
            return []

    def get_recent_orders(self, limit: int = 50) -> List[Dict]:
        """Return most recent orders (all statuses)."""
        try:
            req = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=limit)
            orders = self._client.get_orders(req)
            return [self._order_to_dict(o) for o in orders]
        except Exception as exc:
            logger.warning("get_recent_orders failed: %s", exc)
            return []

    def cancel_order(self, order_id: str) -> TradeResult:
        """Cancel a single order by ID."""
        try:
            self._client.cancel_order_by_id(order_id)
            return TradeResult(success=True, message=f"Order {order_id} cancelled")
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def cancel_all_orders(self) -> TradeResult:
        """Cancel all open orders."""
        try:
            responses = self._client.cancel_orders()
            n = len(responses) if responses else 0
            return TradeResult(
                success=True,
                message=f"Cancelled {n} open order(s)",
                data=responses,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    @staticmethod
    def _order_to_dict(order) -> Dict:
        return {
            "id": str(order.id),
            "symbol": str(order.symbol),
            "side": str(order.side),
            "order_type": str(order.order_type),
            "qty": float(order.qty or 0),
            "filled_qty": float(order.filled_qty or 0),
            "limit_price": float(order.limit_price) if order.limit_price else None,
            "stop_price": float(order.stop_price) if order.stop_price else None,
            "filled_avg_price": float(order.filled_avg_price) if order.filled_avg_price else None,
            "status": str(order.status),
            "submitted_at": order.submitted_at,
            "filled_at": order.filled_at,
            "time_in_force": str(order.time_in_force),
        }

    # ------------------------------------------------------------------
    # Position management
    # ------------------------------------------------------------------
    def close_position(
        self, symbol: str, percentage: Optional[float] = None
    ) -> TradeResult:
        """
        Close a position fully or partially.

        percentage: 0–100. If None or 100, closes the full position.
        """
        try:
            if percentage is not None and percentage < 100:
                pos = self.get_position(symbol)
                if pos is None:
                    return TradeResult(success=False, message=f"No open position in {symbol}")
                qty_to_close = pos["qty"] * (percentage / 100)
                side = "sell" if pos["side"] == "long" else "buy"
                return self.submit_market_order(
                    symbol=symbol,
                    qty=round(qty_to_close, 6),
                    side=side,
                    time_in_force="day",
                )
            else:
                self._client.close_position(symbol.upper())
                return TradeResult(
                    success=True,
                    message=f"Closed full position in {symbol}",
                )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def close_all_positions(self, cancel_orders: bool = True) -> TradeResult:
        """Liquidate entire portfolio."""
        try:
            responses = self._client.close_all_positions(
                cancel_orders=cancel_orders
            )
            n = len(responses) if responses else 0
            return TradeResult(
                success=True,
                message=f"Liquidating {n} position(s)",
                data=responses,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    # ------------------------------------------------------------------
    # Watchlists
    # ------------------------------------------------------------------
    def get_watchlists(self) -> List[Dict]:
        """Return all watchlists."""
        try:
            lists = self._client.get_all_watchlists()
            return [
                {
                    "id": str(wl.id),
                    "name": str(wl.name),
                    "assets": [a.symbol for a in (wl.assets or [])],
                }
                for wl in lists
            ]
        except Exception as exc:
            logger.warning("get_watchlists failed: %s", exc)
            return []

    def create_watchlist(self, name: str, symbols: List[str]) -> TradeResult:
        try:
            req = CreateWatchlistRequest(
                name=name, symbols=[s.upper() for s in symbols]
            )
            wl = self._client.create_watchlist(req)
            return TradeResult(
                success=True,
                message=f"Watchlist '{name}' created",
                data=wl,
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def add_to_watchlist(self, watchlist_id: str, symbol: str) -> TradeResult:
        try:
            self._client.add_asset_to_watchlist_by_id(
                watchlist_id, symbol.upper()
            )
            return TradeResult(
                success=True, message=f"{symbol} added to watchlist"
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def remove_from_watchlist(self, watchlist_id: str, symbol: str) -> TradeResult:
        try:
            self._client.remove_asset_from_watchlist_by_id(
                watchlist_id, symbol.upper()
            )
            return TradeResult(
                success=True, message=f"{symbol} removed from watchlist"
            )
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    def delete_watchlist(self, watchlist_id: str) -> TradeResult:
        try:
            self._client.delete_watchlist_by_id(watchlist_id)
            return TradeResult(success=True, message="Watchlist deleted")
        except Exception as exc:
            return TradeResult(success=False, message=str(exc))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _tif(tif_str: str) -> TimeInForce:
        mapping = {
            "day": TimeInForce.DAY,
            "gtc": TimeInForce.GTC,
            "ioc": TimeInForce.IOC,
            "fok": TimeInForce.FOK,
            "opg": TimeInForce.OPG,
            "cls": TimeInForce.CLS,
        }
        return mapping.get(tif_str.lower(), TimeInForce.DAY)

    @classmethod
    def from_session_state(cls) -> Optional["TradingService"]:
        """
        Build a TradingService from Streamlit session_state credentials.
        Returns None if not configured.
        """
        try:
            import streamlit as st
            if not st.session_state.get("alpaca_configured"):
                return None
            return cls(
                api_key=st.session_state.get("alpaca_api_key"),
                secret_key=st.session_state.get("alpaca_secret_key"),
                paper=st.session_state.get("alpaca_paper", True),
            )
        except Exception:
            return None

    def is_paper(self) -> bool:
        return self.paper
