# MyPyPath — Accounts and Progress Sync

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan

## Problem

All learner state lives in `localStorage` under the `pypath-` prefix. It is
invisible across devices, and one cleared browser cache destroys a student's
entire history. There is no concept of a user.

## Goal

Add optional accounts. Signed-in learners get their progress and saved code
synced across devices plus a progress dashboard. Guests keep the site they have
today, unchanged.

## Non-goals

- Certificates or shareable completion credentials. Lessons are graded
  in-browser by Pyodide, so the server never witnesses genuine completion and
  any certificate would be self-attested. Deferred until server-side grading
  exists to back it.
- Syncing device preferences (theme, font scale, sidebar state). These are
  per-device by nature.
- Syncing sandbox projects. Local-only for this phase.
- Any build step. The repo's static, buildless deploy is preserved.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Platform | Firebase Auth + Firestore | Hosted auth with the three required providers; no server code to own |
| Sign-in methods | Email/password, Google, GitHub | Covers beginners and coding-fluent students |
| SDK delivery | Firebase modular ESM from `gstatic.com`, pinned version | No build step, no repo weight, Google-hosted and well cached |
| Guest access | Full — lessons and sandbox open to all | No signup wall on a free learning site; protects existing traffic and SEO |
| Gated behind account | Cross-device sync, progress dashboard, profile | The actual payoff of registering |

## Architecture

The site remains static and deploys unchanged on Vercel. Three concerns get
their own module:

### `assets/js/firebase-config.js`

Initializes the Firebase app, exports `auth` and `db`. Imports the modular SDK
from `https://www.gstatic.com/firebasejs/<version>/...` URLs. The version is
pinned to a single exact release — never a floating tag — chosen at
implementation time and declared once as a constant in this file so every import
shares it. Upgrading is a one-line change.

The Firebase web config (`apiKey`, `authDomain`, `projectId`, …) is public by
design and is safe to commit. Access control comes from two places, both of
which must be configured in the Firebase console:

1. **Firestore Security Rules** — the real authorization boundary.
2. **Authorized Domains** — `mypypath.com`, `www.mypypath.com`, `localhost`.
   Without this list, the config alone is useless to an attacker's origin.

### `assets/js/auth.js`

Sign-up, sign-in, sign-out, provider flows, password reset, and email
verification. Observes auth state and dispatches a `pypath:auth` DOM event on
`document` carrying `{ user }` (or `{ user: null }`), so UI code never imports
Firebase directly.

### `assets/js/progress-store.js`

The single owner of learner state. This is the central refactor.

Today `core.js`, `exercises.js`, and `lesson-runner.js` each read and write
`localStorage` directly. Adding sync to three call sites independently would
scatter the merge and debounce logic across the codebase and guarantee drift.

`assets/js/main.js` also carries a duplicate copy of the completed-units logic,
but it is **dead code**: no HTML file references it, and
`scripts/bake_layout.py:402` actively strips any `main.js` script tag it finds.
It gets deleted rather than refactored.

`ProgressStore` presents a synchronous read API backed by an in-memory cache
hydrated from `localStorage` at load, so existing synchronous callers need no
restructuring:

```js
ProgressStore.getCompletedUnits()      // -> string[]
ProgressStore.markUnitComplete(id)
ProgressStore.getCode(type, id)        // -> string
ProgressStore.setCode(type, id, text)
```

Writes go to `localStorage` first, then debounce-push to Firestore when a user
is signed in. `localStorage` therefore serves as both the guest store and the
signed-in offline cache. Guests exercise exactly the code path they do today.

The four existing modules change only their storage calls. The duplicate
completed-units logic in `main.js` and `core.js` collapses into the store.

## Data model

```
users/{uid}
    displayName, photoURL, createdAt, updatedAt

users/{uid}/state/progress
    completedUnits: number[]
    lessons: { [lessonId]: { done: bool, updatedAt: timestamp } }
    updatedAt: timestamp

users/{uid}/code/{docId}
    localKey: string
    content: string
    updatedAt: timestamp
```

