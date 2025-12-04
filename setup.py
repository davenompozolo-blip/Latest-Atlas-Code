"""
ATLAS TERMINAL v10.0 - SETUP SCRIPT
====================================

Installation and setup script for ATLAS Terminal.

Usage:
    python setup.py install
    python setup.py develop
    python setup.py test
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README for long description
README = Path(__file__).parent / "README.md"
if README.exists():
    long_description = README.read_text(encoding='utf-8')
else:
    long_description = "ATLAS Terminal - Institutional-Grade Portfolio Management Platform"

# Read requirements
REQUIREMENTS = Path(__file__).parent / "requirements.txt"
if REQUIREMENTS.exists():
    requirements = [
        line.strip()
        for line in REQUIREMENTS.read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.startswith('#')
    ]
else:
    # Fallback minimal requirements
    requirements = [
        'numpy>=1.24.0',
        'pandas>=2.0.0',
        'scipy>=1.10.0',
        'matplotlib>=3.7.0',
        'seaborn>=0.12.0',
        'requests>=2.31.0',
        'beautifulsoup4>=4.12.0',
        'lxml>=4.9.0',
        'yfinance>=0.2.28',
        'streamlit>=1.28.0',
    ]

setup(
    # ===================================================================
    # PACKAGE METADATA
    # ===================================================================

    name='atlas-terminal',
    version='10.0.0',
    description='Institutional-Grade Portfolio Management & Optimization Platform',
    long_description=long_description,
    long_description_content_type='text/markdown',

    # ===================================================================
    # AUTHOR INFO
    # ===================================================================

    author='Hlobo Nompozolo',
    author_email='davenompozolo@gmail.com',
    url='https://github.com/davenompozolo-blip/Latest-Atlas-Code',

    # ===================================================================
    # LICENSE
    # ===================================================================

    license='MIT',

    # ===================================================================
    # CLASSIFIERS
    # ===================================================================

    classifiers=[
        # Development Status
        'Development Status :: 4 - Beta',

        # Intended Audience
        'Intended Audience :: Financial and Insurance Industry',
        'Intended Audience :: Developers',
        'Intended Audience :: Science/Research',

        # Topics
        'Topic :: Office/Business :: Financial :: Investment',
        'Topic :: Scientific/Engineering :: Mathematics',
        'Topic :: Software Development :: Libraries :: Python Modules',

        # License
        'License :: OSI Approved :: MIT License',

        # Python Versions
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'Programming Language :: Python :: 3.12',

        # Operating Systems
        'Operating System :: OS Independent',
    ],

    # ===================================================================
    # KEYWORDS
    # ===================================================================

    keywords=[
        'portfolio-optimization',
        'quantitative-finance',
        'investment-analysis',
        'risk-management',
        'monte-carlo-simulation',
        'efficient-frontier',
        'sharpe-ratio',
        'var',
        'cvar',
        'financial-modeling',
        'streamlit',
        'data-aggregation',
    ],

    # ===================================================================
    # PACKAGES
    # ===================================================================

    packages=find_packages(exclude=['tests', 'tests.*', 'notebooks', 'docs']),

    # Include package data
    include_package_data=True,

    # ===================================================================
    # DEPENDENCIES
    # ===================================================================

    python_requires='>=3.9',
    install_requires=requirements,

    # Optional dependencies
    extras_require={
        'dev': [
            'pytest>=7.4.0',
            'pytest-cov>=4.1.0',
            'black>=23.0.0',
            'flake8>=6.0.0',
            'mypy>=1.5.0',
            'jupyter>=1.0.0',
        ],
        'ml': [
            'scikit-learn>=1.3.0',
            'tensorflow>=2.13.0',
        ],
        'all': [
            'pytest>=7.4.0',
            'pytest-cov>=4.1.0',
            'black>=23.0.0',
            'flake8>=6.0.0',
            'mypy>=1.5.0',
            'jupyter>=1.0.0',
            'scikit-learn>=1.3.0',
        ],
    },

    # ===================================================================
    # ENTRY POINTS
    # ===================================================================

    entry_points={
        'console_scripts': [
            'atlas=atlas_app:main',
            'atlas-test=tests.run_tests:main',
            'atlas-optimize=quant_optimizer.atlas_quant_portfolio_optimizer:main',
        ],
    },

    # ===================================================================
    # PROJECT URLS
    # ===================================================================

    project_urls={
        'Bug Reports': 'https://github.com/davenompozolo-blip/Latest-Atlas-Code/issues',
        'Source': 'https://github.com/davenompozolo-blip/Latest-Atlas-Code',
        'Documentation': 'https://github.com/davenompozolo-blip/Latest-Atlas-Code/tree/main/docs',
    },

    # ===================================================================
    # PACKAGE DATA
    # ===================================================================

    package_data={
        'atlas_terminal': [
            'data/*.csv',
            'data/*.json',
            'docs/*.md',
        ],
    },

    # ===================================================================
    # ZIP SAFE
    # ===================================================================

    zip_safe=False,
)


# ===================================================================
# CUSTOM COMMANDS
# ===================================================================

if __name__ == '__main__':
    import sys
    import subprocess
    from pathlib import Path

    print("="*80)
    print("🚀 ATLAS TERMINAL v10.0 - SETUP")
    print("="*80)

    # Check Python version
    if sys.version_info < (3, 9):
        print("\n❌ ERROR: Python 3.9+ required")
        print(f"   Current version: {sys.version}")
        sys.exit(1)

    print(f"\n✅ Python version: {sys.version.split()[0]}")

    # Check if running from correct directory
    if not Path('atlas_app.py').exists():
        print("\n⚠️ WARNING: atlas_app.py not found")
        print("   Are you running from the project root?")

    # Create necessary directories
    print("\n📁 Creating directories...")
    directories = ['data', 'cache', 'output', 'logs']
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
        print(f"   ✅ {directory}/")

    # Check if .env exists
    if not Path('.env').exists() and Path('.env.example').exists():
        print("\n⚠️ .env file not found")
        print("   Run: cp .env.example .env")
        print("   Then edit .env with your API keys")

    # Install package
    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == 'install':
            print("\n📦 Installing ATLAS Terminal...")
            subprocess.run([sys.executable, '-m', 'pip', 'install', '.'])

        elif command == 'develop':
            print("\n📦 Installing in development mode...")
            subprocess.run([sys.executable, '-m', 'pip', 'install', '-e', '.'])

        elif command == 'test':
            print("\n🧪 Running tests...")
            subprocess.run([sys.executable, '-m', 'pytest', 'tests/', '-v'])

        elif command == 'clean':
            print("\n🧹 Cleaning build artifacts...")
            import shutil
            dirs_to_remove = ['build', 'dist', '*.egg-info', '__pycache__']
            for pattern in dirs_to_remove:
                for path in Path('.').rglob(pattern):
                    if path.is_dir():
                        shutil.rmtree(path)
                        print(f"   ✅ Removed {path}")

        else:
            print(f"\n❌ Unknown command: {command}")
            print("\nAvailable commands:")
            print("   install  - Install package")
            print("   develop  - Install in development mode")
            print("   test     - Run tests")
            print("   clean    - Remove build artifacts")

    print("\n" + "="*80)
    print("✅ Setup complete!")
    print("\nNext steps:")
    print("1. Copy .env.example to .env")
    print("2. Add your API keys to .env")
    print("3. Run: streamlit run atlas_app.py")
    print("="*80)
