"""
ATLAS Terminal Beta - Monte Carlo Engine
=========================================
Portfolio Monte Carlo simulation.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from ui.components import section_header


def render():
    """Render the Monte Carlo simulation page"""

    st.title("🎲 Monte Carlo Engine")
    st.caption("Portfolio risk simulation and scenario analysis")

    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    try:
        # Get portfolio data
        account = adapter.get_account_summary()
        portfolio_value = account['portfolio_value']

        # Simulation parameters
        st.markdown("### ⚙️ Simulation Parameters")

        col1, col2 = st.columns(2)

        with col1:
            n_simulations = st.slider("Number of Simulations", 1000, 10000, 5000, 1000)
            days_forward = st.slider("Time Horizon (days)", 30, 365, 252)

        with col2:
            confidence_level = st.slider("Confidence Level", 0.90, 0.99, 0.95, 0.01)
            initial_value = st.number_input(
                "Portfolio Value",
                value=float(portfolio_value),
                step=10000.0
            )

        st.markdown("---")

        # Run simulation
        if st.button("🎲 Run Simulation", type="primary"):
            with st.spinner("Running Monte Carlo simulation..."):
                # Calculate returns
                returns = adapter.calculate_returns(days=252)

                if returns.empty or len(returns) < 30:
                    st.error("Insufficient historical data for simulation. Need at least 30 days.")
                    return

                # Calculate statistics
                mean_return = returns.mean()
                std_return = returns.std()

                # Run simulation
                simulations = np.zeros((days_forward, n_simulations))
                simulations[0] = initial_value

                for t in range(1, days_forward):
                    random_returns = np.random.normal(mean_return, std_return, n_simulations)
                    simulations[t] = simulations[t-1] * (1 + random_returns)

                # Calculate percentiles
                percentile_5 = np.percentile(simulations, 5, axis=1)
                percentile_50 = np.percentile(simulations, 50, axis=1)
                percentile_95 = np.percentile(simulations, 95, axis=1)

                # Results
                st.markdown("### 📊 Simulation Results")

                col1, col2, col3 = st.columns(3)

                final_median = percentile_50[-1]
                final_low = percentile_5[-1]
                final_high = percentile_95[-1]

                with col1:
                    st.metric(
                        "Expected Value (Median)",
                        f"${final_median:,.0f}",
                        f"{((final_median/initial_value)-1)*100:+.1f}%"
                    )

                with col2:
                    st.metric(
                        f"Worst Case (5th %ile)",
                        f"${final_low:,.0f}",
                        f"{((final_low/initial_value)-1)*100:+.1f}%"
                    )

                with col3:
                    st.metric(
                        f"Best Case (95th %ile)",
                        f"${final_high:,.0f}",
                        f"{((final_high/initial_value)-1)*100:+.1f}%"
                    )

                st.markdown("---")

                # Plot simulation paths
                section_header("📈 Simulation Paths", "Possible portfolio trajectories")

                fig = go.Figure()

                # Sample 100 random paths to display
                sample_paths = simulations[:, np.random.choice(n_simulations, min(100, n_simulations), replace=False)]

                for i in range(sample_paths.shape[1]):
                    fig.add_trace(go.Scatter(
                        y=sample_paths[:, i],
                        mode='lines',
                        line=dict(color='lightblue', width=0.5),
                        opacity=0.3,
                        showlegend=False,
                        hoverinfo='skip'
                    ))

                # Add percentile lines
                fig.add_trace(go.Scatter(
                    y=percentile_5,
                    mode='lines',
                    name='5th Percentile',
                    line=dict(color='red', width=2, dash='dash')
                ))

                fig.add_trace(go.Scatter(
                    y=percentile_50,
                    mode='lines',
                    name='Median',
                    line=dict(color='green', width=3)
                ))

                fig.add_trace(go.Scatter(
                    y=percentile_95,
                    mode='lines',
                    name='95th Percentile',
                    line=dict(color='blue', width=2, dash='dash')
                ))

                fig.update_layout(
                    xaxis_title="Days",
                    yaxis_title="Portfolio Value ($)",
                    height=500,
                    hovermode='x unified'
                )

                st.plotly_chart(fig, use_container_width=True)

                st.markdown("---")

                # Risk metrics
                section_header("⚠️ Risk Metrics", "Simulation-based risk assessment")

                # Calculate VaR
                final_values = simulations[-1]
                var_95 = initial_value - np.percentile(final_values, 5)
                cvar_95 = initial_value - final_values[final_values <= np.percentile(final_values, 5)].mean()

                col1, col2, col3 = st.columns(3)

                with col1:
                    st.metric("Value at Risk (95%)", f"${var_95:,.0f}")
                    st.caption(f"Potential loss: {(var_95/initial_value)*100:.1f}%")

                with col2:
                    st.metric("Conditional VaR (95%)", f"${cvar_95:,.0f}")
                    st.caption(f"Expected loss if VaR exceeded: {(cvar_95/initial_value)*100:.1f}%")

                with col3:
                    prob_loss = (final_values < initial_value).sum() / n_simulations * 100
                    st.metric("Probability of Loss", f"{prob_loss:.1f}%")
                    st.caption(f"Chance of losing money")

    except Exception as e:
        st.error(f"Error running simulation: {str(e)}")
        st.exception(e)
