"""Browser verification for the unit lock policy.

Drives a real lesson page and a real classroom page with no Firebase at all,
because the property under test is exactly what happens when the policy is
absent, arrives late, or never arrives.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8097"
LESSON = "/units/unit-3/what-are-functions.html"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  " + detail if detail else ""))


def lock_screen(page):
    return page.locator(".unit-lock-screen").count() > 0


def lesson_showing(page):
    """Whether the lesson itself is in the document -- not whether it is visible.

    A rule that only hid it would still be found here, which is the point: the
    claim is that the nodes are gone, so that turning CSS off finds nothing.
    """
    return page.evaluate(
        "document.querySelectorAll('.lesson-content, [data-exercise-id]').length > 0")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. A guest on a locked unit sees today's behaviour, with no policy at all.
    page.goto(BASE + LESSON, wait_until="networkidle")
    page.wait_for_timeout(600)
    check("guest on unit 3 sees the sequential lock screen", lock_screen(page))
    check("and none of the lesson with it", not lesson_showing(page))
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
    check("free-roam clears the lock screen without a reload", not lock_screen(page))
    check("and puts the lesson back without one either", lesson_showing(page))

    # 3. Manual mode with this unit shut brings it back.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:policy',
        { detail: { policy: { mode: 'manual', manualUnlocks: [5], assignmentUnlocks: [] } } }))""")
    page.wait_for_timeout(300)
    check("manual mode without unit 3 re-locks it", lock_screen(page))
    check("and takes the lesson away again", not lesson_showing(page))

    # A teacher can close a unit a student already finished. The lock only
    # decides what is reachable; their progress record is untouched. So the
    # screen must not tell them to go and do work they have already done.
    banner = page.locator(".unit-lock-screen").inner_text()
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
    check("an assigned unit is reachable in manual mode", not lock_screen(page))

    # 5. A policy that never resolves must be the sequential answer again.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:policy',
        { detail: { policy: null } }))""")
    page.wait_for_timeout(300)
    check("a null policy falls back to the sequential lock screen", lock_screen(page))

    # 6. A locked unit shows none of the lesson. Absent from the document
    #    rather than styled away, because a student can turn a stylesheet off.
    check("no lesson nodes are left in the document", not lesson_showing(page))
    body_len = page.evaluate("document.querySelector('main').innerText.length")
    check("what is left is the lock screen, not a lesson under it", body_len < 900,
          "main is %d chars" % body_len)
    check("the lesson body is not merely hidden", page.evaluate("""
        Array.from(document.querySelectorAll('main *')).every(function (el) {
          return !/lesson-content|exercise-item|lesson-overview/.test(el.className || '');
        })"""))

    # 6b. The backdrop looks like blurred lesson text and must never be it.
    check("the blurred backdrop is empty of text", page.evaluate(
        "(document.querySelector('.unit-lock-screen__ghost') || {textContent: 'x'})"
        ".textContent.trim() === ''"))
    check("the lock screen leads with a lock glyph",
          page.locator(".unit-lock-screen__badge svg").count() > 0)
    check("and fills the column rather than sitting in it as a strip",
          page.evaluate("document.querySelector('.unit-lock-screen').getBoundingClientRect().height")
          > 400)

    # 7. The title is not the content: a student may still know what is ahead.
    check("the lesson still says which lesson it is",
          page.locator(".lesson-title").count() > 0)
    check("the unit's lesson list is still there to navigate",
          page.locator(".course-sidebar a").count() > 0)

    # 8. A teacher previewing their own class's curriculum sees all of it.
    page.evaluate("sessionStorage.setItem('pypath-role:v2', 'teacher')")
    page.evaluate("document.dispatchEvent(new Event('pypath:role'))")
    page.wait_for_timeout(300)
    check("a teacher is not locked out of their own curriculum", lesson_showing(page))
    check("and gets no lock screen", not lock_screen(page))
    page.evaluate("sessionStorage.removeItem('pypath-role:v2')")

    # 9. The classroom page renders the new sections.
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
    # text_content, not inner_text: the teacher panel is not shown to a signed
    # out visitor, and inner_text on a hidden node is empty.
    access = " ".join(page.locator(".cr-access").text_content().split())
    check("unit access says what a shut unit shows a student",
          "The lesson is not shown to them" in access)
    check("and does not overclaim what that protects",
          "does not put the material beyond reach" in access)
    check("no console errors on classroom.html", not errors, "; ".join(errors[:3]))

    browser.close()

failed = [r for r in results if not r[1]]
print("\n%d checks, %d failed" % (len(results), len(failed)))
raise SystemExit(1 if failed else 0)
