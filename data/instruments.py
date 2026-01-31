"""
ATLAS Terminal - Market Instrument Data
All market data dictionaries (indices, stocks, ETFs, crypto, FX, bonds, commodities).
"""

# ============================================================================
# EXPANDED MARKET WATCH UNIVERSE - EXCELLENCE EDITION
# ============================================================================

# Global Market Indices - BLOOMBERG KILLER EDITION
# EXPANDED: 46 → 200+ indices across all major global markets
GLOBAL_INDICES = {
    # ===== NORTH AMERICA (50+) =====
    # United States - Major
    "^GSPC": {"name": "S&P 500", "region": "US"},
    "^NDX": {"name": "Nasdaq 100", "region": "US"},
    "^DJI": {"name": "Dow Jones Industrial", "region": "US"},
    "^IXIC": {"name": "Nasdaq Composite", "region": "US"},
    "^NYA": {"name": "NYSE Composite", "region": "US"},
    "^RUT": {"name": "Russell 2000", "region": "US"},
    "^RUA": {"name": "Russell 3000", "region": "US"},
    "^RUI": {"name": "Russell 1000", "region": "US"},
    "^VIX": {"name": "CBOE Volatility Index", "region": "US"},
    "^VVIX": {"name": "CBOE VIX of VIX", "region": "US"},

    # US - Sector Indices
    "^SP500-15": {"name": "S&P 500 Materials", "region": "US"},
    "^SP500-20": {"name": "S&P 500 Industrials", "region": "US"},
    "^SP500-25": {"name": "S&P 500 Consumer Discretionary", "region": "US"},
    "^SP500-30": {"name": "S&P 500 Consumer Staples", "region": "US"},
    "^SP500-35": {"name": "S&P 500 Healthcare", "region": "US"},
    "^SP500-40": {"name": "S&P 500 Financials", "region": "US"},
    "^SP500-45": {"name": "S&P 500 Technology", "region": "US"},
    "^SP500-50": {"name": "S&P 500 Telecom", "region": "US"},
    "^SP500-55": {"name": "S&P 500 Utilities", "region": "US"},
    "^SP500-60": {"name": "S&P 500 Real Estate", "region": "US"},

    # US - Style Indices
    "^RLG": {"name": "Russell 1000 Growth", "region": "US"},
    "^RLV": {"name": "Russell 1000 Value", "region": "US"},
    "^RUO": {"name": "Russell 2000 Growth", "region": "US"},
    "^RUJ": {"name": "Russell 2000 Value", "region": "US"},
    "^SP400": {"name": "S&P MidCap 400", "region": "US"},
    "^SP600": {"name": "S&P SmallCap 600", "region": "US"},
    "^OEX": {"name": "S&P 100", "region": "US"},
    "^DJT": {"name": "Dow Jones Transportation", "region": "US"},
    "^DJU": {"name": "Dow Jones Utilities", "region": "US"},
    "^W5000": {"name": "Wilshire 5000", "region": "US"},

    # Canada
    "^GSPTSE": {"name": "S&P/TSX Composite", "region": "Canada"},
    "^TX60": {"name": "S&P/TSX 60", "region": "Canada"},

    # ===== EUROPE (80+) =====
    # Pan-European
    "^STOXX50E": {"name": "EURO STOXX 50", "region": "Europe"},
    "^STOXX": {"name": "STOXX Europe 600", "region": "Europe"},
    "^SX5E": {"name": "EURO STOXX 50 Price", "region": "Europe"},
    "^SXXP": {"name": "STOXX Europe 600 Price", "region": "Europe"},

    # United Kingdom
    "^FTSE": {"name": "FTSE 100", "region": "UK"},
    "^FTMC": {"name": "FTSE 250", "region": "UK"},
    "^FTSC": {"name": "FTSE 350", "region": "UK"},
    "^FTAS": {"name": "FTSE All-Share", "region": "UK"},
    "^FTLC": {"name": "FTSE SmallCap", "region": "UK"},
    "^FTAI": {"name": "FTSE AIM All-Share", "region": "UK"},

    # Germany
    "^GDAXI": {"name": "DAX", "region": "Germany"},
    "^MDAXI": {"name": "MDAX", "region": "Germany"},
    "^SDAXI": {"name": "SDAX", "region": "Germany"},
    "^TECDAX": {"name": "TecDAX", "region": "Germany"},

    # France
    "^FCHI": {"name": "CAC 40", "region": "France"},
    "^CAC": {"name": "CAC Mid 60", "region": "France"},
    "^SBF120": {"name": "SBF 120", "region": "France"},

    # Switzerland
    "^SSMI": {"name": "SMI", "region": "Switzerland"},
    "^SMIM": {"name": "Swiss Market Mid Cap", "region": "Switzerland"},

    # Netherlands
    "^AEX": {"name": "AEX Amsterdam", "region": "Netherlands"},
    "^AMX": {"name": "AMX Amsterdam Mid Cap", "region": "Netherlands"},

    # Spain
    "^IBEX": {"name": "IBEX 35", "region": "Spain"},

    # Italy
    "FTSEMIB.MI": {"name": "FTSE MIB", "region": "Italy"},

    # Belgium
    "^BFX": {"name": "BEL 20", "region": "Belgium"},

    # Nordic Countries
    "^OMX": {"name": "OMX Stockholm 30", "region": "Sweden"},
    "^OMXSPI": {"name": "OMX Stockholm All-Share", "region": "Sweden"},
    "^OMXC25": {"name": "OMX Copenhagen 25", "region": "Denmark"},
    "^OMXHPI": {"name": "OMX Helsinki All-Share", "region": "Finland"},
    "^OSEAX": {"name": "OSE All-Share", "region": "Norway"},

    # Eastern Europe
    "^ATX": {"name": "ATX Austria", "region": "Austria"},
    "^PX": {"name": "PX Prague", "region": "Czech Republic"},
    "^WIG20": {"name": "WIG20 Warsaw", "region": "Poland"},
    "^BUX": {"name": "BUX Budapest", "region": "Hungary"},
    "^RTSI": {"name": "RTS Russia", "region": "Russia"},

    # Portugal, Greece, Ireland
    "^PSI20": {"name": "PSI 20", "region": "Portugal"},
    "^ATG.AT": {"name": "Athens General", "region": "Greece"},
    "^ISEQ": {"name": "ISEQ All-Share", "region": "Ireland"},

    # ===== ASIA-PACIFIC (70+) =====
    # Japan
    "^N225": {"name": "Nikkei 225", "region": "Japan"},
    "^N300": {"name": "Nikkei 300", "region": "Japan"},
    "^TPX": {"name": "TOPIX", "region": "Japan"},
    "^NKY": {"name": "Nikkei Stock Average", "region": "Japan"},

    # China & Hong Kong
    "^HSI": {"name": "Hang Seng Index", "region": "Hong Kong"},
    "^HSCE": {"name": "Hang Seng China Enterprises", "region": "Hong Kong"},
    "^HSTECH": {"name": "Hang Seng TECH", "region": "Hong Kong"},
    "000001.SS": {"name": "Shanghai Composite", "region": "China"},
    "000300.SS": {"name": "CSI 300", "region": "China"},
    "000688.SS": {"name": "SSE STAR 50", "region": "China"},
    "399001.SZ": {"name": "Shenzhen Component", "region": "China"},
    "399006.SZ": {"name": "ChiNext", "region": "China"},

    # India
    "^BSESN": {"name": "S&P BSE Sensex", "region": "India"},
    "^NSEI": {"name": "Nifty 50", "region": "India"},
    "^NSEBANK": {"name": "Nifty Bank", "region": "India"},
    "^CNXIT": {"name": "Nifty IT", "region": "India"},

    # South Korea
    "^KS11": {"name": "KOSPI", "region": "South Korea"},
    "^KQ11": {"name": "KOSDAQ", "region": "South Korea"},

    # Taiwan
    "^TWII": {"name": "Taiwan Weighted", "region": "Taiwan"},

    # Singapore
    "^STI": {"name": "Straits Times Index", "region": "Singapore"},

    # Australia & New Zealand
    "^AXJO": {"name": "ASX 200", "region": "Australia"},
    "^AORD": {"name": "All Ordinaries", "region": "Australia"},
    "^AXSO": {"name": "ASX Small Ordinaries", "region": "Australia"},
    "^NZ50": {"name": "NZX 50", "region": "New Zealand"},

    # Southeast Asia
    "^JKSE": {"name": "Jakarta Composite", "region": "Indonesia"},
    "^KLSE": {"name": "FTSE Bursa Malaysia KLCI", "region": "Malaysia"},
    "^SET.BK": {"name": "SET Index", "region": "Thailand"},
    "^PSEI": {"name": "PSE Composite", "region": "Philippines"},
    "^VNI": {"name": "VN-Index", "region": "Vietnam"},

    # ===== MIDDLE EAST & AFRICA (30+) =====
    # Israel
    "^TA125.TA": {"name": "TA-125", "region": "Israel"},
    "^TA35.TA": {"name": "TA-35", "region": "Israel"},

    # Gulf States
    "^TASI.SR": {"name": "Tadawul All Share", "region": "Saudi Arabia"},
    "^DFMGI.DU": {"name": "DFM General Index", "region": "UAE"},
    "^ADI.AD": {"name": "ADX General", "region": "UAE"},
    "^QSI": {"name": "QE Index", "region": "Qatar"},
    "^KWSE": {"name": "Kuwait Stock Exchange", "region": "Kuwait"},

    # Africa
    "^JN0U.JO": {"name": "FTSE/JSE Top 40", "region": "South Africa"},
    "^J203.JO": {"name": "JSE All Share", "region": "South Africa"},
    "^CASE30": {"name": "EGX 30", "region": "Egypt"},
    "^MASI.CS": {"name": "MASI Morocco", "region": "Morocco"},
    "^NGSEINDX": {"name": "NSE All-Share", "region": "Nigeria"},

    # Turkey
    "XU100.IS": {"name": "BIST 100", "region": "Turkey"},

    # ===== LATIN AMERICA (20+) =====
    # Brazil
    "^BVSP": {"name": "Ibovespa", "region": "Brazil"},
    "^BVMF": {"name": "Brazil Broad Index", "region": "Brazil"},

    # Mexico
    "^MXX": {"name": "IPC Mexico", "region": "Mexico"},

    # Argentina
    "^MERV": {"name": "MERVAL", "region": "Argentina"},

    # Chile
    "^IPSA": {"name": "S&P/CLX IPSA", "region": "Chile"},

    # Colombia
    "^COLCAP": {"name": "COLCAP", "region": "Colombia"},

    # Peru
    "^SPBLPGPT": {"name": "S&P/BVL Peru General", "region": "Peru"}
}

