# Assignments and Unit Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If that plugin is unavailable, work the tasks in order, tests first, one commit per task.

**Goal:** A teacher can assign units and lessons with a due date and see done-on-time, done-late, overdue and not-due per student; and can set the class lock mode to sequential, manual, or free-roam.

**Architecture:** All judgement is pure and lives in `classroom-core.js` (assignment status) and a new `classroom-policy.js` (lock rules). All I/O lives in `classroom-store.js` (teacher writes) and a new `class-policy.js` ES module (the student's cached read). `lesson-progress.js` gains one optional argument and one event listener, and keeps every existing behavior byte for byte.

**Tech Stack:** ES5-style global JS for the pure halves, ES modules for anything touching Firebase, Vitest + jsdom, `@firebase/rules-unit-testing` against the emulator.

**Design:** `docs/superpowers/specs/2026-08-27-assignments-and-unit-locking-design.md`. Read it first; this plan does not restate the reasoning.

## Global Constraints

- `MODES = ['sequential', 'manual', 'free']`, defined once in `classroom-policy.js` and read from `window.PyPathPolicy.MODES` everywhere else, including the rules test that pins the enum.
- A null policy always resolves to today's sequential answer. Guest, offline, blocked SDK, denied read and "no class" are all the same case and all fail open.
- `teaching === true` wins before every other check.
- Unit 1 is always unlocked, in every mode.
- A unit named by a live assignment is unlocked in every mode. Live means exists and not archived, never "not yet due".
- Nothing about completion or lateness is stored. Both are computed at render time from `(dueAt, completion timestamp or now)`.
- `completedAt` reports the earliest moment a completion rule first held, never the latest. This is the ratchet.
- No new field on any student document. No addition to `TEACHER_CAN_SEE`.
- The legacy `roster/{uid}` path in `classroom-page.js` is not touched.
- ASCII quotes only, no em dashes, no new dependencies.

---

### Task 1: `classroom-policy.js` -- the pure lock rules

**Files:** Create `assets/js/classroom-policy.js`, `tests/classroom-policy.test.js`

**Interfaces:** Produces `window.PyPathPolicy` with `MODES`, `normalizeMode(raw)`, `resolveUnlocked(unit, policy, completedUnits, teaching)`.

- [x] **Step 1:** Write `tests/classroom-policy.test.js` covering the full matrix from the design doc's Testing section: three modes x teacher/learner x unit 1 / earned / unearned x in and out of `manualUnlocks` and `assignmentUnlocks`, plus null policy equalling the sequential answer and an unrecognized mode falling back to sequential.
- [x] **Step 2:** Run `npx vitest run tests/classroom-policy.test.js`, expect ENOENT.
- [x] **Step 3:** Write `assets/js/classroom-policy.js` implementing the seven ordered checks in the design doc.
- [x] **Step 4:** Run the test, expect PASS.
- [x] **Step 5:** Commit.

---

### Task 2: `isUnitUnlocked` takes an optional policy

**Files:** Modify `assets/js/lesson-progress.js`, `tests/lesson-progress.test.js`

**Interfaces:** Consumes `window.PyPathPolicy`. `isUnitUnlocked(unit, completedUnits, teaching, policy)`; the first three arguments behave exactly as today.

- [x] **Step 1:** Add tests asserting three-argument calls are unchanged, and that a fourth argument delegates to `resolveUnlocked`. The unchanged-behavior test is the regression guard for the whole compatibility claim.
- [x] **Step 2:** Run, expect the fourth-argument tests to fail.
- [x] **Step 3:** Delegate to `PyPathPolicy.resolveUnlocked` when it is present, keeping the inline sequential rule as the fallback for a page where the new file did not load.
- [x] **Step 4:** Run the full suite, expect PASS.
- [x] **Step 5:** Commit.

---

### Task 3: assignment status in `classroom-core.js`

**Files:** Modify `assets/js/classroom-core.js`, `tests/classroom-core.test.js`

**Interfaces:** Produces `completedAt`, `assignmentStatus`, `assignmentUnlocks` and three new `EXPLANATIONS` keys on `window.PyPathClassroom`.

- [x] **Step 1:** Write the tests listed in the design doc: never/once/worse-later/better-later for `completedAt`; on-time, one minute late reading as 1 day, several days, overdue, not-due, expired, and multi-part taking the max for `assignmentStatus`; units, lesson paths, archived excluded, past-due included for `assignmentUnlocks`.
- [x] **Step 2:** Run, expect FAIL.
- [x] **Step 3:** Implement. `completedAt` replays the log in `at` order and returns the first moment the existing `lessonState` / `unitProgress` rule held.
- [x] **Step 4:** Run, expect PASS.
- [x] **Step 5:** Commit.

---

### Task 4: rules for assignments and the lock mode

**Files:** Modify `firestore.rules`, `tests/rules/classroom-rules.test.js`

- [x] **Step 1:** Write the rules tests: teacher of the class may create, read, update, delete; a teacher of another class may not; an enrolled student may read and list but not write; a signed-out request is denied; `lockMode` outside the enum is denied; an update carrying an unlisted key is denied.
- [x] **Step 2:** Run `npm run test:rules`, expect FAIL.
- [x] **Step 3:** Add the `assignments` subcollection match and widen the `classes` update allowlist by `lockMode` and `manualUnlocks` with the enum check.
- [x] **Step 4:** Run, expect PASS.
- [x] **Step 5:** Commit.

---

### Task 5: store functions

**Files:** Modify `assets/js/classroom-store.js`

**Interfaces:** `createAssignment`, `readAssignments`, `updateAssignment`, `deleteAssignment`, `setLockPolicy`.

- [x] **Step 1:** Implement, matching the existing module's shape: `ClassroomError` for user-facing refusals, `serverTimestamp()` for `createdAt`, `schemaVersion: version()`.
- [x] **Step 2:** Commit.

---

### Task 6: `class-policy.js` -- the student's cached read

**Files:** Create `assets/js/class-policy.js`

**Interfaces:** `currentPolicy()`, `loadPolicy(classId, force)`, fires `pypath:policy`.

- [x] **Step 1:** Write it in the shape of `membership.js`: session cache under `pypath-policy:<classId>`, empty string as a real answer, `force` to skip the cache, failures leaving the value null rather than caching an offline result.
- [x] **Step 2:** Wire `lesson-progress.js` to listen for `pypath:policy` and repaint. No timer: null already means today's behavior.
- [x] **Step 3:** Inject `classroom-policy.js` in `scripts/bake_layout.py` next to `curriculum.js`, re-bake, confirm idempotent.
- [x] **Step 4:** Run `npm test`, expect PASS.
- [x] **Step 5:** Commit.

---

### Task 7: teacher UI

**Files:** Modify `classroom.html`, `assets/js/classroom-dashboard.js`, `assets/js/student-detail.js`, `assets/js/classroom-export.js`, `assets/css/classroom.css`

Use `.claude/skills/frontend-design`; match the existing `cr-*` style.

- [x] **Step 1:** Assignments section and create form in `classroom.html`.
- [x] **Step 2:** Unit access section: three radios, ten checkboxes in manual mode, copy stating free-roam does not cancel assignments.
- [x] **Step 3:** Render both in `classroom-dashboard.js`; add the grid overlay (`!` past due not done, `~` done late) and the assignment scope.
- [x] **Step 4:** "Assigned to this class" block in `student-detail.js`.
- [x] **Step 5:** Assignment columns in `classroom-export.js`, under the existing "Not a grade." footer.
- [x] **Step 6:** Styles. Every mark must survive greyscale.
- [x] **Step 7:** Commit.

---

### Task 8: verification

- [x] **Step 1:** `npm test`, expect PASS.
- [x] **Step 2:** `npm run test:rules`, expect PASS.
- [x] **Step 3:** Browser verification with `.claude/skills/webapp-testing`, served by `npm run serve`. Walk the nine numbered scenarios in the design doc's Testing section.
- [x] **Step 4:** Commit.
- [ ] **Step 5:** Deploy the rules: `npx firebase deploy --only firestore:rules`. This
  task changed `firestore.rules`, and the push to `main` does not carry it — Vercel
  ships the client code while production keeps enforcing the old rules. Skipping this
  is what made "Create class" fail on the live site with `permission-denied` while
  every local check passed.
