"""Check whether an email/password can sign in on a RemediAide deployment (NextAuth credentials), without printing it.

  LOGIN_PASSWORD=... python3 scripts/check_login.py https://remediaide.vercel.app guru@remediaide.app
Prints OK (session cookie issued) or GAGAL. The password is read from the environment only.
"""

import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request


def can_login(base: str, email: str, password: str) -> bool:
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", "remediaide-login-check")]
    csrf = json.load(op.open(f"{base}/api/auth/csrf", timeout=30))["csrfToken"]
    data = urllib.parse.urlencode({"csrfToken": csrf, "email": email, "password": password, "json": "true",
                                   "callbackUrl": f"{base}/dashboard"}).encode()
    req = urllib.request.Request(f"{base}/api/auth/callback/credentials", data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        op.open(req, timeout=30)
    except urllib.error.HTTPError:
        pass
    return any("session-token" in c.name for c in jar)


if __name__ == "__main__":
    base, email = sys.argv[1].rstrip("/"), sys.argv[2]
    ok = can_login(base, email, os.environ["LOGIN_PASSWORD"])
    print(f"{email}: {'OK' if ok else 'GAGAL'}")
