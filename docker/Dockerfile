FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci --prefer-offline

COPY frontend/ ./
# Limit Node heap to avoid OOM on Railway free tier; skip tsc, just vite build
RUN NODE_OPTIONS="--max-old-space-size=512" npx vite build

FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

RUN mkdir -p logs ml_models
RUN useradd -m -u 1000 jalert && chown -R jalert:jalert /app

USER jalert

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
