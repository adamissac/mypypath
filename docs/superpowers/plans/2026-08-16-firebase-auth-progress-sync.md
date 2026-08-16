# MyPyPath Accounts and Progress Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Firebase accounts so learners sync unit progress and saved lesson code across devices, with a progress dashboard, while guests keep today's fully-local experience unchanged.

**Architecture:** A new `progress-store.js` becomes the single owner of learner state, presenting a synchronous read API backed by an in-memory cache hydrated from `localStorage`. Writes go local-first, then debounce-push to Firestore when signed in. `auth.js` wraps Firebase Auth and broadcasts a `pypath:auth` DOM event so no UI file imports Firebase directly. The site stays static with no build step for production — Node is a dev/test dependency only.

**Tech Stack:** Vanilla ES5-style IIFE JS (matching the existing codebase), Firebase Auth + Firestore via pinned gstatic ESM, Vitest + `@firebase/rules-unit-testing` for tests, Firebase Emulator Suite for local Auth/Firestore.

## Global Constraints

- **No build step for the shipped site.** Every file under `assets/` must be servable as-is by `python3 -m http.server 8080`. Node and npm exist only for tests and emulators.
- **Firebase SDK version is pinned to one exact release.** Never `latest`, never a floating major. Declare it once as `SDK_VERSION` in `assets/js/firebase-config.js` and build every import URL from it.
- **`completedUnits` entries are numbers, not strings.** `core.js:437` writes `Number(match[1])`; `core.js:455` tests `completed.includes(idx + 1)`.
- **Firestore document IDs cannot contain `/`.** All local storage keys embed `window.location.pathname`. Encode with `.replace(/\//g, '__')` before use as a doc ID.
- **Sync uses an allowlist, never a denylist.** A new `pypath-*` key must not sync by default.
- **Guests must be unaffected.** Any code path reachable without an account behaves exactly as it does today.
- **Never block a lesson on the network.** Every Firebase call falls back to `localStorage` and surfaces a non-blocking toast via the existing `window.PyUI.showToast`.
- **Existing files use IIFE + `var` + `function`, not ES modules.** New non-Firebase files match that style. Only `firebase-config.js`, `auth.js`, and `sync.js` are `type="module"`, because the Firebase SDK requires it.
- **Existing script tags are `<script defer src="...">` injected by `scripts/bake_layout.py`.** Do not hand-edit script tags across 114 HTML files; change the baker and re-run it.

## Storage key inventory

Established by reading the current code. Task 3 depends on this being exact.

| Key | Written at | Syncs? |
|---|---|---|
| `pypath-completed-units` | `core.js:432` | **Yes** |
| `pypath-lesson-<pathname>-<type>-<id>` | `lesson-runner.js:6,10` | **Yes** |
| `exercise_<pathname>_<exerciseId>` | `exercises.js:143,145` | **Yes** |
| `pypath-theme` | `theme.js:4` | No — device-local |
| `pypath-fontscale` | `theme.js:5` | No — device-local |
| `pypath-sidebar-closed` | `core.js:540` | No — device-local |
| `pypath-inspire-banner-dismissed` | `core.js:653` | No — device-local |
| `pypath-sandbox-projects` | `sandbox.js:4` | No — out of scope |
| `pypath-nav` (sessionStorage) | `core.js:807` | No — transient |

---

### Task 0: Initialize git and Node test harness

Nothing else in this plan is safe without version control. The repo currently has no `.git`.

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `tests/smoke.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest against `tests/**/*.test.js` in a jsdom environment.

- [ ] **Step 1: Initialize the repository**

```bash
cd /q/mypypath-main/mypypath-main
git init
git add -A
git commit -m "chore: initial commit of existing site"
```

- [ ] **Step 2: Append Node artifacts to `.gitignore`**

```
node_modules/
.firebase/
firebase-debug.log
firestore-debug.log
ui-debug.log
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "mypypath",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:rules": "firebase emulators:exec --only firestore \"vitest run tests/rules\"",
    "serve": "python3 -m http.server 8080"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^4.0.1",
    "firebase-tools": "^13.29.1",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Write a smoke test that proves the harness runs**

`tests/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('provides a jsdom localStorage', () => {
    localStorage.setItem('probe', '1');
    expect(localStorage.getItem('probe')).toBe('1');
    localStorage.clear();
  });
});
```

- [ ] **Step 6: Install and run**

Run: `npm install && npm test`
Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js tests/smoke.test.js .gitignore
git commit -m "chore: add Vitest harness for storage and sync tests"
```

---

### Task 1: Key classification and doc-ID encoding

Pure functions, no Firebase, no DOM. Built first because Tasks 3 and 5 both depend on them and they are trivially testable.

**Files:**
- Create: `assets/js/storage-keys.js`
- Test: `tests/storage-keys.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: global `window.PyPathKeys` with:
  - `isSyncable(key: string) -> boolean`
  - `toDocId(key: string) -> string`
  - `COMPLETED_UNITS_KEY: string` (value `'pypath-completed-units'`)

- [ ] **Step 1: Write the failing tests**

`tests/storage-keys.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  const src = fs.readFileSync('assets/js/storage-keys.js', 'utf8');
  new Function(src).call(window);
});

describe('isSyncable', () => {
  it('accepts completed units', () => {
    expect(window.PyPathKeys.isSyncable('pypath-completed-units')).toBe(true);
  });

  it('accepts lesson code keys', () => {
    expect(
      window.PyPathKeys.isSyncable('pypath-lesson-/units/unit-1/first-program.html-editor-1')
    ).toBe(true);
  });

  it('accepts exercise answer keys', () => {
    expect(
      window.PyPathKeys.isSyncable('exercise_/units/unit-2/if-statement.html_q3')
    ).toBe(true);
  });

  it('rejects device-local preference keys', () => {
    ['pypath-theme',
     'pypath-fontscale',
     'pypath-sidebar-closed',
     'pypath-inspire-banner-dismissed',
     'pypath-sandbox-projects'].forEach((k) => {
      expect(window.PyPathKeys.isSyncable(k)).toBe(false);
    });
  });

  it('rejects unknown future pypath keys by default', () => {
    expect(window.PyPathKeys.isSyncable('pypath-some-new-feature')).toBe(false);
  });
});

describe('toDocId', () => {
  it('replaces every slash so the id is a legal Firestore doc id', () => {
    const id = window.PyPathKeys.toDocId('pypath-lesson-/units/unit-1/a.html-editor-1');
    expect(id).toBe('pypath-lesson-__units__unit-1__a.html-editor-1');
    expect(id).not.toContain('/');
  });

  it('round-trips distinct keys to distinct ids', () => {
    const a = window.PyPathKeys.toDocId('exercise_/units/unit-1/a.html_q1');
    const b = window.PyPathKeys.toDocId('exercise_/units/unit-1/b.html_q1');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/storage-keys.test.js`
Expected: FAIL — `ENOENT: no such file or directory, open 'assets/js/storage-keys.js'`

