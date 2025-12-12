"""
ATLAS Advanced Data Sources
Integration with premium data APIs
"""

import requests
from typing import Dict, List, Optional
import pandas as pd

try:
    from config import config
except:
    from ..config import config


class AlphaVantageSource:
    """Alpha Vantage API integration"""

    BASE_URL = "https://www.alphavantage.co/query"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or config.ALPHA_VANTAGE_API_KEY

        if not self.api_key:
            raise ValueError("Alpha Vantage API key required")

    def get_quote(self, symbol: str) -> Dict:
        """Get real-time quote"""
        params = {
            'function': 'GLOBAL_QUOTE',
            'symbol': symbol,
            'apikey': self.api_key
        }

        response = requests.get(self.BASE_URL, params=params)
        data = response.json()

        return data.get('Global Quote', {})

    def get_daily_adjusted(self, symbol: str, outputsize: str = 'compact') -> pd.DataFrame:
        """Get daily adjusted prices"""
        params = {
            'function': 'TIME_SERIES_DAILY_ADJUSTED',
            'symbol': symbol,
            'outputsize': outputsize,
            'apikey': self.api_key
        }

        response = requests.get(self.BASE_URL, params=params)
        data = response.json()

        time_series = data.get('Time Series (Daily)', {})

        df = pd.DataFrame.from_dict(time_series, orient='index')
        df.index = pd.to_datetime(df.index)
        df = df.astype(float)

        return df.sort_index()


class FMPSource:
    """Financial Modeling Prep API integration"""

    BASE_URL = "https://financialmodelingprep.com/api/v3"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or config.FMP_API_KEY

        if not self.api_key:
            raise ValueError("FMP API key required")

    def get_profile(self, symbol: str) -> Dict:
        """Get company profile"""
        url = f"{self.BASE_URL}/profile/{symbol}"
        params = {'apikey': self.api_key}

        response = requests.get(url, params=params)
        data = response.json()

        return data[0] if data else {}

    def get_financial_statements(self, symbol: str, period: str = 'annual') -> pd.DataFrame:
        """Get income statement"""
        url = f"{self.BASE_URL}/income-statement/{symbol}"
        params = {
            'period': period,
            'apikey': self.api_key
        }

        response = requests.get(url, params=params)
        data = response.json()

        return pd.DataFrame(data)


__all__ = ['AlphaVantageSource', 'FMPSource']
