"""
Valuation House — pure computation helpers.

Extracted from ui/pages/valuation_house.py (Phase 4, C1) to satisfy the
Module Pattern Contract: no business logic in render functions.

Every function here is a pure computation — no Streamlit imports, no UI
side-effects.  The render function calls these helpers and renders the
results.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


# ── WACC derivation ─────────────────────────────────────────────────
def derive_wacc(
    risk_free: float,
    beta: float,
    market_risk_premium: float,
    cost_debt: float,
    tax_rate: float,
    total_debt: float,
    total_equity: float,
    *,
    calculate_cost_of_equity_fn,
    calculate_wacc_fn,
) -> Tuple[float, float]:
    """Compute cost-of-equity and WACC from component inputs.

    Returns (cost_of_equity, wacc).
    """
    cost_equity = calculate_cost_of_equity_fn(risk_free, beta, market_risk_premium)
    wacc = calculate_wacc_fn(cost_equity, cost_debt, tax_rate, total_debt, total_equity)
    return cost_equity, wacc


# ── DCFProjections → legacy list conversion ─────────────────────────
def convert_dashboard_projections(dcf_proj_obj: Any) -> Optional[List[Dict]]:
    """Convert a DCFProjections object (or list of them) to legacy list-of-dicts.

    Returns None if the format is not recognised.
    """
    projections: List[Dict] = []

    if isinstance(dcf_proj_obj, list) and len(dcf_proj_obj) > 0:
        proj_item = dcf_proj_obj[0]
        if (
            proj_item
            and hasattr(proj_item, "forecast_years")
            and hasattr(proj_item, "final_projections")
        ):
            for year in range(1, proj_item.forecast_years + 1):
                year_data = (
                    proj_item.final_projections.get(year, {})
                    if isinstance(proj_item.final_projections, dict)
                    else {}
                )
                projections.append(_year_dict(year, year_data))
        else:
            return None
    elif not isinstance(dcf_proj_obj, list) and hasattr(dcf_proj_obj, "forecast_years") and hasattr(dcf_proj_obj, "final_projections"):
        for year in range(1, dcf_proj_obj.forecast_years + 1):
            year_data = (
                dcf_proj_obj.final_projections.get(year, {})
                if isinstance(dcf_proj_obj.final_projections, dict)
                else {}
            )
            projections.append(_year_dict(year, year_data))
    else:
        return None

    return projections or None


def _year_dict(year: int, data: Dict) -> Dict:
    return {
        "year": year,
        "revenue": data.get("revenue", 0),
        "ebit": data.get("ebit", 0),
        "nopat": data.get("nopat", 0),
        "fcff": data.get("fcff", 0),
        "fcfe": data.get("fcfe", 0),
    }


# ── Upside / downside ───────────────────────────────────────────────
def calc_upside_downside(intrinsic_value: float, current_price: float) -> float:
    """Return percentage upside (+) or downside (-)."""
    if current_price == 0:
        return 0.0
    return ((intrinsic_value - current_price) / current_price) * 100


# ── Equity bridge (net debt) ────────────────────────────────────────
def calc_net_debt(total_debt: float, cash: float) -> float:
    return total_debt - cash


# ── Sensitivity range generation ────────────────────────────────────
def sensitivity_ranges(
    base_discount: float,
    base_terminal: float,
    discount_steps: int = 5,
    terminal_steps: int = 5,
    discount_step_size: float = 0.005,
    terminal_step_size: float = 0.005,
) -> Tuple[List[float], List[float]]:
    """Generate WACC and terminal-growth ranges centred on base values."""
    discounts = [
        base_discount + (i - discount_steps // 2) * discount_step_size
        for i in range(discount_steps)
    ]
    terminals = [
        base_terminal + (i - terminal_steps // 2) * terminal_step_size
        for i in range(terminal_steps)
    ]
    return discounts, terminals


# ── Assumption fallback defaults ────────────────────────────────────
_DCF_DEFAULTS: Dict[str, float] = {
    "risk_free": 0.045,
    "beta": 1.0,
    "market_risk_premium": 0.06,
    "cost_debt": 0.05,
    "tax_rate": 0.21,
    "revenue_growth": 0.05,
    "ebit_margin": 0.20,
    "forecast_years": 5,
    "depreciation_pct": 0.03,
    "capex_pct": 0.04,
    "wc_change": 0.0,
    "net_borrowing": 0.0,
}


def resolve_dcf_defaults(local_vars: Dict[str, Any]) -> Dict[str, Any]:
    """Fill in any missing DCF assumption with its default value.

    ``local_vars`` is a dict of name→value pairs (e.g. passed from the
    calling scope).  Returns a new dict with all keys guaranteed present.
    """
    resolved = dict(_DCF_DEFAULTS)
    for key in _DCF_DEFAULTS:
        if key in local_vars and local_vars[key] is not None:
            resolved[key] = local_vars[key]
    return resolved


# ── Trap-detection input assembly ───────────────────────────────────
def assemble_trap_inputs(
    projections: List[Dict],
    method_key: str,
    discount_rate: float,
    terminal_growth: float,
    results: Dict,
    current_price: float,
    intrinsic_value: float,
) -> Dict:
    """Build the dict expected by ``analyze_dcf_traps()``."""
    revenue_projections = [p.get("revenue", 0) for p in projections] if projections else []
    if method_key == "FCFF":
        fcf_projections = [p.get("fcff", 0) for p in projections] if projections else []
    else:
        fcf_projections = [p.get("fcfe", 0) for p in projections] if projections else []

    return {
        "wacc": discount_rate,
        "terminal_growth_rate": terminal_growth,
        "projection_years": len(projections) if projections else 5,
        "revenue_projections": revenue_projections,
        "fcf_projections": fcf_projections,
        "terminal_value": results.get("pv_terminal", 0),
        "enterprise_value": (
            results.get("enterprise_value", 0)
            if method_key == "FCFF"
            else results.get("equity_value", 0)
        ),
        "current_price": current_price,
        "fair_value": intrinsic_value,
    }


# ── Monte-Carlo assumption assembly ────────────────────────────────
def assemble_monte_carlo_company_data(
    company: Dict,
    financials: Dict,
    shares: float,
) -> Dict:
    """Build the ``company_data`` dict expected by ``RobustDCFEngine``."""
    return {
        "ticker": company["ticker"],
        "sector": company["sector"],
        "market_cap": company["market_cap"],
        "shares_outstanding": shares,
        "revenue": financials.get("revenue", 0),
        "ebit": financials.get("ebit", 0),
        "net_income": financials.get("net_income", 0),
        "total_debt": financials.get("total_debt", 0),
        "cash": financials.get("cash", 0),
    }


# ── Validation assumption assembly ──────────────────────────────────
def assemble_validation_assumptions(
    revenue_growth: float,
    ebit_margin: float,
    terminal_growth: float,
    discount_rate: float,
    tax_rate: float,
    capex_pct: float,
    wc_change: float,
    dashboard_active: bool,
    projections: Optional[List[Dict]],
    financials: Dict,
) -> Dict[str, float]:
    """Build the dict expected by ``DCFValidator.validate_assumptions()``."""
    if dashboard_active and projections and len(projections) > 1:
        implied_growth = (
            (projections[-1]["revenue"] / projections[0]["revenue"])
            ** (1 / len(projections))
            - 1
        )
    else:
        implied_growth = revenue_growth

    return {
        "revenue_growth": implied_growth,
        "ebitda_margin": ebit_margin if not dashboard_active else 0.25,
        "terminal_growth": terminal_growth,
        "wacc": discount_rate,
        "tax_rate": tax_rate if not dashboard_active else financials.get("tax_rate", 0.21),
        "capex_pct": capex_pct if not dashboard_active else 0.05,
        "nwc_change": wc_change if not dashboard_active else 0,
    }


# ── Dividend default estimation ─────────────────────────────────────
def estimate_current_dividend(company: Dict) -> float:
    """Estimate current annual dividend from company data."""
    dividend_rate = company.get("dividendRate", 0)
    shares = company.get("shares_outstanding", 0)
    default = dividend_rate * shares
    if default == 0:
        div_yield = company.get("dividendYield", 0)
        if div_yield > 0:
            default = company.get("market_cap", 0) * div_yield
    return float(default)


# ── Relative valuation prep ─────────────────────────────────────────
def assemble_company_financials_for_relative(
    financials: Dict, shares: float
) -> Dict:
    """Build the dict expected by ``apply_relative_valuation()``."""
    return {
        "eps": financials.get("eps", 0),
        "book_value_per_share": financials.get("book_value_per_share", 0),
        "sales_per_share": financials.get("revenue", 0) / shares if shares > 0 else 0,
        "ebitda": financials.get("ebitda", 0),
        "ebit": financials.get("ebit", 0),
        "revenue": financials.get("revenue", 0),
        "total_debt": financials.get("total_debt", 0),
        "cash": financials.get("cash", 0),
    }
