"""
ATLAS Scheduler — Weekly Portfolio Snapshot Job
=================================================
Collects portfolio data from the data layer directly (no Streamlit),
renders the snapshot email, and sends via SendGrid.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

logger = logging.getLogger("atlas.scheduler.weekly_snapshot")


def execute_weekly_snapshot(user_config: dict):
    """Run weekly snapshot for a single user configuration.

    Args:
        user_config: dict with keys:
            - email: recipient email address
            - portfolio_tickers: list of ticker symbols
            - portfolio_weights: dict of ticker -> weight
            - benchmark: benchmark ticker (default ^J203.JO)
    """
    import numpy as np
    import pandas as pd

    from config.branding import get_branding
    from scheduler.delivery.email import send_email, render_snapshot_email

    brand = get_branding()
    tickers = user_config.get("portfolio_tickers", [])
    weights = user_config.get("portfolio_weights", {})
    email = user_config["email"]

    if not tickers:
        logger.warning(f"No tickers configured for {email}, skipping")
        return

    # Fetch price data
    from core.fetchers import fetch_historical_data

    end = datetime.now()
    start_week = end - timedelta(days=7)
    start_month = end.replace(day=1)
    start_year = end.replace(month=1, day=1)

    frames = {}
    for ticker in tickers:
        try:
            data = fetch_historical_data(ticker, start_year, end)
            if data is not None and not data.empty:
                close = data["Close"] if isinstance(data, pd.DataFrame) and "Close" in data.columns else data
                if isinstance(close, pd.DataFrame):
                    close = close.iloc[:, 0]
                frames[ticker] = close
        except Exception as e:
            logger.warning(f"Failed to fetch {ticker}: {e}")

    if not frames:
        logger.error(f"No price data available for {email}")
        return

    prices = pd.DataFrame(frames).dropna()
    returns = prices.pct_change().dropna()

    # Compute weighted portfolio returns
    w = np.array([weights.get(t, 1.0 / len(tickers)) for t in returns.columns])

    # Weekly return
    week_prices = prices[prices.index >= pd.Timestamp(start_week)]
    if len(week_prices) >= 2:
        week_ret = float((week_prices.iloc[-1] / week_prices.iloc[0] - 1).dot(w))
    else:
        week_ret = 0.0

    # MTD return
    month_prices = prices[prices.index >= pd.Timestamp(start_month)]
    if len(month_prices) >= 2:
        mtd_ret = float((month_prices.iloc[-1] / month_prices.iloc[0] - 1).dot(w))
    else:
        mtd_ret = 0.0

    # YTD return
    if len(prices) >= 2:
        ytd_ret = float((prices.iloc[-1] / prices.iloc[0] - 1).dot(w))
    else:
        ytd_ret = 0.0

    # Portfolio value (if provided)
    portfolio_value = user_config.get("portfolio_value", 0)
    pv_str = f"R{portfolio_value:,.0f}" if portfolio_value else "N/A"

    # Top movers (individual stock returns for the week)
    movers = []
    for ticker in returns.columns:
        week_rets = returns[ticker][returns.index >= pd.Timestamp(start_week)]
        if len(week_rets) > 0:
            total = float((1 + week_rets).prod() - 1) * 100
            movers.append({"ticker": ticker, "change": total})
    movers.sort(key=lambda x: abs(x["change"]), reverse=True)

    # Regime status
    regime_quant = "N/A"
    regime_macro = "N/A"
    try:
        from regime_detector import QuantitativeRegimeDetector
        detector = QuantitativeRegimeDetector()
        indicators = detector.fetch_market_indicators()
        regime_quant = indicators.get("overall_regime", "N/A")
    except Exception:
        pass

    try:
        from services.macro_regime import MacroRegimeEngine
        engine = MacroRegimeEngine()
        result = engine.classify_from_market_data()
        if result:
            regime_macro = result.get("regime", "N/A").upper()
    except Exception:
        pass

    # Commentary excerpt
    commentary_excerpt = "No commentary generated yet."
    try:
        import json
        from pathlib import Path
        latest_file = Path(__file__).resolve().parent.parent.parent / ".atlas_latest_commentary.json"
        if latest_file.exists():
            data = json.loads(latest_file.read_text(encoding="utf-8"))
            text = data.get("commentary", "")
            words = text.split()[:40]
            commentary_excerpt = " ".join(words) + ("..." if len(text.split()) > 40 else "")
    except Exception:
        pass

    # Render email
    html = render_snapshot_email(
        firm_name=brand["firm_name"],
        date_str=datetime.now().strftime("%d %B %Y"),
        portfolio_value=pv_str,
        week_return=f"{week_ret:+.1%}",
        mtd_return=f"{mtd_ret:+.1%}",
        ytd_return=f"{ytd_ret:+.1%}",
        top_movers=movers[:5],
        regime_quant=regime_quant,
        regime_macro=regime_macro,
        commentary_excerpt=commentary_excerpt,
        website_url=brand.get("website", ""),
        report_footer=brand.get("report_footer", brand["firm_name"]),
    )

    # Send
    send_email(
        to=email,
        subject=f"{brand['firm_name']} — Weekly Snapshot — {datetime.now():%d %b %Y}",
        html_body=html,
    )
