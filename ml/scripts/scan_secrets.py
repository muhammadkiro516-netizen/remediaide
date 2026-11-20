"""Scan the whole git history (all refs) and the working tree for secrets. Prints MASKED findings only.

  python scripts/scan_secrets.py            (run from ml/; scans the repository root)
Patterns: GitHub tokens (ghp_/gho_/github_pat_), Neon passwords (npg_), Hugging Face (hf_), OpenAI-style sk-, Kaggle key
JSON, AWS keys, private keys, Postgres URLs with an inline password, AUTH_SECRET/NEXTAUTH_SECRET assignments.
Known placeholders (.env.example / README examples on localhost) are reported as "placeholder" and do not fail.
Exit code 1 if a non-placeholder finding exists.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "github_token": r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}",
    "neon_password": r"\bnpg_[A-Za-z0-9]{8,}",
    "huggingface_token": r"\bhf_[A-Za-z0-9]{30,}",
    "sk_key": r"\bsk-[A-Za-z0-9_-]{30,}",
    "kaggle_key_json": r"\"key\"\s*:\s*\"[a-f0-9]{32}\"",
    "aws_key": r"\bAKIA[0-9A-Z]{16}\b",
    "private_key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "postgres_url_with_password": r"postgres(?:ql)?://[^\s:'\"`/]+:[^\s@'\"`]+@[^\s'\"`]+",
    "auth_secret": r"\b(?:NEXT)?AUTH_SECRET\s*[=:]\s*['\"]?[A-Za-z0-9+/=_-]{8,}",
}
PLACEHOLDER = re.compile(r"localhost|127\.0\.0\.1|ganti-dengan|your-|example|changeme|user:password|postgres:dev", re.I)


def mask(s: str) -> str:
    s = re.sub(r"(://[^:]+:)[^@]+@", r"\1***@", s)
    return re.sub(r"([A-Za-z_]{2,12}[_-])[A-Za-z0-9_+/=-]{6,}", r"\1***", s)[:160]


def scan(text: str, where: str) -> list[tuple[str, str, str, bool]]:
    out = []
    for line in text.splitlines():
        for name, pat in PATTERNS.items():
            for m in re.finditer(pat, line):
                out.append((where, name, mask(m.group(0)), bool(PLACEHOLDER.search(line))))
    return out


def scan_zip(path: str) -> int:
    """Scan every text file inside a release zip (scripts/build_release_zip.py)."""
    import zipfile

    findings = []
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            data = z.read(n)
            if len(data) < 5_000_000:
                findings += scan(data.decode("utf-8", errors="replace"), f"zip {n}")
    real = [f for f in findings if not f[3]]
    print(f"zip files scanned: {len(z.namelist())}; findings: {len(findings)} (placeholder {len(findings) - len(real)}, real {len(real)})")
    for w, n, v, ph in sorted(set(findings)):
        print(f"  [{'placeholder' if ph else 'REAL'}] {n:28s} {w:40s} {v}")
    return 1 if real else 0


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--zip":
        return scan_zip(sys.argv[2])
    git = ["git", "-C", str(ROOT)]
    commits = subprocess.run(git + ["rev-list", "--all"], capture_output=True, text=True, check=True).stdout.split()
    findings = []
    for c in commits:
        diff = subprocess.run(git + ["show", "--no-color", "--format=", c], capture_output=True, text=True,
                              errors="replace").stdout
        findings += scan(diff, f"commit {c[:7]}")
    tracked = subprocess.run(git + ["ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
    for f in tracked:
        p = ROOT / f
        if p.is_file() and p.stat().st_size < 5_000_000:
            findings += scan(p.read_text(errors="replace"), f"worktree {f}")
    real = [f for f in findings if not f[3]]
    print(f"commits scanned: {len(commits)}; tracked files scanned: {len(tracked)}")
    print(f"findings: {len(findings)} (placeholder {len(findings) - len(real)}, real {len(real)})")
    for w, n, v, ph in sorted(set(findings)):
        print(f"  [{'placeholder' if ph else 'REAL'}] {n:28s} {w:40s} {v}")
    return 1 if real else 0


if __name__ == "__main__":
    sys.exit(main())
