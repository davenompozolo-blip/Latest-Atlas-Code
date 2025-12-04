# 🚀 ATLAS Terminal v10.0 - Production Deployment Guide

## Overview

This guide covers deploying ATLAS Terminal to production environments.

**Deployment Options:**
1. **Streamlit Cloud** - Free hosting for Streamlit apps
2. **Heroku** - Cloud platform as a service
3. **AWS EC2** - Full control with cloud servers
4. **Docker** - Containerized deployment
5. **Local Server** - Self-hosted on your infrastructure

---

## 📋 Pre-Deployment Checklist

Before deploying to production:

- [ ] All tests pass (`python tests/test_all.py`)
- [ ] Environment variables configured
- [ ] API keys secured
- [ ] Database configured (if using)
- [ ] Backups configured
- [ ] Monitoring setup
- [ ] Error logging enabled
- [ ] Security audit completed
- [ ] Performance testing done
- [ ] Documentation updated

---

## 🌐 Option 1: Streamlit Cloud (Recommended)

**Pros:** Free, easy, automatic HTTPS, built for Streamlit
**Cons:** Limited resources, public repos only (or paid)

### **Step 1: Prepare Repository**
```bash
# Ensure these files exist:
# - atlas_app.py
# - requirements.txt
# - .streamlit/config.toml (optional)
# - .streamlit/secrets.toml (for secrets)

# Push to GitHub
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### **Step 2: Create secrets.toml**

Create `.streamlit/secrets.toml` (DO NOT COMMIT THIS):
```toml
# Investopedia
investopedia_email = "your_email@gmail.com"
investopedia_password = "your_password"

# API Keys
alpha_vantage_key = "your_key"
fmp_key = "your_key"
polygon_key = "your_key"
iex_cloud_key = "your_key"

# Other secrets
secret_key = "your_secret_key"
```

### **Step 3: Deploy**

1. Go to https://share.streamlit.io/
2. Sign in with GitHub
3. Click "New app"
4. Select your repository
5. Branch: `main`
6. Main file: `atlas_app.py`
7. Click "Deploy"

### **Step 4: Add Secrets**

1. In Streamlit Cloud dashboard, go to app settings
2. Click "Secrets"
3. Paste contents of `.streamlit/secrets.toml`
4. Save

**Your app is now live!** 🎉

---

## 🐳 Option 2: Docker Deployment

**Pros:** Portable, consistent, easy scaling
**Cons:** Requires Docker knowledge

### **Step 1: Create Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create directories
RUN mkdir -p data cache output logs

# Expose port
EXPOSE 8501

# Health check
HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health

# Run application
ENTRYPOINT ["streamlit", "run", "atlas_app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

### **Step 2: Create docker-compose.yml**
```yaml
version: '3.8'

services:
  atlas-terminal:
    build: .
    ports:
      - "8501:8501"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./cache:/app/cache
      - ./output:/app/output
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8501/_stcore/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### **Step 3: Build and Run**
```bash
# Build image
docker build -t atlas-terminal:v10 .

# Run container
docker run -p 8501:8501 --env-file .env atlas-terminal:v10

# OR use docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### **Step 4: Deploy to Cloud**

**Push to Docker Hub:**
```bash
docker tag atlas-terminal:v10 your-username/atlas-terminal:v10
docker push your-username/atlas-terminal:v10
```

**Deploy to AWS ECS, Google Cloud Run, or Azure Container Instances**

---

## ☁️ Option 3: AWS EC2

**Pros:** Full control, scalable
**Cons:** More complex, costs money

### **Step 1: Launch EC2 Instance**

1. Go to AWS Console → EC2
2. Launch instance
3. Choose Ubuntu Server 22.04 LTS
4. Instance type: t3.medium (or larger)
5. Configure security group:
   - SSH (port 22) from your IP
   - HTTP (port 80) from anywhere
   - HTTPS (port 443) from anywhere
   - Custom TCP (port 8501) from anywhere
6. Launch

### **Step 2: Connect and Setup**
```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip -y

# Install nginx (reverse proxy)
sudo apt install nginx -y

# Install git
sudo apt install git -y
```

### **Step 3: Deploy Application**
```bash
# Clone repository
git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git
cd Latest-Atlas-Code

# Create virtual environment
python3.11 -m venv atlas_env
source atlas_env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
nano .env
# Add your secrets

# Test locally
streamlit run atlas_app.py
```

### **Step 4: Configure Nginx**

Create `/etc/nginx/sites-available/atlas`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8501;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### **Step 5: Setup Systemd Service**

Create `/etc/systemd/system/atlas.service`:
```ini
[Unit]
Description=ATLAS Terminal v10.0
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Latest-Atlas-Code
Environment="PATH=/home/ubuntu/Latest-Atlas-Code/atlas_env/bin"
ExecStart=/home/ubuntu/Latest-Atlas-Code/atlas_env/bin/streamlit run atlas_app.py
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
# Start service
sudo systemctl daemon-reload
sudo systemctl start atlas
sudo systemctl enable atlas

