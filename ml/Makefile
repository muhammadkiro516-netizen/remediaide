# Run from ml/. Targets marked (Txx) are implemented by Claude Code in that task.
PY ?= .venv/bin/python

.PHONY: setup env test lint all fix-libomp data-raw kaggle-outputs data l1 l2 l3 final evidence check-repro

setup:            ## create venv + install (T01)
	python3.12 -m venv .venv || python3.11 -m venv .venv || python3 -m venv .venv
	$(PY) -m pip install -U pip
	$(PY) -m pip install -e ".[dl,serve,dev]"
	$(PY) -m pip freeze > requirements-lock.txt
	$(MAKE) fix-libomp

# macOS without Homebrew: lib_lightgbm.dylib needs @rpath/libomp.dylib. torch and scikit-learn wheels ship one, so we
# add rpaths to torch/lib and sklearn/.dylibs (works without the [dl] extra) and ad-hoc re-sign. No-op on Linux / when
# lightgbm already imports.
LGBM_LIB = $(wildcard .venv/lib/python3.*/site-packages/lightgbm/lib/lib_lightgbm.dylib)
fix-libomp:
	@if $(PY) -c "import lightgbm" 2>/dev/null; then echo "lightgbm OK"; \
	elif [ -n "$(LGBM_LIB)" ]; then \
	  install_name_tool -add_rpath "@loader_path/../../torch/lib" $(LGBM_LIB) ; \
	  install_name_tool -add_rpath "@loader_path/../../sklearn/.dylibs" $(LGBM_LIB) ; \
	  codesign -f -s - $(LGBM_LIB) && \
	  $(PY) -c "import lightgbm; print('lightgbm OK (libomp from torch or scikit-learn wheel)')"; \
	else echo "lightgbm import failed; install libomp (brew install libomp)"; exit 1; fi

env:              ## hardware + auth report (T02)
	$(PY) scripts/check_env.py

test:             ## unit tests incl. TS parity for B0
	$(PY) -m pytest -q

# ---------------------------------------------------------------------------------------------------- T47
# Canonical run ids (RESULTS.md, final_eval.py and the Kaggle outputs refer to these names).
export RA_RUN_TRANSLATE_MAP = 20261118-2129_translate_map
export RA_RUN_L2_TFIDF = 20261118-2131_l2_tfidf
export RA_RUN_E1_B0 = 20261118-2156_e1_b0
export RA_RUN_L1_B1 = 20261118-2156_l1_b1
export RA_RUN_L1_LGBM = 20261118-2205_l1_lgbm
LGBM_RUN = runs/$(RA_RUN_L1_LGBM)
COKT_CV = runs/20261118-2202_cokt_kaggle/kaggle_output
COKT_FINAL = runs/20261119-0620_cokt_final_kaggle/kaggle_output
MDEB = runs/20261118-2202_l2_mdeberta_kaggle/kaggle_output
MAP_ZIP = data/raw/map/map-charting-student-math-misunderstandings.zip
KAGGLE ?= .venv/bin/kaggle
NB = .venv/bin/jupyter nbconvert --to notebook --execute --inplace

data-raw:         ## download raw data (Eedi public blob; MAP needs Kaggle auth + accepted rules)
	mkdir -p data/raw/eedi_neurips2020 data/raw/map
	test -f data/raw/eedi_neurips2020/data.zip || curl -L -o data/raw/eedi_neurips2020/data.zip \
	  https://dqanonymousdata.blob.core.windows.net/neurips-public/data.zip
	test -f data/raw/map/train.csv || ($(KAGGLE) competitions download -c map-charting-student-math-misunderstandings \
	  -p data/raw/map && unzip -o $(MAP_ZIP) -d data/raw/map)

kaggle-outputs:   ## fetch the stored GPU outputs (private kernels of the team account; D-14)
	mkdir -p $(COKT_CV) $(COKT_FINAL) $(MDEB)
	test -f $(COKT_CV)/oof_full_seed1.parquet || $(KAGGLE) kernels output avlsalmoon/remediaide-cokt -p $(COKT_CV)
	test -f $(COKT_FINAL)/roles.json || $(KAGGLE) kernels output avlsalmoon/remediaide-cokt-final -p $(COKT_FINAL)
	test -f $(MDEB)/metrics_target.json || $(KAGGLE) kernels output avlsalmoon/remediaide-l2-mdeberta -p $(MDEB)

