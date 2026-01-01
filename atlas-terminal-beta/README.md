# ATLAS Terminal Beta v1.0.0

Professional portfolio analytics platform for retail investors.

## Features

- 🦙 **Alpaca Markets Integration** - Real-time portfolio sync
- 📊 **Portfolio Dashboard** - Track positions, P&L, allocation
- ⚠️ **Risk Analytics** - Sharpe ratio, VaR, max drawdown, volatility
- 📈 **Performance Metrics** - Returns analysis, equity curve
- 💼 **Trade Analysis** - Win rate, R:R ratio, trade history

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure API Credentials

Create `.streamlit/secrets.toml`:

```toml
[alpaca]
api_key = "YOUR_ALPACA_API_KEY"
secret_key = "YOUR_ALPACA_SECRET_KEY"
```

### 3. Run the App

```bash
streamlit run app.py
```

Navigate to http://localhost:8502

## Project Structure

```
atlas-terminal-beta/
├── app.py                  # Main application entry point
├── integrations/           # Broker integrations
│   └── alpaca_adapter.py   # Alpaca Markets API
├── pages/                  # Application pages
│   ├── home.py            # Dashboard
│   ├── portfolio.py       # Portfolio analysis
│   ├── risk.py            # Risk metrics
│   └── settings.py        # Configuration
├── ui/                    # UI components
│   └── components.py      # Reusable UI elements
├── utils/                 # Helper functions
│   └── calculations.py    # Financial calculations
└── tests/                 # Test suite
    └── test_alpaca.py     # Integration tests
```

## Development

### Running Tests

```bash
pytest tests/ -v
```

### Code Quality

```bash
# Format code
black .

# Type checking
mypy .

# Linting
pylint app.py
```

## Version

- **Current**: v1.0.0-beta.1
- **Release Date**: 2026-01-09
- **Status**: Beta Testing

## Documentation

See `docs/` folder for detailed documentation.

## License

Proprietary - All rights reserved

## Support

For issues or questions, please open an issue on GitHub.

---

Built with ❤️ by Hlobo Mtembu
