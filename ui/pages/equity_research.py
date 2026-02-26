"""
ATLAS Terminal - Equity Research Dashboard (Module 1)
=====================================================
Buy-side equity research workstation with company intelligence,
financial analysis, valuation engine, risk view, and investment
thesis tracking.  ATLAS Terminal v11.0.
"""
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import yfinance as yf
from datetime import datetime, timedelta

from app.config import COLORS, CHART_THEME
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


# =============================================================================
# CONSTANTS
# =============================================================================

COLOR_POS = '#10b981'
COLOR_NEG = '#ef4444'
COLOR_NEUTRAL = 'rgba(255,255,255,0.52)'
COLOR_ACCENT = '#6366f1'
COLOR_TEAL = '#14b8a6'

THESIS_COLORS = {
    'on_track': '#10b981',
    'watch': '#f59e0b',
    'drift': '#ef4444',
    'broken': '#991b1b',
}


# =============================================================================
# CHART HELPERS
# =============================================================================

def _apply_atlas_theme(fig: go.Figure) -> go.Figure:
    """Apply the standard ATLAS dark glassmorphism theme to a plotly figure."""
    fig.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='rgba(255,255,255,0.52)', family='DM Sans, sans-serif', size=11),
        xaxis=dict(gridcolor='rgba(255,255,255,0.05)', linecolor='rgba(255,255,255,0.07)'),
        yaxis=dict(gridcolor='rgba(255,255,255,0.05)', linecolor='rgba(255,255,255,0.07)'),
        margin=dict(l=40, r=20, t=40, b=40),
        legend=dict(
            bgcolor='rgba(255,255,255,0.04)',
            bordercolor='rgba(255,255,255,0.07)',
            borderwidth=1,
        ),
    )
    return fig


def _glass_card(label: str, value: str, sub: str = "", color: str = "") -> str:
    """Return HTML for a glassmorphic metric card."""
    value_color = color if color else 'rgba(255,255,255,0.92)'
    sub_html = f'<div style="font-size: 12px; color: {COLOR_NEUTRAL}; margin-top: 4px;">{sub}</div>' if sub else ''
    return f'''
<div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 12px; padding: 20px; margin-bottom: 16px;">
    <div style="font-size: 11px; color: rgba(255,255,255,0.52); text-transform: uppercase;
                letter-spacing: 1px; margin-bottom: 8px;">{label}</div>
    <div style="font-size: 24px; font-weight: 600; color: {value_color};">{value}</div>
    {sub_html}
</div>'''


def _mini_card(label: str, value: str, color: str = "") -> str:
    """Smaller card for secondary metrics."""
    value_color = color if color else 'rgba(255,255,255,0.92)'
    return f'''
<div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 10px; padding: 14px; margin-bottom: 10px;">
    <div style="font-size: 10px; color: rgba(255,255,255,0.42); text-transform: uppercase;
                letter-spacing: 0.8px; margin-bottom: 4px;">{label}</div>
    <div style="font-size: 18px; font-weight: 600; color: {value_color};">{value}</div>
</div>'''


def _color_for_value(val: float) -> str:
    """Return green/red colour string depending on sign."""
    if val > 0:
        return COLOR_POS
    elif val < 0:
        return COLOR_NEG
    return COLOR_NEUTRAL


# =============================================================================
# DATA FETCHING (cached)
# =============================================================================

@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_company_data(ticker: str) -> dict:
    """Fetch comprehensive company data from yfinance."""
    tk = yf.Ticker(ticker)
    info = tk.info or {}

    # Price history for return calculations
    hist = tk.history(period='1y')
    if hist.empty:
        raise ValueError(f"No price data found for {ticker}")

    current_price = hist['Close'].iloc[-1]

    # Return calculations
    def _safe_return(days):
        if len(hist) > days:
            return (current_price / hist['Close'].iloc[-days] - 1) * 100
        return None

    ret_1d = _safe_return(2)   # previous trading day
    ret_1w = _safe_return(5)
    ret_1m = _safe_return(21)
    ret_3m = _safe_return(63)
    ret_1y = _safe_return(252) if len(hist) >= 252 else _safe_return(len(hist))

    # 52-week range
    high_52 = hist['Close'].max()
    low_52 = hist['Close'].min()

    # Volatility
    daily_returns = hist['Close'].pct_change().dropna()
    vol_30d = daily_returns.tail(30).std() * np.sqrt(252) * 100 if len(daily_returns) >= 30 else None
    vol_90d = daily_returns.tail(90).std() * np.sqrt(252) * 100 if len(daily_returns) >= 90 else None

    # Drawdown from peak
    running_max = hist['Close'].cummax()
    drawdown = ((hist['Close'] - running_max) / running_max * 100).iloc[-1]

    return {
        'info': info,
        'current_price': current_price,
        'returns': {'1D': ret_1d, '1W': ret_1w, '1M': ret_1m, '3M': ret_3m, '1Y': ret_1y},
        'high_52': high_52,
        'low_52': low_52,
        'market_cap': info.get('marketCap'),
        'sector': info.get('sector', 'N/A'),
        'industry': info.get('industry', 'N/A'),
        'company_name': info.get('shortName', ticker),
        'vol_30d': vol_30d,
        'vol_90d': vol_90d,
        'drawdown': drawdown,
        'hist': hist,
        'daily_returns': daily_returns,
    }


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_financials(ticker: str) -> dict:
    """Fetch financial statements from yfinance."""
    tk = yf.Ticker(ticker)
    return {
        'income': tk.financials,
        'balance': tk.balance_sheet,
        'cashflow': tk.cashflow,
        'quarterly_income': tk.quarterly_financials,
        'quarterly_balance': tk.quarterly_balance_sheet,
        'quarterly_cashflow': tk.quarterly_cashflow,
    }


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_spy_returns(period: str = '1y') -> pd.Series:
    """Fetch SPY returns for beta calculation."""
    spy = yf.Ticker('SPY')
    hist = spy.history(period=period)
    return hist['Close'].pct_change().dropna()


# =============================================================================
# SECTION RENDERERS
# =============================================================================

