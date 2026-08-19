# Content gating: two free units, the rest behind an account

Date: 2026-08-18
Status: approved, not yet implemented
Related: `2026-08-16-firebase-auth-progress-sync-design.md` (auth this design depends on)

## Goal

Guests read units 1 and 2 in full. Units 3 through 9 ask for an account first. Signing
in with any supported provider unlocks everything immediately.

## What this is, and what it is not

PyPath is static HTML on Vercel. Lesson bodies ship in the page source, and the
Firestore rules protect learner state, not lesson content. Any gate written in the
browser is therefore a **conversion prompt, not access control**: a visitor who opens
devtools, disables JavaScript, or reads the raw HTML can still get the text.

That is the accepted trade-off. Real enforcement would need edge middleware checking a
session cookie, or lesson bodies moved into Firestore, and both were considered and
rejected for this iteration — the first turns a static deploy into a hybrid one, the
second rewrites the content pipeline and removes gated lessons from search results.

The gate must be judged on whether it prompts sign-up cleanly, not on whether it is
bypassable. It is bypassable by design.

## Rules

- **Free:** units 1 and 2, every lesson within them. Home, curriculum, sandbox,
  settings, and the auth pages themselves are always open.
- **Gated:** units 3 through 9, both the unit index pages and their lessons.
- **Unlocks:** any signed-in Firebase user — email/password, Google, or GitHub. No
  email-verification requirement; the social providers verify their own addresses and
  adding a verification wall would strand anyone who does not check their inbox.
- **Fails open:** if auth state cannot be determined, the page unlocks.

## Components

### `assets/js/gate.js` — global `window.PyPathGate`

A plain global loaded before `core.js`, matching `merge.js`. Two pure functions plus
the DOM behavior that uses them.

```
unitFromPath(pathname) -> number | null
```
`/units/unit-3.html` → `3`. `/units/unit-3/loops.html` → `3`. Anything else → `null`.
Null means "not a lesson surface", which always renders open.

```
isLocked(unit, signedIn) -> boolean
```
`unit !== null && unit > FREE_UNITS && !signedIn`, with `FREE_UNITS = 2` exported as
`PyPathGate.FREE_UNITS` so the paywall copy and the curriculum badges read the number
from one place rather than hardcoding "two" in three files.

Both are pure, take no globals, and are unit-tested without a DOM.

### Page behavior

1. On load, `gate.js` computes `unitFromPath(location.pathname)`. If null, it does
   nothing at all — no attribute, no listener, no cost on the other 100+ pages.
2. On a gated page it sets `document.documentElement.dataset.gate = 'pending'`.
   `gate.css` hides `main` while pending, so no lesson text flashes before auth
   resolves.
3. It listens for `pypath:auth`. Signed in → `dataset.gate = 'open'`. Signed out →
   `dataset.gate = 'locked'` and the paywall panel is inserted as the first child of
   `main`.
4. A 3-second timer set at load unlocks the page if no `pypath:auth` ever arrives.

Step 4 is the important one. `auth.js` imports the Firebase SDK from `gstatic.com`; an
ad blocker, a corporate proxy, or an offline session can stop that import, and
`pypath:auth` then never fires. Failing closed would show a permanent paywall to a
signed-in learner whose network ate one script. A guest reading unit 5 for free is the
cheaper failure.

### Paywall panel

Inserted into `main`, not replacing it — the lesson stays in the DOM, so search
engines still index the page and the back button behaves.

Content: heading naming the unit, one line ("Units 1 and 2 are free. An account opens
the rest — and keeps your progress across devices."), a primary "Create free account"
button to `/signup.html?next=<current path>`, and a secondary "Sign in" link to
`/login.html?next=<current path>`.

`gate.css` handles the visual: the panel is centred and the lesson body behind it is
blurred and non-interactive under `[data-gate="locked"]`.

### `?next=` support in the auth pages

`login.html` and `signup.html` currently always redirect to `/progress.html`. They
gain a `next` parameter: if present **and** same-origin and starting with `/`, redirect
there instead. The origin check matters — an unchecked `next` is an open redirect, and
this one is reachable from any link on the web.

### Lock affordances on listing pages

Curriculum cards and unit index cards for units 3–9 get a lock badge and an
"Account required" label while signed out, cleared on `pypath:auth`. Progress rings for
locked units stay visible: "you have come this far" converts better than a blank wall.

## Files

| File | Change |
|---|---|
| `assets/js/gate.js` | new — `window.PyPathGate` plus page behavior |
| `assets/css/gate.css` | new — pending/locked states, paywall panel, lock badges |
| `tests/gate.test.js` | new — `unitFromPath` and `isLocked` |
| `scripts/bake_layout.py` | inject `gate.js` after `merge.js`, `gate.css` after `auth.css` |
| `login.html`, `signup.html` | honour a validated `?next=` |
| `index.html` | hand-patch the two tags, as `normalize_scripts` returns early for it |

## Testing

**Unit (vitest, no emulator):** `unitFromPath` for unit index pages, lesson pages,
curriculum, home, sandbox, a trailing slash, and an unknown path. `isLocked` across the
matrix of unit 1/2/3/null × signed in/out. Boundary case: unit 2 open, unit 3 locked.
Confirms `FREE_UNITS` is honoured rather than a literal.

**Browser (against the emulators):**
1. Guest on `/units/unit-1/what-is-python.html` — reads normally, no paywall.
2. Guest on `/units/unit-5.html` — paywall, lesson blurred behind it.
3. Guest on a unit-5 lesson — paywall; "Create free account" lands on signup with
   `?next=` pointing back; after signing up, the browser returns to that lesson and it
   is readable.
4. Signed-in reload of the same lesson — no paywall, no flash of the pending state.
5. `gate.js` loaded with `auth.js` blocked — page unlocks after ~3s.
6. Curriculum as a guest — units 3–9 show lock badges; badges clear on sign-in without
   a reload.

## Out of scope

No server-side enforcement. No trial timers or per-lesson metering. No paid tier — the
account is free; this gates on sign-up, not payment. No change to what Firestore stores
or to the security rules.
