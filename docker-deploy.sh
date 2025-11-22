#!/bin/bash

# ============================================================================
# ATLAS TERMINAL - DOCKER DEPLOYMENT
# ============================================================================

echo "🐳 ATLAS Terminal Docker Deployment"
echo "===================================="
echo ""

# Build Docker image
echo "📦 Building Docker image..."
docker build -t atlas-terminal:latest .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

echo ""
echo "✅ Image built successfully"
echo ""

# Stop existing container if running
if [ "$(docker ps -q -f name=atlas-terminal)" ]; then
    echo "🛑 Stopping existing container..."
    docker stop atlas-terminal
    docker rm atlas-terminal
fi

# Run container
echo "🚀 Starting ATLAS Terminal container..."
docker run -d \
    --name atlas-terminal \
    -p 8501:8501 \
    --restart unless-stopped \
    atlas-terminal:latest

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ATLAS Terminal is running!"
    echo ""
    echo "🌐 Access at: http://localhost:8501"
    echo ""
    echo "📊 Container status:"
    docker ps -f name=atlas-terminal
    echo ""
    echo "📝 View logs: docker logs -f atlas-terminal"
    echo "🛑 Stop: docker stop atlas-terminal"
else
    echo "❌ Failed to start container"
    exit 1
fi