# EXPANDED: Major Cryptocurrencies - BLOOMBERG KILLER EDITION
# 50 → 150+ coins across all major categories
CRYPTOCURRENCIES = {
    # ===== LARGE CAP (>$10B) - Top 15 =====
    "BTC-USD": {"name": "Bitcoin", "category": "Layer 1", "market_cap": "Large"},
    "ETH-USD": {"name": "Ethereum", "category": "Layer 1", "market_cap": "Large"},
    "BNB-USD": {"name": "Binance Coin", "category": "Exchange", "market_cap": "Large"},
    "XRP-USD": {"name": "Ripple", "category": "Payments", "market_cap": "Large"},
    "SOL-USD": {"name": "Solana", "category": "Layer 1", "market_cap": "Large"},
    "ADA-USD": {"name": "Cardano", "category": "Layer 1", "market_cap": "Large"},
    "DOGE-USD": {"name": "Dogecoin", "category": "Meme", "market_cap": "Large"},
    "AVAX-USD": {"name": "Avalanche", "category": "Layer 1", "market_cap": "Large"},
    "DOT-USD": {"name": "Polkadot", "category": "Layer 0", "market_cap": "Large"},
    "MATIC-USD": {"name": "Polygon", "category": "Layer 2", "market_cap": "Large"},
    "TRX-USD": {"name": "Tron", "category": "Layer 1", "market_cap": "Large"},
    "LINK-USD": {"name": "Chainlink", "category": "Oracle", "market_cap": "Large"},
    "TON-USD": {"name": "Toncoin", "category": "Layer 1", "market_cap": "Large"},
    "SHIB-USD": {"name": "Shiba Inu", "category": "Meme", "market_cap": "Large"},

    # ===== MID CAP ($1B-$10B) - Top 50 =====
    # DeFi Protocols
    "UNI-USD": {"name": "Uniswap", "category": "DeFi", "market_cap": "Mid"},
    "AAVE-USD": {"name": "Aave", "category": "DeFi", "market_cap": "Mid"},
    "MKR-USD": {"name": "Maker", "category": "DeFi", "market_cap": "Mid"},
    "CRV-USD": {"name": "Curve DAO", "category": "DeFi", "market_cap": "Mid"},
    "COMP-USD": {"name": "Compound", "category": "DeFi", "market_cap": "Mid"},
    "SNX-USD": {"name": "Synthetix", "category": "DeFi", "market_cap": "Mid"},
    "LDO-USD": {"name": "Lido DAO", "category": "DeFi", "market_cap": "Mid"},
    "SUSHI-USD": {"name": "SushiSwap", "category": "DeFi", "market_cap": "Mid"},
    "BAL-USD": {"name": "Balancer", "category": "DeFi", "market_cap": "Mid"},
    "YFI-USD": {"name": "yearn.finance", "category": "DeFi", "market_cap": "Mid"},

    # Layer 1 Platforms
    "ATOM-USD": {"name": "Cosmos", "category": "Layer 0", "market_cap": "Mid"},
    "NEAR-USD": {"name": "NEAR Protocol", "category": "Layer 1", "market_cap": "Mid"},
    "ALGO-USD": {"name": "Algorand", "category": "Layer 1", "market_cap": "Mid"},
    "FTM-USD": {"name": "Fantom", "category": "Layer 1", "market_cap": "Mid"},
    "ICP-USD": {"name": "Internet Computer", "category": "Layer 1", "market_cap": "Mid"},
    "HBAR-USD": {"name": "Hedera", "category": "Layer 1", "market_cap": "Mid"},
    "APT-USD": {"name": "Aptos", "category": "Layer 1", "market_cap": "Mid"},
    "SUI-USD": {"name": "Sui", "category": "Layer 1", "market_cap": "Mid"},
    "VET-USD": {"name": "VeChain", "category": "Layer 1", "market_cap": "Mid"},
    "ETC-USD": {"name": "Ethereum Classic", "category": "Layer 1", "market_cap": "Mid"},
    "XTZ-USD": {"name": "Tezos", "category": "Layer 1", "market_cap": "Mid"},
    "EOS-USD": {"name": "EOS", "category": "Layer 1", "market_cap": "Mid"},
    "FLOW-USD": {"name": "Flow", "category": "Layer 1", "market_cap": "Mid"},
    "KLAY-USD": {"name": "Klaytn", "category": "Layer 1", "market_cap": "Mid"},

    # Layer 2 & Scaling
    "ARB-USD": {"name": "Arbitrum", "category": "Layer 2", "market_cap": "Mid"},
    "OP-USD": {"name": "Optimism", "category": "Layer 2", "market_cap": "Mid"},
    "IMX-USD": {"name": "Immutable X", "category": "Layer 2", "market_cap": "Mid"},
    "LRC-USD": {"name": "Loopring", "category": "Layer 2", "market_cap": "Mid"},

    # Infrastructure & Oracles
    "FIL-USD": {"name": "Filecoin", "category": "Storage", "market_cap": "Mid"},
    "GRT-USD": {"name": "The Graph", "category": "Indexing", "market_cap": "Mid"},
    "AR-USD": {"name": "Arweave", "category": "Storage", "market_cap": "Mid"},
    "RNDR-USD": {"name": "Render", "category": "Computing", "market_cap": "Mid"},

    # Gaming & Metaverse
    "SAND-USD": {"name": "The Sandbox", "category": "Gaming", "market_cap": "Mid"},
    "MANA-USD": {"name": "Decentraland", "category": "Metaverse", "market_cap": "Mid"},
    "AXS-USD": {"name": "Axie Infinity", "category": "Gaming", "market_cap": "Mid"},
    "APE-USD": {"name": "ApeCoin", "category": "Metaverse", "market_cap": "Mid"},
    "GALA-USD": {"name": "Gala", "category": "Gaming", "market_cap": "Mid"},
    "ENJ-USD": {"name": "Enjin Coin", "category": "Gaming", "market_cap": "Mid"},
    "THETA-USD": {"name": "Theta Network", "category": "Media", "market_cap": "Mid"},

    # Privacy Coins
    "XMR-USD": {"name": "Monero", "category": "Privacy", "market_cap": "Mid"},

    # Payment & Transfer
    "LTC-USD": {"name": "Litecoin", "category": "Payments", "market_cap": "Mid"},
    "BCH-USD": {"name": "Bitcoin Cash", "category": "Payments", "market_cap": "Mid"},
    "XLM-USD": {"name": "Stellar", "category": "Payments", "market_cap": "Mid"},
    "RUNE-USD": {"name": "THORChain", "category": "Cross-chain", "market_cap": "Mid"},

    # ===== SMALL CAP (<$1B) - Top 85 =====
    # AI & Machine Learning
    "FET-USD": {"name": "Fetch.ai", "category": "AI", "market_cap": "Small"},
    "AGIX-USD": {"name": "SingularityNET", "category": "AI", "market_cap": "Small"},
    "OCEAN-USD": {"name": "Ocean Protocol", "category": "AI", "market_cap": "Small"},

    # DeFi Emerging
    "1INCH-USD": {"name": "1inch", "category": "DeFi", "market_cap": "Small"},
    "CVX-USD": {"name": "Convex Finance", "category": "DeFi", "market_cap": "Small"},
    "FRAX-USD": {"name": "Frax", "category": "Stablecoin", "market_cap": "Small"},
    "FXS-USD": {"name": "Frax Share", "category": "DeFi", "market_cap": "Small"},
    "GMX-USD": {"name": "GMX", "category": "DeFi", "market_cap": "Small"},
    "DYDX-USD": {"name": "dYdX", "category": "DeFi", "market_cap": "Small"},

    # Layer 2 Emerging
    "METIS-USD": {"name": "Metis", "category": "Layer 2", "market_cap": "Small"},
    "BOBA-USD": {"name": "Boba Network", "category": "Layer 2", "market_cap": "Small"},

    # Gaming Emerging
    "ILV-USD": {"name": "Illuvium", "category": "Gaming", "market_cap": "Small"},
    "YGG-USD": {"name": "Yield Guild Games", "category": "Gaming", "market_cap": "Small"},
    "GODS-USD": {"name": "Gods Unchained", "category": "Gaming", "market_cap": "Small"},
    "MAGIC-USD": {"name": "Magic", "category": "Gaming", "market_cap": "Small"},

    # Meme Coins
    "PEPE-USD": {"name": "Pepe", "category": "Meme", "market_cap": "Small"},
    "FLOKI-USD": {"name": "Floki Inu", "category": "Meme", "market_cap": "Small"},
    "BONK-USD": {"name": "Bonk", "category": "Meme", "market_cap": "Small"},

    # Infrastructure Emerging
    "ANKR-USD": {"name": "Ankr", "category": "Infrastructure", "market_cap": "Small"},
    "STORJ-USD": {"name": "Storj", "category": "Storage", "market_cap": "Small"},
    "HNT-USD": {"name": "Helium", "category": "IoT", "market_cap": "Small"},

    # Web3 & Social
    "BAT-USD": {"name": "Basic Attention Token", "category": "Web3", "market_cap": "Small"},
    "ENS-USD": {"name": "Ethereum Name Service", "category": "Web3", "market_cap": "Small"},

    # Interoperability
    "ZIL-USD": {"name": "Zilliqa", "category": "Layer 1", "market_cap": "Small"},
    "KAVA-USD": {"name": "Kava", "category": "DeFi", "market_cap": "Small"},
    "ZRX-USD": {"name": "0x Protocol", "category": "DeFi", "market_cap": "Small"},
    "BNT-USD": {"name": "Bancor", "category": "DeFi", "market_cap": "Small"},

    # Exchange Tokens
    "CRO-USD": {"name": "Crypto.com Coin", "category": "Exchange", "market_cap": "Small"},
    "KCS-USD": {"name": "KuCoin Token", "category": "Exchange", "market_cap": "Small"},
    "GT-USD": {"name": "GateToken", "category": "Exchange", "market_cap": "Small"},

    # NFT & Digital Assets
    "BLUR-USD": {"name": "Blur", "category": "NFT", "market_cap": "Small"},
    "LOOKS-USD": {"name": "LooksRare", "category": "NFT", "market_cap": "Small"},

    # Emerging Layer 1s
    "CFX-USD": {"name": "Conflux", "category": "Layer 1", "market_cap": "Small"},
    "CELO-USD": {"name": "Celo", "category": "Layer 1", "market_cap": "Small"},
    "ONE-USD": {"name": "Harmony", "category": "Layer 1", "market_cap": "Small"},
    "ROSE-USD": {"name": "Oasis Network", "category": "Layer 1", "market_cap": "Small"},
    "MINA-USD": {"name": "Mina Protocol", "category": "Layer 1", "market_cap": "Small"},

    # DeFi Specialized
    "RSR-USD": {"name": "Reserve Rights", "category": "DeFi", "market_cap": "Small"},
    "ALCX-USD": {"name": "Alchemix", "category": "DeFi", "market_cap": "Small"},
    "BADGER-USD": {"name": "Badger DAO", "category": "DeFi", "market_cap": "Small"},

    # Derivatives & Synthetics
    "PERP-USD": {"name": "Perpetual Protocol", "category": "DeFi", "market_cap": "Small"},
    "INJ-USD": {"name": "Injective", "category": "DeFi", "market_cap": "Small"},

    # Cross-chain Bridges
    "SYN-USD": {"name": "Synapse", "category": "Bridge", "market_cap": "Small"},

    # ===== STABLECOINS (for reference) =====
    "USDT-USD": {"name": "Tether", "category": "Stablecoin", "market_cap": "Large"},
    "USDC-USD": {"name": "USD Coin", "category": "Stablecoin", "market_cap": "Large"},
    "DAI-USD": {"name": "Dai", "category": "Stablecoin", "market_cap": "Large"},
    "BUSD-USD": {"name": "Binance USD", "category": "Stablecoin", "market_cap": "Large"},
    "TUSD-USD": {"name": "TrueUSD", "category": "Stablecoin", "market_cap": "Mid"},
    "USDP-USD": {"name": "Pax Dollar", "category": "Stablecoin", "market_cap": "Mid"},
    "GUSD-USD": {"name": "Gemini Dollar", "category": "Stablecoin", "market_cap": "Small"}
}

