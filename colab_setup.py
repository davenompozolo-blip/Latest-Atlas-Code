"""
ATLAS Terminal - Simplified Colab Setup
Direct and simple approach with visible output
"""

import subprocess
import sys
import os
import time

def main():
    print("=" * 70)
    print("ATLAS Terminal v10.0 - Colab Setup")
    print("=" * 70)

    # Check if in correct directory
    if not os.path.exists('run.py'):
        print("\n❌ Error: run.py not found!")
        print("Make sure you're in the Latest-Atlas-Code directory")
        print("\nRun this first:")
        print("  %cd Latest-Atlas-Code")
        return

    # Install pyngrok if needed
    print("\n📦 Ensuring pyngrok is installed...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pyngrok"],
                   check=False)

    print("✅ Dependencies ready")

    # Start streamlit
    print("\n🚀 Starting Streamlit server...")
    print("   (This may take 10-15 seconds)\n")

    # Start in background without capturing output (so we can see errors)
    process = subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", "run.py",
         "--server.port=8501", "--server.headless=true"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT
    )

    # Give it time to start
    print("⏳ Waiting for Streamlit to initialize...")
    for i in range(12):
        time.sleep(1)
        print(f"   {i+1}/12 seconds...")

    print("\n🌐 Creating public tunnel with ngrok...\n")

    try:
        from pyngrok import ngrok

        # Kill any existing tunnels
        ngrok.kill()

        # Connect
        tunnel = ngrok.connect(8501)

        print("\n" + "=" * 70)
        print("✅ SUCCESS! ATLAS Terminal is LIVE!")
        print("=" * 70)
        print(f"\n🔗 Public URL:\n   {tunnel.public_url}")
        print(f"\n📋 Direct link:\n   {tunnel.public_url}")
        print("\n" + "=" * 70)
        print("\n📝 Instructions:")
        print("   1. Click the URL above")
        print("   2. If asked, click 'Visit Site' on ngrok page")
        print("   3. Upload your CSV files in the sidebar")
        print("   4. Navigate between pages using sidebar menu")
        print("\n⚠️  Keep this running! Don't interrupt the cell.")
        print("=" * 70)

        # Print the tunnel info
        print(f"\n🔍 Tunnel Details:")
        print(f"   {tunnel}")

        # Keep alive
        print("\n✅ Server running... (Press Ctrl+C or interrupt cell to stop)")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\n🛑 Shutting down...")
            process.terminate()
            ngrok.kill()
            print("✅ Stopped")

    except Exception as e:
        print(f"\n❌ Error creating tunnel: {e}")
        print(f"\nError type: {type(e).__name__}")
        print("\nTrying to stop streamlit process...")
        process.terminate()

        print("\n" + "=" * 70)
        print("ALTERNATIVE: Manual Setup")
        print("=" * 70)
        print("\nRun these commands separately in new cells:")
        print("\n# Cell 1: Start Streamlit")
        print("!streamlit run run.py --server.port=8501 --server.headless=true &")
        print("\n# Cell 2: Wait then create tunnel")
        print("import time; time.sleep(15)")
        print("from pyngrok import ngrok")
        print("ngrok.kill()")
        print("print(ngrok.connect(8501))")

if __name__ == "__main__":
    main()
