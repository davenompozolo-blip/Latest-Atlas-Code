"""
ATLAS Terminal Navigation System
Phase 2 Day 1 - Navigation Module

This module provides a centralized navigation system for ATLAS Terminal,
replacing the inline navigation code in the main() function.

Features:
- Page registration system
- Sidebar navigation rendering
- Page routing
- Navigation state management
"""

import streamlit as st
from typing import Dict, Callable, Optional, List
from dataclasses import dataclass


@dataclass
class Page:
    """Represents a navigation page"""
    name: str
    icon: str
    render_func: Callable
    category: Optional[str] = None
    description: Optional[str] = None


class NavigationManager:
    """
    Manages page navigation and routing for ATLAS Terminal

    Usage:
        nav = get_navigation_manager()
        nav.register_page("Home", "🏠", render_home_page)
        nav.register_page("Portfolio", "📊", render_portfolio_page, category="Analysis")

        # In main app:
        selected_page = nav.render_sidebar()
        nav.render_current_page()
    """

    def __init__(self):
        self.pages: Dict[str, Page] = {}
        self.categories: Dict[str, List[str]] = {}
        self._current_page: Optional[str] = None

    def register_page(
        self,
        name: str,
        icon: str,
        render_func: Callable,
        category: Optional[str] = None,
        description: Optional[str] = None
    ):
        """
        Register a page in the navigation system

        Args:
            name: Page name (must be unique)
            icon: Emoji icon for the page
            render_func: Function to call to render the page
            category: Optional category for grouping pages
            description: Optional description for the page
        """
        if name in self.pages:
            raise ValueError(f"Page '{name}' already registered")

        page = Page(name, icon, render_func, category, description)
        self.pages[name] = page

        # Group by category
        if category:
            if category not in self.categories:
                self.categories[category] = []
            self.categories[category].append(name)

    def unregister_page(self, name: str):
        """Remove a page from navigation"""
        if name in self.pages:
            page = self.pages[name]
            if page.category and page.category in self.categories:
                self.categories[page.category].remove(name)
            del self.pages[name]

    def render_sidebar(self) -> str:
        """
        Render sidebar navigation and return selected page name

        Returns:
            Selected page name
        """
        with st.sidebar:
            # App title
            st.title("🚀 ATLAS Terminal")
            st.markdown("**Professional Portfolio Analytics**")
            st.markdown("---")

            # Navigation selection
            if self.categories:
                # Grouped navigation
                selected_page = self._render_categorized_navigation()
            else:
                # Flat navigation
                selected_page = self._render_flat_navigation()

            self._current_page = selected_page
            return selected_page

    def _render_flat_navigation(self) -> str:
        """Render flat navigation (no categories)"""
        page_names = list(self.pages.keys())
        page_displays = [f"{self.pages[p].icon} {p}" for p in page_names]

        # Get default selection from session state
        if 'nav_selection' not in st.session_state:
            st.session_state.nav_selection = page_displays[0] if page_displays else None

        selected = st.radio(
            "**Navigation**",
            page_displays,
            key="nav_selection",
            label_visibility="visible"
        )

        # Extract page name (remove icon)
        if selected:
            return selected.split(" ", 1)[1] if " " in selected else selected
        return page_names[0] if page_names else "Home"

    def _render_categorized_navigation(self) -> str:
        """Render categorized navigation with expandable sections"""
        # Uncategorized pages first
        uncategorized = [name for name, page in self.pages.items() if not page.category]

        selected_page = None

        # Render uncategorized pages
        if uncategorized:
            for page_name in uncategorized:
                page = self.pages[page_name]
                if st.sidebar.button(
                    f"{page.icon} {page_name}",
                    key=f"nav_{page_name}",
                    use_container_width=True
                ):
                    selected_page = page_name

        # Render categorized pages
        for category, page_names in self.categories.items():
            with st.sidebar.expander(f"📁 {category}", expanded=True):
                for page_name in page_names:
                    page = self.pages[page_name]
                    if st.button(
                        f"{page.icon} {page_name}",
                        key=f"nav_{page_name}",
                        use_container_width=True
                    ):
                        selected_page = page_name

        # Use session state to maintain selection
        if selected_page:
            st.session_state.current_page = selected_page
        elif 'current_page' not in st.session_state:
            st.session_state.current_page = list(self.pages.keys())[0] if self.pages else "Home"

        return st.session_state.current_page

    def render_current_page(self):
        """Render the currently selected page"""
        if not self._current_page:
            st.error("No page selected")
            return

        if self._current_page not in self.pages:
            st.error(f"Page '{self._current_page}' not found")
            st.info(f"Available pages: {', '.join(self.pages.keys())}")
            return

        # Render the page
        try:
            page = self.pages[self._current_page]
            page.render_func()
        except Exception as e:
            st.error(f"Error rendering page '{self._current_page}'")
            st.exception(e)

    def get_current_page(self) -> Optional[str]:
        """Get the currently selected page name"""
        return self._current_page

    def list_pages(self) -> List[str]:
        """Get list of all registered page names"""
        return list(self.pages.keys())

    def clear_pages(self):
        """Clear all registered pages"""
        self.pages.clear()
        self.categories.clear()
        self._current_page = None


# Singleton instance
_nav_manager: Optional[NavigationManager] = None


def get_navigation_manager() -> NavigationManager:
    """
    Get or create the navigation manager singleton

    Returns:
        NavigationManager instance
    """
    global _nav_manager
    if _nav_manager is None:
        _nav_manager = NavigationManager()
    return _nav_manager


def render_navigation() -> str:
    """
    Convenience function to render navigation and return selected page

    This is the function imported at line 62 of atlas_app.py

    Returns:
        Selected page name
    """
    nav = get_navigation_manager()
    return nav.render_sidebar()


def reset_navigation():
    """Reset the navigation manager (useful for testing)"""
    global _nav_manager
    _nav_manager = None


# Example usage for testing
if __name__ == "__main__":
    # This would be in your main app:
    nav = get_navigation_manager()

    # Register pages
    nav.register_page("Home", "🏠", lambda: st.write("Home Page"))
    nav.register_page("Portfolio", "📊", lambda: st.write("Portfolio"), category="Analysis")
    nav.register_page("Analytics", "📈", lambda: st.write("Analytics"), category="Analysis")
    nav.register_page("Settings", "⚙️", lambda: st.write("Settings"), category="Configuration")

    # Render
    selected = nav.render_sidebar()
    st.write(f"Selected: {selected}")
    nav.render_current_page()
