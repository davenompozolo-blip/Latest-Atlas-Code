"""
ATLAS Terminal - Alpaca Data Engine v1.0
========================================
Comprehensive trade history scraper and performance reconstruction engine.
Pulls all historical data from Alpaca's REST API and transforms it into
ATLAS-ready DataFrames for the Performance Suite, Risk Analysis, and every
module that references historical performance.

Feeds: Performance Suite | Risk Analysis | All Historical Modules

USAGE:
    from alpaca_data_engine import AlpacaDataEngine

    engine = AlpacaDataEngine(api_key="YOUR_KEY", api_secret="YOUR_SECRET")
    engine.fetch_all()

    # Then access clean DataFrames:
    engine.orders_df          -> Full order history
    engine.fills_df           -> Granular fill-level activity
    engine.positions_df       -> Current open positions
    engine.portfolio_history  -> Daily NAV / equity curve
    engine.trade_ledger       -> Reconstructed P&L per trade (open + closed)
    engine.performance        -> Sharpe, drawdown, CAGR, win rate, etc.
    engine.risk_metrics       -> VaR, CVaR, beta, volatility
    engine.account_snapshot   -> Current balance / margin state

NOTE ON API KEYS:
    Alpaca paper trading keys are session-scoped and change on each login.
    Never hardcode them. Always pass them at runtime via the constructor
    or via engine.set_credentials(key, secret) before calling fetch_all().

Author: ATLAS Terminal
Version: 1.0
"""

import requests
import pandas as pd
import numpy as np
from collections import deque
from datetime import datetime, timezone
from typing import Optional
import warnings
warnings.filterwarnings("ignore")


# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------

PAPER_BASE_URL  = "https://paper-api.alpaca.markets"
LIVE_BASE_URL   = "https://api.alpaca.markets"
DATA_BASE_URL   = "https://data.alpaca.markets"
TRADING_DAYS_PY = 252


# ---------------------------------------------------------------------------
# CORE ENGINE CLASS
# ---------------------------------------------------------------------------