def _render_header_strip(data: dict, ticker: str) -> None:
    """Full-width company header with all key stats in one horizontal band."""

    info = data['info']
    price = data['current_price']
    mc = data.get('market_cap')
    low52 = data.get('low_52', 0)
    high52 = data.get('high_52', 0)
    dd = data.get('drawdown', 0)
    v30 = data.get('vol_30d')
    v90 = data.get('vol_90d')
    returns = data.get('returns', {})

    # ── helpers ──────────────────────────────────────────────
    def _stat_chip(label: str, value: str, color: str = "rgba(255,255,255,0.88)") -> str:
        return (
            f'<div style="display:flex;flex-direction:column;align-items:center;'
            f'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);'
            f'border-radius:10px;padding:10px 14px;min-width:72px;">'
            f'<span style="font-size:9.5px;color:rgba(255,255,255,0.38);text-transform:uppercase;'
            f'letter-spacing:0.8px;margin-bottom:5px;">{label}</span>'
            f'<span style="font-size:15px;font-weight:600;color:{color};">{value}</span>'
            f'</div>'
        )

    def _ret_chip(label: str, val) -> str:
        if val is None:
            return _stat_chip(label, "N/A")
        c = COLOR_POS if val > 0 else (COLOR_NEG if val < 0 else COLOR_NEUTRAL)
        return _stat_chip(label, f"{val:+.2f}%", c)

    def _fmt_price(v):
        if v is None: return "N/A"
        return f"${v:,.2f}" if v < 1000 else f"${v:,.0f}"

    def _fmt_large(v):
        if not v: return "N/A"
        if v >= 1e12: return f"${v/1e12:.2f}T"
        if v >= 1e9:  return f"${v/1e9:.1f}B"
        if v >= 1e6:  return f"${v/1e6:.1f}M"
        return f"${v:,.0f}"

    pct_of_range = ((price - low52) / (high52 - low52) * 100) if high52 != low52 else 50
    range_str = f"{_fmt_price(low52)} – {_fmt_price(high52)}"
    dd_color = COLOR_NEG if dd < -10 else ("#f59e0b" if dd < -3 else COLOR_POS)
    mc_str = _fmt_large(mc)

    # ── thesis toggle button state ────────────────────────────
    thesis_open = st.session_state.get('eq_thesis_open', False)
    btn_label = "📋 Thesis ✕" if thesis_open else "📋 Thesis ▶"
    btn_bg = "rgba(99,102,241,0.20)" if thesis_open else "rgba(255,255,255,0.06)"

    # ── company nameplate ─────────────────────────────────────
    sector = data.get('sector', '')
    industry = data.get('industry', '')
    company_name = data.get('company_name', ticker)
    exchange = info.get('exchange', '')
    currency = info.get('currency', 'USD')

    st.markdown(f"""
<style>
.atlas-header-strip {{
  background: linear-gradient(135deg, rgba(10,12,30,0.95) 0%, rgba(15,18,40,0.92) 100%);
  border: 1px solid rgba(99,102,241,0.18);
  border-radius: 16px;
  padding: 18px 20px 14px;
  margin-bottom: 18px;
  position: relative;
  overflow: hidden;
}}
.atlas-header-strip::before {{
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, {COLOR_ACCENT} 0%, {COLOR_TEAL} 60%, transparent 100%);
}}
.atlas-thesis-btn {{
  position: absolute;
  top: 16px; right: 16px;
  background: {btn_bg};
  border: 1px solid rgba(99,102,241,0.3);
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 12px;
  color: rgba(255,255,255,0.78);
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  letter-spacing: 0.3px;
  transition: background 0.2s;
}}
.atlas-stats-row {{
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}}
.atlas-divider {{
  width: 1px;
  background: rgba(255,255,255,0.08);
  align-self: stretch;
  margin: 0 4px;
}}
</style>
<div class="atlas-header-strip">
  <!-- Company identity -->
  <div style="display:flex;align-items:baseline;gap:10px;padding-right:120px;">
    <span style="font-size:22px;font-weight:700;color:rgba(255,255,255,0.92);">{company_name}</span>
    <span style="font-size:17px;font-weight:600;color:{COLOR_ACCENT};">({ticker})</span>
    <span style="font-size:12px;color:rgba(255,255,255,0.38);">{exchange} &middot; {currency}</span>
  </div>
  <div style="font-size:12px;color:rgba(255,255,255,0.42);margin-top:3px;">
    {sector}{' &middot; ' + industry if industry else ''}
  </div>

  <!-- Stats row -->
  <div class="atlas-stats-row">
    {_stat_chip("Price", _fmt_price(price))}
    {_stat_chip("Mkt Cap", mc_str)}
    {_stat_chip("52W Range", range_str, "rgba(255,255,255,0.72)")}
    {_stat_chip("Range %", f"{pct_of_range:.0f}%", "rgba(255,255,255,0.62)")}
    {_stat_chip("Drawdown", f"{dd:.1f}%", dd_color)}
    <div class="atlas-divider"></div>
    {_ret_chip("1D", returns.get("1D"))}
    {_ret_chip("1W", returns.get("1W"))}
    {_ret_chip("1M", returns.get("1M"))}
    {_ret_chip("3M", returns.get("3M"))}
    {_ret_chip("1Y", returns.get("1Y"))}
    <div class="atlas-divider"></div>
    {_stat_chip("Vol 30D", f"{v30:.1f}%" if v30 else "N/A", "rgba(255,255,255,0.6)")}
    {_stat_chip("Vol 90D", f"{v90:.1f}%" if v90 else "N/A", "rgba(255,255,255,0.6)")}
  </div>
</div>
""", unsafe_allow_html=True)

    # Thesis toggle button — outside the html block so Streamlit handles the click
    _, btn_col = st.columns([10, 1.5])
    with btn_col:
        if st.button(btn_label, key='eq_thesis_toggle', use_container_width=True):
            st.session_state['eq_thesis_open'] = not thesis_open
            st.rerun()


def _render_thesis_drawer(ticker: str) -> None:
    """Renders the thesis engine inside the collapsible right drawer panel."""
    st.markdown("""
<div style="background:rgba(99,102,241,0.06);border-left:2px solid rgba(99,102,241,0.35);
            border-radius:0 12px 12px 0;padding:12px 14px 6px;margin-bottom:12px;">
  <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.82);
               letter-spacing:0.5px;text-transform:uppercase;">Investment Thesis</span>
</div>
""", unsafe_allow_html=True)
    _render_thesis_engine(ticker)



# ---------------------------------------------------------------------------
# Financial Analysis Engine
# ---------------------------------------------------------------------------