- [ ] **Step 3: Write the implementation**

`assets/js/storage-keys.js`:

```js
/* PyPath — which localStorage keys sync, and how they map to Firestore doc ids */
(function () {
  'use strict';

  var COMPLETED_UNITS_KEY = 'pypath-completed-units';

  // Allowlist, deliberately. A new pypath-* key must not sync until it is
  // added here on purpose.
  var SYNC_PATTERNS = [
    /^pypath-completed-units$/,
    /^pypath-lesson-.+/,
    /^exercise_.+/
  ];

  function isSyncable(key) {
    if (typeof key !== 'string') return false;
    return SYNC_PATTERNS.some(function (re) { return re.test(key); });
  }

  function toDocId(key) {
    return String(key).replace(/\//g, '__');
  }

  window.PyPathKeys = {
    COMPLETED_UNITS_KEY: COMPLETED_UNITS_KEY,
    isSyncable: isSyncable,
    toDocId: toDocId
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/storage-keys.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add assets/js/storage-keys.js tests/storage-keys.test.js
git commit -m "feat: add storage key classification and Firestore doc id encoding"
```

---

### Task 2: Delete the dead `main.js`

Isolated and independently reviewable. `main.js` duplicates the completed-units logic that Task 3 is about to centralize; leaving it invites someone to edit the wrong copy.

**Files:**
- Delete: `assets/js/main.js`
- Modify: `scripts/bake_layout.py:402`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Prove it is unreferenced**

Run: `grep -rn "main\.js" --include=*.html . ; grep -rn "main\.js" assets/js/`
Expected: no matches in any `.html` file and no matches inside `assets/js/`. The only hits are in `scripts/bake_layout.py` (the strip list) and possibly `scripts/upgrade_site.py`.

If any `.html` file does reference it, **stop and report** — the premise is wrong and this task must be re-planned.

- [ ] **Step 2: Delete the file**

```bash
git rm assets/js/main.js
```

- [ ] **Step 3: Leave the baker's strip list alone, but document why**

In `scripts/bake_layout.py`, above line 402, add:

```python
    # main.js was deleted (2026-08-16); it stays in this strip list so any
    # stale script tag in an un-baked page is still removed.
```

- [ ] **Step 4: Verify the site still loads**

Run: `python3 -m http.server 8080` and open `http://localhost:8080/units/unit-1.html`
Expected: page renders, no 404 for `main.js` in the browser console, unit progress bar still reflects `pypath-completed-units`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete dead main.js, superseded by core.js"
```

---

### Task 3: `progress-store.js` — local-only behavior

The central refactor. This task ships the store with **no Firebase at all** — it must be a perfect drop-in for today's `localStorage` access. Sync lands in Task 5. Splitting here means a reviewer can confirm zero guest regression before any network code exists.

**Files:**
- Create: `assets/js/progress-store.js`
- Test: `tests/progress-store.test.js`
- Modify: `assets/js/core.js:428-433`
- Modify: `assets/js/lesson-runner.js:5-19`
- Modify: `assets/js/exercises.js:141-160`
- Modify: `scripts/bake_layout.py` (`normalize_scripts`)

**Interfaces:**
- Consumes: `window.PyPathKeys.isSyncable`, `window.PyPathKeys.toDocId`, `window.PyPathKeys.COMPLETED_UNITS_KEY` (Task 1)
- Produces: global `window.ProgressStore` with:
  - `getCompletedUnits() -> number[]`
  - `setCompletedUnits(list: number[]) -> void`
  - `getItem(key: string) -> string | null`
  - `setItem(key: string, value: string) -> void`
  - `removeItem(key: string) -> void`
  - `snapshot() -> { [key: string]: string }` — every syncable key currently held
  - `_setRemoteAdapter(adapter | null) -> void` — Task 5 injects the Firestore writer here; `null` means local-only

- [ ] **Step 1: Write the failing tests**

`tests/progress-store.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

function loadStore() {
  new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/progress-store.js', 'utf8')).call(window);
}

beforeEach(() => {
  localStorage.clear();
  loadStore();
});

describe('completed units', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(window.ProgressStore.getCompletedUnits()).toEqual([]);
  });

  it('stores numbers, not strings', () => {
    window.ProgressStore.setCompletedUnits([1, 2]);
    const read = window.ProgressStore.getCompletedUnits();
    expect(read).toEqual([1, 2]);
    expect(typeof read[0]).toBe('number');
  });

  it('deduplicates', () => {
    window.ProgressStore.setCompletedUnits([1, 1, 2]);
    expect(window.ProgressStore.getCompletedUnits()).toEqual([1, 2]);
  });

  it('writes through to localStorage under the legacy key', () => {
    window.ProgressStore.setCompletedUnits([3]);
    expect(JSON.parse(localStorage.getItem('pypath-completed-units'))).toEqual([3]);
  });

  it('reads pre-existing localStorage data written before the store existed', () => {
    localStorage.setItem('pypath-completed-units', '[4,5]');
    loadStore();
    expect(window.ProgressStore.getCompletedUnits()).toEqual([4, 5]);
  });

  it('survives corrupt JSON without throwing', () => {
    localStorage.setItem('pypath-completed-units', 'not json');
    loadStore();
    expect(window.ProgressStore.getCompletedUnits()).toEqual([]);
  });
});

describe('generic items', () => {
  it('round-trips a value', () => {
    window.ProgressStore.setItem('pypath-lesson-/a.html-editor-1', 'print(1)');
    expect(window.ProgressStore.getItem('pypath-lesson-/a.html-editor-1')).toBe('print(1)');
  });

  it('returns null for a missing key', () => {
    expect(window.ProgressStore.getItem('pypath-lesson-/nope.html-editor-1')).toBe(null);
  });

  it('removes a value', () => {
    window.ProgressStore.setItem('exercise_/a.html_q1', 'x');
    window.ProgressStore.removeItem('exercise_/a.html_q1');
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe(null);
    expect(localStorage.getItem('exercise_/a.html_q1')).toBe(null);
  });
});

describe('snapshot', () => {
  it('includes syncable keys and excludes device-local ones', () => {
    window.ProgressStore.setItem('pypath-lesson-/a.html-editor-1', 'code');
    window.ProgressStore.setCompletedUnits([1]);
    localStorage.setItem('pypath-theme', 'dark');
    localStorage.setItem('pypath-sandbox-projects', '[]');

    const snap = window.ProgressStore.snapshot();
    expect(snap['pypath-lesson-/a.html-editor-1']).toBe('code');
    expect(snap['pypath-completed-units']).toBe('[1]');
    expect(snap['pypath-theme']).toBeUndefined();
    expect(snap['pypath-sandbox-projects']).toBeUndefined();
  });
});

