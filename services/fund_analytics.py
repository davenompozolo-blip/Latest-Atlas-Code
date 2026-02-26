"""
ATLAS Terminal - Fund & Manager Analytics Service
==================================================
Provides fund performance analysis, manager skill assessment, holdings overlap,
and the Allocator Decision Engine (Diversification / Marginal Improvement / Redundancy).
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
from dataclasses import dataclass


# =============================================================================
# FUND DATA MODEL
# =============================================================================

@dataclass
class FundProfile:
    """Represents a fund's key characteristics."""
    ticker: str
    name: str = ""
    strategy: str = ""
    benchmark: str = "SPY"
    asset_class: str = "Equity"
    geography: str = "US"
    style: str = "Blend"
    cap_bias: str = "Large"
    expense_ratio: float = 0.0


# =============================================================================
# FUND ANALYTICS ENGINE
# =============================================================================

class FundAnalyticsService:
    """
    Comprehensive fund analytics including performance, risk, manager skill,
    and allocator decision engine.
    """

    def __init__(self):
        self._returns_cache = {}

    def get_fund_returns(
        self, ticker: str, period: str = '5y'
    ) -> Optional[pd.Series]:
        """Fetch daily returns for a fund/ETF (plain first, yf.download fallback)."""
        cache_key = f"{ticker}_{period}"
        if cache_key in self._returns_cache:
            return self._returns_cache[cache_key]

        data = pd.DataFrame()

        # Attempt 1: yf_session.get_history (plain yfinance first, hardened fallback)
        try:
            from services.yf_session import get_history
            data = get_history(ticker, period=period)
        except Exception:
            pass

        # Attempt 2: yf.download (different yfinance code path)
        if data is None or data.empty:
            try:
                import yfinance as yf
                data = yf.download(ticker, period=period, progress=False)
                # yf.download can return multi-level columns — flatten
                if data is not None and not data.empty and isinstance(data.columns, pd.MultiIndex):
                    data.columns = data.columns.get_level_values(0)
            except Exception:
                pass

        if data is None or data.empty or 'Close' not in data.columns:
            return None

        returns = data['Close'].pct_change().dropna()
        returns.name = ticker
        self._returns_cache[cache_key] = returns
        return returns

    def calculate_performance_metrics(
        self,
        ticker: str,
        benchmark: str = 'SPY',
        risk_free_rate: float = 0.045,
    ) -> Optional[Dict]:
        """
        Calculate comprehensive performance metrics for a fund.
        """
        returns = self.get_fund_returns(ticker)
        bench_returns = self.get_fund_returns(benchmark)

        if returns is None:
            return None

        # Align dates
        if bench_returns is not None:
            common = returns.index.intersection(bench_returns.index)
            returns = returns.loc[common]
            bench_returns = bench_returns.loc[common]

        # Basic return calculations
        ann_return = returns.mean() * 252
        ann_vol = returns.std() * np.sqrt(252)
        rf_daily = risk_free_rate / 252

        # Sharpe
        sharpe = (ann_return - risk_free_rate) / ann_vol if ann_vol > 0 else 0

        # Sortino
        downside = returns[returns < 0]
        downside_vol = downside.std() * np.sqrt(252) if len(downside) > 0 else ann_vol
        sortino = (ann_return - risk_free_rate) / downside_vol if downside_vol > 0 else 0

        # Max drawdown
        cum_returns = (1 + returns).cumprod()
        rolling_max = cum_returns.cummax()
        drawdowns = (cum_returns - rolling_max) / rolling_max
        max_dd = drawdowns.min()

        # Calmar
        calmar = ann_return / abs(max_dd) if max_dd != 0 else 0

        # Rolling returns
        rolling = {}
        for label, days in [('1M', 21), ('3M', 63), ('6M', 126), ('1Y', 252), ('3Y', 756)]:
            if len(returns) >= days:
                period_ret = (1 + returns.tail(days)).prod() - 1
                rolling[label] = float(period_ret * 100)

        result = {
            'ticker': ticker,
            'ann_return': float(ann_return * 100),
            'ann_vol': float(ann_vol * 100),
            'sharpe': float(sharpe),
            'sortino': float(sortino),
            'max_drawdown': float(max_dd * 100),
            'calmar': float(calmar),
            'rolling_returns': rolling,
            'total_days': len(returns),
        }

        # Alpha / Beta / IR vs benchmark
        if bench_returns is not None and len(bench_returns) > 60:
            cov = np.cov(returns.values, bench_returns.values)
            beta = cov[0, 1] / cov[1, 1] if cov[1, 1] != 0 else 1.0
            alpha = ann_return - (risk_free_rate + beta * (bench_returns.mean() * 252 - risk_free_rate))

            # Tracking error and IR
            excess = returns - bench_returns
            te = excess.std() * np.sqrt(252)
            ir = excess.mean() * 252 / te if te > 0 else 0

            # Correlation
            corr = returns.corr(bench_returns)

            # Win rate (rolling 12M outperformance)
            if len(returns) >= 252:
                rolling_12m_fund = returns.rolling(252).apply(lambda x: (1 + x).prod() - 1)
                rolling_12m_bench = bench_returns.rolling(252).apply(lambda x: (1 + x).prod() - 1)
                outperform = (rolling_12m_fund > rolling_12m_bench).dropna()
                win_rate = outperform.mean() if len(outperform) > 0 else 0
            else:
                win_rate = 0

            result.update({
                'beta': float(beta),
                'alpha': float(alpha * 100),
                'tracking_error': float(te * 100),
                'information_ratio': float(ir),
                'correlation': float(corr),
                'win_rate_12m': float(win_rate * 100),
                'benchmark': benchmark,
            })

        return result

    def calculate_drawdown_analysis(self, ticker: str) -> Optional[Dict]:
        """Detailed drawdown analysis for a fund."""
        returns = self.get_fund_returns(ticker)
        if returns is None:
            return None

        cum = (1 + returns).cumprod()
        rolling_max = cum.cummax()
        dd = (cum - rolling_max) / rolling_max

        # Find top 5 drawdown periods
        in_drawdown = dd < 0
        drawdown_periods = []
        start = None

        for i, (date, val) in enumerate(dd.items()):
            if val < 0 and start is None:
                start = date
            elif val >= 0 and start is not None:
                dd_slice = dd[start:date]
                worst = dd_slice.min()
                worst_date = dd_slice.idxmin()
                drawdown_periods.append({
                    'start': start.strftime('%Y-%m-%d'),
                    'trough': worst_date.strftime('%Y-%m-%d'),
                    'end': date.strftime('%Y-%m-%d'),
                    'depth': float(worst * 100),
                    'duration_days': (date - start).days,
                })
                start = None

        drawdown_periods.sort(key=lambda x: x['depth'])

        # Annual worst drawdowns
        annual_dd = {}
        for year in range(dd.index.year.min(), dd.index.year.max() + 1):
            year_dd = dd[dd.index.year == year]
            if len(year_dd) > 0:
                annual_dd[str(year)] = float(year_dd.min() * 100)

        return {
            'current_drawdown': float(dd.iloc[-1] * 100),
            'max_drawdown': float(dd.min() * 100),
            'top_drawdowns': drawdown_periods[:5],
            'annual_drawdowns': annual_dd,
            'underwater_series': dd,
        }

    def calculate_holdings_overlap(
        self,
        fund_holdings: Dict[str, float],
        portfolio_holdings: Dict[str, float],
    ) -> Dict:
        """
        Calculate the holdings overlap between a fund and an existing portfolio.

        Args:
            fund_holdings: ticker -> weight in fund
            portfolio_holdings: ticker -> weight in portfolio

        Returns:
            Dict with overlap %, shared holdings, etc.
        """
        fund_set = set(fund_holdings.keys())
        port_set = set(portfolio_holdings.keys())
        shared = fund_set & port_set

        if not fund_set:
            return {'overlap_pct': 0, 'shared_holdings': [], 'unique_to_fund': list(fund_set)}

        overlap_weight_fund = sum(fund_holdings.get(t, 0) for t in shared)
        overlap_weight_port = sum(portfolio_holdings.get(t, 0) for t in shared)

        shared_details = []
        for t in shared:
            shared_details.append({
                'ticker': t,
                'fund_weight': fund_holdings[t],
                'portfolio_weight': portfolio_holdings[t],
            })

        shared_details.sort(key=lambda x: x['fund_weight'], reverse=True)

        return {
            'overlap_pct': len(shared) / len(fund_set) * 100 if fund_set else 0,
            'overlap_weight_fund': overlap_weight_fund * 100,
            'overlap_weight_portfolio': overlap_weight_port * 100,
            'num_shared': len(shared),
            'num_fund_total': len(fund_set),
            'shared_holdings': shared_details[:10],
            'unique_to_fund': list(fund_set - port_set)[:10],
        }

    # =========================================================================
    # ALLOCATOR DECISION ENGINE
    # =========================================================================

    def diversification_benefit_score(
        self,
        fund_ticker: str,
        portfolio_tickers: List[str],
        portfolio_weights: Optional[Dict[str, float]] = None,
    ) -> Dict:
        """
        Score 1: How much does adding this fund reduce portfolio concentration?

        Returns a score 0-100 with interpretation.
        """
        fund_returns = self.get_fund_returns(fund_ticker, '3y')
        if fund_returns is None:
            return {'score': 0, 'interpretation': 'Insufficient data', 'details': {}}

        correlations = {}
        for pt in portfolio_tickers:
            pr = self.get_fund_returns(pt, '3y')
            if pr is not None:
                common = fund_returns.index.intersection(pr.index)
                if len(common) > 60:
                    corr = fund_returns.loc[common].corr(pr.loc[common])
                    correlations[pt] = float(corr)

        if not correlations:
            return {'score': 50, 'interpretation': 'Cannot calculate - no overlapping data', 'details': {}}

        avg_corr = np.mean(list(correlations.values()))
        min_corr = min(correlations.values())
        max_corr = max(correlations.values())

        # Score: lower correlation = higher diversification benefit
        # avg_corr of 0 = score of 80, avg_corr of 1 = score of 10
        score = max(0, min(100, 80 - avg_corr * 70))

        if score >= 70:
            interpretation = f"Strong diversification benefit. Average correlation of {avg_corr:.2f} with existing holdings."
        elif score >= 40:
            interpretation = f"Moderate diversification benefit. Average correlation of {avg_corr:.2f}."
        else:
            interpretation = f"Limited diversification benefit. High correlation ({avg_corr:.2f}) with existing holdings."

        return {
            'score': float(score),
            'avg_correlation': float(avg_corr),
            'min_correlation': float(min_corr),
            'max_correlation': float(max_corr),
            'interpretation': interpretation,
            'correlations': correlations,
        }

    def marginal_portfolio_improvement(
        self,
        fund_ticker: str,
        portfolio_tickers: List[str],
        portfolio_weights: Dict[str, float],
        allocation_sizes: List[float] = None,
        risk_free_rate: float = 0.045,
    ) -> Dict:
        """
        Score 2: Estimated change in efficient frontier from adding this fund.
        Tests at various allocation sizes.
        """
        if allocation_sizes is None:
            allocation_sizes = [0.025, 0.05, 0.10]

        # Get all returns
        all_tickers = portfolio_tickers + [fund_ticker]
        returns_dict = {}
        for t in all_tickers:
            r = self.get_fund_returns(t, '3y')
            if r is not None:
                returns_dict[t] = r

        if fund_ticker not in returns_dict or len(returns_dict) < 2:
            return {'scenarios': [], 'recommendation': 'Insufficient data'}

        # Align all returns
        returns_df = pd.DataFrame(returns_dict)
        returns_df = returns_df.dropna()

        if len(returns_df) < 60:
            return {'scenarios': [], 'recommendation': 'Insufficient overlapping data'}

        # Calculate baseline portfolio Sharpe
        port_cols = [t for t in portfolio_tickers if t in returns_df.columns]
        if not port_cols:
            return {'scenarios': [], 'recommendation': 'No portfolio data'}

        total_w = sum(portfolio_weights.get(t, 0) for t in port_cols)
        if total_w == 0:
            total_w = 1.0

        baseline_weights = np.array([portfolio_weights.get(t, 0) / total_w for t in port_cols])
        baseline_returns = returns_df[port_cols].values @ baseline_weights
        baseline_ann_ret = np.mean(baseline_returns) * 252
        baseline_ann_vol = np.std(baseline_returns) * np.sqrt(252)
        baseline_sharpe = (baseline_ann_ret - risk_free_rate) / baseline_ann_vol if baseline_ann_vol > 0 else 0

        scenarios = []
        for alloc in allocation_sizes:
            # New weights: shrink existing by (1 - alloc), add fund at alloc
            new_weights = baseline_weights * (1 - alloc)
            combined_cols = port_cols + [fund_ticker]
            full_weights = np.append(new_weights, alloc)
            combined_returns = returns_df[combined_cols].values @ full_weights

            new_ann_ret = np.mean(combined_returns) * 252
            new_ann_vol = np.std(combined_returns) * np.sqrt(252)
            new_sharpe = (new_ann_ret - risk_free_rate) / new_ann_vol if new_ann_vol > 0 else 0

            scenarios.append({
                'allocation': alloc,
                'allocation_pct': f"{alloc*100:.1f}%",
                'sharpe_before': float(baseline_sharpe),
                'sharpe_after': float(new_sharpe),
                'sharpe_change': float(new_sharpe - baseline_sharpe),
                'return_before': float(baseline_ann_ret * 100),
                'return_after': float(new_ann_ret * 100),
                'vol_before': float(baseline_ann_vol * 100),
                'vol_after': float(new_ann_vol * 100),
            })

        # Find best allocation
        best = max(scenarios, key=lambda x: x['sharpe_change'])
        if best['sharpe_change'] > 0.05:
            recommendation = (
                f"Adding at {best['allocation_pct']} improves portfolio Sharpe by "
                f"{best['sharpe_change']:.3f}."
            )
        elif best['sharpe_change'] > 0:
            recommendation = (
                f"Marginal improvement at {best['allocation_pct']} "
                f"(Sharpe +{best['sharpe_change']:.3f})."
            )
        else:
            recommendation = "Adding this fund does not improve the portfolio's risk-adjusted return."

        return {
            'scenarios': scenarios,
            'baseline_sharpe': float(baseline_sharpe),
            'recommendation': recommendation,
        }

    def redundancy_score(
        self,
        fund_ticker: str,
        portfolio_tickers: List[str],
    ) -> Dict:
        """
        Score 3: How similar is this fund to managers already in the portfolio?
        """
        fund_returns = self.get_fund_returns(fund_ticker, '3y')
        if fund_returns is None:
            return {'score': 0, 'most_similar': None, 'interpretation': 'No data'}

        similarities = {}
        for pt in portfolio_tickers:
            pr = self.get_fund_returns(pt, '3y')
            if pr is not None:
                common = fund_returns.index.intersection(pr.index)
                if len(common) > 60:
                    corr = fund_returns.loc[common].corr(pr.loc[common])
                    similarities[pt] = float(corr)

        if not similarities:
            return {'score': 0, 'most_similar': None, 'interpretation': 'Cannot assess'}

        most_similar_ticker = max(similarities, key=similarities.get)
        max_similarity = similarities[most_similar_ticker]

        # Score: higher correlation = more redundant (0-100)
        redundancy = max(0, min(100, max_similarity * 100))

        if redundancy >= 70:
            interpretation = (
                f"High redundancy ({redundancy:.0f}%) with {most_similar_ticker}. "
                f"Adding both provides minimal diversification."
            )
        elif redundancy >= 40:
            interpretation = (
                f"Moderate similarity ({redundancy:.0f}%) with {most_similar_ticker}. "
                f"Some differentiation exists."
            )
        else:
            interpretation = (
                f"Low redundancy ({redundancy:.0f}%). "
                f"This fund offers distinct exposure."
            )

        return {
            'score': float(redundancy),
            'most_similar': most_similar_ticker,
            'max_correlation': float(max_similarity),
            'all_similarities': similarities,
            'interpretation': interpretation,
        }


    def calculate_allocator_scores(
        self,
        fund_ticker: str,
        portfolio_tickers: List[str],
        portfolio_weights: Optional[Dict[str, float]] = None,
    ) -> Optional[Dict]:
        """
        Flagship Allocator Decision Engine: unified entry point that runs all
        three ADE scores and returns a composite recommendation.

        Returns:
            Dict with diversification_score, redundancy_score, marginal_improvement_score,
            composite_score, verdict, and recommendation text.
        """
        if not portfolio_tickers:
            return None

        # Default equal weights if not provided
        if portfolio_weights is None:
            w = 1.0 / len(portfolio_tickers)
            portfolio_weights = {t: w for t in portfolio_tickers}

        # Score 1: Diversification Benefit
        div_result = self.diversification_benefit_score(
            fund_ticker, portfolio_tickers, portfolio_weights
        )
        div_score = div_result.get('score', 50)

        # Score 2: Marginal Portfolio Improvement
        mi_result = self.marginal_portfolio_improvement(
            fund_ticker, portfolio_tickers, portfolio_weights
        )
        scenarios = mi_result.get('scenarios', [])
        best_sharpe_change = max((s.get('sharpe_change', 0) for s in scenarios), default=0)
        mi_score = float(min(100, max(0, 50 + best_sharpe_change * 200)))

        # Score 3: Redundancy
        red_result = self.redundancy_score(fund_ticker, portfolio_tickers)
        red_score = red_result.get('score', 50)

        # Composite: diversification (40%) + marginal improvement (30%) + inverse redundancy (30%)
        composite = (
            div_score * 0.40
            + mi_score * 0.30
            + (100 - red_score) * 0.30
        )

        # Verdict
        if composite >= 65:
            verdict = 'STRONG ADD'
            verdict_color = '#10b981'
            recommendation = (
                f"High diversification benefit (score {div_score:.0f}/100), "
                f"low redundancy ({red_score:.0f}%), and positive marginal improvement. "
                f"Recommended at 5-10% allocation."
            )
        elif composite >= 45:
            verdict = 'CONSIDER'
            verdict_color = '#f59e0b'
            recommendation = (
                f"Moderate fit. Review sizing carefully — "
                f"diversification score {div_score:.0f}/100, redundancy {red_score:.0f}%. "
                f"Consider a 2.5-5% initial allocation."
            )
        else:
            verdict = 'PASS'
            verdict_color = '#ef4444'
            recommendation = (
                f"Limited incremental value. High redundancy ({red_score:.0f}%) "
                f"with existing holdings and weak diversification benefit ({div_score:.0f}/100). "
                f"Adding this manager provides minimal portfolio improvement."
            )

        return {
            'diversification_score': float(div_score),
            'redundancy_score': float(red_score),
            'marginal_improvement_score': float(mi_score),
            'composite_score': float(composite),
            'verdict': verdict,
            'verdict_color': verdict_color,
            'recommendation': recommendation,
            'diversification_detail': div_result,
            'marginal_improvement_detail': mi_result,
            'redundancy_detail': red_result,
        }

    def calculate_manager_skill_metrics(
        self,
        ticker: str,
        benchmark: str = 'SPY',
    ) -> Optional[Dict]:
        """
        Manager skill: alpha/beta decomposition, information ratio,
        tracking error, and consistency (% of rolling 12M periods outperforming).
        """
        fund_returns = self.get_fund_returns(ticker, '5y')
        bench_returns = self.get_fund_returns(benchmark, '5y')

        if fund_returns is None or bench_returns is None:
            fund_returns = self.get_fund_returns(ticker, '3y')
            bench_returns = self.get_fund_returns(benchmark, '3y')

        if fund_returns is None or bench_returns is None:
            return None

        common = fund_returns.index.intersection(bench_returns.index)
        if len(common) < 126:
            return None

        fr = fund_returns.loc[common].values
        br = bench_returns.loc[common].values

        # Alpha / Beta via OLS
        X_b = np.column_stack([np.ones(len(br)), br])
        try:
            coeffs = np.linalg.lstsq(X_b, fr, rcond=None)[0]
        except Exception:
            return None

        alpha_daily = float(coeffs[0])
        beta = float(coeffs[1])
        alpha_annualised = alpha_daily * 252

        # Tracking error
        excess = fr - br
        tracking_error = float(np.std(excess) * np.sqrt(252))

        # Information ratio
        ann_excess = float(np.mean(excess) * 252)
        information_ratio = ann_excess / tracking_error if tracking_error > 0 else 0.0

        # Consistency: % of rolling 252-day windows that outperformed
        outperform_count = 0
        total_windows = 0
        window = min(252, len(common) // 2)
        for i in range(len(common) - window):
            f_ret = float(np.prod(1 + fr[i:i + window]) - 1)
            b_ret = float(np.prod(1 + br[i:i + window]) - 1)
            if f_ret > b_ret:
                outperform_count += 1
            total_windows += 1
        consistency = (outperform_count / total_windows * 100) if total_windows > 0 else None

        # Active share proxy (1 - R^2)
        y_pred = coeffs[0] + coeffs[1] * br
        ss_res = float(np.sum((fr - y_pred) ** 2))
        ss_tot = float(np.sum((fr - np.mean(fr)) ** 2))
        r_squared = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
        active_share_proxy = float((1 - r_squared) * 100)

        return {
            'alpha_annualised': alpha_annualised,
            'beta': beta,
            'tracking_error': tracking_error,
            'information_ratio': information_ratio,
            'consistency_pct': consistency,
            'active_share_proxy': active_share_proxy,
            'r_squared': r_squared,
        }


    def calculate_capture_ratios(self, ticker: str, benchmark: str = 'SPY') -> Optional[Dict]:
        """Upside / downside capture ratios vs benchmark (monthly resampled)."""
        fund_ret = self.get_fund_returns(ticker)
        bench_ret = self.get_fund_returns(benchmark)
        if fund_ret is None or bench_ret is None:
            return None

        common = fund_ret.index.intersection(bench_ret.index)
        fund_ret = fund_ret.loc[common]
        bench_ret = bench_ret.loc[common]

        fund_m = (1 + fund_ret).resample('ME').prod() - 1
        bench_m = (1 + bench_ret).resample('ME').prod() - 1
        common_m = fund_m.index.intersection(bench_m.index)
        fund_m = fund_m.loc[common_m]
        bench_m = bench_m.loc[common_m]

        up, down = bench_m > 0, bench_m < 0
        upside = downside = capture_ratio = None

        if up.sum() > 5 and bench_m[up].mean() != 0:
            upside = float(fund_m[up].mean() / bench_m[up].mean() * 100)
        if down.sum() > 5 and bench_m[down].mean() != 0:
            downside = float(fund_m[down].mean() / bench_m[down].mean() * 100)
        if upside is not None and downside and downside != 0:
            capture_ratio = upside / downside

        yearly = {}
        for year in sorted(set(fund_m.index.year)):
            yf_ = fund_m[fund_m.index.year == year]
            yb = bench_m[bench_m.index.year == year]
            y_up, y_dn = yb > 0, yb < 0
            y_uc = float(yf_[y_up].mean() / yb[y_up].mean() * 100) if y_up.sum() >= 2 and yb[y_up].mean() != 0 else None
            y_dc = float(yf_[y_dn].mean() / yb[y_dn].mean() * 100) if y_dn.sum() >= 2 and yb[y_dn].mean() != 0 else None
            yearly[year] = {'upside': y_uc, 'downside': y_dc}

        return {
            'upside_capture': upside,
            'downside_capture': downside,
            'capture_ratio': capture_ratio,
            'yearly_capture': yearly,
            'n_up_months': int(up.sum()),
            'n_down_months': int(down.sum()),
        }

    def calculate_calendar_year_returns(self, ticker: str, benchmark: str = 'SPY') -> Optional[pd.DataFrame]:
        """Annual return comparison: fund vs benchmark, last 10 years."""
        fund_ret = self.get_fund_returns(ticker, period='10y')
        bench_ret = self.get_fund_returns(benchmark, period='10y')
        if fund_ret is None:
            return None

        fund_annual = (1 + fund_ret).resample('YE').prod() - 1
        bench_annual = (1 + bench_ret).resample('YE').prod() - 1 if bench_ret is not None else pd.Series(dtype=float)

        rows = []
        for dt, fr in fund_annual.items():
            year = dt.year
            br = float(bench_annual[dt] * 100) if dt in bench_annual.index else None
            rows.append({
                'Year': year,
                'Fund (%)': round(float(fr * 100), 2),
                'Benchmark (%)': round(br, 2) if br is not None else None,
                'Excess (%)': round(float(fr * 100) - br, 2) if br is not None else None,
            })

        return pd.DataFrame(rows).sort_values('Year', ascending=False) if rows else None

    def infer_style_box(self, ticker: str, benchmark: str = 'SPY') -> Dict:
        """Infer Morningstar-style 3x3 style box (Value/Blend/Growth x Small/Mid/Large)."""
        try:
            from services.yf_session import get_info
            info = get_info(ticker) or {}
        except Exception:
            info = {}

        # Cap size from totalAssets (for funds/ETFs) or marketCap
        aum = info.get('totalAssets') or info.get('marketCap') or 0
        if aum >= 50e9:
            cap, cap_score = 'Large', 2
        elif aum >= 10e9:
            cap, cap_score = 'Mid', 1
        else:
            cap, cap_score = 'Small', 0

        # Style from PE, PB signals
        pe = info.get('trailingPE') or info.get('forwardPE')
        pb = info.get('priceToBook')
        g, v = 0, 0

        if pe:
            if pe > 30: g += 2
            elif pe > 22: g += 1
            elif pe < 15: v += 2
            elif pe < 20: v += 1
        if pb:
            if pb > 5: g += 2
            elif pb > 3: g += 1
            elif pb < 1.5: v += 2
            elif pb < 2.5: v += 1

        # Momentum vs benchmark
        returns = self.get_fund_returns(ticker)
        bench_ret_s = self.get_fund_returns(benchmark)
        if returns is not None and bench_ret_s is not None and len(returns) >= 252:
            common = returns.index.intersection(bench_ret_s.index)
            r_1y = (1 + returns.loc[common].tail(252)).prod() - 1
            b_1y = (1 + bench_ret_s.loc[common].tail(252)).prod() - 1
            if r_1y > b_1y * 1.10: g += 1
            elif r_1y < b_1y * 0.90: v += 1

        style, style_score = ('Growth', 2) if g > v + 1 else ('Value', 0) if v > g + 1 else ('Blend', 1)

        # Override with yfinance category if available
        cat = info.get('category', '').lower()
        if 'growth' in cat: style, style_score = 'Growth', 2
        elif 'value' in cat: style, style_score = 'Value', 0
        elif 'blend' in cat or 'core' in cat: style, style_score = 'Blend', 1
        if 'large' in cat: cap, cap_score = 'Large', 2
        elif 'mid' in cat: cap, cap_score = 'Mid', 1
        elif 'small' in cat: cap, cap_score = 'Small', 0

        return {
            'style': style, 'cap': cap,
            'style_score': style_score, 'cap_score': cap_score,
            'category': info.get('category', ''),
            'pe': pe, 'pb': pb,
        }


# Singleton
fund_analytics = FundAnalyticsService()
