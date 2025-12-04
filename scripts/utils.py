"""
ATLAS TERMINAL v10.0 - UTILITY SCRIPTS
=======================================

Common utility functions for ATLAS Terminal operations.

Usage:
    python scripts/utils.py --help
"""

import sys
import os
from pathlib import Path
import argparse
import json
import pickle
from datetime import datetime
import shutil

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ===================================================================
# CACHE MANAGEMENT
# ===================================================================

def clear_cache():
    """Clear all cached data"""
    print("\n🗑️  CLEARING CACHE")
    print("="*80)

    cache_dirs = [
        PROJECT_ROOT / 'cache',
        PROJECT_ROOT / '__pycache__',
        PROJECT_ROOT / 'data' / '__pycache__',
    ]

    cache_files = [
        PROJECT_ROOT / 'investopedia_session.pkl',
    ]

    # Remove cache directories
    for cache_dir in cache_dirs:
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
            print(f"✅ Removed: {cache_dir}")
            cache_dir.mkdir(exist_ok=True)

    # Remove cache files
    for cache_file in cache_files:
        if cache_file.exists():
            os.remove(cache_file)
            print(f"✅ Removed: {cache_file}")

    print("\n✅ Cache cleared successfully!")


# ===================================================================
# SESSION MANAGEMENT
# ===================================================================

def view_session():
    """View saved session data"""
    print("\n🔍 SESSION DATA")
    print("="*80)

    session_file = PROJECT_ROOT / 'investopedia_session.pkl'

    if not session_file.exists():
        print("❌ No session file found")
        return

    try:
        with open(session_file, 'rb') as f:
            session_data = pickle.load(f)

        print(f"📁 File: {session_file}")
        print(f"📊 Size: {session_file.stat().st_size} bytes")
        print(f"🕒 Modified: {datetime.fromtimestamp(session_file.stat().st_mtime)}")
        print(f"\n📋 Session contains:")
        print(f"   - Cookies: {len(session_data.cookies) if hasattr(session_data, 'cookies') else 'N/A'}")
        print(f"   - Headers: {len(session_data.headers) if hasattr(session_data, 'headers') else 'N/A'}")

    except Exception as e:
        print(f"❌ Error reading session: {e}")


def clear_session():
    """Clear saved session"""
    print("\n🗑️  CLEARING SESSION")
    print("="*80)

    session_file = PROJECT_ROOT / 'investopedia_session.pkl'

    if session_file.exists():
        os.remove(session_file)
        print(f"✅ Removed: {session_file}")
    else:
        print("⚠️  No session file to remove")


# ===================================================================
# LOG MANAGEMENT
# ===================================================================

def view_logs(lines=50):
    """View recent log entries"""
    print(f"\n📜 RECENT LOGS (last {lines} lines)")
    print("="*80)

    log_file = PROJECT_ROOT / 'logs' / 'atlas_terminal.log'

    if not log_file.exists():
        print("❌ No log file found")
        return

    try:
        with open(log_file, 'r') as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:]

        print(f"📁 File: {log_file}")
        print(f"📊 Total lines: {len(all_lines)}")
        print(f"\n📋 Recent entries:\n")

        for line in recent_lines:
            print(line.rstrip())

    except Exception as e:
        print(f"❌ Error reading logs: {e}")


def clear_logs():
    """Clear log files"""
    print("\n🗑️  CLEARING LOGS")
    print("="*80)

    log_dir = PROJECT_ROOT / 'logs'

    if not log_dir.exists():
        print("⚠️  No logs directory found")
        return

    for log_file in log_dir.glob('*.log'):
        os.remove(log_file)
        print(f"✅ Removed: {log_file}")

    print("\n✅ Logs cleared successfully!")


# ===================================================================
# DATABASE MANAGEMENT
# ===================================================================

def backup_data():
    """Backup data directory"""
    print("\n💾 BACKING UP DATA")
    print("="*80)

    data_dir = PROJECT_ROOT / 'data'
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_dir = PROJECT_ROOT / 'backups' / f'data_backup_{timestamp}'

    if not data_dir.exists():
        print("⚠️  No data directory found")
        return

    # Create backups directory
    backup_dir.parent.mkdir(exist_ok=True)

    # Copy data directory
    shutil.copytree(data_dir, backup_dir)

    print(f"✅ Backup created: {backup_dir}")
    print(f"📊 Size: {sum(f.stat().st_size for f in backup_dir.rglob('*') if f.is_file())} bytes")


