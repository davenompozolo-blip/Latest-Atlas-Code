"""
ATLAS Scheduler — Monthly Positioning Commentary Job
======================================================
Generates a monthly commentary via Claude (headless) and emails it.
"""
from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger("atlas.scheduler.monthly_commentary")


def execute_monthly_commentary(user_config: dict):
    """Generate and email monthly positioning commentary.

    Args:
        user_config: dict with email, portfolio_tickers, portfolio_weights,
                     key_calls (optional), tone (optional)
    """
    from config.branding import get_branding
    from scheduler.delivery.email import send_email

    brand = get_branding()
    email = user_config["email"]
    tickers = user_config.get("portfolio_tickers", [])
    tone = user_config.get("monthly_commentary", {}).get("tone", "institutional")

    # Fetch regime context (headless — no Streamlit)
    regime_ctx = None
    try:
        from regime_detector import QuantitativeRegimeDetector
        detector = QuantitativeRegimeDetector()
        indicators = detector.fetch_market_indicators()
        regime_ctx = {
            "quant_regime": indicators.get("overall_regime", "unknown"),
            "consensus": indicators.get("overall_regime", "unknown"),
        }
    except Exception as e:
        logger.warning(f"Regime context unavailable: {e}")

    # Fetch market returns for context
    market_returns = ""
    if tickers:
        try:
            import yfinance as yf
            data = yf.download(tickers[:5], period="1mo", progress=False)
            if not data.empty:
                close = data["Close"] if "Close" in data.columns.get_level_values(0) else data
                rets = (close.iloc[-1] / close.iloc[0] - 1) * 100
                market_returns = "\n".join(f"- {t}: {r:+.1f}%" for t, r in rets.items())
        except Exception as e:
            logger.warning(f"Market returns fetch failed: {e}")

    # Build prompt and generate commentary
    word_counts = {"institutional": 800, "concise": 400, "detailed": 1200}
    wc = word_counts.get(tone, 800)

    system_prompt = (
        "You are a senior investment strategist writing for a South African "
        "institutional investment consultancy. Write a monthly positioning "
        "commentary. Structure: 1. Market Backdrop 2. Portfolio Positioning "
        f"3. Key Calls 4. Outlook. Target {wc} words."
    )

    from ui.pages.commentary_generator import _build_quarterly_message, _generate_commentary

    key_calls = "\n".join(user_config.get("key_calls", []))
    user_message = _build_quarterly_message(regime_ctx, market_returns, "", key_calls)

    try:
        commentary = _generate_commentary(system_prompt, user_message)
    except Exception as e:
        logger.error(f"Commentary generation failed: {e}")
        raise

    # Save as latest commentary
    try:
        import json
        from pathlib import Path
        latest_file = Path(__file__).resolve().parent.parent.parent / ".atlas_latest_commentary.json"
        latest_file.write_text(json.dumps({
            "commentary": commentary,
            "commentary_type": "Monthly Positioning Commentary",
            "word_count": len(commentary.split()),
            "generated_at": datetime.utcnow().isoformat(),
        }), encoding="utf-8")
    except Exception:
        pass

    # Email
    html = (
        f'<div style="font-family:Segoe UI,Roboto,sans-serif; background:#111827;'
        f' color:rgba(255,255,255,0.85); padding:32px; border-radius:12px;">'
        f'<h2 style="color:#fff; margin:0 0 4px;">{brand["firm_name"]}</h2>'
        f'<p style="color:rgba(255,255,255,0.4); font-size:12px; margin:0 0 24px;">'
        f'Monthly Positioning Commentary — {datetime.now():%B %Y}</p>'
        f'<div style="line-height:1.7; font-size:14px; white-space:pre-wrap;">'
        f'{commentary}</div>'
        f'<hr style="border:none; border-top:1px solid rgba(255,255,255,0.06); margin:24px 0;">'
        f'<p style="font-size:11px; color:rgba(255,255,255,0.3); text-align:center;">'
        f'{brand.get("report_footer", brand["firm_name"])}</p>'
        f'</div>'
    )

    send_email(
        to=email,
        subject=f"{brand['firm_name']} — Monthly Commentary — {datetime.now():%B %Y}",
        html_body=html,
    )
