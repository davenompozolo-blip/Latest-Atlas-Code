#!/bin/bash
# ============================================================================
# ATLAS TERMINAL — Remote Control Launcher
# ============================================================================
#
# Usage:
#   ./atlas-remote.sh              → Launch ATLAS-CORE (default)
#   ./atlas-remote.sh core         → Launch ATLAS-CORE (valuation/calc engine)
#   ./atlas-remote.sh ui           → Launch ATLAS-UI (pages/components)
#   ./atlas-remote.sh data         → Launch ATLAS-DATA (ingestion/Supabase)
#   ./atlas-remote.sh all          → Launch all 3 sessions
#   ./atlas-remote.sh server       → Launch server mode (multi-session hub)
#
# Requirements:
#   - Claude Code v2.1.51+
#   - Logged in via claude.ai (not API key)
#   - Pro/Max/Team/Enterprise plan
# ============================================================================

set -e

SESSION="${1:-core}"

launch_session() {
    local name="$1"
    local label="$2"
    echo ">> Launching ${label}..."
    claude remote-control \
        --name "${name}" \
        --verbose \
        --spawn worktree &
    echo "   PID: $!"
}

case "$SESSION" in
    core)
        echo "=== ATLAS Remote Control: CORE ==="
        claude remote-control \
            --name "ATLAS-CORE" \
            --verbose \
            --spawn worktree
        ;;
    ui)
        echo "=== ATLAS Remote Control: UI ==="
        claude remote-control \
            --name "ATLAS-UI" \
            --verbose \
            --spawn worktree
        ;;
    data)
        echo "=== ATLAS Remote Control: DATA ==="
        claude remote-control \
            --name "ATLAS-DATA" \
            --verbose \
            --spawn worktree
        ;;
    all)
        echo "=== ATLAS Remote Control: ALL SESSIONS ==="
        echo ""
        launch_session "ATLAS-CORE" "ATLAS-CORE (Engine)"
        sleep 2
        launch_session "ATLAS-UI"   "ATLAS-UI (Frontend)"
        sleep 2
        launch_session "ATLAS-DATA" "ATLAS-DATA (Pipeline)"
        echo ""
        echo "=== All sessions launched ==="
        echo "Connect at: claude.ai/code"
        echo ""
        echo "Press CTRL+C to stop all sessions"
        wait
        ;;
    server)
        echo "=== ATLAS Remote Control: Server Mode ==="
        claude remote-control \
            --name "ATLAS-SERVER" \
            --verbose \
            --spawn worktree \
            --capacity 5
        ;;
    *)
        echo "Usage: ./atlas-remote.sh [core|ui|data|all|server]"
        exit 1
        ;;
esac