def restore_data(backup_name):
    """Restore data from backup"""
    print("\n♻️  RESTORING DATA")
    print("="*80)

    backup_dir = PROJECT_ROOT / 'backups' / backup_name

    if not backup_dir.exists():
        print(f"❌ Backup not found: {backup_name}")
        return

    data_dir = PROJECT_ROOT / 'data'

    # Backup current data first
    if data_dir.exists():
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        temp_backup = PROJECT_ROOT / 'backups' / f'data_before_restore_{timestamp}'
        shutil.copytree(data_dir, temp_backup)
        print(f"💾 Current data backed up to: {temp_backup}")

        # Remove current data
        shutil.rmtree(data_dir)

    # Restore from backup
    shutil.copytree(backup_dir, data_dir)
    print(f"✅ Data restored from: {backup_name}")


def list_backups():
    """List available backups"""
    print("\n📋 AVAILABLE BACKUPS")
    print("="*80)

    backups_dir = PROJECT_ROOT / 'backups'

    if not backups_dir.exists():
        print("⚠️  No backups directory found")
        return

    backups = sorted(backups_dir.glob('data_backup_*'), reverse=True)

    if not backups:
        print("⚠️  No backups found")
        return

    for backup in backups:
        size = sum(f.stat().st_size for f in backup.rglob('*') if f.is_file())
        modified = datetime.fromtimestamp(backup.stat().st_mtime)
        print(f"📦 {backup.name}")
        print(f"   Size: {size:,} bytes")
        print(f"   Date: {modified.strftime('%Y-%m-%d %H:%M:%S')}")
        print()


# ===================================================================
# ENVIRONMENT MANAGEMENT
# ===================================================================

def check_env():
    """Check environment configuration"""
    print("\n🔍 ENVIRONMENT CHECK")
    print("="*80)

    env_file = PROJECT_ROOT / '.env'

    if not env_file.exists():
        print("❌ .env file not found")
        print("💡 Run: cp .env.example .env")
        return

    print(f"✅ .env file found")

    # Check for required variables
    required_vars = [
        'INVESTOPEDIA_EMAIL',
        'INVESTOPEDIA_PASSWORD',
    ]

    optional_vars = [
        'ALPHA_VANTAGE_KEY',
        'FMP_KEY',
        'POLYGON_KEY',
        'IEX_CLOUD_KEY',
    ]

    print("\n📋 Required variables:")
    with open(env_file, 'r') as f:
        content = f.read()

    for var in required_vars:
        if var in content and not content.split(var)[1].split('\n')[0].strip() == '=':
            print(f"   ✅ {var}")
        else:
            print(f"   ❌ {var} (not set)")

    print("\n📋 Optional variables:")
    for var in optional_vars:
        if var in content and not content.split(var)[1].split('\n')[0].strip() == '=':
            print(f"   ✅ {var}")
        else:
            print(f"   ⚠️  {var} (not set)")


def create_env():
    """Create .env file from template"""
    print("\n📝 CREATING .env FILE")
    print("="*80)

    env_example = PROJECT_ROOT / '.env.example'
    env_file = PROJECT_ROOT / '.env'

    if env_file.exists():
        print("⚠️  .env file already exists")
        response = input("Overwrite? [y/N]: ")
        if response.lower() != 'y':
            print("❌ Aborted")
            return

    if not env_example.exists():
        print("❌ .env.example not found")
        return

    shutil.copy(env_example, env_file)
    print(f"✅ Created: {env_file}")
    print("💡 Edit this file to add your API keys")


# ===================================================================
# PROJECT STATISTICS
# ===================================================================

