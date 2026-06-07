# ─────────────────────────────────────────────────────────────
# Artimis Agent — container image
#
# Multi-stage build:
#   1. node stage  → builds the React/Vite Web UI into web/dist
#   2. python stage → installs deps, copies app + built UI, runs uvicorn
#
# Runtime config lives in a single volume mounted at /data (ARTIMIS_HOME):
#   /data/.env          API keys + default model
#   /data/artimis.db    SQLite database (WAL)
#   /data/files/        uploaded files
#   /data/skills/       learned skills
#
# Build:  docker build -t artimis:latest .
# Run:    docker compose up -d   (see docker-compose.yml)
# ─────────────────────────────────────────────────────────────

# ── Stage 1: build the Web UI ────────────────────────────────
FROM node:22-slim AS web-builder

WORKDIR /build/web

# Install deps first (cached layer) — copy lockfiles only
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy the rest of the web source and build
COPY web/ ./
RUN npm run build


# ── Stage 2: Python runtime ──────────────────────────────────
FROM python:3.11-slim AS runtime

# No .pyc, unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ARTIMIS_HOME=/data \
    ARTIMIS_PORT=7002

WORKDIR /app

# Install Python deps first (cached unless requirements.txt changes)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source
COPY artimis/ ./artimis/
COPY run.py ./run.py

# Copy the freshly-built Web UI from stage 1 (overwrites any committed dist)
COPY --from=web-builder /build/web/dist ./web/dist

# Data dir is a mounted volume; create the mountpoint
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 7002

# Healthcheck hits the API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:7002/api/health').status==200 else 1)" || exit 1

CMD ["python", "-m", "uvicorn", "artimis.api.server:app", "--host", "0.0.0.0", "--port", "7002"]
