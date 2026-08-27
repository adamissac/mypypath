"""Browser verification of the autograder, written as an attack.

A grader is only as good as the cheats it stops, so the cheats are the test.
Everything here runs the real Pyodide interpreter on a real lesson page, which
is the only place the AST analyzer and the drawn cases actually meet.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8097"
LESSON = "/units/unit-1/arithmetic-expressions.html"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  " + detail if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE + LESSON, wait_until="networkidle")
    # Pyodide is a multi-second cold start, and nothing below works without it.
    page.wait_for_function("window.Pyodide && window.Pyodide.ensureReady", timeout=60000)
    page.evaluate("window.Pyodide.ensureReady()")
    page.wait_for_timeout(1000)

    for mod in ["PyPathChecker", "PyPathAst", "PyPathGen", "PyPathConcepts"]:
        check("%s is on the page" % mod, page.evaluate("typeof window.%s" % mod) == "object")

    def run(code):
        return page.evaluate(
            """async (code) => {
                const spec = await (await fetch(
                  '/assets/data/checks/unit-1/arithmetic-expressions.json')).json();
                const r = await window.PyPathChecker.run(code, spec.exercise1, 1);
                return { all: r.allPassed, passed: r.passed, total: r.total,
                         notes: r.structureNotes || [] };
            }""", code)

    honest = run("length = 8\nwidth = 5\nprint(length * width)")
    check("the honest solution passes", honest["all"],
          "%d of %d" % (honest["passed"], honest["total"]))

    # The cheat the brief names: source_matches was a regex over raw source,
    # and a comment is raw source.
    commented = run("length = 8\nwidth = 5\n# length * width\nprint(40)")
    check("the answer typed into a comment is refused", not commented["all"])

    stringed = run('length = 8\nwidth = 5\n_ = "length * width"\nprint(40)')
    check("the answer hidden in a string is refused", not stringed["all"])

    literals = run("length = 8\nwidth = 5\nprint(8 * 5)")
    check("multiplying the literals instead of the variables is refused",
          not literals["all"])

    # Reported, never failed: a student who has not understood parameters
    # writes this by accident.
    noted = page.evaluate(
        """async () => {
            const r = await window.PyPathChecker.run(
              'def area(length, width):\\n    return 40\\n', { cases: [
                { kind: 'ast', name: 's', describe: 'a function',
                  requires: { functions: true } } ] }, 1);
            return { all: r.allPassed, notes: r.structureNotes };
        }""")
    check("a function ignoring its parameters is reported", len(noted["notes"]) == 1,
          noted["notes"][0] if noted["notes"] else "")
    check("and reported without failing the case on a heuristic", noted["all"])
    check("in words about the code, not about the student",
          "cheat" not in (noted["notes"][0] if noted["notes"] else "").lower())

    # Drawn cases, end to end through the real interpreter.
    drawn = page.evaluate(
        """async () => {
            const pool = await (await fetch(
              '/assets/data/unit-tests/unit-1-frq.json')).json();
            const q = pool.find((x) => x.id === 'u1-f1');
            const gen = q.cases.find((c) => c.kind === 'generated');
            // The drawn case carries args too, but they are type specs
            // rather than values. Including it builds "if length == [object
            // Object]", which is a syntax error rather than a cheat.
            const listed = q.cases.filter(
              (c) => c.kind !== 'generated' && Array.isArray(c.args));
            const branches = listed.map((c) =>
              '    if length == ' + c.args[0] + ' and width == ' + c.args[1] +
              ': return ' + c.expect).join('\\n');
            const cheat = 'def rectangle_area(length, width):\\n' + branches + '\\n    return 0\\n';
            const real = 'def rectangle_area(l, w):\\n    return l * w\\n';
            const spec = { cases: [gen] };
            const a = await window.PyPathChecker.run(real, spec, 1);
            const b = await window.PyPathChecker.run(cheat, spec, 1);
            return { realOk: a.allPassed, cheatOk: b.allPassed,
                     cheatSays: (b.failures[0] || {}).actual || '' };
        }""")
    check("the real rule passes every drawn input", drawn["realOk"])
    check("a solution hardcoded to every listed case is refused", not drawn["cheatOk"])
    check("and is told a count, never which input caught it",
          "of" in drawn["cheatSays"] and "length" not in drawn["cheatSays"],
          drawn["cheatSays"])

    check("no uncaught page errors", not errors, "; ".join(errors[:2]))
    browser.close()

failed = [r for r in results if not r[1]]
print("\n%d checks, %d failed" % (len(results), len(failed)))
raise SystemExit(1 if failed else 0)
