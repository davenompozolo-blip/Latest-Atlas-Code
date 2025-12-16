"""
ATLAS Scenario Manager Module
==============================
Save, load, and compare DCF scenarios (Bull/Bear/Base/Custom)

Features:
- Save current projection state as named scenario
- Load scenarios to restore projections
- Compare multiple scenarios side-by-side
- Delete scenarios
- Export scenarios

Author: ATLAS v11.0
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
from copy import deepcopy
import json


class ScenarioManager:
    """
    Manage multiple DCF scenarios.

    Stores scenarios in Streamlit session state for persistence
    across reruns within a session.
    """

    def __init__(self, session_state: Any):
        """
        Initialize scenario manager.

        Args:
            session_state: Streamlit session_state object
        """
        self.session_state = session_state

        # Initialize scenarios dict if not exists
        if 'dcf_scenarios' not in self.session_state:
            self.session_state.dcf_scenarios = {}

        self.scenarios = self.session_state.dcf_scenarios

    def save_scenario(self, name: str, projections: Any,
                     wacc: float, terminal_growth: float,
                     roe: float = None, sgr: float = None,
                     description: str = None) -> bool:
        """
        Save current projections as a named scenario.

        Args:
            name: Scenario name
            projections: DCFProjections object
            wacc: WACC used
            terminal_growth: Terminal growth rate used
            roe: Return on equity
            sgr: Sustainable growth rate
            description: Optional description

        Returns:
            bool: True if saved successfully
        """
        try:
            # Generate description if not provided
            if description is None:
                description = self._generate_description(projections, wacc, terminal_growth)

            # Get summary stats
            stats = projections.get_summary_stats()

            scenario_data = {
                'ticker': projections.ticker,
                'forecast_years': projections.forecast_years,
                'manual_overrides': deepcopy(projections.manual_overrides),
                'wacc': wacc,
                'terminal_growth': terminal_growth,
                'roe': roe,
                'sgr': sgr,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'description': description,
                'stats': stats
            }

            self.scenarios[name] = scenario_data
            self.session_state.dcf_scenarios = self.scenarios

            return True

        except Exception as e:
            print(f"Error saving scenario: {e}")
            return False

    def load_scenario(self, name: str, projections: Any) -> Optional[Dict[str, float]]:
        """
        Load a saved scenario.

        Args:
            name: Scenario name to load
            projections: DCFProjections object to update

        Returns:
            dict: {'wacc': float, 'terminal_growth': float} or None if error
        """
        if name not in self.scenarios:
            print(f"Scenario '{name}' not found")
            return None

        try:
            scenario = self.scenarios[name]

            # Verify ticker matches
            if scenario['ticker'] != projections.ticker:
                print(f"Warning: Scenario ticker ({scenario['ticker']}) doesn't match current ({projections.ticker})")

            # Apply manual overrides
            projections.manual_overrides = deepcopy(scenario['manual_overrides'])
            projections.final_projections = projections._merge_projections()

            return {
                'wacc': scenario['wacc'],
                'terminal_growth': scenario['terminal_growth'],
                'roe': scenario.get('roe'),
                'sgr': scenario.get('sgr')
            }

        except Exception as e:
            print(f"Error loading scenario: {e}")
            return None

    def delete_scenario(self, name: str) -> bool:
        """
        Delete a scenario.

        Args:
            name: Scenario name

        Returns:
            bool: True if deleted successfully
        """
        if name in self.scenarios:
            del self.scenarios[name]
            self.session_state.dcf_scenarios = self.scenarios
            return True
        return False

    def list_scenarios(self) -> List[str]:
        """
        Get list of scenario names.

        Returns:
            List of scenario names
        """
        return list(self.scenarios.keys())

    def get_scenario_info(self, name: str) -> Optional[Dict]:
        """
        Get scenario metadata.

        Args:
            name: Scenario name

        Returns:
            dict: Scenario info or None
        """
        return self.scenarios.get(name)

    def compare_scenarios(self, scenario_names: List[str]) -> Dict[str, Any]:
        """
        Compare multiple scenarios.

        Args:
            scenario_names: List of scenario names to compare

        Returns:
            dict: Comparison data
        """
        comparison = {
            'scenarios': [],
            'metrics': {}
        }

        for name in scenario_names:
            if name not in self.scenarios:
                continue

            scenario = self.scenarios[name]
            stats = scenario['stats']

            comparison['scenarios'].append({
                'name': name,
                'wacc': scenario['wacc'],
                'terminal_growth': scenario['terminal_growth'],
                'revenue_cagr': stats['revenue_cagr'],
                'avg_ebit_margin': stats['avg_ebit_margin'],
                'total_fcff': stats['total_fcff'],
                'terminal_fcff': stats['terminal_fcff'],
                'manual_overrides': stats['total_manual_overrides'],
                'timestamp': scenario['timestamp']
            })

        return comparison

    def export_scenario(self, name: str, filepath: str = None) -> Optional[str]:
        """
        Export scenario to JSON.

        Args:
            name: Scenario name
            filepath: Optional file path (if None, returns JSON string)

        Returns:
            JSON string or None
        """
        if name not in self.scenarios:
            return None

        scenario = self.scenarios[name]

        # Convert to JSON-serializable format
        export_data = {
            'scenario_name': name,
            'exported_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'data': scenario
        }

        json_str = json.dumps(export_data, indent=2)

        if filepath:
            try:
                with open(filepath, 'w') as f:
                    f.write(json_str)
                return filepath
            except Exception as e:
                print(f"Error writing file: {e}")
                return None
        else:
            return json_str

    def import_scenario(self, json_str: str = None, filepath: str = None) -> Optional[str]:
        """
        Import scenario from JSON.

        Args:
            json_str: JSON string (if not using filepath)
            filepath: File path to read from

        Returns:
            str: Imported scenario name or None
        """
        try:
            if filepath:
                with open(filepath, 'r') as f:
                    json_str = f.read()

            if not json_str:
                return None

            import_data = json.loads(json_str)
            scenario_name = import_data['scenario_name']
            scenario_data = import_data['data']

            # Check if scenario already exists
            if scenario_name in self.scenarios:
                # Append timestamp to make unique
                scenario_name = f"{scenario_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            self.scenarios[scenario_name] = scenario_data
            self.session_state.dcf_scenarios = self.scenarios

            return scenario_name

        except Exception as e:
            print(f"Error importing scenario: {e}")
            return None

    def clear_all_scenarios(self) -> bool:
        """
        Clear all saved scenarios.

        Returns:
            bool: True if successful
        """
        try:
            self.scenarios = {}
            self.session_state.dcf_scenarios = {}
            return True
        except:
            return False

    def _generate_description(self, projections: Any, wacc: float, terminal_growth: float) -> str:
        """
        Generate automatic description for scenario.

        Args:
            projections: DCFProjections object
            wacc: WACC
            terminal_growth: Terminal growth rate

        Returns:
            str: Description
        """
        stats = projections.get_summary_stats()

        revenue_cagr = stats['revenue_cagr']
        avg_margin = stats['avg_ebit_margin']
        total_overrides = stats['total_manual_overrides']

        desc = f"Rev CAGR {revenue_cagr*100:.1f}% | EBIT Margin {avg_margin*100:.1f}% | "
        desc += f"WACC {wacc*100:.1f}% | Terminal {terminal_growth*100:.1f}%"

        if total_overrides > 0:
            desc += f" | {total_overrides} manual edits"

        return desc


# ============================================================================
# PRESET SCENARIOS
# ============================================================================

def create_bull_scenario(projections: Any) -> Dict[str, Any]:
    """
    Create aggressive bull case scenario.

    Assumptions:
    - Higher revenue growth
    - Margin expansion
    - Lower WACC (optimistic)
    - Higher terminal growth

    Args:
        projections: DCFProjections object

    Returns:
        dict: Scenario parameters
    """
    # Clone projections
    bull_proj = projections.clone()

    # Apply bull case adjustments
    for year in range(1, projections.forecast_years + 1):
        auto_revenue = bull_proj.auto_projections[year]['revenue']
        auto_ebit = bull_proj.auto_projections[year]['ebit']

        # Boost revenue by 20%
        bull_revenue = auto_revenue * 1.20

        # Boost EBIT margin by 300 bps
        auto_margin = auto_ebit / auto_revenue if auto_revenue > 0 else 0.15
        bull_margin = min(auto_margin + 0.03, 0.45)  # Cap at 45%
        bull_ebit = bull_revenue * bull_margin

        bull_proj.set_manual_override(year, 'revenue', bull_revenue)
        bull_proj.set_manual_override(year, 'ebit', bull_ebit)

    return {
        'projections': bull_proj,
        'wacc_adjustment': -0.005,  # 50 bps lower
        'terminal_growth_adjustment': +0.005  # 50 bps higher
    }


def create_bear_scenario(projections: Any) -> Dict[str, Any]:
    """
    Create conservative bear case scenario.

    Assumptions:
    - Lower revenue growth
    - Margin compression
    - Higher WACC (risk premium)
    - Lower terminal growth

    Args:
        projections: DCFProjections object

    Returns:
        dict: Scenario parameters
    """
    # Clone projections
    bear_proj = projections.clone()

    # Apply bear case adjustments
    for year in range(1, projections.forecast_years + 1):
        auto_revenue = bear_proj.auto_projections[year]['revenue']
        auto_ebit = bear_proj.auto_projections[year]['ebit']

        # Reduce revenue by 20%
        bear_revenue = auto_revenue * 0.80

        # Reduce EBIT margin by 200 bps
        auto_margin = auto_ebit / auto_revenue if auto_revenue > 0 else 0.15
        bear_margin = max(auto_margin - 0.02, 0.05)  # Floor at 5%
        bear_ebit = bear_revenue * bear_margin

        bear_proj.set_manual_override(year, 'revenue', bear_revenue)
        bear_proj.set_manual_override(year, 'ebit', bear_ebit)

    return {
        'projections': bear_proj,
        'wacc_adjustment': +0.010,  # 100 bps higher
        'terminal_growth_adjustment': -0.005  # 50 bps lower
    }


def create_base_scenario(projections: Any) -> Dict[str, Any]:
    """
    Create base case scenario (no adjustments).

    Args:
        projections: DCFProjections object

    Returns:
        dict: Scenario parameters
    """
    return {
        'projections': projections.clone(),
        'wacc_adjustment': 0.0,
        'terminal_growth_adjustment': 0.0
    }


# ============================================================================
# SCENARIO COMPARISON UTILITIES
# ============================================================================

def calculate_scenario_valuation_diff(scenario1: Dict, scenario2: Dict) -> Dict[str, float]:
    """
    Calculate difference between two scenarios.

    Args:
        scenario1: First scenario data
        scenario2: Second scenario data

    Returns:
        dict: Differences
    """
    stats1 = scenario1['stats']
    stats2 = scenario2['stats']

    return {
        'revenue_cagr_diff': stats1['revenue_cagr'] - stats2['revenue_cagr'],
        'ebit_margin_diff': stats1['avg_ebit_margin'] - stats2['avg_ebit_margin'],
        'total_fcff_diff': stats1['total_fcff'] - stats2['total_fcff'],
        'wacc_diff': scenario1['wacc'] - scenario2['wacc'],
        'terminal_growth_diff': scenario1['terminal_growth'] - scenario2['terminal_growth']
    }


if __name__ == '__main__':
    # Test the module
    print("Testing Scenario Manager Module")
    print("=" * 60)

    # Mock session state
    class MockSessionState:
        def __init__(self):
            self.dcf_scenarios = {}

    session_state = MockSessionState()

    # Create manager
    manager = ScenarioManager(session_state)

    # Mock projections object
    class MockProjections:
        def __init__(self):
            self.ticker = 'TEST'
            self.forecast_years = 5
            self.manual_overrides = {1: {'revenue': 100e9}, 2: {}}

        def get_summary_stats(self):
            return {
                'revenue_cagr': 0.15,
                'avg_ebit_margin': 0.30,
                'total_fcff': 100e9,
                'terminal_fcff': 25e9,
                'total_manual_overrides': 1,
                'forecast_years': 5
            }

        def clone(self):
            return MockProjections()

        def _merge_projections(self):
            pass

    projections = MockProjections()

    # Save a scenario
    print("\n1. Saving scenario...")
    success = manager.save_scenario(
        name='Base Case',
        projections=projections,
        wacc=0.09,
        terminal_growth=0.03,
        roe=0.25,
        sgr=0.15
    )
    print(f"   Save successful: {success}")

    # List scenarios
    print("\n2. Listing scenarios...")
    scenarios = manager.list_scenarios()
    print(f"   Found {len(scenarios)} scenario(s): {scenarios}")

    # Get scenario info
    print("\n3. Getting scenario info...")
    info = manager.get_scenario_info('Base Case')
    print(f"   Description: {info['description']}")
    print(f"   Timestamp: {info['timestamp']}")
    print(f"   WACC: {info['wacc']:.2%}")

    # Export scenario
    print("\n4. Exporting scenario...")
    json_str = manager.export_scenario('Base Case')
    print(f"   Exported {len(json_str)} characters of JSON")

    # Delete scenario
    print("\n5. Deleting scenario...")
    deleted = manager.delete_scenario('Base Case')
    print(f"   Delete successful: {deleted}")
    print(f"   Remaining scenarios: {manager.list_scenarios()}")

    print("\n✅ Module test complete!")
