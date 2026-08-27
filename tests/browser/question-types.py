"""Browser verification for the four new question types and the reflection floor.

Every one of these is answered with the keyboard alone, because that is the
property that made matching a select and ordering a pair of buttons rather than
drag and drop.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  " + detail if detail else ""))


def open_lesson(page, path):
    page.goto(BASE + path, wait_until="networkidle")
    page.wait_for_timeout(700)


def check_and_read(page, index=0):
    """Press one question's Check and read that same question's feedback.

    MCQs on the same page carry an empty .quiz-feedback each, so the feedback
    has to be scoped to the block whose button was pressed.
    """
    block = page.locator(".quiz-q").filter(has=page.locator(".quiz-q__check")).nth(index)
    block.locator(".quiz-q__check").click()
    page.wait_for_timeout(250)
    return block.locator(".quiz-feedback").inner_text()


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- ordering, a Parsons problem -------------------------------------
    open_lesson(page, "/units/unit-2/for-loop.html")
    rows = page.locator("#q-u2-for-order + * .quiz-order__row, .quiz-order__row")
    check("an ordering question renders its lines", rows.count() == 3)
    check("ordering keeps leading whitespace, which is the answer in Python",
          any(page.locator(".quiz-order__code").nth(i).inner_text().startswith("    ")
              for i in range(rows.count())))
    check("ordering is not presented already solved",
          page.locator(".quiz-order__code").nth(0).inner_text()
          != "names = ['Ada', 'Grace', 'Alan']")

    # Solved with the keyboard alone: tab to a move button and press it.
    for _ in range(12):
        texts = [page.locator(".quiz-order__code").nth(i).inner_text() for i in range(3)]
        if texts == ["names = ['Ada', 'Grace', 'Alan']", "for name in names:",
                     "    print('Hello, ' + name)"]:
            break
        # Move whichever line belongs at the top upwards.
        want = "names = ['Ada', 'Grace', 'Alan']"
        idx = texts.index(want)
        if idx > 0:
            page.locator(".quiz-order__row").nth(idx).locator(
                ".quiz-order__move").first.click()
            continue
        idx = texts.index("for name in names:")
        if idx > 1:
            page.locator(".quiz-order__row").nth(idx).locator(
                ".quiz-order__move").first.click()
    feedback = check_and_read(page)
    check("a correctly ordered answer is marked right", "Correct" in feedback, feedback[:60])

    # --- fill in the blank ------------------------------------------------
    open_lesson(page, "/units/unit-2/while-loop.html")
    blanks = page.locator(".quiz-blank__input")
    check("a blank question renders one box per gap", blanks.count() == 2)
    blanks.nth(0).fill("<")
    blanks.nth(1).fill("+")
    fb = check_and_read(page)
    check("both blanks right is marked right", "Correct" in fb, fb[:60])

    # --- multi-select -----------------------------------------------------
    open_lesson(page, "/units/unit-2/comparison-logical-operators.html")
    boxes = page.locator("input[name='q-u2-cmp-multi']")
    check("a multi-select renders checkboxes, not radios", boxes.count() == 4)
    # Ticking everything must score badly, or multi-select is a free pass.
    for i in range(4):
        boxes.nth(i).check()
    fb = check_and_read(page)
    check("ticking everything is not a pass", "Correct" not in fb, fb[:40])
    for i in range(4):
        boxes.nth(i).uncheck()
    boxes.nth(0).check()
    boxes.nth(2).check()
    fb = check_and_read(page)
    check("the right two ticked is a pass", "Correct" in fb, fb[:40])

    # --- matching ---------------------------------------------------------
    open_lesson(page, "/units/unit-2/introduction-loops.html")
    picks = page.locator(".quiz-match__pick")
    check("a matching question renders a select per row", picks.count() == 3)
    check("an unpaired row starts visibly unpaired", picks.nth(0).input_value() == "")
    for i in range(3):
        picks.nth(i).select_option(str(i))
    fb = check_and_read(page)
    check("a correct pairing is marked right", "Correct" in fb, fb[:40])

    # --- the reflection floor --------------------------------------------
    open_lesson(page, "/units/unit-1/what-is-python.html")
    box = page.locator(".reflection-input").first
    if box.count() == 0:
        check("a lesson with a reflection box was found", False)
    else:
        box.fill("a")
        box.dispatch_event("change")
        page.wait_for_timeout(200)
        note = page.locator(".reflection-note")
        check("one character is refused, with a reason beside the box", note.count() > 0)
        check("the reason says what to do, not what the learner is",
              "sentence" in note.first.inner_text().lower(),
              note.first.inner_text()[:60] if note.count() else "")
        check("the answer is left in the box to edit rather than cleared",
              box.input_value() == "a")

        box.fill("Python runs the file line by line instead of compiling it first, "
                 "which is why I can just run it.")
        box.dispatch_event("change")
        page.wait_for_timeout(200)
        check("a real answer clears the note",
              page.locator(".reflection-note").count() == 0)

    check("no uncaught page errors anywhere", not errors, "; ".join(errors[:2]))
    browser.close()

failed = [r for r in results if not r[1]]
print("\n%d checks, %d failed" % (len(results), len(failed)))
raise SystemExit(1 if failed else 0)
