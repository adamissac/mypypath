# Content Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests read units 1–2 in full; units 3–9 show a sign-up prompt until any Firebase user is signed in.

**Architecture:** One new global module `assets/js/gate.js` owns both the pure rules (`unitFromPath`, `isLocked`, `safeNext`) and the page behavior driven by the existing `pypath:auth` event. `assets/css/gate.css` owns every visual state. The baker injects both on every page; `gate.js` no-ops on any page that is not a unit surface.

**Tech Stack:** Plain ES5-style global JS (matching `merge.js` and `progress-store.js`), CSS, Vitest + jsdom, Firebase Auth via the existing `pypath:auth` event.

## Global Constraints

- `FREE_UNITS = 2`. Units 1 and 2 are free; 3–9 gated. The number lives only in `gate.js` and is read from `window.PyPathGate.FREE_UNITS` everywhere else.
- Unlock condition is any signed-in Firebase user. No email-verification requirement.
- The gate **fails open**: if `pypath:auth` never arrives within 3000 ms, the page unlocks.
- The paywall is inserted into `main`; the lesson content is never removed from the DOM.
- `?next=` is honoured only when it starts with `/` and does not start with `//` — anything else falls back to `/progress.html`. An unvalidated `next` is an open redirect.
- `gate.js` is a classic script (no `type="module"`), loaded after `merge.js`, so it is defined before `core.js` runs.
- No server-side enforcement, no metering, no paid tier.

---

### Task 1: `gate.js` — rules and page behavior

**Files:**
- Create: `assets/js/gate.js`
- Test: `tests/gate.test.js`

**Interfaces:**
- Consumes: nothing. Reads `document`, `location`, and the `pypath:auth` event only at runtime.
- Produces: `window.PyPathGate` with:
  - `FREE_UNITS: number` (2)
  - `unitFromPath(pathname: string) -> number | null`
  - `isLocked(unit: number | null, signedIn: boolean) -> boolean`
  - `safeNext(raw: string | null) -> string` — returns a same-origin path or `'/progress.html'`
  - `_apply(state: 'open' | 'locked')` — internal, exported for tests

- [ ] **Step 1: Write the failing tests**

`tests/gate.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/gate.js', 'utf8')).call(window);
});

describe('unitFromPath', () => {
  const cases = [
    ['/units/unit-3.html', 3],
    ['/units/unit-10.html', 10],
    ['/units/unit-3/loops.html', 3],
    ['/units/unit-1/what-is-python.html', 1],
    ['/curriculum.html', null],
    ['/', null],
    ['/index.html', null],
    ['/sandbox.html', null],
    ['/units/', null],
    ['/units/notes.html', null],
  ];
  cases.forEach(([path, expected]) => {
    it(`maps ${path} to ${expected}`, () => {
      expect(window.PyPathGate.unitFromPath(path)).toBe(expected);
    });
  });
});

describe('isLocked', () => {
  it('leaves free units open for guests', () => {
    expect(window.PyPathGate.isLocked(1, false)).toBe(false);
    expect(window.PyPathGate.isLocked(2, false)).toBe(false);
  });

  it('locks units past the free boundary for guests', () => {
    expect(window.PyPathGate.isLocked(3, false)).toBe(true);
    expect(window.PyPathGate.isLocked(9, false)).toBe(true);
  });

  it('unlocks everything for a signed-in user', () => {
    expect(window.PyPathGate.isLocked(3, true)).toBe(false);
    expect(window.PyPathGate.isLocked(9, true)).toBe(false);
  });

  it('never locks a non-unit page', () => {
    expect(window.PyPathGate.isLocked(null, false)).toBe(false);
  });

  it('reads the boundary from FREE_UNITS rather than a literal', () => {
    const free = window.PyPathGate.FREE_UNITS;
    expect(window.PyPathGate.isLocked(free, false)).toBe(false);
    expect(window.PyPathGate.isLocked(free + 1, false)).toBe(true);
  });
});

describe('safeNext', () => {
  it('accepts a same-origin path', () => {
    expect(window.PyPathGate.safeNext('/units/unit-5.html')).toBe('/units/unit-5.html');
  });

  it('rejects a protocol-relative URL', () => {
    expect(window.PyPathGate.safeNext('//evil.example/phish')).toBe('/progress.html');
  });

  it('rejects an absolute URL', () => {
    expect(window.PyPathGate.safeNext('https://evil.example/phish')).toBe('/progress.html');
  });

  it('rejects a backslash-prefixed URL', () => {
    expect(window.PyPathGate.safeNext('\\\\evil.example')).toBe('/progress.html');
  });

  it('falls back when absent', () => {
    expect(window.PyPathGate.safeNext(null)).toBe('/progress.html');
    expect(window.PyPathGate.safeNext('')).toBe('/progress.html');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/gate.test.js`
