#!/bin/bash
#
# ATLAS Terminal - R Analytics Setup Script
# ===========================================
# This script installs R and required packages for advanced quantitative analysis
#
# Features enabled:
# - GARCH Volatility Forecasting (rugarch package)
# - Copula Dependency Analysis (copula package)
# - Time series support (xts package)
# - Python-R bridge (rpy2)
#

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ATLAS Terminal - R Analytics Setup                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run with sudo: sudo bash setup_r_analytics.sh"
    exit 1
fi

echo "📦 Step 1/4: Updating package lists..."
apt-get update -qq

echo "📦 Step 2/4: Installing R base and development packages..."
apt-get install -y r-base r-base-dev

echo "📊 Step 3/4: Installing R packages (this may take 5-10 minutes)..."
R --vanilla --quiet <<EOF
# Set CRAN mirror
options(repos = c(CRAN = "https://cloud.r-project.org"))

# Install required packages
cat("Installing rugarch (GARCH models)...\n")
install.packages("rugarch", dependencies = TRUE, quiet = TRUE)

cat("Installing copula (dependency modeling)...\n")
install.packages("copula", dependencies = TRUE, quiet = TRUE)

cat("Installing xts (time series)...\n")
install.packages("xts", dependencies = TRUE, quiet = TRUE)

cat("\n✅ All R packages installed successfully!\n")
EOF

echo "🐍 Step 4/4: Installing rpy2 Python package..."
pip install rpy2 --quiet

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ R Analytics Setup Complete!                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Installed R packages:"
echo "   • rugarch - GARCH volatility models"
echo "   • copula  - Copula dependency analysis"
echo "   • xts     - Time series support"
echo ""
echo "🐍 Installed Python packages:"
echo "   • rpy2    - Python-R bridge"
echo ""
echo "🚀 Next steps:"
echo "   1. Restart your Streamlit app"
echo "   2. Navigate to 'R Analytics' section"
echo "   3. You should see ✅ R Analytics Engine Ready"
echo ""
echo "📖 Usage:"
echo "   • GARCH Volatility: Model conditional volatility"
echo "   • Copula Analysis:  Model asset dependencies"
echo "   • Custom R Code:    Run your own R analytics"
echo ""
