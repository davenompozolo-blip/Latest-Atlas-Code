"""
Enhanced Economic Calendar
===========================

Professional economic calendar with date ranges, importance filters,
and historical events.

Author: ATLAS Development Team
Version: 1.0.0
"""

import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict

# Try to import investpy for economic calendar
try:
    import investpy
    INVESTPY_AVAILABLE = True
except ImportError:
    INVESTPY_AVAILABLE = False


class EconomicCalendar:
    """
    Enhanced economic calendar with filtering and historical data
    """

    def __init__(self):
        self.available = INVESTPY_AVAILABLE

    def get_events(self,
                   start_date: datetime,
                   end_date: datetime,
                   countries: List[str] = None,
                   importances: List[str] = None) -> pd.DataFrame:
        """
        Fetch economic events for date range

        Args:
            start_date: Start date
            end_date: End date
            countries: List of countries (e.g., ['united states', 'china'])
            importances: List of importance levels (['high', 'medium', 'low'])

        Returns:
            DataFrame with events
        """

        if not self.available:
            return self._get_mock_data(start_date, end_date)

        try:
            # Use investpy to fetch economic calendar
            events = investpy.economic_calendar(
                from_date=start_date.strftime('%d/%m/%Y'),
                to_date=end_date.strftime('%d/%m/%Y')
            )

            # Filter by countries if specified
            if countries:
                events = events[events['zone'].str.lower().isin([c.lower() for c in countries])]

            # Filter by importance if specified
            if importances:
                events = events[events['importance'].str.lower().isin([i.lower() for i in importances])]

            return events

        except Exception as e:
            print(f"Error fetching economic calendar: {e}")
            return self._get_mock_data(start_date, end_date)

    def _get_mock_data(self, start_date: datetime, end_date: datetime) -> pd.DataFrame:
        """
        Generate mock economic calendar data (when investpy not available)

        Returns:
            DataFrame with mock events
        """

        # Generate mock events for demonstration
        events = []

        # High impact events
        high_impact = [
            {'event': 'Federal Funds Rate Decision', 'country': 'United States', 'importance': 'High'},
            {'event': 'Non-Farm Payrolls', 'country': 'United States', 'importance': 'High'},
            {'event': 'CPI (Consumer Price Index)', 'country': 'United States', 'importance': 'High'},
            {'event': 'GDP Growth Rate', 'country': 'United States', 'importance': 'High'},
            {'event': 'FOMC Minutes', 'country': 'United States', 'importance': 'High'},
        ]

        # Medium impact events
        medium_impact = [
            {'event': 'Retail Sales', 'country': 'United States', 'importance': 'Medium'},
            {'event': 'PMI Manufacturing', 'country': 'United States', 'importance': 'Medium'},
            {'event': 'Initial Jobless Claims', 'country': 'United States', 'importance': 'Medium'},
            {'event': 'Industrial Production', 'country': 'United States', 'importance': 'Medium'},
        ]

        # Low impact events
        low_impact = [
            {'event': 'Building Permits', 'country': 'United States', 'importance': 'Low'},
            {'event': 'Housing Starts', 'country': 'United States', 'importance': 'Low'},
            {'event': 'Consumer Confidence', 'country': 'United States', 'importance': 'Low'},
        ]

        all_events = high_impact + medium_impact + low_impact

        # Generate events across date range
        current_date = start_date

        while current_date <= end_date:
            # Add 2-3 random events per week
            if current_date.weekday() in [1, 3]:  # Tuesday, Thursday
                import random
                event_template = random.choice(all_events)

                events.append({
                    'date': current_date,
                    'time': '08:30' if event_template['importance'] == 'High' else '10:00',
                    'zone': event_template['country'],
                    'event': event_template['event'],
                    'importance': event_template['importance'],
                    'actual': None if current_date > datetime.now() else random.uniform(-0.5, 2.5),
                    'forecast': random.uniform(0, 2.0),
                    'previous': random.uniform(0, 2.0),
                })

            current_date += timedelta(days=1)

        return pd.DataFrame(events)


