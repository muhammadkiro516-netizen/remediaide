"""Copy Kaggle GPU run evidence (logs + metrics, no data, no weights) into kaggle/evidence/ so judges can verify the
private kernels without access. The Kaggle username is replaced by <KAGGLE_USERNAME>.

  python scripts/export_kaggle_evidence.py
Excluded on purpose: *.parquet (OOF predictions derived from Eedi, CC BY-NC-ND), roles.json (Eedi user ids),
model weights/tokenizers (large; see models/README.md).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil

from remediaide_ml.paths import ML_ROOT

RUNS = {
    "cokt": ("runs/20261118-2202_cokt_kaggle", ["eval.json", "kaggle_output/metrics_full.json",
             "kaggle_output/metrics_no_conf.json", "kaggle_output/metrics_no_option.json",
             "kaggle_output/remediaide-cokt.log"]),
    "cokt_final": ("runs/20261119-0620_cokt_final_kaggle", ["kaggle_output/remediaide-cokt-final.log"]
                   + [f"kaggle_output/report_seed{s}.json" for s in (20261118, 1, 2, 3, 4)]),
    "l2_mdeberta": ("runs/20261118-2202_l2_mdeberta_kaggle", ["eval.json", "kaggle_output/metrics_target.json",
                    "kaggle_output/metrics_category3.json", "kaggle_output/remediaide-l2-mdeberta.log"]),
    "l2_distill": ("runs/20261119-0745_l2_distill_kaggle", ["kaggle_output/metrics_distill.json",
                   "kaggle_output/remediaide-l2-distill.log", "kaggle_output/student_model/config.json",
                   "kaggle_output/student_model/classes.json"]),
}
USER = re.compile(r"avlsalmoon")
OUT = ML_ROOT / "kaggle" / "evidence"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    index = {}
    for kernel, (run, files) in RUNS.items():
        dst = OUT / kernel
        dst.mkdir(parents=True)
        index[kernel] = {"run_dir": run, "kernel_code": f"kaggle/kernels/{kernel}/train.py",
                         "kernel_metadata_template": f"kaggle/kernels/{kernel}/kernel-metadata.template.json",
                         "files": {}}
        for f in files:
            src = ML_ROOT / run / f
            text = USER.sub("<KAGGLE_USERNAME>", src.read_text(errors="replace"))
            out = dst / src.name
            out.write_text(text)
            index[kernel]["files"][src.name] = {"source": f"{run}/{f}", "bytes": len(text.encode()),
                                                "sha256_original": hashlib.sha256(src.read_bytes()).hexdigest()}
    (OUT / "index.json").write_text(json.dumps(index, indent=2))
    print(json.dumps({k: list(v["files"]) for k, v in index.items()}, indent=1))


if __name__ == "__main__":
    main()