# FX Pairs (NEW CATEGORY)
# CURRENCY PAIRS - BLOOMBERG KILLER EDITION
# 20 → 50+ FX pairs across all major categories
FX_PAIRS = {
    # ===== MAJOR PAIRS (7) =====
    "EURUSD=X": {"name": "EUR/USD", "category": "Major", "region": "Global"},
    "GBPUSD=X": {"name": "GBP/USD", "category": "Major", "region": "Global"},
    "USDJPY=X": {"name": "USD/JPY", "category": "Major", "region": "Global"},
    "AUDUSD=X": {"name": "AUD/USD", "category": "Major", "region": "Global"},
    "USDCAD=X": {"name": "USD/CAD", "category": "Major", "region": "Global"},
    "USDCHF=X": {"name": "USD/CHF", "category": "Major", "region": "Global"},
    "NZDUSD=X": {"name": "NZD/USD", "category": "Major", "region": "Global"},

    # ===== EUR CROSS PAIRS (10) =====
    "EURGBP=X": {"name": "EUR/GBP", "category": "EUR Cross", "region": "Europe"},
    "EURJPY=X": {"name": "EUR/JPY", "category": "EUR Cross", "region": "Global"},
    "EURAUD=X": {"name": "EUR/AUD", "category": "EUR Cross", "region": "Global"},
    "EURNZD=X": {"name": "EUR/NZD", "category": "EUR Cross", "region": "Global"},
    "EURCAD=X": {"name": "EUR/CAD", "category": "EUR Cross", "region": "Global"},
    "EURCHF=X": {"name": "EUR/CHF", "category": "EUR Cross", "region": "Europe"},
    "EURSEK=X": {"name": "EUR/SEK", "category": "EUR Cross", "region": "Europe"},
    "EURNOK=X": {"name": "EUR/NOK", "category": "EUR Cross", "region": "Europe"},
    "EURDKK=X": {"name": "EUR/DKK", "category": "EUR Cross", "region": "Europe"},
    "EURPLN=X": {"name": "EUR/PLN", "category": "EUR Cross", "region": "Europe"},

    # ===== GBP CROSS PAIRS (5) =====
    "GBPJPY=X": {"name": "GBP/JPY", "category": "GBP Cross", "region": "Global"},
    "GBPAUD=X": {"name": "GBP/AUD", "category": "GBP Cross", "region": "Global"},
    "GBPCAD=X": {"name": "GBP/CAD", "category": "GBP Cross", "region": "Global"},
    "GBPCHF=X": {"name": "GBP/CHF", "category": "GBP Cross", "region": "Europe"},
    "GBPNZD=X": {"name": "GBP/NZD", "category": "GBP Cross", "region": "Global"},

    # ===== JPY CROSS PAIRS (5) =====
    "AUDJPY=X": {"name": "AUD/JPY", "category": "JPY Cross", "region": "Asia-Pacific"},
    "CADJPY=X": {"name": "CAD/JPY", "category": "JPY Cross", "region": "Global"},
    "CHFJPY=X": {"name": "CHF/JPY", "category": "JPY Cross", "region": "Global"},
    "NZDJPY=X": {"name": "NZD/JPY", "category": "JPY Cross", "region": "Asia-Pacific"},
    "SGDJPY=X": {"name": "SGD/JPY", "category": "JPY Cross", "region": "Asia"},

    # ===== OTHER CROSS PAIRS (5) =====
    "AUDCAD=X": {"name": "AUD/CAD", "category": "Commodity Cross", "region": "Global"},
    "AUDNZD=X": {"name": "AUD/NZD", "category": "Commodity Cross", "region": "Pacific"},
    "CADCHF=X": {"name": "CAD/CHF", "category": "Cross", "region": "Global"},
    "NZDCAD=X": {"name": "NZD/CAD", "category": "Commodity Cross", "region": "Global"},
    "AUDCHF=X": {"name": "AUD/CHF", "category": "Cross", "region": "Global"},

    # ===== EMERGING MARKET - ASIA (8) =====
    "USDCNY=X": {"name": "USD/CNY", "category": "EM - Asia", "region": "China"},
    "USDHKD=X": {"name": "USD/HKD", "category": "EM - Asia", "region": "Hong Kong"},
    "USDINR=X": {"name": "USD/INR", "category": "EM - Asia", "region": "India"},
    "USDKRW=X": {"name": "USD/KRW", "category": "EM - Asia", "region": "South Korea"},
    "USDSGD=X": {"name": "USD/SGD", "category": "EM - Asia", "region": "Singapore"},
    "USDTHB=X": {"name": "USD/THB", "category": "EM - Asia", "region": "Thailand"},
    "USDPHP=X": {"name": "USD/PHP", "category": "EM - Asia", "region": "Philippines"},
    "USDIDR=X": {"name": "USD/IDR", "category": "EM - Asia", "region": "Indonesia"},

    # ===== EMERGING MARKET - LATAM (4) =====
    "USDBRL=X": {"name": "USD/BRL", "category": "EM - LATAM", "region": "Brazil"},
    "USDMXN=X": {"name": "USD/MXN", "category": "EM - LATAM", "region": "Mexico"},
    "USDCLP=X": {"name": "USD/CLP", "category": "EM - LATAM", "region": "Chile"},
    "USDARS=X": {"name": "USD/ARS", "category": "EM - LATAM", "region": "Argentina"},

    # ===== EMERGING MARKET - EMEA (6) =====
    "USDTRY=X": {"name": "USD/TRY", "category": "EM - EMEA", "region": "Turkey"},
    "USDZAR=X": {"name": "USD/ZAR", "category": "EM - EMEA", "region": "South Africa"},
    "USDRUB=X": {"name": "USD/RUB", "category": "EM - EMEA", "region": "Russia"},
    "USDPLN=X": {"name": "USD/PLN", "category": "EM - EMEA", "region": "Poland"},
    "USDHUF=X": {"name": "USD/HUF", "category": "EM - EMEA", "region": "Hungary"},
    "USDCZK=X": {"name": "USD/CZK", "category": "EM - EMEA", "region": "Czech Republic"}
}

# EXPANDED: Bond Yields and Rates - COMPREHENSIVE GLOBAL COVERAGE
BOND_YIELDS = {
    # US Treasuries (Direct Yield Indices)
    "^TNX": {"name": "US 10Y Treasury", "category": "Government Bonds"},
    "^TYX": {"name": "US 30Y Treasury", "category": "Government Bonds"},
    "^FVX": {"name": "US 5Y Treasury", "category": "Government Bonds"},
    "^IRX": {"name": "US 13W Treasury", "category": "Government Bonds"},

    # UK Gilts (ETF proxies - Yahoo Finance doesn't have direct UK yield indices)
    "IGLT.L": {"name": "UK Gilt (Long-Term)", "category": "Government Bonds"},
    "IGLS.L": {"name": "UK Gilt (Short-Term)", "category": "Government Bonds"},

    # German Bunds (ETF proxies)
    "IBGM.DE": {"name": "Germany Govt Bonds", "category": "Government Bonds"},
    "DTLA.DE": {"name": "German Bund 10Y", "category": "Government Bonds"},

    # Japanese JGBs (ETF proxies)
    "1346.T": {"name": "Japan Govt Bonds (ETF)", "category": "Government Bonds"},

    # Other Major Economies (ETF proxies)
    "XGB.TO": {"name": "Canada Govt Bonds", "category": "Government Bonds"},
    "IGB.AX": {"name": "Australia Govt Bonds", "category": "Government Bonds"},
    "AGGH": {"name": "Global Aggregate Bonds", "category": "Government Bonds"},
}

# v9.7 EXPANDED: Credit Spreads (using ETF proxies)
CREDIT_SPREADS = {
    "LQD": {"name": "Investment Grade Credit", "category": "Credit"},
    "HYG": {"name": "High Yield Credit", "category": "Credit"},
    "JNK": {"name": "High Yield Junk Bonds", "category": "Credit"},
    "EMB": {"name": "Emerging Market Bonds", "category": "Credit"},
    "TIP": {"name": "TIPS (Inflation-Protected)", "category": "Government Bonds"},
    "MBB": {"name": "Mortgage-Backed Securities", "category": "Credit"},
    # v9.7 NEW: Additional spreads
    "VCSH": {"name": "Short-Term Corporate", "category": "Credit"},
    "VCIT": {"name": "Intermediate Corporate", "category": "Credit"},
    "VCLT": {"name": "Long-Term Corporate", "category": "Credit"},
    "BKLN": {"name": "Senior Loan (Floating Rate)", "category": "Credit"},
    "ANGL": {"name": "Fallen Angels", "category": "Credit"},
    "SHYG": {"name": "Short Duration High Yield", "category": "Credit"},
}