def render_enhanced_economic_calendar():
    """
    Render enhanced economic calendar with filters
    """

    st.markdown("### 📅 Economic Calendar")

    # Check if investpy is available
    calendar = EconomicCalendar()

    if not calendar.available:
        st.warning("""
        ⚠️ **Optional Enhancement Available**

        Install `investpy` for live economic calendar data:
        ```
        pip install investpy
        ```

        Showing demo data for now.
        """)

    # ============================================================
    # DATE RANGE SELECTOR
    # ============================================================

    st.markdown("#### 📆 Date Range")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        if st.button("📅 Next Week", use_container_width=True):
            st.session_state['calendar_start'] = datetime.now()
            st.session_state['calendar_end'] = datetime.now() + timedelta(days=7)

    with col2:
        if st.button("📅 Next Month", use_container_width=True):
            st.session_state['calendar_start'] = datetime.now()
            st.session_state['calendar_end'] = datetime.now() + timedelta(days=30)

    with col3:
        if st.button("📅 Past Week", use_container_width=True):
            st.session_state['calendar_start'] = datetime.now() - timedelta(days=7)
            st.session_state['calendar_end'] = datetime.now()

    with col4:
        show_past = st.checkbox("Show Historical", value=False)

    # Custom date range
    with st.expander("🗓️ Custom Date Range", expanded=False):
        col_start, col_end = st.columns(2)

        with col_start:
            start_date = st.date_input(
                "Start Date",
                value=st.session_state.get('calendar_start', datetime.now()).date()
            )

        with col_end:
            end_date = st.date_input(
                "End Date",
                value=st.session_state.get('calendar_end', datetime.now() + timedelta(days=7)).date()
            )

        st.session_state['calendar_start'] = datetime.combine(start_date, datetime.min.time())
        st.session_state['calendar_end'] = datetime.combine(end_date, datetime.max.time())

    # ============================================================
    # IMPORTANCE FILTER
    # ============================================================

    st.markdown("#### 🎯 Event Importance")

    col1, col2, col3 = st.columns(3)

    with col1:
        show_high = st.checkbox("🔴 High Impact", value=True, help="Fed decisions, Jobs, GDP, CPI")

    with col2:
        show_medium = st.checkbox("🟡 Medium Impact", value=True, help="PMI, Retail Sales, Industrial Production")

    with col3:
        show_low = st.checkbox("🟢 Low Impact", value=False, help="Housing, Consumer Confidence")

    # Build importance filter
    importances = []
    if show_high:
        importances.append('High')
    if show_medium:
        importances.append('Medium')
    if show_low:
        importances.append('Low')

    # ============================================================
    # FETCH AND DISPLAY EVENTS
    # ============================================================

    # Get date range
    start = st.session_state.get('calendar_start', datetime.now())
    end = st.session_state.get('calendar_end', datetime.now() + timedelta(days=7))

    # Fetch events
    events = calendar.get_events(
        start_date=start,
        end_date=end,
        countries=['United States'],  # Can add more countries later
        importances=importances
    )

    if events.empty:
        st.info("📭 No events found for selected criteria")
        return

    # Sort by date
    events = events.sort_values('date')

    # ============================================================
    # UPCOMING HIGH-IMPACT EVENTS (Top Banner)
    # ============================================================

    # Convert date column to datetime for comparison (fixes TypeError)
    events['date'] = pd.to_datetime(events['date'], errors='coerce')
    future_events = events[events['date'] > datetime.now()]
    high_impact_upcoming = future_events[future_events['importance'] == 'High'].head(3)

    if not high_impact_upcoming.empty:
        st.markdown("---")
        st.markdown("#### 🚨 Upcoming High-Impact Events")

        cols = st.columns(min(len(high_impact_upcoming), 3))

        for idx, (_, event) in enumerate(high_impact_upcoming.iterrows()):
            with cols[idx]:
                days_until = (event['date'] - datetime.now()).days

                st.markdown(f"""
                <div style="
                    background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1));
                    border-left: 4px solid #ef4444;
                    padding: 1rem;
                    border-radius: 0.5rem;
                    margin-bottom: 0.5rem;
                ">
                    <p style="margin: 0; font-size: 0.75rem; opacity: 0.8;">
                        {event['date'].strftime('%b %d, %Y')} • {event.get('time', 'TBD')}
                    </p>
                    <h4 style="margin: 0.25rem 0; font-size: 0.95rem;">
                        {event['event']}
                    </h4>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; color: #fca5a5;">
                        ⏰ In {days_until} day{"s" if days_until != 1 else ""}
                    </p>
                </div>
                """, unsafe_allow_html=True)

    # ============================================================
    # FULL EVENT TABLE
    # ============================================================

    st.markdown("---")
    st.markdown(f"#### 📊 Events ({len(events)} total)")

    # Format display
    display_df = events.copy()

    # Format date
    if 'date' in display_df.columns:
        display_df['Date'] = display_df['date'].dt.strftime('%Y-%m-%d')
    if 'time' in display_df.columns:
        display_df['Time'] = display_df['time']
    if 'zone' in display_df.columns:
        display_df['Country'] = display_df['zone']
    if 'event' in display_df.columns:
        display_df['Event'] = display_df['event']
    if 'importance' in display_df.columns:
        display_df['Importance'] = display_df['importance']

    # Format actual, forecast, previous if they exist
    if 'actual' in display_df.columns:
        display_df['Actual'] = display_df['actual'].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "-")
    if 'forecast' in display_df.columns:
        display_df['Forecast'] = display_df['forecast'].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "-")
    if 'previous' in display_df.columns:
        display_df['Previous'] = display_df['previous'].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "-")

    # Select display columns
    display_columns = ['Date', 'Time', 'Event', 'Country', 'Importance']
    if 'Actual' in display_df.columns:
        display_columns.extend(['Actual', 'Forecast', 'Previous'])

    display_df = display_df[display_columns]

    # Style based on importance
    def style_importance(row):
        if row['Importance'] == 'High':
            return ['background-color: rgba(239,68,68,0.1)'] * len(row)
        elif row['Importance'] == 'Medium':
            return ['background-color: rgba(251,191,36,0.1)'] * len(row)
        else:
            return ['background-color: rgba(34,197,94,0.05)'] * len(row)

    # Display table
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        height=600
    )

    # Summary stats
    st.markdown("---")
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Total Events", len(events))

    with col2:
        high_count = len(events[events['importance'] == 'High'])
        st.metric("High Impact", high_count)

    with col3:
        upcoming_count = len(events[events['date'] > datetime.now()])
        st.metric("Upcoming", upcoming_count)