def show_stats():
    """Show project statistics"""
    print("\n📊 PROJECT STATISTICS")
    print("="*80)

    # Count files
    python_files = list(PROJECT_ROOT.rglob('*.py'))
    md_files = list(PROJECT_ROOT.rglob('*.md'))
    test_files = list((PROJECT_ROOT / 'tests').rglob('*.py')) if (PROJECT_ROOT / 'tests').exists() else []

    # Count lines
    total_lines = 0
    for py_file in python_files:
        try:
            with open(py_file, 'r', encoding='utf-8') as f:
                total_lines += len(f.readlines())
        except:
            pass

    print(f"\n📁 Files:")
    print(f"   Python files: {len(python_files)}")
    print(f"   Markdown files: {len(md_files)}")
    print(f"   Test files: {len(test_files)}")

    print(f"\n📏 Lines of code:")
    print(f"   Total Python lines: {total_lines:,}")

    print(f"\n📦 Directories:")
    dirs = ['quant_optimizer', 'investopedia_integration', 'multi_source_data', 'patches', 'docs', 'tests']
    for dir_name in dirs:
        dir_path = PROJECT_ROOT / dir_name
        if dir_path.exists():
            file_count = len(list(dir_path.rglob('*.py')))
            print(f"   {dir_name}: {file_count} files")


# ===================================================================
# HEALTH CHECK
# ===================================================================

def health_check():
    """Run system health check"""
    print("\n🏥 HEALTH CHECK")
    print("="*80)

    checks = []

    # Check Python version
    import sys
    py_version = sys.version_info
    if py_version >= (3, 9):
        print(f"✅ Python version: {py_version.major}.{py_version.minor}.{py_version.micro}")
        checks.append(True)
    else:
        print(f"❌ Python version: {py_version.major}.{py_version.minor}.{py_version.micro} (need 3.9+)")
        checks.append(False)

    # Check required directories
    required_dirs = ['data', 'cache', 'output', 'logs']
    for dir_name in required_dirs:
        dir_path = PROJECT_ROOT / dir_name
        if dir_path.exists():
            print(f"✅ Directory exists: {dir_name}/")
            checks.append(True)
        else:
            print(f"❌ Directory missing: {dir_name}/")
            checks.append(False)

    # Check config file
    if (PROJECT_ROOT / 'config.py').exists():
        print(f"✅ Configuration file exists")
        checks.append(True)
    else:
        print(f"❌ Configuration file missing")
        checks.append(False)

    # Check .env
    if (PROJECT_ROOT / '.env').exists():
        print(f"✅ Environment file exists")
        checks.append(True)
    else:
        print(f"⚠️  Environment file missing (optional)")
        checks.append(True)  # Don't fail on this

    # Summary
    passed = sum(checks)
    total = len(checks)
    print(f"\n📊 Health: {passed}/{total} checks passed")

    if passed == total:
        print("✅ System is healthy!")
    else:
        print("⚠️  Some issues found")


# ===================================================================
# MAIN CLI
# ===================================================================

def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description='ATLAS Terminal Utility Scripts',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/utils.py --clear-cache
  python scripts/utils.py --view-logs --lines 100
  python scripts/utils.py --backup-data
  python scripts/utils.py --health-check
        """
    )

    # Cache operations
    parser.add_argument('--clear-cache', action='store_true', help='Clear all cached data')

    # Session operations
    parser.add_argument('--view-session', action='store_true', help='View session data')
    parser.add_argument('--clear-session', action='store_true', help='Clear session data')

    # Log operations
    parser.add_argument('--view-logs', action='store_true', help='View recent logs')
    parser.add_argument('--clear-logs', action='store_true', help='Clear all logs')
    parser.add_argument('--lines', type=int, default=50, help='Number of log lines to show')

    # Data operations
    parser.add_argument('--backup-data', action='store_true', help='Backup data directory')
    parser.add_argument('--restore-data', metavar='BACKUP', help='Restore from backup')
    parser.add_argument('--list-backups', action='store_true', help='List available backups')

    # Environment operations
    parser.add_argument('--check-env', action='store_true', help='Check environment config')
    parser.add_argument('--create-env', action='store_true', help='Create .env from template')

    # Info operations
    parser.add_argument('--stats', action='store_true', help='Show project statistics')
    parser.add_argument('--health-check', action='store_true', help='Run health check')

    args = parser.parse_args()

    # Execute requested operation
    if args.clear_cache:
        clear_cache()
    elif args.view_session:
        view_session()
    elif args.clear_session:
        clear_session()
    elif args.view_logs:
        view_logs(args.lines)
    elif args.clear_logs:
        clear_logs()
    elif args.backup_data:
        backup_data()
    elif args.restore_data:
        restore_data(args.restore_data)
    elif args.list_backups:
        list_backups()
    elif args.check_env:
        check_env()
    elif args.create_env:
        create_env()
    elif args.stats:
        show_stats()
    elif args.health_check:
        health_check()
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
