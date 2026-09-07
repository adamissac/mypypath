# PyPath

Static site (plain HTML/CSS/JS, no build step) on Vercel, with Firebase Auth and
Firestore behind it.

## Two deploy targets, one push

Pushing to `main` auto-deploys the *site* via Vercel. It does not deploy
`firestore.rules`. Rules go to Firebase through a separate command:

```bash
npx firebase deploy --only firestore:rules
```

**Any change to `firestore.rules` is not finished at the commit.** Say so in the
summary, and treat the deploy as part of the task rather than a follow-up — but
leave the command itself to the user. Pushing security rules to production is
their call, not something to run on their credentials.

This split is easy to miss because nothing catches it. `npm run test:rules` runs
the emulator against the working-tree rules file, so it passes while production
is still enforcing the old ones; CI runs those same tests and stays green; and
Vercel reports a clean deploy because its half succeeded. The site looks current
and a write fails with `permission-denied: Missing or insufficient permissions`.
See `DEPLOYMENT.md` → Troubleshooting.

When writing a plan under `docs/superpowers/plans/` that touches
`firestore.rules`, put the rules deploy in the verification task explicitly. The
plans that led to this gap ended at "Commit."

## The Firestore cache is multi-tab, and the warning about it is a bug

`firebase-config.js` configures `persistentLocalCache({ tabManager:
persistentMultipleTabManager() })`. The `tabManager` is not decoration. The
no-argument `persistentLocalCache()` resolves, inside the SDK, to
`persistentSingleTabManager()` — one tab holds an exclusive IndexedDB lock and
every other tab silently drops to a **memory-only, empty** cache. An empty
cache is the precondition behind "a real teacher is told they are a student";
`assets/js/profile.js` documents the mechanism at length.

So if you see this in a console:

```
failed-precondition: Failed to obtain exclusive access to the persistence layer
```

that is a **regression, not background noise**. It was ambient on essentially
every page for weeks before anyone read it as a cause. `scripts/verify-multi-tab-cache.py`
asserts it is absent with three tabs open, and is confirmed to fail when the
configuration is reverted.

The related rule, enforced by `tests/role-reader-discipline.test.js`: outside
`profile.js`, never read the `users/{uid}` document. Write it freely, read the
subcollections beneath it freely, but route reads of the account record itself
through `loadProfile()` — it shares one server-confirmed read per page and
refuses to answer from a view carrying our own unacknowledged writes.

## Rules and site are in sync (checked 2026-09-06)

The deployed Firestore ruleset is byte-identical to `firestore.rules`, and the
site on Vercel is current with `main`. Both were verified rather than assumed:
the ruleset was fetched back from the Firebase Rules API and diffed against the
working tree, and the deployed JS was fetched from mypypath.com.

That is worth re-checking, the same way, whenever `firestore.rules` changes,
because nothing catches the gap on its own — `npm run test:rules` passes against
the working tree, CI stays green, and Vercel reports a clean deploy because its
half succeeded. To check:

```bash
npx firebase deploy --only firestore:rules     # the rules half; main only does the site
```

A note that lived here previously said a quiz-feature rules deploy "may still be
pending". It was not — that ruleset went out on 2026-08-19. Removed rather than
left, because a stale warning about production state is worse than none: it
teaches the next person to discount the section.

## The teacher dashboard reads summaries, not events

`classroom-dashboard.js` reads one `summary/current` per student and expands it
back into a canonical event log, so every derivation still runs through the same
`classroom-core.js` functions. Measured on a seeded 30-student class:
**2,451 reads per open → 95**.

Two rules follow from that, and breaking either reintroduces the bug:

- **Never add a second implementation of a `classroom-core.js` derivation that
  reads a summary directly.** The expansion exists so there is one `unitState`,
  one `percentComplete`, one `assignmentStatus`. `tests/roster-summary.test.js`
  asserts the canonical log answers every one of them identically to a real one.
- **The fallback is missing-only, never staleness-based.** A summary that looks
  old is still the student's own account of themselves; re-reading 500 events
  because a timestamp looked stale reintroduces the whole cost on exactly the
  classes with the most data.

