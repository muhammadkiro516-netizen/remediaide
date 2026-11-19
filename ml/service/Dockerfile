# Build from ml/:  docker build -f service/Dockerfile -t remediaide-ml .
# Models are not baked in: mount them, e.g. -v $PWD/models:/app/models  (see models/README.md)
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RA_MODELS_DIR=/app/models RA_L2_LANG=id
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml requirements-lock.txt ./
COPY src ./src
COPY service ./service
RUN grep -v -E '^-e |^# Editable' requirements-lock.txt > /tmp/lock.txt \
    && pip install --no-cache-dir -r /tmp/lock.txt && pip install --no-cache-dir -e . --no-deps
EXPOSE 8000
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8000"]