# Check status
sudo systemctl status atlas

# View logs
sudo journalctl -u atlas -f
```

### **Step 6: Setup SSL (HTTPS)**
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

**Your app is now live at https://your-domain.com!** 🎉

---

## 🔒 Security Best Practices

### **1. Environment Variables**

Never commit secrets:
```bash
# Use environment variables
export INVESTOPEDIA_PASSWORD="your_password"
export ALPHA_VANTAGE_KEY="your_key"

# Or use .env file (add to .gitignore)
echo ".env" >> .gitignore
```

### **2. HTTPS Only**

Always use HTTPS in production:
```python
# In config
FORCE_HTTPS = True

# Redirect HTTP to HTTPS in nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### **3. Rate Limiting**

Protect against abuse:
```python
# In atlas_app.py
from streamlit_extras.app_logo import add_logo
import time

# Simple rate limiting
if 'last_request' not in st.session_state:
    st.session_state.last_request = time.time()

current_time = time.time()
if current_time - st.session_state.last_request < 1:  # 1 second cooldown
    st.warning("Please wait before making another request")
    st.stop()

st.session_state.last_request = current_time
```

### **4. Input Validation**

Validate all user inputs:
```python
def validate_ticker(ticker):
    """Validate ticker symbol"""
    if not ticker or not ticker.isalnum():
        raise ValueError("Invalid ticker symbol")
    if len(ticker) > 5:
        raise ValueError("Ticker too long")
    return ticker.upper()
```

### **5. Authentication (Optional)**

Add basic auth:
```python
import streamlit_authenticator as stauth

# In atlas_app.py
authenticator = stauth.Authenticate(
    names=['Admin'],
    usernames=['admin'],
    passwords=['hashed_password'],
    cookie_name='atlas_auth',
    key='secret_key',
    cookie_expiry_days=30
)

name, authentication_status, username = authenticator.login('Login', 'main')

if authentication_status:
    # Show app
    pass
elif authentication_status == False:
    st.error('Username/password is incorrect')
elif authentication_status == None:
    st.warning('Please enter your username and password')
    st.stop()
```

---

## 📊 Monitoring & Logging

### **1. Application Logging**
```python
import logging
from logging.handlers import RotatingFileHandler

# Setup logging
handler = RotatingFileHandler(
    'logs/atlas_terminal.log',
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[handler]
)

logger = logging.getLogger(__name__)

# Use in code
logger.info("User optimized portfolio")
logger.error(f"Failed to fetch data: {error}")
```

### **2. Error Tracking (Sentry)**
```bash
pip install sentry-sdk
```
```python
import sentry_sdk

sentry_sdk.init(
    dsn="your-sentry-dsn",
    traces_sample_rate=1.0
)
```

### **3. Performance Monitoring**
```python
import time

def monitor_performance(func):
    """Decorator to monitor function performance"""
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start

        if elapsed > 5:  # Warn if >5 seconds
            logger.warning(f"{func.__name__} took {elapsed:.2f}s")

        return result
    return wrapper

@monitor_performance
def fetch_portfolio_data():
    # Your code
    pass
```

---

## 🔄 CI/CD Pipeline

### **GitHub Actions Example**

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Deploy to AWS
      env:
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      run: |
        # Deploy script
        ssh user@your-server "cd /app && git pull && systemctl restart atlas"
```

---

## 🐛 Troubleshooting

### **Common Issues**

**1. Port Already in Use**
```bash
# Find process using port 8501
lsof -i :8501

# Kill process
kill -9 <PID>
```

**2. Memory Issues**
```python
# Add to atlas_app.py
import streamlit as st

st.set_page_config(
    page_title="ATLAS Terminal",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Clear cache periodically
if st.button("Clear Cache"):
    st.cache_data.clear()
    st.cache_resource.clear()
```

**3. Slow Performance**
```python
# Use caching aggressively
@st.cache_data(ttl=300)  # Cache for 5 minutes
def fetch_data(ticker):
    # Your code
    pass
```

---

## ✅ Post-Deployment Checklist

- [ ] App accessible via HTTPS
- [ ] All features working
- [ ] Logs being captured
- [ ] Error tracking enabled
- [ ] Monitoring dashboard setup
- [ ] Backups configured
- [ ] Documentation updated
- [ ] Team notified
- [ ] Users notified (if applicable)

---

## 🎉 You're Live!

Congratulations! Your ATLAS Terminal is now in production.

**Next Steps:**
1. Monitor logs regularly
2. Set up alerts for errors
3. Review performance metrics
4. Gather user feedback
5. Plan next release

**Need Help?**
- Check logs: `sudo journalctl -u atlas -f`
- Review docs: `docs/`
- Open issue: GitHub Issues

**Happy Trading! 🚀📈💰**
