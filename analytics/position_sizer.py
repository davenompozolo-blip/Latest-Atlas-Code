"""
ATLAS Position Sizer — three sizing methodologies in one place.

Methods
-------
kelly_fraction       Full/half Kelly based on win-rate + payoff ratio
fixed_fractional     Simple % of equity per trade
volatility_based     Position sized to target a fixed dollar risk per day
                     (equity * risk_pct / position_volatility)

All functions return a PositionSize dataclass so callers can display
the reasoning as well as the final share count.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional


@dataclass
class PositionSize:
    method: str
    shares: float
    notional: float
    pct_of_portfolio: float
    equity_used: float
    notes: str
    # method-specific detail fields (populated only for the relevant method)
    kelly_fraction: Optional[float] = None
    risk_per_share: Optional[float] = None
    daily_vol_per_share: Optional[float] = None


# ---------------------------------------------------------------------------
# Kelly Criterion
# ---------------------------------------------------------------------------

def kelly_fraction(
    win_rate: float,
    avg_win_pct: float,
    avg_loss_pct: float,
    portfolio_equity: float,
    current_price: float,
    kelly_multiplier: float = 0.5,
    max_position_pct: float = 0.20,
) -> PositionSize:
    """
    Half-Kelly (default) position size based on historical win/loss statistics.

    Parameters
    ----------
    win_rate : float
        Probability of a winning trade (0.0–1.0).
    avg_win_pct : float
        Average profit on winning trades as a decimal (e.g. 0.08 for 8%).
    avg_loss_pct : float
        Average loss on losing trades as a decimal (e.g. 0.04 for 4%).
    portfolio_equity : float
        Total account equity in dollars.
    current_price : float
        Current price of the security.
    kelly_multiplier : float
        Fraction of full Kelly to use (0.5 = half-Kelly). Default 0.5.
    max_position_pct : float
        Hard cap on position as fraction of equity. Default 20%.

    Returns
    -------
    PositionSize
    """
    if avg_loss_pct <= 0 or current_price <= 0 or portfolio_equity <= 0:
        return PositionSize(
            method="Kelly",
            shares=0,
            notional=0,
            pct_of_portfolio=0,
            equity_used=portfolio_equity,
            notes="Invalid inputs — loss pct, price, and equity must be > 0.",
        )

    payoff_ratio = avg_win_pct / avg_loss_pct
    loss_rate = 1.0 - win_rate

    # Full Kelly: f* = (p * b - q) / b  where b = payoff ratio
    full_kelly = (win_rate * payoff_ratio - loss_rate) / payoff_ratio
    full_kelly = max(0.0, full_kelly)

    adjusted_kelly = full_kelly * kelly_multiplier
    adjusted_kelly = min(adjusted_kelly, max_position_pct)

    notional = portfolio_equity * adjusted_kelly
    shares = notional / current_price

    notes = (
        f"Full Kelly = {full_kelly:.1%}, "
        f"{kelly_multiplier:.0%}-Kelly = {adjusted_kelly:.1%}, "
        f"capped at {max_position_pct:.0%}"
    )
    if full_kelly <= 0:
        notes = "Negative Kelly — edge is unfavourable at these win/loss stats."

    return PositionSize(
        method="Kelly Criterion",
        shares=round(shares, 4),
        notional=round(notional, 2),
        pct_of_portfolio=round(adjusted_kelly * 100, 2),
        equity_used=portfolio_equity,
        notes=notes,
        kelly_fraction=adjusted_kelly,
    )


# ---------------------------------------------------------------------------
# Fixed Fractional
# ---------------------------------------------------------------------------

def fixed_fractional(
    risk_pct: float,
    portfolio_equity: float,
    current_price: float,
    stop_loss_price: Optional[float] = None,
) -> PositionSize:
    """
    Size position so that the dollar risk equals `risk_pct` of equity.

    If `stop_loss_price` is provided, risk is measured from current price
    to stop-loss and shares are sized accordingly (risk-based sizing).
    Otherwise `risk_pct` is applied directly as a position size fraction.

    Parameters
    ----------
    risk_pct : float
        Fraction of equity to risk per trade (e.g. 0.01 for 1%).
    portfolio_equity : float
        Total account equity in dollars.
    current_price : float
        Current price of the security.
    stop_loss_price : float, optional
        Stop-loss level. When provided, enables precise risk-per-share sizing.
    """
    if current_price <= 0 or portfolio_equity <= 0:
        return PositionSize(
            method="Fixed Fractional",
            shares=0,
            notional=0,
            pct_of_portfolio=0,
            equity_used=portfolio_equity,
            notes="Invalid inputs.",
        )

    dollar_risk = portfolio_equity * risk_pct

    if stop_loss_price and stop_loss_price > 0:
        risk_per_share = abs(current_price - stop_loss_price)
        if risk_per_share < 0.0001:
            risk_per_share = current_price * 0.01  # fallback: 1% of price
        shares = dollar_risk / risk_per_share
        notional = shares * current_price
        pct = notional / portfolio_equity * 100
        notes = (
            f"Risk ${dollar_risk:,.2f} / ${risk_per_share:.2f} per share = "
            f"{shares:.1f} shares"
        )
        return PositionSize(
            method="Fixed Fractional (Stop-Based)",
            shares=round(shares, 4),
            notional=round(notional, 2),
            pct_of_portfolio=round(pct, 2),
            equity_used=portfolio_equity,
            notes=notes,
            risk_per_share=risk_per_share,
        )
    else:
        # Direct fraction of equity
        notional = portfolio_equity * risk_pct
        shares = notional / current_price
        pct = risk_pct * 100
        notes = f"{risk_pct:.1%} of ${portfolio_equity:,.0f} equity = ${notional:,.2f}"
        return PositionSize(
            method="Fixed Fractional",
            shares=round(shares, 4),
            notional=round(notional, 2),
            pct_of_portfolio=round(pct, 2),
            equity_used=portfolio_equity,
            notes=notes,
        )


# ---------------------------------------------------------------------------
# Volatility-Based
# ---------------------------------------------------------------------------

def volatility_based(
    daily_vol_pct: float,
    portfolio_equity: float,
    current_price: float,
    target_risk_pct: float = 0.01,
    max_position_pct: float = 0.20,
) -> PositionSize:
    """
    Size position so that the expected daily dollar move equals
    `target_risk_pct` of equity.

    Shares = (equity * target_risk_pct) / (price * daily_vol_pct)

    Parameters
    ----------
    daily_vol_pct : float
        Daily volatility of the security as a decimal (e.g. 0.02 for 2%).
    portfolio_equity : float
        Total account equity in dollars.
    current_price : float
        Current price of the security.
    target_risk_pct : float
        Target daily dollar risk as fraction of equity. Default 1%.
    max_position_pct : float
        Hard cap on position as fraction of equity. Default 20%.
    """
    if daily_vol_pct <= 0 or current_price <= 0 or portfolio_equity <= 0:
        return PositionSize(
            method="Volatility-Based",
            shares=0,
            notional=0,
            pct_of_portfolio=0,
            equity_used=portfolio_equity,
            notes="Invalid inputs — vol, price, and equity must be > 0.",
        )

    dollar_risk_target = portfolio_equity * target_risk_pct
    daily_vol_dollars = current_price * daily_vol_pct

    shares = dollar_risk_target / daily_vol_dollars

    # Enforce max position cap
    max_notional = portfolio_equity * max_position_pct
    uncapped_notional = shares * current_price
    if uncapped_notional > max_notional:
        shares = max_notional / current_price

    notional = shares * current_price
    pct = notional / portfolio_equity * 100

    notes = (
        f"Target risk ${dollar_risk_target:,.2f}/day, "
        f"vol ${daily_vol_dollars:.2f}/share/day, "
        f"capped at {max_position_pct:.0%}"
    )

    return PositionSize(
        method="Volatility-Based",
        shares=round(shares, 4),
        notional=round(notional, 2),
        pct_of_portfolio=round(pct, 2),
        equity_used=portfolio_equity,
        notes=notes,
        daily_vol_per_share=daily_vol_dollars,
    )


# ---------------------------------------------------------------------------
# Convenience: annualised vol -> daily vol
# ---------------------------------------------------------------------------

def annual_vol_to_daily(annual_vol_pct: float) -> float:
    """Convert annualised volatility percentage to daily (252 trading days)."""
    return annual_vol_pct / math.sqrt(252)
