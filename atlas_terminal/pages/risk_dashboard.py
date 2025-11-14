"""
Risk Dashboard Page
UI for real-time risk budget monitoring and position risk tracking
"""

import streamlit as st
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

from ..features.risk_monitor import RiskBudgetMonitor
from ..data.cache_manager import load_portfolio_data, load_account_history
from ..visualizations.formatters import ATLASFormatter
from ..visualizations.themes import create_gauge_chart, apply_chart_theme
from ..analytics.portfolio import calculate_portfolio_returns
from ..analytics.risk import calculate_var
from ..config import COLORS, VERSION

logger = logging.getLogger(__name__)


def render():
    """Render the Risk Dashboard page"""
    
    st.markdown("## 🎯 RISK DASHBOARD")
    st.markdown("### Real-Time Risk Budget Monitoring for Leveraged Portfolios")
    
    # Load portfolio data
    portfolio_data = load_portfolio_data()
    
    if not portfolio_data:
        st.warning("⚠️ No portfolio data loaded. Please upload via the sidebar.")
        st.info("""
        **Risk Dashboard** requires portfolio data to monitor:
        - Risk budget utilization
        - Position-level risk contributions
        - Stress scenario analysis
        - Real-time alerts
        """)
        return
    
    df = pd.DataFrame(portfolio_data)
    
    # Initialize Risk Budget Monitor
    st.markdown("---")
    st.markdown("#### ⚙️ Risk Budget Configuration")
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        max_portfolio_var = st.slider(
            "Max Portfolio VaR (%)",
            min_value=5.0,
            max_value=50.0,
            value=20.0,
            step=1.0,
            help="Maximum acceptable portfolio Value at Risk"
        ) / 100
    
    with col2:
        max_position_var = st.slider(
            "Max Position VaR (%)",
            min_value=1.0,
            max_value=25.0,
            value=10.0,
            step=1.0,
            help="Maximum VaR for any single position"
        ) / 100
    
    with col3:
        max_leverage = st.slider(
            "Max Leverage",
            min_value=1.0,
            max_value=5.0,
            value=3.0,
            step=0.1,
            help="Maximum allowed leverage ratio"
        )
    
    with col4:
        alert_threshold = st.slider(
            "Alert Threshold (%)",
            min_value=50,
            max_value=95,
            value=80,
            step=5,
            help="Trigger alerts at this % of limits"
        ) / 100
    
    try:
        monitor = RiskBudgetMonitor(
            max_portfolio_var=max_portfolio_var,
            max_position_var=max_position_var,
            max_leverage=max_leverage,
            alert_threshold=alert_threshold
        )
    except Exception as e:
        logger.error(f"Error initializing Risk Monitor: {e}", exc_info=True)
        st.error(f"Error initializing Risk Monitor: {e}")
        return
    
    # Calculate portfolio returns
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    
    try:
        from ..visualizations.charts import create_enhanced_holdings_table
        enhanced_df = create_enhanced_holdings_table(df)
    except:
        enhanced_df = df
    
    portfolio_returns = calculate_portfolio_returns(enhanced_df, start_date, end_date)
    
    if portfolio_returns is None or len(portfolio_returns) < 10:
        st.warning("Insufficient return data for risk analysis. Need at least 10 observations.")
        return
    
    # Calculate risk utilization
    utilization = monitor.calculate_risk_utilization(portfolio_returns)
    
    if not utilization:
        st.error("Unable to calculate risk utilization.")
        return
    
    st.markdown("---")
    
    # Main Dashboard
    st.markdown("### 📊 Risk Budget Status")
    
    # Top row - Key metrics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        risk_pct = utilization.get('risk_utilization_pct', 0)
        status = utilization.get('status', 'UNKNOWN')
        
        status_emoji = {
            'LOW': '🟢',
            'MODERATE': '🟡',
            'WARNING': '🟠',
            'EXCEEDED': '🔴'
        }
        
        st.metric(
            "Risk Utilization",
            f"{risk_pct:.1f}%",
            delta=f"{status_emoji.get(status, '⚪')} {status}"
        )
    
    with col2:
        current_var = utilization.get('current_var', 0)
        max_var = utilization.get('max_var', 0)
        
        st.metric(
            "Current VaR (95%)",
            f"{current_var*100:.2f}%",
            delta=f"Limit: {max_var*100:.0f}%"
        )
    
    with col3:
        current_leverage = utilization.get('current_leverage', 1.0)
        leverage_status = utilization.get('leverage_status', 'OK')
        
        st.metric(
            "Current Leverage",
            f"{current_leverage:.2f}x",
            delta=f"{leverage_status}"
        )
    
    with col4:
        capacity = monitor.get_risk_capacity(current_var)
        remaining_pct = capacity.get('remaining_pct', 0)
        
        st.metric(
            "Available Risk Budget",
            f"{remaining_pct:.1f}%",
            delta="Remaining"
        )
    
    # Gauge chart for risk utilization
    st.markdown("---")
    st.markdown("#### 🎯 Risk Budget Utilization")
    
    try:
        gauge = create_gauge_chart(
            value=risk_pct,
            max_value=100,
            title="Risk Budget Used",
            thresholds=[60, 80, 100],
            colors=['green', 'yellow', 'red']
        )
        st.plotly_chart(gauge, use_container_width=True)
    except Exception as e:
        logger.error(f"Error creating gauge: {e}")
        st.info("Gauge chart unavailable")
    
    # Alerts section
    alerts = monitor.get_alerts()
    
    if alerts:
        st.markdown("---")
        st.markdown("#### ⚠️ Active Risk Alerts")
        
        for alert in alerts[-5:]:  # Show last 5 alerts
            severity = alert.get('severity', 'LOW')
            message = alert.get('message', '')
            
            if severity == 'HIGH':
                st.error(f"🔴 {message}")
            elif severity == 'MEDIUM':
                st.warning(f"🟡 {message}")
            else:
                st.info(f"🔵 {message}")
    
    st.markdown("---")
    
    # Tabs for detailed analysis
    tab1, tab2, tab3, tab4 = st.tabs([
        "📊 Position Risk",
        "🧪 Stress Testing",
        "📈 Risk Capacity",
        "📋 Full Report"
    ])
    
    with tab1:
        st.markdown("### 📊 Position-Level Risk Contributions")
        
        contributions = monitor.calculate_position_risk_contributions(enhanced_df)
        
        if contributions is not None and not contributions.empty:
            # Format for display
            display_df = contributions.copy()
            
            if 'Weight' in display_df.columns:
                display_df['Weight'] = display_df['Weight'].apply(lambda x: f"{x*100:.2f}%")
            if 'Risk_Contribution' in display_df.columns:
                display_df['Risk_Contribution'] = display_df['Risk_Contribution'].apply(lambda x: f"{x*100:.2f}%")
            if 'Risk_Pct' in display_df.columns:
                display_df['Risk_Pct'] = display_df['Risk_Pct'].apply(lambda x: f"{x:.2f}%")
            
            st.dataframe(display_df, use_container_width=True, height=400)
            
            # Highlight positions exceeding limits
            if 'Exceeds_Limit' in contributions.columns:
                exceeds = contributions[contributions['Exceeds_Limit']]
                if not exceeds.empty:
                    st.error(f"⚠️ {len(exceeds)} position(s) exceed risk limits!")
                    for idx, row in exceeds.iterrows():
                        st.warning(f"• {row['Ticker']}: {row['Risk_Contribution']*100:.2f}% risk contribution")
        else:
            st.info("Position risk analysis unavailable. Need historical returns data.")
    
    with tab2:
        st.markdown("### 🧪 Stress Testing")
        st.info("Evaluate risk budget under extreme market scenarios")
        
        # Define stress scenarios
        stress_scenarios = {
            'Market Crash (-30%)': -0.30,
            'Moderate Correction (-15%)': -0.15,
            'Flash Crash (-20%)': -0.20,
            'Credit Crisis (-35%)': -0.35,
            'Strong Rally (+25%)': 0.25
        }
        
        stress_results = monitor.stress_test_risk_budget(portfolio_returns, stress_scenarios)
        
        if stress_results:
            # Create results table
            results_data = []
            for scenario, result in stress_results.items():
                results_data.append({
                    'Scenario': scenario,
                    'VaR (95%)': f"{result.get('var_95', 0)*100:.2f}%",
                    'Utilization': f"{result.get('utilization_pct', 0):.1f}%",
                    'Status': result.get('status', 'UNKNOWN'),
                    'VaR Increase': f"{result.get('var_increase_pct', 0):+.1f}%"
                })
            
            results_df = pd.DataFrame(results_data)
            st.dataframe(results_df, use_container_width=True, hide_index=True)
            
            # Warnings for breaches
            breaches = [s for s, r in stress_results.items() if r.get('status') == 'BREACH']
            if breaches:
                st.error(f"⚠️ Risk budget would be breached in {len(breaches)} scenario(s):")
                for breach in breaches:
                    st.warning(f"• {breach}")
        else:
            st.info("Stress test results unavailable")
    
    with tab3:
        st.markdown("### 📈 Risk Capacity Analysis")
        
        capacity_info = monitor.get_risk_capacity(current_var)
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("#### Available Capacity")
            
            st.metric(
                "Remaining Risk Budget",
                f"{capacity_info.get('remaining_risk_budget', 0)*100:.2f}%"
            )
            
            st.metric(
                "% of Budget Used",
                f"{capacity_info.get('used_pct', 0):.1f}%"
            )
            
            st.metric(
                "% of Budget Available",
                f"{capacity_info.get('remaining_pct', 0):.1f}%"
            )
        
        with col2:
            st.markdown("#### Capacity Estimates")
            
            est_positions = capacity_info.get('estimated_additional_positions', 0)
            at_capacity = capacity_info.get('at_capacity', False)
            
            if at_capacity:
                st.error("🔴 At Risk Capacity - No room for new positions")
            else:
                st.success(f"🟢 Estimated room for ~{est_positions} additional positions")
                st.caption("Based on 5% risk contribution per position")
            
            # New position simulator
            st.markdown("---")
            st.markdown("##### 🆕 New Position Impact Simulator")
            
            new_size = st.slider("Position Size (% of portfolio)", 1.0, 20.0, 5.0, 0.5) / 100
            new_vol = st.slider("Expected Volatility (%)", 10.0, 100.0, 30.0, 5.0) / 100
            correlation = st.slider("Correlation with Portfolio", -1.0, 1.0, 0.5, 0.1)
            
            if st.button("📊 Assess Impact"):
                impact = monitor.assess_new_position_impact(
                    current_var,
                    new_size,
                    new_vol,
                    correlation
                )
                
                if impact:
                    st.markdown("**Impact Assessment:**")
                    
                    st.metric(
                        "New Portfolio VaR",
                        f"{impact.get('estimated_new_var', 0)*100:.2f}%",
                        delta=f"{impact.get('risk_increase_pct', 0):+.1f}%"
                    )
                    
                    st.metric(
                        "New Utilization",
                        f"{impact.get('new_utilization_pct', 0):.1f}%"
                    )
                    
                    recommendation = impact.get('recommendation', '')
                    approved = impact.get('approved', False)
                    
                    if approved:
                        if 'CAUTION' in recommendation:
                            st.warning(f"🟡 {recommendation}")
                        else:
                            st.success(f"✅ {recommendation}")
                    else:
                        st.error(f"🔴 {recommendation}")
    
    with tab4:
        st.markdown("### 📋 Comprehensive Risk Report")
        
        report = monitor.generate_risk_report(portfolio_returns, enhanced_df)
        
        if report:
            st.markdown("#### Executive Summary")
            
            summary = report.get('summary', {})
            
            col1, col2, col3, col4 = st.columns(4)
            
            with col1:
                st.metric("Overall Status", summary.get('status', 'UNKNOWN'))
            with col2:
                st.metric("Risk Used", f"{summary.get('risk_used_pct', 0):.1f}%")
            with col3:
                st.metric("Leverage", f"{summary.get('leverage', 1.0):.2f}x")
            with col4:
                high_alerts = summary.get('high_priority_alerts', 0)
                st.metric("High Priority Alerts", high_alerts)
            
            # Detailed metrics
            st.markdown("---")
            st.markdown("#### Detailed Risk Metrics")
            
            risk_metrics = report.get('risk_metrics', {})
            
            metrics_data = {
                'Metric': [],
                'Value': []
            }
            
            for key, value in risk_metrics.items():
                if value is not None:
                    metrics_data['Metric'].append(key.replace('_', ' ').title())
                    
                    if isinstance(value, float):
                        if 'ratio' in key or 'sharpe' in key or 'sortino' in key:
                            metrics_data['Value'].append(f"{value:.3f}")
                        else:
                            metrics_data['Value'].append(f"{value*100:.2f}%")
                    else:
                        metrics_data['Value'].append(str(value))
            
            if metrics_data['Metric']:
                metrics_df = pd.DataFrame(metrics_data)
                st.dataframe(metrics_df, use_container_width=True, hide_index=True)
            
            # Export report
            st.markdown("---")
            
            if st.button("📥 Export Full Report (JSON)"):
                import json
                report_json = json.dumps(report, indent=2, default=str)
                st.download_button(
                    label="Download Report",
                    data=report_json,
                    file_name=f"risk_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                    mime="application/json"
                )
        else:
            st.info("Unable to generate comprehensive report")
    
    logger.info("Risk Dashboard page rendered successfully")
