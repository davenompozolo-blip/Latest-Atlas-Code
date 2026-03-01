"""
ATLAS Terminal — JSE Ticker Normalisation (Phase 10)
======================================================
Converts between JSE ticker formats:
  Bare:    NPN
  Yahoo:   NPN.JO
  Bloomberg: NPN SJ
  IRESS:   NPN (same as bare)

Also provides a lookup table of common JSE tickers for search/display.
"""
from __future__ import annotations


def normalise_to_jse(ticker: str) -> str:
    """Convert any JSE ticker format to bare JSE format.

    Examples:
        NPN.JO  -> NPN
        NPN SJ  -> NPN
        NPN.JSE -> NPN
        NPN     -> NPN
    """
    ticker = ticker.upper().strip()
    for suffix in [".JO", " SJ", ".JSE"]:
        if ticker.endswith(suffix):
            return ticker[: -len(suffix)]
    return ticker


def jse_to_yahoo(ticker: str) -> str:
    """Convert bare JSE ticker to Yahoo Finance format."""
    return f"{normalise_to_jse(ticker)}.JO"


def is_jse_ticker(ticker: str) -> bool:
    """Heuristic: is this likely a JSE-listed ticker?

    Returns True if:
      - Has .JO suffix
      - Has SJ suffix
      - Is in the JSE_TICKERS lookup table
    """
    t = ticker.upper().strip()
    if t.endswith(".JO") or t.endswith(" SJ") or t.endswith(".JSE"):
        return True
    bare = normalise_to_jse(t)
    return bare in JSE_TICKERS


# ---------------------------------------------------------------------------
# Common JSE tickers — used for search, display, and identification
# ---------------------------------------------------------------------------
JSE_TICKERS: dict[str, str] = {
    # Large caps (Top 40)
    "NPN": "Naspers Limited",
    "PRX": "Prosus N.V.",
    "BTI": "British American Tobacco",
    "AGL": "Anglo American",
    "BHP": "BHP Group",
    "SOL": "Sasol",
    "MTN": "MTN Group",
    "SBK": "Standard Bank Group",
    "FSR": "FirstRand",
    "NED": "Nedbank Group",
    "ABG": "Absa Group",
    "SLM": "Sanlam",
    "DSY": "Discovery",
    "REM": "Remgro",
    "CFR": "Compagnie Financière Richemont",
    "AMS": "Anglo American Platinum",
    "IMP": "Impala Platinum",
    "SSW": "Sibanye Stillwater",
    "GFI": "Gold Fields",
    "ANG": "AngloGold Ashanti",
    "HAR": "Harmony Gold",
    "SHP": "Shoprite Holdings",
    "WHL": "Woolworths Holdings",
    "MRP": "Mr Price Group",
    "TFG": "The Foschini Group",
    "PIK": "Pick n Pay Stores",
    "CLS": "Clicks Group",
    "BID": "Bid Corporation",
    "TBS": "Tiger Brands",
    "APN": "Aspen Pharmacare",
    "VOD": "Vodacom Group",
    "TKG": "Telkom SA",
    "MCG": "MultiChoice Group",
    "EXX": "Exxaro Resources",
    "KIO": "Kumba Iron Ore",
    "MNP": "Mondi",
    "SPP": "The SPAR Group",
    "OMU": "Old Mutual",
    "INP": "Investec",
    "INL": "Investec Limited",
    # REITs (SAPY constituents)
    "GRT": "Growthpoint Properties",
    "RDF": "Redefine Properties",
    "EMI": "Emira Property Fund",
    "VKE": "Vukile Property Fund",
    "FFB": "Fortress REIT B",
    "HYP": "Hyprop Investments",
    "RPL": "Resilient REIT",
    "SAC": "SA Corporate Real Estate",
    "ATT": "Attacq",
    "OCT": "Octodec Investments",
    # ETFs
    "STX40": "Satrix 40 Portfolio",
    "STXSWX": "Satrix SWIX Top 40",
    "STXNDQ": "Satrix Nasdaq 100",
    "STXWDM": "Satrix MSCI World",
    "STXEMG": "Satrix MSCI Emerging Markets",
    "SYG500": "Sygnia S&P 500",
    "CTOP50": "CoreShares Top 50",
    "NFEMOM": "Newfunds Equity Momentum",
    "CSP500": "CoreShares S&P 500",
    "SMART": "Satrix SmartCore",
}

# ---------------------------------------------------------------------------
# FTSE/JSE Sector classifications
# ---------------------------------------------------------------------------
JSE_SECTORS: dict[str, str] = {
    # Mapping: bare ticker -> FTSE/JSE sector
    "NPN": "Technology",
    "PRX": "Technology",
    "BTI": "Consumer Goods",
    "AGL": "Basic Materials",
    "BHP": "Basic Materials",
    "SOL": "Energy",
    "MTN": "Telecommunications",
    "SBK": "Financials",
    "FSR": "Financials",
    "NED": "Financials",
    "ABG": "Financials",
    "SLM": "Financials",
    "DSY": "Financials",
    "REM": "Financials",
    "CFR": "Consumer Goods",
    "AMS": "Basic Materials",
    "IMP": "Basic Materials",
    "SSW": "Basic Materials",
    "GFI": "Basic Materials",
    "ANG": "Basic Materials",
    "HAR": "Basic Materials",
    "SHP": "Consumer Services",
    "WHL": "Consumer Services",
    "MRP": "Consumer Services",
    "TFG": "Consumer Services",
    "PIK": "Consumer Services",
    "CLS": "Consumer Services",
    "BID": "Consumer Services",
    "TBS": "Consumer Goods",
    "APN": "Health Care",
    "VOD": "Telecommunications",
    "TKG": "Telecommunications",
    "MCG": "Consumer Services",
    "EXX": "Basic Materials",
    "KIO": "Basic Materials",
    "MNP": "Industrials",
    "SPP": "Consumer Services",
    "OMU": "Financials",
    "INP": "Financials",
    "INL": "Financials",
    "GRT": "Real Estate",
    "RDF": "Real Estate",
    "EMI": "Real Estate",
    "VKE": "Real Estate",
    "FFB": "Real Estate",
    "HYP": "Real Estate",
    "RPL": "Real Estate",
    "SAC": "Real Estate",
    "ATT": "Real Estate",
    "OCT": "Real Estate",
}

# ---------------------------------------------------------------------------
# Index constituents (approximate — for default universe)
# ---------------------------------------------------------------------------
ALSI_TOP40: list[str] = [
    "NPN", "PRX", "BTI", "AGL", "BHP", "SOL", "MTN", "SBK", "FSR",
    "NED", "ABG", "SLM", "DSY", "REM", "CFR", "AMS", "IMP", "SSW",
    "GFI", "ANG", "HAR", "SHP", "WHL", "MRP", "TFG", "PIK", "CLS",
    "BID", "TBS", "APN", "VOD", "TKG", "MCG", "EXX", "KIO", "MNP",
    "SPP", "OMU", "INP", "GRT",
]

SAPY_REITS: list[str] = [
    "GRT", "RDF", "EMI", "VKE", "FFB", "HYP", "RPL", "SAC", "ATT", "OCT",
]
