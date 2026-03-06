"""
ATLAS Terminal - Alpaca Integration Quickstart
===============================================
Run this script each session after logging into Alpaca.

HOW TO USE EACH SESSION:
    1. Log into Alpaca -> copy your API Key + Secret from the dashboard
    2. Paste them when prompted below (or set them directly for Colab)
    3. Run this script - all data loads into `engine`
    4. Use `engine.*` in any other ATLAS module in the same session

NEVER commit API keys to git. Keys are only valid for the current session.
"""

from data.alpaca_data_engine import AlpacaDataEngine, prompt_credentials
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

# ---------------------------------------------------------------------------
# STEP 1: AUTHENTICATE
# Option A - Interactive prompt (recommended, keys never touch code)
# ---------------------------------------------------------------------------

# engine = prompt_credentials(paper=True)

# Option B - Direct (for Jupyter/Colab sessions where getpass is awkward)
engine = AlpacaDataEngine(
    api_key    = "PASTE_YOUR_KEY_HERE",
    api_secret = "PASTE_YOUR_SECRET_HERE",
    paper      = True,   # Set False for live account
)

# ---------------------------------------------------------------------------
# STEP 2: FETCH EVERYTHING
# ---------------------------------------------------------------------------

print("\n  Loading all Alpaca data into ATLAS...\n")
engine.fetch_all(verbose=True)

# ---------------------------------------------------------------------------
# STEP 3: PRINT FULL PERFORMANCE REPORT
# ---------------------------------------------------------------------------

engine.print_performance_report()

# ---------------------------------------------------------------------------
# STEP 4: PREVIEW KEY DataFrames
# ---------------------------------------------------------------------------

print("  -- Portfolio Equity Curve (last 10 days) --")
if engine.portfolio_history is not None and not engine.portfolio_history.empty:
    ph = engine.portfolio_history[["equity", "profit_loss", "profit_loss_pct", "drawdown", "daily_return"]]
    print(ph.tail(10).to_string())

print("\n  -- Open Positions --")
if engine.positions_df is not None and not engine.positions_df.empty:
    print(engine.positions_df[[
        "symbol", "qty", "avg_entry_price", "current_price",
        "market_value", "unrealized_pl", "unrealized_plpc"
    ]].to_string(index=False))

print("\n  -- Trade Ledger (last 10 closed trades) --")
if engine.trade_ledger is not None and not engine.trade_ledger.empty:
    closed = engine.trade_ledger[engine.trade_ledger["status"] == "closed"]
    cols = [
        "symbol", "entry_date", "exit_date", "entry_price", "exit_price",
        "qty", "realized_pnl", "pnl_pct", "holding_days"
    ]
    print(closed[cols].tail(10).to_string(index=False))

# ---------------------------------------------------------------------------
# STEP 5: CHARTS
# ---------------------------------------------------------------------------

