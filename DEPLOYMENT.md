# ATLAS Terminal v10.0 - Deployment Guide

## 🚀 Quick Start Options

### Option 1: Quick Start (Fastest - Local Development)
```bash
./quick-start.sh
```
Access at: http://localhost:8501

### Option 2: Full Deployment Script (Local or Public)
```bash
./deploy.sh
```
Choose between:
- Local deployment (localhost only)
- Public deployment (with ngrok tunnel)

### Option 3: Docker (Production Ready)
```bash
./docker-deploy.sh
```
OR using docker-compose:
```bash
docker-compose up -d
```

### Option 4: Google Colab (Already Configured)
Upload `COLAB_DEPLOY.py` to Google Colab and run the cell.

---

## 📋 Prerequisites

### All Deployments
- Python 3.11+
- pip3

### Docker Deployment
- Docker 20.10+
- Docker Compose 2.0+ (for docker-compose option)

### Public Deployment (ngrok)
- ngrok account (free tier works)
- ngrok auth token

---

## 🔧 Manual Installation

If you prefer manual setup:

```bash
# 1. Install dependencies
pip3 install -r requirements.txt

# 2. Run Streamlit
streamlit run atlas_app.py --server.port=8501
```

---

## 🌐 Deployment Methods Comparison

| Method | Use Case | Complexity | Public Access |
|--------|----------|------------|---------------|
| quick-start.sh | Local dev | ⭐ Easy | ❌ No |
| deploy.sh (local) | Testing | ⭐ Easy | ❌ No |
| deploy.sh (ngrok) | Sharing | ⭐⭐ Medium | ✅ Yes |
| Docker | Production | ⭐⭐ Medium | ❌ No* |
| docker-compose | Production | ⭐ Easy | ❌ No* |
| Google Colab | Quick demo | ⭐ Easy | ✅ Yes |

*Docker can be combined with reverse proxy for public access

---

## 🔐 Environment Variables

### For ngrok deployment:
```bash
export NGROK_AUTH_TOKEN="your_token_here"
./deploy.sh
```

### For custom configuration:
```bash
export STREAMLIT_SERVER_PORT=8501
export STREAMLIT_SERVER_HEADLESS=true
```

---

## 🐳 Docker Details

### Build and run manually:
```bash
# Build
docker build -t atlas-terminal:latest .

# Run
docker run -d \
  --name atlas-terminal \
  -p 8501:8501 \
  --restart unless-stopped \
  atlas-terminal:latest
```

### View logs:
```bash
docker logs -f atlas-terminal
```

### Stop container:
```bash
docker stop atlas-terminal
docker rm atlas-terminal
```

---

## 🌍 Cloud Deployment

### Deploying to Cloud Platforms

#### **Heroku**
```bash
# Install Heroku CLI
heroku create atlas-terminal

# Add buildpack
heroku buildpacks:set heroku/python

# Deploy
git push heroku main
```

#### **AWS EC2**
1. Launch EC2 instance (Ubuntu 22.04)
2. SSH into instance
3. Clone repository
4. Run `./deploy.sh` (option 1 for local)
5. Configure security group to allow port 8501

#### **Google Cloud Run**
```bash
gcloud run deploy atlas-terminal \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

#### **Azure Container Instances**
```bash
az container create \
  --resource-group atlas-rg \
  --name atlas-terminal \
  --image atlas-terminal:latest \
  --dns-name-label atlas-terminal \
  --ports 8501
```

#### **DigitalOcean App Platform**
1. Connect GitHub repository
2. Select Dockerfile deployment
3. Set HTTP port to 8501
4. Deploy

---

## 🔧 Troubleshooting

### Port already in use
```bash
# Find process using port 8501
lsof -i :8501

# Kill process
kill -9 <PID>
```

### Dependencies not installing
```bash
# Upgrade pip
pip3 install --upgrade pip

# Install with verbose output
pip3 install -v -r requirements.txt
```

### Streamlit won't start
```bash
# Check Python version
python3 --version  # Should be 3.11+

# Check Streamlit installation
streamlit --version

# Run with debug
streamlit run atlas_app.py --logger.level=debug
```

### ngrok tunnel not working
```bash
# Set auth token explicitly
ngrok authtoken YOUR_TOKEN

# Test ngrok
ngrok http 8501
```

### Docker build fails
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker build --no-cache -t atlas-terminal:latest .
```

---

## 📊 Performance Optimization

### For production deployments:

1. **Increase Streamlit memory**
```bash
streamlit run atlas_app.py \
  --server.maxUploadSize=200 \
  --server.maxMessageSize=200
```

2. **Use production WSGI server** (for heavy traffic)
```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn -w 4 -b 0.0.0.0:8501 --timeout 120 streamlit_app:app
```

3. **Enable caching** (already configured in atlas_app.py)

---

## 🔒 Security Recommendations

### Production Checklist:
- [ ] Change default ngrok token
- [ ] Enable HTTPS (use reverse proxy like nginx)
- [ ] Set up authentication (Streamlit supports SSO)
- [ ] Configure firewall rules
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Regular dependency updates

---

## 📞 Support

For deployment issues:
1. Check logs: `docker logs atlas-terminal` (Docker) or terminal output
2. Verify all dependencies installed: `pip list`
3. Test locally first before public deployment
4. Check firewall/network settings

---

## 🎯 Recommended Deployment by Use Case

| Use Case | Recommended Method |
|----------|-------------------|
| **Quick demo** | `./quick-start.sh` or Google Colab |
| **Development** | `./quick-start.sh` |
| **Sharing with team** | `./deploy.sh` (ngrok option) |
| **Production (small)** | Docker on VPS (AWS EC2, DigitalOcean) |
| **Production (large)** | Kubernetes cluster |
| **No server access** | Google Colab or cloud platform |

---

**Version:** 1.0
**Last Updated:** November 22, 2025
**ATLAS Terminal Version:** v10.0 INSTITUTIONAL EDITION
