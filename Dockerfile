FROM python:3.11-slim

# Install system dependencies: FFmpeg and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application source code
COPY . .

# Set default port
ENV PORT=5050
EXPOSE 5050

# Run with Gunicorn WSGI server
CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--timeout", "180", "--workers", "2", "app:app"]
