"""
ATLAS TERMINAL v10.0 - PROJECT STATUS DASHBOARD
================================================

Display comprehensive project status and health metrics.

Usage:
    python scripts/status.py
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import json
from datetime import datetime
from typing import Dict, List, Tuple


# ===================================================================
# STATUS CHECKS
# ===================================================================

def check_python_version() -> Tuple[bool, str]:
    """Check Python version"""
    import platform
    version = platform.python_version()
    major, minor = map(int, version.split('.')[:2])

    if major >= 3 and minor >= 9:
        return True, f"✅ Python {version}"
    else:
        return False, f"❌ Python {version} (3.9+ required)"


def check_dependencies() -> Tuple[bool, List[str]]:
    """Check required dependencies"""
    required = {
        'numpy': 'NumPy',
        'pandas': 'Pandas',
        'scipy': 'SciPy',
        'matplotlib': 'Matplotlib',
        'seaborn': 'Seaborn',
        'streamlit': 'Streamlit',
        'requests': 'Requests',
        'beautifulsoup4': 'BeautifulSoup',
        'yfinance': 'yfinance',
    }

    installed = []
    missing = []

    for module, name in required.items():
        try:
            __import__(module)
            installed.append(f"✅ {name}")
        except ImportError:
            missing.append(f"❌ {name}")

    all_installed = len(missing) == 0
    return all_installed, installed + missing


def check_directories() -> Tuple[bool, List[str]]:
    """Check required directories"""
    required_dirs = ['data', 'cache', 'output', 'logs',
                     'quant_optimizer', 'investopedia_integration',
                     'multi_source_data', 'patches', 'docs']

    status = []
    all_exist = True

    for dir_name in required_dirs:
        dir_path = PROJECT_ROOT / dir_name
        if dir_path.exists():
            status.append(f"✅ {dir_name}/")
        else:
            status.append(f"❌ {dir_name}/ (missing)")
            all_exist = False

    return all_exist, status


def check_configuration() -> Tuple[bool, Dict]:
    """Check configuration status"""
    try:
        import config

        errors, warnings = config.validate_config()

        return len(errors) == 0, {
            'valid': len(errors) == 0,
            'errors': len(errors),
            'warnings': len(warnings),
            'leverage': config.DEFAULT_LEVERAGE,
            'risk_free_rate': config.DEFAULT_RISK_FREE_RATE
        }
    except Exception as e:
        return False, {'error': str(e)}


def check_api_keys() -> Dict[str, bool]:
    """Check API key configuration"""
    try:
        import config

        return {
            'Alpha Vantage': bool(config.ALPHA_VANTAGE_KEY),
            'FMP': bool(config.FMP_KEY),
            'Polygon': bool(config.POLYGON_KEY),
            'IEX Cloud': bool(config.IEX_CLOUD_KEY),
            'Finnhub': bool(config.FINNHUB_KEY),
        }
    except:
        return {}


def check_modules() -> Tuple[bool, List[str]]:
    """Check ATLAS modules"""
    modules = [
        'quant_optimizer.atlas_quant_portfolio_optimizer',
        'quant_optimizer.atlas_quant_optimizer_ui',
        'investopedia_integration.atlas_investopedia_production_2fa',
        'multi_source_data.atlas_multi_source_data_broker',
        'patches.atlas_leverage_fix',
        'patches.atlas_heatmap_fix',
    ]

    status = []
    all_working = True

    for module in modules:
        try:
            __import__(module)
            status.append(f"✅ {module}")
        except Exception as e:
            status.append(f"❌ {module}: {str(e)[:50]}")
            all_working = False

    return all_working, status


def check_data_files() -> Dict:
    """Check for data files"""
    data_dir = PROJECT_ROOT / 'data'

    if not data_dir.exists():
        return {'exists': False}

    files = {
        'csv': len(list(data_dir.glob('*.csv'))),
        'json': len(list(data_dir.glob('*.json'))),
        'pkl': len(list(data_dir.glob('*.pkl'))),
        'total': len(list(data_dir.glob('*.*')))
    }

    return {'exists': True, 'files': files}


def check_session() -> Dict:
    """Check Investopedia session"""
    session_file = PROJECT_ROOT / 'investopedia_session.pkl'

    if not session_file.exists():
        return {'exists': False}

    import pickle
    from datetime import datetime

    try:
        with open(session_file, 'rb') as f:
            session = pickle.load(f)

        modified = datetime.fromtimestamp(session_file.stat().st_mtime)
        age = (datetime.now() - modified).total_seconds() / 3600  # hours

        return {
            'exists': True,
            'age_hours': age,
            'size_bytes': session_file.stat().st_size,
            'modified': modified.strftime('%Y-%m-%d %H:%M:%S')
        }
    except:
        return {'exists': True, 'error': 'Failed to read'}


def check_git_status() -> Dict:
    """Check git repository status"""
    try:
        import subprocess

        # Check if git repo
        result = subprocess.run(
            ['git', 'rev-parse', '--git-dir'],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            return {'is_repo': False}

        # Get branch
        branch = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True
        ).stdout.strip()

        # Get commit count
        commit_count = subprocess.run(
            ['git', 'rev-list', '--count', 'HEAD'],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True
        ).stdout.strip()

        # Get status
        status = subprocess.run(
            ['git', 'status', '--short'],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True
        ).stdout.strip()

        return {
            'is_repo': True,
            'branch': branch,
            'commits': int(commit_count),
            'modified_files': len(status.split('\n')) if status else 0
        }
    except:
        return {'is_repo': False}


# ===================================================================
# DISPLAY FUNCTIONS
# ===================================================================

def print_header(title: str):
    """Print section header"""
    print("\n" + "="*80)
    print(title)
    print("="*80)


def print_status_line(label: str, status: bool, details: str = ""):
    """Print status line"""
    icon = "✅" if status else "❌"
    print(f"{icon} {label:<30} {details}")


# ===================================================================
# MAIN DASHBOARD
# ===================================================================

def display_dashboard():
    """Display complete status dashboard"""

    print_header("🚀 ATLAS TERMINAL v10.0 - PROJECT STATUS DASHBOARD")

    print(f"\n📅 Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📁 Location: {PROJECT_ROOT}")

    # ===================================================================
    # SYSTEM
    # ===================================================================

    print_header("💻 SYSTEM")

    # Python version
    py_ok, py_msg = check_python_version()
    print(f"{py_msg}")

    # OS
    import platform
    print(f"✅ Operating System: {platform.system()} {platform.release()}")

    # Architecture
    print(f"✅ Architecture: {platform.machine()}")

    # ===================================================================
    # DEPENDENCIES
    # ===================================================================

    print_header("📦 DEPENDENCIES")

    deps_ok, deps_list = check_dependencies()
    for dep in deps_list:
        print(f"   {dep}")

    if not deps_ok:
        print("\n⚠️  Install missing dependencies:")
        print("   pip install -r requirements.txt")

    # ===================================================================
    # PROJECT STRUCTURE
    # ===================================================================

    print_header("📁 PROJECT STRUCTURE")

    dirs_ok, dirs_list = check_directories()
    for dir_status in dirs_list:
        print(f"   {dir_status}")

    if not dirs_ok:
        print("\n⚠️  Create missing directories:")
        print("   mkdir -p data cache output logs")

    # ===================================================================
    # CONFIGURATION
    # ===================================================================

    print_header("⚙️  CONFIGURATION")

    config_ok, config_info = check_configuration()

    if config_ok:
        print(f"✅ Configuration valid")
        print(f"   Leverage: {config_info.get('leverage', 'N/A')}x")
        print(f"   Risk-Free Rate: {config_info.get('risk_free_rate', 0)*100:.1f}%")
        print(f"   Warnings: {config_info.get('warnings', 0)}")
    else:
        print(f"❌ Configuration invalid")
        if 'error' in config_info:
            print(f"   Error: {config_info['error']}")

    # API Keys
    print("\n🔑 API Keys:")
    api_keys = check_api_keys()
    for source, configured in api_keys.items():
        icon = "✅" if configured else "❌"
        print(f"   {icon} {source}")

    if not all(api_keys.values()):
        print("\n⚠️  Configure API keys in .env file")

    # ===================================================================
    # MODULES
    # ===================================================================

    print_header("🧩 ATLAS MODULES")

    modules_ok, modules_list = check_modules()
    for module in modules_list:
        print(f"   {module}")

    if not modules_ok:
        print("\n⚠️  Some modules failed to import")

    # ===================================================================
    # DATA
    # ===================================================================

    print_header("💾 DATA FILES")

    data_status = check_data_files()

    if data_status['exists']:
        files = data_status['files']
        print(f"✅ Data directory exists")
        print(f"   CSV files: {files['csv']}")
        print(f"   JSON files: {files['json']}")
        print(f"   PKL files: {files['pkl']}")
        print(f"   Total files: {files['total']}")
    else:
        print(f"❌ Data directory not found")

    # Session
    print("\n🔐 Investopedia Session:")
    session_status = check_session()

    if session_status['exists']:
        if 'error' not in session_status:
            print(f"✅ Session file exists")
            print(f"   Age: {session_status['age_hours']:.1f} hours")
            print(f"   Size: {session_status['size_bytes']} bytes")
            print(f"   Modified: {session_status['modified']}")

            if session_status['age_hours'] > 24:
                print(f"   ⚠️  Session may be expired (>24 hours old)")
        else:
            print(f"⚠️  Session file exists but cannot be read")
    else:
        print(f"❌ No session file (login required)")

    # ===================================================================
    # GIT
    # ===================================================================

    print_header("📚 VERSION CONTROL")

    git_status = check_git_status()

    if git_status['is_repo']:
        print(f"✅ Git repository initialized")
        print(f"   Branch: {git_status['branch']}")
        print(f"   Commits: {git_status['commits']}")
        print(f"   Modified files: {git_status['modified_files']}")
    else:
        print(f"❌ Not a git repository")
        print(f"   Initialize with: git init")

    # ===================================================================
    # HEALTH SUMMARY
    # ===================================================================

    print_header("🏥 HEALTH SUMMARY")

    health_checks = {
        'Python Version': py_ok,
        'Dependencies': deps_ok,
        'Directories': dirs_ok,
        'Configuration': config_ok,
        'Modules': modules_ok,
    }

    passed = sum(health_checks.values())
    total = len(health_checks)

    for check, status in health_checks.items():
        print_status_line(check, status)

    print(f"\n📊 Overall Health: {passed}/{total} checks passed")

    if passed == total:
        print("✅ SYSTEM HEALTHY - Ready for production!")
    elif passed >= total - 1:
        print("⚠️  MOSTLY HEALTHY - Minor issues detected")
    else:
        print("❌ NEEDS ATTENTION - Multiple issues detected")

    # ===================================================================
    # QUICK ACTIONS
    # ===================================================================

    print_header("🚀 QUICK ACTIONS")

    print("Launch ATLAS Terminal:")
    print("   streamlit run atlas_app.py")

    print("\nRun tests:")
    print("   python tests/test_all.py")

    print("\nGenerate sample data:")
    print("   python scripts/generate_sample_data.py")

    print("\nClear cache:")
    print("   python scripts/utils.py --clear-cache")

    print("\nView logs:")
    print("   python scripts/utils.py --view-logs")

    print("\nBenchmark performance:")
    print("   python scripts/benchmark.py --quick")

    # ===================================================================
    # FOOTER
    # ===================================================================

    print("\n" + "="*80)
    print("📖 Documentation: docs/")
    print("🐛 Issues: https://github.com/davenompozolo-blip/Latest-Atlas-Code/issues")
    print("📧 Contact: davenompozolo@gmail.com")
    print("="*80)
    print()


# ===================================================================
# MAIN
# ===================================================================

if __name__ == '__main__':
    try:
        display_dashboard()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error generating status: {e}")
        import traceback
        traceback.print_exc()
