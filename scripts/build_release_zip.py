"""Release package remediaide-cac-penyisihan.zip (butir 7): tracked files of HEAD only (git archive), so node_modules,
.venv, raw/processed data, .env and pilot data can never be included. Eedi-derived model weights are removed as well.

  ml/.venv/bin/python scripts/build_release_zip.py [--out submission/remediaide-cac-penyisihan.zip]
Prints the excluded paths and a summary; exits 1 if a forbidden path slipped in.
"""

import argparse
import fnmatch
import io
import subprocess
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = [  # Eedi-derived weights (CC BY-NC-ND data): not redistributed in the package
    "public/models/*.onnx", "ml/models/*.joblib", "ml/models/l1_cokt_v1/*.pt",
]
FORBIDDEN = ["*.env", ".env*", "*credentials*", "*kaggle.json", "ml/data/raw/*", "ml/data/processed/*", "ml/data/interim/*",
             "ml/data/pilot/*", "*.parquet", "node_modules/*", "*/.venv/*", "*.pem", "*.key"]
ALLOW = {".env.example"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "submission" / "remediaide-cac-penyisihan.zip")
    a = ap.parse_args()
    sha = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    tar = subprocess.run(["git", "-C", str(ROOT), "archive", "--format=tar", "HEAD"], capture_output=True, check=True).stdout
    a.out.parent.mkdir(parents=True, exist_ok=True)
    kept, dropped, bad = 0, [], []
    with tarfile.open(fileobj=io.BytesIO(tar)) as t, zipfile.ZipFile(a.out, "w", zipfile.ZIP_DEFLATED) as z:
        for m in t.getmembers():
            if not m.isfile():
                continue
            if any(fnmatch.fnmatch(m.name, p) for p in EXCLUDE):
                dropped.append(m.name)
                continue
            if Path(m.name).name not in ALLOW and any(fnmatch.fnmatch(m.name, p) or fnmatch.fnmatch(Path(m.name).name, p)
                                                     for p in FORBIDDEN):
                bad.append(m.name)
                continue
            z.writestr(f"remediaide/{m.name}", t.extractfile(m).read())
            kept += 1
        z.writestr("remediaide/RELEASE_INFO.txt", f"RemediAide 2.0 — CAC MLSC 2026 (penyisihan)\ncommit {sha}\n"
                   "Bobot model turunan Eedi tidak disertakan (lisensi CC BY-NC-ND data); lihat ml/models/README.md.\n")
    print(f"{a.out}: {kept} berkas, {a.out.stat().st_size / 1e6:.1f} MB, commit {sha[:7]}")
    print("dikeluarkan (bobot turunan Eedi):", dropped)
    if bad:
        print("TERLARANG:", bad)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
