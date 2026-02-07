"""
ATLAS Terminal - TradingView Lightweight Charts Integration
============================================================

Professional financial charts using TradingView's Lightweight Charts library.
This module provides helper functions for rendering Bloomberg-quality charts
in Streamlit.

Installation:
    pip install streamlit-lightweight-charts

Usage:
    from core.tradingview_charts import render_candlestick_chart, render_line_chart

    # Candlestick with volume
    render_candlestick_chart(df, key='my_chart', show_volume=True)

    # Line/Area chart
    render_line_chart(df, key='line_chart', area_fill=True)
"""

import json
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any

# Conditional import for environments without the package
try:
    from streamlit_lightweight_charts import renderLightweightCharts
    TRADINGVIEW_AVAILABLE = True
except ImportError:
    TRADINGVIEW_AVAILABLE = False
    def renderLightweightCharts(*args, **kwargs):
        import streamlit as st
        st.warning("TradingView charts not available. Install: pip install streamlit-lightweight-charts")


# =============================================================================
# ATLAS PROFESSIONAL THEME
# =============================================================================

ATLAS_COLORS = {
    # Candlestick colors
    'bull': 'rgba(38, 166, 154, 0.9)',      # Green - #26a69a
    'bear': 'rgba(239, 83, 80, 0.9)',       # Red - #ef5350

    # Theme colors (dark mode)
    'background_dark': '#0e1117',
    'text_dark': '#fafafa',
    'grid_dark': 'rgba(42, 46, 57, 0.6)',

    # Theme colors (light mode)
    'background_light': '#ffffff',
    'text_light': '#000000',
    'grid_light': 'rgba(197, 203, 206, 0.5)',

    # Accent colors
    'accent_blue': '#1f77b4',
    'accent_orange': '#ff7f0e',
    'accent_green': '#2ca02c',
    'accent_red': '#d62728',
    'accent_purple': '#9467bd',

    # UI elements
    'crosshair': 'rgba(255, 255, 255, 0.5)',
    'border': 'rgba(197, 203, 206, 0.4)',
    'watermark': 'rgba(171, 71, 188, 0.15)',
}

# Index color mapping
INDEX_COLORS = {
    'S&P 500': ATLAS_COLORS['accent_blue'],
    'SPY': ATLAS_COLORS['accent_blue'],
    '^GSPC': ATLAS_COLORS['accent_blue'],
    'Dow Jones': ATLAS_COLORS['accent_orange'],
    'DIA': ATLAS_COLORS['accent_orange'],
    '^DJI': ATLAS_COLORS['accent_orange'],
    'NASDAQ': ATLAS_COLORS['accent_green'],
    'QQQ': ATLAS_COLORS['accent_green'],
    '^IXIC': ATLAS_COLORS['accent_green'],
    'Russell 2000': ATLAS_COLORS['accent_red'],
    'IWM': ATLAS_COLORS['accent_red'],
    '^RUT': ATLAS_COLORS['accent_red'],
}


# =============================================================================
# DATA PREPARATION FUNCTIONS
# =============================================================================