class AlpacaDataEngine:
    """
    Single entry point for all Alpaca historical data. Fetches, cleans, and
    transforms raw API responses into ATLAS-ready DataFrames and metrics.

    Endpoints consumed:
        GET /v2/account                         -> account_snapshot
        GET /v2/positions                       -> positions_df
        GET /v2/orders?status=all               -> orders_df (paginated)
        GET /v2/account/activities              -> fills_df (paginated)
        GET /v2/account/portfolio/history       -> portfolio_history (daily NAV)

    Derived outputs:
        trade_ledger   -> FIFO-matched realized P&L per trade
        performance    -> Sharpe, Sortino, Calmar, CAGR, win rate, profit factor
        risk_metrics   -> VaR, CVaR, skewness, kurtosis, tail ratio
    """

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        paper: bool = True,
    ):
        self.set_credentials(api_key, api_secret, paper)

        # Output DataFrames - populated by fetch_all()
        self.orders_df: Optional[pd.DataFrame]         = None
        self.fills_df: Optional[pd.DataFrame]          = None
        self.positions_df: Optional[pd.DataFrame]      = None
        self.portfolio_history: Optional[pd.DataFrame] = None
        self.trade_ledger: Optional[pd.DataFrame]      = None
        self.performance: Optional[dict]               = None
        self.risk_metrics: Optional[dict]              = None
        self.account_snapshot: Optional[dict]          = None

    def set_credentials(self, api_key: str, api_secret: str, paper: bool = True):
        """Update credentials without reinstantiating - use when key rotates."""
        self.api_key    = api_key
        self.api_secret = api_secret
        self.paper      = paper
        self.base_url   = PAPER_BASE_URL if paper else LIVE_BASE_URL
        self._headers   = {
            "APCA-API-KEY-ID":     api_key,
            "APCA-API-SECRET-KEY": api_secret,
            "accept":              "application/json",
        }

    # -----------------------------------------------------------------------
    # MAIN ORCHESTRATOR
    # -----------------------------------------------------------------------

    def fetch_all(self, verbose: bool = True) -> "AlpacaDataEngine":
        """
        Master fetch - pulls every endpoint and processes into ATLAS outputs.
        Call this once after instantiation. Returns self for chaining.
        """
        steps = [
            ("Account Snapshot",    self._fetch_account),
            ("Open Positions",      self._fetch_positions),
            ("Order History",       self._fetch_all_orders),
            ("Fill Activities",     self._fetch_all_fills),
            ("Portfolio History",   self._fetch_portfolio_history),
            ("Trade Ledger",        self._build_trade_ledger),
            ("Performance Metrics", self._compute_performance),
            ("Risk Metrics",        self._compute_risk_metrics),
        ]

        for label, fn in steps:
            if verbose:
                print(f"  > Fetching {label}...", end=" ", flush=True)
            try:
                fn()
                if verbose:
                    print("OK")
            except Exception as e:
                if verbose:
                    print(f"FAILED  ({e})")

        if verbose:
            self._print_summary()

        return self

    # -----------------------------------------------------------------------
    # RAW API HELPERS
    # -----------------------------------------------------------------------

    def _get(self, url: str, params: dict = None) -> dict | list:
        """Authenticated GET with error handling."""
        resp = requests.get(url, headers=self._headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _paginate(self, url: str, params: dict, key: str = None) -> list:
        """
        Generic paginator. Alpaca uses page_token for cursor pagination.
        Accumulates all pages and returns a flat list.
        """
        results = []
        params  = params.copy()

        while True:
            data = self._get(url, params)

            # Some endpoints return {key: [...], next_page_token: "..."}
            # Others return a bare list
            if isinstance(data, dict):
                items      = data.get(key or "orders", [])
                next_token = data.get("next_page_token")
            else:
                items      = data
                next_token = None

            results.extend(items)

            if not next_token or not items:
                break

            params["page_token"] = next_token

        return results

    # -----------------------------------------------------------------------
    # FETCH METHODS
    # -----------------------------------------------------------------------

    def _fetch_account(self):
        """Account balance, equity, margin, buying power."""
        raw = self._get(f"{self.base_url}/v2/account")

        self.account_snapshot = {
            "equity":                float(raw.get("equity", 0)),
            "cash":                  float(raw.get("cash", 0)),
            "buying_power":          float(raw.get("buying_power", 0)),
            "regt_buying_power":     float(raw.get("regt_buying_power", 0)),
            "initial_margin":        float(raw.get("initial_margin", 0)),
            "maintenance_margin":    float(raw.get("maintenance_margin", 0)),
            "long_market_value":     float(raw.get("long_market_value", 0)),
            "short_market_value":    float(raw.get("short_market_value", 0)),
            "unrealized_pl":         float(raw.get("unrealized_pl", 0)),
            "unrealized_plpc":       float(raw.get("unrealized_plpc", 0)),
            "last_equity":           float(raw.get("last_equity", 0)),
            "daytrade_count":        int(raw.get("daytrade_count", 0)),
            "status":                raw.get("status"),
            "account_number":        raw.get("account_number"),
            "currency":              raw.get("currency", "USD"),
        }

    def _fetch_positions(self):
        """All open positions with current market values."""
        raw = self._get(f"{self.base_url}/v2/positions")

        if not raw:
            self.positions_df = pd.DataFrame()
            return

        records = []
        for p in raw:
            records.append({
                "symbol":                   p.get("symbol"),
                "qty":                      float(p.get("qty", 0)),
                "side":                     p.get("side"),
                "avg_entry_price":          float(p.get("avg_entry_price", 0)),
                "current_price":            float(p.get("current_price", 0)),
                "market_value":             float(p.get("market_value", 0)),
                "cost_basis":               float(p.get("cost_basis", 0)),
                "unrealized_pl":            float(p.get("unrealized_pl", 0)),
                "unrealized_plpc":          float(p.get("unrealized_plpc", 0)) * 100,
                "unrealized_intraday_pl":   float(p.get("unrealized_intraday_pl", 0)),
                "change_today":             float(p.get("change_today", 0)) * 100,
                "asset_class":              p.get("asset_class"),
                "exchange":                 p.get("exchange"),
            })

        self.positions_df = pd.DataFrame(records).sort_values(
            "market_value", ascending=False
        ).reset_index(drop=True)

    def _fetch_all_orders(self):
        """
        Full paginated order history - all statuses, oldest first.
        Mirrors the Orders tab exactly.
        """
        raw = self._paginate(
            url    = f"{self.base_url}/v2/orders",
            params = {
                "status":    "all",
                "limit":     500,
                "direction": "asc",
            },
            key    = "orders",
        )

        # Paper trading sometimes returns a bare list
        if isinstance(raw, dict):
            raw = raw.get("orders", [])

        if not raw:
            self.orders_df = pd.DataFrame()
            return

        records = []
        for o in raw:
            filled_qty = _safe_float(o.get("filled_qty"))
            avg_price  = _safe_float(o.get("filled_avg_price"))
            gross_val  = (filled_qty * avg_price) if filled_qty and avg_price else None

            records.append({
                "order_id":        o.get("id"),
                "client_order_id": o.get("client_order_id"),
                "symbol":          o.get("symbol"),
                "asset_class":     o.get("asset_class"),
                "order_type":      o.get("type"),
                "side":            o.get("side"),
                "qty":             _safe_float(o.get("qty")),
                "filled_qty":      filled_qty,
                "avg_fill_price":  avg_price,
                "limit_price":     _safe_float(o.get("limit_price")),
                "stop_price":      _safe_float(o.get("stop_price")),
                "status":          o.get("status"),
                "time_in_force":   o.get("time_in_force"),
                "submitted_at":    o.get("submitted_at"),
                "filled_at":       o.get("filled_at"),
                "expired_at":      o.get("expired_at"),
                "canceled_at":     o.get("canceled_at"),
                "extended_hours":  o.get("extended_hours", False),
                "notional":        _safe_float(o.get("notional")),
                "gross_value":     gross_val,
            })

        df = pd.DataFrame(records)
        df["submitted_at"] = pd.to_datetime(df["submitted_at"], utc=True, errors="coerce")
        df["filled_at"]    = pd.to_datetime(df["filled_at"],    utc=True, errors="coerce")
        self.orders_df     = df.sort_values("submitted_at").reset_index(drop=True)

    def _fetch_all_fills(self):
        """
        Full paginated fill activity - granular per-fill records.
        Mirrors the Activities tab. Better for P&L reconstruction
        because it captures partial fills and fees separately.
        """
        raw = self._paginate(
            url    = f"{self.base_url}/v2/account/activities",
            params = {
                "activity_types": "FILL,CFEE,TAF,FEE",
                "direction":      "asc",
                "page_size":      100,
            },
            key = "activities",
        )

        if not raw:
            self.fills_df = pd.DataFrame()
            return

        records = []
        for a in raw:
            records.append({
                "activity_id":      a.get("id"),
                "activity_type":    a.get("activity_type"),
                "symbol":           a.get("symbol"),
                "side":             a.get("side"),
                "qty":              _safe_float(a.get("qty")),
                "price":            _safe_float(a.get("price")),
                "amount":           _safe_float(a.get("net_amount") or a.get("amount")),
                "transaction_time": a.get("transaction_time") or a.get("date"),
                "order_id":         a.get("order_id"),
                "cum_qty":          _safe_float(a.get("cum_qty")),
                "leaves_qty":       _safe_float(a.get("leaves_qty")),
                "description":      a.get("description"),
            })

        df = pd.DataFrame(records)
        df["transaction_time"] = pd.to_datetime(df["transaction_time"], utc=True, errors="coerce")
        self.fills_df = df.sort_values("transaction_time").reset_index(drop=True)

    def _fetch_portfolio_history(self):
        """
        Daily NAV / equity curve - the cleanest source for time-series
        performance. Returned as a date-indexed DataFrame with:
        equity, profit_loss, profit_loss_pct, base_value.
        """
        raw = self._get(
            f"{self.base_url}/v2/account/portfolio/history",
            params={
                "timeframe":      "1D",
                "period":         "all",
                "extended_hours": False,
            }
        )

        timestamps = raw.get("timestamp", [])
        if not timestamps:
            self.portfolio_history = pd.DataFrame()
            return

        base_value = raw.get("base_value", None)
        equity_list = raw.get("equity", [])
        if base_value is None and equity_list:
            base_value = equity_list[0]

        df = pd.DataFrame({
            "date":            pd.to_datetime(timestamps, unit="s", utc=True),
            "equity":          equity_list,
            "profit_loss":     raw.get("profit_loss", []),
            "profit_loss_pct": raw.get("profit_loss_pct", []),
            "base_value":      base_value,
        })

        df = df.dropna(subset=["equity"]).copy()
        df["equity"]    = df["equity"].astype(float)
        df["date_only"] = df["date"].dt.date

        # Daily returns for downstream analytics
        df["daily_return"] = df["equity"].pct_change()

        # Drawdown series
        rolling_max    = df["equity"].cummax()
        df["drawdown"] = (df["equity"] - rolling_max) / rolling_max * 100

        df = df.set_index("date").sort_index()
        self.portfolio_history = df

    # -----------------------------------------------------------------------
    # TRADE LEDGER - Reconstructed P&L per completed trade
    # -----------------------------------------------------------------------

    def _build_trade_ledger(self):
        """
        Reconstructs a per-trade P&L ledger from fills using a FIFO matching
        algorithm. Each row = one closed trade (entry -> exit).
        Open positions are appended with unrealized P&L.
        """
        if self.fills_df is None or self.fills_df.empty:
            self.trade_ledger = pd.DataFrame()
            return

        fills = self.fills_df[self.fills_df["activity_type"] == "FILL"].copy()
        fills = fills.sort_values("transaction_time").reset_index(drop=True)

        completed_trades = []
        book = {}  # symbol -> deque of {qty, price, ts}

        for _, fill in fills.iterrows():
            sym   = fill["symbol"]
            side  = fill["side"]
            qty   = abs(fill["qty"] or 0)
            price = fill["price"] or 0
            ts    = fill["transaction_time"]

            if sym not in book:
                book[sym] = deque()

            if side == "buy":
                book[sym].append({"qty": qty, "price": price, "ts": ts})

            elif side == "sell":
                qty_to_close = qty

                while qty_to_close > 0 and book.get(sym):
                    lot = book[sym][0]

                    close_qty = min(lot["qty"], qty_to_close)
                    realized_pnl = (price - lot["price"]) * close_qty
                    pnl_pct = (price / lot["price"] - 1) * 100 if lot["price"] else 0
                    holding_days = (ts - lot["ts"]).days if ts and lot["ts"] else None

                    completed_trades.append({
                        "symbol":       sym,
                        "entry_date":   lot["ts"],
                        "exit_date":    ts,
                        "entry_price":  lot["price"],
                        "exit_price":   price,
                        "qty":          close_qty,
                        "realized_pnl": round(realized_pnl, 4),
                        "pnl_pct":      round(pnl_pct, 4),
                        "holding_days": holding_days,
                        "trade_type":   "long",
                        "status":       "closed",
                    })

                    if lot["qty"] <= qty_to_close:
                        qty_to_close -= lot["qty"]
                        book[sym].popleft()
                    else:
                        lot["qty"] -= qty_to_close
                        qty_to_close = 0

        # Append open positions (unrealized)
        if self.positions_df is not None and not self.positions_df.empty:
            for _, pos in self.positions_df.iterrows():
                completed_trades.append({
                    "symbol":        pos["symbol"],
                    "entry_date":    None,
                    "exit_date":     None,
                    "entry_price":   pos["avg_entry_price"],
                    "exit_price":    pos["current_price"],
                    "qty":           pos["qty"],
                    "realized_pnl":  None,
                    "pnl_pct":       pos["unrealized_plpc"],
                    "holding_days":  None,
                    "trade_type":    "long" if pos["side"] == "long" else "short",
                    "status":        "open",
                    "unrealized_pl": pos["unrealized_pl"],
                })

        df = pd.DataFrame(completed_trades)
        if not df.empty:
            df["entry_date"] = pd.to_datetime(df["entry_date"], utc=True, errors="coerce")
            df["exit_date"]  = pd.to_datetime(df["exit_date"],  utc=True, errors="coerce")
            df = df.sort_values("entry_date", na_position="last").reset_index(drop=True)

        self.trade_ledger = df

    # -----------------------------------------------------------------------
    # PERFORMANCE METRICS
    # -----------------------------------------------------------------------

    def _compute_performance(self):
        """
        Computes comprehensive performance metrics from the equity curve.
        All figures annualized to TRADING_DAYS_PY = 252 days.
        """
        ph = self.portfolio_history
        tl = self.trade_ledger

        if ph is None or ph.empty:
            self.performance = {}
            return

        returns      = ph["daily_return"].dropna()
        equity       = ph["equity"]
        start_equity = equity.iloc[0]
        end_equity   = equity.iloc[-1]
        n_days       = len(equity)

        # Core return metrics
        total_return = (end_equity / start_equity - 1) * 100
        n_years      = n_days / TRADING_DAYS_PY
        cagr         = ((end_equity / start_equity) ** (1 / n_years) - 1) * 100 if n_years > 0 else 0

        # Risk-adjusted
        ann_return = returns.mean() * TRADING_DAYS_PY * 100
        ann_vol    = returns.std() * np.sqrt(TRADING_DAYS_PY) * 100
        sharpe     = (ann_return / ann_vol) if ann_vol > 0 else 0

        # Sortino (downside deviation)
        downside_ret = returns[returns < 0]
        downside_vol = downside_ret.std() * np.sqrt(TRADING_DAYS_PY) * 100
        sortino      = (ann_return / downside_vol) if downside_vol > 0 else 0

        # Drawdown
        max_dd = ph["drawdown"].min()
        calmar = (ann_return / abs(max_dd)) if max_dd != 0 else 0

        perf = {
            # Returns
            "total_return_pct":          round(total_return, 2),
            "cagr_pct":                  round(cagr, 2),
            "annualized_return_pct":     round(ann_return, 2),
            # Risk
            "annualized_volatility_pct": round(ann_vol, 2),
            "max_drawdown_pct":          round(max_dd, 2),
            # Ratios
            "sharpe_ratio":              round(sharpe, 4),
            "sortino_ratio":             round(sortino, 4),
            "calmar_ratio":              round(calmar, 4),
            # Account
            "start_equity":              round(start_equity, 2),
            "current_equity":            round(end_equity, 2),
            "total_pnl":                 round(end_equity - start_equity, 2),
            # Period
            "n_trading_days":            n_days,
            "period_years":              round(n_years, 2),
        }

        # Trade-level stats from the ledger (closed trades only)
        if tl is not None and not tl.empty:
            closed = tl[tl["status"] == "closed"].copy()

            if not closed.empty:
                winners = closed[closed["realized_pnl"] > 0]
                losers  = closed[closed["realized_pnl"] < 0]
                win_rate = len(winners) / len(closed) * 100

                avg_win  = winners["realized_pnl"].mean() if not winners.empty else 0
                avg_loss = abs(losers["realized_pnl"].mean()) if not losers.empty else 0
                profit_factor = (
                    (avg_win * len(winners)) / (avg_loss * len(losers))
                    if avg_loss > 0 and len(losers) > 0
                    else np.inf
                )

                perf.update({
                    "n_trades":           len(closed),
                    "n_winners":          len(winners),
                    "n_losers":           len(losers),
                    "win_rate_pct":       round(win_rate, 2),
                    "avg_winner_usd":     round(avg_win, 2),
                    "avg_loser_usd":      round(avg_loss, 2),
                    "profit_factor":      round(profit_factor, 4),
                    "best_trade_usd":     round(closed["realized_pnl"].max(), 2),
                    "worst_trade_usd":    round(closed["realized_pnl"].min(), 2),
                    "total_realized_pnl": round(closed["realized_pnl"].sum(), 2),
                    "avg_holding_days":   round(closed["holding_days"].mean(), 1)
                                          if "holding_days" in closed.columns
                                          else None,
                })

        self.performance = perf

    # -----------------------------------------------------------------------
    # RISK METRICS
    # -----------------------------------------------------------------------

    def _compute_risk_metrics(self):
        """
        Institutional-grade risk metrics: VaR, CVaR, rolling volatility,
        skewness, kurtosis, tail ratios.
        """
        ph = self.portfolio_history
        if ph is None or ph.empty:
            self.risk_metrics = {}
            return

        returns = ph["daily_return"].dropna()

        if len(returns) < 5:
            self.risk_metrics = {"insufficient_data": True}
            return

        from scipy import stats as sp_stats

        # VaR / CVaR
        var_95  = float(np.percentile(returns, 5) * 100)
        var_99  = float(np.percentile(returns, 1) * 100)
        cvar_95 = float(returns[returns <= np.percentile(returns, 5)].mean() * 100)
        cvar_99 = float(returns[returns <= np.percentile(returns, 1)].mean() * 100)

        # Higher moments
        skew = float(sp_stats.skew(returns))
        kurt = float(sp_stats.kurtosis(returns))  # excess kurtosis (normal = 0)

        # Tail ratio: avg of top 5% gains / avg of bottom 5% losses
        top5 = returns[returns >= returns.quantile(0.95)].mean()
        bot5 = returns[returns <= returns.quantile(0.05)].mean()
        tail_ratio = float(abs(top5 / bot5)) if bot5 != 0 else np.inf

        # Rolling 21-day volatility (most recent)
        rolling_vol_21d = None
        if len(returns) >= 21:
            rolling_vol_21d = float(
                returns.rolling(21).std().iloc[-1] * np.sqrt(TRADING_DAYS_PY) * 100
            )

        # Autocorrelation lag-1
        autocorr_1 = float(returns.autocorr(lag=1)) if len(returns) > 5 else None

        # Day counts
        pos_days  = int((returns > 0).sum())
        neg_days  = int((returns < 0).sum())
        flat_days = int((returns == 0).sum())

        self.risk_metrics = {
            # VaR / CVaR (as % of portfolio)
            "var_95_pct":              round(var_95, 4),
            "var_99_pct":              round(var_99, 4),
            "cvar_95_pct":             round(cvar_95, 4),
            "cvar_99_pct":             round(cvar_99, 4),
            # Distribution
            "skewness":                round(skew, 4),
            "excess_kurtosis":         round(kurt, 4),
            "tail_ratio":              round(tail_ratio, 4),
            # Volatility
            "rolling_vol_21d_ann_pct": round(rolling_vol_21d, 2) if rolling_vol_21d else None,
            # Autocorrelation
            "return_autocorr_lag1":    round(autocorr_1, 4) if autocorr_1 is not None else None,
            # Day count
            "positive_days":           pos_days,
            "negative_days":           neg_days,
            "flat_days":               flat_days,
            "pct_positive_days":       round(pos_days / (pos_days + neg_days) * 100, 2)
                                       if (pos_days + neg_days) > 0 else 0,
            # Concentration
            "n_open_positions":        len(self.positions_df)
                                       if self.positions_df is not None else 0,
            "largest_position_pct":    round(
                self.positions_df["market_value"].max()
                / self.account_snapshot["equity"] * 100, 2
            ) if (
                self.positions_df is not None
                and not self.positions_df.empty
                and self.account_snapshot
                and self.account_snapshot.get("equity", 0) > 0
            ) else None,
        }

    # -----------------------------------------------------------------------
    # EXPORT HELPERS - for ATLAS modules
    # -----------------------------------------------------------------------

    def export_to_excel(self, filepath: str = "alpaca_atlas_export.xlsx"):
        """
        Exports all DataFrames and metrics to a multi-sheet Excel file.
        Drop-in for any ATLAS reporting module.
        """
        with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
            _safe_to_excel(
                self.portfolio_history.reset_index() if self.portfolio_history is not None else None,
                writer, "Equity Curve"
            )
            _safe_to_excel(self.trade_ledger, writer, "Trade Ledger")
            _safe_to_excel(self.orders_df,    writer, "Orders")
            _safe_to_excel(self.fills_df,     writer, "Fills")
            _safe_to_excel(self.positions_df, writer, "Positions")

            # Metrics as vertical tables
            if self.performance:
                pd.DataFrame.from_dict(
                    self.performance, orient="index", columns=["Value"]
                ).to_excel(writer, sheet_name="Performance")

            if self.risk_metrics:
                pd.DataFrame.from_dict(
                    self.risk_metrics, orient="index", columns=["Value"]
                ).to_excel(writer, sheet_name="Risk Metrics")

            if self.account_snapshot:
                pd.DataFrame.from_dict(
                    self.account_snapshot, orient="index", columns=["Value"]
                ).to_excel(writer, sheet_name="Account")

        print(f"  Exported to {filepath}")
        return filepath

    def get_equity_curve(self) -> pd.Series:
        """Returns equity curve as a simple date-indexed Series. For chart modules."""
        if self.portfolio_history is not None and not self.portfolio_history.empty:
            return self.portfolio_history["equity"]
        return pd.Series(dtype=float)

    def get_daily_returns(self) -> pd.Series:
        """Returns daily return series. Feed directly into any risk/perf module."""
        if self.portfolio_history is not None and not self.portfolio_history.empty:
            return self.portfolio_history["daily_return"].dropna()
        return pd.Series(dtype=float)

    def get_position_weights(self) -> pd.Series:
        """
        Returns symbol -> portfolio weight (%) based on current market value.
        For portfolio construction and risk decomposition modules.
        """
        if self.positions_df is None or self.positions_df.empty:
            return pd.Series(dtype=float)

        equity = self.account_snapshot.get("equity", 1) if self.account_snapshot else 1
        weights = self.positions_df.set_index("symbol")["market_value"] / equity * 100
        return weights.sort_values(ascending=False)

    def get_sector_exposure(self) -> pd.DataFrame:
        """
        Returns sector allocation if asset_class data is available.
        Extend with a sector lookup (e.g., yfinance) for full breakdown.
        """
        if self.positions_df is None or self.positions_df.empty:
            return pd.DataFrame()

        equity = self.account_snapshot.get("equity", 1) if self.account_snapshot else 1
        df = self.positions_df.copy()
        df["weight_pct"] = df["market_value"] / equity * 100
        return df[["symbol", "asset_class", "market_value", "weight_pct", "unrealized_pl"]]

    def get_orders_summary(self) -> dict:
        """Summary statistics for order history."""
        if self.orders_df is None or self.orders_df.empty:
            return {}

        df = self.orders_df
        filled = df[df["status"] == "filled"]
        return {
            "total_orders":    len(df),
            "filled_orders":   len(filled),
            "canceled_orders": len(df[df["status"] == "canceled"]),
            "rejected_orders": len(df[df["status"].isin(["rejected", "expired"])]),
            "unique_symbols":  df["symbol"].nunique(),
            "buy_orders":      len(filled[filled["side"] == "buy"]),
            "sell_orders":     len(filled[filled["side"] == "sell"]),
            "date_range":      (
                str(df["submitted_at"].min().date()) + " to "
                + str(df["submitted_at"].max().date())
            ) if not df["submitted_at"].isna().all() else "N/A",
        }

    def get_fills_summary(self) -> dict:
        """Summary statistics for fill activity."""
        if self.fills_df is None or self.fills_df.empty:
            return {}

        df = self.fills_df
        fills_only = df[df["activity_type"] == "FILL"]
        fees_only  = df[df["activity_type"].isin(["CFEE", "TAF", "FEE"])]
        return {
            "total_fills":    len(fills_only),
            "total_fees":     len(fees_only),
            "total_fee_amt":  round(fees_only["amount"].sum(), 2) if not fees_only.empty else 0,
            "unique_symbols": fills_only["symbol"].nunique(),
        }

    # -----------------------------------------------------------------------
    # CONSOLE REPORTS
    # -----------------------------------------------------------------------

    def print_performance_report(self):
        """Formatted console performance report."""
        p = self.performance or {}
        r = self.risk_metrics or {}
        a = self.account_snapshot or {}

        print("\n" + "=" * 60)
        print("  ATLAS | ALPACA PERFORMANCE REPORT")
        print("=" * 60)
        print(f"  Account:          {a.get('account_number', 'N/A')}")
        print(f"  Mode:             {'Paper' if self.paper else 'Live'}")
        print(f"  Equity:           ${a.get('equity', 0):,.2f}")
        print(f"  Cash:             ${a.get('cash', 0):,.2f}")
        print(f"  Unrealized P&L:   ${a.get('unrealized_pl', 0):,.2f}")
        print("-" * 60)
        print(f"  Total Return:     {p.get('total_return_pct', 0):.2f}%")
        print(f"  CAGR:             {p.get('cagr_pct', 0):.2f}%")
        print(f"  Sharpe Ratio:     {p.get('sharpe_ratio', 0):.3f}")
        print(f"  Sortino Ratio:    {p.get('sortino_ratio', 0):.3f}")
        print(f"  Max Drawdown:     {p.get('max_drawdown_pct', 0):.2f}%")
        print(f"  Calmar Ratio:     {p.get('calmar_ratio', 0):.3f}")
        print("-" * 60)
        print(f"  Ann. Volatility:  {p.get('annualized_volatility_pct', 0):.2f}%")
        print(f"  VaR (95%):        {r.get('var_95_pct', 0):.2f}%")
        print(f"  CVaR (95%):       {r.get('cvar_95_pct', 0):.2f}%")
        print(f"  Skewness:         {r.get('skewness', 0):.3f}")
        print(f"  Excess Kurtosis:  {r.get('excess_kurtosis', 0):.3f}")
        print("-" * 60)
        if "n_trades" in p:
            print(f"  Trades (closed):  {p.get('n_trades', 0)}")
            print(f"  Win Rate:         {p.get('win_rate_pct', 0):.1f}%")
            print(f"  Profit Factor:    {p.get('profit_factor', 0):.3f}")
            print(f"  Avg Winner:       ${p.get('avg_winner_usd', 0):,.2f}")
            print(f"  Avg Loser:        ${p.get('avg_loser_usd', 0):,.2f}")
            print(f"  Best Trade:       ${p.get('best_trade_usd', 0):,.2f}")
            print(f"  Worst Trade:      ${p.get('worst_trade_usd', 0):,.2f}")
            print(f"  Total Realized:   ${p.get('total_realized_pnl', 0):,.2f}")
        print("=" * 60 + "\n")

    def _print_summary(self):
        """Quick summary after fetch_all completes."""
        print("\n  --- Fetch Complete ---")
        print(f"  Orders:           {len(self.orders_df) if self.orders_df is not None else 0} records")
        print(f"  Fill Activities:  {len(self.fills_df) if self.fills_df is not None else 0} records")
        print(f"  Open Positions:   {len(self.positions_df) if self.positions_df is not None else 0}")
        print(f"  Equity Curve:     {len(self.portfolio_history) if self.portfolio_history is not None else 0} days")
        print(f"  Trade Ledger:     {len(self.trade_ledger) if self.trade_ledger is not None else 0} trades")
        print()


# ---------------------------------------------------------------------------
# UTILITY FUNCTIONS
# ---------------------------------------------------------------------------

def _safe_float(val) -> Optional[float]:
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _safe_to_excel(df, writer, sheet_name):
    """Write DataFrame to Excel sheet if it exists and is non-empty."""
    if df is not None and not df.empty:
        df_clean = df.copy()
        # Excel can't handle tz-aware datetimes - strip tz
        for col in df_clean.select_dtypes(include=["datetimetz"]).columns:
            df_clean[col] = df_clean[col].dt.tz_localize(None)
        df_clean.to_excel(writer, sheet_name=sheet_name, index=False)


# ---------------------------------------------------------------------------
# CREDENTIAL HELPER - for dynamic key entry
# ---------------------------------------------------------------------------

def prompt_credentials(paper: bool = True) -> AlpacaDataEngine:
    """
    Interactive credential prompt for use in notebooks or CLI.
    Since Alpaca paper keys rotate on each login, this is the
    recommended pattern for interactive ATLAS sessions.

    Usage:
        engine = prompt_credentials()
        engine.fetch_all()
    """
    import getpass
    print("\n  +-- Alpaca Credentials ----------------------------+")
    print(f"  |  Mode: {'PAPER TRADING' if paper else 'LIVE TRADING':<46}|")
    print("  |  Keys rotate each session - enter fresh from Alpaca.|")
    print("  +----------------------------------------------------+")
    key    = getpass.getpass("  API Key:    ")
    secret = getpass.getpass("  API Secret: ")
    return AlpacaDataEngine(api_key=key, api_secret=secret, paper=paper)


# ---------------------------------------------------------------------------
# ATLAS MODULE INTEGRATION GUIDE
# ---------------------------------------------------------------------------
#
# PERFORMANCE SUITE:
#     engine.get_equity_curve()       -> pass to NAV chart
#     engine.get_daily_returns()      -> pass to return distribution
#     engine.performance              -> dict -> unpack into any metrics panel
#
# RISK ANALYSIS:
#     engine.get_daily_returns()      -> VaR / drawdown inputs
#     engine.risk_metrics             -> pre-computed VaR, CVaR, skew, kurtosis
#     engine.get_position_weights()   -> concentration risk / HHI
#
# PORTFOLIO CONSTRUCTION:
#     engine.positions_df             -> current holdings with weights
#     engine.get_position_weights()   -> percentage weights for optimizer
#     engine.get_sector_exposure()    -> allocation by asset class
#
# MANAGER / FUND ANALYTICS:
#     engine.trade_ledger             -> full trade history, P&L, holding periods
#     engine.performance["win_rate_pct"]    -> win rate
#     engine.performance["profit_factor"]   -> risk/reward
#     engine.performance["sharpe_ratio"]    -> risk-adjusted return
#
# REPORTING:
#     engine.export_to_excel("report.xlsx") -> full multi-sheet export
#     engine.print_performance_report()     -> console summary
# ---------------------------------------------------------------------------
