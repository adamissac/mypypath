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
    return 0


if __name__ == "__main__":
    sys.exit(run())