def _standardize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Standardize DataFrame column names and index."""
    df = df.copy()
    df.columns = df.columns.str.lower().str.strip()

    # Reset index if it's a DatetimeIndex
    if isinstance(df.index, pd.DatetimeIndex):
        df = df.reset_index()
        # Rename the index column
        first_col = df.columns[0]
        if first_col not in ['time', 'date']:
            df = df.rename(columns={first_col: 'time'})

    return df


def _convert_time_column(df: pd.DataFrame) -> pd.DataFrame:
    """Convert time column to TradingView-compatible format."""
    df = df.copy()

    # Find the time column
    time_col = None
    for col in ['time', 'date', 'datetime', 'timestamp']:
        if col in df.columns:
            time_col = col
            break

    if time_col is None:
        raise ValueError("DataFrame must have a time/date column")

    # Rename to 'time' if needed
    if time_col != 'time':
        df = df.rename(columns={time_col: 'time'})

    # Convert to string format
    if pd.api.types.is_datetime64_any_dtype(df['time']):
        # For intraday data, use UNIX timestamp
        if df['time'].dt.hour.sum() > 0:
            df['time'] = df['time'].view('int64') // 10**9
        else:
            # For daily data, use YYYY-MM-DD string
            df['time'] = df['time'].dt.strftime('%Y-%m-%d')

    return df


def prepare_ohlcv_data(df: pd.DataFrame) -> Dict[str, List]:
    """
    Convert OHLCV DataFrame to TradingView-compatible format.

    Args:
        df: DataFrame with columns: time/date, open, high, low, close, volume (optional)

    Returns:
        Dict with 'candles' and 'volume' lists ready for charting
    """
    df = _standardize_dataframe(df)
    df = _convert_time_column(df)

    # Ensure required columns exist
    required = ['open', 'high', 'low', 'close']
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Add bull/bear color for volume
    df['color'] = np.where(
        df['open'] > df['close'],
        ATLAS_COLORS['bear'],
        ATLAS_COLORS['bull']
    )

    # Prepare candles data
    candles = json.loads(
        df[['time', 'open', 'high', 'low', 'close']].to_json(orient='records')
    )

    # Prepare volume data (if available)
    volume = None
    if 'volume' in df.columns:
        volume_df = df[['time', 'volume', 'color']].copy()
        volume_df = volume_df.rename(columns={'volume': 'value'})
        volume = json.loads(volume_df.to_json(orient='records'))

    return {'candles': candles, 'volume': volume}


def prepare_line_data(
    df: pd.DataFrame,
    value_col: str = 'close'
) -> List[Dict]:
    """
    Convert DataFrame to line chart format.

    Args:
        df: DataFrame with time/date and value column
        value_col: Column name for the y-axis values

    Returns:
        List of {time, value} dicts
    """
    df = _standardize_dataframe(df)
    df = _convert_time_column(df)

    value_col = value_col.lower()
    if value_col not in df.columns:
        raise ValueError(f"Column '{value_col}' not found in DataFrame")

    data = df[['time', value_col]].copy()
    data = data.rename(columns={value_col: 'value'})
    data = data.dropna()

    return json.loads(data.to_json(orient='records'))


# =============================================================================
# CHART CONFIGURATION
# =============================================================================

def get_chart_options(
    height: int = 400,
    width: Optional[int] = None,
    dark_mode: bool = True,
    show_volume: bool = False,
    watermark: str = '',
    percentage_mode: bool = False
) -> Dict[str, Any]:
    """
    Generate chart configuration matching ATLAS theme.

    Args:
        height: Chart height in pixels
        width: Chart width (None for auto)
        dark_mode: Use dark theme
        show_volume: Reserve space for volume
        watermark: Optional watermark text
        percentage_mode: Show percentage instead of absolute values
    """
    if dark_mode:
        bg_color = ATLAS_COLORS['background_dark']
        text_color = ATLAS_COLORS['text_dark']
        grid_color = ATLAS_COLORS['grid_dark']
    else:
        bg_color = ATLAS_COLORS['background_light']
        text_color = ATLAS_COLORS['text_light']
        grid_color = ATLAS_COLORS['grid_light']

    options = {
        "height": height,
        "layout": {
            "background": {"type": "solid", "color": bg_color},
            "textColor": text_color,
        },
        "grid": {
            "vertLines": {"color": grid_color},
            "horzLines": {"color": grid_color},
        },
        "crosshair": {
            "mode": 0,
            "vertLine": {"color": ATLAS_COLORS['crosshair'], "style": 1},
            "horzLine": {"color": ATLAS_COLORS['crosshair'], "style": 1},
        },
        "rightPriceScale": {
            "borderColor": ATLAS_COLORS['border'],
            "scaleMargins": {
                "top": 0.1,
                "bottom": 0.2 if show_volume else 0.1,
            },
        },
        "timeScale": {
            "borderColor": ATLAS_COLORS['border'],
            "timeVisible": True,
            "secondsVisible": False,
        },
    }

    if width:
        options["width"] = width

    if percentage_mode:
        options["rightPriceScale"]["mode"] = 2

    if watermark:
        options["watermark"] = {
            "visible": True,
            "fontSize": 48,
            "horzAlign": "center",
            "vertAlign": "center",
            "color": ATLAS_COLORS['watermark'],
            "text": watermark,
        }

    return options


# =============================================================================
# CHART RENDERING FUNCTIONS
# =============================================================================

def render_candlestick_chart(
    df: pd.DataFrame,
    key: str,
    height: int = 400,
    show_volume: bool = True,
    watermark: str = '',
    dark_mode: bool = True
) -> None:
    """
    Render a professional candlestick chart with optional volume.

    Args:
        df: DataFrame with OHLCV data
        key: Unique key for Streamlit component
        height: Total chart height in pixels
        show_volume: Whether to show volume histogram
        watermark: Optional watermark text (e.g., ticker symbol)
        dark_mode: Use dark theme
    """
    if not TRADINGVIEW_AVAILABLE:
        return

    data = prepare_ohlcv_data(df)
    charts = []

    # Calculate heights
    main_height = height if not show_volume else int(height * 0.72)
    volume_height = int(height * 0.25) if show_volume else 0

    # Main candlestick chart
    main_options = get_chart_options(
        height=main_height,
        dark_mode=dark_mode,
        show_volume=show_volume,
        watermark=watermark
    )

    candlestick_series = {
        "type": "Candlestick",
        "data": data['candles'],
        "options": {
            "upColor": ATLAS_COLORS['bull'],
            "downColor": ATLAS_COLORS['bear'],
            "borderVisible": False,
            "wickUpColor": ATLAS_COLORS['bull'],
            "wickDownColor": ATLAS_COLORS['bear'],
        }
    }

    charts.append({
        "chart": main_options,
        "series": [candlestick_series]
    })

    # Volume chart
    if show_volume and data['volume']:
        bg = ATLAS_COLORS['background_dark'] if dark_mode else ATLAS_COLORS['background_light']
        text = ATLAS_COLORS['text_dark'] if dark_mode else ATLAS_COLORS['text_light']

        volume_options = {
            "height": volume_height,
            "layout": {
                "background": {"type": "solid", "color": bg},
                "textColor": text,
            },
            "grid": {
                "vertLines": {"color": "rgba(42, 46, 57, 0)"},
                "horzLines": {"color": ATLAS_COLORS['grid_dark']},
            },
            "timeScale": {"visible": False},
            "watermark": {
                "visible": True,
                "fontSize": 14,
                "horzAlign": "left",
                "vertAlign": "top",
                "color": "rgba(171, 71, 188, 0.5)",
                "text": "Volume",
            },
        }

        volume_series = {
            "type": "Histogram",
            "data": data['volume'],
            "options": {
                "priceFormat": {"type": "volume"},
                "priceScaleId": "",
            },
            "priceScale": {
                "scaleMargins": {"top": 0, "bottom": 0},
                "alignLabels": False,
            }
        }

        charts.append({
            "chart": volume_options,
            "series": [volume_series]
        })

    renderLightweightCharts(charts, key)


def render_line_chart(
    df: pd.DataFrame,
    key: str,
    value_col: str = 'close',
    height: int = 300,
    color: Optional[str] = None,
    area_fill: bool = True,
    watermark: str = '',
    dark_mode: bool = True
) -> None:
    """
    Render a professional line or area chart.

    Args:
        df: DataFrame with time and value data
        key: Unique key for Streamlit component
        value_col: Column to plot
        height: Chart height
        color: Line color (defaults to ATLAS accent blue)
        area_fill: Whether to fill area under line
        watermark: Optional watermark text
        dark_mode: Use dark theme
    """
    if not TRADINGVIEW_AVAILABLE:
        return

    data = prepare_line_data(df, value_col)
    line_color = color or ATLAS_COLORS['accent_blue']

    chart_options = get_chart_options(
        height=height,
        dark_mode=dark_mode,
        watermark=watermark
    )

    if area_fill:
        series = {
            "type": "Area",
            "data": data,
            "options": {
                "topColor": f"{line_color}88",
                "bottomColor": f"{line_color}11",
                "lineColor": line_color,
                "lineWidth": 2,
            }
        }
    else:
        series = {
            "type": "Line",
            "data": data,
            "options": {
                "color": line_color,
                "lineWidth": 2,
            }
        }

    renderLightweightCharts([{
        "chart": chart_options,
        "series": [series]
    }], key)


def render_multi_series_chart(
    data_dict: Dict[str, pd.DataFrame],
    key: str,
    value_col: str = 'close',
    height: int = 350,
    colors: Optional[Dict[str, str]] = None,
    percentage_mode: bool = True,
    dark_mode: bool = True
) -> None:
    """
    Render multiple series as overlaid line charts.

    Args:
        data_dict: Dict of {series_name: DataFrame}
        key: Unique key for Streamlit component
        value_col: Column to plot from each DataFrame
        height: Chart height
        colors: Optional dict of {series_name: color}
        percentage_mode: Normalize to percentage for comparison
        dark_mode: Use dark theme
    """
    if not TRADINGVIEW_AVAILABLE:
        return

    colors = colors or INDEX_COLORS

    chart_options = get_chart_options(
        height=height,
        dark_mode=dark_mode,
        percentage_mode=percentage_mode
    )

    series_list = []
    for name, df in data_dict.items():
        try:
            data = prepare_line_data(df, value_col)
            color = colors.get(name, ATLAS_COLORS['accent_blue'])

            series_list.append({
                "type": "Line",
                "data": data,
                "options": {
                    "color": color,
                    "lineWidth": 2,
                    "title": name,
                }
            })
        except Exception as e:
            print(f"Warning: Could not process {name}: {e}")
            continue

    if series_list:
        renderLightweightCharts([{
            "chart": chart_options,
            "series": series_list
        }], key)


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def create_tradingview_chart(
    df: pd.DataFrame,
    chart_type: str = 'candlestick',
    key: str = 'tv_chart',
    **kwargs
) -> None:
    """
    Universal function to create TradingView charts.

    Args:
        df: DataFrame with price data
        chart_type: 'candlestick', 'line', or 'area'
        key: Unique component key
        **kwargs: Additional options passed to specific chart function
    """
    chart_type = chart_type.lower()

    if chart_type == 'candlestick':
        render_candlestick_chart(df, key, **kwargs)
    elif chart_type == 'line':
        render_line_chart(df, key, area_fill=False, **kwargs)
    elif chart_type == 'area':
        render_line_chart(df, key, area_fill=True, **kwargs)
    else:
        raise ValueError(f"Unknown chart type: {chart_type}. Use 'candlestick', 'line', or 'area'.")


def render_candlestick_with_indicators(
    df: pd.DataFrame,
    key: str,
    height: int = 500,
    show_volume: bool = True,
    show_ma_50: bool = False,
    show_ma_200: bool = False,
    show_bollinger: bool = False,
    watermark: str = '',
    dark_mode: bool = True
) -> None:
    """
    Render candlestick chart with optional technical indicators.

    Args:
        df: DataFrame with OHLCV data
        key: Unique Streamlit component key
        height: Total chart height
        show_volume: Show volume histogram
        show_ma_50: Show 50-day moving average
        show_ma_200: Show 200-day moving average
        show_bollinger: Show Bollinger Bands (20-day, 2 std)
        watermark: Ticker symbol for watermark
        dark_mode: Use dark theme
    """
    if not TRADINGVIEW_AVAILABLE:
        return

    # Prepare base data
    data = prepare_ohlcv_data(df)
    charts = []

    # Calculate heights
    main_height = height if not show_volume else int(height * 0.75)
    volume_height = int(height * 0.22) if show_volume else 0

    # Main chart options
    main_options = get_chart_options(
        height=main_height,
        dark_mode=dark_mode,
        show_volume=show_volume,
        watermark=watermark
    )

    # Build series list - candlesticks first
    series_list = [{
        "type": "Candlestick",
        "data": data['candles'],
        "options": {
            "upColor": ATLAS_COLORS['bull'],
            "downColor": ATLAS_COLORS['bear'],
            "borderVisible": False,
            "wickUpColor": ATLAS_COLORS['bull'],
            "wickDownColor": ATLAS_COLORS['bear'],
        }
    }]

    # Standardize DataFrame for indicator calculations
    df_calc = df.copy()
    df_calc.columns = df_calc.columns.str.lower()
    if 'time' not in df_calc.columns:
        if isinstance(df_calc.index, pd.DatetimeIndex):
            df_calc = df_calc.reset_index()
            df_calc = df_calc.rename(columns={df_calc.columns[0]: 'time'})

    # Convert time to string format
    if 'time' in df_calc.columns and pd.api.types.is_datetime64_any_dtype(df_calc['time']):
        df_calc['time'] = df_calc['time'].dt.strftime('%Y-%m-%d')

    # Add MA 50
    if show_ma_50 and 'close' in df_calc.columns and len(df_calc) >= 50:
        df_calc['ma50'] = df_calc['close'].rolling(window=50).mean()
        ma50_data = df_calc[['time', 'ma50']].dropna()
        ma50_data = ma50_data.rename(columns={'ma50': 'value'})

        series_list.append({
            "type": "Line",
            "data": json.loads(ma50_data.to_json(orient='records')),
            "options": {
                "color": "#f7b924",
                "lineWidth": 2,
                "title": "MA 50",
            }
        })

    # Add MA 200
    if show_ma_200 and 'close' in df_calc.columns and len(df_calc) >= 200:
        df_calc['ma200'] = df_calc['close'].rolling(window=200).mean()
        ma200_data = df_calc[['time', 'ma200']].dropna()
        ma200_data = ma200_data.rename(columns={'ma200': 'value'})

        series_list.append({
            "type": "Line",
            "data": json.loads(ma200_data.to_json(orient='records')),
            "options": {
                "color": "#ff6b6b",
                "lineWidth": 2,
                "title": "MA 200",
            }
        })

    # Add Bollinger Bands
    if show_bollinger and 'close' in df_calc.columns and len(df_calc) >= 20:
        df_calc['bb_mid'] = df_calc['close'].rolling(window=20).mean()
        df_calc['bb_std'] = df_calc['close'].rolling(window=20).std()
        df_calc['bb_upper'] = df_calc['bb_mid'] + (df_calc['bb_std'] * 2)
        df_calc['bb_lower'] = df_calc['bb_mid'] - (df_calc['bb_std'] * 2)

        # Upper band
        bb_upper_data = df_calc[['time', 'bb_upper']].dropna()
        bb_upper_data = bb_upper_data.rename(columns={'bb_upper': 'value'})
        series_list.append({
            "type": "Line",
            "data": json.loads(bb_upper_data.to_json(orient='records')),
            "options": {
                "color": "rgba(136, 132, 216, 0.7)",
                "lineWidth": 1,
                "lineStyle": 2,
                "title": "BB Upper",
            }
        })

        # Lower band
        bb_lower_data = df_calc[['time', 'bb_lower']].dropna()
        bb_lower_data = bb_lower_data.rename(columns={'bb_lower': 'value'})
        series_list.append({
            "type": "Line",
            "data": json.loads(bb_lower_data.to_json(orient='records')),
            "options": {
                "color": "rgba(136, 132, 216, 0.7)",
                "lineWidth": 1,
                "lineStyle": 2,
                "title": "BB Lower",
            }
        })

    # Main chart with all series
    charts.append({
        "chart": main_options,
        "series": series_list
    })

    # Volume chart
    if show_volume and data['volume']:
        bg = ATLAS_COLORS['background_dark'] if dark_mode else ATLAS_COLORS['background_light']
        text = ATLAS_COLORS['text_dark'] if dark_mode else ATLAS_COLORS['text_light']

        volume_options = {
            "height": volume_height,
            "layout": {
                "background": {"type": "solid", "color": bg},
                "textColor": text,
            },
            "grid": {
                "vertLines": {"color": "rgba(42, 46, 57, 0)"},
                "horzLines": {"color": ATLAS_COLORS['grid_dark']},
            },
            "timeScale": {"visible": False},
            "watermark": {
                "visible": True,
                "fontSize": 14,
                "horzAlign": "left",
                "vertAlign": "top",
                "color": "rgba(171, 71, 188, 0.5)",
                "text": "Volume",
            },
        }

        volume_series = {
            "type": "Histogram",
            "data": data['volume'],
            "options": {
                "priceFormat": {"type": "volume"},
                "priceScaleId": "",
            },
            "priceScale": {
                "scaleMargins": {"top": 0, "bottom": 0},
                "alignLabels": False,
            }
        }

        charts.append({
            "chart": volume_options,
            "series": [volume_series]
        })

    renderLightweightCharts(charts, key)


def is_tradingview_available() -> bool:
    """Check if TradingView charts are available."""
    return TRADINGVIEW_AVAILABLE