Expected: FAIL — `ENOENT: ... 'assets/js/gate.js'`

- [ ] **Step 3: Write `assets/js/gate.js`**

Pure rules first, then the page behavior. The behavior half must not run under Vitest, which has no `location.pathname` matching a unit — guard it by checking `unitFromPath(location.pathname)` returns non-null, which is the same no-op path every non-unit page takes.

```js
/* PyPath — content gate. Units past FREE_UNITS ask for an account.

   This is a conversion prompt, not access control: the lesson ships in the
   page source and anyone can read it with JavaScript off. Enforcement would
   need edge middleware or content in Firestore; both were rejected for this
   iteration. */
(function () {
  'use strict';

  var FREE_UNITS = 2;
  var FAIL_OPEN_MS = 3000;
  var UNIT_RE = /^\/units\/unit-(\d+)(?:\.html|\/[^/]+\.html)$/;

  function unitFromPath(pathname) {
    var m = UNIT_RE.exec(String(pathname || ''));
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return isNaN(n) ? null : n;
  }

  function isLocked(unit, signedIn) {
    return unit !== null && unit > FREE_UNITS && !signedIn;
  }

  function safeNext(raw) {
    var value = String(raw || '');
    // Same-origin paths only. "//host" and "\\host" are both browser-resolvable
    // as other origins, so an unvalidated next is an open redirect.
    if (!value || value.charAt(0) !== '/') return '/progress.html';
    if (value.charAt(1) === '/' || value.charAt(1) === '\\') return '/progress.html';
    return value;
  }

  function paywallHtml(unit) {
    var next = encodeURIComponent(location.pathname);
    return '<div class="gate-paywall" data-gate-paywall>' +
      '<h2>Unit ' + unit + ' opens with a free account</h2>' +
      '<p>Units 1 and ' + FREE_UNITS + ' are free to everyone. An account opens the rest ' +
      'and keeps your progress on every device.</p>' +
      '<div class="gate-paywall__actions">' +
      '<a class="btn btn-primary" href="/signup.html?next=' + next + '">Create free account</a>' +
      '<a class="btn btn-ghost" href="/login.html?next=' + next + '">Sign in</a>' +
      '</div></div>';
  }

  function apply(state, unit) {
    document.documentElement.dataset.gate = state;
    if (state !== 'locked') {
      var old = document.querySelector('[data-gate-paywall]');
      if (old) old.remove();
      return;
    }
    if (document.querySelector('[data-gate-paywall]')) return;
    var main = document.querySelector('main');
    if (!main) return;
    main.insertAdjacentHTML('afterbegin', paywallHtml(unit));
  }

  function markLockedCards(signedIn) {
    var links = document.querySelectorAll('a[href^="/units/unit-"]');
    Array.prototype.forEach.call(links, function (a) {
      var unit = unitFromPath(a.getAttribute('href'));
      var card = a.closest('.unit-card, .curriculum-card, li, article') || a;
      card.classList.toggle('is-gate-locked', isLocked(unit, signedIn));
    });
  }

  window.PyPathGate = {
    FREE_UNITS: FREE_UNITS,
    unitFromPath: unitFromPath,
    isLocked: isLocked,
    safeNext: safeNext,
    _apply: apply
  };

  if (typeof document === 'undefined' || !document.documentElement) return;

  var unit = unitFromPath(location.pathname);
  var settled = false;

  function settle(signedIn) {
    settled = true;
    if (unit !== null) apply(isLocked(unit, signedIn) ? 'locked' : 'open', unit);
    markLockedCards(signedIn);
  }

  if (unit !== null) document.documentElement.dataset.gate = 'pending';

  document.addEventListener('pypath:auth', function (e) {
    settle(!!(e.detail && e.detail.user));
  });

  // Fail open. auth.js imports the Firebase SDK from gstatic.com; an ad blocker
  // or a dead network stops pypath:auth from ever firing, and a permanent
  // paywall for a signed-in learner is worse than a guest reading unit 5.
  setTimeout(function () {
    if (settled) return;
    settled = true;
    document.documentElement.dataset.gate = 'open';
    var old = document.querySelector('[data-gate-paywall]');
    if (old) old.remove();
  }, FAIL_OPEN_MS);
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/gate.test.js`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add assets/js/gate.js tests/gate.test.js
git commit -m "feat: add the content gate rules module"
```

---

### Task 2: `gate.css` — pending, locked, and lock-badge states

**Files:**
- Create: `assets/css/gate.css`

**Interfaces:**
- Consumes: `data-gate` on `<html>` (`pending` | `open` | `locked`), `.gate-paywall` and `.gate-paywall__actions` from Task 1, and `.is-gate-locked` on listing cards.
- Produces: no JS surface.

- [ ] **Step 1: Write `assets/css/gate.css`**

```css
/* PyPath — content gate visuals. See gate.js for the state machine. */

