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

## Checks

- `npm test` — unit tests (vitest)
- `npm run test:rules` — Firestore rules against the local emulator (needs Java)
- `npm run serve` — static server on :8080 for browser verification

## Layout

- `assets/js/` — app scripts, injected into pages by `scripts/bake_layout.py`
- `firestore.rules` — all access control; `firebase-config.js` is public by design
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design docs and plans
- `.claude/skills/` — `webapp-testing` for browser checks, `frontend-design` for UI
