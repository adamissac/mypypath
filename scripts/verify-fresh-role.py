"""Does a genuine teacher land on the teacher view on a genuinely cold load?

The reported bug is a race that a reload hides, so the whole test is about
starting cold. Two things make a load cold here:

  * a brand new browser context, whose IndexedDB persistence cache is empty;
  * a SECOND TAB in that context, which cannot take the persistence lock and
    falls back to an empty in-memory cache -- the "Failed to obtain exclusive
    access to the persistence layer" warning seen while reproducing this.

The second is the reliable trigger, because sync.js's identity merge write then
lands in an empty cache and synthesizes a users/{uid} document with no role on
it, which is exactly what readProfile used to answer with.

Kept because it is the only check that can make this claim: the bug was
invisible to every unit test in the repo, and the fix is a timing property of
the Firestore SDK that only a real browser talking to a real emulator exercises.
Confirmed to catch the bug by reverting the fix and re-running -- it reported
"This page is for teacher accounts" and "Student account" on the two pages.

Needs Java (for the Firestore emulator) and the Python Playwright package.

    npx firebase emulators:exec --only firestore,auth \
        "python3 scripts/verify-fresh-role.py"
"""

import json
import sys
import threading
import urllib.request
import http.server
import socketserver
import functools
import os

SITE = os.environ.get("PYPATH_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 8080
AUTH = "http://127.0.0.1:9099"
FS = "http://127.0.0.1:8081"
PROJECT = "mypypath"
EMAIL = "teacher@example.com"
TRIALS = int(os.environ.get("TRIALS", "5"))
PASSWORD = "test-password-123"


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
    """A real Auth account with a real users/{uid} saying role: teacher."""
    out = post(
        f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
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
                "classIds": {"arrayValue": {"values": [{"stringValue": "seededClass"}]}},
            }
        },
    )
    patch(
        f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents/classes/seededClass",
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


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run():
    from playwright.sync_api import sync_playwright

    uid = seed_teacher()
    print(f"seeded teacher uid={uid}")
    httpd = serve()
    failures = []
    warnings = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # One context, so the sign-in is shared; the persistence lock is not.
        ctx = browser.new_context()

        first = ctx.new_page()
        first.goto(f"http://localhost:{PORT}/login.html")
        first.wait_for_load_state("networkidle")
        first.fill("#login-email", EMAIL)
        first.fill("#login-password", PASSWORD)
        first.click("#login-form button[type=submit]")
        # Signed in when the header stops offering to sign in.
        first.wait_for_selector("[data-account-avatar]:not([hidden])", timeout=20000)
        print("signed in on tab 1; persistence lock is held by this tab")

        def cold_tab(path):
            """A second tab: empty memory cache, no reload, no warm-up."""
            page = ctx.new_page()
            msgs = []
            page.on("console", lambda m: msgs.append(m.text))
            # Not networkidle: the dashboard opens a live roster listener that
            # never goes quiet, so the page is never "idle" by that measure.
            page.goto(f"http://localhost:{PORT}{path}", wait_until="domcontentloaded")
            # Long enough for the role check to settle, short enough that a
            # test that only passes after a reload still fails.
            page.wait_for_timeout(6000)
            for m in msgs:
                if "exclusive access to the persistence layer" in m:
                    warnings.append(path)
            return page

        # Repeated, because one pass proves very little about a race. Each
        # trial is a genuinely new tab; the signed-in tab above stays open and
        # keeps the persistence lock, which is what forces the memory-cache
        # fallback the original report showed in its console.
        for trial in range(1, TRIALS + 1):
            page = cold_tab("/classroom.html")
            shown = page.locator('[data-class-state="not-teacher"]').is_visible()
            err = page.locator('[data-class-state="error"]').is_visible()
            root = page.locator("[data-cr-root]").is_visible()
            print(f"  trial {trial} /classroom.html  dashboard={root} not-teacher={shown} error={err}")
            if shown:
                failures.append(f'trial {trial}: /classroom.html said "not a teacher"')
            if err:
                failures.append(f"trial {trial}: /classroom.html could not read the account")
            if not root:
                failures.append(f"trial {trial}: /classroom.html did not render the dashboard")
            page.close()

            page = cold_tab("/account.html")
            badge = page.locator("[data-class-role-badge]")
            text = badge.inner_text().strip() if badge.count() else "(missing)"
            print(f"  trial {trial} /account.html     badge={text!r}")
            if text != "Teacher account":
                failures.append(f"trial {trial}: /account.html said {text!r}")
            page.close()

        browser.close()

    httpd.shutdown()

    print()
    print(f"persistence-lock fallback observed on {len(warnings)} of {TRIALS * 2} cold tabs")
    if failures:
        print("FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print(f"PASS: {TRIALS} trials, every cold tab rendered the teacher view on both pages")
    return 0


if __name__ == "__main__":
    sys.exit(run())
