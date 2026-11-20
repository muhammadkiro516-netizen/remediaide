"""Create (or update) the GitHub Release v1.0-cac-penyisihan with the release zip (butir 7).

  ml/.venv/bin/python scripts/github_release.py --check          # auth + repo access only
  ml/.venv/bin/python scripts/github_release.py --zip submission/remediaide-cac-penyisihan.zip
The token comes from the local git credential helper (`git credential fill`) and is never printed or written to disk.
Notes: the 5 headline lines are read from ml/reports/tables/headline.json.
"""

import argparse
import json
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = "muhammadkiro516-netizen/remediaide"
TAG = "v1.0-cac-penyisihan"
API = f"https://api.github.com/repos/{REPO}"


def token() -> str:
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n", capture_output=True,
                         text=True, check=True).stdout
    tok = next((ln.split("=", 1)[1] for ln in out.splitlines() if ln.startswith("password=")), "")
    if not tok:
        raise SystemExit("tidak ada kredensial GitHub di git credential helper")
    return tok


def call(method, url, tok, body=None, data=None, ctype="application/json"):
    req = urllib.request.Request(url, method=method, data=data if data is not None else
                                 (json.dumps(body).encode() if body is not None else None))
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def notes(sha: str, ci_url: str) -> str:
    h = json.loads((ROOT / "ml/reports/tables/headline.json").read_text())
    f = lambda x: f"{100 * x:.1f}".replace(".", ",")  # noqa: E731
    lo, hi = h["abs_diff_points_ci"]
    return f"""RemediAide 2.0 — submisi penyisihan CAC Machine Learning Solution Challenge 2026 (commit `{sha[:7]}`).

**Angka utama (test, 20% siswa Eedi yang dikunci; `ml/reports/tables/headline.json`)**
- Salah kelompok aturan CRI v1: **{f(h['b0_misgroup'])}%** [{f(h['b0_misgroup_ci'][0])}–{f(h['b0_misgroup_ci'][1])}]
- Salah kelompok RemediAide 2.0: **{f(h['ml_misgroup'])}%** [{f(h['ml_misgroup_ci'][0])}–{f(h['ml_misgroup_ci'][1])}]
- Selisih: **{f(-h['abs_diff_ml_minus_b0'])} poin** [{f(-hi / 100)}–{f(-lo / 100)}], {f(h['rel_reduction'])}% relatif
- Diserahkan ke guru: **{f(h['defer_rate'])}%**; salah kelompok kasus sisanya **{f(h['ml_misgroup_kept'])}%** (aturan v1 pada kasus yang sama {f(h['b0_misgroup_on_kept'])}%)
- Terhadap baseline regresi logistik B1b ({f(h['b1b_misgroup'])}%): lebih baik **{f(-h['cokt_minus_b1b'])} poin**

**Tautan**
- Web: https://remediaide.vercel.app
- Notebook 5 menit (Colab): https://colab.research.google.com/github/{REPO}/blob/main/ml/notebooks/00_demo_cepat.ipynb
- Dataset terbuka MAP-ID: https://www.kaggle.com/datasets/avlsalmoon/remediaide-map-id
- CI: {ci_url}
- Laporan: https://github.com/{REPO}/blob/{sha}/ml/REPORT.md

**Lampiran** `remediaide-cac-penyisihan.zip`: kode pada commit ini (git archive) tanpa `node_modules`, `.venv`, data mentah/olahan,
`.env`, data pilot, dan bobot model turunan Eedi (lisensi CC BY-NC-ND).
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--zip", type=Path)
    ap.add_argument("--ci-url", default=f"https://github.com/{REPO}/actions")
    a = ap.parse_args()
    tok = token()
    st, repo = call("GET", API, tok)
    print(f"repo: HTTP {st}, push={repo.get('permissions', {}).get('push')}")
    if a.check:
        return
    sha = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "origin/main"], capture_output=True, text=True,
                         check=True).stdout.strip()
    st, rel = call("GET", f"{API}/releases/tags/{TAG}", tok)
    body = {"tag_name": TAG, "target_commitish": sha, "name": "v1.0 — submisi penyisihan CAC MLSC 2026",
            "body": notes(sha, a.ci_url), "draft": False, "prerelease": False}
    if st == 200:
        st, rel = call("PATCH", f"{API}/releases/{rel['id']}", tok, {k: v for k, v in body.items() if k != "tag_name"})
    else:
        st, rel = call("POST", f"{API}/releases", tok, body)
    print(f"release: HTTP {st} {rel.get('html_url')}")
    if a.zip and st in (200, 201):
        for asset in rel.get("assets", []):
            if asset["name"] == a.zip.name:
                call("DELETE", f"{API}/releases/assets/{asset['id']}", tok)
        up = rel["upload_url"].split("{")[0] + f"?name={a.zip.name}"
        st2, asset = call("POST", up, tok, data=a.zip.read_bytes(), ctype="application/zip")
        print(f"asset: HTTP {st2} {asset.get('browser_download_url')} ({asset.get('size')} byte)")


if __name__ == "__main__":
    main()
