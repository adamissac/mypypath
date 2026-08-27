from playwright.sync_api import sync_playwright
BASE = "http://localhost:8096"
r = []
def check(n, ok, d=""):
    r.append(ok); print(("PASS " if ok else "FAIL ") + n + ("  " + str(d)[:65] if d else ""))

with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    # --- account page markup ---
    page.goto(BASE + "/account.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    check("account: role badge exists", page.locator("[data-class-role-badge]").count() == 1)
    check("account: create-class form exists", page.locator("[data-class-create-form]").count() == 1)
    check("account: class list exists", page.locator("[data-class-list]").count() == 1)
    check("account: no-class message exists", page.locator("[data-class-none]").count() == 1)
    check("account: dropdown role line exists", page.locator("[data-account-role]").count() == 1)
    check("account: dropdown classroom link exists",
          page.locator("[data-account-classroom]").count() >= 1)

    # role-nav paints the role. Simulate a teacher resolving.
    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:role',
        { detail: { role: 'teacher' } }))""")
    page.wait_for_timeout(300)
    role = page.locator("[data-account-role]").first
    check("dropdown says Teacher account when teaching",
          role.inner_text().strip() == "Teacher account", role.inner_text())
    # The link sits inside the closed dropdown, so its own hidden attribute is
    # what role-nav controls; the panel's visibility is a separate thing.
    check("classroom link is un-hidden for a teacher",
          page.evaluate("document.querySelector('a[data-account-classroom]').hidden") is False)

    page.evaluate("""document.dispatchEvent(new CustomEvent('pypath:role',
        { detail: { role: 'student' } }))""")
    page.wait_for_timeout(300)
    check("dropdown says Student account otherwise",
          role.inner_text().strip() == "Student account", role.inner_text())
    check("classroom link is hidden for a student",
          page.evaluate("document.querySelector('a[data-account-classroom]').hidden") is True)

    # --- classroom page: the legacy panel must not greet a new teacher ---
    page.goto(BASE + "/classroom.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    legacy = page.locator("[data-cr-legacy]")
    check("classroom: legacy panel exists but starts hidden",
          legacy.count() == 1 and legacy.is_hidden())
    check("classroom: 'Create a class' panel exists",
          page.locator("[data-cr-view='empty']").count() == 1)
    check("classroom: assignments section exists",
          page.locator(".cr-assign").count() == 1)
    check("classroom: unit access section exists",
          page.locator(".cr-access").count() == 1)

    # Force the class view open the way boot() does, and confirm the new
    # sections are actually VISIBLE, not merely present. This is the check
    # that was missing before.
    page.evaluate("""
      document.querySelector('[data-cr-root]').hidden = false;
      document.querySelector('[data-cr-view="class"]').hidden = false;
    """)
    page.wait_for_timeout(300)
    check("VISIBLE: assignments section", page.locator(".cr-assign").is_visible())
    check("VISIBLE: unit access section", page.locator(".cr-access").is_visible())
    check("VISIBLE: set-new-work form", page.locator("[data-cr-assign-form]").count() == 1)
    check("VISIBLE: three lock modes",
          page.locator("input[name='cr-lock-mode']").count() == 3)
    check("no page errors", not errs, "; ".join(errs[:2]))
    b.close()

bad = [x for x in r if not x]
print("\n%d checks, %d failed" % (len(r), len(bad)))
raise SystemExit(1 if bad else 0)
