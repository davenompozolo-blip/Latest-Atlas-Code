@echo off
REM ===================================================================
REM ATLAS TERMINAL v10.0 - WINDOWS INSTALLATION SCRIPT
REM ===================================================================
REM
REM This script automates the installation of ATLAS Terminal on Windows
REM
REM Usage:
REM   Double-click install.bat
REM   OR run from command prompt: install.bat
REM

setlocal EnableDelayedExpansion

REM Colors (using simple text since Windows CMD has limited color support)
set "CHECK=✓"
set "CROSS=×"
set "WARN=!"

REM ===================================================================
REM BANNER
REM ===================================================================

cls
echo ================================================================================
echo 🚀 ATLAS TERMINAL v10.0 - INSTALLATION (WINDOWS)
echo ================================================================================
echo.

REM ===================================================================
REM STEP 1: SYSTEM CHECK
REM ===================================================================

echo ================================================================================
echo 📋 STEP 1: SYSTEM CHECK
echo ================================================================================
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %CROSS% Python not found!
    echo.
    echo Please install Python 3.9 or higher from:
    echo https://www.python.org/downloads/
    echo.
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo %CHECK% Python found: %PYTHON_VERSION%

REM Check pip
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %CROSS% pip not found!
    echo Please reinstall Python with pip included
    pause
    exit /b 1
)

echo %CHECK% pip found
echo.

REM ===================================================================
REM STEP 2: DIRECTORY SETUP
REM ===================================================================

echo ================================================================================
echo 📁 STEP 2: DIRECTORY SETUP
echo ================================================================================
echo.

REM Create directories
if not exist "data" mkdir data && echo %CHECK% Created directory: data\
if not exist "cache" mkdir cache && echo %CHECK% Created directory: cache\
if not exist "output" mkdir output && echo %CHECK% Created directory: output\
if not exist "logs" mkdir logs && echo %CHECK% Created directory: logs\
if not exist "tests" mkdir tests && echo %CHECK% Created directory: tests\

echo.

REM ===================================================================
REM STEP 3: VIRTUAL ENVIRONMENT
REM ===================================================================

echo ================================================================================
echo 🐍 STEP 3: VIRTUAL ENVIRONMENT
echo ================================================================================
echo.

set /p CREATE_VENV="Create virtual environment? (recommended) [Y/n]: "
if /i "%CREATE_VENV%"=="n" goto skip_venv

set VENV_NAME=atlas_env

if exist "%VENV_NAME%" (
    echo %WARN% Virtual environment already exists
    set /p RECREATE="Recreate it? [y/N]: "
    if /i "!RECREATE!"=="y" (
        echo Removing existing virtual environment...
        rmdir /s /q "%VENV_NAME%"
        echo %CHECK% Removed existing virtual environment
    )
)

if not exist "%VENV_NAME%" (
    echo Creating virtual environment...
    python -m venv %VENV_NAME%
    echo %CHECK% Virtual environment created: %VENV_NAME%\
)

REM Activate virtual environment
call %VENV_NAME%\Scripts\activate.bat
echo %CHECK% Virtual environment activated
goto after_venv

:skip_venv
echo %WARN% Skipping virtual environment creation

:after_venv
echo.

REM ===================================================================
REM STEP 4: DEPENDENCIES
REM ===================================================================

echo ================================================================================
echo 📦 STEP 4: DEPENDENCIES
echo ================================================================================
echo.

echo Upgrading pip...
python -m pip install --upgrade pip --quiet
echo %CHECK% pip upgraded

if exist "requirements.txt" (
    echo Installing from requirements.txt...
    echo This may take a few minutes...
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo %CROSS% Failed to install some dependencies
        echo Please check the error messages above
        pause
    ) else (
        echo %CHECK% Dependencies installed
    )
) else (
    echo %WARN% requirements.txt not found
    echo Installing core dependencies manually...

    pip install numpy>=1.24.0 --quiet
    pip install pandas>=2.0.0 --quiet
    pip install scipy>=1.10.0 --quiet
    pip install matplotlib>=3.7.0 --quiet
    pip install seaborn>=0.12.0 --quiet
    pip install requests>=2.31.0 --quiet
    pip install beautifulsoup4>=4.12.0 --quiet
    pip install lxml>=4.9.0 --quiet
    pip install yfinance>=0.2.28 --quiet
    pip install streamlit>=1.28.0 --quiet

    echo %CHECK% Core dependencies installed
)

echo.

REM ===================================================================
REM STEP 5: ENVIRONMENT FILE
REM ===================================================================

echo ================================================================================
echo 🔐 STEP 5: ENVIRONMENT CONFIGURATION
echo ================================================================================
echo.

if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env from template...
        copy .env.example .env >nul
        echo %CHECK% .env file created
        echo %WARN% Please edit .env and add your API keys!
    ) else (
        echo %WARN% .env.example not found
        echo You may need to create .env manually
    )
) else (
    echo .env file already exists
)

echo.

REM ===================================================================
REM STEP 6: CONFIGURATION VALIDATION
REM ===================================================================

echo ================================================================================
echo ⚙️  STEP 6: CONFIGURATION VALIDATION
echo ================================================================================
echo.

if exist "config.py" (
    echo Validating configuration...
    python config.py
    echo %CHECK% Configuration validated
) else (
    echo %WARN% config.py not found
)

echo.

REM ===================================================================
REM STEP 7: TESTS
REM ===================================================================

echo ================================================================================
echo 🧪 STEP 7: TESTS (OPTIONAL)
echo ================================================================================
echo.

set /p RUN_TESTS="Run test suite? [Y/n]: "
if /i "%RUN_TESTS%"=="n" goto skip_tests

if exist "tests\test_all.py" (
    echo Running tests...
    python tests\test_all.py
) else (
    echo %WARN% Test file not found, skipping tests
)

:skip_tests
echo.

REM ===================================================================
REM COMPLETION
REM ===================================================================

echo ================================================================================
echo ✅ INSTALLATION COMPLETE!
echo ================================================================================
echo.
echo %CHECK% ATLAS Terminal v10.0 is ready to use!
echo.
echo Next steps:
echo.
echo 1. Edit .env file with your API keys:
echo    notepad .env
echo.
echo 2. Launch ATLAS Terminal:
echo    streamlit run atlas_app.py
echo.
echo 3. Access in browser:
echo    http://localhost:8501
echo.

if exist "%VENV_NAME%" (
    echo To activate virtual environment in future:
    echo    %VENV_NAME%\Scripts\activate.bat
    echo.
)

echo For help, see documentation:
echo    docs\ATLAS_COMPREHENSIVE_PATCH_GUIDE.md
echo.
echo ================================================================================
echo 🚀 Happy Trading!
echo ================================================================================
echo.

REM ===================================================================
REM OPTIONAL: AUTO-LAUNCH
REM ===================================================================

set /p LAUNCH="Launch ATLAS Terminal now? [y/N]: "
if /i "%LAUNCH%"=="y" (
    echo.
    echo Launching ATLAS Terminal...
    streamlit run atlas_app.py
)

pause
