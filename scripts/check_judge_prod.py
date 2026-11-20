"""Production checks for the judge account and the demo class (butir 2/8). Password from env JUDGE_PASSWORD only.

  JUDGE_PASSWORD=... python3 scripts/check_judge_prod.py https://remediaide.vercel.app [PIN]
"""

import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request


def main():
    base = sys.argv[1].rstrip("/")
    pin = sys.argv[2] if len(sys.argv) > 2 else "826730"
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", "remediaide-judge-check")]

    def req(method, path, body=None, form=False):
        data = None
        headers = {}
        if body is not None:
            data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        r = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
        try:
            with op.open(r, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    csrf = json.loads(req("GET", "/api/auth/csrf")[1])["csrfToken"]
    req("POST", "/api/auth/callback/credentials", {"csrfToken": csrf, "email": "juri@remediaide.id",
                                                    "password": os.environ["JUDGE_PASSWORD"], "json": "true"}, form=True)
    logged = any("session-token" in c.name for c in jar)
    print("login juri:", "OK" if logged else "GAGAL")
    st, body = req("GET", "/api/auth/session")
    print("sesi isJudge:", json.loads(body or b"{}").get("isJudge"))
    for method, path, want in [("GET", "/api/classes", 200), ("GET", "/api/sessions/demo-session-hasil/ml", 200),
                               ("POST", "/api/classes", 403), ("DELETE", "/api/sessions/demo-session-hasil", 403),
                               ("POST", "/api/sessions/demo-session-hasil/groups", 403),
                               ("GET", "/api/sessions/demo-session-hasil/export/csv", 403),
                               ("GET", "/api/sessions/demo-session-hasil/export/research", 403)]:
        st, body = req(method, path, {} if method != "GET" else None)
        extra = ""
        if path.endswith("/ml") and st == 200:
            j = json.loads(body)
            d = j.get("data", j)
            extra = f" available={d.get('available')} model={d.get('modelVersion') or d.get('model_version')}"
        print(f"{method} {path}: {st} ({'sesuai' if st == want else 'TIDAK SESUAI, harap ' + str(want)}){extra}")
    st, body = urllib.request.urlopen(urllib.request.Request(f"{base}/api/student/join", data=json.dumps({"pinCode": pin}).encode(),
                                                              headers={"Content-Type": "application/json"}), timeout=60).status, b""
    print(f"PIN {pin} /api/student/join: {st}")


if __name__ == "__main__":
    main()