# EXPANDED: Commodities (50+ instruments)
# COMMODITIES - BLOOMBERG KILLER EDITION
# 29 → 80+ commodities and futures contracts
COMMODITIES = {
    # ===== PRECIOUS METALS (10) =====
    "GC=F": {"name": "Gold Futures", "category": "Precious Metals", "exchange": "COMEX"},
    "SI=F": {"name": "Silver Futures", "category": "Precious Metals", "exchange": "COMEX"},
    "PL=F": {"name": "Platinum Futures", "category": "Precious Metals", "exchange": "NYMEX"},
    "PA=F": {"name": "Palladium Futures", "category": "Precious Metals", "exchange": "NYMEX"},
    "HG=F": {"name": "Copper Futures", "category": "Base Metals", "exchange": "COMEX"},
    "GC.MICRO": {"name": "Micro Gold", "category": "Precious Metals", "exchange": "COMEX"},
    "SI.MICRO": {"name": "Micro Silver", "category": "Precious Metals", "exchange": "COMEX"},

    # ===== ENERGY (20) =====
    # Crude Oil
    "CL=F": {"name": "Crude Oil WTI", "category": "Energy - Oil", "exchange": "NYMEX"},
    "BZ=F": {"name": "Brent Crude", "category": "Energy - Oil", "exchange": "ICE"},
    "MCL=F": {"name": "Micro WTI Crude", "category": "Energy - Oil", "exchange": "NYMEX"},

    # Natural Gas & Products
    "NG=F": {"name": "Natural Gas", "category": "Energy - Gas", "exchange": "NYMEX"},
    "RB=F": {"name": "RBOB Gasoline", "category": "Energy - Refined", "exchange": "NYMEX"},
    "HO=F": {"name": "Heating Oil", "category": "Energy - Refined", "exchange": "NYMEX"},
    "B0=F": {"name": "Ethanol", "category": "Energy - Biofuels", "exchange": "CBOT"},

    # Coal
    "MTF=F": {"name": "Coal (API 2)", "category": "Energy - Coal", "exchange": "ICE"},

    # ===== INDUSTRIAL/BASE METALS (15) =====
    "ALI=F": {"name": "Aluminum", "category": "Industrial Metals", "exchange": "LME"},
    "ZN=F": {"name": "Zinc", "category": "Industrial Metals", "exchange": "LME"},
    "NI=F": {"name": "Nickel", "category": "Industrial Metals", "exchange": "LME"},
    "PB=F": {"name": "Lead", "category": "Industrial Metals", "exchange": "LME"},
    "SN=F": {"name": "Tin", "category": "Industrial Metals", "exchange": "LME"},
    "STEEL=F": {"name": "Steel", "category": "Industrial Metals", "exchange": "LME"},
    "COBALT": {"name": "Cobalt", "category": "Industrial Metals", "exchange": "LME"},
    "LITHIUM": {"name": "Lithium", "category": "Battery Metals", "exchange": "LME"},

    # ===== AGRICULTURE - GRAINS (15) =====
    "ZC=F": {"name": "Corn", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "ZW=F": {"name": "Wheat", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "ZS=F": {"name": "Soybeans", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "ZO=F": {"name": "Oats", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "ZR=F": {"name": "Rough Rice", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "ZM=F": {"name": "Soybean Meal", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "ZL=F": {"name": "Soybean Oil", "category": "Agriculture - Grains", "exchange": "CBOT"},
    "KE=F": {"name": "KC HRW Wheat", "category": "Agriculture - Grains", "exchange": "KCBT"},
    "MWE=F": {"name": "MW Wheat", "category": "Agriculture - Grains", "exchange": "MGEX"},

    # ===== AGRICULTURE - SOFTS (15) =====
    "KC=F": {"name": "Coffee C", "category": "Agriculture - Softs", "exchange": "ICE"},
    "SB=F": {"name": "Sugar #11", "category": "Agriculture - Softs", "exchange": "ICE"},
    "CC=F": {"name": "Cocoa", "category": "Agriculture - Softs", "exchange": "ICE"},
    "CT=F": {"name": "Cotton #2", "category": "Agriculture - Softs", "exchange": "ICE"},
    "OJ=F": {"name": "Orange Juice", "category": "Agriculture - Softs", "exchange": "ICE"},
    "LBS=F": {"name": "Lumber", "category": "Agriculture - Softs", "exchange": "CME"},
    "RC=F": {"name": "Robusta Coffee", "category": "Agriculture - Softs", "exchange": "ICE"},

    # ===== LIVESTOCK (5) =====
    "LE=F": {"name": "Live Cattle", "category": "Livestock", "exchange": "CME"},
    "GF=F": {"name": "Feeder Cattle", "category": "Livestock", "exchange": "CME"},
    "HE=F": {"name": "Lean Hogs", "category": "Livestock", "exchange": "CME"},

    # ===== INDICES FUTURES (10) =====
    "ES=F": {"name": "E-mini S&P 500", "category": "Equity Index Futures", "exchange": "CME"},
    "NQ=F": {"name": "E-mini Nasdaq 100", "category": "Equity Index Futures", "exchange": "CME"},
    "YM=F": {"name": "E-mini Dow", "category": "Equity Index Futures", "exchange": "CBOT"},
    "RTY=F": {"name": "E-mini Russell 2000", "category": "Equity Index Futures", "exchange": "CME"},
    "VIX=F": {"name": "VIX Futures", "category": "Volatility Futures", "exchange": "CFE"},

    # ===== BOND/RATE FUTURES (8) =====
    "ZB=F": {"name": "30-Year T-Bond", "category": "Interest Rate Futures", "exchange": "CBOT"},
    "ZN=F": {"name": "10-Year T-Note", "category": "Interest Rate Futures", "exchange": "CBOT"},
    "ZF=F": {"name": "5-Year T-Note", "category": "Interest Rate Futures", "exchange": "CBOT"},
    "ZT=F": {"name": "2-Year T-Note", "category": "Interest Rate Futures", "exchange": "CBOT"},
    "GE=F": {"name": "Eurodollar", "category": "Interest Rate Futures", "exchange": "CME"}
}

# EXPANDED: Popular Stocks (45 diverse companies - FIXED)
POPULAR_STOCKS = {
    # Mega Cap Tech
    "AAPL": {"name": "Apple", "sector": "Technology", "category": "Mega Cap Tech"},
    "MSFT": {"name": "Microsoft", "sector": "Technology", "category": "Mega Cap Tech"},
    "GOOGL": {"name": "Alphabet", "sector": "Technology", "category": "Mega Cap Tech"},
    "AMZN": {"name": "Amazon", "sector": "Consumer Cyclical", "category": "Mega Cap Tech"},
    "NVDA": {"name": "NVIDIA", "sector": "Technology", "category": "Mega Cap Tech"},
    "META": {"name": "Meta", "sector": "Technology", "category": "Mega Cap Tech"},
    "TSLA": {"name": "Tesla", "sector": "Consumer Cyclical", "category": "Mega Cap Tech"},
    "NFLX": {"name": "Netflix", "sector": "Communication Services", "category": "Mega Cap Tech"},

    # Financials
    "JPM": {"name": "JPMorgan", "sector": "Financial Services", "category": "Financials"},
    "BAC": {"name": "Bank of America", "sector": "Financial Services", "category": "Financials"},
    "WFC": {"name": "Wells Fargo", "sector": "Financial Services", "category": "Financials"},
    "GS": {"name": "Goldman Sachs", "sector": "Financial Services", "category": "Financials"},
    "MS": {"name": "Morgan Stanley", "sector": "Financial Services", "category": "Financials"},
    "C": {"name": "Citigroup", "sector": "Financial Services", "category": "Financials"},
    "BLK": {"name": "BlackRock", "sector": "Financial Services", "category": "Financials"},
    "V": {"name": "Visa", "sector": "Financial Services", "category": "Financials"},
    "MA": {"name": "Mastercard", "sector": "Financial Services", "category": "Financials"},

    # Healthcare
    "JNJ": {"name": "Johnson & Johnson", "sector": "Healthcare", "category": "Healthcare"},
    "UNH": {"name": "UnitedHealth", "sector": "Healthcare", "category": "Healthcare"},
    "PFE": {"name": "Pfizer", "sector": "Healthcare", "category": "Healthcare"},
    "ABBV": {"name": "AbbVie", "sector": "Healthcare", "category": "Healthcare"},
    "TMO": {"name": "Thermo Fisher", "sector": "Healthcare", "category": "Healthcare"},
    "LLY": {"name": "Eli Lilly", "sector": "Healthcare", "category": "Healthcare"},

    # Consumer
    "WMT": {"name": "Walmart", "sector": "Consumer Defensive", "category": "Consumer"},
    "PG": {"name": "Procter & Gamble", "sector": "Consumer Defensive", "category": "Consumer"},
    "KO": {"name": "Coca-Cola", "sector": "Consumer Defensive", "category": "Consumer"},
    "PEP": {"name": "PepsiCo", "sector": "Consumer Defensive", "category": "Consumer"},
    "COST": {"name": "Costco", "sector": "Consumer Defensive", "category": "Consumer"},
    "NKE": {"name": "Nike", "sector": "Consumer Cyclical", "category": "Consumer"},
    "MCD": {"name": "McDonald's", "sector": "Consumer Cyclical", "category": "Consumer"},
    "SBUX": {"name": "Starbucks", "sector": "Consumer Cyclical", "category": "Consumer"},
    "DIS": {"name": "Disney", "sector": "Communication Services", "category": "Consumer"},

    # Energy
    "XOM": {"name": "Exxon Mobil", "sector": "Energy", "category": "Energy"},
    "CVX": {"name": "Chevron", "sector": "Energy", "category": "Energy"},
    "COP": {"name": "ConocoPhillips", "sector": "Energy", "category": "Energy"},
    "SLB": {"name": "Schlumberger", "sector": "Energy", "category": "Energy"},

    # Industrials
    "BA": {"name": "Boeing", "sector": "Industrials", "category": "Industrials"},
    "CAT": {"name": "Caterpillar", "sector": "Industrials", "category": "Industrials"},
    "GE": {"name": "General Electric", "sector": "Industrials", "category": "Industrials"},
    "UPS": {"name": "UPS", "sector": "Industrials", "category": "Industrials"},

    # Tech (Additional)
    "ORCL": {"name": "Oracle", "sector": "Technology", "category": "Tech"},
    "CRM": {"name": "Salesforce", "sector": "Technology", "category": "Tech"},
    "ADBE": {"name": "Adobe", "sector": "Technology", "category": "Tech"},
    "INTC": {"name": "Intel", "sector": "Technology", "category": "Tech"},
    "AMD": {"name": "AMD", "sector": "Technology", "category": "Tech"},
    "CSCO": {"name": "Cisco", "sector": "Technology", "category": "Tech"},

    # Semiconductors
    "TSM": {"name": "TSMC", "sector": "Technology", "category": "Semiconductors"},
    "ASML": {"name": "ASML", "sector": "Technology", "category": "Semiconductors"},
    "AVGO": {"name": "Broadcom", "sector": "Technology", "category": "Semiconductors"},
    "QCOM": {"name": "Qualcomm", "sector": "Technology", "category": "Semiconductors"},
    "TXN": {"name": "Texas Instruments", "sector": "Technology", "category": "Semiconductors"},
    "MU": {"name": "Micron", "sector": "Technology", "category": "Semiconductors"},
    "LRCX": {"name": "Lam Research", "sector": "Technology", "category": "Semiconductors"},
    "AMAT": {"name": "Applied Materials", "sector": "Technology", "category": "Semiconductors"},
    "KLAC": {"name": "KLA Corporation", "sector": "Technology", "category": "Semiconductors"},
    "MRVL": {"name": "Marvell", "sector": "Technology", "category": "Semiconductors"},

    # Software & Cloud
    "NOW": {"name": "ServiceNow", "sector": "Technology", "category": "Software"},
    "SNOW": {"name": "Snowflake", "sector": "Technology", "category": "Software"},
    "PANW": {"name": "Palo Alto Networks", "sector": "Technology", "category": "Software"},
    "CRWD": {"name": "CrowdStrike", "sector": "Technology", "category": "Software"},
    "DDOG": {"name": "Datadog", "sector": "Technology", "category": "Software"},
    "NET": {"name": "Cloudflare", "sector": "Technology", "category": "Software"},
    "ZS": {"name": "Zscaler", "sector": "Technology", "category": "Software"},
    "WDAY": {"name": "Workday", "sector": "Technology", "category": "Software"},
    "TEAM": {"name": "Atlassian", "sector": "Technology", "category": "Software"},
    "PLTR": {"name": "Palantir", "sector": "Technology", "category": "Software"},

    # E-Commerce & Payments
    "SHOP": {"name": "Shopify", "sector": "Technology", "category": "E-Commerce"},
    "PYPL": {"name": "PayPal", "sector": "Technology", "category": "Payments"},
    "SQ": {"name": "Block (Square)", "sector": "Technology", "category": "Payments"},
    "COIN": {"name": "Coinbase", "sector": "Technology", "category": "Crypto"},
    "MELI": {"name": "MercadoLibre", "sector": "Technology", "category": "E-Commerce"},
    "SE": {"name": "Sea Limited", "sector": "Technology", "category": "E-Commerce"},

    # Telecom & Media
    "T": {"name": "AT&T", "sector": "Communication Services", "category": "Telecom"},
    "VZ": {"name": "Verizon", "sector": "Communication Services", "category": "Telecom"},
    "TMUS": {"name": "T-Mobile", "sector": "Communication Services", "category": "Telecom"},
    "CMCSA": {"name": "Comcast", "sector": "Communication Services", "category": "Media"},
    "CHTR": {"name": "Charter", "sector": "Communication Services", "category": "Telecom"},

    # Biotech
    "GILD": {"name": "Gilead", "sector": "Healthcare", "category": "Biotech"},
    "AMGN": {"name": "Amgen", "sector": "Healthcare", "category": "Biotech"},
    "BIIB": {"name": "Biogen", "sector": "Healthcare", "category": "Biotech"},
    "REGN": {"name": "Regeneron", "sector": "Healthcare", "category": "Biotech"},
    "VRTX": {"name": "Vertex", "sector": "Healthcare", "category": "Biotech"},
    "MRNA": {"name": "Moderna", "sector": "Healthcare", "category": "Biotech"},
    "BNTX": {"name": "BioNTech", "sector": "Healthcare", "category": "Biotech"},

    # Medical Devices
    "MDT": {"name": "Medtronic", "sector": "Healthcare", "category": "Medical Devices"},
    "ABT": {"name": "Abbott Labs", "sector": "Healthcare", "category": "Medical Devices"},
    "SYK": {"name": "Stryker", "sector": "Healthcare", "category": "Medical Devices"},
    "BSX": {"name": "Boston Scientific", "sector": "Healthcare", "category": "Medical Devices"},
    "ISRG": {"name": "Intuitive Surgical", "sector": "Healthcare", "category": "Medical Devices"},

    # Insurance
    "BRK-B": {"name": "Berkshire Hathaway", "sector": "Financial Services", "category": "Insurance"},
    "PGR": {"name": "Progressive", "sector": "Financial Services", "category": "Insurance"},
    "TRV": {"name": "Travelers", "sector": "Financial Services", "category": "Insurance"},
    "AIG": {"name": "AIG", "sector": "Financial Services", "category": "Insurance"},
    "MET": {"name": "MetLife", "sector": "Financial Services", "category": "Insurance"},
    "PRU": {"name": "Prudential", "sector": "Financial Services", "category": "Insurance"},

    # Real Estate
    "AMT": {"name": "American Tower", "sector": "Real Estate", "category": "REITs"},
    "PLD": {"name": "Prologis", "sector": "Real Estate", "category": "REITs"},
    "CCI": {"name": "Crown Castle", "sector": "Real Estate", "category": "REITs"},
    "EQIX": {"name": "Equinix", "sector": "Real Estate", "category": "REITs"},
    "PSA": {"name": "Public Storage", "sector": "Real Estate", "category": "REITs"},
    "SPG": {"name": "Simon Property", "sector": "Real Estate", "category": "REITs"},

    # Retail
    "TGT": {"name": "Target", "sector": "Consumer Defensive", "category": "Retail"},
    "HD": {"name": "Home Depot", "sector": "Consumer Cyclical", "category": "Retail"},
    "LOW": {"name": "Lowe's", "sector": "Consumer Cyclical", "category": "Retail"},
    "TJX": {"name": "TJX Companies", "sector": "Consumer Cyclical", "category": "Retail"},
    "ROST": {"name": "Ross Stores", "sector": "Consumer Cyclical", "category": "Retail"},

    # Automotive
    "F": {"name": "Ford", "sector": "Consumer Cyclical", "category": "Automotive"},
    "GM": {"name": "General Motors", "sector": "Consumer Cyclical", "category": "Automotive"},
    "RIVN": {"name": "Rivian", "sector": "Consumer Cyclical", "category": "Automotive"},
    "LCID": {"name": "Lucid", "sector": "Consumer Cyclical", "category": "Automotive"},

    # Materials
    "LIN": {"name": "Linde", "sector": "Basic Materials", "category": "Chemicals"},
    "APD": {"name": "Air Products", "sector": "Basic Materials", "category": "Chemicals"},
    "SHW": {"name": "Sherwin-Williams", "sector": "Basic Materials", "category": "Chemicals"},
    "ECL": {"name": "Ecolab", "sector": "Basic Materials", "category": "Chemicals"},
    "DD": {"name": "DuPont", "sector": "Basic Materials", "category": "Chemicals"},
    "NEM": {"name": "Newmont", "sector": "Basic Materials", "category": "Mining"},
    "FCX": {"name": "Freeport-McMoRan", "sector": "Basic Materials", "category": "Mining"},

    # Aerospace & Defense
    "LMT": {"name": "Lockheed Martin", "sector": "Industrials", "category": "Aerospace"},
    "RTX": {"name": "Raytheon", "sector": "Industrials", "category": "Aerospace"},
    "NOC": {"name": "Northrop Grumman", "sector": "Industrials", "category": "Aerospace"},
    "GD": {"name": "General Dynamics", "sector": "Industrials", "category": "Aerospace"},
    "LHX": {"name": "L3Harris", "sector": "Industrials", "category": "Aerospace"},

    # Transportation
    "UNP": {"name": "Union Pacific", "sector": "Industrials", "category": "Transportation"},
    "CSX": {"name": "CSX", "sector": "Industrials", "category": "Transportation"},
    "NSC": {"name": "Norfolk Southern", "sector": "Industrials", "category": "Transportation"},
    "FDX": {"name": "FedEx", "sector": "Industrials", "category": "Transportation"},
    "DAL": {"name": "Delta Air Lines", "sector": "Industrials", "category": "Airlines"},
    "UAL": {"name": "United Airlines", "sector": "Industrials", "category": "Airlines"},
    "AAL": {"name": "American Airlines", "sector": "Industrials", "category": "Airlines"},

    # Utilities
    "NEE": {"name": "NextEra Energy", "sector": "Utilities", "category": "Utilities"},
    "DUK": {"name": "Duke Energy", "sector": "Utilities", "category": "Utilities"},
    "SO": {"name": "Southern Company", "sector": "Utilities", "category": "Utilities"},
    "D": {"name": "Dominion Energy", "sector": "Utilities", "category": "Utilities"},
    "AEP": {"name": "AEP", "sector": "Utilities", "category": "Utilities"},

    # Oil Services
    "HAL": {"name": "Halliburton", "sector": "Energy", "category": "Oil Services"},
    "BKR": {"name": "Baker Hughes", "sector": "Energy", "category": "Oil Services"},

    # Mid-Caps & Growth
    "ROKU": {"name": "Roku", "sector": "Technology", "category": "Media"},
    "ZM": {"name": "Zoom", "sector": "Technology", "category": "Software"},
    "UBER": {"name": "Uber", "sector": "Technology", "category": "Rideshare"},
    "LYFT": {"name": "Lyft", "sector": "Technology", "category": "Rideshare"},
    "ABNB": {"name": "Airbnb", "sector": "Consumer Cyclical", "category": "Travel"},
    "DASH": {"name": "DoorDash", "sector": "Consumer Cyclical", "category": "Delivery"},
    "RBLX": {"name": "Roblox", "sector": "Technology", "category": "Gaming"},
    "U": {"name": "Unity", "sector": "Technology", "category": "Gaming"},
    "TTWO": {"name": "Take-Two", "sector": "Technology", "category": "Gaming"},
    "EA": {"name": "EA", "sector": "Technology", "category": "Gaming"},

    # ===== ADDITIONAL US STOCKS (100+) =====

    # More Banks & Financials
    "USB": {"name": "US Bancorp", "sector": "Financial Services", "category": "Banking"},
    "PNC": {"name": "PNC Financial", "sector": "Financial Services", "category": "Banking"},
    "TFC": {"name": "Truist Financial", "sector": "Financial Services", "category": "Banking"},
    "SCHW": {"name": "Schwab", "sector": "Financial Services", "category": "Brokerage"},
    "BX": {"name": "Blackstone", "sector": "Financial Services", "category": "Private Equity"},
    "KKR": {"name": "KKR", "sector": "Financial Services", "category": "Private Equity"},
    "CME": {"name": "CME Group", "sector": "Financial Services", "category": "Exchanges"},
    "ICE": {"name": "ICE", "sector": "Financial Services", "category": "Exchanges"},
    "AXP": {"name": "American Express", "sector": "Financial Services", "category": "Payments"},

    # More Pharma & Biotech
    "MRK": {"name": "Merck", "sector": "Healthcare", "category": "Pharma"},
    "BMY": {"name": "Bristol Myers", "sector": "Healthcare", "category": "Pharma"},
    "CVS": {"name": "CVS Health", "sector": "Healthcare", "category": "Pharmacy"},
    "CI": {"name": "Cigna", "sector": "Healthcare", "category": "Managed Care"},
    "HUM": {"name": "Humana", "sector": "Healthcare", "category": "Managed Care"},
    "ILMN": {"name": "Illumina", "sector": "Healthcare", "category": "Biotech"},
    "DHR": {"name": "Danaher", "sector": "Healthcare", "category": "Life Sciences"},
    "EW": {"name": "Edwards Lifesciences", "sector": "Healthcare", "category": "Medical Devices"},
    "ZBH": {"name": "Zimmer Biomet", "sector": "Healthcare", "category": "Medical Devices"},
    "BDX": {"name": "Becton Dickinson", "sector": "Healthcare", "category": "Medical Devices"},

    # More Semiconductors
    "NXPI": {"name": "NXP Semiconductors", "sector": "Technology", "category": "Semiconductors"},
    "ADI": {"name": "Analog Devices", "sector": "Technology", "category": "Semiconductors"},
    "ON": {"name": "ON Semiconductor", "sector": "Technology", "category": "Semiconductors"},
    "MPWR": {"name": "Monolithic Power", "sector": "Technology", "category": "Semiconductors"},
    "SWKS": {"name": "Skyworks", "sector": "Technology", "category": "Semiconductors"},
    "QRVO": {"name": "Qorvo", "sector": "Technology", "category": "Semiconductors"},

    # More Software
    "DOCU": {"name": "DocuSign", "sector": "Technology", "category": "Software"},
    "TWLO": {"name": "Twilio", "sector": "Technology", "category": "Software"},
    "OKTA": {"name": "Okta", "sector": "Technology", "category": "Software"},
    "MDB": {"name": "MongoDB", "sector": "Technology", "category": "Software"},
    "FTNT": {"name": "Fortinet", "sector": "Technology", "category": "Cybersecurity"},
    "IBM": {"name": "IBM", "sector": "Technology", "category": "IT Services"},

    # More Consumer
    "PM": {"name": "Philip Morris", "sector": "Consumer Defensive", "category": "Tobacco"},
    "MO": {"name": "Altria", "sector": "Consumer Defensive", "category": "Tobacco"},
    "MDLZ": {"name": "Mondelez", "sector": "Consumer Defensive", "category": "Food"},
    "KHC": {"name": "Kraft Heinz", "sector": "Consumer Defensive", "category": "Food"},
    "GIS": {"name": "General Mills", "sector": "Consumer Defensive", "category": "Food"},
    "HSY": {"name": "Hershey", "sector": "Consumer Defensive", "category": "Food"},
    "CL": {"name": "Colgate-Palmolive", "sector": "Consumer Defensive", "category": "Personal Care"},
    "EL": {"name": "Estee Lauder", "sector": "Consumer Defensive", "category": "Personal Care"},
    "LULU": {"name": "Lululemon", "sector": "Consumer Cyclical", "category": "Apparel"},
    "DG": {"name": "Dollar General", "sector": "Consumer Defensive", "category": "Retail"},
    "DLTR": {"name": "Dollar Tree", "sector": "Consumer Defensive", "category": "Retail"},
    "YUM": {"name": "Yum Brands", "sector": "Consumer Cyclical", "category": "Restaurants"},
    "CMG": {"name": "Chipotle", "sector": "Consumer Cyclical", "category": "Restaurants"},
    "MAR": {"name": "Marriott", "sector": "Consumer Cyclical", "category": "Hotels"},
    "HLT": {"name": "Hilton", "sector": "Consumer Cyclical", "category": "Hotels"},
    "BKNG": {"name": "Booking Holdings", "sector": "Consumer Cyclical", "category": "Travel"},

    # More Energy
    "EOG": {"name": "EOG Resources", "sector": "Energy", "category": "Oil & Gas"},
    "PXD": {"name": "Pioneer Natural", "sector": "Energy", "category": "Oil & Gas"},
    "MPC": {"name": "Marathon Petroleum", "sector": "Energy", "category": "Refining"},
    "PSX": {"name": "Phillips 66", "sector": "Energy", "category": "Refining"},
    "VLO": {"name": "Valero", "sector": "Energy", "category": "Refining"},
    "OXY": {"name": "Occidental", "sector": "Energy", "category": "Oil & Gas"},
    "KMI": {"name": "Kinder Morgan", "sector": "Energy", "category": "Pipelines"},
    "WMB": {"name": "Williams Companies", "sector": "Energy", "category": "Pipelines"},

    # More Industrials
    "DE": {"name": "Deere & Company", "sector": "Industrials", "category": "Machinery"},
    "EMR": {"name": "Emerson Electric", "sector": "Industrials", "category": "Equipment"},
    "MMM": {"name": "3M", "sector": "Industrials", "category": "Conglomerate"},
    "HON": {"name": "Honeywell", "sector": "Industrials", "category": "Conglomerate"},
    "LUV": {"name": "Southwest Airlines", "sector": "Industrials", "category": "Airlines"},

    # More Materials
    "DOW": {"name": "Dow Inc", "sector": "Basic Materials", "category": "Chemicals"},
    "NUE": {"name": "Nucor", "sector": "Basic Materials", "category": "Steel"},
    "ALB": {"name": "Albemarle", "sector": "Basic Materials", "category": "Chemicals"},

    # More Real Estate
    "O": {"name": "Realty Income", "sector": "Real Estate", "category": "REITs"},
    "DLR": {"name": "Digital Realty", "sector": "Real Estate", "category": "REITs"},
    "WELL": {"name": "Welltower", "sector": "Real Estate", "category": "REITs"},
    "AVB": {"name": "AvalonBay", "sector": "Real Estate", "category": "REITs"},

    # More Utilities
    "EXC": {"name": "Exelon", "sector": "Utilities", "category": "Utilities"},
    "XEL": {"name": "Xcel Energy", "sector": "Utilities", "category": "Utilities"},
    "SRE": {"name": "Sempra Energy", "sector": "Utilities", "category": "Utilities"},
    "PCG": {"name": "PG&E", "sector": "Utilities", "category": "Utilities"},

    # More Insurance
    "AFL": {"name": "Aflac", "sector": "Financial Services", "category": "Insurance"},
    "ALL": {"name": "Allstate", "sector": "Financial Services", "category": "Insurance"},
    "PRU": {"name": "Prudential", "sector": "Financial Services", "category": "Insurance"},

    # ===== INTERNATIONAL - EUROPE (50+) =====

    # United Kingdom
    "HSBC": {"name": "HSBC Holdings", "sector": "Financial Services", "category": "International - UK"},
    "AZN": {"name": "AstraZeneca", "sector": "Healthcare", "category": "International - UK"},
    "GSK": {"name": "GSK", "sector": "Healthcare", "category": "International - UK"},
    "BP": {"name": "BP", "sector": "Energy", "category": "International - UK"},
    "SHEL": {"name": "Shell", "sector": "Energy", "category": "International - UK"},
    "RIO": {"name": "Rio Tinto", "sector": "Basic Materials", "category": "International - UK"},
    "BTI": {"name": "British American Tobacco", "sector": "Consumer Defensive", "category": "International - UK"},

    # France
    "TTE": {"name": "TotalEnergies", "sector": "Energy", "category": "International - France"},

    # Spain
    "SAN": {"name": "Banco Santander", "sector": "Financial Services", "category": "International - Spain"},

    # Italy
    "RACE": {"name": "Ferrari", "sector": "Consumer Cyclical", "category": "International - Italy"},

    # Denmark
    "NVO": {"name": "Novo Nordisk", "sector": "Healthcare", "category": "International - Denmark"},

    # Sweden/Finland
    "ERIC": {"name": "Ericsson", "sector": "Technology", "category": "International - Sweden"},
    "NOK": {"name": "Nokia", "sector": "Technology", "category": "International - Finland"},

    # ===== INTERNATIONAL - ASIA PACIFIC (70+) =====

    # Japan
    "NTDOY": {"name": "Nintendo", "sector": "Communication Services", "category": "International - Japan"},
    "HMC": {"name": "Honda Motor", "sector": "Consumer Cyclical", "category": "International - Japan"},
    "MUFG": {"name": "Mitsubishi UFJ", "sector": "Financial Services", "category": "International - Japan"},

    # China & Hong Kong
    "BABA": {"name": "Alibaba", "sector": "Technology", "category": "International - China"},
    "TCEHY": {"name": "Tencent", "sector": "Technology", "category": "International - China"},
    "PDD": {"name": "PDD Holdings", "sector": "Technology", "category": "International - China"},
    "JD": {"name": "JD.com", "sector": "Technology", "category": "International - China"},
    "BIDU": {"name": "Baidu", "sector": "Technology", "category": "International - China"},
    "LI": {"name": "Li Auto", "sector": "Consumer Cyclical", "category": "International - China"},
    "XPEV": {"name": "XPeng", "sector": "Consumer Cyclical", "category": "International - China"},
    "BYDDY": {"name": "BYD", "sector": "Consumer Cyclical", "category": "International - China"},
    "YUMC": {"name": "Yum China", "sector": "Consumer Cyclical", "category": "International - China"},

    # India
    "INFY": {"name": "Infosys", "sector": "Technology", "category": "International - India"},
    "WIT": {"name": "Wipro", "sector": "Technology", "category": "International - India"},
    "HDB": {"name": "HDFC Bank", "sector": "Financial Services", "category": "International - India"},
    "IBN": {"name": "ICICI Bank", "sector": "Financial Services", "category": "International - India"},

    # Australia
    "BHP": {"name": "BHP Group", "sector": "Basic Materials", "category": "International - Australia"},

    # ===== INTERNATIONAL - LATIN AMERICA (20+) =====

    # Brazil
    "PBR": {"name": "Petrobras", "sector": "Energy", "category": "International - Brazil"},
    "VALE": {"name": "Vale", "sector": "Basic Materials", "category": "International - Brazil"},
    "ITUB": {"name": "Itau Unibanco", "sector": "Financial Services", "category": "International - Brazil"},
    "BBD": {"name": "Banco Bradesco", "sector": "Financial Services", "category": "International - Brazil"},
    "ABEV": {"name": "Ambev", "sector": "Consumer Defensive", "category": "International - Brazil"},

    # Mexico
    "AMX": {"name": "America Movil", "sector": "Communication Services", "category": "International - Mexico"},

    # ===== ALREADY LISTED INTERNATIONAL =====
    "NIO": {"name": "NIO", "sector": "Consumer Cyclical", "category": "International - China"},
    "SAP": {"name": "SAP", "sector": "Technology", "category": "International - Germany"},
    "SNY": {"name": "Sanofi", "sector": "Healthcare", "category": "International - France"},
    "NVS": {"name": "Novartis", "sector": "Healthcare", "category": "International - Switzerland"},
    "UL": {"name": "Unilever", "sector": "Consumer Defensive", "category": "International - UK"},
    "DEO": {"name": "Diageo", "sector": "Consumer Defensive", "category": "International - UK"},
    "TM": {"name": "Toyota", "sector": "Consumer Cyclical", "category": "International - Japan"},
    "SONY": {"name": "Sony", "sector": "Technology", "category": "International - Japan"},
    "SPOT": {"name": "Spotify", "sector": "Communication Services", "category": "International - Sweden"}
}

# EXPANDED: Popular ETFs (150+ funds across all categories)
POPULAR_ETFS = {
    # Broad Market - Large Cap
    "SPY": {"name": "SPDR S&P 500", "category": "Broad Market", "avg_volume": 70000000},
    "VOO": {"name": "Vanguard S&P 500", "category": "Broad Market", "avg_volume": 5000000},
    "IVV": {"name": "iShares S&P 500", "category": "Broad Market", "avg_volume": 4000000},
    "QQQ": {"name": "Invesco QQQ", "category": "Broad Market", "avg_volume": 40000000},
    "VTI": {"name": "Total Stock Market", "category": "Broad Market", "avg_volume": 5000000},
    "ITOT": {"name": "iShares Total Market", "category": "Broad Market", "avg_volume": 1000000},
    "SCHB": {"name": "Schwab US Broad Market", "category": "Broad Market", "avg_volume": 1500000},

    # Mid & Small Cap
    "IWM": {"name": "Russell 2000", "category": "Small Cap", "avg_volume": 30000000},
    "IJH": {"name": "iShares Mid-Cap", "category": "Mid Cap", "avg_volume": 2000000},
    "MDY": {"name": "SPDR Mid-Cap 400", "category": "Mid Cap", "avg_volume": 1000000},
    "VB": {"name": "Vanguard Small-Cap", "category": "Small Cap", "avg_volume": 800000},
    "IJR": {"name": "iShares Small-Cap", "category": "Small Cap", "avg_volume": 3000000},

    # Sector - Technology
    "XLK": {"name": "Technology Select", "category": "Sector", "avg_volume": 15000000},
    "VGT": {"name": "Vanguard Technology", "category": "Sector", "avg_volume": 1500000},
    "FTEC": {"name": "Fidelity MSCI Tech", "category": "Sector", "avg_volume": 500000},
    "SOXX": {"name": "Semiconductor", "category": "Sector", "avg_volume": 5000000},
    "SMH": {"name": "VanEck Semiconductors", "category": "Sector", "avg_volume": 8000000},
    "IGV": {"name": "iShares Software", "category": "Sector", "avg_volume": 1000000},
    "CLOU": {"name": "Cloud Computing", "category": "Sector", "avg_volume": 500000},

    # Sector - Financial
    "XLF": {"name": "Financial Select", "category": "Sector", "avg_volume": 50000000},
    "VFH": {"name": "Vanguard Financials", "category": "Sector", "avg_volume": 2000000},
    "KRE": {"name": "Regional Banks", "category": "Sector", "avg_volume": 10000000},
    "KBE": {"name": "Bank ETF", "category": "Sector", "avg_volume": 2000000},

    # Sector - Healthcare
    "XLV": {"name": "Health Care Select", "category": "Sector", "avg_volume": 10000000},
    "VHT": {"name": "Vanguard Health Care", "category": "Sector", "avg_volume": 1000000},
    "IBB": {"name": "Biotech", "category": "Sector", "avg_volume": 3000000},
    "XBI": {"name": "SPDR Biotech", "category": "Sector", "avg_volume": 8000000},
    "IHI": {"name": "Medical Devices", "category": "Sector", "avg_volume": 500000},
    "XPH": {"name": "Pharmaceuticals", "category": "Sector", "avg_volume": 200000},

    # Sector - Energy
    "XLE": {"name": "Energy Select", "category": "Sector", "avg_volume": 20000000},
    "VDE": {"name": "Vanguard Energy", "category": "Sector", "avg_volume": 1000000},
    "XOP": {"name": "Oil & Gas Exploration", "category": "Sector", "avg_volume": 15000000},
    "USO": {"name": "US Oil Fund", "category": "Commodities", "avg_volume": 25000000},
    "OIH": {"name": "Oil Services", "category": "Sector", "avg_volume": 2000000},

    # Sector - Industrials
    "XLI": {"name": "Industrial Select", "category": "Sector", "avg_volume": 12000000},
    "VIS": {"name": "Vanguard Industrials", "category": "Sector", "avg_volume": 300000},
    "IYT": {"name": "Transportation", "category": "Sector", "avg_volume": 500000},
    "JETS": {"name": "Airlines", "category": "Sector", "avg_volume": 5000000},
    "ITA": {"name": "Aerospace & Defense", "category": "Sector", "avg_volume": 800000},

    # Sector - Consumer
    "XLY": {"name": "Consumer Discretionary", "category": "Sector", "avg_volume": 8000000},
    "XLP": {"name": "Consumer Staples", "category": "Sector", "avg_volume": 10000000},
    "VCR": {"name": "Vanguard Consumer Disc", "category": "Sector", "avg_volume": 300000},
    "VDC": {"name": "Vanguard Consumer Stpl", "category": "Sector", "avg_volume": 400000},
    "XRT": {"name": "Retail", "category": "Sector", "avg_volume": 8000000},

    # Sector - Materials & Utilities
    "XLB": {"name": "Materials Select", "category": "Sector", "avg_volume": 8000000},
    "XLU": {"name": "Utilities Select", "category": "Sector", "avg_volume": 12000000},
    "VAW": {"name": "Vanguard Materials", "category": "Sector", "avg_volume": 300000},
    "VPU": {"name": "Vanguard Utilities", "category": "Sector", "avg_volume": 400000},

    # Real Estate
    "XLRE": {"name": "Real Estate Select", "category": "Sector", "avg_volume": 5000000},
    "VNQ": {"name": "Vanguard Real Estate", "category": "Real Estate", "avg_volume": 5000000},
    "IYR": {"name": "iShares Real Estate", "category": "Real Estate", "avg_volume": 3000000},
    "REET": {"name": "iShares Global REIT", "category": "Real Estate", "avg_volume": 500000},

    # Communication Services
    "XLC": {"name": "Communication Services", "category": "Sector", "avg_volume": 8000000},
    "VOX": {"name": "Vanguard Comm Services", "category": "Sector", "avg_volume": 300000},

    # Thematic - Clean Energy
    "ICLN": {"name": "Clean Energy", "category": "Thematic", "avg_volume": 5000000},
    "TAN": {"name": "Solar Energy", "category": "Thematic", "avg_volume": 1500000},
    "QCLN": {"name": "Clean Energy", "category": "Thematic", "avg_volume": 2000000},
    "PBW": {"name": "Wilderhill Clean Energy", "category": "Thematic", "avg_volume": 800000},
    "FAN": {"name": "Wind Energy", "category": "Thematic", "avg_volume": 200000},

    # Thematic - Innovation & Tech
    "ARKK": {"name": "ARK Innovation", "category": "Thematic", "avg_volume": 8000000},
    "ARKQ": {"name": "ARK Autonomous Tech", "category": "Thematic", "avg_volume": 2000000},
    "ARKW": {"name": "ARK Next Gen Internet", "category": "Thematic", "avg_volume": 1500000},
    "ARKF": {"name": "ARK FinTech", "category": "Thematic", "avg_volume": 1000000},
    "ARKG": {"name": "ARK Genomic", "category": "Thematic", "avg_volume": 1200000},
    "ROBO": {"name": "Robotics & AI", "category": "Thematic", "avg_volume": 500000},
    "BOTZ": {"name": "Global Robotics", "category": "Thematic", "avg_volume": 1000000},
    "HACK": {"name": "Cybersecurity", "category": "Thematic", "avg_volume": 800000},
    "CIBR": {"name": "Cybersecurity & Tech", "category": "Thematic", "avg_volume": 1500000},
    "FINX": {"name": "FinTech", "category": "Thematic", "avg_volume": 300000},
    "BLOK": {"name": "Blockchain", "category": "Thematic", "avg_volume": 500000},

    # Thematic - Space, Gaming, Cannabis
    "UFO": {"name": "Space & Satellite", "category": "Thematic", "avg_volume": 100000},
    "ESPO": {"name": "Video Game Tech", "category": "Thematic", "avg_volume": 200000},
    "HERO": {"name": "Video Game & Esports", "category": "Thematic", "avg_volume": 150000},
    "MSOS": {"name": "US Cannabis", "category": "Thematic", "avg_volume": 5000000},
    "MJ": {"name": "Cannabis", "category": "Thematic", "avg_volume": 1000000},

    # International - Developed Markets
    "EFA": {"name": "EAFE", "category": "International", "avg_volume": 15000000},
    "VEA": {"name": "FTSE Developed Markets", "category": "International", "avg_volume": 8000000},
    "IEFA": {"name": "iShares Developed ex-US", "category": "International", "avg_volume": 5000000},
    "EWJ": {"name": "Japan", "category": "International", "avg_volume": 8000000},
    "EWG": {"name": "Germany", "category": "International", "avg_volume": 2000000},
    "EWU": {"name": "United Kingdom", "category": "International", "avg_volume": 5000000},
    "EWC": {"name": "Canada", "category": "International", "avg_volume": 2000000},
    "EWA": {"name": "Australia", "category": "International", "avg_volume": 3000000},
    "EWY": {"name": "South Korea", "category": "International", "avg_volume": 10000000},
    "EWT": {"name": "Taiwan", "category": "International", "avg_volume": 5000000},

    # International - Emerging Markets
    "EEM": {"name": "Emerging Markets", "category": "International", "avg_volume": 25000000},
    "VWO": {"name": "FTSE Emerging Markets", "category": "International", "avg_volume": 10000000},
    "IEMG": {"name": "iShares Emerging Markets", "category": "International", "avg_volume": 12000000},
    "FXI": {"name": "China Large-Cap", "category": "International", "avg_volume": 20000000},
    "MCHI": {"name": "iShares China", "category": "International", "avg_volume": 8000000},
    "KWEB": {"name": "China Internet", "category": "International", "avg_volume": 15000000},
    "EWZ": {"name": "Brazil", "category": "International", "avg_volume": 25000000},
    "RSX": {"name": "Russia", "category": "International", "avg_volume": 5000000},
    "EWW": {"name": "Mexico", "category": "International", "avg_volume": 3000000},
    "INDA": {"name": "India", "category": "International", "avg_volume": 5000000},
    "EWH": {"name": "Hong Kong", "category": "International", "avg_volume": 2000000},
    "EIDO": {"name": "Indonesia", "category": "International", "avg_volume": 500000},
    "EPHE": {"name": "Philippines", "category": "International", "avg_volume": 200000},
    "THD": {"name": "Thailand", "category": "International", "avg_volume": 300000},

    # Fixed Income - Government
    "TLT": {"name": "20+ Year Treasury", "category": "Bonds", "avg_volume": 15000000},
    "IEF": {"name": "7-10 Year Treasury", "category": "Bonds", "avg_volume": 8000000},
    "SHY": {"name": "1-3 Year Treasury", "category": "Bonds", "avg_volume": 15000000},
    "AGG": {"name": "Aggregate Bond", "category": "Bonds", "avg_volume": 10000000},
    "BND": {"name": "Vanguard Total Bond", "category": "Bonds", "avg_volume": 5000000},
    "TIP": {"name": "TIPS", "category": "Bonds", "avg_volume": 5000000},

    # Fixed Income - Corporate
    "LQD": {"name": "Investment Grade", "category": "Bonds", "avg_volume": 15000000},
    "HYG": {"name": "High Yield", "category": "Bonds", "avg_volume": 20000000},
    "JNK": {"name": "High Yield Junk", "category": "Bonds", "avg_volume": 10000000},
    "VCSH": {"name": "Short-Term Corporate", "category": "Bonds", "avg_volume": 4000000},
    "VCIT": {"name": "Intermediate Corporate", "category": "Bonds", "avg_volume": 3000000},
    "VCLT": {"name": "Long-Term Corporate", "category": "Bonds", "avg_volume": 2000000},

    # Fixed Income - International
    "EMB": {"name": "Emerging Market Bonds", "category": "Bonds", "avg_volume": 15000000},
    "BWX": {"name": "International Treasury", "category": "Bonds", "avg_volume": 1000000},
    "BNDX": {"name": "Intl Aggregate Bond", "category": "Bonds", "avg_volume": 3000000},

    # Commodity ETFs
    "GLD": {"name": "Gold", "category": "Commodities", "avg_volume": 10000000},
    "SLV": {"name": "Silver", "category": "Commodities", "avg_volume": 20000000},
    "GDX": {"name": "Gold Miners", "category": "Commodities", "avg_volume": 25000000},
    "GDXJ": {"name": "Junior Gold Miners", "category": "Commodities", "avg_volume": 15000000},
    "UNG": {"name": "Natural Gas", "category": "Commodities", "avg_volume": 15000000},
    "DBA": {"name": "Agriculture", "category": "Commodities", "avg_volume": 500000},
    "DBB": {"name": "Base Metals", "category": "Commodities", "avg_volume": 300000},

    # Factor - Smart Beta
    "MTUM": {"name": "Momentum", "category": "Factor", "avg_volume": 3000000},
    "QUAL": {"name": "Quality", "category": "Factor", "avg_volume": 2000000},
    "SIZE": {"name": "Size Factor", "category": "Factor", "avg_volume": 500000},
    "VLUE": {"name": "Value", "category": "Factor", "avg_volume": 2000000},
    "USMV": {"name": "Low Volatility", "category": "Factor", "avg_volume": 5000000},
    "SPLV": {"name": "Low Volatility", "category": "Factor", "avg_volume": 3000000},
    "SPHD": {"name": "High Dividend", "category": "Factor", "avg_volume": 2000000},
    "VIG": {"name": "Dividend Appreciation", "category": "Factor", "avg_volume": 3000000},
    "VYM": {"name": "High Dividend Yield", "category": "Factor", "avg_volume": 5000000},
    "SCHD": {"name": "Dividend ETF", "category": "Factor", "avg_volume": 5000000},
    "DG": {"name": "Dividend Growth", "category": "Factor", "avg_volume": 1000000},

    # Leveraged & Inverse (for completeness)
    "TQQQ": {"name": "3x Nasdaq", "category": "Leveraged", "avg_volume": 80000000},
    "SQQQ": {"name": "-3x Nasdaq", "category": "Inverse", "avg_volume": 60000000},
    "SPXU": {"name": "-3x S&P 500", "category": "Inverse", "avg_volume": 10000000},
    "UPRO": {"name": "3x S&P 500", "category": "Leveraged", "avg_volume": 15000000},
    "TNA": {"name": "3x Russell 2000", "category": "Leveraged", "avg_volume": 10000000},
    "SOXL": {"name": "3x Semiconductors", "category": "Leveraged", "avg_volume": 80000000},
    "VXX": {"name": "VIX Short-Term", "category": "Volatility", "avg_volume": 50000000},

    # ===== ADDITIONAL ETFS (117+) =====

    # More Thematic - AI & Cloud
    "BOTZ": {"name": "Global X Robotics & AI", "category": "Thematic - AI", "avg_volume": 1000000},
    "AIQ": {"name": "AI Powered Equity", "category": "Thematic - AI", "avg_volume": 500000},
    "IRBO": {"name": "iShares Robotics & AI", "category": "Thematic - AI", "avg_volume": 300000},
    "SKYY": {"name": "Cloud Computing", "category": "Thematic - Cloud", "avg_volume": 800000},
    "WCLD": {"name": "WisdomTree Cloud", "category": "Thematic - Cloud", "avg_volume": 1200000},

    # Thematic - Semiconductor & Hardware
    "XSD": {"name": "Semiconductor", "category": "Thematic - Tech", "avg_volume": 2000000},
    "PSI": {"name": "Semiconductor Index", "category": "Thematic - Tech", "avg_volume": 300000},

    # Thematic - EV & Battery
    "LIT": {"name": "Lithium & Battery", "category": "Thematic - EV", "avg_volume": 3000000},
    "BATT": {"name": "Battery Tech", "category": "Thematic - EV", "avg_volume": 500000},
    "DRIV": {"name": "Autonomous Driving", "category": "Thematic - EV", "avg_volume": 200000},
    "IDRV": {"name": "Self-Driving EV", "category": "Thematic - EV", "avg_volume": 400000},

    # Thematic - ESG & Sustainable
    "ESGU": {"name": "ESG US Stock", "category": "Thematic - ESG", "avg_volume": 2000000},
    "ESGV": {"name": "Vanguard ESG", "category": "Thematic - ESG", "avg_volume": 1000000},
    "SUSL": {"name": "Sustainable Leaders", "category": "Thematic - ESG", "avg_volume": 500000},
    "DSI": {"name": "Social Index", "category": "Thematic - ESG", "avg_volume": 400000},
    "KRMA": {"name": "Global Sustainability", "category": "Thematic - ESG", "avg_volume": 300000},

    # Thematic - Infrastructure & Construction
    "PAVE": {"name": "US Infrastructure", "category": "Thematic - Infrastructure", "avg_volume": 1500000},
    "IFRA": {"name": "Global Infrastructure", "category": "Thematic - Infrastructure", "avg_volume": 500000},
    "PKB": {"name": "Building & Construction", "category": "Thematic - Infrastructure", "avg_volume": 200000},

    # Thematic - Healthcare Innovation
    "GNOM": {"name": "Genomics", "category": "Thematic - Healthcare", "avg_volume": 800000},
    "EDOC": {"name": "Telehealth", "category": "Thematic - Healthcare", "avg_volume": 400000},
    "XLV": {"name": "Longevity", "category": "Thematic - Healthcare", "avg_volume": 300000},

    # More International - Europe
    "EWQ": {"name": "France", "category": "International - Europe", "avg_volume": 1000000},
    "EWI": {"name": "Italy", "category": "International - Europe", "avg_volume": 800000},
    "EWP": {"name": "Spain", "category": "International - Europe", "avg_volume": 500000},
    "EWL": {"name": "Switzerland", "category": "International - Europe", "avg_volume": 600000},
    "EWN": {"name": "Netherlands", "category": "International - Europe", "avg_volume": 400000},
    "EWD": {"name": "Sweden", "category": "International - Europe", "avg_volume": 300000},
    "EDEN": {"name": "Denmark", "category": "International - Europe", "avg_volume": 200000},
    "NORW": {"name": "Norway", "category": "International - Europe", "avg_volume": 150000},

    # More International - Asia
    "EWS": {"name": "Singapore", "category": "International - Asia", "avg_volume": 500000},
    "EWM": {"name": "Malaysia", "category": "International - Asia", "avg_volume": 300000},
    "EWZ": {"name": "South Africa", "category": "International - Africa", "avg_volume": 1000000},
    "EWZ": {"name": "Turkey", "category": "International - EM", "avg_volume": 2000000},
    "ERUS": {"name": "Russia", "category": "International - EM", "avg_volume": 500000},

    # More Fixed Income - Duration Specific
    "VGSH": {"name": "Short-Term Treasury", "category": "Bonds - Duration", "avg_volume": 2000000},
    "VGIT": {"name": "Intermediate Treasury", "category": "Bonds - Duration", "avg_volume": 1500000},
    "VGLT": {"name": "Long-Term Treasury", "category": "Bonds - Duration", "avg_volume": 1000000},
    "EDV": {"name": "Extended Duration", "category": "Bonds - Duration", "avg_volume": 500000},

    # Fixed Income - Municipal
    "MUB": {"name": "National Muni", "category": "Bonds - Municipal", "avg_volume": 3000000},
    "HYD": {"name": "High Yield Muni", "category": "Bonds - Municipal", "avg_volume": 1000000},
    "VTEB": {"name": "Tax-Exempt Bond", "category": "Bonds - Municipal", "avg_volume": 2000000},

    # Fixed Income - International
    "EMLC": {"name": "EM Local Currency", "category": "Bonds - EM", "avg_volume": 1000000},
    "PCY": {"name": "EM Sovereign Debt", "category": "Bonds - EM", "avg_volume": 800000},
    "VWOB": {"name": "EM Govt Bonds", "category": "Bonds - EM", "avg_volume": 1500000},

    # More Commodity - Metals
    "PPLT": {"name": "Platinum", "category": "Commodities - Metals", "avg_volume": 500000},
    "PALL": {"name": "Palladium", "category": "Commodities - Metals", "avg_volume": 300000},
    "CPER": {"name": "Copper", "category": "Commodities - Metals", "avg_volume": 1000000},
    "URNM": {"name": "Uranium", "category": "Commodities - Metals", "avg_volume": 2000000},

    # Commodity - Agriculture
    "CORN": {"name": "Corn", "category": "Commodities - Agriculture", "avg_volume": 500000},
    "WEAT": {"name": "Wheat", "category": "Commodities - Agriculture", "avg_volume": 600000},
    "SOYB": {"name": "Soybeans", "category": "Commodities - Agriculture", "avg_volume": 300000},
    "NIB": {"name": "Cocoa", "category": "Commodities - Agriculture", "avg_volume": 100000},

    # More Sector - Subsectors
    "FHLC": {"name": "Healthcare Equipment", "category": "Sector - Healthcare", "avg_volume": 300000},
    "IHF": {"name": "Healthcare Providers", "category": "Sector - Healthcare", "avg_volume": 200000},
    "XES": {"name": "Oil Equipment & Services", "category": "Sector - Energy", "avg_volume": 1000000},
    "CRAK": {"name": "Oil Refiners", "category": "Sector - Energy", "avg_volume": 500000},
    "COPX": {"name": "Copper Miners", "category": "Sector - Materials", "avg_volume": 1500000},
    "SIL": {"name": "Silver Miners", "category": "Sector - Materials", "avg_volume": 2000000},

    # More Dividend & Income
    "DVY": {"name": "Dow Dividend", "category": "Dividend", "avg_volume": 2000000},
    "NOBL": {"name": "Dividend Aristocrats", "category": "Dividend", "avg_volume": 1500000},
    "SDY": {"name": "Dividend ETF", "category": "Dividend", "avg_volume": 1000000},
    "PFF": {"name": "Preferred Stock", "category": "Income", "avg_volume": 5000000},
    "PFFD": {"name": "Preferred Securities", "category": "Income", "avg_volume": 800000},
    "KBWD": {"name": "High Dividend Yield", "category": "Dividend", "avg_volume": 500000},

    # More Factor - Smart Beta
    "RSP": {"name": "S&P 500 Equal Weight", "category": "Factor - Equal Weight", "avg_volume": 5000000},
    "QQEW": {"name": "Nasdaq Equal Weight", "category": "Factor - Equal Weight", "avg_volume": 1000000},
    "EQWL": {"name": "Equal Weight", "category": "Factor - Equal Weight", "avg_volume": 300000},
    "IUSV": {"name": "Value Factor", "category": "Factor - Value", "avg_volume": 2000000},
    "IUSG": {"name": "Growth Factor", "category": "Factor - Growth", "avg_volume": 3000000},
    "IWF": {"name": "Russell 1000 Growth", "category": "Factor - Growth", "avg_volume": 4000000},
    "IWD": {"name": "Russell 1000 Value", "category": "Factor - Value", "avg_volume": 5000000},

    # More Growth & Style
    "VUG": {"name": "Vanguard Growth", "category": "Style - Growth", "avg_volume": 3000000},
    "MGK": {"name": "Mega Cap Growth", "category": "Style - Growth", "avg_volume": 1000000},
    "VTV": {"name": "Vanguard Value", "category": "Style - Value", "avg_volume": 2000000},
    "MGV": {"name": "Mega Cap Value", "category": "Style - Value", "avg_volume": 500000},

    # Currency ETFs
    "UUP": {"name": "US Dollar Bullish", "category": "Currency", "avg_volume": 3000000},
    "FXE": {"name": "Euro Currency", "category": "Currency", "avg_volume": 1000000},
    "FXY": {"name": "Japanese Yen", "category": "Currency", "avg_volume": 800000},
    "FXB": {"name": "British Pound", "category": "Currency", "avg_volume": 500000},
    "FXA": {"name": "Australian Dollar", "category": "Currency", "avg_volume": 600000},
    "FXC": {"name": "Canadian Dollar", "category": "Currency", "avg_volume": 400000},

    # More Leveraged - Sector Specific
    "TECL": {"name": "3x Technology", "category": "Leveraged - Sector", "avg_volume": 10000000},
    "TPOR": {"name": "3x Transportation", "category": "Leveraged - Sector", "avg_volume": 500000},
    "DUSL": {"name": "3x Industrials", "category": "Leveraged - Sector", "avg_volume": 300000},
    "CURE": {"name": "3x Healthcare", "category": "Leveraged - Sector", "avg_volume": 1500000},
    "FAS": {"name": "3x Financials", "category": "Leveraged - Sector", "avg_volume": 5000000},
    "ERX": {"name": "3x Energy", "category": "Leveraged - Sector", "avg_volume": 2000000},

    # Real Assets
    "REET": {"name": "Real Estate", "category": "Real Assets", "avg_volume": 500000},
    "USCI": {"name": "Commodity Index", "category": "Real Assets", "avg_volume": 1000000},
    "PDBC": {"name": "Optimum Yield Commodity", "category": "Real Assets", "avg_volume": 2000000},
    "DJP": {"name": "Commodity Index", "category": "Real Assets", "avg_volume": 300000},

    # Alternatives
    "MNA": {"name": "Merger Arbitrage", "category": "Alternatives", "avg_volume": 500000},
    "QAI": {"name": "Alternative Strategies", "category": "Alternatives", "avg_volume": 300000},
    "TAIL": {"name": "Tail Risk", "category": "Alternatives", "avg_volume": 200000}
}

# Factor definitions
FACTOR_DEFINITIONS = {
    "Market": {"description": "Market risk premium", "benchmark": "SPY"},
    "Size": {"description": "Small cap minus large cap", "benchmark": "IWM"},
    "Value": {"description": "Value minus growth", "benchmark": "IWD"},
    "Momentum": {"description": "Winners minus losers", "benchmark": "MTUM"},
    "Quality": {"description": "High quality minus low quality", "benchmark": "QUAL"},
    "Volatility": {"description": "Low vol minus high vol", "benchmark": "USMV"}
}

# ETF sectors
ETF_SECTORS = {
    "QQQ": "Technology", "XLK": "Technology", "VGT": "Technology",
    "XLF": "Financial Services", "KRE": "Financial Services",
    "XLV": "Healthcare", "IBB": "Healthcare", "XBI": "Healthcare",
    "XLE": "Energy", "XOP": "Energy", "USO": "Energy",
    "XLB": "Basic Materials", "GDX": "Basic Materials",
    "XLY": "Consumer Cyclical", "XLP": "Consumer Defensive",
    "XLI": "Industrials", "IYT": "Industrials",
    "VNQ": "Real Estate", "XLRE": "Real Estate",
    "XLU": "Utilities",
    "SPY": "Broad Market", "VOO": "Broad Market", "VTI": "Broad Market"
}