/* No flash of gated lesson text before auth resolves. */
html[data-gate="pending"] main { visibility: hidden; }

html[data-gate="locked"] main > *:not([data-gate-paywall]) {
  filter: blur(6px);
  pointer-events: none;
  user-select: none;
}

.gate-paywall {
  max-width: 34rem;
  margin: 3rem auto;
  padding: 2rem;
  text-align: center;
  background: var(--bg-elev, #fff);
  border: 1px solid var(--border, #d0d0d8);
  border-radius: .9rem;
  box-shadow: 0 12px 32px rgb(0 0 0 / .10);
}

.gate-paywall h2 { margin-top: 0; }
.gate-paywall p { opacity: .85; }

.gate-paywall__actions {
  display: flex;
  gap: .75rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 1.25rem;
}

.is-gate-locked { position: relative; }

.is-gate-locked::after {
  content: "🔒 Account required";
  position: absolute;
  top: .5rem;
  right: .5rem;
  font-size: .75rem;
  padding: .15rem .5rem;
  border-radius: 999px;
  background: var(--bg-subtle, #f2f2f5);
  border: 1px solid var(--border, #d0d0d8);
}

@media (prefers-reduced-motion: reduce) {
  html[data-gate="locked"] main > *:not([data-gate-paywall]) { filter: none; opacity: .35; }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/css/gate.css
git commit -m "feat: add content gate styles"
```

---

### Task 3: `?next=` in the auth pages

**Files:**
- Modify: `login.html`
- Modify: `signup.html`

**Interfaces:**
- Consumes: `window.PyPathGate.safeNext` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Replace the `done()` helper in `login.html`**

The current inline module has:

```js
      function done() { window.location.href = '/progress.html'; }
```

Replace with:

```js
      function done() {
        const raw = new URLSearchParams(location.search).get('next');
        const target = window.PyPathGate
          ? window.PyPathGate.safeNext(raw)
          : '/progress.html';
        window.location.href = target;
      }
```

- [ ] **Step 2: Make the same replacement in `signup.html`**

`signup.html` has the identical `done()` line. Replace it with the identical block.

- [ ] **Step 3: Commit**

```bash
git add login.html signup.html
git commit -m "feat: return to the gated page after sign-in"
```

---

### Task 4: Baker wiring and verification

**Files:**
- Modify: `scripts/bake_layout.py`
- Modify: `index.html`

**Interfaces:**
- Consumes: everything above.
- Produces: `gate.js` and `gate.css` on every page.

- [ ] **Step 1: Inject `gate.js` after `merge.js` in `normalize_scripts`**

```python
    if 'assets/js/gate.js' not in html and 'merge.js' in html:
        html = html.replace(
            '<script defer src="/assets/js/merge.js"></script>',
            '<script defer src="/assets/js/merge.js"></script>\n'
            '    <script defer src="/assets/js/gate.js"></script>',
            1,
        )
```

- [ ] **Step 2: Inject `gate.css` after `auth.css` in `normalize_head`**

```python
    if 'assets/css/gate.css' not in html and 'auth.css' in html:
        html = html.replace(
            '<link rel="stylesheet" href="/assets/css/auth.css" />',
            '<link rel="stylesheet" href="/assets/css/auth.css" />\n'
            '    <link rel="stylesheet" href="/assets/css/gate.css" />',
            1,
        )
```

- [ ] **Step 3: Re-bake and hand-patch `index.html`**

Run: `python scripts/bake_layout.py`

`normalize_scripts` returns early for root `index.html`, so add the `gate.js` tag there by hand after its `merge.js` tag. `normalize_head` does run for it, so `gate.css` lands automatically — confirm with `grep`.

- [ ] **Step 4: Confirm the baker is still idempotent**

Run: `git add -A && python scripts/bake_layout.py && git diff --name-only | wc -l`
Expected: `0`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, including the new gate tests.

- [ ] **Step 6: Verify in the browser against the emulators**

1. Guest on `/units/unit-1/what-is-python.html` — reads normally, no paywall.
2. Guest on `/units/unit-5.html` — paywall, lesson blurred behind it.
3. Guest on a unit-5 lesson — "Create free account" goes to `/signup.html?next=/units/unit-5/...`.
4. Signed in, same lesson — no paywall and no flash of hidden content.
5. Curriculum as a guest — units 3–9 carry the lock badge; it clears on sign-in without a reload.
6. With `auth.js` blocked, a unit-5 lesson unlocks after ~3s.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: gate units past the free tier behind an account"
```