The canonical log is *not* a substitute for the real one where individual events
matter — `groupByDay()`'s timeline is the clear case. The drill-down and both
exports keep reading events, and should.

Measure, do not estimate: `?readcount=1` switches on `assets/js/read-counter.js`,
and `scripts/measure-dashboard-reads.py` reports a whole dashboard open.

## Five browser checks that are not in `npm test`

Most of what accessibility, layout and performance ask about is a property of
RENDERED output, which a jsdom test cannot see. Each of these drives a real
browser and exits non-zero on a regression:

```bash
npm run test:a11y      # axe-core over 12 page shapes. Budget is ZERO.
npm run test:mobile    # 390x844 and 768x1024. Overflow, tap size, tiny text.
npm run test:keyboard  # tab order, focus rings, keyboard traps.
npm run test:motion    # nothing may animate under prefers-reduced-motion.
npm run test:perf      # page weight and request count, critical vs deferred.
```

Run them after any CSS or template change. The a11y budget is zero rather than
"no worse than before" because the site is genuinely at zero — a ratcheting
budget is the shape that lets a number sit at 92 for a year.

Two more need an emulator and a seeded class:

```bash
npm run emulators                              # terminal 1
STUDENTS=30 node scripts/seed-classroom.mjs    # terminal 2
node scripts/measure-dashboard-reads.py        # what a dashboard open costs
node scripts/verify-student-paths.mjs          # the four student states
```

None of these is a CI job yet: the token this was built with lacked GitHub's
`workflow` scope, so `.github/workflows/ci.yml` could not be written. The a11y
job is ready to paste in `docs/ci-a11y-job.md`; the other four follow the same
shape.

## Measure before concluding

Almost every number in the audit that prompted this work was wrong in a way
that changed what needed doing, and the pattern is worth knowing:

- "43 script tags on a lesson page" — the file has 7. It makes **67 requests**,
  because ES modules fan out. Requests are what a browser pays.
- "17 undersized tap targets" — **one**, once WCAG's spacing and inline
  exceptions are applied. The one is real and was on every lesson page.
- "two files both named main.css" — there is no `main.css` in this repo.
- "~10 breakpoints" — 14 media queries; a naive grep says 30 because it counts
  element `max-width` properties too. See `docs/css-breakpoints.md`.
- "`/quiz.html` has no empty state" — it had five, all unreachable, because the
  module top-level-awaits Firebase and its `DOMContentLoaded` listener was
  registered after the event had fired.

The scripts above exist so the next question of this kind is answered with a
number rather than a grep.

## Two cascade traps this codebase has already sprung twice

`pypath-theme.css` and `home-path.css` load **after** `style.css`, so a
correct-looking rule in the shared sheet can be silently inert:

- the sticky-footer flex column was right and did nothing, because the theme
  set `min-height: 100%` on the same selector;
- a 12px font-size floor was right and did nothing for one component, because
  `home-path.css` set its own `0.72rem`.

Both were invisible on the page and obvious the moment anything was measured.
If a style change appears to have no effect, check what loads after it before
concluding the selector is wrong.

## Checks

- `npm test` — unit tests (vitest)
- `npm run test:rules` — Firestore rules against the local emulator (needs Java)
- `npm run serve` — static server on :8080 for browser verification

## Looking at a populated teacher dashboard

The dashboard cannot be judged empty — every panel on it summarises a class that
has done some work. To see it with a realistic class, in three terminals:

```bash
npm run emulators     # auth :9099, firestore :8081
npm run seed          # 14 students, ~1000 events, 3 assignments
npm run serve         # then sign in at /login.html
```

Sign in as `teacher@pypath.test` / `pypath123`. `firebase-config.js` points the
site at the emulators automatically on localhost, so this is the real dashboard
over invented data — nothing touches the live project. Re-running the seed is
safe; clear it with the emulator's own wipe endpoint if you want a fresh start.

## Layout

- `assets/js/` — app scripts, injected into pages by `scripts/bake_layout.py`
- `firestore.rules` — all access control; `firebase-config.js` is public by design
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design docs and plans
- `.claude/skills/` — `webapp-testing` for browser checks, `frontend-design` for UI
