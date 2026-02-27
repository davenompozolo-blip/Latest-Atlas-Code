"""
ATLAS Terminal - Transition Plan Engine
========================================
Pure computation module for generating phased portfolio transition plans
from current allocation to target allocation.

Uses priority-based phasing (largest gaps first) with transaction cost
and capital gains tax estimation.

Created: February 2026
Author: Hlobo & Claude
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Tuple


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class AssetClassGap:
    """Single asset class: current vs target weight and the delta."""
    asset_class: str
    current_weight: float
    target_weight: float
    delta: float               # target - current (positive=buy, negative=sell)
    delta_value: float         # delta x portfolio_value


@dataclass
class PhasedTrade:
    """One trade within a single rebalance phase."""
    asset_class: str
    action: str                # "BUY" or "SELL"
    weight_change: float       # magnitude of change in this phase
    trade_value: float         # currency value of trade
    transaction_cost: float    # cost_bps x trade_value
    cgt_exposure: float        # cgt_rate x trade_value (SELLs only, conservative)


@dataclass
class TradePhase:
    """A single rebalance phase containing one or more trades."""
    phase_number: int
    trades: List[PhasedTrade]
    total_turnover: float      # sum of |weight_change| across trades
    total_cost: float          # sum of transaction costs
    total_cgt: float           # sum of CGT exposure
    cumulative_drift: float    # remaining drift from target after this phase


@dataclass
class TransitionPlan:
    """Complete transition plan output."""

    # Panel 1: Gap Analysis
    gaps: List[AssetClassGap]
    total_drift: float         # one-way turnover needed (sum of |delta|/2)

    # Panel 2: Trade Schedule
    phases: List[TradePhase]
    phases_required: int

    # Panel 3: Cost & Drag Summary
    total_transaction_cost: float
    total_cgt_exposure: float
    total_implementation_cost: float   # transaction_cost + cgt
    performance_drag_bps: float        # total_cost / portfolio_value x 10000
    portfolio_value: float

    # Metadata
    cost_bps: float
    cgt_rate: float
    max_turnover: float


# ---------------------------------------------------------------------------
# Core calculation
# ---------------------------------------------------------------------------

def calculate_transition_plan(
    current_weights: Dict[str, float],
    target_weights: Dict[str, float],
    portfolio_value: float,
    cost_bps: float = 25.0,
    cgt_rate: float = 0.18,
    max_turnover: float = 0.20,
) -> TransitionPlan:
    """Generate a phased transition plan from current to target allocation.

    Parameters
    ----------
    current_weights : dict
        Current allocation by asset class (values as fractions, e.g. 0.28).
    target_weights : dict
        Target allocation by asset class (values as fractions).
    portfolio_value : float
        Total portfolio value in currency units.
    cost_bps : float
        Transaction cost assumption in basis points (default 25).
    cgt_rate : float
        Capital gains tax rate as fraction (default 0.18 for SA CGT).
    max_turnover : float
        Maximum one-way turnover per rebalance phase as fraction (default 0.20).

    Returns
    -------
    TransitionPlan
        Complete transition plan with gap analysis, phased trades, and cost summary.
    """
    # Step 1: Gap analysis
    gaps = _compute_gaps(current_weights, target_weights, portfolio_value)
    total_drift = sum(abs(g.delta) for g in gaps) / 2.0

    # Step 2: Priority-based phased trade schedule
    phases = _build_phased_schedule(
        gaps, portfolio_value, cost_bps, cgt_rate, max_turnover,
    )

    # Step 3: Cost & drag summary
    total_txn_cost = sum(p.total_cost for p in phases)
    total_cgt = sum(p.total_cgt for p in phases)
    total_impl_cost = total_txn_cost + total_cgt
    drag_bps = (total_impl_cost / portfolio_value * 10_000) if portfolio_value > 0 else 0.0

    return TransitionPlan(
        gaps=gaps,
        total_drift=total_drift,
        phases=phases,
        phases_required=len(phases),
        total_transaction_cost=total_txn_cost,
        total_cgt_exposure=total_cgt,
        total_implementation_cost=total_impl_cost,
        performance_drag_bps=drag_bps,
        portfolio_value=portfolio_value,
        cost_bps=cost_bps,
        cgt_rate=cgt_rate,
        max_turnover=max_turnover,
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _compute_gaps(
    current: Dict[str, float],
    target: Dict[str, float],
    portfolio_value: float,
) -> List[AssetClassGap]:
    """Compute the weight delta for every asset class in the union of both dicts."""
    all_classes = sorted(set(current) | set(target))
    gaps = []
    for ac in all_classes:
        cur = current.get(ac, 0.0)
        tgt = target.get(ac, 0.0)
        delta = tgt - cur
        gaps.append(AssetClassGap(
            asset_class=ac,
            current_weight=cur,
            target_weight=tgt,
            delta=delta,
            delta_value=delta * portfolio_value,
        ))
    return gaps


def _build_phased_schedule(
    gaps: List[AssetClassGap],
    portfolio_value: float,
    cost_bps: float,
    cgt_rate: float,
    max_turnover: float,
) -> List[TradePhase]:
    """Build a priority-based phased trade schedule.

    Priority-based: largest absolute gaps are filled first within each
    phase's turnover budget.  If the total transition cannot fit in one
    rebalance, it spills into subsequent phases.
    """
    # Remaining deltas to execute (mutable copy)
    remaining: Dict[str, float] = {g.asset_class: g.delta for g in gaps}

    # Remove zero-delta entries
    remaining = {k: v for k, v in remaining.items() if abs(v) > 1e-8}

    if not remaining:
        return []

    phases: List[TradePhase] = []
    phase_num = 0

    while remaining:
        phase_num += 1
        phase_trades, turnover_used = _fill_one_phase(
            remaining, portfolio_value, cost_bps, cgt_rate, max_turnover,
        )
        if not phase_trades:
            break  # safety: no progress possible

        # Calculate remaining drift after this phase
        remaining_drift = sum(abs(v) for v in remaining.values()) / 2.0

        phases.append(TradePhase(
            phase_number=phase_num,
            trades=phase_trades,
            total_turnover=turnover_used,
            total_cost=sum(t.transaction_cost for t in phase_trades),
            total_cgt=sum(t.cgt_exposure for t in phase_trades),
            cumulative_drift=remaining_drift,
        ))

        # Safety cap: prevent infinite loops
        if phase_num >= 50:
            break

    return phases


def _fill_one_phase(
    remaining: Dict[str, float],
    portfolio_value: float,
    cost_bps: float,
    cgt_rate: float,
    max_turnover: float,
) -> Tuple[List[PhasedTrade], float]:
    """Fill one rebalance phase using priority-based allocation.

    Processes asset classes in descending order of |remaining delta|.
    Each trade consumes from the turnover budget.  Partially fills
    the last trade if the budget runs out mid-asset-class.

    Mutates *remaining* in place (reduces filled deltas).
    """
    cost_rate = cost_bps / 10_000
    # One-way turnover budget: max_turnover is the max sum of
    # |weight changes| on the buy side (or equivalently the sell side).
    # We track total |weight_change| and cap at 2 * max_turnover
    # (buys + sells both counted).
    budget = max_turnover * 2.0

    # Sort by largest absolute gap first (priority-based)
    ordered = sorted(remaining.keys(), key=lambda k: abs(remaining[k]), reverse=True)

    trades: List[PhasedTrade] = []
    turnover_used = 0.0

    for ac in ordered:
        delta = remaining[ac]
        abs_delta = abs(delta)

        if abs_delta < 1e-8:
            continue

        headroom = budget - turnover_used
        if headroom < 1e-8:
            break  # phase budget exhausted

        # How much of this delta can we execute in this phase?
        executable = min(abs_delta, headroom)
        signed_exec = executable if delta > 0 else -executable

        action = "BUY" if delta > 0 else "SELL"
        trade_value = executable * portfolio_value
        txn_cost = trade_value * cost_rate

        # Conservative CGT: applied only to sells, assumes all gains
        cgt = trade_value * cgt_rate if action == "SELL" else 0.0

        trades.append(PhasedTrade(
            asset_class=ac,
            action=action,
            weight_change=executable,
            trade_value=trade_value,
            transaction_cost=txn_cost,
            cgt_exposure=cgt,
        ))

        turnover_used += executable
        remaining[ac] -= signed_exec

        # Clean up if fully executed
        if abs(remaining[ac]) < 1e-8:
            del remaining[ac]

    # One-way turnover = half of total |weight_change|
    one_way_turnover = turnover_used / 2.0
    return trades, one_way_turnover


# ---------------------------------------------------------------------------
# Utility: extract allocation weights from SAA result
# ---------------------------------------------------------------------------

def extract_target_weights(saa_result: Dict) -> Dict[str, float]:
    """Extract flat {asset_class: weight} dict from SAA tool output.

    The SAA result stores allocations as:
        {"SA Equity": {"weight": 0.28, "rationale": "..."}, ...}

    Returns:
        {"SA Equity": 0.28, ...}
    """
    allocs = saa_result.get("allocations", {})
    return {
        name: entry.get("weight", 0.0) if isinstance(entry, dict) else float(entry)
        for name, entry in allocs.items()
    }


def compute_unclassified_pct(
    current_weights: Dict[str, float],
) -> float:
    """Return the fraction of current portfolio in the 'Unclassified' bucket."""
    return current_weights.get("Unclassified", 0.0)