Progress is a single document, so loading a signed-in session costs one read.
Saved code is one document per lesson or exercise key, so an edit to one lesson
does not rewrite every other.

`completedUnits` holds **numbers**, not strings. `core.js:437` stores
`Number(match[1])` and `core.js:455` compares with `completed.includes(idx + 1)`.
Storing strings would silently break every completed-unit checkmark.

Firestore document IDs may not contain `/`, and both existing key schemes embed
`window.location.pathname`:

- `lesson-runner.js:6` — `'pypath-lesson-' + pathname + '-' + type + '-' + id`
- `exercises.js:143` — `` `exercise_${pathname}_${exerciseId}` `` (note: **not**
  `pypath-` prefixed, so the existing settings export/reset in `core.js:493` and
  `core.js:514` silently skips exercise answers)

So `{docId}` is the local key with `/` replaced by `__`. The untransformed
`localKey` is stored as a field on the document so the mapping is reversible
without re-deriving it.

## Security rules

A user may read and write only their own subtree:

```
match /users/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
  match /{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
}
```

Everything else is denied by default. Rules live in `firestore.rules` at the
repo root and are deployed with the Firebase CLI. Field-level size limits on
`content` (cap at 100 KB) prevent a signed-in user from using the project as
free storage.

## Sync and merge

On sign-in, local state merges into remote:

- `completedUnits` — **set union**. Never destructive. A unit completed on
  either device stays completed.
- Code documents — **newest `updatedAt` wins**, evaluated per key. A key present
  locally but absent remotely uploads; absent locally but present remotely
  downloads.

Local-only keys (`pypath-theme`, font scale, sidebar state, sandbox projects)
are excluded from sync by an explicit allowlist in `progress-store.js`, not a
denylist, so a future `pypath-*` key does not leak by default.

On sign-out, remote state is left alone and the local cache is retained, so the
user is returned to a working guest session rather than a blank one.

## New pages

| Page | Purpose |
|---|---|
| `login.html` | Sign in — email/password, Google, GitHub; forgot-password link |
| `signup.html` | Register; triggers verification email |
| `account.html` | Profile: display name, avatar, sign out, delete account |
| `progress.html` | Dashboard: units complete, percent through curriculum, resume link |

Header gains a sign-in button that becomes an avatar menu when authenticated.
Because the header is baked into pages by `scripts/bake_layout.py`, the change
goes into the layout template and is re-baked across all pages.

`progress.html` and `account.html` render a sign-in prompt rather than
redirecting when visited by a guest.

## Error handling

Every Firebase call is wrapped. On failure the store falls back to
`localStorage` and surfaces a non-blocking toast. A network failure must never
block a lesson, an exercise run, or a page load. Sync failures retry on the next
write rather than looping.

Firestore offline persistence is enabled, so a signed-in user who loses
connectivity keeps working and syncs on reconnect.

## Testing

- **Firebase Emulator Suite** for Auth and Firestore in local development, so no
  test writes touch production data.
- **Security rules tests** against the emulator: verify user A cannot read or
  write user B's documents, and that unauthenticated reads are denied.
- **Merge tests** for `progress-store.js`: local-only, remote-only, conflicting
  timestamps, and the empty cases on both sides.
- **Guest regression**: with no account, every existing `pypath-*` behavior is
  unchanged.
- Existing CI (`.github/workflows/ci.yml`) plus `scripts/check_links.py` must
  pass with the new pages added to `sitemap.xml` via
  `scripts/generate_sitemap.py`.

## Phasing

1. **Auth and sync** — Firebase project setup, rules, `firebase-config.js`,
   `auth.js`, `progress-store.js` refactor, `login.html`, `signup.html`,
   `account.html`, header integration.
2. **Dashboard** — `progress.html`.

## Open operational items

These require console access and are not code:

- Create the Firebase project and enable Auth providers.
- Register a GitHub OAuth app and add its client ID/secret to Firebase.
- Configure the Google provider consent screen.
- Set Authorized Domains.
- Add a privacy policy page covering what account data is stored, as public
  signup with email collection warrants one.
