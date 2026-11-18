# Run from ml/. Targets marked (Txx) are implemented by Claude Code in that task.
PY ?= .venv/bin/python

.PHONY: setup env test lint all

setup:            ## create venv + install (T01)
	python3.12 -m venv .venv || python3.11 -m venv .venv || python3 -m venv .venv
	$(PY) -m pip install -U pip
	$(PY) -m pip install -e ".[dl,serve,dev]"
	$(PY) -m pip freeze > requirements-lock.txt

env:              ## hardware + auth report (T02)
	$(PY) scripts/check_env.py

test:             ## unit tests incl. TS parity for B0
	$(PY) -m pytest -q

all:              ## full pipeline from raw data -> reports (created in T47)
	@echo "Target all dibuat di T47"

lint:
	$(PY) -m ruff check src tests scripts
