"""
ATLAS Terminal - Google Colab Launcher
Single script to setup and run ATLAS Terminal in Google Colab

Usage in Colab:
1. Upload this file to Colab
2. Run: !python run_atlas_colab.py
   OR
   Just run the cells if uploaded as notebook
"""

import subprocess
import sys
import time
import os

def run_command(cmd, description=""):
    """Run shell command and print output"""
    if description:
        print(f"\n{'='*60}")
        print(f"📌 {description}")
        print(f"{'='*60}\n")

    result = subprocess.run(cmd, shell=True, capture_output=False, text=True)
    return result.returncode == 0

def main():
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║         ATLAS Terminal v10.0 - Colab Setup                ║
    ║         Professional Trading Terminal                      ║
    ╚═══════════════════════════════════════════════════════════╝
    """)

    # Check if already in repo directory
    if not os.path.exists('atlas_terminal'):
        print("\n⚠️  Not in ATLAS directory. Cloning repository...")

        # Clone repository
        if not run_command(
            "git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git",
            "Cloning ATLAS Terminal Repository"
        ):
            print("❌ Failed to clone repository")
            return

        # Change directory
        os.chdir('Latest-Atlas-Code')

        # Checkout branch
        run_command(
            "git checkout claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ",
            "Checking out latest version"
        )
    else:
        print("✅ Already in ATLAS directory")

    # Install dependencies
    print("\n📦 Installing dependencies (this may take 1-2 minutes)...")
    packages = [
        'streamlit',
        'pandas',
        'numpy',
        'plotly',
        'yfinance',
        'scipy',
        'scikit-learn',
        'openpyxl',
        'pyngrok'
    ]

    for package in packages:
        subprocess.run(
            f"{sys.executable} -m pip install -q {package}",
            shell=True,
            capture_output=True
        )

    print("✅ All packages installed")

    # Setup ngrok
    print("\n🌐 Setting up public URL tunnel...")
    try:
        from pyngrok import ngrok

        # Kill existing tunnels
        ngrok.kill()

        # Start Streamlit in background
        print("\n🚀 Starting ATLAS Terminal...")
        streamlit_process = subprocess.Popen(
            [sys.executable, "-m", "streamlit", "run", "atlas_terminal/main.py",
             "--server.port=8501", "--server.headless=true"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        # Wait for Streamlit to start
        print("⏳ Waiting for Streamlit to initialize...")
        time.sleep(8)

        # Create public tunnel
        public_url = ngrok.connect(8501)

        print(f"""

    ╔═══════════════════════════════════════════════════════════╗
    ║                  🎉 SUCCESS!                               ║
    ╚═══════════════════════════════════════════════════════════╝

    🚀 ATLAS Terminal is now LIVE!

    📊 Access your dashboard here:
    {public_url}

    📝 Instructions:
    1. Click the URL above (Ctrl/Cmd + Click)
    2. Upload your CSV files using the sidebar
    3. Navigate between pages using the sidebar menu

    ⚠️  Important:
    - Keep this script running (don't interrupt)
    - The URL is temporary and changes each session
    - Colab sessions timeout after ~60 mins of inactivity

    💡 Tip: For a permanent URL, sign up at ngrok.com

    ═══════════════════════════════════════════════════════════
        """)

        # Keep running
        print("🔄 Server is running. Press Ctrl+C to stop...\n")
        try:
            streamlit_process.wait()
        except KeyboardInterrupt:
            print("\n\n🛑 Stopping ATLAS Terminal...")
            streamlit_process.terminate()
            ngrok.kill()
            print("✅ Shutdown complete")

    except ImportError:
        print("❌ Error: pyngrok not installed properly")
        print("Try running: pip install pyngrok")
    except Exception as e:
        print(f"❌ Error starting tunnel: {e}")
        print("\nTrying alternative method with localtunnel...")

        # Fallback to localtunnel
        print("📦 Installing localtunnel...")
        subprocess.run("npm install -g localtunnel", shell=True, capture_output=True)

        print("🚀 Starting ATLAS Terminal with localtunnel...")
        streamlit_process = subprocess.Popen(
            [sys.executable, "-m", "streamlit", "run", "atlas_terminal/main.py",
             "--server.port=8501", "--server.headless=true"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        time.sleep(8)

        # Start localtunnel
        tunnel_process = subprocess.Popen(
            ["lt", "--port", "8501"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║              🎉 SUCCESS (Localtunnel)!                     ║
    ╚═══════════════════════════════════════════════════════════╝

    🚀 ATLAS Terminal is now LIVE!

    📊 Your URL will appear below shortly...
        """)

        # Print tunnel output
        time.sleep(3)
        for line in iter(tunnel_process.stdout.readline, b''):
            output = line.decode().strip()
            if output:
                print(output)
                if 'https://' in output:
                    break

        print("\n⚠️  Keep this running. Press Ctrl+C to stop...")
        try:
            streamlit_process.wait()
        except KeyboardInterrupt:
            print("\n🛑 Stopping...")
            streamlit_process.terminate()
            tunnel_process.terminate()

if __name__ == "__main__":
    main()
