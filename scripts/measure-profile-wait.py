"""How long does the authoritative profile read actually take?

WHY THIS EXISTS

assets/js/profile.js waits up to SERVER_WAIT_MS for a users/{uid} snapshot the
server has confirmed, and that constant is currently 20000. Its comment is
unusually honest about why: 47533a6 used 4000, a four-tab contended load
regularly took longer than that, and the deadline then rejected a read that was
still making progress -- 0 of 32 cold tabs rendered the dashboard, every one
reporting "Could not reach your account record" on a working connection. So the
number was raised to a ceiling nobody could defend on measurement, because the
measurements were bimodal: 0.2s or 20s+, with nothing in between.

That bimodality had a cause. Under the old single-tab cache configuration every
tab past the first ran on a memory-only cache after failing to take the
persistence lock, and the profile read on those tabs was racing a merge write
into an empty cache. Fixing the cache configuration (see firebase-config.js)
should collapse the distribution. This script is how that claim gets checked
rather than assumed.

WHAT IT MEASURES

The real read, not a synthetic one. An init script runs at document start --
before any of the page's own modules -- and calls loadProfile(uid) without
`force`, so it becomes the single in-flight read that the page's own callers
then share. The number reported is therefore the wait the page actually did,
not an extra read added alongside it.

Each trial is a genuinely cold tab in a context that already has a signed-in
tab open, so the contention the old configuration failed under is still present.

    npx firebase emulators:exec --only firestore,auth \
        "python3 scripts/measure-profile-wait.py"

    TRIALS=20 python3 scripts/measure-profile-wait.py   # against a live emulator
"""

import json
import sys
import threading
import urllib.request
import urllib.error
import http.server
import socketserver
import functools
import os
import statistics

SITE = os.environ.get("PYPATH_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = int(os.environ.get("PORT", "8080"))
AUTH = "http://127.0.0.1:9099"
FS = "http://127.0.0.1:8081"
PROJECT = "mypypath"
EMAIL = "profilewait@example.com"
PASSWORD = "test-password-123"
TRIALS = int(os.environ.get("TRIALS", "12"))

# Optional network emulation, because the emulator is on localhost and a
# localhost measurement cannot tell you what to set a network deadline to. The
# numbers are Chrome DevTools' own "Slow 3G" preset: 400ms round trip, 400kbps
# down, 400kbps up. SLOW=1 turns it on.
SLOW = os.environ.get("SLOW") == "1"
SLOW_3G = {
    "offline": False,
    "latency": 400,
    "downloadThroughput": 400 * 1024 / 8,
    "uploadThroughput": 400 * 1024 / 8,
}

# Started at document start, before the page's own modules. Calling loadProfile
# without `force` means this becomes the shared in-flight read rather than a
# second one, so the measurement is of the page's own wait.
INIT_SCRIPT = """
window.__profileWait = (async () => {
  const t0 = performance.now();
  const cfg = await import('/assets/js/firebase-config.js');
  const authSdk = await import(
    `https://www.gstatic.com/firebasejs/${cfg.SDK_VERSION}/firebase-auth.js`
  );
  const uid = await new Promise((resolve) => {
    const stop = authSdk.onAuthStateChanged(cfg.auth, (u) => {
      if (u) { stop(); resolve(u.uid); }
    });
  });
  const tAuth = performance.now();
  const { loadProfile } = await import('/assets/js/profile.js');
  try {
    const p = await loadProfile(uid);
    return { ok: true, auth: tAuth - t0, read: performance.now() - tAuth,
             role: p.role || null };
  } catch (e) {
    return { ok: false, auth: tAuth - t0, read: performance.now() - tAuth,
             error: String(e && e.message) };
  }
})();
"""


def post(url, body, owner=False):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if owner:
        req.add_header("Authorization", "Bearer owner")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode() or "{}")


def patch(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PATCH")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer owner")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode() or "{}")


