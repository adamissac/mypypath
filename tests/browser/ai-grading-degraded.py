"""Browser verification that the grading endpoint failing costs a learner nothing.

There is no endpoint on a static server, which is exactly the state under test:
offline, blocked, unconfigured and rate-limited all land in the same place, and
that place has to be indistinguishable from the behaviour that shipped before
any of this existed.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  " + detail if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE + "/units/unit-1/what-is-python.html", wait_until="networkidle")
    page.wait_for_timeout(800)

    check("the grading client loaded", page.evaluate("typeof window.PyPathAiGrade"))
    check("it never resolves a failure to a pass", page.evaluate("""
        (async () => {
          const r = await window.PyPathAiGrade.grade({ submission: 'x' }, 'not-a-real-token');
          return r.verdict === 'review';
        })()
    """))
    check("a signed-out reader is not called out for it", page.evaluate("""
        (async () => {
          const r = await window.PyPathAiGrade.grade({ submission: 'x' }, null);
          return r.reason === 'signed-out' && !/error|fail/i.test(r.feedback);
        })()
    """))

    # The whole degradation claim: with no endpoint reachable, a real answer
    # still completes exactly as it did before any of this shipped.
    box = page.locator(".reflection-input").first
    box.fill("Python is interpreted, so it runs my file line by line and I can "
             "just run it without compiling anything first.")
    box.dispatch_event("change")
    page.wait_for_timeout(1500)
    check("a real answer still completes with no endpoint reachable",
          page.locator(".reflection-note").count() == 0)
    check("nothing about the failure reached the learner",
          "review" not in page.locator("main").inner_text().lower())
    check("no uncaught page errors", not errors, "; ".join(errors[:2]))

    browser.close()

failed = [r for r in results if not r[1]]
print("\n%d checks, %d failed" % (len(results), len(failed)))
raise SystemExit(1 if failed else 0)
