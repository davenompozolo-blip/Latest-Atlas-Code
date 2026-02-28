"""
ATLAS Terminal — Report Scheduler (Phase 8, Initiative 3)
==========================================================
Runs as a standalone process (third container). Uses APScheduler to
trigger weekly/monthly/quarterly report generation and email delivery.

Calls the data layer directly — no Streamlit runtime required.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

# Ensure project root is importable
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("atlas.scheduler")

# Error log (shared with monitoring module)
_ERROR_LOG = Path(_PROJECT_ROOT) / "atlas_errors.log"

_CONFIG_FILE = Path(_PROJECT_ROOT) / "scheduler" / "report_config.json"


def _load_report_configs() -> list[dict]:
    """Load user report configurations."""
    if not _CONFIG_FILE.exists():
        return []
    return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))


def _log_error(job_name: str, error: str):
    """Append error to atlas_errors.log."""
    timestamp = datetime.utcnow().isoformat()
    with open(_ERROR_LOG, "a", encoding="utf-8") as f:
        f.write(f"{timestamp} | SCHEDULER | {job_name} | {error}\n")


def run_weekly_snapshots():
    """Execute weekly snapshot for all configured users."""
    logger.info("Starting weekly snapshot job")
    from scheduler.jobs.weekly_snapshot import execute_weekly_snapshot

    configs = _load_report_configs()
    for cfg in configs:
        if not cfg.get("weekly_snapshot", {}).get("enabled", False):
            continue
        try:
            execute_weekly_snapshot(cfg)
            logger.info(f"Weekly snapshot sent to {cfg.get('email', 'unknown')}")
        except Exception as e:
            logger.error(f"Weekly snapshot failed for {cfg.get('email')}: {e}")
            _log_error("weekly_snapshot", str(e))


def run_monthly_commentary():
    """Execute monthly positioning commentary for all configured users."""
    logger.info("Starting monthly commentary job")
    from scheduler.jobs.monthly_commentary import execute_monthly_commentary

    configs = _load_report_configs()
    for cfg in configs:
        if not cfg.get("monthly_commentary", {}).get("enabled", False):
            continue
        try:
            execute_monthly_commentary(cfg)
            logger.info(f"Monthly commentary sent to {cfg.get('email', 'unknown')}")
        except Exception as e:
            logger.error(f"Monthly commentary failed for {cfg.get('email')}: {e}")
            _log_error("monthly_commentary", str(e))


def run_quarterly_attribution():
    """Execute quarterly attribution for all configured users."""
    logger.info("Starting quarterly attribution job")
    from scheduler.jobs.quarterly_attribution import execute_quarterly_attribution

    configs = _load_report_configs()
    for cfg in configs:
        if not cfg.get("quarterly_attribution", {}).get("enabled", False):
            continue
        try:
            execute_quarterly_attribution(cfg)
            logger.info(f"Quarterly attribution sent to {cfg.get('email', 'unknown')}")
        except Exception as e:
            logger.error(f"Quarterly attribution failed for {cfg.get('email')}: {e}")
            _log_error("quarterly_attribution", str(e))


def main():
    """Start the scheduler."""
    logger.info("ATLAS Report Scheduler starting...")

    scheduler = BlockingScheduler(timezone="Africa/Johannesburg")

    # Weekly snapshot: Monday 07:00 SAST
    scheduler.add_job(
        run_weekly_snapshots,
        CronTrigger(day_of_week="mon", hour=7, minute=0),
        id="weekly_snapshot",
        name="Weekly Portfolio Snapshot",
        misfire_grace_time=3600,
    )

    # Monthly commentary: 1st of each month, 07:00 SAST
    scheduler.add_job(
        run_monthly_commentary,
        CronTrigger(day=1, hour=7, minute=0),
        id="monthly_commentary",
        name="Monthly Positioning Commentary",
        misfire_grace_time=3600,
    )

    # Quarterly attribution: last day of Mar, Jun, Sep, Dec
    for month in [3, 6, 9, 12]:
        scheduler.add_job(
            run_quarterly_attribution,
            CronTrigger(month=month, day="last", hour=7, minute=0),
            id=f"quarterly_attribution_q{month // 3}",
            name=f"Quarterly Attribution (Q{month // 3})",
            misfire_grace_time=3600,
        )

    logger.info("Scheduler jobs registered:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.name} (next: {job.next_run_time})")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler shutting down")


if __name__ == "__main__":
    main()
