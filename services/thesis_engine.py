"""
ATLAS Terminal - Investment Thesis Engine
==========================================
The analyst writes a thesis with explicit assumptions. ATLAS tracks whether
each assumption remains valid by mapping it to a trackable KPI.

This is ATLAS's most differentiated capability in the Equity Research module.
"""

import json
import time
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from enum import Enum


# =============================================================================
# DATA MODEL
# =============================================================================

class ThesisStatus(str, Enum):
    ON_TRACK = "on_track"
    WATCH = "watch"
    DRIFT = "drift"
    BROKEN = "broken"


THESIS_STATUS_CONFIG = {
    ThesisStatus.ON_TRACK: {
        'label': 'On Track',
        'icon': '\U0001f7e2',  # green circle
        'color': '#10b981',
        'description': 'KPI within tolerance of thesis trajectory',
    },
    ThesisStatus.WATCH: {
        'label': 'Watch',
        'icon': '\U0001f7e1',  # yellow circle
        'color': '#f59e0b',
        'description': 'KPI diverging but within recovery range',
    },
    ThesisStatus.DRIFT: {
        'label': 'Thesis Drift',
        'icon': '\U0001f534',  # red circle
        'color': '#ef4444',
        'description': 'KPI materially off trajectory; review required',
    },
    ThesisStatus.BROKEN: {
        'label': 'Thesis Broken',
        'icon': '\u26d4',  # no entry
        'color': '#991b1b',
        'description': 'Assumption no longer realistic; position review triggered',
    },
}


@dataclass
class ThesisAssumption:
    """A single trackable assumption within a thesis."""
    id: str
    description: str
    kpi_name: str
    target_value: float
    target_date: str  # YYYY-MM-DD
    tolerance_pct: float = 10.0  # % tolerance before status changes
    current_value: Optional[float] = None
    status: str = ThesisStatus.ON_TRACK.value
    last_updated: Optional[str] = None
    notes: str = ""


@dataclass
class InvestmentThesis:
    """A complete investment thesis for a company."""
    ticker: str
    title: str
    conviction: str = "medium"  # low / medium / high
    direction: str = "long"    # long / short
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    narrative: str = ""
    assumptions: List[Dict] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    overall_status: str = ThesisStatus.ON_TRACK.value

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()
        if not self.updated_at:
            self.updated_at = datetime.now().isoformat()


# =============================================================================
# THESIS STORAGE (SQLite)
# =============================================================================

# Use /tmp for SQLite on Streamlit Cloud — always writable.
def _resolve_thesis_db_path() -> "Path":
    for candidate_dir in [Path("/tmp/atlas_data"), Path("data")]:
        try:
            candidate_dir.mkdir(parents=True, exist_ok=True)
            return candidate_dir / "thesis_engine.db"
        except Exception:
            continue
    return Path("/tmp/thesis_engine.db")

THESIS_DB_PATH = _resolve_thesis_db_path()


