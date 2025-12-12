"""
ATLAS Live Data Upgrade
Real-time market data streaming
"""

import time
from datetime import datetime
from typing import List, Dict, Callable
import yfinance as yf


class LiveDataStream:
    """
    Live market data streaming

    Features:
    - Real-time price updates
    - Configurable update frequency
    - Callback support for updates
    """

    def __init__(self, tickers: List[str], update_interval: int = 5):
        """
        Initialize live data stream

        Args:
            tickers: List of tickers to track
            update_interval: Seconds between updates
        """
        self.tickers = tickers
        self.update_interval = update_interval
        self.running = False
        self.current_prices = {}

    def start(self, callback: Callable[[Dict], None] = None):
        """
        Start streaming data

        Args:
            callback: Function to call on each update
        """
        print(f"Starting live data stream for {len(self.tickers)} tickers...")
        print(f"Update interval: {self.update_interval} seconds")

        self.running = True

        try:
            while self.running:
                # Fetch current prices
                prices = {}

                for ticker in self.tickers:
                    try:
                        stock = yf.Ticker(ticker)
                        info = stock.info
                        price = info.get('currentPrice', info.get('regularMarketPrice'))

                        if price:
                            prices[ticker] = {
                                'price': price,
                                'timestamp': datetime.now().isoformat()
                            }
                    except Exception as e:
                        print(f"Error fetching {ticker}: {str(e)}")

                self.current_prices = prices

                # Call callback if provided
                if callback:
                    callback(prices)

                # Wait for next update
                time.sleep(self.update_interval)

        except KeyboardInterrupt:
            print("\nStopping live data stream...")
            self.running = False

    def stop(self):
        """Stop streaming"""
        self.running = False

    def get_current_prices(self) -> Dict:
        """Get most recent prices"""
        return self.current_prices


__all__ = ['LiveDataStream']
