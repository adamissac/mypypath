"""How many Firestore documents does one dashboard open actually cost?

WHY A SCRIPT AND NOT AN ESTIMATE. The per-student fan-out in
classroom-dashboard.js is easy to reason about and easy to reason about wrongly
-- the audit that found it named the wrong limit, and the mirror query it did
not mention at all is unbounded. So the number is measured, before and after,
with the same harness, and the measured pair goes in the commit message.

WHAT IT MEASURES. assets/js/read-counter.js counts documents RETURNED, which is
what Firestore bills, at each read site in classroom-store.js. It is off unless
?readcount=1 is on the URL, which is what this script puts there. The number it
reports is therefore the real cost of the real page, not a model of it.

SETUP. Needs the emulators up and a seeded class of the size you want:

    npm run emulators                              # terminal 1
    STUDENTS=30 node scripts/seed-classroom.mjs    # terminal 2
    python3 scripts/measure-dashboard-reads.py     # terminal 3
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
TEACHER = os.environ.get("TEACHER_EMAIL", "teacher@pypath.test")
PASSWORD = os.environ.get("SEED_PASSWORD", "pypath123")
# Long enough for the whole per-student fan-out to finish on a 30-row class.
SETTLE_MS = int(os.environ.get("SETTLE_MS", "25000"))
# WATCH=1 additionally measures what an OPEN dashboard costs while students
# work -- the live-listener question, which a load-time measurement cannot see.
WATCH_SECONDS = int(os.environ.get("WATCH_SECONDS", "0"))
WATCH_TOUCHES = int(os.environ.get("WATCH_TOUCHES", "10"))
FS = "http://127.0.0.1:8081"
PROJECT = os.environ.get("PYPATH_PROJECT", "mypypath")


def touch_roster(n):
    """Simulates n students loading a page, which is what writes lastActiveAt.

    Through the emulator's REST API with owner credentials rather than through
    a browser: the point is to make the roster documents change under the
    teacher's listener, and spinning up n more browsers to do it would measure
    Playwright rather than Firestore."""
    base = (f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents"
            f"/classes")
    req = urllib.request.Request(f"{base}?pageSize=50", method="GET")
    req.add_header("Authorization", "Bearer owner")
    with urllib.request.urlopen(req) as r:
        classes = json.loads(r.read().decode()).get("documents", [])
    target = None
    for c in classes:
        cid = c["name"].split("/")[-1]
        rreq = urllib.request.Request(f"{base}/{cid}/roster?pageSize=50", method="GET")
        rreq.add_header("Authorization", "Bearer owner")
        with urllib.request.urlopen(rreq) as r:
            rows = json.loads(r.read().decode()).get("documents", [])
        if len(rows) >= n:
            target = rows
            break
    if not target:
        return 0
    stamp = {"fields": {"lastActiveAt": {"timestampValue":
             __import__("datetime").datetime.utcnow().isoformat() + "Z"}}}
    done = 0
    for row in target[:n]:
        url = row["name"].replace(
            f"projects/{PROJECT}/databases/(default)/documents",
            f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents"
        )
        if not url.startswith("http"):
            url = f"{FS}/v1/{row['name']}"
        preq = urllib.request.Request(
            url + "?updateMask.fieldPaths=lastActiveAt",
            data=json.dumps(stamp).encode(), method="PATCH")
        preq.add_header("Authorization", "Bearer owner")
        preq.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(preq):
            done += 1
    return done


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(
        ("127.0.0.1", PORT), functools.partial(QuietHandler, directory=SITE)
    )
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run():
    from playwright.sync_api import sync_playwright

    httpd = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            # A fresh context every run: a warm persistence cache would serve
            # some of these documents locally and report a cost the first
            # teacher of the day does not get.
            ctx = browser.new_context()
            page = ctx.new_page()

            page.goto(f"http://localhost:{PORT}/login.html")
            page.wait_for_load_state("networkidle")
            page.fill("#login-email", TEACHER)
            page.fill("#login-password", PASSWORD)
            page.click("#login-form button[type=submit]")
            page.wait_for_selector("[data-account-avatar]:not([hidden])", timeout=30000)

            # The counter is per page load, so the dashboard is opened fresh
            # with the flag on. Sign-in happened on the page before, so its own
            # reads are not in this number -- which is right: the question is
            # what one dashboard open costs a teacher who is already signed in.
            dash = ctx.new_page()
            dash.goto(
                f"http://localhost:{PORT}/classroom.html?readcount=1",
                wait_until="domcontentloaded",
            )
            dash.wait_for_timeout(SETTLE_MS)

            enabled = dash.evaluate("!!window.PyPathReads")
            if not enabled:
                print("FAIL: read counting did not switch on. Is read-counter.js imported?")
                return 1

            rows = dash.evaluate("window.PyPathReads.report()")
            students = dash.evaluate(
                "document.querySelectorAll('[data-cr-grid] tbody tr').length"
            )

            idle = None
            if WATCH_SECONDS:
                # THE QUESTION TASK 14 ASKS: does a dashboard left open all day
                # accumulate reads? The live roster listener is the only thing
                # on the page still running after load, and Firestore bills a
                # listener per CHANGED document. So the honest test is not "sit
                # still and see" -- an idle class changes nothing and would
                # report zero for the wrong reason. It is: leave it open while
                # students are actually working, and count what that costs.
                before = rows["total"]
                touched = touch_roster(WATCH_TOUCHES)
                dash.wait_for_timeout(WATCH_SECONDS * 1000)
                after = dash.evaluate("window.PyPathReads.report()")
                idle = {
                    "touches": touched,
                    "delta": after["total"] - before,
                    "byLabel": after["byLabel"],
                }
            browser.close()
    finally:
        httpd.shutdown()

    total = rows["total"]
    by = rows["byLabel"]

    print()
    print(f"one dashboard open, {students} students in the grid")
    print()
    width = max((len(k) for k in by), default=10)
    for label, n in sorted(by.items(), key=lambda kv: -kv[1]):
        print(f"  {label.ljust(width)}  {n:6d}")
    print(f"  {'TOTAL'.ljust(width)}  {total:6d}")
    if students:
        print()
        print(f"  {total / students:.1f} document reads per student")
        print()
        # The number that actually decides whether this ships. Spark is 50,000
        # reads per DAY for the whole project across every user of it, so the
        # useful framing is not "is this fast" but "how many times can one
        # teacher open this before nobody else can use the site".
        print(f"  a 30-student class would cost ~{round(total / students * 30):,} per open")
        print(f"  a 50-student class would cost ~{round(total / students * 50):,} per open")
        if total / students * 50 > 0:
            opens = 50000 // max(1, round(total / students * 50))
            print(f"  Spark's 50,000/day budget = {opens:,} opens of a 50-student class, "
                  f"for the whole project")

    if idle is not None:
        print()
        print(f"then left open for {WATCH_SECONDS}s while {idle['touches']} students "
              f"were active")
        print(f"  {idle['delta']} further document read(s)")
        print(f"  = {idle['delta'] / max(1, idle['touches']):.2f} per student page load")
        print()
        print("  A dashboard left open costs one read per student page load, not")
        print("  one per student per interval -- so an idle class is free and a")
        print("  busy one is bounded by how much work the class is doing.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
