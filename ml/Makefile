# Run from ml/. Targets marked (Txx) are implemented by Claude Code in that task.
PY ?= .venv/bin/python

.PHONY: setup env test lint all fix-libomp

setup:            ## create venv + install (T01)
	python3.12 -m venv .venv || python3.11 -m venv .venv || python3 -m venv .venv
	$(PY) -m pip install -U pip
	$(PY) -m pip install -e ".[dl,serve,dev]"
	$(PY) -m pip freeze > requirements-lock.txt
	$(MAKE) fix-libomp

# macOS without Homebrew: lib_lightgbm.dylib needs @rpath/libomp.dylib. torch wheels ship one, so we add
# an rpath to torch/lib and ad-hoc re-sign. No-op on Linux / when lightgbm already imports.
LGBM_LIB = $(wildcard .venv/lib/python3.*/site-packages/lightgbm/lib/lib_lightgbm.dylib)
fix-libomp:
	@if $(PY) -c "import lightgbm" 2>/dev/null; then echo "lightgbm OK"; \
	elif [ -n "$(LGBM_LIB)" ]; then \
	  install_name_tool -add_rpath "@loader_path/../../torch/lib" $(LGBM_LIB) && codesign -f -s - $(LGBM_LIB) && \
	  $(PY) -c "import lightgbm; print('lightgbm OK (libomp from torch)')"; \
	else echo "lightgbm import failed; install libomp (brew install libomp)"; exit 1; fi

env:              ## hardware + auth report (T02)
	$(PY) scripts/check_env.py

test:             ## unit tests incl. TS parity for B0
	$(PY) -m pytest -q

all:              ## full pipeline from raw data -> reports (created in T47)
	@echo "Target all dibuat di T47"

lint:
	$(PY) -m ruff check src tests scripts