def plot_equity_curve(engine: AlpacaDataEngine):
    """Equity curve + drawdown chart."""
    ph = engine.portfolio_history
    if ph is None or ph.empty:
        print("  No portfolio history available.")
        return

    fig, (ax1, ax2) = plt.subplots(
        2, 1, figsize=(14, 8), sharex=True,
        gridspec_kw={"height_ratios": [3, 1]}
    )
    fig.patch.set_facecolor("#0d1117")
    for ax in [ax1, ax2]:
        ax.set_facecolor("#161b22")
        ax.tick_params(colors="#8b949e", labelsize=9)
        for spine in ax.spines.values():
            spine.set_color("#30363d")

    dates  = ph.index
    equity = ph["equity"]
    dd     = ph["drawdown"]

    ax1.plot(dates, equity, color="#58a6ff", linewidth=1.5, label="Portfolio Equity")
    ax1.fill_between(dates, equity, equity.min(), alpha=0.08, color="#58a6ff")
    ax1.set_ylabel("Equity (USD)", color="#8b949e", fontsize=10)
    ax1.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"${x:,.0f}"))
    ax1.set_title(
        "ATLAS | Alpaca Portfolio Equity Curve", color="#f0f6fc",
        fontsize=13, fontweight="bold", pad=12
    )
    ax1.legend(facecolor="#161b22", edgecolor="#30363d", labelcolor="#f0f6fc", fontsize=9)

    ax2.fill_between(dates, dd, 0, color="#f85149", alpha=0.6, label="Drawdown")
    ax2.set_ylabel("Drawdown %", color="#8b949e", fontsize=10)
    ax2.set_xlabel("Date", color="#8b949e", fontsize=10)
    ax2.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:.1f}%"))
    ax2.legend(facecolor="#161b22", edgecolor="#30363d", labelcolor="#f0f6fc", fontsize=9)

    plt.tight_layout()
    plt.savefig("atlas_equity_curve.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.show()
    print("  Chart saved to atlas_equity_curve.png")


def plot_trade_pnl(engine: AlpacaDataEngine):
    """Bar chart of realized P&L per closed trade, sorted by exit date."""
    tl = engine.trade_ledger
    if tl is None or tl.empty:
        print("  No trade ledger available.")
        return

    closed = tl[tl["status"] == "closed"].copy()
    if closed.empty:
        print("  No closed trades.")
        return

    closed = closed.sort_values("exit_date").reset_index(drop=True)
    colors = ["#3fb950" if v > 0 else "#f85149" for v in closed["realized_pnl"]]

    fig, ax = plt.subplots(figsize=(14, 6))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#161b22")
    ax.tick_params(colors="#8b949e", labelsize=8)
    for spine in ax.spines.values():
        spine.set_color("#30363d")

    ax.bar(range(len(closed)), closed["realized_pnl"], color=colors, alpha=0.85)
    ax.axhline(0, color="#8b949e", linewidth=0.8, linestyle="--")

    ax.set_xlabel("Trade #", color="#8b949e", fontsize=10)
    ax.set_ylabel("Realized P&L (USD)", color="#8b949e", fontsize=10)
    ax.set_title(
        "ATLAS | Realized P&L per Trade", color="#f0f6fc",
        fontsize=13, fontweight="bold"
    )
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"${x:,.0f}"))

    # Annotate symbol on larger trades
    q75 = closed["realized_pnl"].abs().quantile(0.75)
    for i, (_, row) in enumerate(closed.iterrows()):
        if abs(row["realized_pnl"]) > q75:
            offset = 5 if row["realized_pnl"] > 0 else -5
            va = "bottom" if row["realized_pnl"] > 0 else "top"
            ax.text(i, row["realized_pnl"] + offset, row["symbol"],
                    ha="center", va=va, color="#f0f6fc", fontsize=7)

    plt.tight_layout()
    plt.savefig("atlas_trade_pnl.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.show()
    print("  Chart saved to atlas_trade_pnl.png")


def plot_position_weights(engine: AlpacaDataEngine):
    """Horizontal bar chart of current position weights."""
    weights = engine.get_position_weights()
    if weights.empty:
        print("  No positions.")
        return

    fig, ax = plt.subplots(figsize=(10, max(4, len(weights) * 0.45)))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#161b22")
    ax.tick_params(colors="#8b949e", labelsize=9)
    for spine in ax.spines.values():
        spine.set_color("#30363d")

    n = len(weights)
    colors = plt.cm.Blues([0.4 + 0.5 * (i / max(n - 1, 1)) for i in range(n)])
    ax.barh(weights.index[::-1], weights.values[::-1], color=colors[::-1], alpha=0.85)
    ax.set_xlabel("Portfolio Weight (%)", color="#8b949e", fontsize=10)
    ax.set_title(
        "ATLAS | Current Position Weights", color="#f0f6fc",
        fontsize=13, fontweight="bold"
    )
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:.1f}%"))

    for i, (sym, w) in enumerate(zip(weights.index[::-1], weights.values[::-1])):
        ax.text(w + 0.1, i, f"{w:.1f}%", va="center", color="#f0f6fc", fontsize=8)

    plt.tight_layout()
    plt.savefig("atlas_position_weights.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.show()
    print("  Chart saved to atlas_position_weights.png")


# Run charts
plot_equity_curve(engine)
plot_trade_pnl(engine)
plot_position_weights(engine)

# ---------------------------------------------------------------------------
# STEP 6: EXPORT TO EXCEL
# ---------------------------------------------------------------------------

engine.export_to_excel("atlas_alpaca_data.xlsx")

# ---------------------------------------------------------------------------
# INTEGRATION REFERENCE - paste these lines into any ATLAS module
# ---------------------------------------------------------------------------
#
# from alpaca_data_engine import AlpacaDataEngine
#
# # In your module init (after engine is already built in session):
# equity_curve   = engine.get_equity_curve()
# daily_returns  = engine.get_daily_returns()
# weights        = engine.get_position_weights()
# perf           = engine.performance          # dict
# risk           = engine.risk_metrics         # dict
# positions      = engine.positions_df         # DataFrame
# trade_ledger   = engine.trade_ledger         # DataFrame
# account        = engine.account_snapshot     # dict
# ---------------------------------------------------------------------------
