"""Do three cold tabs all keep real persistence, or does the SDK fall back?

THE REGRESSION THIS GUARDS

firebase-config.js used to call persistentLocalCache() with no options. That is
single-tab persistence -- the SDK's own bundle resolves the missing tabManager
to persistentSingleTabManager(void 0) -- so the first tab took an exclusive
IndexedDB lock and every other tab failed to take it, logged

    failed-precondition: Failed to obtain exclusive access to the persistence layer

and silently ran on a memory-only cache for its whole life. An empty cache is
the precondition behind "a real teacher is told they are a student"; see the
header of assets/js/profile.js for the full mechanism.

The warning was in the console on essentially every page for weeks and was read
as ambient noise. It was not noise. This script exists so that nobody has to
make that judgement call again: the console is asserted clean, and a failure
here is a real regression rather than something to squint at.

WHY IT HAS TO BE A BROWSER

The unit test (tests/firebase-cache-config.test.js) reads the source and checks
a tabManager is passed. That catches the obvious revert and nothing else. Only
a real browser against a real emulator can show whether the SDK actually
granted persistence to all three tabs, because the fallback is a runtime
decision made inside the SDK about an IndexedDB lock.

WHY THREE TABS AND NOT TWO

Two proves the lock is shareable. Three is the shape a teacher actually has
open -- the dashboard, a lesson they are checking, and the class list -- and it
is the shape that produced the original report. The tabs stay open together
rather than being opened and closed in turn, because the fallback is caused by
CONTENTION, and a tab that is already closed is not contending.

Needs Java (for the Firestore emulator) and the Python Playwright package.

    npx firebase emulators:exec --only firestore,auth \
        "python3 scripts/verify-multi-tab-cache.py"
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

SITE = os.environ.get("PYPATH_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = int(os.environ.get("PORT", "8080"))
AUTH = "http://127.0.0.1:9099"
FS = "http://127.0.0.1:8081"
PROJECT = "mypypath"
EMAIL = "multitab@example.com"
PASSWORD = "test-password-123"

# The pages a teacher actually has open at once. Deliberately a mix: the
# dashboard holds a live listener, a lesson page runs the progress sync, and
# the account page reads the profile. All three touch Firestore on boot, which
# is what makes them contend for the cache in the first place.
PAGES = [
    "/classroom.html",
    "/units/unit-1/what-is-python.html",
    "/account.html",
]

# Substrings of the SDK's own fallback message. Both are checked because the
# wording is the SDK's to change and the code is the stable half.
FALLBACK_MARKERS = (
    "exclusive access to the persistence layer",
    "Falling back to memory cache",
    "failed-precondition",
)


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


def seed_account():
    """A signed-in account, because the cache is only exercised once something
    is actually reading and writing Firestore. A teacher rather than a student
    so that /classroom.html renders its dashboard and opens the live roster
    listener, which is the busiest of the three pages."""
    try:
        out = post(
            f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
            {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True},
        )
    except urllib.error.HTTPError:
        # Re-runnable against an emulator that is already up and already holds
        # this account, which is the common case when iterating. Signing in is
        # the same seed as signing up, minus the account creation.
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
                "classIds": {"arrayValue": {"values": [{"stringValue": "multiTabClass"}]}},
            }
        },
    )
    patch(
        f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents/classes/multiTabClass",
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
    """The site is ~40 script tags a page and three pages; the request log
    buries the one line this script is actually reporting."""

    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run():
    from playwright.sync_api import sync_playwright

    uid = seed_account()
    print(f"seeded account uid={uid}")
    httpd = serve()
    offences = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # One context: the tabs share an origin and therefore share the
        # IndexedDB the persistence lock is taken on. A separate context per
        # tab would sidestep the whole contention this script is about.
        ctx = browser.new_context()

        signin = ctx.new_page()
        signin.goto(f"http://localhost:{PORT}/login.html")
        signin.wait_for_load_state("networkidle")
        signin.fill("#login-email", EMAIL)
        signin.fill("#login-password", PASSWORD)
        signin.click("#login-form button[type=submit]")
        signin.wait_for_selector("[data-account-avatar]:not([hidden])", timeout=20000)
        print("signed in; the sign-in tab stays open and keeps contending")

        pages = []
        logs = {}
        # Opened in one pass and left open. Under the old configuration the
        # first of these took the lock (or lost it to the sign-in tab) and the
        # rest fell back; the fallback is a property of tabs being open AT THE
        # SAME TIME.
        for path in PAGES:
            page = ctx.new_page()
            logs[path] = []
            page.on(
                "console",
                lambda m, path=path: logs[path].append(m.text),
            )
            # Not networkidle: /classroom.html opens a live roster listener
            # that never goes quiet, so it is never idle by that measure.
            page.goto(f"http://localhost:{PORT}{path}", wait_until="domcontentloaded")
            pages.append(page)

        print(f"{len(pages)} pages open at once, plus the sign-in tab")

        # Long enough for every boot path to have configured its cache and for
        # the SDK to have logged the fallback if it was going to.
        pages[-1].wait_for_timeout(8000)

        for path in PAGES:
            hits = [m for m in logs[path] if any(k in m for k in FALLBACK_MARKERS)]
            status = "clean" if not hits else f"{len(hits)} fallback message(s)"
            print(f"  {path:45s} {status}")
            for h in hits:
                offences.append(f"{path}: {h}")

        for page in pages:
            page.close()
        browser.close()

    httpd.shutdown()

    print()
    if offences:
        print("FAIL: the cache fell back to memory in at least one tab")
        for o in offences:
            print("  -", o)
        print()
        print("This is not background noise. A tab on a memory-only cache is the")
        print("precondition behind the role-read bug documented in profile.js.")
        print("Check that firebase-config.js still passes a tabManager.")
        return 1
    print(f"PASS: {len(PAGES)} tabs open together, no persistence fallback in any of them")
    return 0


if __name__ == "__main__":
    sys.exit(run())
