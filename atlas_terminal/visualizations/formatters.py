"""
Formatters Module
Provides consistent number, currency, and date formatting across ATLAS Terminal

FEATURES:
- Currency formatting with $ and commas
- Percentage formatting with proper precision
- Ratio formatting for metrics (Sharpe, Sortino, etc.)
- Yield/interest rate formatting
- Timestamp formatting
- Data freshness indicators
"""

from datetime import datetime
from typing import Optional, Union
import logging

from ..config import COLORS

logger = logging.getLogger(__name__)


class ATLASFormatter:
    """
    Centralized formatting utilities for ATLAS Terminal
    Ensures consistent display of financial data across all pages
    """

    @staticmethod
    def format_currency(value: Optional[Union[int, float]],
                       decimals: int = 0,
                       prefix: str = "$") -> str:
        """
        Format value as currency with $ and commas

        Args:
            value: Numeric value to format
            decimals: Number of decimal places
            prefix: Currency symbol (default: $)

        Returns:
            Formatted currency string

        Examples:
            format_currency(1234567.89, 2) -> "$1,234,567.89"
            format_currency(1500, 0) -> "$1,500"
            format_currency(-250.50, 2) -> "-$250.50"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)
            if value < 0:
                return f"-{prefix}{abs(value):,.{decimals}f}"
            else:
                return f"{prefix}{value:,.{decimals}f}"
        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting currency: {value}, error: {e}")
            return "N/A"

    @staticmethod
    def format_large_currency(value: Optional[Union[int, float]],
                             decimals: int = 1) -> str:
        """
        Format large currency values with K/M/B suffixes

        Args:
            value: Numeric value to format
            decimals: Number of decimal places

        Returns:
            Formatted currency string with suffix

        Examples:
            format_large_currency(1500) -> "$1.5K"
            format_large_currency(2500000) -> "$2.5M"
            format_large_currency(1200000000) -> "$1.2B"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)
            abs_value = abs(value)
            sign = "-" if value < 0 else ""

            if abs_value >= 1e9:
                return f"{sign}${abs_value/1e9:.{decimals}f}B"
            elif abs_value >= 1e6:
                return f"{sign}${abs_value/1e6:.{decimals}f}M"
            elif abs_value >= 1e3:
                return f"{sign}${abs_value/1e3:.{decimals}f}K"
            else:
                return f"{sign}${abs_value:.{decimals}f}"
        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting large currency: {value}, error: {e}")
            return "N/A"

    @staticmethod
    def format_percentage(value: Optional[Union[int, float]],
                         decimals: int = 1,
                         include_sign: bool = False) -> str:
        """
        Format value as percentage with % sign

        Args:
            value: Numeric value to format (as percentage, e.g., 15.5 for 15.5%)
            decimals: Number of decimal places
            include_sign: Whether to include + for positive values

        Returns:
            Formatted percentage string

        Examples:
            format_percentage(15.5, 1) -> "15.5%"
            format_percentage(-3.2, 2) -> "-3.20%"
            format_percentage(8.5, 1, True) -> "+8.5%"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)
            if include_sign and value > 0:
                return f"+{value:.{decimals}f}%"
            else:
                return f"{value:.{decimals}f}%"
        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting percentage: {value}, error: {e}")
            return "N/A"

    @staticmethod
    def format_ratio(value: Optional[Union[int, float]],
                    decimals: int = 2,
                    suffix: str = "") -> str:
        """
        Format ratio values (Sharpe, Sortino, etc.)

        Args:
            value: Numeric ratio value
            decimals: Number of decimal places
            suffix: Optional suffix (e.g., "x" for leverage)

        Returns:
            Formatted ratio string

        Examples:
            format_ratio(1.25, 2) -> "1.25"
            format_ratio(2.5, 1, "x") -> "2.5x"
            format_ratio(-0.5, 2) -> "-0.50"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)
            return f"{value:.{decimals}f}{suffix}"
        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting ratio: {value}, error: {e}")
            return "N/A"

    @staticmethod
    def format_yield(value: Optional[Union[int, float]],
                    decimals: int = 2) -> str:
        """
        Format yield/interest rate values

        Args:
            value: Numeric yield value (as percentage)
            decimals: Number of decimal places

        Returns:
            Formatted yield string

        Examples:
            format_yield(4.5, 2) -> "4.50%"
            format_yield(0.25, 3) -> "0.250%"
        """
        return ATLASFormatter.format_percentage(value, decimals)

    @staticmethod
    def format_price(value: Optional[Union[int, float]],
                    decimals: int = 2) -> str:
        """
        Format price values (stock/option prices)

        Args:
            value: Numeric price value
            decimals: Number of decimal places

        Returns:
            Formatted price string

        Examples:
            format_price(125.456, 2) -> "$125.46"
            format_price(0.005, 4) -> "$0.0050"
        """
        return ATLASFormatter.format_currency(value, decimals)

    @staticmethod
    def format_shares(value: Optional[Union[int, float]],
                     decimals: int = 0) -> str:
        """
        Format share quantities

        Args:
            value: Number of shares
            decimals: Number of decimal places (0 for whole shares)

        Returns:
            Formatted shares string

        Examples:
            format_shares(150) -> "150"
            format_shares(25.5, 1) -> "25.5"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)
            return f"{value:,.{decimals}f}"
        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting shares: {value}, error: {e}")
            return "N/A"

    @staticmethod
    def format_timestamp(dt: Optional[datetime] = None,
                        format_str: str = "%Y-%m-%d %H:%M:%S") -> str:
        """
        Format datetime object to string

        Args:
            dt: Datetime object (None = current time)
            format_str: strftime format string

        Returns:
            Formatted datetime string

        Examples:
            format_timestamp() -> "2025-11-14 10:30:00"
            format_timestamp(dt, "%b %d, %Y") -> "Nov 14, 2025"
        """
        if dt is None:
            dt = datetime.now()

        try:
            return dt.strftime(format_str)
        except Exception as e:
            logger.warning(f"Error formatting timestamp: {e}")
            return "N/A"

    @staticmethod
    def format_date_simple(dt: Optional[datetime] = None) -> str:
        """
        Format date in simple format (Nov 14, 2025)

        Args:
            dt: Datetime object (None = current time)

        Returns:
            Formatted date string
        """
        return ATLASFormatter.format_timestamp(dt, "%b %d, %Y")

    @staticmethod
    def get_freshness_badge(age_minutes: Optional[float],
                           fresh_threshold: int = 10,
                           stale_threshold: int = 60) -> str:
        """
        Get HTML badge indicating data freshness

        Args:
            age_minutes: Age of data in minutes
            fresh_threshold: Minutes threshold for "fresh" (green)
            stale_threshold: Minutes threshold for "stale" (red)

        Returns:
            HTML string with colored badge

        Examples:
            get_freshness_badge(5) -> "🟢 Fresh (5m)"
            get_freshness_badge(30) -> "🟡 Recent (30m)"
            get_freshness_badge(90) -> "🔴 Stale (90m)"
        """
        if age_minutes is None:
            return "⚪ Unknown"

        try:
            age_minutes = float(age_minutes)

            if age_minutes < fresh_threshold:
                color = COLORS['success']
                emoji = "🟢"
                status = "Fresh"
            elif age_minutes < stale_threshold:
                color = COLORS['warning']
                emoji = "🟡"
                status = "Recent"
            else:
                color = COLORS['danger']
                emoji = "🔴"
                status = "Stale"

            return f"<span style='color: {color};'>{emoji} {status} ({int(age_minutes)}m)</span>"

        except (ValueError, TypeError) as e:
            logger.warning(f"Error creating freshness badge: {e}")
            return "⚪ Unknown"

    @staticmethod
    def format_change_with_color(value: Optional[Union[int, float]],
                                 decimals: int = 1,
                                 is_percentage: bool = True,
                                 inverted: bool = False) -> str:
        """
        Format change value with color coding

        Args:
            value: Numeric change value
            decimals: Number of decimal places
            is_percentage: Whether to format as percentage
            inverted: If True, negative is good (e.g., for volatility)

        Returns:
            HTML string with colored change value

        Examples:
            format_change_with_color(5.2) -> "<span style='color: #00ff9f;'>+5.2%</span>"
            format_change_with_color(-2.1) -> "<span style='color: #ff4757;'>-2.1%</span>"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)

            # Determine color
            if inverted:
                color = COLORS['success'] if value < 0 else COLORS['danger']
            else:
                color = COLORS['success'] if value > 0 else COLORS['danger']

            # Format value
            if is_percentage:
                formatted = ATLASFormatter.format_percentage(value, decimals, include_sign=True)
            else:
                formatted = ATLASFormatter.format_currency(value, decimals)

            return f"<span style='color: {color};'>{formatted}</span>"

        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting colored change: {value}, error: {e}")
            return "N/A"

    @staticmethod
    def format_metric_delta(current: Optional[Union[int, float]],
                           previous: Optional[Union[int, float]],
                           decimals: int = 1,
                           is_currency: bool = False) -> str:
        """
        Calculate and format change between two values

        Args:
            current: Current value
            previous: Previous value
            decimals: Number of decimal places
            is_currency: Whether to format as currency

        Returns:
            Formatted delta string

        Examples:
            format_metric_delta(110, 100) -> "+10.0%"
            format_metric_delta(95, 100) -> "-5.0%"
        """
        if current is None or previous is None or previous == 0:
            return "N/A"

        try:
            current = float(current)
            previous = float(previous)

            delta_pct = ((current - previous) / abs(previous)) * 100

            if is_currency:
                delta_abs = current - previous
                delta_str = ATLASFormatter.format_currency(abs(delta_abs), decimals)
                pct_str = ATLASFormatter.format_percentage(delta_pct, 1, include_sign=True)
                sign = "+" if delta_abs > 0 else "-"
                return f"{sign}{delta_str} ({pct_str})"
            else:
                return ATLASFormatter.format_percentage(delta_pct, decimals, include_sign=True)

        except (ValueError, TypeError, ZeroDivisionError) as e:
            logger.warning(f"Error formatting metric delta: {e}")
            return "N/A"

    @staticmethod
    def format_basis_points(value: Optional[Union[int, float]]) -> str:
        """
        Format value in basis points (bps)

        Args:
            value: Numeric value in percentage points

        Returns:
            Formatted basis points string

        Examples:
            format_basis_points(0.25) -> "25 bps"
            format_basis_points(1.5) -> "150 bps"
        """
        if value is None:
            return "N/A"

        try:
            value = float(value)
            bps = value * 100
            return f"{bps:.0f} bps"
        except (ValueError, TypeError) as e:
            logger.warning(f"Error formatting basis points: {value}, error: {e}")
            return "N/A"