def _render_financial_tables(fin: dict, ticker: str):
    """Render financial statement tables with YoY deltas and margin/return charts."""

    tab_is, tab_bs, tab_cf, tab_margins, tab_returns = st.tabs([
        'Income Statement', 'Balance Sheet', 'Cash Flow', 'Margins', 'Returns'
    ])

    # ---- helper to build normalised table with YoY delta ----
    def _normalised_table(df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()
        # Sort columns chronologically
        df = df.sort_index(axis=1)
        out = df.copy()
        # Add YoY delta columns
        cols = list(out.columns)
        if len(cols) >= 2:
            latest = cols[-1]
            prev = cols[-2]
            delta_col_name = 'YoY Delta'
            mask = out[prev] != 0
            out[delta_col_name] = np.where(
                mask,
                ((out[latest] - out[prev]) / out[prev].abs()) * 100,
                np.nan,
            )
        return out

    def _show_financial_df(df: pd.DataFrame, label: str):
        if df is None or df.empty:
            st.warning(f"No {label} data available for {ticker}.")
            return
        table = _normalised_table(df)
        # Format column headers
        renamed = {}
        for c in table.columns:
            if isinstance(c, pd.Timestamp):
                renamed[c] = c.strftime('FY %Y')
        table = table.rename(columns=renamed)
        # Format numbers
        for c in table.columns:
            if c == 'YoY Delta':
                table[c] = table[c].apply(lambda v: f"{v:+.1f}%" if pd.notna(v) else '')
            else:
                table[c] = table[c].apply(lambda v: format_large_number(v, '$') if pd.notna(v) else '')
        st.dataframe(table, use_container_width=True)

    with tab_is:
        st.markdown('##### Annual Income Statement')
        _show_financial_df(fin.get('income'), 'income statement')

    with tab_bs:
        st.markdown('##### Annual Balance Sheet')
        _show_financial_df(fin.get('balance'), 'balance sheet')

    with tab_cf:
        st.markdown('##### Annual Cash Flow')
        _show_financial_df(fin.get('cashflow'), 'cash flow')

    # ---- Margin Cascade ----
    with tab_margins:
        st.markdown('##### Margin Cascade')
        income = fin.get('income')
        if income is not None and not income.empty:
            income_sorted = income.sort_index(axis=1)
            cols_chrono = list(income_sorted.columns)

            margin_data = {}
            for col in cols_chrono:
                year_label = col.strftime('FY %Y') if isinstance(col, pd.Timestamp) else str(col)
                revenue = income_sorted.at['Total Revenue', col] if 'Total Revenue' in income_sorted.index else None
                if revenue and revenue != 0:
                    gross = income_sorted.at['Gross Profit', col] if 'Gross Profit' in income_sorted.index else None
                    ebitda = income_sorted.at['EBITDA', col] if 'EBITDA' in income_sorted.index else None
                    ebit = income_sorted.at['EBIT', col] if 'EBIT' in income_sorted.index else None
                    net = income_sorted.at['Net Income', col] if 'Net Income' in income_sorted.index else None

                    margin_data[year_label] = {
                        'Gross': (gross / revenue * 100) if gross else None,
                        'EBITDA': (ebitda / revenue * 100) if ebitda else None,
                        'EBIT': (ebit / revenue * 100) if ebit else None,
                        'Net': (net / revenue * 100) if net else None,
                    }

            if margin_data:
                mdf = pd.DataFrame(margin_data).T
                fig = go.Figure()
                margin_colors = {'Gross': COLOR_TEAL, 'EBITDA': COLOR_ACCENT, 'EBIT': '#8b5cf6', 'Net': COLOR_POS}
                for margin_type in ['Gross', 'EBITDA', 'EBIT', 'Net']:
                    if margin_type in mdf.columns:
                        fig.add_trace(go.Scatter(
                            x=mdf.index, y=mdf[margin_type],
                            mode='lines+markers', name=f'{margin_type} Margin',
                            line=dict(color=margin_colors.get(margin_type, COLOR_NEUTRAL), width=2),
                            marker=dict(size=6),
                        ))
                fig.update_layout(
                    title='Margin Cascade Trend',
                    yaxis_title='Margin (%)',
                    height=400,
                )
                _apply_atlas_theme(fig)
                st.plotly_chart(fig, use_container_width=True)

                # Margin table
                mdf_display = mdf.copy()
                for c in mdf_display.columns:
                    mdf_display[c] = mdf_display[c].apply(lambda v: f"{v:.1f}%" if pd.notna(v) else 'N/A')
                st.dataframe(mdf_display, use_container_width=True)
            else:
                st.warning("Could not compute margins from income statement data.")
        else:
            st.warning(f"No income statement data available for {ticker}.")

    # ---- Return Decomposition ----
    with tab_returns:
        st.markdown('##### Return Decomposition')
        income = fin.get('income')
        balance = fin.get('balance')
        if income is not None and not income.empty and balance is not None and not balance.empty:
            income_sorted = income.sort_index(axis=1)
            balance_sorted = balance.sort_index(axis=1)
            common_years = sorted(set(income_sorted.columns) & set(balance_sorted.columns))

            return_data = {}
            for col in common_years:
                year_label = col.strftime('FY %Y') if isinstance(col, pd.Timestamp) else str(col)
                net_income = income_sorted.at['Net Income', col] if 'Net Income' in income_sorted.index else None
                total_equity = balance_sorted.at['Stockholders Equity', col] if 'Stockholders Equity' in balance_sorted.index else None
                total_assets = balance_sorted.at['Total Assets', col] if 'Total Assets' in balance_sorted.index else None

                # EBIT for ROIC
                ebit = income_sorted.at['EBIT', col] if 'EBIT' in income_sorted.index else None
                total_debt = balance_sorted.at['Total Debt', col] if 'Total Debt' in balance_sorted.index else None
                cash = None
                for cash_key in ['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments']:
                    if cash_key in balance_sorted.index:
                        cash = balance_sorted.at[cash_key, col]
                        break

                roe = (net_income / total_equity * 100) if (net_income and total_equity and total_equity != 0) else None
                roa = (net_income / total_assets * 100) if (net_income and total_assets and total_assets != 0) else None

                # ROIC = EBIT * (1 - tax) / invested capital
                invested_capital = None
                if total_equity is not None and total_debt is not None:
                    ic = total_equity + total_debt
                    if cash is not None:
                        ic -= cash
                    invested_capital = ic if ic != 0 else None
                roic = (ebit * 0.75 / invested_capital * 100) if (ebit and invested_capital) else None

                return_data[year_label] = {'ROE': roe, 'ROA': roa, 'ROIC': roic}

            if return_data:
                rdf = pd.DataFrame(return_data).T
                fig = go.Figure()
                ret_colors = {'ROE': COLOR_POS, 'ROA': COLOR_ACCENT, 'ROIC': COLOR_TEAL}
                for metric in ['ROIC', 'ROE', 'ROA']:
                    if metric in rdf.columns:
                        fig.add_trace(go.Scatter(
                            x=rdf.index, y=rdf[metric],
                            mode='lines+markers', name=metric,
                            line=dict(color=ret_colors.get(metric, COLOR_NEUTRAL), width=2),
                            marker=dict(size=6),
                        ))
                fig.update_layout(title='Return Decomposition Trend', yaxis_title='Return (%)', height=400)
                _apply_atlas_theme(fig)
                st.plotly_chart(fig, use_container_width=True)

                rdf_display = rdf.copy()
                for c in rdf_display.columns:
                    rdf_display[c] = rdf_display[c].apply(lambda v: f"{v:.1f}%" if pd.notna(v) else 'N/A')
                st.dataframe(rdf_display, use_container_width=True)
            else:
                st.warning("Insufficient data to compute return metrics.")
        else:
            st.warning(f"Income statement or balance sheet data unavailable for {ticker}.")


# ---------------------------------------------------------------------------
# Valuation Engine
# ---------------------------------------------------------------------------

def _render_valuation_engine(data: dict, fin: dict, ticker: str):
    """Render relative valuation, historical bands, and reverse DCF."""
    info = data['info']

    val_tab1, val_tab2, val_tab3 = st.tabs(['Relative Valuation', 'Historical Bands', 'Reverse DCF'])

    with val_tab1:
        st.markdown('##### Relative Valuation Multiples')
        pe = info.get('trailingPE')
        fwd_pe = info.get('forwardPE')
        ev_ebitda = info.get('enterpriseToEbitda')
        pb = info.get('priceToBook')
        ps = info.get('priceToSalesTrailing12Months')

        # P/FCF
        fcf = info.get('freeCashflow')
        mcap = info.get('marketCap')
        p_fcf = (mcap / fcf) if (fcf and mcap and fcf > 0) else None

        multiples = {
            'Trailing P/E': pe,
            'Forward P/E': fwd_pe,
            'EV/EBITDA': ev_ebitda,
            'P/B': pb,
            'P/S': ps,
            'P/FCF': p_fcf,
        }

        mc1, mc2, mc3 = st.columns(3)
        items = list(multiples.items())
        for i, col in enumerate([mc1, mc2, mc3]):
            with col:
                for label, val in items[i * 2:(i + 1) * 2]:
                    v_str = f"{val:.1f}x" if val is not None else 'N/A'
                    st.markdown(_mini_card(label, v_str), unsafe_allow_html=True)

    with val_tab2:
        st.markdown('##### Historical P/E Bands')
        try:
            hist = data['hist']
            # We need EPS to compute historical PE. Use trailing EPS from info.
            trailing_eps = info.get('trailingEps')
            if trailing_eps and trailing_eps > 0 and len(hist) > 60:
                pe_series = hist['Close'] / trailing_eps
                mean_pe = pe_series.mean()
                std_pe = pe_series.std()

                fig = go.Figure()
                fig.add_trace(go.Scatter(
                    x=pe_series.index, y=pe_series.values,
                    mode='lines', name='Trailing P/E',
                    line=dict(color=COLOR_ACCENT, width=2),
                ))
                fig.add_hline(y=mean_pe, line_dash='dash',
                              line_color=COLOR_NEUTRAL,
                              annotation_text=f'Mean {mean_pe:.1f}x',
                              annotation_font_color=COLOR_NEUTRAL)
                # +/- 1 sigma bands
                fig.add_hrect(y0=mean_pe - std_pe, y1=mean_pe + std_pe,
                              fillcolor='rgba(99,102,241,0.08)', line_width=0,
                              annotation_text='+/- 1 sigma', annotation_font_color=COLOR_NEUTRAL)
                # +/- 2 sigma bands
                fig.add_hrect(y0=mean_pe - 2 * std_pe, y1=mean_pe - std_pe,
                              fillcolor='rgba(99,102,241,0.04)', line_width=0)
                fig.add_hrect(y0=mean_pe + std_pe, y1=mean_pe + 2 * std_pe,
                              fillcolor='rgba(99,102,241,0.04)', line_width=0)

                fig.update_layout(
                    title=f'{ticker} — Rolling P/E with Statistical Bands',
                    yaxis_title='P/E Ratio',
                    height=400,
                )
                _apply_atlas_theme(fig)
                st.plotly_chart(fig, use_container_width=True)

                # Summary stats
                sc1, sc2, sc3, sc4 = st.columns(4)
                with sc1:
                    st.markdown(_mini_card('Current P/E', f"{pe_series.iloc[-1]:.1f}x"), unsafe_allow_html=True)
                with sc2:
                    st.markdown(_mini_card('Mean P/E', f"{mean_pe:.1f}x"), unsafe_allow_html=True)
                with sc3:
                    st.markdown(_mini_card('-1 Sigma', f"{mean_pe - std_pe:.1f}x"), unsafe_allow_html=True)
                with sc4:
                    st.markdown(_mini_card('+1 Sigma', f"{mean_pe + std_pe:.1f}x"), unsafe_allow_html=True)
            else:
                st.warning("Insufficient EPS data to compute historical P/E bands.")
        except Exception as e:
            st.warning(f"Could not compute historical valuation bands: {e}")

    with val_tab3:
        st.markdown('##### Reverse DCF — Implied Growth')
        st.markdown(f'''
<div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 12px; padding: 20px; margin-bottom: 16px;">
    <div style="font-size: 11px; color: rgba(255,255,255,0.52); text-transform: uppercase;
                letter-spacing: 1px; margin-bottom: 8px;">WHAT THE MARKET IS PRICING IN</div>
    <div style="font-size: 14px; color: rgba(255,255,255,0.72); line-height: 1.6;">
        The reverse DCF works backwards from the current price to determine what growth rate
        the market is implicitly assuming. This helps evaluate whether current expectations
        are reasonable relative to the company's historical performance and competitive position.
    </div>
</div>''', unsafe_allow_html=True)

        try:
            fcf = info.get('freeCashflow')
            shares = info.get('sharesOutstanding')
            price = data['current_price']
            if fcf and shares and shares > 0 and fcf > 0:
                wacc_input = st.slider('WACC Assumption (%)', 6.0, 15.0, 10.0, 0.5, key='rdcf_wacc')
                terminal_g = st.slider('Terminal Growth (%)', 1.0, 4.0, 2.5, 0.5, key='rdcf_tg')

                wacc = wacc_input / 100
                tg = terminal_g / 100
                target_ev = price * shares

                # Back-solve for growth rate
                # Simple 10-year DCF inversion
                best_g = None
                for g_test in np.arange(-0.10, 0.40, 0.005):
                    pv = 0
                    proj_fcf = fcf
                    for yr in range(1, 11):
                        proj_fcf *= (1 + g_test)
                        pv += proj_fcf / (1 + wacc) ** yr
                    # Terminal value
                    tv = proj_fcf * (1 + tg) / (wacc - tg) if wacc > tg else 0
                    pv += tv / (1 + wacc) ** 10
                    if pv >= target_ev:
                        best_g = g_test
                        break

                if best_g is not None:
                    g_color = COLOR_POS if best_g < 0.15 else ('#f59e0b' if best_g < 0.25 else COLOR_NEG)
                    st.markdown(_glass_card(
                        'Implied FCF Growth Rate',
                        f"{best_g * 100:.1f}%",
                        sub=f"At WACC {wacc_input:.1f}% and terminal growth {terminal_g:.1f}%",
                        color=g_color,
                    ), unsafe_allow_html=True)
                else:
                    st.info("Implied growth exceeds 40% — price may embed optionality not captured by a simple DCF.")
            else:
                st.info("Free cash flow or share data unavailable for reverse DCF analysis.")
        except Exception as e:
            st.warning(f"Reverse DCF calculation error: {e}")


# ---------------------------------------------------------------------------
# Risk View
# ---------------------------------------------------------------------------

def _render_risk_view(data: dict, ticker: str):
    """Render beta, factor exposures, and earnings revision direction."""

    r1, r2 = st.columns(2)

    with r1:
        st.markdown('##### Beta vs SPY')
        try:
            spy_returns = _fetch_spy_returns('1y')
            stock_returns = data['daily_returns']
            # Align dates
            common = spy_returns.index.intersection(stock_returns.index)
            if len(common) >= 60:
                sr = stock_returns.loc[common].values
                mr = spy_returns.loc[common].values
                beta = np.cov(sr, mr)[0, 1] / np.var(mr)
                correlation = np.corrcoef(sr, mr)[0, 1]

                beta_color = COLOR_NEUTRAL
                if beta > 1.2:
                    beta_color = COLOR_NEG
                elif beta < 0.8:
                    beta_color = COLOR_TEAL

                st.markdown(_glass_card('Beta (1Y vs SPY)', f"{beta:.2f}", color=beta_color), unsafe_allow_html=True)
                st.markdown(_mini_card('Correlation', f"{correlation:.2f}"), unsafe_allow_html=True)

                # Scatter plot
                fig = go.Figure()
                fig.add_trace(go.Scatter(
                    x=mr * 100, y=sr * 100,
                    mode='markers', name='Daily Returns',
                    marker=dict(color=COLOR_ACCENT, size=4, opacity=0.5),
                ))
                # Regression line
                z = np.polyfit(mr, sr, 1)
                p = np.poly1d(z)
                mr_range = np.linspace(mr.min(), mr.max(), 50)
                fig.add_trace(go.Scatter(
                    x=mr_range * 100, y=p(mr_range) * 100,
                    mode='lines', name=f'Beta = {beta:.2f}',
                    line=dict(color=COLOR_POS, width=2, dash='dash'),
                ))
                fig.update_layout(
                    title=f'{ticker} vs SPY — Return Scatter',
                    xaxis_title='SPY Return (%)',
                    yaxis_title=f'{ticker} Return (%)',
                    height=350,
                )
                _apply_atlas_theme(fig)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("Insufficient overlapping data for beta calculation.")
        except Exception as e:
            st.warning(f"Beta calculation error: {e}")

    with r2:
        st.markdown('##### Factor Exposures')
        try:
            from services.factor_model import FactorModelService, FACTOR_LABELS, FACTOR_COLORS
            fm = FactorModelService()
            exposures = fm.calculate_factor_exposures(ticker, period='1y')
            if exposures and exposures.get('betas'):
                betas = exposures['betas']
                factors = list(betas.keys())
                values = [betas[f] for f in factors]
                labels = [FACTOR_LABELS.get(f, f) for f in factors]
                colors = [FACTOR_COLORS.get(f, COLOR_ACCENT) for f in factors]

                fig = go.Figure(go.Bar(
                    x=values, y=labels, orientation='h',
                    marker=dict(color=colors),
                    text=[f"{v:.2f}" for v in values],
                    textposition='outside',
                    textfont=dict(color=COLOR_NEUTRAL, size=10),
                ))
                fig.update_layout(
                    title='Factor Exposures (Beta)',
                    xaxis_title='Beta',
                    height=350,
                )
                _apply_atlas_theme(fig)
                st.plotly_chart(fig, use_container_width=True)

                st.markdown(_mini_card('R-squared', f"{exposures['r_squared']:.2f}"), unsafe_allow_html=True)
                if exposures.get('alpha') is not None:
                    alpha_color = _color_for_value(exposures['alpha'])
                    st.markdown(_mini_card('Annualised Alpha', f"{exposures['alpha']:.2f}%", color=alpha_color), unsafe_allow_html=True)
            else:
                st.info("Factor exposure calculation returned no results. Ensure sufficient price history exists.")
        except ImportError:
            st.info("Factor model service not available. Install required dependencies.")
        except Exception as e:
            st.warning(f"Factor exposure error: {e}")

    # Earnings revision direction
    st.markdown('##### Earnings Revision Indicator')
    try:
        info = data['info']
        fwd_pe = info.get('forwardPE')
        trail_pe = info.get('trailingPE')
        if fwd_pe and trail_pe and fwd_pe > 0 and trail_pe > 0:
            ratio = trail_pe / fwd_pe
            if ratio > 1.1:
                direction = 'POSITIVE'
                dir_color = COLOR_POS
                desc = 'Forward earnings estimates exceed trailing — analysts expect growth.'
            elif ratio < 0.9:
                direction = 'NEGATIVE'
                dir_color = COLOR_NEG
                desc = 'Forward P/E higher than trailing — analysts may be cutting estimates.'
            else:
                direction = 'STABLE'
                dir_color = COLOR_NEUTRAL
                desc = 'Forward and trailing earnings roughly aligned.'

            st.markdown(f'''
<div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 12px; padding: 20px; margin-bottom: 16px; display: flex; align-items: center; gap: 20px;">
    <div style="font-size: 28px; font-weight: 700; color: {dir_color};">{direction}</div>
    <div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.52);">Trailing P/E: {trail_pe:.1f}x &middot; Forward P/E: {fwd_pe:.1f}x</div>
        <div style="font-size: 13px; color: rgba(255,255,255,0.72); margin-top: 4px;">{desc}</div>
    </div>
</div>''', unsafe_allow_html=True)
        else:
            st.info("P/E data unavailable for earnings revision analysis.")
    except Exception as e:
        st.warning(f"Earnings revision indicator error: {e}")


# ---------------------------------------------------------------------------
# Investment Thesis Engine (right column)
# ---------------------------------------------------------------------------

def _render_thesis_engine(ticker: str):
    """Render the investment thesis panel for a given ticker."""
    try:
        from services.thesis_engine import (
            ThesisStore, ThesisEvaluator, thesis_store,
            InvestmentThesis, ThesisAssumption, ThesisStatus,
            THESIS_STATUS_CONFIG, create_default_thesis,
        )
    except ImportError:
        st.warning("Thesis engine service is not available.")
        return

    st.markdown(f'''
<div style="font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.92); margin-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 8px;">
    Investment Thesis
</div>''', unsafe_allow_html=True)

    # Load existing thesis or create new
    thesis = thesis_store.load_thesis(ticker)

    if thesis is None:
        st.info(f"No thesis found for {ticker}.")
        if st.button("Create New Thesis", key=f'create_thesis_{ticker}', use_container_width=True):
            new_thesis = create_default_thesis(ticker)
            thesis_store.save_thesis(new_thesis)
            st.rerun()
        return

    # ---- Overall Status Banner ----
    overall = ThesisStatus(thesis.overall_status) if thesis.overall_status else ThesisStatus.ON_TRACK
    cfg = THESIS_STATUS_CONFIG.get(overall, THESIS_STATUS_CONFIG[ThesisStatus.ON_TRACK])
    st.markdown(f'''
<div style="background: rgba(255,255,255,0.035); border: 1px solid {cfg['color']}33;
            border-radius: 10px; padding: 14px; margin-bottom: 12px;
            border-left: 3px solid {cfg['color']};">
    <div style="font-size: 10px; color: rgba(255,255,255,0.42); text-transform: uppercase;
                letter-spacing: 0.8px;">THESIS STATUS</div>
    <div style="font-size: 18px; font-weight: 600; color: {cfg['color']}; margin-top: 4px;">
        {cfg['icon']}  {cfg['label'].upper()}
    </div>
    <div style="font-size: 11px; color: rgba(255,255,255,0.52); margin-top: 4px;">{cfg['description']}</div>
</div>''', unsafe_allow_html=True)

    # ---- Thesis metadata ----
    with st.expander("Thesis Details", expanded=False):
        new_title = st.text_input("Title", value=thesis.title, key='thesis_title')
        new_conviction = st.selectbox("Conviction", ['low', 'medium', 'high'],
                                       index=['low', 'medium', 'high'].index(thesis.conviction),
                                       key='thesis_conviction')
        new_direction = st.selectbox("Direction", ['long', 'short'],
                                      index=['long', 'short'].index(thesis.direction),
                                      key='thesis_direction')
        new_narrative = st.text_area("Narrative", value=thesis.narrative, height=100, key='thesis_narrative')

        e1, e2, e3 = st.columns(3)
        with e1:
            new_entry = st.number_input("Entry Price", value=thesis.entry_price or 0.0, format="%.2f", key='thesis_entry')
        with e2:
            new_target = st.number_input("Target Price", value=thesis.target_price or 0.0, format="%.2f", key='thesis_target')
        with e3:
            new_stop = st.number_input("Stop Loss", value=thesis.stop_loss or 0.0, format="%.2f", key='thesis_stop')

        if st.button("Save Thesis", key='save_thesis_btn', use_container_width=True):
            thesis.title = new_title
            thesis.conviction = new_conviction
            thesis.direction = new_direction
            thesis.narrative = new_narrative
            thesis.entry_price = new_entry if new_entry > 0 else None
            thesis.target_price = new_target if new_target > 0 else None
            thesis.stop_loss = new_stop if new_stop > 0 else None
            thesis_store.save_thesis(thesis)
            st.success("Thesis saved.")

    # ---- Assumptions List ----
    st.markdown(f'''
<div style="font-size: 11px; color: rgba(255,255,255,0.42); text-transform: uppercase;
            letter-spacing: 1px; margin: 16px 0 8px 0;">ASSUMPTIONS ({len(thesis.assumptions)})</div>''', unsafe_allow_html=True)

    evaluator = ThesisEvaluator()
    assumptions_changed = False

    for i, assumption in enumerate(thesis.assumptions):
        a_status = ThesisStatus(assumption.get('status', ThesisStatus.ON_TRACK.value))
        a_cfg = THESIS_STATUS_CONFIG.get(a_status, THESIS_STATUS_CONFIG[ThesisStatus.ON_TRACK])

        st.markdown(f'''
<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 8px; padding: 12px; margin-bottom: 8px;
            border-left: 3px solid {a_cfg['color']};">
    <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 13px; color: rgba(255,255,255,0.82);">{assumption.get('description', '')}</div>
        <div style="font-size: 12px; color: {a_cfg['color']}; font-weight: 600;">{a_cfg['icon']} {a_cfg['label']}</div>
    </div>
    <div style="font-size: 11px; color: rgba(255,255,255,0.42); margin-top: 4px;">
        KPI: {assumption.get('kpi_name', 'N/A')} &middot;
        Target: {assumption.get('target_value', 'N/A')} &middot;
        Tolerance: +/-{assumption.get('tolerance_pct', 10)}%
    </div>
</div>''', unsafe_allow_html=True)

        with st.expander(f"Edit Assumption #{i + 1}", expanded=False):
            new_desc = st.text_input("Description", value=assumption.get('description', ''),
                                      key=f'a_desc_{i}')
            ac1, ac2 = st.columns(2)
            with ac1:
                new_kpi = st.text_input("KPI Name", value=assumption.get('kpi_name', ''),
                                         key=f'a_kpi_{i}')
                new_target_val = st.number_input("Target Value", value=float(assumption.get('target_value', 0)),
                                                  format="%.2f", key=f'a_target_{i}')
            with ac2:
                new_tolerance = st.number_input("Tolerance %", value=float(assumption.get('tolerance_pct', 10)),
                                                 format="%.1f", key=f'a_tol_{i}')
                new_current = st.number_input("Current Value",
                                               value=float(assumption.get('current_value', 0) or 0),
                                               format="%.2f", key=f'a_curr_{i}')

            new_status_options = [s.value for s in ThesisStatus]
            current_status_idx = new_status_options.index(assumption.get('status', ThesisStatus.ON_TRACK.value))
            new_status = st.selectbox("Status Override", new_status_options,
                                       index=current_status_idx, key=f'a_status_{i}')

            if st.button("Update Assumption", key=f'update_a_{i}'):
                thesis.assumptions[i]['description'] = new_desc
                thesis.assumptions[i]['kpi_name'] = new_kpi
                thesis.assumptions[i]['target_value'] = new_target_val
                thesis.assumptions[i]['tolerance_pct'] = new_tolerance
                thesis.assumptions[i]['current_value'] = new_current if new_current != 0 else None
                thesis.assumptions[i]['status'] = new_status
                thesis.assumptions[i]['last_updated'] = datetime.now().isoformat()
                assumptions_changed = True

    # Add new assumption
    with st.expander("Add New Assumption", expanded=False):
        na_desc = st.text_input("Description", key='new_a_desc')
        na1, na2 = st.columns(2)
        with na1:
            na_kpi = st.text_input("KPI Name", key='new_a_kpi')
            na_target = st.number_input("Target Value", value=0.0, format="%.2f", key='new_a_target')
        with na2:
            na_tol = st.number_input("Tolerance %", value=10.0, format="%.1f", key='new_a_tol')
            na_date = st.text_input("Target Date (YYYY-MM-DD)",
                                     value=(datetime.now().replace(year=datetime.now().year + 1)).strftime('%Y-%m-%d'),
                                     key='new_a_date')

        if st.button("Add Assumption", key='add_assumption_btn'):
            if na_desc and na_kpi:
                new_a = {
                    'id': f'a{len(thesis.assumptions) + 1}',
                    'description': na_desc,
                    'kpi_name': na_kpi,
                    'target_value': na_target,
                    'target_date': na_date,
                    'tolerance_pct': na_tol,
                    'current_value': None,
                    'status': ThesisStatus.ON_TRACK.value,
                    'last_updated': None,
                    'notes': '',
                }
                thesis.assumptions.append(new_a)
                assumptions_changed = True
            else:
                st.warning("Description and KPI name are required.")

    # Save if assumptions changed
    if assumptions_changed:
        # Re-evaluate overall status
        thesis.overall_status = evaluator.evaluate_thesis(thesis).value
        thesis_store.save_thesis(thesis)
        st.rerun()

    # ---- Thesis summary stats ----
    st.markdown('<div style="margin-top: 16px;"></div>', unsafe_allow_html=True)
    status_counts = {}
    for a in thesis.assumptions:
        s = a.get('status', ThesisStatus.ON_TRACK.value)
        status_counts[s] = status_counts.get(s, 0) + 1

    summary_parts = []
    for status_val, count in status_counts.items():
        try:
            s_cfg = THESIS_STATUS_CONFIG[ThesisStatus(status_val)]
            summary_parts.append(f'<span style="color: {s_cfg["color"]};">{s_cfg["icon"]} {count} {s_cfg["label"]}</span>')
        except (ValueError, KeyError):
            summary_parts.append(f'{count} Unknown')

    if summary_parts:
        st.markdown(f'''
<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 8px; padding: 10px; font-size: 12px; color: rgba(255,255,255,0.62);">
    {' &nbsp;&middot;&nbsp; '.join(summary_parts)}
</div>''', unsafe_allow_html=True)

    # Delete thesis option
    st.markdown('<div style="margin-top: 12px;"></div>', unsafe_allow_html=True)
    if st.button("Delete Thesis", key='delete_thesis_btn', type='secondary', use_container_width=True):
        thesis_store.delete_thesis(ticker)
        st.success(f"Thesis for {ticker} deleted.")
        st.rerun()


# ---------------------------------------------------------------------------
# Peer Comparison Panel
# ---------------------------------------------------------------------------

# Default peer groups by sector — expandable by user
_PEER_GROUPS = {
    'Technology': ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMZN'],
    'Financials': ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC'],
    'Healthcare': ['JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'UNH'],
    'Consumer Discretionary': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX'],
    'Energy': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY'],
    'Industrials': ['CAT', 'DE', 'HON', 'GE', 'MMM', 'UPS'],
    'Communication Services': ['GOOGL', 'META', 'NFLX', 'DIS', 'T', 'VZ'],
    'Materials': ['LIN', 'APD', 'FCX', 'NEM', 'NUE', 'ALB'],
    'Utilities': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC'],
    'Real Estate': ['AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA'],
    'Consumer Staples': ['WMT', 'PG', 'KO', 'PEP', 'COST', 'MDLZ'],
}


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_peer_metrics(tickers: list) -> pd.DataFrame:
    """Fetch key valuation and fundamental metrics for a list of tickers."""
    import yfinance as yf

    rows = []
    for t in tickers:
        try:
            info = yf.Ticker(t).info or {}
            fcf = info.get('freeCashflow')
            mcap = info.get('marketCap')
            p_fcf = (mcap / fcf) if (fcf and mcap and fcf > 0) else None

            rows.append({
                'Ticker': t,
                'Name': (info.get('shortName') or t)[:20],
                'Market Cap': info.get('marketCap'),
                'P/E (Trailing)': info.get('trailingPE'),
                'P/E (Forward)': info.get('forwardPE'),
                'EV/EBITDA': info.get('enterpriseToEbitda'),
                'P/FCF': p_fcf,
                'P/S': info.get('priceToSalesTrailing12Months'),
                'Gross Margin %': (info.get('grossMargins', 0) or 0) * 100,
                'EBIT Margin %': (info.get('ebitdaMargins', 0) or 0) * 100,
                'ROE %': (info.get('returnOnEquity', 0) or 0) * 100,
                '1Y Return %': None,  # filled below
            })
        except Exception:
            rows.append({'Ticker': t, 'Name': t})

    if not rows:
        return pd.DataFrame()

    # Add 1Y returns
    try:
        import yfinance as yf
        hist_data = yf.download(tickers, period='1y', progress=False)
        if not hist_data.empty:
            close = hist_data['Close'] if isinstance(hist_data.columns, pd.MultiIndex) else hist_data
            for row in rows:
                t = row['Ticker']
                if t in close.columns and len(close[t].dropna()) > 0:
                    series = close[t].dropna()
                    row['1Y Return %'] = (series.iloc[-1] / series.iloc[0] - 1) * 100
    except Exception:
        pass

    return pd.DataFrame(rows)


def _render_peer_comparison(data: dict, ticker: str):
    """Render the Peer Comparison Panel."""
    st.markdown('##### Peer Comparison')

    sector = data.get('sector', 'Technology')

    # Peer selection
    default_peers = [t for t in _PEER_GROUPS.get(sector, ['SPY', 'QQQ']) if t != ticker][:5]

    peer_input = st.text_input(
        'Peer Tickers (comma-separated)',
        value=', '.join(default_peers),
        help=f'Auto-filled with {sector} peers. Edit to customise.',
        key='peer_input',
    )

    peers_raw = [p.strip().upper() for p in peer_input.split(',') if p.strip()]
    all_tickers = [ticker] + [p for p in peers_raw if p != ticker]

    if len(all_tickers) < 2:
        st.info('Add at least one peer ticker to compare.')
        return

    with st.spinner('Fetching peer data...'):
        try:
            peer_df = _fetch_peer_metrics(all_tickers)
        except Exception as e:
            st.warning(f'Peer data fetch error: {e}')
            return

    if peer_df.empty:
        st.warning('Could not retrieve peer data.')
        return

    # Highlight the subject company
    metric_cols = ['P/E (Trailing)', 'P/E (Forward)', 'EV/EBITDA', 'P/FCF',
                   'Gross Margin %', 'EBIT Margin %', 'ROE %', '1Y Return %']

    display_df = peer_df[['Ticker', 'Name', 'Market Cap'] + [c for c in metric_cols if c in peer_df.columns]].copy()

    # Format Market Cap
    if 'Market Cap' in display_df.columns:
        display_df['Market Cap'] = display_df['Market Cap'].apply(
            lambda v: format_large_number(v, '$') if pd.notna(v) and v else 'N/A'
        )

    # Format numeric columns
    for col in metric_cols:
        if col not in display_df.columns:
            continue
        if col in ['Gross Margin %', 'EBIT Margin %', 'ROE %', '1Y Return %']:
            display_df[col] = display_df[col].apply(
                lambda v: f'{v:.1f}%' if pd.notna(v) and v else 'N/A'
            )
        else:
            display_df[col] = display_df[col].apply(
                lambda v: f'{v:.1f}x' if pd.notna(v) and v else 'N/A'
            )

    st.dataframe(
        display_df.set_index('Ticker'),
        use_container_width=True,
        height=min(400, (len(display_df) + 1) * 40),
    )

    # Relative valuation bar chart: EV/EBITDA
    try:
        ev_data = peer_df[peer_df['EV/EBITDA'].notna()][['Ticker', 'EV/EBITDA']].copy()
        if len(ev_data) >= 2:
            ev_data = ev_data.sort_values('EV/EBITDA')
            colors = [COLOR_ACCENT if t == ticker else 'rgba(255,255,255,0.25)' for t in ev_data['Ticker']]
            fig = go.Figure(go.Bar(
                x=ev_data['Ticker'], y=ev_data['EV/EBITDA'],
                marker_color=colors,
                text=[f'{v:.1f}x' for v in ev_data['EV/EBITDA']],
                textposition='outside',
                textfont=dict(size=10, color='rgba(255,255,255,0.7)'),
            ))
            peer_median = float(ev_data['EV/EBITDA'].median())
            fig.add_hline(
                y=peer_median, line_dash='dash', line_color=COLOR_NEUTRAL,
                annotation_text=f'Peer Median: {peer_median:.1f}x',
                annotation_font_color=COLOR_NEUTRAL, annotation_font_size=10,
            )
            fig.update_layout(title='EV/EBITDA vs Peers', yaxis_title='EV/EBITDA', showlegend=False)
            _apply_atlas_theme(fig)
            st.plotly_chart(fig, use_container_width=True)
    except Exception:
        pass

    # Scatter: P/E vs Gross Margin (growth vs value quadrant)
    try:
        scatter_df = peer_df[peer_df['P/E (Trailing)'].notna() & peer_df['Gross Margin %'].notna()].copy()
        if len(scatter_df) >= 2:
            colors_scatter = [COLOR_ACCENT if t == ticker else 'rgba(99,102,241,0.45)' for t in scatter_df['Ticker']]
            sizes = [14 if t == ticker else 9 for t in scatter_df['Ticker']]
            fig2 = go.Figure()
            fig2.add_trace(go.Scatter(
                x=scatter_df['Gross Margin %'],
                y=scatter_df['P/E (Trailing)'],
                mode='markers+text',
                text=scatter_df['Ticker'],
                textposition='top center',
                textfont=dict(size=9, color='rgba(255,255,255,0.7)'),
                marker=dict(color=colors_scatter, size=sizes),
                name='Peers',
            ))
            fig2.update_layout(
                title='P/E vs Gross Margin — Valuation Quadrant',
                xaxis_title='Gross Margin %',
                yaxis_title='Trailing P/E',
                showlegend=False,
            )
            _apply_atlas_theme(fig2)
            st.plotly_chart(fig2, use_container_width=True)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# DCF Engine Integration (leverages ATLAS's existing atlas_dcf_engine.py)
# ---------------------------------------------------------------------------

def _render_dcf_engine(ticker: str):
    """
    Render the ATLAS native DCF engine inside the Equity Research module.
    Wraps valuation/atlas_dcf_engine.py with a full interactive UI.
    """
    st.markdown('##### ATLAS DCF Valuation Engine')
    st.markdown(
        '<div style="font-size:12px; color:rgba(255,255,255,0.52); margin-bottom:16px;">'
        'Discounted Cash Flow intrinsic value with WACC sensitivity analysis and scenario modelling.'
        '</div>',
        unsafe_allow_html=True,
    )

    # User inputs
    ui_col1, ui_col2, ui_col3 = st.columns(3)
    with ui_col1:
        risk_free = st.slider('Risk-Free Rate (%)', 2.0, 7.0, 4.0, 0.25, key='dcf_rf')
        market_return = st.slider('Market Return (%)', 6.0, 14.0, 10.0, 0.5, key='dcf_mkt')
    with ui_col2:
        tax_rate = st.slider('Tax Rate (%)', 10.0, 35.0, 21.0, 1.0, key='dcf_tax')
        terminal_growth = st.slider('Terminal Growth (%)', 1.0, 4.0, 2.5, 0.25, key='dcf_tg')
    with ui_col3:
        growth_years = st.slider('Explicit Forecast Period (yrs)', 5, 15, 10, 1, key='dcf_yrs')

    if st.button('Run DCF Valuation', type='primary', key='run_dcf_btn'):
        with st.spinner('Running DCF valuation...'):
            try:
                from valuation.atlas_dcf_engine import DCFValuation

                dcf = DCFValuation(ticker)
                wacc = dcf.calculate_wacc(
                    risk_free_rate=risk_free / 100,
                    market_return=market_return / 100,
                    tax_rate=tax_rate / 100,
                )
                projected_fcf = dcf.project_cash_flows(
                    years=growth_years,
                    wacc=wacc,
                )
                terminal_value = dcf.calculate_terminal_value(
                    terminal_growth_rate=terminal_growth / 100,
                    wacc=wacc,
                )
                result = dcf.calculate_intrinsic_value(
                    projected_fcf=projected_fcf,
                    terminal_value=terminal_value,
                    wacc=wacc,
                )

                intrinsic = result.get('intrinsic_value_per_share')
                current_price = result.get('current_price')

                if intrinsic and current_price:
                    upside = (intrinsic / current_price - 1) * 100
                    upside_color = COLOR_POS if upside > 0 else COLOR_NEG

                    d1, d2, d3, d4 = st.columns(4)
                    with d1:
                        st.markdown(
                            _glass_card('Intrinsic Value', format_currency(intrinsic)),
                            unsafe_allow_html=True,
                        )
                    with d2:
                        st.markdown(
                            _glass_card('Current Price', format_currency(current_price)),
                            unsafe_allow_html=True,
                        )
                    with d3:
                        st.markdown(
                            _glass_card('Upside / Downside', f'{upside:+.1f}%', color=upside_color),
                            unsafe_allow_html=True,
                        )
                    with d4:
                        st.markdown(
                            _glass_card('WACC', f'{wacc * 100:.2f}%'),
                            unsafe_allow_html=True,
                        )

                    # WACC sensitivity table
                    st.markdown('##### WACC × Terminal Growth Sensitivity')
                    wacc_range = [wacc - 0.015, wacc - 0.005, wacc, wacc + 0.005, wacc + 0.015]
                    tg_range = [terminal_growth / 100 - 0.005,
                                terminal_growth / 100,
                                terminal_growth / 100 + 0.005]

                    sense_rows = {}
                    for w in wacc_range:
                        row = {}
                        for tg in tg_range:
                            if w <= tg:
                                row[f'{tg*100:.2f}%'] = 'N/A'
                                continue
                            try:
                                tv_s = dcf.calculate_terminal_value(tg, w)
                                res_s = dcf.calculate_intrinsic_value(projected_fcf, tv_s, w)
                                iv = res_s.get('intrinsic_value_per_share')
                                row[f'{tg*100:.2f}%'] = format_currency(iv) if iv else 'N/A'
                            except Exception:
                                row[f'{tg*100:.2f}%'] = 'N/A'
                        sense_rows[f'{w*100:.2f}%'] = row

                    sense_df = pd.DataFrame(sense_rows).T
                    sense_df.index.name = 'WACC \\ TG'
                    st.dataframe(sense_df, use_container_width=True)

                    # Projected FCF bar chart
                    if isinstance(projected_fcf, (list, np.ndarray)):
                        fig = go.Figure(go.Bar(
                            x=[f'FY+{i+1}' for i in range(len(projected_fcf))],
                            y=[float(v) / 1e9 for v in projected_fcf],
                            marker_color=COLOR_ACCENT,
                            text=[f'${float(v)/1e9:.1f}B' for v in projected_fcf],
                            textposition='outside',
                            textfont=dict(size=10, color='rgba(255,255,255,0.7)'),
                        ))
                        fig.update_layout(
                            title='Projected Free Cash Flow',
                            yaxis_title='FCF (USD Billions)',
                            showlegend=False,
                        )
                        _apply_atlas_theme(fig)
                        st.plotly_chart(fig, use_container_width=True)
                else:
                    st.warning('DCF returned no intrinsic value. Verify the company has available FCF data.')
                    if result:
                        st.json(result)

            except ImportError:
                st.error('DCF engine module (valuation/atlas_dcf_engine.py) not found.')
            except Exception as e:
                # Surface the actual error — don't swallow it
                st.error(f'DCF calculation failed: {e}')
                st.caption('Common causes: no FCF data available, or insufficient financial history. '
                           'Try a ticker with at least 3 years of reported cash flows.')
    else:
        st.info(
            'Configure assumptions above and click **Run DCF Valuation** to calculate intrinsic value.'
        )

    # ── Valuation House bridge ─────────────────────────────────────────
    st.markdown('---')
    st.markdown(
        '<div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(20,184,166,0.05));'
        'border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px 18px;margin-top:4px;">'
        '<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.72);'
        'text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Need more depth?</div>'
        '<div style="font-size:12px;color:rgba(255,255,255,0.48);line-height:1.6;margin-bottom:4px;">'
        'The <strong style="color:rgba(255,255,255,0.72);">Valuation House</strong> runs '
        'multi-scenario DCF (Bear / Base / Bull), multi-stage DDM, residual income, '
        'SOTP, and Monte Carlo — with full WACC decomposition and Smart Assumptions.'
        '</div></div>',
        unsafe_allow_html=True,
    )
    if st.button(
        f'→  Open {ticker} in Valuation House',
        key='eq_open_val_house',
        type='primary',
        use_container_width=True,
    ):
        st.session_state['valuation_prefill_ticker'] = ticker
        st.session_state['atlas_selected_page'] = '💰 Valuation House'
        st.rerun()



# =============================================================================
# MAIN PAGE RENDERER
# =============================================================================

def render_equity_research():
    """Render the Equity Research page."""
    try:
        _render_equity_research_inner()
    except Exception as _err:
        import traceback as _tb
        st.error(f"**Equity Research — Unexpected Error:** `{type(_err).__name__}: {_err}`")
        with st.expander("Full traceback (share with developer)", expanded=True):
            st.code(_tb.format_exc())


def _render_equity_research_inner():
    """Inner implementation — wrapped by render_equity_research for error surfacing."""

    # ── Inject slide-in animation CSS ──────────────────────────────────────
    st.markdown("""
<style>
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(40px); }
  to   { opacity: 1; transform: translateX(0);    }
}
.thesis-drawer-panel {
  animation: slideInRight 0.25s ease-out;
  border-left: 1px solid rgba(99,102,241,0.15);
  padding-left: 16px;
}
</style>
""", unsafe_allow_html=True)

    # ── Ticker search bar ──────────────────────────────────────────────────
    search_col1, search_col2 = st.columns([5, 1])
    with search_col1:
        ticker_input = st.text_input(
            "Ticker",
            value=st.session_state.get('eq_research_ticker', ''),
            placeholder="Enter ticker symbol (e.g. AAPL, MSFT, NVDA, BATS:VOD)",
            label_visibility='collapsed',
        )
    with search_col2:
        search_clicked = st.button("Analyse", type='primary', use_container_width=True)

    if search_clicked and ticker_input:
        st.session_state['eq_research_ticker'] = ticker_input.upper().strip()

    ticker = st.session_state.get('eq_research_ticker', '').upper().strip()

    if not ticker:
        st.markdown("""
<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.38);">
  <div style="font-size:40px;margin-bottom:12px;">🔬</div>
  <div style="font-size:16px;font-weight:600;color:rgba(255,255,255,0.55);margin-bottom:6px;">
    Equity Research Workstation
  </div>
  <div style="font-size:13px;">
    Enter a ticker symbol above and click <strong>Analyse</strong> to begin deep fundamental research.
  </div>
</div>""", unsafe_allow_html=True)

        # Show saved theses as quick-access cards
        try:
            from services.thesis_engine import thesis_store as ts
            existing = ts.list_theses()
            if existing:
                st.markdown("---")
                st.markdown("##### Saved Theses")
                for t in existing[:10]:
                    status_color = THESIS_COLORS.get(t.get('overall_status', 'on_track'), COLOR_NEUTRAL)
                    if st.button(
                        f"  {t['ticker']}  ·  {t.get('title', '')}",
                        key=f"quick_{t['ticker']}",
                        use_container_width=False,
                    ):
                        st.session_state['eq_research_ticker'] = t['ticker']
                        st.rerun()
        except Exception:
            pass
        return

    # ── Fetch data ─────────────────────────────────────────────────────────
    with st.spinner(f"Fetching data for {ticker}..."):
        try:
            data = _fetch_company_data(ticker)
        except Exception as e:
            st.error(f"Failed to fetch company data for **{ticker}**: {e}")
            return
        try:
            fin = _fetch_financials(ticker)
        except Exception as e:
            st.warning(f"Financial statement data unavailable: {e}")
            fin = {}

    # ── Full-width header strip ─────────────────────────────────────────────
    _render_header_strip(data, ticker)

    # ── Layout: full-width or [analysis | thesis drawer] ───────────────────
    thesis_open = st.session_state.get('eq_thesis_open', False)

    if thesis_open:
        analysis_col, drawer_col = st.columns([5, 2.2], gap="medium")
    else:
        analysis_col = st.container()
        drawer_col = None

    # ── Main analysis workspace ─────────────────────────────────────────────
    with analysis_col:
        main_tab1, main_tab2, main_tab3, main_tab4, main_tab5 = st.tabs([
            '📊 Financial Analysis',
            '💰 Valuation Engine',
            '⚠️ Risk View',
            '🏢 Peer Comparison',
            '🧮 DCF Engine',
        ])

        with main_tab1:
            _render_financial_tables(fin, ticker)

        with main_tab2:
            _render_valuation_engine(data, fin, ticker)

        with main_tab3:
            _render_risk_view(data, ticker)

        with main_tab4:
            _render_peer_comparison(data, ticker)

        with main_tab5:
            _render_dcf_engine(ticker)

    # ── Thesis drawer ────────────────────────────────────────────────────────
    if thesis_open and drawer_col is not None:
        with drawer_col:
            st.markdown('<div class="thesis-drawer-panel">', unsafe_allow_html=True)
            _render_thesis_drawer(ticker)
            st.markdown('</div>', unsafe_allow_html=True)
