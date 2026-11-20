# Hugging Face Space (SDK: docker) for the RemediAide 2.0 ML service. Built by HF from the Space repo root, which
# scripts/build_hf_space.py assembles (src/, service/, models/, pyproject.toml, requirements-lock.txt).
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    RA_MODELS_DIR=/home/user/app/models RA_L2_LANG=id RA_L2_MODEL=mdeberta
WORKDIR /home/user/app
COPY --chown=user pyproject.toml requirements-lock.txt ./
# CPU-only torch (the default Linux wheel bundles CUDA and is several GB); same version as the lock file
RUN pip install --no-cache-dir --user --index-url https://download.pytorch.org/whl/cpu "torch==2.15.0" \
    && grep -v -E '^-e |^# Editable|^torch==|^nvidia-|^triton==' requirements-lock.txt > /tmp/lock.txt \
    && pip install --no-cache-dir --user -r /tmp/lock.txt
COPY --chown=user src ./src
COPY --chown=user service ./service
COPY --chown=user models ./models
RUN pip install --no-cache-dir --user -e . --no-deps
EXPOSE 7860
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "7860"]
