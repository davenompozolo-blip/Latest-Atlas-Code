#!/bin/bash

# ============================================================================
# ATLAS TERMINAL v10.0 - UNIVERSAL DEPLOYMENT SCRIPT
# ============================================================================

set -e  # Exit on error

echo "🚀 ATLAS TERMINAL v10.0 DEPLOYMENT"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# STEP 1: ENVIRONMENT CHECK
# ============================================================================
echo -e "${BLUE}📋 Step 1: Checking environment...${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python 3 found: $(python3 --version)${NC}"

# Check pip
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}❌ pip3 is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ pip3 found${NC}"

echo ""

# ============================================================================
# STEP 2: INSTALL DEPENDENCIES
# ============================================================================
echo -e "${BLUE}📦 Step 2: Installing dependencies...${NC}"

pip3 install --upgrade pip

# Install all required packages
pip3 install -q streamlit pyngrok yfinance plotly scikit-learn scipy networkx openpyxl xlsxwriter pandas numpy

echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# ============================================================================
# STEP 3: VERIFY FILES
# ============================================================================
echo -e "${BLUE}📁 Step 3: Verifying application files...${NC}"

if [ ! -f "atlas_app.py" ]; then
    echo -e "${RED}❌ atlas_app.py not found!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ atlas_app.py found ($(du -h atlas_app.py | cut -f1))${NC}"

echo ""

# ============================================================================
# STEP 4: DEPLOYMENT MODE SELECTION
# ============================================================================
echo -e "${BLUE}🌐 Step 4: Select deployment mode:${NC}"
echo "  1) Local (localhost:8501)"
echo "  2) Public (with ngrok tunnel)"
echo ""
read -p "Enter choice [1-2]: " choice

case $choice in
    1)
        echo -e "${YELLOW}🏠 Starting LOCAL deployment...${NC}"
        echo ""
        echo -e "${GREEN}✅ ATLAS Terminal will be available at:${NC}"
        echo -e "${GREEN}   http://localhost:8501${NC}"
        echo ""
        echo -e "${YELLOW}Press CTRL+C to stop the server${NC}"
        echo ""

        streamlit run atlas_app.py \
            --server.port=8501 \
            --server.headless=true \
            --server.enableCORS=false \
            --server.enableXsrfProtection=false
        ;;

    2)
        echo -e "${YELLOW}🌍 Starting PUBLIC deployment with ngrok...${NC}"
        echo ""

        # Check if ngrok token is set
        if [ -z "$NGROK_AUTH_TOKEN" ]; then
            echo -e "${YELLOW}⚠️  NGROK_AUTH_TOKEN not set in environment${NC}"
            read -p "Enter your ngrok auth token (or press Enter to use default): " ngrok_token
            if [ -z "$ngrok_token" ]; then
                # Use the token from setup_ngrok.py as default
                export NGROK_AUTH_TOKEN="3560NW1Q6pfr5LKXYCFxvt6JnAI_39PX8PaW3aGqhTTr2yo2M"
                echo -e "${BLUE}Using default ngrok token${NC}"
            else
                export NGROK_AUTH_TOKEN="$ngrok_token"
            fi
        fi

        # Start Streamlit in background
        echo -e "${BLUE}Starting Streamlit server...${NC}"
        streamlit run atlas_app.py \
            --server.port=8501 \
            --server.headless=true \
            --server.enableCORS=false \
            --server.enableXsrfProtection=false &

        STREAMLIT_PID=$!
        echo -e "${GREEN}✅ Streamlit started (PID: $STREAMLIT_PID)${NC}"

        # Wait for Streamlit to initialize
        echo -e "${BLUE}Waiting for Streamlit to initialize...${NC}"
        sleep 10

        # Start ngrok tunnel using Python script
        echo -e "${BLUE}Creating ngrok tunnel...${NC}"
        python3 setup_ngrok.py
        ;;

    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac
