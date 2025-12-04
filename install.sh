#!/bin/bash

# ===================================================================
# ATLAS TERMINAL v10.0 - QUICK INSTALL SCRIPT
# ===================================================================
#
# This script automates the installation of ATLAS Terminal
#
# Usage:
#   chmod +x install.sh
#   ./install.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===================================================================
# FUNCTIONS
# ===================================================================

print_header() {
    echo -e "${BLUE}"
    echo "================================================================================"
    echo "$1"
    echo "================================================================================"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ===================================================================
# BANNER
# ===================================================================

clear
print_header "🚀 ATLAS TERMINAL v10.0 - INSTALLATION"

# ===================================================================
# SYSTEM CHECK
# ===================================================================

print_header "📋 STEP 1: SYSTEM CHECK"

# Check OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    CYGWIN*)    MACHINE=Cygwin;;
    MINGW*)     MACHINE=MinGw;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

print_info "Operating System: ${MACHINE}"

# Check Python version
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    print_success "Python 3 found: ${PYTHON_VERSION}"
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
    print_success "Python found: ${PYTHON_VERSION}"
    PYTHON_CMD="python"
else
    print_error "Python not found!"
    print_info "Please install Python 3.9 or higher"
    exit 1
fi

# Check Python version is >= 3.9
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    print_error "Python 3.9+ required, found ${PYTHON_VERSION}"
    exit 1
fi

# Check pip
if command -v pip3 &> /dev/null; then
    print_success "pip3 found"
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    print_success "pip found"
    PIP_CMD="pip"
else
    print_error "pip not found!"
    print_info "Please install pip"
    exit 1
fi

# Check git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | awk '{print $3}')
    print_success "Git found: ${GIT_VERSION}"
else
    print_warning "Git not found (optional, but recommended)"
fi

# ===================================================================
# DIRECTORY SETUP
# ===================================================================

print_header "📁 STEP 2: DIRECTORY SETUP"

# Create directories
DIRS=("data" "cache" "output" "logs" "tests")

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_success "Created directory: $dir/"
    else
        print_info "Directory exists: $dir/"
    fi
done

# ===================================================================
# VIRTUAL ENVIRONMENT
# ===================================================================

print_header "🐍 STEP 3: VIRTUAL ENVIRONMENT"

read -p "Create virtual environment? (recommended) [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    VENV_NAME="atlas_env"

    if [ -d "$VENV_NAME" ]; then
        print_warning "Virtual environment already exists"
        read -p "Recreate it? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$VENV_NAME"
            print_info "Removed existing virtual environment"
        else
            print_info "Using existing virtual environment"
        fi
    fi

    if [ ! -d "$VENV_NAME" ]; then
        print_info "Creating virtual environment..."
        $PYTHON_CMD -m venv $VENV_NAME
        print_success "Virtual environment created: $VENV_NAME/"
    fi

    # Activate virtual environment
    if [ "$MACHINE" = "Mac" ] || [ "$MACHINE" = "Linux" ]; then
        source $VENV_NAME/bin/activate
    else
        source $VENV_NAME/Scripts/activate
    fi

    print_success "Virtual environment activated"
else
    print_warning "Skipping virtual environment creation"
fi

# ===================================================================
# DEPENDENCIES
# ===================================================================

print_header "📦 STEP 4: DEPENDENCIES"

print_info "Upgrading pip..."
$PIP_CMD install --upgrade pip --quiet

if [ -f "requirements.txt" ]; then
    print_info "Installing from requirements.txt..."
    $PIP_CMD install -r requirements.txt
    print_success "Dependencies installed"
else
    print_warning "requirements.txt not found"
    print_info "Installing core dependencies manually..."

    CORE_DEPS=(
        "numpy>=1.24.0"
        "pandas>=2.0.0"
        "scipy>=1.10.0"
        "matplotlib>=3.7.0"
        "seaborn>=0.12.0"
        "requests>=2.31.0"
        "beautifulsoup4>=4.12.0"
        "lxml>=4.9.0"
        "yfinance>=0.2.28"
        "streamlit>=1.28.0"
    )

    for dep in "${CORE_DEPS[@]}"; do
        print_info "Installing $dep..."
        $PIP_CMD install "$dep" --quiet
    done

    print_success "Core dependencies installed"
fi

# ===================================================================
# ENVIRONMENT FILE
# ===================================================================

print_header "🔐 STEP 5: ENVIRONMENT CONFIGURATION"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_info "Creating .env from template..."
        cp .env.example .env
        print_success ".env file created"
        print_warning "Please edit .env and add your API keys!"
    else
        print_warning ".env.example not found"
        print_info "You may need to create .env manually"
    fi
else
    print_info ".env file already exists"
fi

# ===================================================================
# CONFIGURATION
# ===================================================================

print_header "⚙️  STEP 6: CONFIGURATION VALIDATION"

if [ -f "config.py" ]; then
    print_info "Validating configuration..."
    $PYTHON_CMD config.py
    print_success "Configuration validated"
else
    print_warning "config.py not found"
fi

# ===================================================================
# RUN TESTS
# ===================================================================

print_header "🧪 STEP 7: TESTS (OPTIONAL)"

read -p "Run test suite? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    if [ -f "tests/test_all.py" ]; then
        print_info "Running tests..."
        $PYTHON_CMD tests/test_all.py
    else
        print_warning "Test file not found, skipping tests"
    fi
else
    print_info "Skipping tests"
fi

# ===================================================================
# COMPLETION
# ===================================================================

print_header "✅ INSTALLATION COMPLETE!"

echo ""
print_success "ATLAS Terminal v10.0 is ready to use!"
echo ""
print_info "Next steps:"
echo ""
echo "1. Edit .env file with your API keys:"
echo "   nano .env"
echo ""
echo "2. Launch ATLAS Terminal:"
echo "   streamlit run atlas_app.py"
echo ""
echo "3. Access in browser:"
echo "   http://localhost:8501"
echo ""

if [ -d "$VENV_NAME" ]; then
    print_info "To activate virtual environment in future:"
    if [ "$MACHINE" = "Mac" ] || [ "$MACHINE" = "Linux" ]; then
        echo "   source $VENV_NAME/bin/activate"
    else
        echo "   source $VENV_NAME/Scripts/activate"
    fi
    echo ""
fi

print_info "For help, see documentation:"
echo "   docs/ATLAS_COMPREHENSIVE_PATCH_GUIDE.md"
echo ""

print_header "🚀 Happy Trading!"

# ===================================================================
# OPTIONAL: AUTO-LAUNCH
# ===================================================================

read -p "Launch ATLAS Terminal now? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Launching ATLAS Terminal..."
    streamlit run atlas_app.py
fi
