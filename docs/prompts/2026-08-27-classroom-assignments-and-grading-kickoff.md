# Kickoff prompt: assignments, unit locking, and a real autograder for PyPath

Paste everything below this line to Claude Code, run from the root of the `mypypath` repo.

---

## How to use this

Do not start implementing from this prompt directly. This is a **brief**, not a spec. Your
first job is to turn it into the same two-document shape the rest of this repo already
uses (`docs/superpowers/specs/*-design.md` then `docs/superpowers/plans/*.md`), get sign-off
on the design, then build it task-by-task with tests written first. Everything below is
organized to give you what a design doc needs: the problem, the constraints, the decisions
already made, and the decisions still open.

This is a big brief covering three workstreams. Do not write one design doc for all three.
Split it into separate specs and plans, in this order, and get each one reviewed before
starting the next:

1. `assignments-and-unit-locking` — the due-date/assignment system and the three locking modes.
2. `autograder-and-question-types` — the new deterministic question types (matching, ordering,
   fill-in-the-blank, multi-select) plus the reflection/short-answer/property-check grading gap.
3. `ai-grading-backend` — the serverless grading service the second spec depends on. Split out
   because it is the one piece that adds a new deployed component (see "New infrastructure"
   below) and has an ongoing dollar cost the other two don't.

## Required skills and plugins

