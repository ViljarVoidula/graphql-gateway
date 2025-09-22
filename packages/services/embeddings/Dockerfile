FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md .env.example ./
# Copy source before editable install so setuptools can find packages under src/
COPY src ./src
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e .
# Optionally copy a production .env at build time:
# COPY .env ./.env

# Default to 9002 to match docker-compose, but allow override via PORT env
EXPOSE 9002
CMD ["/bin/sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-9002}"]