describe('remote adapter', () => {
  it('is not called when no adapter is set', () => {
    expect(() => window.ProgressStore.setItem('exercise_/a.html_q1', 'v')).not.toThrow();
  });

  it('receives writes for syncable keys once set', () => {
    const seen = [];
    window.ProgressStore._setRemoteAdapter({
      push(key, value) { seen.push([key, value]); }
    });
    window.ProgressStore.setItem('exercise_/a.html_q1', 'v');
    expect(seen).toEqual([['exercise_/a.html_q1', 'v']]);
  });

  it('never forwards device-local keys to the adapter', () => {
    const seen = [];
    window.ProgressStore._setRemoteAdapter({ push(k, v) { seen.push([k, v]); } });
    window.ProgressStore.setItem('pypath-theme', 'dark');
    expect(seen).toEqual([]);
  });

  it('still writes locally when the adapter throws', () => {
    window.ProgressStore._setRemoteAdapter({
      push() { throw new Error('offline'); }
    });
    expect(() => window.ProgressStore.setItem('exercise_/a.html_q1', 'v')).not.toThrow();
    expect(window.ProgressStore.getItem('exercise_/a.html_q1')).toBe('v');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/progress-store.test.js`
Expected: FAIL — `ENOENT: ... 'assets/js/progress-store.js'`

- [ ] **Step 3: Write the implementation**

`assets/js/progress-store.js`:

```js
/* PyPath — single owner of learner progress state.
   Local-first: every write hits localStorage, then optionally a remote adapter. */
(function () {
  'use strict';

  var KEYS = window.PyPathKeys;
  var UNITS_KEY = KEYS.COMPLETED_UNITS_KEY;

  var remote = null;

  function rawGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function rawSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function rawRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function pushRemote(key, value) {
    if (!remote || !KEYS.isSyncable(key)) return;
    try { remote.push(key, value); } catch (e) {}
  }

  function getCompletedUnits() {
    try {
      var parsed = JSON.parse(rawGet(UNITS_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(Number).filter(function (n) { return !isNaN(n); });
    } catch (e) {
      return [];
    }
  }

  function setCompletedUnits(list) {
    var unique = Array.from(new Set((list || []).map(Number)))
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });
    var value = JSON.stringify(unique);
    rawSet(UNITS_KEY, value);
    pushRemote(UNITS_KEY, value);
  }

  function getItem(key) { return rawGet(key); }

  function setItem(key, value) {
    rawSet(key, value);
    pushRemote(key, value);
  }

  function removeItem(key) {
    rawRemove(key);
    pushRemote(key, null);
  }

  function snapshot() {
    var out = {};
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (KEYS.isSyncable(k)) out[k] = localStorage.getItem(k);
      });
    } catch (e) {}
    return out;
  }

  function _setRemoteAdapter(adapter) { remote = adapter || null; }

  window.ProgressStore = {
    getCompletedUnits: getCompletedUnits,
    setCompletedUnits: setCompletedUnits,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    snapshot: snapshot,
    _setRemoteAdapter: _setRemoteAdapter
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/progress-store.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 5: Point `core.js` at the store**

Replace `assets/js/core.js:428-433` with:

```js
  function getCompletedUnits() {
    return window.ProgressStore.getCompletedUnits();
  }
  function setCompletedUnits(list) {
    window.ProgressStore.setCompletedUnits(list);
  }
```

Leave `markUnitCompletedFromPage` and `updateGlobalProgress` untouched — they call these two wrappers and keep working.

- [ ] **Step 6: Point `lesson-runner.js` at the store**

Replace `assets/js/lesson-runner.js:9-19` with:

```js
  function saveToStorage(type, id, value) {
    window.ProgressStore.setItem(storageKey(type, id), value);
  }

  function loadFromStorage(type, id) {
    return window.ProgressStore.getItem(storageKey(type, id));
  }

  function clearStorage(type, id) {
    window.ProgressStore.removeItem(storageKey(type, id));
  }
```

Leave `storageKey` at line 5 exactly as it is. Changing it would orphan every learner's existing saved code.

- [ ] **Step 7: Point `exercises.js` at the store**

Replace `assets/js/exercises.js:141-160` with:

```js
  function saveAnswer(exerciseId, answer) {
    const pagePath = getCurrentPagePath();
    window.ProgressStore.setItem(`exercise_${pagePath}_${exerciseId}`, answer);
  }

  function loadAnswer(exerciseId) {
    const pagePath = getCurrentPagePath();
    return window.ProgressStore.getItem(`exercise_${pagePath}_${exerciseId}`) || '';
  }
```

- [ ] **Step 8: Make the baker inject the two new scripts before `core.js`**

In `scripts/bake_layout.py`, inside `normalize_scripts`, after the `icons.js` block (around line 428) and before the lesson-runner block, add:

```python
    # Progress store must load before core.js / exercises.js / lesson-runner.js,
    # all of which call window.ProgressStore.
    if 'storage-keys.js' not in html and 'motion.js' in html:
        html = html.replace(
            '<script defer src="/assets/js/motion.js"></script>',
            '<script defer src="/assets/js/storage-keys.js"></script>\n'
            '    <script defer src="/assets/js/progress-store.js"></script>\n'
            '    <script defer src="/assets/js/motion.js"></script>',
            1,
        )
```

Because all these tags are `defer`, they execute in document order, so `storage-keys.js` → `progress-store.js` → `core.js` is guaranteed.

- [ ] **Step 9: Re-bake and hand-patch `index.html`**

Run: `python scripts/bake_layout.py`

`normalize_scripts` returns early for root `index.html` (line 398), so add the two tags there by hand, immediately before the existing `<script defer src="/assets/js/core.js"></script>` at `index.html:69`:

```html
    <script defer src="/assets/js/storage-keys.js"></script>
    <script defer src="/assets/js/progress-store.js"></script>
```

- [ ] **Step 10: Verify no regression in a real browser**

Run: `python3 -m http.server 8080`

Check each of these with an empty `localStorage`, then again with data present:
1. Open `/units/unit-1.html` — a "Marked Unit 1 as completed" toast fires, `pypath-completed-units` becomes `[1]`.
2. Open `/curriculum.html` — the unit-1 card shows the `completed` class and the global progress bar reads 10%.
3. Open a lesson such as `/units/unit-1/first-program.html`, type in the editor, reload — the code is still there.
4. Answer an exercise, reload — the answer is still there.
5. Console shows no `ProgressStore is undefined` error on any page.

- [ ] **Step 11: Run the full suite**

Run: `npm test && python scripts/check_links.py && python scripts/check_meta.py`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: route all progress reads and writes through ProgressStore"
```

---

### Task 4: Firebase project, config module, and security rules

Configuration plus the rules that are the actual authorization boundary. Rules ship with tests before any client code can write a document.

**Files:**
- Create: `assets/js/firebase-config.js`
- Create: `firestore.rules`
- Create: `firebase.json`
- Create: `.firebaserc`
- Test: `tests/rules/firestore-rules.test.js`
- Modify: `vitest.config.js`

**Interfaces:**
- Consumes: nothing
- Produces: ES module `assets/js/firebase-config.js` exporting `auth`, `db`, and `SDK_VERSION`.

**Manual prerequisite — do this in the Firebase console before Step 1:**
1. Create a Firebase project.
2. Authentication → Sign-in method → enable **Email/Password**, **Google**, **GitHub**. GitHub requires registering an OAuth app at `https://github.com/settings/developers` with callback URL `https://<project-id>.firebaseapp.com/__/auth/handler`, then pasting its client ID and secret into Firebase.
3. Authentication → Settings → Authorized domains → add `mypypath.com`, `www.mypypath.com`. `localhost` is present by default.
4. Firestore Database → Create database → **production mode** (rules from this task replace the defaults).
5. Project settings → Your apps → Web app → copy the config object.

- [ ] **Step 0: Keep the rules suite out of the default test run**

`vitest.config.js` from Task 0 uses `include: ['tests/**/*.test.js']`, which matches `tests/rules/` at any depth. The rules tests need a live Firestore emulator, so leaving them in the default run would make bare `npm test` fail for anyone without one. They already have their own `test:rules` script that wraps them in `firebase emulators:exec`.

Change `vitest.config.js` to:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Rules tests need a live Firestore emulator. Run them via `npm run test:rules`.
    exclude: ['node_modules/**', 'tests/rules/**'],
  },
});
```

`exclude` replaces Vitest's defaults rather than extending them, which is why `node_modules/**` is listed explicitly.

Because `test:rules` invokes `vitest run tests/rules` with an explicit path, and an explicit path argument still respects `exclude`, also change the `test:rules` script in `package.json` to pass a config override:

```json
"test:rules": "firebase emulators:exec --only firestore \"vitest run tests/rules --exclude node_modules/**\""
```

Verify both halves before continuing:

Run: `npm test`
Expected: PASS, and the output must NOT list any file under `tests/rules/`.

- [ ] **Step 1: Write the failing rules tests**

`tests/rules/firestore-rules.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

describe('users subtree', () => {
  it('lets a user write their own progress', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [1] })
    );
  });

  it('lets a user read their own progress', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/state/progress')));
  });

  it("denies reading another user's progress", async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/state/progress')));
  });

  it("denies writing another user's progress", async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [99] })
    );
  });

  it("denies reading another user's saved code", async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/code/lesson__a')));
  });

  it('denies all access to unauthenticated clients', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/alice/state/progress')));
    await assertFails(setDoc(doc(db, 'users/alice/state/progress'), { completedUnits: [1] }));
  });

  it('denies access to collections outside the users tree', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'anything/else'), { x: 1 }));
  });
});

describe('code document limits', () => {
  it('accepts a normal-sized code document', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/code/lesson__a'), {
        localKey: 'pypath-lesson-/a.html-editor-1',
        content: 'print("hi")',
        updatedAt: Date.now(),
      })
    );
  });

  it('rejects a code document over the 100 KB cap', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/code/lesson__big'), {
        localKey: 'pypath-lesson-/big.html-editor-1',
        content: 'x'.repeat(100 * 1024 + 1),
        updatedAt: Date.now(),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec --only firestore "npx vitest run tests/rules"`
Expected: FAIL — `ENOENT: ... 'firestore.rules'`

- [ ] **Step 3: Write `firestore.rules`**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read, write: if isOwner(uid);

      match /state/{docId} {
        allow read, write: if isOwner(uid);
      }

      match /code/{docId} {
        allow read, delete: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && request.resource.data.content is string
          && request.resource.data.content.size() <= 102400;
      }
    }
  }
}
```

Everything not matched above is denied. That is the default and it is intentional.

- [ ] **Step 4: Write `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8081 },
    "ui": { "enabled": true }
  }
}
```

Firestore uses 8081 because 8080 is the `python3 -m http.server` port used for local site serving.

- [ ] **Step 5: Write `.firebaserc`**

Substitute the real project id created in the prerequisite.

```json
{
  "projects": {
    "default": "REPLACE_WITH_FIREBASE_PROJECT_ID"
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore "npx vitest run tests/rules"`
Expected: PASS, 9 tests.

- [ ] **Step 7: Write `assets/js/firebase-config.js`**

Substitute the real values from the console. These are public by design — the security boundary is `firestore.rules` plus the Authorized Domains list, not secrecy of this config.

```js
/* PyPath — Firebase initialization. ES module; the SDK requires it.
   This config is public by design. Access control lives in firestore.rules
   and in the Firebase console's Authorized Domains list. */

export const SDK_VERSION = '11.1.0';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

const { initializeApp } = await import(`${BASE}/firebase-app.js`);
const { getAuth } = await import(`${BASE}/firebase-auth.js`);
const { initializeFirestore, persistentLocalCache } =
  await import(`${BASE}/firebase-firestore.js`);

const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Offline persistence: a signed-in learner who loses connectivity keeps
// working and syncs on reconnect.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
```

- [ ] **Step 8: Verify the module loads in a browser**

Add temporarily to `settings.html` before `</body>`:

```html
<script type="module">
  import { auth, db } from '/assets/js/firebase-config.js';
  console.log('[pypath] firebase ok', !!auth, !!db);
</script>
```

Run: `python3 -m http.server 8080`, open `http://localhost:8080/settings.html`
Expected: console logs `[pypath] firebase ok true true` with no CORS or 404 errors. Remove the temporary script afterward.

- [ ] **Step 9: Commit**

```bash
git add assets/js/firebase-config.js firestore.rules firebase.json .firebaserc tests/rules/
git commit -m "feat: add Firebase config, Firestore security rules, and rules tests"
```

---

### Task 5: Auth module and sync adapter

**Files:**
- Create: `assets/js/auth.js`
- Create: `assets/js/sync.js`
- Test: `tests/merge.test.js`
- Create: `assets/js/merge.js`

**Interfaces:**
- Consumes: `auth`, `db` from `firebase-config.js` (Task 4); `window.ProgressStore` and `window.PyPathKeys` (Tasks 1, 3)
- Produces:
  - `assets/js/merge.js` → global `window.PyPathMerge` with `mergeCompletedUnits(local: number[], remote: number[]) -> number[]` and `pickNewer(local: {content, updatedAt} | null, remote: {content, updatedAt} | null) -> {content, updatedAt} | null`
  - `assets/js/auth.js` → exports `signUpWithEmail(email, password)`, `signInWithEmail(email, password)`, `signInWithGoogle()`, `signInWithGitHub()`, `sendReset(email)`, `signOutUser()`, `currentUser()`. Dispatches `pypath:auth` on `document` with `detail: { user }`.
  - `assets/js/sync.js` → self-installing; listens for `pypath:auth` and calls `window.ProgressStore._setRemoteAdapter(...)`.

- [ ] **Step 1: Write the failing merge tests**

`tests/merge.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/merge.js', 'utf8')).call(window);
});

describe('mergeCompletedUnits', () => {
  it('unions both sides', () => {
    expect(window.PyPathMerge.mergeCompletedUnits([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });

  it('is never destructive when remote is empty', () => {
    expect(window.PyPathMerge.mergeCompletedUnits([1, 2], [])).toEqual([1, 2]);
  });

  it('is never destructive when local is empty', () => {
    expect(window.PyPathMerge.mergeCompletedUnits([], [4])).toEqual([4]);
  });

  it('returns numbers sorted ascending', () => {
    const out = window.PyPathMerge.mergeCompletedUnits([10, 2], [1]);
    expect(out).toEqual([1, 2, 10]);
    expect(typeof out[0]).toBe('number');
  });

  it('coerces string input to numbers', () => {
    expect(window.PyPathMerge.mergeCompletedUnits(['1'], [2])).toEqual([1, 2]);
  });
});

describe('pickNewer', () => {
  it('prefers the higher updatedAt', () => {
    const local = { content: 'new', updatedAt: 200 };
    const remote = { content: 'old', updatedAt: 100 };
    expect(window.PyPathMerge.pickNewer(local, remote).content).toBe('new');
  });

  it('prefers remote when remote is newer', () => {
    const local = { content: 'old', updatedAt: 100 };
    const remote = { content: 'new', updatedAt: 200 };
    expect(window.PyPathMerge.pickNewer(local, remote).content).toBe('new');
  });

  it('returns the only side present when the other is null', () => {
    const only = { content: 'x', updatedAt: 1 };
    expect(window.PyPathMerge.pickNewer(only, null)).toBe(only);
    expect(window.PyPathMerge.pickNewer(null, only)).toBe(only);
  });

  it('returns null when both are null', () => {
    expect(window.PyPathMerge.pickNewer(null, null)).toBe(null);
  });

  it('prefers remote on an exact timestamp tie, so devices converge', () => {
    const local = { content: 'L', updatedAt: 100 };
    const remote = { content: 'R', updatedAt: 100 };
    expect(window.PyPathMerge.pickNewer(local, remote).content).toBe('R');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/merge.test.js`
Expected: FAIL — `ENOENT: ... 'assets/js/merge.js'`

- [ ] **Step 3: Write `assets/js/merge.js`**

```js
/* PyPath — pure merge rules for reconciling local and remote learner state. */
(function () {
  'use strict';

  function mergeCompletedUnits(local, remote) {
    var all = [].concat(local || [], remote || []).map(Number)
      .filter(function (n) { return !isNaN(n); });
    return Array.from(new Set(all)).sort(function (a, b) { return a - b; });
  }

  function pickNewer(local, remote) {
    if (!local && !remote) return null;
    if (!local) return remote;
    if (!remote) return local;
    // Tie goes to remote so every device converges on the same value.
    return (local.updatedAt > remote.updatedAt) ? local : remote;
  }

  window.PyPathMerge = {
    mergeCompletedUnits: mergeCompletedUnits,
    pickNewer: pickNewer
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/merge.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write `assets/js/auth.js`**

```js
/* PyPath — Firebase Auth wrapper. Dispatches `pypath:auth` on document so no
   UI file has to import Firebase. */
import { auth, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} = await import(`${BASE}/firebase-auth.js`);

let user = null;

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

export function currentUser() { return user; }

export async function signUpWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export async function signInWithGitHub() {
  const cred = await signInWithPopup(auth, new GithubAuthProvider());
  return cred.user;
}

export async function sendReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

onAuthStateChanged(auth, (next) => {
  user = next;
  document.dispatchEvent(
    new CustomEvent('pypath:auth', { detail: { user: next } })
  );
});

// A failed auth bootstrap must never take a lesson page down.
window.addEventListener('unhandledrejection', (e) => {
  if (String(e.reason || '').includes('firebase')) {
    toast('Sign-in is unavailable right now');
  }
});
```

- [ ] **Step 6: Write `assets/js/sync.js`**

```js
/* PyPath — installs a Firestore remote adapter into ProgressStore whenever a
   user is signed in, and merges local state into remote on sign-in. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc, setDoc, collection, getDocs, deleteDoc } =
  await import(`${BASE}/firebase-firestore.js`);

const KEYS = window.PyPathKeys;
const MERGE = window.PyPathMerge;
const STORE = window.ProgressStore;
const DEBOUNCE_MS = 1500;

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

function makeAdapter(uid) {
  const pending = new Map();
  let timer = null;

  async function flush() {
    timer = null;
    const batch = Array.from(pending.entries());
    pending.clear();

    for (const [key, value] of batch) {
      try {
        if (key === KEYS.COMPLETED_UNITS_KEY) {
          await setDoc(
            doc(db, `users/${uid}/state/progress`),
            { completedUnits: JSON.parse(value || '[]'), updatedAt: Date.now() },
            { merge: true }
          );
        } else if (value === null) {
          await deleteDoc(doc(db, `users/${uid}/code/${KEYS.toDocId(key)}`));
        } else {
          await setDoc(doc(db, `users/${uid}/code/${KEYS.toDocId(key)}`), {
            localKey: key,
            content: value,
            updatedAt: Date.now(),
          });
        }
      } catch (e) {
        // Local write already succeeded. Retry happens on the next write.
        toast('Progress saved on this device; sync will retry');
      }
    }
  }

  return {
    push(key, value) {
      pending.set(key, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
  };
}

async function mergeOnSignIn(uid) {
  const localSnapshot = STORE.snapshot();

  // 1. Completed units — set union, never destructive.
  let remoteUnits = [];
  try {
    const snap = await getDoc(doc(db, `users/${uid}/state/progress`));
    if (snap.exists()) remoteUnits = snap.data().completedUnits || [];
  } catch (e) { /* offline: keep local, sync later */ }

  const localUnits = STORE.getCompletedUnits();
  const mergedUnits = MERGE.mergeCompletedUnits(localUnits, remoteUnits);
  STORE.setCompletedUnits(mergedUnits);

  // 2. Code documents — newest updatedAt wins, per key.
  const remoteByKey = new Map();
  try {
    const codeSnap = await getDocs(collection(db, `users/${uid}/code`));
    codeSnap.forEach((d) => {
      const data = d.data();
      if (data.localKey) remoteByKey.set(data.localKey, data);
    });
  } catch (e) { /* offline */ }

  const allKeys = new Set([
    ...Object.keys(localSnapshot),
    ...remoteByKey.keys(),
  ]);
  allKeys.delete(KEYS.COMPLETED_UNITS_KEY);

  for (const key of allKeys) {
    const localVal = localSnapshot[key];
    const local = localVal === undefined
      ? null
      : { content: localVal, updatedAt: 0 };
    const winner = MERGE.pickNewer(local, remoteByKey.get(key) || null);
    if (winner && winner.content !== localVal) {
      STORE.setItem(key, winner.content);
    }
  }
}

