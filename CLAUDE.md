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
