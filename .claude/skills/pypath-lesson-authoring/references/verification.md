# Verifying a lesson in a real browser

Tests read content objects and HTML strings. They do not see a sidebar
rendered above the lesson instead of beside it, line numbers printed over
code, or a practice that crashes when Run is pressed. All three shipped in
this course with the test suite green. Screenshots are the ground truth.

## Setup

```bash
npm run serve                     # static server on :8080
npm run emulators                 # auth :9099, firestore :8081 (needs Java)
npm run seed                      # teacher@pypath.test / student01@pypath.test, password pypath123
```

Units 3+ are behind the account gate for a signed-out visitor, so sign in
against the emulator (localhost points the site at it automatically) to
see those lessons as a student does. Nothing touches production.

## Gotchas

- **Header fade.** `.site-header` fades from opacity 0 to 1. Wait for
  `getComputedStyle(h).opacity === '1'` before screenshotting, or you
  capture a blank header and conclude it is broken.
- **Boot overlay.** Wait until `<html>` loses the `pp-boot` class, or use a
  reduced-motion browser context, which skips it.
- **Signed in, the page never goes network-idle**, because Firestore holds a
  connection open. Wait for `load` plus a short delay instead.
- **Progress sync is debounced 5 seconds.** A lesson completed and left
  within 5s is saved on that device but does not reach Firestore until a
  later sync. Wait more than 5s before checking from a fresh browser.
- **Pyodide race in Foundations entry lessons.** A known, pre-existing crash
  of the Run button from variable name collisions in the runtime. If you
  hit it, note it; do not rename things site-wide to make it go away.
- **Deploy cache.** JS and CSS are cached for an hour on Vercel. Rule that out
  before calling a production regression a code bug.

## What to do for every changed lesson

1. **Run every editor.** `scripts/sweep_run_buttons.py` signs in, presses
   the real Run button on every practice and exercise of every matching
   lesson, and fails on any error output. Cold-loading pandas must show
   "Loading pandas… first run only" rather than freezing.
   ```bash
   python3 .claude/skills/pypath-lesson-authoring/scripts/sweep_run_buttons.py unit-11
   ```
2. **Check with a wrong answer, then a correct one.** Paste the exercise's
   `wrong` into the editor with `window.editors.exercise1.setValue(code)`,
   press "Check my work", and screenshot the result panel, which must show
   a failed case. Then do the same with `correct`, which must say "All N
   checks passed".
3. **Complete the lesson.** Run both practices and pass both exercises. The
   chip under the title must reach "Lesson complete" and survive a reload,
   and the unit page must tick the lesson.
4. **Answer the quiz** and screenshot it; every question must render.
5. **Screenshot next to a Foundations lesson** at 1280px and at 390px. The
   sidebar sits beside the lesson on desktop, and nothing scrolls sideways
   on a phone.
6. Save screenshots to `REVIEW/screenshots/` with names that say what they
   show, and cite them.
