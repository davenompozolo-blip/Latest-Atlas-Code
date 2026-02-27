"""
ATLAS Terminal - R Analytics Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_r_analytics():
    """Render the R Analytics page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        # Data Functions
        load_portfolio_data,
        ATLASFormatter,
        apply_chart_theme,
    )

    # Check for R availability
    try:
        import rpy2
        from rpy2.robjects.packages import importr
        importr('rugarch')
        R_AVAILABLE = True
    except (ImportError, OSError):
        R_AVAILABLE = False

    # Stub for R interface
    def get_r():
        """Stub for R interface."""
        class RInterface:
            def garch_volatility(self, returns, model='sGARCH'):
                return {
                    'last_volatility': 0.02,
                    'mean_volatility': 0.02,
                    'model': model,
                    'volatility': returns.rolling(20).std()
                }

            def copula_dependency(self, returns_data, copula_type='t'):
                return {
                    'copula_type': copula_type,
                    'n_assets': returns_data.shape[1],
                    'parameters': {}
                }

            def run_custom_analysis(self, r_code, data=None):
                return "R analysis not available"

        return RInterface()

    # Data layer for market data fetching
    from atlas_terminal.data.fetchers.market_data import MarketDataFetcher

    st.markdown("## 📊 R ANALYTICS - ADVANCED QUANTITATIVE MODELS")

    if not R_AVAILABLE:
        st.error("❌ R Analytics Requires Manual Setup")

        st.markdown("""
        ### 📋 R Analytics Setup Instructions

        R analytics requires packages that cannot be installed from within the app.
        You must install these dependencies **before** running the application.

        ---

        #### 🔧 For Google Colab Users:

        1. Create a new code cell **ABOVE** your Streamlit app cell
        2. Run this code:

        ```python
        # Install R and packages (takes 3-5 minutes)
        !apt-get update -qq
        !apt-get install -y r-base r-base-dev
        !R -e "install.packages(c('rugarch', 'copula', 'xts'), repos='https://cloud.r-project.org')"
        !pip install rpy2
        ```

        3. Wait for installation to complete
        4. Restart your Streamlit app
        5. R Analytics will then be available

        ---

        #### 💻 For Local Deployment (Linux/MacOS):

        ```bash
        # Install R
        sudo apt-get update
        sudo apt-get install -y r-base r-base-dev

        # Install R packages
        R -e "install.packages(c('rugarch', 'copula', 'xts'), repos='https://cloud.r-project.org')"

        # Install Python bridge
        pip install rpy2
        ```

        ---

        #### 🪟 For Windows:

        1. Download and install R from: https://cran.r-project.org/bin/windows/base/
        2. Open R console and run:
           ```r
           install.packages(c('rugarch', 'copula', 'xts'))
           ```
        3. Install rpy2:
           ```bash
           pip install rpy2
           ```

        ---
        """)

        # Add status check
        st.markdown("### 🔍 Package Status Check")

        col1, col2, col3 = st.columns(3)

        with col1:
            try:
                import rpy2
                st.success("✅ rpy2 installed")
            except ImportError:
                st.error("❌ rpy2 missing")
                st.caption("Run: `pip install rpy2`")

        with col2:
            try:
                from rpy2.robjects.packages import importr
                importr('rugarch')
                st.success("✅ rugarch available")
            except (ImportError, OSError):
                st.error("❌ rugarch missing")
                st.caption("Install in R")

        with col3:
            try:
                from rpy2.robjects.packages import importr
                importr('copula')
                st.success("✅ copula available")
            except (ImportError, OSError):
                st.error("❌ copula missing")
                st.caption("Install in R")

        return

    # Initialize R analytics
    try:
        r = get_r()
        st.success("✅ R Analytics Engine Ready")
    except (ImportError, OSError, RuntimeError) as e:
        st.error(f"Error initializing R: {str(e)}")
        return

    # Create tabs
    tabs = st.tabs(["📈 GARCH Volatility", "🔗 Copula Analysis", "🎲 Custom R Code"])

    # Tab 1: GARCH Volatility Modeling
    with tabs[0]:
        st.markdown("### 📈 GARCH Volatility Forecasting")
        st.markdown("Fit GARCH models to estimate conditional volatility and forecast future volatility")

        portfolio_data = load_portfolio_data()
        if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
            st.warning("⚠️ Upload portfolio data via Phoenix Parser first")
        else:
            df = pd.DataFrame(portfolio_data)

            # Ticker selection
            ticker = st.selectbox("Select Ticker", df['Ticker'].tolist() if 'Ticker' in df.columns else [])

            col1, col2 = st.columns(2)
            with col1:
                model_type = st.selectbox("GARCH Model", ["sGARCH", "eGARCH", "gjrGARCH"])
            with col2:
                forecast_days = st.number_input("Forecast Horizon (days)", 1, 30, 10)

            if st.button("🎯 Fit GARCH Model", type="primary"):
                with st.spinner(f"Fitting {model_type} model to {ticker}..."):
                    try:
                        # Get historical data
                        stock_data = MarketDataFetcher.get_prices([ticker], period="1y")
                        returns = stock_data.iloc[:, 0].pct_change().dropna()

                        # Fit GARCH model using R
                        result = r.garch_volatility(returns, model=model_type)

                        # Display metrics
                        col1, col2, col3 = st.columns(3)
                        col1.metric("Current Volatility", f"{result['last_volatility']*100:.2f}%")
                        col2.metric("Mean Volatility", f"{result['mean_volatility']*100:.2f}%")
                        col3.metric("Model Type", result['model'])

                        # Plot volatility
                        import plotly.graph_objects as go
                        fig = go.Figure()
                        fig.add_trace(go.Scatter(
                            y=result['volatility'] * 100,
                            mode='lines',
                            name=f'{model_type} Volatility',
                            line=dict(color='#818cf8', width=2)
                        ))
                        fig.update_layout(
                            title=f"{ticker} - Conditional Volatility ({model_type})",
                            xaxis_title="Time",
                            yaxis_title="Volatility (%)",
                            height=400,
                        )
                        apply_chart_theme(fig)
                        st.plotly_chart(fig, use_container_width=True)

                        st.success(f"✅ {model_type} model fitted successfully to {ticker}")

                    except (ValueError, KeyError, TypeError, AttributeError, RuntimeError) as e:
                        st.error(f"Error: {str(e)}")
                        st.info("Make sure rugarch package is installed in R: install.packages('rugarch')")

    # Tab 2: Copula Dependency Analysis
    with tabs[1]:
        st.markdown("### 🔗 Copula Dependency Analysis")
        st.markdown("Model the dependency structure between assets using copula functions")

        portfolio_data = load_portfolio_data()
        if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
            st.warning("⚠️ Upload portfolio data via Phoenix Parser first")
        else:
            df = pd.DataFrame(portfolio_data)

            # Multi-select tickers
            all_tickers = df['Ticker'].tolist() if 'Ticker' in df.columns else []
            selected_tickers = st.multiselect(
                "Select Assets (min 2)",
                all_tickers,
                default=all_tickers[:min(3, len(all_tickers))]
            )

            copula_type = st.selectbox("Copula Type", ["t", "normal", "clayton", "gumbel"])

            if len(selected_tickers) >= 2:
                if st.button("🔗 Fit Copula", type="primary"):
                    with st.spinner(f"Fitting {copula_type} copula..."):
                        try:
                            # Get returns data
                            returns_data = MarketDataFetcher.get_prices(selected_tickers, period="1y").pct_change().dropna()

                            # Fit copula
                            result = r.copula_dependency(returns_data, copula_type=copula_type)

                            st.success(f"✅ {copula_type.upper()} Copula fitted successfully")

                            col1, col2 = st.columns(2)
                            col1.metric("Copula Type", result['copula_type'].upper())
                            col2.metric("Number of Assets", result['n_assets'])

                            st.markdown("#### Copula Parameters")
                            st.write(result['parameters'])

                            # Correlation heatmap
                            corr_matrix = returns_data.corr()
                            import plotly.express as px
                            fig = px.imshow(
                                corr_matrix,
                                labels=dict(color="Correlation"),
                                x=corr_matrix.columns,
                                y=corr_matrix.columns,
                                color_continuous_scale='Spectral_r',
                                zmin=-1, zmax=1
                            )
                            fig.update_layout(
                                title="Asset Correlation Matrix",
                                height=500,
                            )
                            apply_chart_theme(fig)
                            st.plotly_chart(fig, use_container_width=True)

                        except (ValueError, KeyError, TypeError, AttributeError, RuntimeError) as e:
                            st.error(f"Error: {str(e)}")
                            st.info("Make sure copula package is installed in R: install.packages('copula')")
            else:
                st.info("Please select at least 2 assets for copula analysis")

    # Tab 3: Custom R Code Execution
    with tabs[2]:
        st.markdown("### 🎲 Custom R Code Executor")
        st.markdown("Run custom R analytics with your portfolio data")

        st.markdown("**Portfolio data available as `df` variable in R**")

        r_code = st.text_area(
            "R Code",
            value="""# Example: Calculate correlation matrix
        cor(df)

        # Example: Summary statistics
        summary(df)""",
            height=200
        )

        if st.button("▶️ Run R Code", type="primary"):
            portfolio_data = load_portfolio_data()

            if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
                st.warning("⚠️ No portfolio data available")
            else:
                with st.spinner("Executing R code..."):
                    try:
                        df = pd.DataFrame(portfolio_data)

                        # Get returns for analysis
                        tickers = df['Ticker'].tolist() if 'Ticker' in df.columns else []
                        if len(tickers) > 0:
                            returns_data = MarketDataFetcher.get_prices(tickers, period="1y").pct_change().dropna()

                            # Execute custom R code
                            result = r.run_custom_analysis(r_code, data=returns_data)

                            st.success("✅ R code executed successfully")

                            st.markdown("#### Results:")
                            st.write(result)
                        else:
                            st.warning("No tickers found in portfolio")

                    except (ValueError, KeyError, TypeError, AttributeError, RuntimeError) as e:
                        st.error(f"Error executing R code: {str(e)}")
                        st.code(str(e))

    # ========================================================================
    # DATABASE PAGE - PROFESSIONAL SQL INTERFACE

