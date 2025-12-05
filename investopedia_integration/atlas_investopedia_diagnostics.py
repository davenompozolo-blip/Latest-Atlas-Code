"""
ATLAS Investopedia Diagnostics
Tools for testing and debugging Investopedia integration
"""

import os
import json
from datetime import datetime
from typing import Dict


def check_session_status() -> Dict:
    """
    Check Investopedia session status

    Returns:
        Dict with session information
    """
    session_file = "data/sessions/investopedia_session.json"

    status = {
        'session_exists': False,
        'session_age_hours': None,
        'session_valid': False,
        'last_login': None
    }

    if os.path.exists(session_file):
        status['session_exists'] = True

        try:
            with open(session_file, 'r') as f:
                session_data = json.load(f)

            timestamp = datetime.fromisoformat(session_data['timestamp'])
            age_hours = (datetime.now() - timestamp).total_seconds() / 3600

            status['session_age_hours'] = age_hours
            status['session_valid'] = age_hours < 24
            status['last_login'] = session_data['timestamp']

        except Exception as e:
            status['error'] = str(e)

    return status


def print_diagnostic_report():
    """Print formatted diagnostic report"""
    print("=" * 80)
    print("INVESTOPEDIA INTEGRATION DIAGNOSTICS")
    print("=" * 80)

    status = check_session_status()

    print("\n📊 Session Status:")
    print(f"  Session File Exists: {'✅' if status['session_exists'] else '❌'}")

    if status['session_exists']:
        print(f"  Session Age: {status['session_age_hours']:.1f} hours")
        print(f"  Session Valid: {'✅' if status['session_valid'] else '❌'}")
        print(f"  Last Login: {status['last_login']}")

    print("\n" + "=" * 80)


__all__ = ['check_session_status', 'print_diagnostic_report']
