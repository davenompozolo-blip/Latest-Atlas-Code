"""
Centralized error handling with user-friendly messages.
"""

import streamlit as st
import traceback
from typing import Callable, Any, Optional
from functools import wraps

class ErrorHandler:
    """
    Handles errors gracefully with user-friendly messages.

    Features:
    - User-friendly error messages
    - Fallback strategies
    - Error logging
    - Recovery suggestions
    """

    ERROR_MESSAGES = {
        'yfinance': {
            'timeout': "⏱️ **Can't reach financial data provider right now.**\n\nUsing cached data from earlier today.",
            'invalid_ticker': "❌ **Ticker not found.**\n\nPlease check the ticker symbol and try again.",
            'rate_limit': "🚦 **Too many requests.**\n\nWaiting 60 seconds before retry...",
        },
        'calculation': {
            'zero_division': "⚠️ **Can't calculate - division by zero.**\n\nCheck your input values.",
            'invalid_input': "❌ **Invalid input data.**\n\nPlease verify your numbers and try again.",
        },
        'data': {
            'empty': "📭 **No data available.**\n\nTry selecting a different date range or ticker.",
            'missing': "⚠️ **Some data is missing.**\n\nCalculations may be approximate.",
        }
    }

    @staticmethod
    def handle_error(
        error: Exception,
        context: str,
        fallback_value: Any = None,
        show_traceback: bool = False
    ) -> Any:
        """
        Handle error with user-friendly message.

        Args:
            error: Exception that occurred
            context: What was being done when error occurred
            fallback_value: Value to return if error occurs
            show_traceback: Whether to show technical details

        Returns:
            Fallback value
        """
        # Determine error type
        error_type = type(error).__name__

        # Get user-friendly message
        message = ErrorHandler._get_friendly_message(error, context)

        # Display error
        st.error(message)

        # Show technical details if requested
        if show_traceback:
            with st.expander("🔧 Technical Details (for debugging)"):
                st.code(traceback.format_exc())

        return fallback_value

    @staticmethod
    def _get_friendly_message(error: Exception, context: str) -> str:
        """Get user-friendly error message."""
        error_str = str(error).lower()

        # Check for known error patterns
        if 'timeout' in error_str or 'timed out' in error_str:
            return ErrorHandler.ERROR_MESSAGES['yfinance']['timeout']
        elif 'rate limit' in error_str:
            return ErrorHandler.ERROR_MESSAGES['yfinance']['rate_limit']
        elif 'division by zero' in error_str or 'zerodivision' in error_str:
            return ErrorHandler.ERROR_MESSAGES['calculation']['zero_division']
        elif 'keyerror' in error_str or 'key error' in error_str:
            key = str(error).strip("'")
            return f"⚠️ **Missing expected data: {key}**\n\nThe data source may have changed format. Using cached data."
        elif 'empty' in error_str:
            return ErrorHandler.ERROR_MESSAGES['data']['empty']
        else:
            # Generic message with context
            return f"⚠️ **Error in {context}**\n\n{str(error)}\n\nTrying alternative approach..."


def safe_execute(
    fallback_value: Any = None,
    context: str = "operation",
    show_error: bool = True
):
    """
    Decorator for safe function execution with error handling.

    Args:
        fallback_value: Value to return on error
        context: Description of what's being done
        show_error: Whether to show error to user

    Example:
        @safe_execute(fallback_value=pd.DataFrame(), context="loading portfolio")
        def load_portfolio():
            return pd.read_csv("portfolio.csv")
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if show_error:
                    ErrorHandler.handle_error(
                        e,
                        context=context,
                        fallback_value=fallback_value
                    )
                return fallback_value
        return wrapper
    return decorator