data:             ## T10-T15: loaders, cards, splits, translation, features, EDA
	$(PY) -m remediaide_ml.data.map
	$(PY) -m remediaide_ml.data.map_card
	$(PY) -m remediaide_ml.data.eedi --extract
	$(PY) -m remediaide_ml.data.eedi_card
	$(PY) -m remediaide_ml.data.splits
	test -f data/processed/map_id.parquet || (mkdir -p runs/$(RA_RUN_TRANSLATE_MAP) && \
	  $(PY) -m remediaide_ml.data.translate > runs/$(RA_RUN_TRANSLATE_MAP)/train.log 2>&1)
	$(PY) scripts/build_features.py
	$(NB) notebooks/01_eda.ipynb

l1:               ## T20-T24 (CPU part) + CO-KT evaluation from stored Kaggle outputs
	$(PY) scripts/e1_b0.py
	$(PY) scripts/train_l1_baselines.py
	$(PY) scripts/train_l1_lgbm.py
	$(PY) scripts/train_l1_lgbm_seeds.py --run $(LGBM_RUN)
	$(PY) scripts/plot_e2.py
	$(PY) scripts/cokt_eval.py --cokt $(COKT_CV) --lgbm $(LGBM_RUN)
	$(PY) scripts/l1_select.py
	$(PY) scripts/cokt_oof_export.py --cokt $(COKT_CV) --like $(LGBM_RUN)/oof_b_ens5.parquet \
	  --out runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet

l2:               ## T30-T34
	$(PY) scripts/train_l2_tfidf.py
	$(PY) scripts/l2_eval.py --enc $(MDEB) --tfidf runs/$(RA_RUN_L2_TFIDF)
	$(PY) scripts/e3_true_misconception.py --oof "B0 TF-IDF=runs/$(RA_RUN_L2_TFIDF)/oof_target.parquet" "M1 mDeBERTa=$(MDEB)"
	$(PY) scripts/e4_crosslingual.py --tfidf
	$(PY) scripts/e4_crosslingual.py --model $(MDEB)/model_target_fold0 --device cpu
	$(PY) scripts/e4_combine.py

l3:               ## T40-T45 + production artefacts
	$(PY) scripts/l3_eval.py --l1-oof runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet --l1-calib temperature \
	  --l2-oof runs/$(RA_RUN_L2_TFIDF)/oof_target.parquet --tag final_cv
	$(PY) scripts/e6_e8.py --oof runs/20261118-2202_cokt_kaggle/oof_b_ens5.parquet --calib temperature --tag final_cv
	$(PY) scripts/gap_fill.py   # audit gap-fill (CV only): B0 framing (a), LAC biner L1, akurasi opsi CO-KT, Gender 0/3
	$(PY) scripts/l3_production.py --cokt-final $(COKT_FINAL) --l2-oof runs/$(RA_RUN_L2_TFIDF)/oof_target.parquet \
	  --l2-enc $(MDEB)
	$(PY) scripts/export_l1.py --lgbm $(LGBM_RUN) --cokt-final $(COKT_FINAL)
	$(PY) scripts/export_l2.py --mdeberta $(MDEB)/model_target_fold0
	$(NB) notebooks/03_lapis1_baselines_lgbm.ipynb notebooks/04_lapis1_cokt.ipynb

final:            ## T46 test evaluation with frozen artefacts (re-run is logged in reports/TEST_OPENED.json)
	$(PY) scripts/final_eval.py --rerun-reason "$${RERUN_REASON:-reproduction (make all, T47)}"

evidence:         ## judge-facing evidence (CV + copies of existing test numbers; never reads test predictions)
	$(PY) scripts/story_evidence.py
	$(PY) scripts/export_kaggle_evidence.py

all: data l1 l2 l3 final evidence  ## full pipeline from raw data -> reports; then `make check-repro`

check-repro:      ## compare regenerated reports/tables with the committed versions (07 §6: +-0.005)
	$(PY) scripts/check_repro.py

lint:
	$(PY) -m ruff check src tests scripts