document.addEventListener('pypath:auth', async (e) => {
  const user = e.detail.user;

  if (!user) {
    // Signed out: stop syncing, keep the local cache so the guest session works.
    STORE._setRemoteAdapter(null);
    return;
  }

  STORE._setRemoteAdapter(makeAdapter(user.uid));

  try {
    await setDoc(
      doc(db, `users/${user.uid}`),
      {
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    await mergeOnSignIn(user.uid);
  } catch (err) {
    toast('Working offline; progress is saved on this device');
  }
});
```

Note on `local.updatedAt = 0`: `localStorage` carries no timestamp, so on a
first sign-in any remote document wins over a local one. That is correct — a
remote document can only exist if this account already saved from some device,
whereas an untimestamped local value may be a stale leftover. Once signed in,
every write timestamps through the adapter.

- [ ] **Step 7: Add the modules to the baker**

In `scripts/bake_layout.py`, inside `normalize_scripts`, after the progress-store block from Task 3:

```python
    # Auth + sync are ES modules (the Firebase SDK requires it) and load after
    # the progress store, which they install an adapter into.
    if 'assets/js/auth.js' not in html and 'core.js' in html:
        html = html.replace(
            '<script defer src="/assets/js/core.js"></script>',
            '<script defer src="/assets/js/core.js"></script>\n'
            '    <script type="module" src="/assets/js/auth.js"></script>\n'
            '    <script type="module" src="/assets/js/sync.js"></script>',
            1,
        )
```

- [ ] **Step 8: Re-bake and hand-patch `index.html`**

Run: `python scripts/bake_layout.py`

Then add the same two module tags to `index.html` by hand after its `core.js` tag, since `normalize_scripts` returns early for root `index.html`.

- [ ] **Step 9: Verify sync end to end against the emulators**

Run: `npx firebase emulators:start --only auth,firestore` in one terminal and `python3 -m http.server 8080` in another.

1. Load `/units/unit-1.html` as a guest, confirm `pypath-completed-units` is `[1]` in localStorage.
2. Sign up via the temporary console snippet:
   `const m = await import('/assets/js/auth.js'); await m.signUpWithEmail('a@b.com','password123');`
3. In the Emulator UI at `http://localhost:4000`, confirm `users/<uid>/state/progress` holds `completedUnits: [1]`.
4. Clear localStorage, reload, sign in again — the unit-1 card is completed again.
5. Kill the emulators, edit a lesson editor, confirm a toast appears and the code still persists locally.

- [ ] **Step 10: Run the full suite**

Run: `npm test && npx firebase emulators:exec --only firestore "npx vitest run tests/rules"`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add Firebase auth wrapper and Firestore progress sync"
```

---

### Task 6: Auth pages and header integration

**Files:**
- Create: `login.html`
- Create: `signup.html`
- Create: `account.html`
- Create: `assets/js/auth-ui.js`
- Create: `assets/css/auth.css`
- Modify: `scripts/bake_layout.py` (`header_html`, `nav_active`)
- Modify: `sitemap.xml` (via `scripts/generate_sitemap.py`)

**Interfaces:**
- Consumes: everything exported by `auth.js` (Task 5)
- Produces: a header `.account-menu` element whose state tracks `pypath:auth`; three new pages

- [ ] **Step 1: Add the account control to the baked header**

In `scripts/bake_layout.py:149`, replace the single CTA line with:

```python
          <a href="/units/unit-1/what-is-python.html" class="btn btn-primary header-cta route">Start learning</a>
          <div class="account-menu" data-account-menu>
            <a href="/login.html" class="btn btn-ghost account-signin route" data-account-signin>Sign in</a>
            <button type="button" class="account-avatar" data-account-avatar hidden aria-haspopup="menu" aria-expanded="false">
              <img src="/assets/img/placeholder-avatar.svg" alt="" width="28" height="28" data-account-photo>
            </button>
            <div class="account-panel" data-account-panel role="menu" hidden>
              <a href="/progress.html" class="route" role="menuitem">My progress</a>
              <a href="/account.html" class="route" role="menuitem">Account</a>
              <button type="button" data-account-signout role="menuitem">Sign out</button>
            </div>
          </div>
```

The signed-out state is the default in markup, so a guest with JavaScript disabled still sees a working "Sign in" link.

- [ ] **Step 2: Write `assets/js/auth-ui.js`**

```js
/* PyPath — header account control. Reacts to `pypath:auth`. */
import { signOutUser } from '/assets/js/auth.js';

const menu = document.querySelector('[data-account-menu]');
if (menu) {
  const signin = menu.querySelector('[data-account-signin]');
  const avatar = menu.querySelector('[data-account-avatar]');
  const photo = menu.querySelector('[data-account-photo]');
  const panel = menu.querySelector('[data-account-panel]');

  document.addEventListener('pypath:auth', (e) => {
    const user = e.detail.user;
    signin.hidden = !!user;
    avatar.hidden = !user;
    if (user && user.photoURL) photo.src = user.photoURL;
  });

  avatar.addEventListener('click', () => {
    const open = !panel.hidden;
    panel.hidden = open;
    avatar.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) {
      panel.hidden = true;
      avatar.setAttribute('aria-expanded', 'false');
    }
  });

  menu.querySelector('[data-account-signout]').addEventListener('click', async () => {
    await signOutUser();
    window.PyUI && window.PyUI.showToast('Signed out');
  });
}
```

- [ ] **Step 3: Write `login.html`**

Copy the `<head>`, header, and footer structure from `settings.html` so the baker recognizes it, and use this as the `<main>` body:

```html
<main class="container auth-page">
  <h1>Sign in</h1>
  <form id="login-form" class="auth-form" novalidate>
    <label for="login-email">Email</label>
    <input id="login-email" type="email" autocomplete="email" required>

    <label for="login-password">Password</label>
    <input id="login-password" type="password" autocomplete="current-password" required>

    <button type="submit" class="btn btn-primary">Sign in</button>
    <p class="auth-error" id="login-error" role="alert" hidden></p>
  </form>

  <div class="auth-providers">
    <button type="button" class="btn btn-ghost" id="login-google">Continue with Google</button>
    <button type="button" class="btn btn-ghost" id="login-github">Continue with GitHub</button>
  </div>

  <p><a href="#" id="login-reset" class="link">Forgot your password?</a></p>
  <p>No account? <a href="/signup.html" class="route">Create one</a></p>
</main>

<script type="module">
  import { signInWithEmail, signInWithGoogle, signInWithGitHub, sendReset }
    from '/assets/js/auth.js';

  const err = document.getElementById('login-error');
  function fail(e) {
    err.hidden = false;
    err.textContent = e && e.code === 'auth/invalid-credential'
      ? 'That email and password do not match an account.'
      : 'Could not sign in. Please try again.';
  }
  function done() { window.location.href = '/progress.html'; }

  document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    try {
      await signInWithEmail(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
      done();
    } catch (e) { fail(e); }
  });

  document.getElementById('login-google')
    .addEventListener('click', async () => { try { await signInWithGoogle(); done(); } catch (e) { fail(e); } });
  document.getElementById('login-github')
    .addEventListener('click', async () => { try { await signInWithGitHub(); done(); } catch (e) { fail(e); } });

  document.getElementById('login-reset').addEventListener('click', async (ev) => {
    ev.preventDefault();
    const email = document.getElementById('login-email').value;
    if (!email) { err.hidden = false; err.textContent = 'Enter your email first.'; return; }
    try {
      await sendReset(email);
      window.PyUI && window.PyUI.showToast('Password reset email sent');
    } catch (e) { fail(e); }
  });
