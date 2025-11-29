# 🚀 ATLAS Terminal v10.1 - Investopedia Live Data Integration

## Overview

**"From Excel Toy to Production Engine - The Quant Developer Move!"**

This integration transforms ATLAS Terminal from a manual upload tool into a real-time portfolio tracking engine by automatically fetching portfolio data from Investopedia.

## Features

✅ **Automated Login**
- Session persistence with cookie storage
- Auto re-authentication when session expires
- Secure credential handling

✅ **Live Portfolio Fetching**
- Real-time holdings data
- Current positions and values
- Account summary (cash, buying power, total value)
- Trade history

✅ **Auto-Sync Engine**
- Configurable sync intervals (default: 5 minutes)
- Background automatic updates
- Change detection and alerts

✅ **Trade Detection**
- Automatically detects new positions
- Alerts on buy/sell transactions
- Tracks closed positions

✅ **Zero Manual Work**
- No more copy-paste from Investopedia
- Fully automated data pipeline
- Professional-grade implementation

## Installation

The required packages are already in `requirements.txt`:

```bash
pip install requests beautifulsoup4 lxml
```

Or install all requirements:

```bash
pip install -r requirements.txt
```

## How to Use

### 1. Start ATLAS Terminal

```bash
streamlit run atlas_app.py
```

### 2. Navigate to Phoenix Parser

Click on **🔥 Phoenix Parser** in the navigation menu.

### 3. Connect to Investopedia

You'll see a new section: **🔴 INVESTOPEDIA LIVE FEED**

1. Click **"🔐 Connect to Investopedia"** to expand the connection form
2. Enter your credentials:
   - **Email**: Your Investopedia account email
   - **Password**: Your Investopedia account password
   - **Game ID** (optional): Found in your portfolio URL
   - **Auto-sync interval**: How often to sync (default: 5 minutes)

3. Click **"🔐 Connect to Investopedia"** button

### 4. Sync Your Portfolio

Once connected, you'll see:

- **🟢 LIVE** status indicator with last sync time
- **🔄 Sync Now** button to manually trigger sync
- **Auto-sync** checkbox to enable/disable background syncing
- **🔓 Disconnect** button to logout

The portfolio will automatically sync at your configured interval!

### 5. View Live Data

After syncing, you'll see:

- **Account Value**: Total portfolio value
- **Cash**: Available cash balance
- **Positions**: Number of holdings
- **Live Holdings Table**: All your positions in ATLAS format
- **Recent Changes**: Detected trades since last sync (BUY/SELL/NEW/CLOSED)

### 6. Data Flows to All ATLAS Pages

Once synced, the portfolio data is automatically saved to ATLAS and available across all pages:

- 🏠 Portfolio Home
- 📈 Risk Analysis
- 💎 Performance Suite
- 🔬 Portfolio Deep Dive
- And more!

## Finding Your Game ID (Optional)

Your Game ID is in your Investopedia portfolio URL:

```
https://www.investopedia.com/simulator/portfolio/YOUR_GAME_ID
```

Example:
```
https://www.investopedia.com/simulator/portfolio/12345
```

Game ID: `12345`

**Note**: If you only have one portfolio, you can leave this blank.

## Session Management

- **Session Persistence**: Your session is saved to `investopedia_session.pkl`
- **Auto Re-authentication**: If your session expires, the engine automatically logs you back in
- **Security**: Session files are stored locally and never transmitted

## Troubleshooting

### Login Failed

- ✅ Check email and password are correct
- ✅ Ensure you can log in manually at investopedia.com
- ✅ Check if you have 2FA enabled (may need to disable)
- ✅ Delete `investopedia_session.pkl` and try again

### No Data Returned

- ✅ Verify you have an active Investopedia portfolio/game
- ✅ Check if Game ID is correct (or leave blank)
- ✅ Try accessing your portfolio manually on Investopedia
- ✅ Click "Sync Now" to manually trigger a sync

### Session Expires Frequently

- ✅ This is normal - Investopedia sessions expire after ~24 hours
- ✅ Auto re-authentication handles this automatically
- ✅ No action needed on your part

### Sync is Slow

- ✅ Reduce sync frequency (5min → 10min)
- ✅ Check your internet connection
- ✅ Investopedia might be slow during peak hours

## Data Format

The engine automatically converts Investopedia data to ATLAS format:

| Investopedia Field | ATLAS Field |
|-------------------|-------------|
| ticker/symbol | Ticker |
| shares/quantity | Shares |
| purchase_price | Purchase Price |
| current_price | Current Price |
| market_value | Market Value |
| company | Company |

## Architecture

### Components

1. **InvestopediaSession**: Handles login and session management
2. **InvestopediaAutoSync**: Manages scheduled syncing
3. **convert_investopedia_to_atlas_format()**: Data transformation
4. **Streamlit Integration**: UI for connection and display

### Data Flow

```
Investopedia Website
    ↓
InvestopediaSession (login + fetch)
    ↓
InvestopediaAutoSync (schedule + cache)
    ↓
convert_investopedia_to_atlas_format()
    ↓
save_portfolio_data()
    ↓
ATLAS Terminal (all pages)
```

## Security Notes

- Credentials are stored in Streamlit session state (memory only)
- Session cookies are saved locally in `investopedia_session.pkl`
- No credentials are transmitted to third parties
- HTTPS is used for all Investopedia connections
- Clear session file to remove saved credentials

## Benefits Over Manual Upload

| Manual Upload | Investopedia Live Feed |
|--------------|----------------------|
| Copy-paste from browser | Fully automated |
| Manual refresh needed | Auto-sync every 5 minutes |
| No change detection | Real-time trade alerts |
| Error-prone | Validated and reliable |
| Time consuming | Zero manual work |
| Amateur setup | Professional system |

## Future Enhancements

Potential future features:

- [ ] Trade execution from ATLAS
- [ ] Multiple portfolio support
- [ ] Historical performance tracking
- [ ] Email/SMS alerts for trades
- [ ] Integration with other brokers
- [ ] Advanced scraping for more data points

## Support

If you encounter issues:

1. Check this guide first
2. Review error messages in the terminal
3. Verify Investopedia credentials
4. Try disconnecting and reconnecting
5. Check that Investopedia's website structure hasn't changed

## Credits

**ATLAS Terminal v10.1 - Investopedia Live Data Engine**

Built to transform portfolio analytics from a manual process into an automated, professional-grade system.

*"This is the difference between 'I built a dashboard' and 'I built a system.'"*

---

**Version**: 10.1
**Release Date**: November 29, 2025
**Status**: Production Ready ✅
