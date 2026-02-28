"""
ATLAS Scheduler — Quarterly Attribution Summary Job
=====================================================
Generates quarterly attribution commentary + DOCX attachment via Claude.
"""
from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger("atlas.scheduler.quarterly_attribution")


def execute_quarterly_attribution(user_config: dict):
    """Generate and email quarterly attribution with DOCX attachment.

    Args:
        user_config: dict with email, portfolio_tickers, portfolio_weights,
                     benchmark (optional), tone (optional)
    """
    import numpy as np
    import pandas as pd

    from config.branding import get_branding
    from scheduler.delivery.email import send_email

    brand = get_branding()
    email = user_config["email"]
    tickers = user_config.get("portfolio_tickers", [])
    weights = user_config.get("portfolio_weights", {})
    benchmark = user_config.get("benchmark", "^J203.JO")
    tone = user_config.get("quarterly_attribution", {}).get("tone", "institutional")

    if not tickers:
        logger.warning(f"No tickers for {email}, skipping quarterly attribution")
        return

    # Fetch 3-month returns
    from core.fetchers import fetch_historical_data
    from datetime import timedelta

    end = datetime.now()
    start = end - timedelta(days=90)

    frames = {}
    for ticker in tickers:
        try:
            data = fetch_historical_data(ticker, start, end)
            if data is not None and not data.empty:
                close = data["Close"] if isinstance(data, pd.DataFrame) and "Close" in data.columns else data
                if isinstance(close, pd.DataFrame):
                    close = close.iloc[:, 0]
                frames[ticker] = close
        except Exception:
            continue

    if not frames:
        logger.error(f"No price data for {email}")
        return

    prices = pd.DataFrame(frames).dropna()
    returns = prices.pct_change().dropna()

    w = np.array([weights.get(t, 1.0 / len(tickers)) for t in returns.columns])
    port_returns = (returns * w).sum(axis=1)
    total_port_ret = float((1 + port_returns).prod() - 1)

    # Benchmark return
    bench_ret = 0.0
    try:
        bench_data = fetch_historical_data(benchmark, start, end)
        if bench_data is not None and not bench_data.empty:
            close = bench_data["Close"] if isinstance(bench_data, pd.DataFrame) and "Close" in bench_data.columns else bench_data
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]
            bench_ret = float(close.iloc[-1] / close.iloc[0] - 1)
    except Exception:
        pass

    # Build attribution data
    quarter = f"Q{(end.month - 1) // 3 + 1} {end.year}"
    attr_data = {
        "period": quarter,
        "benchmark_name": benchmark,
        "total_return": total_port_ret * 100,
        "benchmark_return": bench_ret * 100,
        "allocation_effect": (total_port_ret - bench_ret) * 50,  # Simplified split
        "selection_effect": (total_port_ret - bench_ret) * 50,
    }

    # Generate commentary
    word_counts = {"institutional": 800, "concise": 400, "detailed": 1200}
    wc = word_counts.get(tone, 800)

    system_prompt = (
        "You are a performance analyst at a South African institutional "
        "investment consultancy. Write a Portfolio Attribution Commentary. "
        "Structure: 1. Headline 2. What Drove Returns 3. What Changed "
        f"4. Looking Forward. Target {wc} words."
    )

    from ui.pages.commentary_generator import _build_attribution_message, _generate_commentary

    user_message = _build_attribution_message(attr_data, quarter, benchmark)

    try:
        commentary = _generate_commentary(system_prompt, user_message)
    except Exception as e:
        logger.error(f"Commentary generation failed: {e}")
        raise

    # Build DOCX attachment
    docx_bytes = None
    try:
        from ui.pages.commentary_generator import _build_docx
        docx_bytes = _build_docx(commentary, "Quarterly Attribution", f"{quarter}")
    except Exception as e:
        logger.warning(f"DOCX generation failed: {e}")

    # Email
    html = (
        f'<div style="font-family:Segoe UI,Roboto,sans-serif; background:#111827;'
        f' color:rgba(255,255,255,0.85); padding:32px; border-radius:12px;">'
        f'<h2 style="color:#fff; margin:0 0 4px;">{brand["firm_name"]}</h2>'
        f'<p style="color:rgba(255,255,255,0.4); font-size:12px; margin:0 0 24px;">'
        f'Quarterly Attribution Summary — {quarter}</p>'
        f'<div style="line-height:1.7; font-size:14px; white-space:pre-wrap;">'
        f'{commentary}</div>'
        f'<hr style="border:none; border-top:1px solid rgba(255,255,255,0.06); margin:24px 0;">'
        f'<p style="font-size:11px; color:rgba(255,255,255,0.3); text-align:center;">'
        f'{brand.get("report_footer", brand["firm_name"])}</p>'
        f'</div>'
    )

    attachments = []
    if docx_bytes:
        attachments.append({
            "filename": f"ATLAS_Attribution_{quarter.replace(' ', '_')}.docx",
            "content": docx_bytes,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })

    send_email(
        to=email,
        subject=f"{brand['firm_name']} — Quarterly Attribution — {quarter}",
        html_body=html,
        attachments=attachments,
    )
