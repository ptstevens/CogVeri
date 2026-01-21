# Transcription Worker Dockerfile
# Uses OpenAI Whisper for speech-to-text transcription
# Pinned to SHA256 digest for reproducible builds and supply chain security

FROM python:3.11-slim@sha256:5be45dbade29bebd6886af6b438fd7e0b4eb7b611f39ba62b430263f82de36d2

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create directories for models and temp files
RUN mkdir -p /app/models /tmp/transcription

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download Whisper model during build to speed up first run
ARG WHISPER_MODEL=base.en
ENV WHISPER_MODEL=${WHISPER_MODEL}
ENV WHISPER_DOWNLOAD_ROOT=/app/models

# Pre-download the Whisper model (baked into image for faster startup)
RUN python -c "import whisper; whisper.load_model('${WHISPER_MODEL}', download_root='${WHISPER_DOWNLOAD_ROOT}')"

# Copy application code
COPY config.py .
COPY worker.py .

# Create non-root user for security
RUN useradd -m -u 1000 worker && \
    chown -R worker:worker /app /tmp/transcription

USER worker

# Health check - verify Redis connection with authentication
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import os; import redis; r = redis.Redis(host=os.environ.get('REDIS_HOST', 'localhost'), port=int(os.environ.get('REDIS_PORT', 6379)), password=os.environ.get('REDIS_PASSWORD'), db=int(os.environ.get('REDIS_DB', 0))); r.ping()" || exit 1

# Run the worker
CMD ["python", "worker.py"]