class ThesisStore:
    """Persistent storage for investment theses using SQLite."""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or str(THESIS_DB_PATH)
        self._init_db()

    def _init_db(self):
        try:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.db_path)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS theses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_theses_ticker ON theses(ticker)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS thesis_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thesis_id INTEGER NOT NULL,
                    note TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (thesis_id) REFERENCES theses(id)
                )
            """)
            conn.commit()
            conn.close()
        except Exception:
            pass

    def save_thesis(self, thesis: InvestmentThesis) -> int:
        """Save or update a thesis. Returns the thesis ID."""
        thesis.updated_at = datetime.now().isoformat()
        data = json.dumps(asdict(thesis))

        conn = sqlite3.connect(self.db_path)
        # Check if thesis exists for this ticker
        existing = conn.execute(
            "SELECT id FROM theses WHERE ticker = ? ORDER BY updated_at DESC LIMIT 1",
            (thesis.ticker,)
        ).fetchone()

        if existing:
            thesis_id = existing[0]
            conn.execute(
                "UPDATE theses SET data = ?, updated_at = ? WHERE id = ?",
                (data, thesis.updated_at, thesis_id)
            )
        else:
            cursor = conn.execute(
                "INSERT INTO theses (ticker, data, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (thesis.ticker, data, thesis.created_at, thesis.updated_at)
            )
            thesis_id = cursor.lastrowid

        conn.commit()
        conn.close()
        return thesis_id

    def load_thesis(self, ticker: str) -> Optional[InvestmentThesis]:
        """Load the most recent thesis for a ticker."""
        try:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute(
                "SELECT data FROM theses WHERE ticker = ? ORDER BY updated_at DESC LIMIT 1",
                (ticker,)
            ).fetchone()
            conn.close()

            if row is None:
                return None

            data = json.loads(row[0])
            return InvestmentThesis(**data)
        except Exception:
            return None

    def list_theses(self) -> List[Dict]:
        """List all theses with summary info."""
        try:
            conn = sqlite3.connect(self.db_path)
            rows = conn.execute(
                "SELECT ticker, data, updated_at FROM theses ORDER BY updated_at DESC"
            ).fetchall()
            conn.close()

            results = []
            for ticker, data_json, updated_at in rows:
                data = json.loads(data_json)
                results.append({
                    'ticker': ticker,
                    'title': data.get('title', ''),
                    'conviction': data.get('conviction', 'medium'),
                    'direction': data.get('direction', 'long'),
                    'overall_status': data.get('overall_status', ThesisStatus.ON_TRACK.value),
                    'num_assumptions': len(data.get('assumptions', [])),
                    'updated_at': updated_at,
                })
            return results
        except Exception:
            return []

    def delete_thesis(self, ticker: str) -> bool:
        """Delete all theses for a ticker."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute("DELETE FROM theses WHERE ticker = ?", (ticker,))
            conn.commit()
            conn.close()
            return True
        except Exception:
            return False

    def add_note(self, thesis_id: int, note: str):
        """Add a timestamped note to a thesis."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute(
                "INSERT INTO thesis_notes (thesis_id, note, created_at) VALUES (?, ?, ?)",
                (thesis_id, note, datetime.now().isoformat())
            )
            conn.commit()
            conn.close()
        except Exception:
            pass


# =============================================================================
# THESIS EVALUATION ENGINE
# =============================================================================

class ThesisEvaluator:
    """
    Evaluates thesis assumptions against real-time data.
    Maps each assumption's KPI to trackable financial metrics.
    """

    @staticmethod
    def evaluate_assumption(
        assumption: Dict,
        current_value: float,
    ) -> str:
        """
        Evaluate a single assumption against its current KPI value.

        Returns the ThesisStatus string.
        """
        target = assumption.get('target_value', 0)
        tolerance = assumption.get('tolerance_pct', 10.0)

        if target == 0:
            return ThesisStatus.ON_TRACK.value

        deviation_pct = abs((current_value - target) / target) * 100

        if deviation_pct <= tolerance * 0.5:
            return ThesisStatus.ON_TRACK.value
        elif deviation_pct <= tolerance:
            return ThesisStatus.WATCH.value
        elif deviation_pct <= tolerance * 2:
            return ThesisStatus.DRIFT.value
        else:
            return ThesisStatus.BROKEN.value

    @staticmethod
    def evaluate_thesis(thesis: InvestmentThesis) -> ThesisStatus:
        """
        Evaluate overall thesis status based on all assumptions.
        The worst individual status determines the overall status.
        """
        if not thesis.assumptions:
            return ThesisStatus.ON_TRACK

        statuses = [a.get('status', ThesisStatus.ON_TRACK.value) for a in thesis.assumptions]

        priority = [
            ThesisStatus.BROKEN.value,
            ThesisStatus.DRIFT.value,
            ThesisStatus.WATCH.value,
            ThesisStatus.ON_TRACK.value,
        ]

        for status in priority:
            if status in statuses:
                return ThesisStatus(status)

        return ThesisStatus.ON_TRACK

    @staticmethod
    def get_kpi_from_financials(kpi_name: str, financials: Dict) -> Optional[float]:
        """
        Extract a KPI value from financial data.
        Maps common KPI names to data fields.
        """
        kpi_map = {
            'operating_margin': lambda f: f.get('operating_margin'),
            'gross_margin': lambda f: f.get('gross_margin'),
            'net_margin': lambda f: f.get('net_margin'),
            'ebitda_margin': lambda f: f.get('ebitda_margin'),
            'revenue_growth': lambda f: f.get('revenue_growth'),
            'eps_growth': lambda f: f.get('eps_growth'),
            'roic': lambda f: f.get('roic'),
            'roe': lambda f: f.get('roe'),
            'roa': lambda f: f.get('roa'),
            'net_debt_ebitda': lambda f: f.get('net_debt_ebitda'),
            'fcf_conversion': lambda f: f.get('fcf_conversion'),
            'revenue': lambda f: f.get('revenue'),
            'ebitda': lambda f: f.get('ebitda'),
        }

        extractor = kpi_map.get(kpi_name.lower().replace(' ', '_'))
        if extractor:
            return extractor(financials)
        return None


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def create_default_thesis(ticker: str) -> InvestmentThesis:
    """
    Create an illustrative thesis template for a ticker.

    The default assumptions are deliberately concrete and specific — matching
    the spec's design philosophy that the Thesis Engine should track whether
    the analyst's reasoning still holds, not just whether the price moved.

    Analysts should edit these to reflect their actual thesis. The examples
    are calibrated to be realistic starting points for a typical long thesis.
    """
    fy2 = (datetime.now().replace(year=datetime.now().year + 2)).strftime('%Y-%m-%d')
    fy3 = (datetime.now().replace(year=datetime.now().year + 3)).strftime('%Y-%m-%d')

    return InvestmentThesis(
        ticker=ticker,
        title=f"{ticker} — Long Thesis",
        conviction="medium",
        direction="long",
        narrative=(
            f"We believe {ticker} is materially undervalued relative to its earnings power. "
            f"The core thesis rests on three pillars: (1) operating margin expansion as "
            f"fixed-cost leverage emerges at scale, (2) sustained double-digit revenue growth "
            f"driven by market share gains, and (3) balance sheet deleveraging that reduces "
            f"financial risk and releases capital for buybacks or reinvestment. "
            f"Edit this narrative to reflect your actual reasoning."
        ),
        assumptions=[
            {
                'id': 'a1',
                'description': 'Operating margin expands from current level to 18% by FY+2',
                'kpi_name': 'operating_margin_pct',
                'target_value': 18.0,
                'target_date': fy2,
                'tolerance_pct': 12.0,
                'current_value': None,
                'status': ThesisStatus.ON_TRACK.value,
                'last_updated': None,
                'notes': (
                    'Track quarterly operating income / revenue. '
                    'Alert if trajectory implies <15% by FY+2.'
                ),
            },
            {
                'id': 'a2',
                'description': 'Revenue CAGR of 10%+ through FY+3 driven by core market expansion',
                'kpi_name': 'revenue_yoy_growth_pct',
                'target_value': 10.0,
                'target_date': fy3,
                'tolerance_pct': 15.0,
                'current_value': None,
                'status': ThesisStatus.ON_TRACK.value,
                'last_updated': None,
                'notes': (
                    'Watch quarterly revenue growth trends. '
                    'Management guidance revisions are leading indicator.'
                ),
            },
            {
                'id': 'a3',
                'description': 'Net Debt / EBITDA declines below 1.5x by FY+2',
                'kpi_name': 'net_debt_ebitda_ratio',
                'target_value': 1.5,
                'target_date': fy2,
                'tolerance_pct': 20.0,
                'current_value': None,
                'status': ThesisStatus.ON_TRACK.value,
                'last_updated': None,
                'notes': (
                    'Calculated from balance sheet: (Total Debt - Cash) / EBITDA. '
                    'Monitor for unexpected debt issuance or EBITDA miss.'
                ),
            },
            {
                'id': 'a4',
                'description': 'Free cash flow conversion exceeds 80% of net income',
                'kpi_name': 'fcf_conversion_pct',
                'target_value': 80.0,
                'target_date': fy2,
                'tolerance_pct': 10.0,
                'current_value': None,
                'status': ThesisStatus.ON_TRACK.value,
                'last_updated': None,
                'notes': (
                    'FCF = Operating Cash Flow - Capex. '
                    'Working capital deterioration or capex ramp are key risks.'
                ),
            },
        ]
    )


# Singleton instances
thesis_store = ThesisStore()
thesis_evaluator = ThesisEvaluator()
