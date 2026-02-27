# ATLAS Terminal — Production Docker Image (Phase 7)
FROM python:3.11-slim

WORKDIR /app

# System dependencies (bcrypt, scientific packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy full application
COPY . .

# Ensure .streamlit config exists (headless mode)
RUN mkdir -p .streamlit && \
    printf '[server]\nheadless = true\nport = 8501\n\n[browser]\ngatherUsageStats = false\n' > .streamlit/config.toml

EXPOSE 8501

# Health check using ATLAS built-in endpoint
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8501/?health=check || exit 1

CMD ["streamlit", "run", "atlas_app.py", \
     "--server.port=8501", \
     "--server.address=0.0.0.0"]
