"""Browser verification for the unit lock policy.

Drives a real lesson page and a real classroom page with no Firebase at all,
because the property under test is exactly what happens when the policy is
absent, arrives late, or never arrives.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
LESSON = "/units/unit-3/what-are-functions.html"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  " + detail if detail else ""))


def notice(page):
    return page.locator(".unit-locked-notice").count() > 0


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. A guest on a locked unit sees today's behaviour, with no policy at all.
    page.goto(BASE + LESSON, wait_until="networkidle")
    page.wait_for_timeout(600)
    check("guest on unit 3 sees the sequential lock notice", notice(page))
    check("classroom-policy.js is loaded on a lesson page",
          page.evaluate("typeof window.PyPathPolicy === 'object'"))
    # assets/data/checks only covers units 1 and 2, so every unit-3 lesson
    # 404s on its checks file. That predates this work and is not what is
    # under test here.
    ours = [e for e in errors if "404" not in e]
    check("no console errors on a lesson page as a guest",
          not ours, "; ".join(ours[:3]))

    # 2. Free-roam arriving late clears the notice, with no reload.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:policy',
        { detail: { policy: { mode: 'free', manualUnlocks: [], assignmentUnlocks: [] } } }))""")
    page.wait_for_timeout(300)
    check("free-roam clears the notice without a reload", not notice(page))

    # 3. Manual mode with this unit shut brings it back.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:policy',
        { detail: { policy: { mode: 'manual', manualUnlocks: [5], assignmentUnlocks: [] } } }))""")
    page.wait_for_timeout(300)
    check("manual mode without unit 3 re-locks it", notice(page))

    # A teacher can close a unit a student already finished. The lock only
    # decides what is browseable; their progress record is untouched. So the
    # banner must not tell them to go and do work they have already done.
    banner = page.locator(".unit-locked-notice").inner_text()
    check("a teacher-set lock does not claim the work is unfinished",
          "Finish every lesson" not in banner, banner[:70])
    check("it says whose decision it was",
          "teacher" in banner.lower(), banner[:70])
    check("it says their finished work still stands",
          "already finished" in banner.lower(), banner[:70])

    # 4. An assignment on unit 3 opens it even in manual mode. This is the one
    #    failure the feature must not have: late for work you could not open.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:policy',
        { detail: { policy: { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [3] } } }))""")
    page.wait_for_timeout(300)
    check("an assigned unit is reachable in manual mode", not notice(page))

    # 5. A policy that never resolves must be the sequential answer again.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:policy',
        { detail: { policy: null } }))""")
    page.wait_for_timeout(300)
    check("a null policy falls back to the sequential notice", notice(page))

    # 6. The lesson is never removed. A late-arriving lock is a banner, not a
    #    wall, which is why no timeout guards the read.
    body_len = page.evaluate("document.querySelector('main').innerText.length")
    check("the lesson text stays readable behind the notice", body_len > 500,
          "main is %d chars" % body_len)

    # 7. The classroom page renders the new sections.
    errors.clear()
    page.goto(BASE + "/classroom.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    for sel, label in [(".cr-assign", "assignments section"),
                       (".cr-access", "unit access section"),
                       ("[data-cr-assign-form]", "assignment builder"),
                       ("input[name='cr-lock-mode'][value='manual']", "by-hand mode radio"),
                       ("input[name='cr-scope'][value='assignment']", "assignment grid lens"),
                       ("[data-sd-assign]", "assigned block on student detail")]:
        check("classroom.html has the " + label, page.locator(sel).count() > 0)
    check("no console errors on classroom.html", not errors, "; ".join(errors[:3]))

    browser.close()

failed = [r for r in results if not r[1]]
print("\n%d checks, %d failed" % (len(results), len(failed)))
raise SystemExit(1 if failed else 0)