</script>
```

- [ ] **Step 4: Write `signup.html`**

Same shell as `login.html`, with this `<main>`:

```html
<main class="container auth-page">
  <h1>Create your account</h1>
  <p class="auth-note">Your progress on this device carries over automatically.</p>
  <form id="signup-form" class="auth-form" novalidate>
    <label for="signup-email">Email</label>
    <input id="signup-email" type="email" autocomplete="email" required>

    <label for="signup-password">Password</label>
    <input id="signup-password" type="password" autocomplete="new-password"
           minlength="8" required aria-describedby="signup-hint">
    <p class="auth-hint" id="signup-hint">At least 8 characters.</p>

    <button type="submit" class="btn btn-primary">Create account</button>
    <p class="auth-error" id="signup-error" role="alert" hidden></p>
  </form>

  <div class="auth-providers">
    <button type="button" class="btn btn-ghost" id="signup-google">Continue with Google</button>
    <button type="button" class="btn btn-ghost" id="signup-github">Continue with GitHub</button>
  </div>

  <p>Already have an account? <a href="/login.html" class="route">Sign in</a></p>
</main>

<script type="module">
  import { signUpWithEmail, signInWithGoogle, signInWithGitHub }
    from '/assets/js/auth.js';

  const err = document.getElementById('signup-error');
  function fail(e) {
    err.hidden = false;
    if (e && e.code === 'auth/email-already-in-use') {
      err.textContent = 'That email already has an account. Try signing in.';
    } else if (e && e.code === 'auth/weak-password') {
      err.textContent = 'Please choose a password of at least 8 characters.';
    } else {
      err.textContent = 'Could not create the account. Please try again.';
    }
  }
  function done() { window.location.href = '/progress.html'; }

  document.getElementById('signup-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    try {
      await signUpWithEmail(
        document.getElementById('signup-email').value,
        document.getElementById('signup-password').value
      );
      window.PyUI && window.PyUI.showToast('Check your email to verify your address');
      done();
    } catch (e) { fail(e); }
  });

  document.getElementById('signup-google')
    .addEventListener('click', async () => { try { await signInWithGoogle(); done(); } catch (e) { fail(e); } });
  document.getElementById('signup-github')
    .addEventListener('click', async () => { try { await signInWithGitHub(); done(); } catch (e) { fail(e); } });
