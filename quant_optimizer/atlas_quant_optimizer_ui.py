"""
ATLAS TERMINAL v10.0 - QUANT OPTIMIZER STREAMLIT UI
====================================================

Beautiful Streamlit interface for the portfolio optimizer.
"""

import streamlit as st
import pandas as pd
import numpy as np
from atlas_quant_portfolio_optimizer import (
    MultivariablePortfolioOptimizer,
    PortfolioConstraints,
    PortfolioVisualizer,
    StochasticPriceSimulator
)


def setup_quant_optimizer_ui():
    """
    Complete Streamlit UI for quant portfolio optimizer.
    """

    st.markdown("## 🧮 Quant-Grade Portfolio Optimizer")
    st.markdown("**Stochastic Calculus + Multivariable Optimization**")

    # Sidebar: Configuration
    with st.sidebar:
        st.markdown("### ⚙️ Optimization Settings")

        # Optimization objective
        objective = st.selectbox(
            "Objective",
            ["Maximum Sharpe Ratio", "Minimum Volatility", "Risk Parity"]
        )

        # Risk-free rate
        risk_free_rate = st.slider(
            "Risk-Free Rate (%)",
            min_value=0.0,
            max_value=10.0,
            value=3.0,
            step=0.1
        ) / 100

        st.markdown("---")
        st.markdown("### 🎯 Constraints")

        # Position limits
        min_weight = st.slider(
            "Min Weight per Asset (%)",
            min_value=0.0,
            max_value=20.0,
            value=5.0,
            step=1.0
        ) / 100

        max_weight = st.slider(
            "Max Weight per Asset (%)",
            min_value=10.0,
            max_value=100.0,
            value=30.0,
            step=5.0
        ) / 100

        # Leverage
        max_leverage = st.slider(
            "Max Leverage",
            min_value=1.0,
            max_value=3.0,
            value=1.0,
            step=0.1
        )

        # Long only
        long_only = st.checkbox("Long Only (No Shorting)", value=True)

        st.markdown("---")
        st.markdown("### 📊 Monte Carlo")

        n_simulations = st.select_slider(
            "Simulations",
            options=[1000, 5000, 10000, 20000, 50000],
            value=10000
        )

    # Main area
    tabs = st.tabs([
        "📊 Optimize",
        "📈 Efficient Frontier",
        "🎲 Monte Carlo",
        "🔍 Sensitivity",
        "📉 Risk Metrics"
    ])

    # Tab 1: Optimize
    with tabs[0]:
        st.markdown("### 🎯 Portfolio Optimization")

        # Check if we have portfolio data
        if 'portfolio_returns' not in st.session_state:
            st.info("Upload portfolio data or use sample data to optimize")

            if st.button("📊 Use Sample Data"):
                # Generate sample data
                tickers = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'JPM', 'BAC', 'C']
                n_days = 252 * 3

                returns_data = {}
                np.random.seed(42)
                for ticker in tickers:
                    returns_data[ticker] = np.random.normal(0.0005, 0.02, n_days)

                st.session_state.portfolio_returns = pd.DataFrame(returns_data)
                st.success("✅ Sample data loaded!")
                st.rerun()

        if 'portfolio_returns' in st.session_state:
            returns = st.session_state.portfolio_returns

            # Show current portfolio
            st.markdown("#### Current Portfolio")
            col1, col2, col3 = st.columns(3)

            with col1:
                st.metric("Assets", len(returns.columns))
            with col2:
                st.metric("Observations", len(returns))
            with col3:
                st.metric("Period", f"{len(returns)/252:.1f} years")

            # Optimize button
            if st.button("🚀 OPTIMIZE PORTFOLIO", type="primary", use_container_width=True):
                with st.spinner("Running optimization with multivariable calculus..."):
                    # Create optimizer
                    optimizer = MultivariablePortfolioOptimizer(returns, risk_free_rate)

                    # Create constraints
                    constraints = PortfolioConstraints(
                        min_weight=min_weight,
                        max_weight=max_weight,
                        max_leverage=max_leverage,
                        long_only=long_only
                    )

                    # Optimize
                    if objective == "Maximum Sharpe Ratio":
                        result = optimizer.optimize_sharpe(constraints)
                    else:  # Minimum Volatility
                        result = optimizer.optimize_minimum_volatility(constraints)

                    # Store result
                    st.session_state.optimization_result = result
                    st.session_state.optimizer = optimizer

                st.success("✅ Optimization complete!")
                st.rerun()

            # Show results if available
            if 'optimization_result' in st.session_state:
                result = st.session_state.optimization_result

                st.markdown("---")
                st.markdown("### 📊 Optimization Results")

                # Metrics
                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    st.metric(
                        "Expected Return",
                        f"{result.expected_return*100:.2f}%",
                        delta=None
                    )

                with col2:
                    st.metric(
                        "Volatility",
                        f"{result.volatility*100:.2f}%"
                    )

                with col3:
                    st.metric(
                        "Sharpe Ratio",
                        f"{result.sharpe_ratio:.3f}"
                    )

                with col4:
                    st.metric(
                        "VaR 95%",
                        f"{result.var_95*100:.2f}%"
                    )

                # Weights table
                st.markdown("#### 🎯 Optimal Weights")

                weights_df = pd.DataFrame({
                    'Asset': result.asset_names,
                    'Weight (%)': result.weights * 100,
                    'Expected Return (%)': optimizer.mean_returns.values * 100,
                    'Volatility (%)': optimizer.volatilities * 100
                }).sort_values('Weight (%)', ascending=False)

                st.dataframe(
                    weights_df.style.background_gradient(subset=['Weight (%)'], cmap='RdYlGn'),
                    use_container_width=True,
                    height=400
                )

                # Weights chart
                st.markdown("#### 📊 Weight Distribution")
                fig = PortfolioVisualizer.plot_weights(result)
                st.pyplot(fig)

    # Tab 2: Efficient Frontier
    with tabs[1]:
        st.markdown("### 📈 Efficient Frontier")

        if 'optimizer' in st.session_state:
            if st.button("Calculate Efficient Frontier"):
                with st.spinner("Calculating efficient frontier..."):
                    optimizer = st.session_state.optimizer
                    constraints = PortfolioConstraints(
                        min_weight=min_weight,
                        max_weight=max_weight,
                        max_leverage=max_leverage,
                        long_only=long_only
                    )

                    frontier = optimizer.efficient_frontier(n_portfolios=50, constraints=constraints)
                    st.session_state.efficient_frontier = frontier

                st.success("✅ Frontier calculated!")
                st.rerun()

            if 'efficient_frontier' in st.session_state:
                frontier = st.session_state.efficient_frontier
                result = st.session_state.optimization_result

                # Plot
                fig = PortfolioVisualizer.plot_efficient_frontier(frontier, result)
                st.pyplot(fig)

                # Show frontier data
                st.markdown("#### 📊 Frontier Points")
                frontier_display = frontier[['return', 'volatility', 'sharpe']].copy()
                frontier_display.columns = ['Return (%)', 'Volatility (%)', 'Sharpe Ratio']
                frontier_display['Return (%)'] *= 100
                frontier_display['Volatility (%)'] *= 100

                st.dataframe(
                    frontier_display.style.background_gradient(subset=['Sharpe Ratio'], cmap='RdYlGn'),
                    use_container_width=True
                )
        else:
            st.info("Run optimization first")

    # Tab 3: Monte Carlo
    with tabs[2]:
        st.markdown("### 🎲 Monte Carlo Simulation")

        if 'optimization_result' in st.session_state:
            result = st.session_state.optimization_result
            returns = st.session_state.portfolio_returns

            if st.button("Run Monte Carlo Simulation"):
                with st.spinner(f"Running {n_simulations:,} simulations..."):
                    fig = PortfolioVisualizer.plot_monte_carlo_distribution(
                        result.weights,
                        returns,
                        n_simulations
                    )
                    st.session_state.monte_carlo_fig = fig

                st.success("✅ Simulation complete!")
                st.rerun()

            if 'monte_carlo_fig' in st.session_state:
                st.pyplot(st.session_state.monte_carlo_fig)

                # Show statistics
                st.markdown("#### 📊 Distribution Statistics")

                simulator = StochasticPriceSimulator(returns, risk_free_rate)
                portfolio_paths = simulator.calculate_portfolio_paths(
                    result.weights, n_simulations, 252
                )
                final_returns = (portfolio_paths[:, -1] - portfolio_paths[:, 0]) / portfolio_paths[:, 0]

                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    st.metric("Mean Return", f"{final_returns.mean()*100:.2f}%")
                with col2:
                    st.metric("Std Dev", f"{final_returns.std()*100:.2f}%")
                with col3:
                    st.metric("5th Percentile", f"{np.percentile(final_returns, 5)*100:.2f}%")
                with col4:
                    st.metric("95th Percentile", f"{np.percentile(final_returns, 95)*100:.2f}%")
        else:
            st.info("Run optimization first")

    # Tab 4: Sensitivity
    with tabs[3]:
        st.markdown("### 🔍 Sensitivity Analysis")

        if 'optimization_result' in st.session_state:
            result = st.session_state.optimization_result

            if result.gradient_history:
                st.markdown("#### 📊 Gradient Heatmap")
                st.caption("Shows ∂Sharpe/∂Weight for each asset during optimization")

                fig = PortfolioVisualizer.plot_gradient_heatmap(result)
                if fig:
                    st.pyplot(fig)

                # Convergence metrics
                st.markdown("#### 📈 Convergence Statistics")
                col1, col2 = st.columns(2)

                with col1:
                    st.metric("Iterations", len(result.convergence_path))

                with col2:
                    final_gradient_norm = np.linalg.norm(result.gradient_history[-1])
                    st.metric("Final Gradient Norm", f"{final_gradient_norm:.6f}")
            else:
                st.info("No gradient history available")
        else:
            st.info("Run optimization first")

    # Tab 5: Risk Metrics
    with tabs[4]:
        st.markdown("### 📉 Risk Metrics")

        if 'optimization_result' in st.session_state:
            result = st.session_state.optimization_result

            st.markdown("#### 📊 Comprehensive Risk Analysis")

            # Risk metrics grid
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**Value at Risk (VaR)**")
                st.metric("VaR 95%", f"{result.var_95*100:.2f}%")
                st.caption("Expected loss at 95% confidence")

                st.markdown("**Conditional VaR (CVaR)**")
                st.metric("CVaR 95%", f"{result.cvar_95*100:.2f}%")
                st.caption("Average loss beyond VaR")

            with col2:
                st.markdown("**Maximum Drawdown**")
                st.metric("Max DD", f"{result.max_drawdown*100:.2f}%")
                st.caption("Worst peak-to-trough decline")

                st.markdown("**Volatility**")
                st.metric("σ", f"{result.volatility*100:.2f}%")
                st.caption("Annual standard deviation")

            # Risk/Return profile
            st.markdown("#### 📈 Risk/Return Profile")

            metrics_df = pd.DataFrame({
                'Metric': [
                    'Expected Return',
                    'Volatility',
                    'Sharpe Ratio',
                    'VaR 95%',
                    'CVaR 95%',
                    'Max Drawdown',
                    'Return/Risk Ratio'
                ],
                'Value': [
                    f"{result.expected_return*100:.2f}%",
                    f"{result.volatility*100:.2f}%",
                    f"{result.sharpe_ratio:.3f}",
                    f"{result.var_95*100:.2f}%",
                    f"{result.cvar_95*100:.2f}%",
                    f"{result.max_drawdown*100:.2f}%",
                    f"{(result.expected_return / result.volatility):.3f}"
                ]
            })

            st.dataframe(metrics_df, use_container_width=True, hide_index=True)
        else:
            st.info("Run optimization first")


# ===================================================================
# MAIN
# ===================================================================

if __name__ == "__main__":
    st.set_page_config(page_title="ATLAS - Quant Optimizer", layout="wide")

    st.title("🚀 ATLAS Terminal - Quant Portfolio Optimizer")
    st.markdown("**Powered by Stochastic Calculus & Multivariable Optimization**")

    setup_quant_optimizer_ui()