- **`superpowers` plugin** — `docs/superpowers/plans/*.md` already require
  `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to
  execute a plan, and the design docs follow a `superpowers:writing-plans`-style shape. That
  plugin is not vendored into this repo (`.claude/skills/` only has `webapp-testing` and
  `frontend-design`), so it must be installed at the CLI level. If it is not available when you
  start, say so before writing anything, rather than inventing a different plan format —
  consistency with the existing two plans matters more than picking a new template.
- **`.claude/skills/webapp-testing`** (already installed) — use it for every manual browser
  verification step (this is a static site with no dev server framework; `scripts/with_server.py`
  is the helper). Every task that touches rendered UI needs a browser-verification step in the
  plan, matching how Task 4 of `2026-08-18-content-gating.md` does it.
- **`.claude/skills/frontend-design`** (already installed) — use it for the new teacher-facing
  surfaces (the assignment builder, the lock-mode controls, the new question-type renderers, the
  AI-feedback panel). The existing `classroom.html` / `cr-*` UI has a clear, plain, information-
  dense style; match it rather than importing a different visual language for the new panels.
- **No other MCP connectors or plugins are needed for the first two specs.** The third
  (`ai-grading-backend`) needs an Anthropic API key provisioned as a Vercel environment
  variable — that's a deployment/secrets step, not a Claude Code skill, and it's the one thing
  in this brief you cannot fully finish inside the coding session; flag it as a manual step in
  that plan's final task.

## Ground truth about this codebase

Verify all of this by reading the files yourself before relying on it — this is a map, not a
substitute for reading the territory — but it should save you the archaeology.

**Stack.** Static HTML/CSS/vanilla ES5 JS, no build step, no framework. Firebase Auth +
Firestore for identity and sync. Pyodide for in-browser Python execution. Deployed to Vercel as
a plain static site (`vercel.json` has no build command). `firebase.json` configures Firestore
rules and emulators only — there is no Firebase Hosting and no Cloud Functions today.
Tests are Vitest (`npm test`) plus a separate Firestore-rules suite against the emulator
(`npm run test:rules`, in `tests/rules/`).

**There is no server today, and that is a deliberate, load-bearing decision.**
`firestore.rules` has a comment: "Written entirely by clients, because this project has no
Cloud Functions. Everything a server would normally guarantee has to be a rule here or it is not
guaranteed at all." Every constraint in this brief that needs a real backend (see the AI grading
section) is an *exception* to that rule and should be justified as one in its own spec, not
folded quietly into the client-only pattern the rest of the app uses.

**Two parallel teacher-facing systems exist. Build on the live one, not the legacy one.**
`classroom.html` loads both `classroom-page.js` (flat `roster/{uid}` docs keyed by `teacherUid`,
no multi-class support, a certificate-approval workflow, a single wide table) and
`classroom-dashboard.js` + `classroom-store.js` + `student-detail.js`
(`classes/{classId}/roster/{uid}/{events,progress}` subcollections, multi-class, co-teachers,
archive/purge, a mastery grid, a needs-attention table, a class summary block). The page itself
labels the first one "Students who joined before classes existed" — it is the legacy path kept
alive for pre-existing enrollments. **Everything in this brief extends the second system**
(`classes/{classId}/...`, `classroom-core.js`, `classroom-store.js`, `classroom-dashboard.js`,
`student-detail.js`). Do not add assignments, locking, or new question types to the legacy
`roster/{uid}` path. If a design decision needs to touch the legacy path (for example, because a
teacher has students on both), say so explicitly rather than silently extending both systems in
parallel, which would double every future change.

**Unit/topic identity is a URL path, not an id.** `curriculum.js`'s `UNITS` map and
`assets/data/curriculum.json`'s flat `lessons` array both key everything off `path`
(`/units/unit-N/slug.html`), matching `location.pathname`. New assignment records should target
the same `path` values — don't invent a parallel lesson-id scheme.

**Locking already exists, but only in one mode, and only from the student's own local state.**
`lesson-progress.js`'s `isUnitUnlocked(unit, completedUnits, teaching)` is a pure function: unit 1
is always open, every later unit needs unit `N-1` in the learner's own `completedUnits` list, and
a teacher account (`PyPathRoles.teachingNow()`) always sees everything unlocked. This runs
entirely client-side, synchronously, with **no network read** — it works offline and even for a
signed-out guest. Adding teacher-controlled lock modes means a lesson page has to learn, for an
enrolled student, whether their class overrides the default sequential rule — which means this
function's callers need a new (`classId`-aware, asynchronous, fail-open) input they don't have
today. Design this deliberately; don't just bolt a Firestore read onto a function that currently
has none.

**The end-of-unit test grading pipeline is already fairly rigorous — the weak points are
elsewhere.** `unit-test-page.js` runs FRQ code for real in an isolated Pyodide namespace, calls
the required function by name against hidden test cases the client never displays, and enforces a
shared line-budget timeout across the whole paper so one runaway case can't be gamed by splitting
work. This is not what needs replacing.

**Here is what actually lets a student "type random or lazy" and pass, today:**

1. **Reflection prompts have no grading at all.** In `lesson-progress.js`, `watchReflections()`
   marks a reflection item done the instant `input.value.trim()` is non-empty. Any text — a
   single character, keyboard mash, "asdf" — completes it. This is almost certainly the sharpest
   version of the problem you were asked to fix, and it's a bigger gap than the coding questions.
2. **`checker.js`'s "property case" checks are weak by design.** Cases built from `nonempty`,
   `min_lines`, `max_lines`, or `source_matches` (a regex against raw source) exist specifically
   for open-ended prompts with no single right answer, and they only check shape, never meaning.
   `source_matches` is trivially defeated by a comment containing the right substring.
3. **FRQ and check code-cases only check stdout/return value, never how it was produced.**
   Hidden cases raise the bar but a determined student can still hardcode enough branches to
   cover a small hidden set. There's no signal today that says "this output is right but the
   method is nonsense" the way a human grader would catch.
4. **`checks/*.json` has no `kind` field.** Question type is inferred structurally (does the case
   have `expect_stdout`? `call`+`expect`? one of the property keys?). That's fragile and it's
   exactly the file format the new question types (matching, ordering, fill-in-the-blank,
   multi-select) have to extend. Add an explicit `kind` discriminator now, with the current
   shape-inference kept as the fallback for files that don't set one, so nothing existing breaks.

**Everything is a ratchet, never a downgrade.** Best-score, best-check-result, and
`completedUnits` all only ever improve, never regress on a later worse attempt
(`mergeAttempt`, `recordBest`, `rollUpUnitNumber`). Any new "assignment completed" or
"AI grade" state needs the same property: a late resubmission that scores lower must not erase
an earlier passing grade, and a teacher's manual override must never be silently overwritten by a
later automated regrade.

**Privacy and COPPA retention are enforced in `firestore.rules`, not just in the client, and are
load-bearing.** `noContactDetails()`, `noRealNames()`, the explicit key-allowlists on every
write path, and the 180-day event / 365-day archived-class retention windows are all real rule
predicates, not client conventions — read the whole rules file (you already have it in front of
you if you're reading this after having explored the repo) before adding a single new collection
or field, and write the matching `tests/rules/*.test.js` cases the same way `firestore-rules.test.js`
and `classroom-rules.test.js` already do. Every new field a teacher can read needs to be added to
`TEACHER_CAN_SEE` in `classroom-core.js`, and if it's something a teacher explicitly *cannot* see,
it needs to be named in `TEACHER_CANNOT_SEE`. New AI-graded feedback text should be treated like
the code a student writes: something a teacher's dashboard can show a *result* of, not
necessarily the raw model output, unless you decide otherwise and say why in the design doc.

**Everything client-recorded carries an explicit "not proof" caveat, on purpose, everywhere.**
`events.js` has a `HONESTY NOTE` saying events are "evidence for starting a conversation, not for
ending one," `classroom-export.js` prints "Activity recorded by each student's own browser. Not
a grade." on every export, and `classroom-core.js`'s `EXPLANATIONS.trust` says the same. An AI
grade is not exempt from this: it's a second opinion generated from client-submitted text, not an
authority. Carry the same tone into any new UI, and give the teacher an explicit override for
any AI-assigned score (see "gradingOwnStudent" in the rules for the existing precedent — a
teacher already has exactly one narrow, key-allowlisted write path into a student's roster
document for grading; extend that pattern rather than inventing a new one).

**House style, matched file-by-file, not just described:** vanilla ES5 IIFEs with `'use strict'`,
plain objects exported on `window.PyPathXxx`, pure logic separated from DOM code the way
`classroom-core.js` is pure and `classroom-dashboard.js` is all rendering, comments that explain
*why* a rule exists rather than what the code does, ASCII quotes only, **no em dashes anywhere**
(use a comma, colon, or full stop — this is enforced by convention in every content file already
in the repo), and no new dependencies without a real reason (the whole `devDependencies` list is
four packages).

## Feature 1: assignments, due dates, and "late"

Today a teacher can see how far a student has gotten, but has no way to say "I want you to finish
Units 3 and 4, specifically the loops and conditionals lessons, by Friday" and then see who
did and who didn't. Build that.

**What an assignment is.** A teacher-created record scoped to a class, targeting one or more
units and/or one or more specific lesson paths within a unit (a "topic," in the terms you were
given — that's `curriculum.json`'s per-lesson `title`/`path`), assigned either to the whole class
or to specific students, with a due date. A student can have multiple active assignments at once
(don't assume one-assignment-at-a-time).

**What the teacher must be able to see.** For each assignment: who it's assigned to, what's
required, the due date, and per-student completion — done-on-time, done-late (with the actual
completion date and how many days late), or not-done (with "not-done and past due" visually
distinct from "not-done, not due yet"). This is a new lens on top of the existing "how far has
this student gotten overall" mastery grid, not a replacement for it — a student can be making
fine general progress while missing what was actually assigned. Fold this into the existing
`classroom-dashboard.js` mastery grid and `student-detail.js` drill-down rather than building a
third, disconnected table: an assigned-and-late cell should be visually distinguishable in the
grid teachers already read, and the per-student page should have a clear "what I assigned them"
section separate from "everything they've explored."

**Completion, for an assignment, means the existing completion signal for whatever was
assigned** — a lesson is done when `lessonState(...)` says `passed` or `verified` (see
`classroom-core.js`), a unit is done when `unitFinished` is true (lessons plus the unit test).
Don't invent a second definition of "done" for assignments; reuse the one that already exists and
that the student's own progress page already shows them.

**"Late" is a read-time computation, not a stored flag**, the same way `unitTestPassed` and
`lessonState` are computed from stored facts rather than cached — a late marking should never get
stuck stale because nobody re-ran a job. Compute it from `(assignment.dueAt, completion timestamp
or "now" if not yet done)` whenever the dashboard renders.

## Feature 2: configurable unit locking

Three modes, settable per class (confirm with the user whether it should also be overridable per
student, or per class only — see "Open questions"):

1. **Sequential (default; this is the current and only behavior).** Unit `N` opens once unit
   `N-1` is finished. No change needed here beyond making it a named, explicit mode rather than
   the only possibility.
2. **Manual.** The teacher explicitly unlocks or locks specific units, per student or for the
   whole class, overriding the sequential chain. A teacher should be able to open unit 7 for one
   advanced student while everyone else is still gated at unit 3, and should be able to re-lock
   something they opened by mistake.
3. **Free-roam.** Every unit is open to every student, in any order, so a curious student can
   read ahead — but assignments with due dates still apply and still show as late if missed. Free
   navigation and required work are independent axes: don't let "everything unlocked" quietly mean
   "nothing is actually owed."

**This has to reach `isUnitUnlocked` without breaking what already depends on it working
synchronously and offline.** The current function is pure and instant because it only reads local
state. A class's lock mode and any manual overrides live in Firestore, which means a lesson page
for an enrolled student now needs an async read before it can answer "is this locked" — and it
has to **fail open** the same way `gate.js`'s 3-second timeout does (a broken network must never
turn into a student locked out of something they've earned, and a teacher must always see
everything, exactly as today). Design the caching/staleness story explicitly: a plausible shape
is a small `classroom-policy.js` module that mirrors the class's lock settings into the same kind
of session-scoped cache `role-nav.js` already uses for the teacher role, refreshed on
`pypath:role`/class-change events rather than fetched on every page load.

## Feature 3: a real autograder, plus new question types

**Reflections and property-case checks are the priority**, per the codebase read above — that's
where "type anything and pass" is real today, more than in the FRQ/code path which already runs
tests. Build the grading upgrade to cover, in this order: reflections/short-answer prompts (zero
grading today) → property-case checks in `checker.js` (regex/shape only today) → an additional
review layer on top of the existing FRQ/code test-case execution (which stays as the primary,
trusted signal; the model adds a second opinion, it doesn't replace hidden-test-case grading).

**New question types.** At minimum: matching (pair items from two columns), ordering/sequencing
(arrange steps or lines of code into the correct order — a Parsons problem, which is a
particularly good fit for a Python course), fill-in-the-blank, and multi-select
(choose-all-that-apply, as distinct from single-answer MCQ). All four of these are
**deterministically gradable** — there's a right answer and no ambiguity — so they do not need
the AI grading backend; they need a renderer, a JSON shape, and a pure scoring function, the same
shape as `scoreMcq` in `unit-test.js`. Add the `kind` discriminator called out above to
`checks/*.json` and the unit-test pools as part of this, with existing shape-inference kept as
the no-`kind` fallback.

**AI grading, for the genuinely open-ended cases (reflections, short-answer, property checks, and
as a second opinion on FRQ code).** This needs a real backend — a Firebase ID token cannot be
trusted to authorize a client-held API key, and an Anthropic API key must never ship in
client-side JS. Add a Vercel serverless function (this project already deploys on Vercel; that's
the natural home, not a new Firebase Cloud Functions project) that:

- Verifies the caller's Firebase ID token server-side before doing anything.
- Accepts the question, the student's submission, and (for code) the deterministic test result
  already computed client-side, and returns a structured verdict: a score or pass/fail, brief
  feedback, and an explicit flag for "off-topic, incoherent, or a placeholder" so the teacher
  dashboard can call that out distinctly from "wrong but genuine attempt."
- Never returns the rubric, the model's raw reasoning, or (for code) the hidden test cases to the
  client — same withholding discipline `checker.js` already applies to hidden cases.
- Is rate-limited per student per day, logs its own usage somewhere the teacher or admin can see
  cost/volume, and gives the teacher a one-click override on any AI-assigned score (extending the
  existing `gradingOwnStudent` rules pattern rather than inventing a new write path).
- Fails toward "needs manual review," never toward a silent pass, if the API call errors or times
  out — the honesty-caveat pattern in this codebase always fails toward under-claiming, not
  over-claiming.

## Suggested phasing

1. Assignments + due dates + late marking + the three lock modes, on the existing question
   types. This is the highest-value, most-requested piece and needs no new infrastructure beyond
   new Firestore collections and rules.
2. The deterministic new question types (matching, ordering, fill-in-the-blank, multi-select) and
   the `kind` discriminator. Also no new infrastructure.
3. The AI grading backend and the reflection/property-check/FRQ-second-opinion grading it enables.
   This is the one phase with a new deployed component, an ongoing dollar cost, and a secret to
   provision — treat it as its own spec and plan, reviewed on its own.

## Open questions to raise with the user before finalizing the first design doc

- Can locking overrides be set per individual student, or only per whole class? The brief
  describes both ("unlock certain units and assignment[s], keeping others locked" reads as
  per-student).
- Can assignments target individual students, or only the whole class (or both)?
- When a locked unit is also assigned with a due date, should the assignment implicitly unlock
  it, or does the teacher have to unlock it separately? (Manual mode makes this concrete: if a
  teacher assigns unit 6 but unit 6 is still manually locked, what happens on the due date?)
- What's an acceptable per-student daily cap and rough monthly cost ceiling for the AI grading
  calls, and which model should the serverless function call? This determines the rate limit and
  the prompt budget for the spec in phase 3.
- Should an AI-graded reflection be retried by the student at will (matching the ratchet-best
  pattern everywhere else), or capped at some number of attempts before it requires a teacher's
  eyes?
