# Service de génération d'emploi du temps — OR-Tools CP-SAT
#
# Tourne sur 8000. Sans état (in-memory), idempotent par requête.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
