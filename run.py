"""
ATLAS Terminal - Proper Entry Point
Ensures package structure is correctly initialized before running Streamlit

Usage:
    streamlit run run.py

Or in Colab:
    !streamlit run run.py --server.port=8501 --server.headless=true
"""

import sys
import os
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Ensure atlas_terminal is importable
atlas_path = project_root / 'atlas_terminal'
if not atlas_path.exists():
    raise RuntimeError(f"atlas_terminal directory not found at {atlas_path}")

# Import and run main
from atlas_terminal.main import main

if __name__ == "__main__":
    main()