def seed_teacher():
    try:
        out = post(
            f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
            {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True},
        )
    except urllib.error.HTTPError:
        out = post(
            f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
            {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True},
        )
    uid = out["localId"]
    post(
        f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:update",
        {"localId": uid, "emailVerified": True},
        owner=True,
    )
    patch(
        f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents/users/{uid}",
        {
            "fields": {
                "role": {"stringValue": "teacher"},
                "displayName": {"stringValue": "A Teacher"},
                "classIds": {"arrayValue": {"values": [{"stringValue": "waitClass"}]}},
            }
        },
    )
    patch(
        f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents/classes/waitClass",
        {
            "fields": {
                "name": {"stringValue": "Period 1"},
                "joinCode": {"stringValue": "ABC234"},
                "teacherUids": {"arrayValue": {"values": [{"stringValue": uid}]}},
                "archived": {"booleanValue": False},
                "createdAt": {"timestampValue": "2026-01-01T00:00:00Z"},
                "schemaVersion": {"integerValue": "1"},
            }
        },
    )
    return uid


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def percentile(values, q):
    """Nearest-rank, because these samples are few and a linear interpolation
    would invent a number no trial produced."""
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, int(round(q * (len(ordered) - 1)))))
    return ordered[k]


def run():
    from playwright.sync_api import sync_playwright

    uid = seed_teacher()
    print(f"seeded teacher uid={uid}")
    httpd = serve()
    reads = []
    failures = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        ctx.add_init_script(INIT_SCRIPT)

        signin = ctx.new_page()
        signin.goto(f"http://localhost:{PORT}/login.html")
        signin.wait_for_load_state("networkidle")
        signin.fill("#login-email", EMAIL)
        signin.fill("#login-password", PASSWORD)
        signin.click("#login-form button[type=submit]")
        signin.wait_for_selector("[data-account-avatar]:not([hidden])", timeout=20000)
        print("signed in; that tab stays open for the whole run and keeps contending")
        print()

        for trial in range(1, TRIALS + 1):
            page = ctx.new_page()
            if SLOW:
                # Applied per page, after the sign-in tab has already signed
                # in: throttling the sign-in would measure the login form
                # rather than the profile read.
                cdp = ctx.new_cdp_session(page)
                cdp.send("Network.enable")
                cdp.send("Network.emulateNetworkConditions", SLOW_3G)
            page.goto(f"http://localhost:{PORT}/classroom.html", wait_until="domcontentloaded")
            # The cap is in JS rather than in Playwright's evaluate(), which
            # takes no timeout. 25s is longer than SERVER_WAIT_MS, so a read
            # that gives up at its own deadline is recorded as the ~20s sample
            # it is rather than vanishing from the distribution.
            result = page.evaluate(
                """Promise.race([
                     window.__profileWait,
                     new Promise((r) => setTimeout(
                       () => r({ ok: false, auth: 0, read: 25000,
                                 error: 'harness cap: no answer in 25s' }), 25000)),
                   ])"""
            )
            if result.get("ok"):
                reads.append(result["read"])
                print(
                    f"  trial {trial:2d}  auth {result['auth']:7.1f}ms"
                    f"  read {result['read']:8.1f}ms  role={result['role']}"
                )
            else:
                failures.append(f"trial {trial}: {result.get('error')}")
                print(f"  trial {trial:2d}  FAILED after {result['read']:.1f}ms: {result.get('error')}")
            page.close()

        browser.close()

    httpd.shutdown()

    print()
    if not reads:
        print("no successful reads; nothing to report")
        return 1

    label = "Slow 3G (400ms RTT, 400kbps)" if SLOW else "unthrottled localhost"
    print(f"authoritative profile read, {len(reads)} cold tabs against a signed-in tab")
    print(f"  network: {label}")
    print(f"  min    {min(reads):8.1f} ms")
    print(f"  median {statistics.median(reads):8.1f} ms")
    print(f"  p95    {percentile(reads, 0.95):8.1f} ms")
    print(f"  max    {max(reads):8.1f} ms")
    slow = [r for r in reads if r > 4000]
    print(f"  over 4000ms (the old deadline): {len(slow)} of {len(reads)}")
    for f in failures:
        print("  -", f)
    return 0


if __name__ == "__main__":
    sys.exit(run())
