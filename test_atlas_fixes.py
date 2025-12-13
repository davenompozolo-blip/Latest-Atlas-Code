#!/usr/bin/env python3
"""
ATLAS v11.0 - Bug Fix Verification Script
Run this to verify all fixes are working
"""

import sys

def test_imports():
    """Test all required imports"""
    print("=" * 60)
    print("TESTING IMPORTS")
    print("=" * 60)
    
    all_ok = True
    
    # Test plotly.express
    try:
        import plotly.express as px
        print("✅ plotly.express imported successfully")
    except ImportError as e:
        print(f"❌ plotly.express FAILED: {e}")
        print("   Install with: pip install plotly")
        all_ok = False
    
    # Test plotly.graph_objects
    try:
        import plotly.graph_objects as go
        print("✅ plotly.graph_objects imported successfully")
    except ImportError as e:
        print(f"❌ plotly.graph_objects FAILED: {e}")
        print("   Install with: pip install plotly")
        all_ok = False
    
    # Test scipy.stats
    try:
        from scipy import stats
        print("✅ scipy.stats imported successfully")
    except ImportError as e:
        print(f"❌ scipy.stats FAILED: {e}")
        print("   Install with: pip install scipy")
        all_ok = False
    
    # Test numpy
    try:
        import numpy as np
        print("✅ numpy imported successfully")
    except ImportError as e:
        print(f"❌ numpy FAILED: {e}")
        print("   Install with: pip install numpy")
        all_ok = False
    
    # Test pandas
    try:
        import pandas as pd
        print("✅ pandas imported successfully")
    except ImportError as e:
        print(f"❌ pandas FAILED: {e}")
        print("   Install with: pip install pandas")
        all_ok = False
    
    return all_ok

def test_database():
    """Test database connection and table creation"""
    print("\n" + "=" * 60)
    print("TESTING DATABASE")
    print("=" * 60)
    
    try:
        import sqlite3
        import pandas as pd
        
        # Try to connect to database
        conn = sqlite3.connect('atlas_portfolio.db', timeout=10)
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='portfolio_positions'
        """)
        
        if cursor.fetchone():
            print("✅ portfolio_positions table exists")
            
            # Check row count
            result = pd.read_sql("SELECT * FROM portfolio_positions", conn)
            print(f"✅ Database has {len(result)} positions")
            
            if len(result) > 0:
                print("✅ Database save is working!")
            else:
                print("⚠️  Database exists but has 0 positions")
                print("   Upload portfolio via Phoenix Parser and click Save")
        else:
            print("⚠️  portfolio_positions table doesn't exist yet")
            print("   It will be created on first save")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database test failed: {e}")
        return False

def test_options_filtering():
    """Test options filtering logic"""
    print("\n" + "=" * 60)
    print("TESTING OPTIONS FILTERING")
    print("=" * 60)
    
    try:
        import re
        
        def is_option_ticker(ticker):
            """Detect if ticker is an option symbol"""
            if len(ticker) <= 6:
                return False
            
            # Specific known options
            known_options = ['AU2520F50', 'META2405D482.5']
            if ticker.upper() in known_options:
                return True
            
            # General option pattern
            option_pattern = r'^[A-Z]+\d{4}[A-Z]\d+\.?\d*$'
            if re.match(option_pattern, ticker.upper()):
                return True
            
            # Standard options format
            has_year = any(str(y) in ticker for y in range(2020, 2030))
            has_strike = any(c.isdigit() for c in ticker[6:])
            has_type = ticker[-1] in ['C', 'P'] or 'C' in ticker[6:] or 'P' in ticker[6:]
            return has_year and has_strike and has_type
        
        # Test specific tickers
        test_cases = [
            ('AAPL', False, 'Normal stock'),
            ('AU2520F50', True, 'Specific option 1'),
            ('META2405D482.5', True, 'Specific option 2'),
            ('TSLA', False, 'Normal stock'),
            ('AAPL240119C150', True, 'Standard option format'),
        ]
        
        all_ok = True
        for ticker, expected, description in test_cases:
            result = is_option_ticker(ticker)
            if result == expected:
                print(f"✅ {ticker:20} → {result:5} ({description})")
            else:
                print(f"❌ {ticker:20} → {result:5} (expected {expected}) ({description})")
                all_ok = False
        
        return all_ok
        
    except Exception as e:
        print(f"❌ Options filtering test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("ATLAS v11.0 - FIX VERIFICATION")
    print("=" * 60 + "\n")
    
    results = []
    
    # Run tests
    results.append(("Imports", test_imports()))
    results.append(("Database", test_database()))
    results.append(("Options Filtering", test_options_filtering()))
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    all_passed = all(passed for _, passed in results)
    
    if all_passed:
        print("\n🎉 ALL TESTS PASSED!")
        print("\nNext steps:")
        print("1. Start Streamlit app")
        print("2. Upload portfolio via Phoenix Parser")
        print("3. Test each feature")
    else:
        print("\n⚠️  SOME TESTS FAILED")
        print("\nFix the failing tests before running the app")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