</script>
```

- [ ] **Step 5: Write `account.html`**

Same shell, with this `<main>`:

```html
<main class="container auth-page">
  <h1>Account</h1>

  <div id="account-guest" hidden>
    <p>You are browsing as a guest. <a href="/login.html" class="route">Sign in</a>
       to sync your progress across devices.</p>
  </div>

  <div id="account-signed-in" hidden>
    <form id="account-form" class="auth-form">
      <label for="account-name">Display name</label>
      <input id="account-name" type="text" autocomplete="name">
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
    <p>Signed in as <span id="account-email"></span></p>
    <button type="button" class="btn btn-ghost" id="account-signout">Sign out</button>
  </div>
</main>

<script type="module">
  import { signOutUser } from '/assets/js/auth.js';
  import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
  const { doc, setDoc } =
    await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);

  const guest = document.getElementById('account-guest');
  const signedIn = document.getElementById('account-signed-in');
  let uid = null;

  document.addEventListener('pypath:auth', (e) => {
    const user = e.detail.user;
    uid = user ? user.uid : null;
    guest.hidden = !!user;
    signedIn.hidden = !user;
    if (user) {
      document.getElementById('account-email').textContent = user.email || '';
      document.getElementById('account-name').value = user.displayName || '';
    }
  });

  document.getElementById('account-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!uid) return;
    try {
      await setDoc(doc(db, `users/${uid}`), {
        displayName: document.getElementById('account-name').value,
        updatedAt: Date.now(),
      }, { merge: true });
      window.PyUI && window.PyUI.showToast('Saved');
    } catch (e) {
      window.PyUI && window.PyUI.showToast('Could not save right now');
    }
  });

  document.getElementById('account-signout').addEventListener('click', async () => {
    await signOutUser();
    window.location.href = '/';
  });
