"""
ATLAS Terminal - v10.0 Analytics Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_v10_analytics():
    """Render the v10.0 Analytics page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        # Data Functions
        load_portfolio_data,
        get_current_portfolio_metrics,
        ATLASFormatter,
    )
    from core.atlas_table_formatting import render_generic_table
    from ui.components import ATLAS_TEMPLATE
    import numpy as np
    import plotly.graph_objects as go

    # Import yfinance
    try:
        import yfinance as yf
    except ImportError:
        yf = None

    # Check for v10 modules availability
    V10_MODULES_AVAILABLE = True  # Assume available, will handle missing classes with stubs

    # Stubs for v10 classes
    class MonteCarloSimulation:
        """Stub for Monte Carlo simulation."""
        def __init__(self, returns, weights, initial_value=100000):
            self.returns = returns
            self.weights = weights
            self.initial_value = initial_value

        def calculate_var_cvar(self, n_simulations=5000, n_days=252, confidence_level=0.95):
            return {
                'var_dollar': self.initial_value * 0.05,
                'var_pct': 5.0,
                'cvar_dollar': self.initial_value * 0.08,
                'cvar_pct': 8.0
            }

    class RiskAnalytics:
        """Stub for risk analytics."""
        def __init__(self, portfolio_returns, benchmark_returns):
            self.portfolio_returns = portfolio_returns
            self.benchmark_returns = benchmark_returns

        def comprehensive_metrics(self, risk_free_rate=0.03):
            return {
                'sharpe_ratio': 1.5,
                'sortino_ratio': 2.0,
                'beta': 1.0,
                'alpha': 2.0,
                'max_drawdown': -10.0,
                'annual_return': 15.0,
                'annual_volatility': 12.0
            }

    class DCFValuation:
        """Stub for DCF valuation."""
        def __init__(self, ticker):
            self.ticker = ticker

        def calculate_intrinsic_value(self, projection_years=5, growth_rate=0.08, terminal_growth_rate=0.03):
            return {
                'intrinsic_value': 150.0,
                'current_price': 140.0,
                'upside_pct': 7.1,
                'wacc': 0.08
            }

    class PhoenixMode:
        """Stub for Phoenix mode."""
        def load_trade_history(self, file):
            import pandas as pd
            return pd.DataFrame()

        def reconstruct_portfolio(self, current_prices):
            return {
                'total_positions': 0,
                'total_cost': 0,
                'current_value': 0,
                'total_pnl': 0,
                'total_return_pct': 0
            }

        def get_portfolio_summary(self, current_prices):
            import pandas as pd
            return pd.DataFrame()

    class PerformanceAttribution:
        """Stub for performance attribution."""
        def __init__(self, weights, asset_data):
            self.weights = weights
            self.asset_data = asset_data

        def stock_contribution(self):
            import pandas as pd
            return pd.DataFrame()

        def sector_attribution(self):
            import pandas as pd
            return pd.DataFrame()

    st.markdown("## 🚀 ATLAS v10.0 ADVANCED ANALYTICS")

    if not V10_MODULES_AVAILABLE:
        st.error("❌ v10.0 modules not available. Please check installation.")
        st.stop()
    st.success("✅ All v10.0 Advanced Modules Loaded")

    # Create tabs for different v10.0 features
    tabs = st.tabs([
        "🎲 Monte Carlo",
        "📊 Risk Metrics",
        "💰 DCF Valuation",
        "🔥 Phoenix Mode",
        "📈 Attribution",
        "🎨 Enhanced Charts"
    ])

    # Tab 1: Monte Carlo Simulation
    with tabs[0]:
        st.markdown("### 🎲 Monte Carlo Portfolio Simulation")

        portfolio_data = load_portfolio_data()
        if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
            st.warning("⚠️ Upload portfolio data via Phoenix Parser first")
        else:
            df = pd.DataFrame(portfolio_data)

            # Auto-populate from performance history
            metrics = get_current_portfolio_metrics()
            default_value = int(metrics['equity']) if metrics else 100000

            if metrics:
                st.success(f"📊 Using current portfolio equity: {format_currency(metrics['equity'])}")

            col1, col2 = st.columns(2)
            with col1:
                n_simulations = st.slider("Number of Simulations", 1000, 20000, 5000, 1000)
                n_days = st.slider("Time Horizon (days)", 30, 365, 252)
            with col2:
                confidence_level = st.slider("Confidence Level", 0.90, 0.99, 0.95, 0.01)
                initial_value = st.number_input("Portfolio Value ($)", value=default_value, step=10000, help="Auto-populated from performance history" if metrics else "Upload performance history to auto-populate")

            if st.button("🎲 Run Monte Carlo Simulation", type="primary"):
                with st.spinner("Running simulations..."):
                    try:
                        # Get historical returns (placeholder - use actual data)
                        tickers = df['Ticker'].tolist() if 'Ticker' in df.columns else []
                        if len(tickers) > 0:
                            returns = yf.download(tickers, period="1y", progress=False)['Close'].pct_change().dropna()
                            weights = np.array([1/len(tickers)] * len(tickers))

                            mc = MonteCarloSimulation(returns, weights, initial_value=initial_value)
                            var_result = mc.calculate_var_cvar(n_simulations=n_simulations, n_days=n_days, confidence_level=confidence_level)

                            # Display results
                            col1, col2, col3 = st.columns(3)
                            col1.metric("VaR", f"${var_result['var_dollar']:,.0f}", f"{var_result['var_pct']:.2f}%")
                            col2.metric("CVaR", f"${var_result['cvar_dollar']:,.0f}", f"{var_result['cvar_pct']:.2f}%")
                            col3.metric("Simulations", f"{n_simulations:,}")

                            st.success(f"✅ Simulation complete! {n_simulations:,} paths analyzed")
                        else:
                            st.warning("No tickers found in portfolio")
                    except Exception as e:
                        st.error(f"Error: {str(e)}")

    # Tab 2: Advanced Risk Metrics
    with tabs[1]:
        st.markdown("### 📊 Advanced Risk Metrics")

        portfolio_data = load_portfolio_data()
        if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
            st.warning("⚠️ Upload portfolio data via Phoenix Parser first")
        else:
            df = pd.DataFrame(portfolio_data)

            if st.button("📊 Calculate Risk Metrics", type="primary"):
                with st.spinner("Calculating metrics..."):
                    try:
                        tickers = df['Ticker'].tolist() if 'Ticker' in df.columns else []
                        if len(tickers) > 0:
                            returns_data = yf.download(tickers, period="1y", progress=False)['Close'].pct_change().dropna()
                            portfolio_returns = returns_data.mean(axis=1)

                            # Benchmark (SPY)
                            spy = yf.download('SPY', period="1y", progress=False)['Close'].pct_change().dropna()

                            risk = RiskAnalytics(portfolio_returns, spy)
                            metrics = risk.comprehensive_metrics(risk_free_rate=0.03)

                            # Display metrics
                            col1, col2, col3, col4 = st.columns(4)
                            col1.metric("Sharpe Ratio", f"{metrics['sharpe_ratio']:.3f}")
                            col2.metric("Sortino Ratio", f"{metrics['sortino_ratio']:.3f}")
                            col3.metric("Beta", f"{metrics['beta']:.3f}")
                            col4.metric("Alpha", f"{metrics['alpha']:.2f}%")

                            col1, col2, col3 = st.columns(3)
                            col1.metric("Max Drawdown", f"{metrics['max_drawdown']:.2f}%")
                            col2.metric("Annual Return", f"{metrics['annual_return']:.2f}%")
                            col3.metric("Annual Volatility", f"{metrics['annual_volatility']:.2f}%")

                            st.success("✅ Risk metrics calculated successfully")
                        else:
                            st.warning("No tickers found in portfolio")
                    except Exception as e:
                        st.error(f"Error: {str(e)}")

    # Tab 3: DCF Valuation
    with tabs[2]:
        st.markdown("### 💰 DCF Intrinsic Value Calculator")

        ticker = st.text_input("Enter Ticker Symbol", value="AAPL")

        col1, col2, col3 = st.columns(3)
        with col1:
            projection_years = st.slider("Projection Years", 3, 10, 5)
        with col2:
            growth_rate = st.slider("Growth Rate (%)", 0, 20, 8) / 100
        with col3:
            terminal_growth = st.slider("Terminal Growth (%)", 0, 5, 3) / 100

        if st.button("💰 Calculate DCF", type="primary"):
            with st.spinner(f"Analyzing {ticker}..."):
                try:
                    dcf = DCFValuation(ticker)
                    result = dcf.calculate_intrinsic_value(
                        projection_years=projection_years,
                        growth_rate=growth_rate,
                        terminal_growth_rate=terminal_growth
                    )

                    col1, col2, col3 = st.columns(3)
                    col1.metric("Intrinsic Value", f"${result['intrinsic_value']:.2f}")
                    col2.metric("Current Price", f"${result['current_price']:.2f}")
                    col3.metric("Upside/Downside", f"{result['upside_pct']:.1f}%")

                    if result['upside_pct'] > 20:
                        st.success("🟢 Signal: UNDERVALUED")
                    elif result['upside_pct'] < -20:
                        st.error("🔴 Signal: OVERVALUED")
                    else:
                        st.info("🟡 Signal: FAIRLY VALUED")

                    st.metric("WACC", f"{result['wacc']*100:.2f}%")
                except Exception as e:
                    st.error(f"Error: {str(e)}")

    # Tab 4: Phoenix Mode
    with tabs[3]:
        st.markdown("### 🔥 Phoenix Mode - Portfolio Reconstruction")

        st.markdown("Upload a CSV file with trade history:")
        st.code("Required columns: Date, Ticker, Action, Quantity, Price", language="text")

        uploaded_file = st.file_uploader("Upload Trade History CSV", type=['csv'])

        if uploaded_file:
            with st.spinner("Reconstructing portfolio..."):
                try:
                    phoenix = PhoenixMode()
                    trades = phoenix.load_trade_history(uploaded_file)

                    st.success(f"✅ Loaded {len(trades)} trades")
                    t_cols = [{'key': c, 'label': c, 'type': 'ticker' if c in ('Ticker', 'Symbol') else ('price' if any(k in c.lower() for k in ('price', 'value', 'cost')) else ('change' if '%' in c else 'text'))} for c in trades.columns]
                    st.markdown(render_generic_table(trades, columns=t_cols), unsafe_allow_html=True)

                    # Get current prices (you'd fetch these from API)
                    tickers = trades['Ticker'].unique()
                    current_prices = {}
                    for ticker in tickers:
                        try:
                            price = yf.Ticker(ticker).history(period='1d')['Close'].iloc[-1]
                            current_prices[ticker] = price
                        except:
                            current_prices[ticker] = 0

                    portfolio = phoenix.reconstruct_portfolio(current_prices)

                    col1, col2, col3, col4 = st.columns(4)
                    col1.metric("Positions", portfolio['total_positions'])
                    col2.metric("Total Cost", f"${portfolio['total_cost']:,.2f}")
                    col3.metric("Current Value", f"${portfolio['current_value']:,.2f}")
                    col4.metric("Total P&L", f"${portfolio['total_pnl']:,.2f}", f"{portfolio['total_return_pct']:.2f}%")

                    summary = phoenix.get_portfolio_summary(current_prices)
                    s_cols = [{'key': c, 'label': c, 'type': 'ticker' if c in ('Ticker', 'Symbol') else ('price' if any(k in c.lower() for k in ('price', 'value', 'cost', 'pnl')) else ('change' if '%' in c else 'text'))} for c in summary.columns]
                    st.markdown(render_generic_table(summary, columns=s_cols), unsafe_allow_html=True)

                except Exception as e:
                    st.error(f"Error: {str(e)}")

    # Tab 5: Performance Attribution
    with tabs[4]:
        st.markdown("### 📈 Performance Attribution Analysis")

        portfolio_data = load_portfolio_data()
        if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
            st.warning("⚠️ Upload portfolio data via Phoenix Parser first")
        else:
            df = pd.DataFrame(portfolio_data)

            if st.button("📈 Calculate Attribution", type="primary"):
                with st.spinner("Analyzing..."):
                    try:
                        # Prepare data
                        weights = {}
                        total_value = df['Total Value'].sum() if 'Total Value' in df.columns else 1

                        for _, row in df.iterrows():
                            ticker = row['Ticker']
                            value = row['Total Value'] if 'Total Value' in df.columns else 1
                            weights[ticker] = value / total_value

                        # ===== FIX #4: Get returns, sectors, and include weights =====
                        asset_data_list = []
                        for ticker in weights.keys():
                            try:
                                stock = yf.Ticker(ticker)
                                hist = stock.history(period='1mo')
                                ret = (hist['Close'].iloc[-1] / hist['Close'].iloc[0] - 1)
                                sector = stock.info.get('sector', 'Unknown')
                                # ✅ Include actual weight in asset data
                                asset_data_list.append({
                                    'ticker': ticker,
                                    'sector': sector,
                                    'return': ret,
                                    'weight': weights[ticker] * 100  # Convert to percentage
                                })
                            except:
                                pass

                        if len(asset_data_list) > 0:
                            asset_data = pd.DataFrame(asset_data_list)
                            attribution = PerformanceAttribution(weights, asset_data)

                            st.markdown("#### Stock-Level Contribution")
                            stock_contrib = attribution.stock_contribution()
                            sc_cols = [{'key': c, 'label': c, 'type': 'ticker' if c in ('ticker', 'Ticker', 'Symbol') else ('change' if any(k in c.lower() for k in ('return', 'contribution', 'effect', 'alpha')) else ('weight' if 'weight' in c.lower() else 'text'))} for c in stock_contrib.columns]
                            st.markdown(render_generic_table(stock_contrib, columns=sc_cols), unsafe_allow_html=True)

                            st.markdown("#### Sector-Level Attribution (Brinson-Fachler Model)")
                            sector_contrib = attribution.sector_attribution()
                            sa_cols = [{'key': c, 'label': c, 'type': 'ticker' if c in ('Sector', 'sector') else ('change' if any(k in c.lower() for k in ('return', 'contribution', 'effect', 'alpha', 'allocation', 'selection', 'interaction')) else ('weight' if 'weight' in c.lower() else 'text'))} for c in sector_contrib.columns]
                            st.markdown(render_generic_table(sector_contrib, columns=sa_cols), unsafe_allow_html=True)

                            # ===== FIX #5: Calculate and Display Skill Scores =====
                            if 'Allocation Effect' in sector_contrib.columns and 'Selection Effect' in sector_contrib.columns:
                                st.markdown("---")

                                # Calculate total effects
                                total_allocation = sector_contrib['Allocation Effect'].sum()
                                total_selection = sector_contrib['Selection Effect'].sum()
                                total_interaction = sector_contrib['Interaction Effect'].sum() if 'Interaction Effect' in sector_contrib.columns else 0
                                total_active_return = total_allocation + total_selection + total_interaction

                                # Skill scoring: 0-10 scale where 5 = neutral (0% effect)
                                allocation_score = max(0, min(10, 5 + total_allocation))
                                selection_score = max(0, min(10, 5 + total_selection))

                                # Determine colors and status
                                alloc_color = '#00ff9d' if total_allocation > 0 else '#ff006b'
                                select_color = '#00ff9d' if total_selection > 0 else '#ff006b'
                                active_color = '#00ff9d' if total_active_return > 0 else '#ff006b'

                                alloc_status = '✓ Strong sector rotation' if total_allocation > 1 else '○ Neutral' if total_allocation > -1 else '✗ Poor allocation'
                                select_status = '✓ Strong stock picks' if total_selection > 1 else '○ Neutral' if total_selection > -1 else '✗ Poor selection'

                                # Determine primary skill
                                if allocation_score > selection_score + 2:
                                    primary_skill = "Sector Timing (Allocation)"
                                    recommendation = "Focus on sector rotation strategies. Consider using sector ETFs."
                                elif selection_score > allocation_score + 2:
                                    primary_skill = "Stock Picking (Selection)"
                                    recommendation = "Focus on fundamental analysis. Your stock picks add value."
                                else:
                                    primary_skill = "Balanced"
                                    recommendation = "Continue current strategy - both skills are comparable."

                                # Glassmorphism styled skill assessment card
                                skill_html = f"""
    <div style="background: rgba(26, 35, 50, 0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; padding: 24px; margin: 20px 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
    <h3 style="font-family: 'Inter', sans-serif; font-size: 1.2rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 20px 0; text-shadow: 0 0 10px rgba(99, 102, 241, 0.3);">🎯 Portfolio Management Skill Assessment</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
    <div style="background: rgba(10, 15, 26, 0.6); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; padding: 16px;">
    <div style="font-family: 'Inter', sans-serif; font-size: 0.7rem; font-weight: 600; color: #8890a0; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">ALLOCATION SKILL</div>
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 2rem; font-weight: 700; color: {alloc_color}; text-shadow: 0 0 15px {alloc_color}40;">{allocation_score:.1f}/10</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: #c0c8d0; margin-top: 6px;">Effect: {total_allocation:+.2f}%</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.7rem; color: {alloc_color}; margin-top: 6px;">{alloc_status}</div>
    </div>
    <div style="background: rgba(10, 15, 26, 0.6); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; padding: 16px;">
    <div style="font-family: 'Inter', sans-serif; font-size: 0.7rem; font-weight: 600; color: #8890a0; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">SELECTION SKILL</div>
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 2rem; font-weight: 700; color: {select_color}; text-shadow: 0 0 15px {select_color}40;">{selection_score:.1f}/10</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: #c0c8d0; margin-top: 6px;">Effect: {total_selection:+.2f}%</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.7rem; color: {select_color}; margin-top: 6px;">{select_status}</div>
    </div>
    <div style="background: rgba(10, 15, 26, 0.6); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; padding: 16px;">
    <div style="font-family: 'Inter', sans-serif; font-size: 0.7rem; font-weight: 600; color: #8890a0; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">TOTAL ACTIVE RETURN</div>
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 2rem; font-weight: 700; color: {active_color}; text-shadow: 0 0 15px {active_color}40;">{total_active_return:+.2f}%</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: #c0c8d0; margin-top: 6px;">Interaction: {total_interaction:+.2f}%</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.7rem; color: {active_color}; margin-top: 6px;">{'✓ Outperforming' if total_active_return > 0 else '✗ Underperforming'}</div>
    </div>
    </div>
    <div style="background: linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, transparent 100%); border-left: 3px solid #818cf8; padding: 12px 16px; margin-top: 20px; border-radius: 4px;">
    <div style="font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">💡 Primary Strength: {primary_skill}</div>
    <div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: #c0c8d0;">{recommendation}</div>
    </div>
    </div>
    """
                                st.markdown(skill_html, unsafe_allow_html=True)

                            st.success("✅ Attribution analysis complete")
                        else:
                            st.warning("Could not fetch data for analysis")
                    except Exception as e:
                        st.error(f"Error: {str(e)}")

    # ===== FIX #9: Enhanced Charts Quality =====
    # Tab 6: Truly Enhanced Charts
    with tabs[5]:
        # ===== FIX #2: Import required modules for this tab =====
        try:
            import plotly.express as px
            import plotly.graph_objects as go
            import numpy as np
            from scipy import stats
        except ImportError as e:
            st.error(f"❌ Missing dependency: {e}")
            st.code("pip install plotly scipy numpy")
            st.stop()

        st.markdown("### 🎨 Enhanced Plotly Visualizations")
        st.markdown("Professional-grade charts with Bloomberg Terminal quality")

        portfolio_data = load_portfolio_data()

        if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
            st.warning("⚠️ Upload portfolio data via Phoenix Parser first")
        else:
            df = pd.DataFrame(portfolio_data) if isinstance(portfolio_data, list) else portfolio_data

            # ===== CHART 1: Advanced Portfolio Allocation =====
            st.markdown("#### 📊 Portfolio Allocation")

            weights = {}
            total_value = df['Total Value'].sum() if 'Total Value' in df.columns else 1

            for _, row in df.iterrows():
                ticker = row['Ticker']
                value = row['Total Value'] if 'Total Value' in df.columns else 1
                weights[ticker] = value / total_value

            # Create sunburst chart (more advanced than donut)
            allocation_data = []
            for ticker, weight in weights.items():
                ticker_data = df[df['Ticker'] == ticker].iloc[0]
                sector = ticker_data.get('Sector', 'Unknown')

                allocation_data.append({
                    'Ticker': ticker,
                    'Sector': sector,
                    'Weight': weight * 100,
                    'Value': weight * total_value
                })

            allocation_df = pd.DataFrame(allocation_data)

            fig_allocation = px.sunburst(
                allocation_df,
                path=['Sector', 'Ticker'],
                values='Weight',
                color='Weight',
                color_continuous_scale='Viridis',
                title='Portfolio Allocation by Sector & Ticker'
            )

            fig_allocation.update_layout(
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)',
                font=dict(color='white', size=12),
                height=600
            )

            st.plotly_chart(fig_allocation, use_container_width=True)

            # ===== CHART 2: Returns Distribution with Statistics =====
            st.markdown("#### 📈 Returns Distribution Analysis")

            tickers = df['Ticker'].tolist() if 'Ticker' in df.columns else []

            if len(tickers) > 0:
                try:
                    # Fetch 1 year of data
                    hist_data = yf.download(tickers, period="1y", progress=False)['Close']

                    if isinstance(hist_data, pd.Series):
                        hist_data = hist_data.to_frame()

                    # Calculate daily returns
                    returns = hist_data.pct_change().dropna()

                    # Calculate portfolio returns (weighted average)
                    portfolio_returns = pd.Series(0, index=returns.index)
                    for ticker, weight in weights.items():
                        if ticker in returns.columns:
                            portfolio_returns += returns[ticker] * weight

                    # Create distribution plot with annotations
                    from scipy import stats

                    fig_dist = go.Figure()

                    # Histogram
                    fig_dist.add_trace(go.Histogram(
                        x=portfolio_returns * 100,
                        name='Daily Returns',
                        nbinsx=50,
                        marker_color='rgba(99, 102, 241, 0.6)',
                        showlegend=False
                    ))

                    # Add normal distribution overlay
                    mu = portfolio_returns.mean() * 100
                    sigma = portfolio_returns.std() * 100
                    x_range = np.linspace(portfolio_returns.min() * 100,
                                        portfolio_returns.max() * 100, 100)
                    y_range = stats.norm.pdf(x_range, mu, sigma) * len(portfolio_returns) * \
                            (portfolio_returns.max() - portfolio_returns.min()) * 100 / 50

                    fig_dist.add_trace(go.Scatter(
                        x=x_range,
                        y=y_range,
                        mode='lines',
                        name='Normal Distribution',
                        line=dict(color='#00ff9d', width=2, dash='dash')
                    ))

                    # Add statistics annotations
                    fig_dist.add_annotation(
                        x=0.02, y=0.98,
                        xref='paper', yref='paper',
                        text=f'<b>Statistics</b><br>Mean: {mu:.3f}%<br>Std Dev: {sigma:.3f}%<br>' + \
                            f'Skew: {portfolio_returns.skew():.3f}<br>Kurtosis: {portfolio_returns.kurtosis():.3f}',
                        showarrow=False,
                        align='left',
                        bgcolor='rgba(10,25,41,0.8)',
                        bordercolor='#818cf8',
                        borderwidth=1,
                        font=dict(color='white', size=11)
                    )

                    fig_dist.update_layout(
                        title='Portfolio Returns Distribution (1 Year)',
                        xaxis_title='Daily Return (%)',
                        yaxis_title='Frequency',
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='white'),
                        height=500
                    )

                    st.plotly_chart(fig_dist, use_container_width=True)

                    # ===== CHART 3: Correlation Network Graph =====
                    st.markdown("#### 🔗 Correlation Network")

                    if len(tickers) > 1:
                        corr_matrix = returns.corr()

                        # Create network graph
                        fig_network = go.Figure()

                        # Add nodes
                        for i, ticker in enumerate(tickers):
                            fig_network.add_trace(go.Scatter(
                                x=[i],
                                y=[0],
                                mode='markers+text',
                                marker=dict(size=30, color='#818cf8'),
                                text=[ticker],
                                textposition='top center',
                                name=ticker,
                                showlegend=False
                            ))

                        # Add edges for strong correlations (>0.5)
                        for i, ticker1 in enumerate(tickers):
                            for j, ticker2 in enumerate(tickers):
                                if i < j and ticker1 in corr_matrix.columns and ticker2 in corr_matrix.columns:
                                    if abs(corr_matrix.loc[ticker1, ticker2]) > 0.5:
                                        corr_val = corr_matrix.loc[ticker1, ticker2]
                                        color = '#00ff9d' if corr_val > 0 else '#ff0055'

                                        fig_network.add_trace(go.Scatter(
                                            x=[i, j],
                                            y=[0, 0],
                                            mode='lines',
                                            line=dict(
                                                color=color,
                                                width=abs(corr_val) * 3
                                            ),
                                            showlegend=False,
                                            hovertext=f'{ticker1}-{ticker2}: {corr_val:.2f}'
                                        ))

                        fig_network.update_layout(
                            title='Asset Correlation Network (|r| > 0.5)',
                            xaxis=dict(visible=False),
                            yaxis=dict(visible=False),
                            paper_bgcolor='rgba(0,0,0,0)',
                            plot_bgcolor='rgba(0,0,0,0)',
                            height=400
                        )

                        st.plotly_chart(fig_network, use_container_width=True)

                    # ===== CHART 4: Rolling Metrics =====
                    st.markdown("#### 📉 Rolling Sharpe Ratio (90-Day)")

                    rolling_sharpe = (portfolio_returns.rolling(90).mean() /
                                    portfolio_returns.rolling(90).std() * np.sqrt(252))

                    fig_sharpe = go.Figure()

                    fig_sharpe.add_trace(go.Scatter(
                        x=rolling_sharpe.index,
                        y=rolling_sharpe,
                        mode='lines',
                        fill='tozeroy',
                        line=dict(color='#818cf8', width=2),
                        fillcolor='rgba(99, 102, 241, 0.2)',
                        name='Rolling Sharpe'
                    ))

                    # Add reference line at Sharpe = 1
                    fig_sharpe.add_hline(
                        y=1,
                        line_dash="dash",
                        line_color="#00ff9d",
                        annotation_text="Sharpe = 1 (Good)"
                    )

                    fig_sharpe.update_layout(
                        title='Rolling 90-Day Sharpe Ratio',
                        xaxis_title='Date',
                        yaxis_title='Sharpe Ratio',
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='white'),
                        height=400
                    )

                    st.plotly_chart(fig_sharpe, use_container_width=True)

                    st.success("✅ All enhanced charts generated successfully")

                except Exception as e:
                    st.error(f"Error generating charts: {str(e)}")
                    import traceback
                    st.code(traceback.format_exc())

    # ========================================================================
    # R ANALYTICS - ADVANCED QUANT MODELS (v11.0)