</script>
```

Both states start `hidden`, so nothing flashes before `pypath:auth` fires.

- [ ] **Step 6: Write `assets/css/auth.css`**

```css
.auth-page { max-width: 28rem; padding-block: 3rem; }
.auth-form { display: grid; gap: .5rem; margin-block: 1.5rem; }
.auth-form label { font-weight: 600; }
.auth-form input {
  padding: .6rem .75rem;
  border: 1px solid var(--border, #d0d0d8);
  border-radius: .5rem;
  background: var(--bg-elev, #fff);
  color: inherit;
}
.auth-hint { font-size: .875rem; opacity: .75; margin: 0; }
.auth-error { color: var(--danger, #c0392b); font-size: .9rem; }
.auth-providers { display: grid; gap: .5rem; margin-block: 1rem; }

.account-menu { position: relative; display: inline-flex; align-items: center; }
.account-avatar {
  border: 0; background: none; padding: 0; cursor: pointer; line-height: 0;
}
.account-avatar img { border-radius: 50%; }
.account-panel {
  position: absolute; right: 0; top: calc(100% + .5rem); z-index: 40;
  display: grid; min-width: 11rem; padding: .35rem;
  background: var(--bg-elev, #fff);
  border: 1px solid var(--border, #d0d0d8);
  border-radius: .6rem;
  box-shadow: 0 8px 24px rgb(0 0 0 / .12);
}
.account-panel a, .account-panel button {
  padding: .5rem .6rem; text-align: left; border: 0; background: none;
  color: inherit; cursor: pointer; border-radius: .4rem; font: inherit;
}
.account-panel a:hover, .account-panel button:hover {
  background: var(--bg-subtle, #f2f2f5);
}
```

- [ ] **Step 7: Bake the new pages and regenerate the sitemap**

No baker changes are needed. `main()` at `scripts/bake_layout.py:487` walks `ROOT.rglob('*.html')`, so the new files are picked up automatically, and `page_kind` at line 155 already returns `'page'` for any root-level HTML file — the same classification `settings.html` gets.

Run: `python scripts/bake_layout.py && python scripts/generate_sitemap.py`

Confirm the baker reports a higher file count than before and that each new page now carries the shared header and footer.

- [ ] **Step 8: Verify against the emulators**

Run emulators plus the static server, then:
1. `/login.html` — a wrong password shows "That email and password do not match an account."
2. `/signup.html` — a 5-character password is rejected client-side by `minlength` and server-side by `auth/weak-password`.
3. After signing in, the header shows an avatar instead of "Sign in"; the panel opens and closes, and closes on an outside click.
4. `/account.html` as a guest shows the guest block, not the form.
5. Sign out returns to `/` with the "Sign in" link restored.

- [ ] **Step 9: Run link and meta checks**

Run: `python scripts/check_links.py && python scripts/check_meta.py`
Expected: PASS. Add meta descriptions to the three new pages if `check_meta.py` flags them.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add login, signup, and account pages with header account menu"
```

---

### Task 7: Progress dashboard

**Files:**
- Create: `progress.html`
- Create: `assets/js/progress-page.js`
- Modify: `scripts/bake_layout.py` (register the page)

**Interfaces:**
- Consumes: `window.ProgressStore.getCompletedUnits()` (Task 3); `pypath:auth` (Task 5)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write `progress.html`**

Same page shell as the Task 6 pages, with:

```html
<main class="container progress-page">
  <h1>My progress</h1>

  <div id="progress-guest" hidden>
    <p>You are browsing as a guest. Your progress is saved on this device only.
       <a href="/signup.html" class="route">Create an account</a> to sync it everywhere.</p>
  </div>

  <section id="progress-body">
    <p class="progress-headline"><span id="progress-count">0</span> of 10 units complete</p>
    <div class="progress-global" role="progressbar" aria-label="Course progress"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="bar"></div>
    </div>
    <ul class="progress-units" id="progress-units"></ul>
    <p><a class="btn btn-primary route" id="progress-resume" href="/units/unit-1.html">Resume</a></p>
  </section>
</main>
<script defer src="/assets/js/progress-page.js"></script>
```

- [ ] **Step 2: Write `assets/js/progress-page.js`**

```js
/* PyPath — progress dashboard. Renders from ProgressStore, which works for
   guests and signed-in users alike. */
(function () {
  'use strict';

  var TOTAL_UNITS = 10;

  function render() {
    var completed = window.ProgressStore.getCompletedUnits();
    var percent = Math.round((completed.length / TOTAL_UNITS) * 100);

    document.getElementById('progress-count').textContent = String(completed.length);

    var bar = document.querySelector('.progress-page .progress-global .bar');
    var meter = document.querySelector('.progress-page .progress-global');
    if (bar && meter) {
      bar.style.width = percent + '%';
      meter.setAttribute('aria-valuenow', String(percent));
    }

    var list = document.getElementById('progress-units');
    list.innerHTML = '';
    var firstIncomplete = null;
    for (var n = 1; n <= TOTAL_UNITS; n++) {
      var done = completed.indexOf(n) !== -1;
      if (!done && firstIncomplete === null) firstIncomplete = n;

      var li = document.createElement('li');
      li.className = 'progress-unit' + (done ? ' completed' : '');

      var link = document.createElement('a');
      link.className = 'route';
      link.href = '/units/unit-' + n + '.html';
      link.textContent = 'Unit ' + n;
      li.appendChild(link);

      var status = document.createElement('span');
      status.className = 'progress-unit__status';
      status.textContent = done ? 'Complete' : 'Not started';
      li.appendChild(status);

      list.appendChild(li);
    }

    var resume = document.getElementById('progress-resume');
    var target = firstIncomplete === null ? TOTAL_UNITS : firstIncomplete;
    resume.href = '/units/unit-' + target + '.html';
    resume.textContent = firstIncomplete === null ? 'Review Unit 10' : 'Resume Unit ' + target;
  }

  document.addEventListener('DOMContentLoaded', render);

  // Re-render after sign-in, because the merge may have added units.
  document.addEventListener('pypath:auth', function (e) {
    document.getElementById('progress-guest').hidden = !!e.detail.user;
    setTimeout(render, 100);
  });
})();
```

- [ ] **Step 3: Verify in a browser**

Run: `python3 -m http.server 8080`

1. As a guest with `pypath-completed-units` set to `[1,3]`, `/progress.html` reads "2 of 10 units complete", the bar is 20%, units 1 and 3 show "Complete", and the resume button reads "Resume Unit 2".
2. With an empty store, the resume button reads "Resume Unit 1".
3. With all ten units complete, it reads "Review Unit 10".
4. The guest notice is visible when signed out and hidden when signed in.

- [ ] **Step 4: Register the page and re-run checks**

Run: `python scripts/bake_layout.py && python scripts/generate_sitemap.py && python scripts/check_links.py && python scripts/check_meta.py`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add progress dashboard page"
```

---

### Task 8: CI, privacy policy, and deployment notes

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `privacy.html`
- Modify: `DEPLOYMENT.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Add a Node job to CI**

Append to `.github/workflows/ci.yml`:

```yaml
  js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - name: Unit tests
        run: npm test
      - name: Firestore rules tests
        run: npx firebase emulators:exec --only firestore "npx vitest run tests/rules"
```

- [ ] **Step 2: Write `privacy.html`**

Public signup collects email addresses, so a policy is warranted. Use the standard page shell with a `<main>` covering: what is stored (email, display name, avatar URL, completed units, saved lesson code), who processes it (Google Firebase), that device preferences never leave the browser, how to delete an account, and a contact address.

- [ ] **Step 3: Link the policy from the footer**

In `scripts/bake_layout.py`, add a `<a href="/privacy.html" class="route">Privacy</a>` link to the `FOOTER` string at line 38, then re-bake.

- [ ] **Step 4: Document deployment**

Add to `DEPLOYMENT.md`: rules deploy with `npx firebase deploy --only firestore:rules`, and the Authorized Domains list in the Firebase console must include the production domains or every sign-in on production fails with `auth/unauthorized-domain`.

- [ ] **Step 5: Document local development**

Add to `README.md` a section covering `npm install`, `npm test`, `npx firebase emulators:start --only auth,firestore`, and the fact that `assets/js/firebase-config.js` holds public configuration rather than secrets.

- [ ] **Step 6: Run everything**

Run: `npm test && python scripts/check_links.py && python scripts/check_meta.py && npx firebase emulators:exec --only firestore "npx vitest run tests/rules"`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "ci: add JS and rules test jobs; docs: privacy policy and setup notes"
```

---

## Deferred, deliberately

- **Certificates.** Cut during design: lessons are graded in-browser by Pyodide, so no server witnesses genuine completion and any certificate would be self-attested.
- **Sandbox project sync.** `pypath-sandbox-projects` stays device-local.
- **Device preference sync.** Theme, font scale, and sidebar state are per-device by nature.
- **Account deletion self-service.** `account.html` shows how to request it; wiring `deleteUser` plus a recursive subtree delete needs a Cloud Function and Blaze billing.
