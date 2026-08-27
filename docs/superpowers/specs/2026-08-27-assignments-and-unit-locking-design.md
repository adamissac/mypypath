# Assignments, due dates, and configurable unit locking

Date: 2026-08-27
Status: awaiting sign-off
Related: `2026-08-18-content-gating-design.md` (the other lock on a unit page),
`2026-08-20-unit-tests-design.md` (the completion signal this reuses),
`docs/prompts/2026-08-27-classroom-assignments-and-grading-kickoff.md` (the brief)

First of three. The other two are `autograder-and-question-types` and
`ai-grading-backend`, and neither is designed here. This one adds no new deployed
component and no new dollar cost: new Firestore documents, new rules, new pure
functions, new panels.

## Goal

A teacher can say "finish Units 3 and 4, and the loops lesson, by Friday" and then see
who did it on time, who did it late, and who has not done it. Separately, a teacher can
choose how units open for their class: in order, by hand, or all at once.

## What this is, and what it is not

This is a lens on the event log that already exists. It is not a gradebook and it does
not create a second definition of "done". A lesson is done when `lessonState()` says
`passed` or `verified`, and a unit is done when `unitProgress().complete` is true, which
is the same rule the student's own progress page shows them. Assignments choose which of
those existing facts to put in a row with a date next to it.

It is also not proof of anything. `events.js` already says events are "evidence for
starting a conversation, not for ending one", and an assignment row inherits that in
full. The one thing that is genuinely trustworthy here is the clock: `firestore.rules`
pins every event's `at` to `request.time`, so "this was recorded on Thursday" is a server
fact rather than a client claim. What stays unproven is that the student is the person
who did the work. The UI must say the first without implying the second.

The unit lock is likewise a notice, not a wall. `insertLockNotice()` in
`lesson-progress.js` prepends a banner and leaves the lesson readable. That is what makes
the whole async problem below tractable, and it is not being changed.

## Decisions taken

Four questions were open in the brief. All four are answered, and the answers are
constraints on everything below.

1. **Class-wide only.** Assignments go to the whole class. Manual unlocks apply to the
   whole class. There is no per-student targeting in this iteration. The absence of an
   `assignedTo` field is deliberate and is called out in the data model so that adding
   one later reads as a decision rather than a gap somebody forgot to fill.
2. **Assigning implicitly unlocks.** A unit named by a live assignment is open to that
   class in every lock mode, for as long as the assignment exists. Marking a student
   late for work they could not reach is the one failure this feature must not have.
   The unlock is derived at read time, never stored, so deleting the assignment
   re-locks the unit with no cleanup step.
3. **Lock policy lives on the class document, cached per session.** `classes/{classId}`
   already allows `get` to any signed-in user, so a student's lesson page can read it
   under rules that already exist. A separate collection would need a new read rule and
   a second document read on every lesson page.
4. **`kind` becomes the question-type discriminator.** Not used in this spec, recorded
   here because it was decided at the same time. `assets/data/unit-tests/unit-*-mcq.json`
   currently carries `kind` values of `vocab` and `code` that nothing in `assets/js/`
   reads. Spec 2 takes the field over and strips those values.

## Data model

### New: `classes/{classId}/assignments/{assignmentId}`

```
title        string, 1..100
units        [number]     unit numbers assigned whole
lessonPaths  [string]     individual lesson paths, as in curriculum.json
dueAt        number       millis, teacher-chosen, so not request.time
createdAt    timestamp    == request.time
archived     bool
schemaVersion number
```

`units` and `lessonPaths` are both lists and either may be empty, but not both: an
assignment that requires nothing is a row that can never be satisfied. Lesson paths are
the same `/units/unit-N/slug.html` values `curriculum.json` and `UNITS` already key on.
There is no parallel lesson id.

`dueAt` is a client number rather than a server timestamp because a due date is a
statement about the future, and `request.time` can only describe the write. It is
teacher-authored data, not a record of when something happened, and nothing about
lateness depends on trusting it beyond the teacher who set it.

There is no `assignedTo`. See decision 1.

**Nothing is written per student.** No roster field, no new event type, no completion
record. Completion is computed from the event log the dashboard already reads. This is
the load-bearing privacy property of the feature: `TEACHER_CAN_SEE` in
`classroom-core.js` does not grow, because a teacher learns nothing about a student they
could not already see. `TEACHER_CANNOT_SEE` does not grow either. That is worth stating
plainly in the design rather than discovering in review.

### Changed: `classes/{classId}`

Two optional fields:

```
lockMode       'sequential' | 'manual' | 'free'
manualUnlocks  [number]     unit numbers opened by hand
```

Both absent means sequential with no overrides, which is exactly today's behavior, so
every class created before this change keeps working with no migration and no backfill.

`manualUnlocks` is a flat array of unit numbers rather than a map because there are ten
units and no per-student dimension. Ten small integers fit in a field, diff cleanly
against the rules' key allowlist, and there is nothing a map would buy.

### Retention, and what it costs this feature

Events expire at 180 days (`RETENTION.EVENT_DAYS`), enforced in the rules, not just the
client. Assignment completion is derived from events, so an assignment whose window has
passed loses its evidence.

Rather than silently redrawing a finished class as if nobody did anything, an assignment
whose `dueAt` is more than `EVENT_DAYS` in the past renders as **Records expired**
across every student, with the retention window named. "We deleted the evidence on
purpose" and "nobody did the work" are different facts and must not paint the same. The
assignment document itself survives until the class is archived and purged at 365 days,
so the teacher can still see what was asked.

## Rules

### `classes/{classId}` update allowlist

The existing update rule ends with
`hasOnly(['name','joinCode','teacherUids','createdAt','archived','schemaVersion'])`.
That allowlist is the only thing standing between "a teacher may rename their class" and
"a teacher may write anything to it", so it grows explicitly by `lockMode` and
`manualUnlocks`, plus:

```
(!('lockMode' in request.resource.data)
  || request.resource.data.lockMode in ['sequential', 'manual', 'free'])
```

The enum check is not decoration. The client resolves an unrecognized mode by falling
back to sequential, but a rule that accepts any string invites a future client that
treats "anything not sequential" as open, and a typo would then unlock the whole course
for a class. The three legal values are pinned where they are actually enforced.

### `classes/{classId}/assignments/{assignmentId}`

```
allow read: if isTeacherOf(classId) || isEnrolled(classId, request.auth.uid);
allow create, update: if isTeacherOf(classId) && wellFormed();
allow delete: if isTeacherOf(classId);
```

Students read, and must: their own progress page shows what is due, and the implicit
unlock in decision 2 is computed from these documents on the student's own machine.
`isEnrolled` checks for the student's roster document, which is the same consent
boundary every other read below `/classes` uses, and it does not depend on the assignment
document, so `list` resolves for a student as well as a teacher.

Students never write. An assignment a student can edit is not an assignment. There is
deliberately no student-writable completion field for the same reason, which the derived
model gets for free.

`wellFormed()` pins `createdAt == request.time`, caps `title` at 100, requires
`units` and `lessonPaths` to be lists, requires at least one of them to be non-empty, and
closes the key set with `hasOnly`.

New tests go in `tests/rules/classroom-rules.test.js` alongside the existing class and
roster cases: a teacher of another class denied, an enrolled student allowed read and
denied write, a signed-out request denied, an out-of-range `lockMode` denied, and an
update that tries to smuggle an extra key denied.

## Pure logic: additions to `classroom-core.js`

Everything below is a pure function over plain data, no I/O, testable with no DOM, in
the same file for the same reason the rest of the judgement is there: one place to argue
with when a teacher says a number looks wrong.

```
completedAt(events, target) -> number | null
```

`target` is `{ kind: 'lesson', path }` or `{ kind: 'unit', unit, lessonPaths }`. Returns
the **earliest** millisecond at which the existing completion rule first held, by
replaying the log in `at` order and asking after each event, or null if it never held.

Earliest, not latest, and this is the ratchet. "When did they finish" must not move
forward every time a student reopens a lesson they already passed, and a later worse
attempt must not be able to turn an on-time completion into a late one. Because the
function only ever reports the first moment the condition became true, both properties
hold without storing anything.

```
assignmentStatus(assignment, events, now) -> {
  parts: [{ kind, unit|path, title, done, completedAt }],
  doneCount, partCount,
  completedAt: number | null,
  state: 'done-on-time' | 'done-late' | 'not-due' | 'overdue' | 'expired',
  daysLate: number
}
```

- The assignment's `completedAt` is the **maximum** of its parts' completion times: it
  is not finished until the last required piece is.
- `done-late` when that maximum is after `dueAt`. `daysLate` is whole days rounded up,
  so one minute past the deadline is 1 day late and never 0.
- `overdue` when not done and `now > dueAt`. `not-due` when not done and `now <= dueAt`.
  The brief asks these two to be visually distinct and they are separate states, not a
  flag on one.
- `expired` when `dueAt` is more than `RETENTION.EVENT_DAYS` in the past, checked before
  anything else, per the retention section above.

Everything is computed from `(dueAt, completion timestamp or now)` at render time.
Nothing is stored, so a late marking can never get stuck stale because no job ran, and
moving a due date is correct immediately with no backfill.

```
assignmentUnlocks(assignments, now) -> [number]
```

Decision 2, as a function. Every assignment that exists and is not archived contributes
its `units`, plus `PyPathCurriculum.unitOf(path)` for each of its `lessonPaths`. `now` is
unused today and is taken anyway so that a later "only unlocks once due" variant is a
change inside this function rather than at every call site.

Live means "exists and is not archived", explicitly not "not yet past due". A student who
missed the deadline must still be able to open the work and do it late, which is the
whole point of tracking late separately from not-done.

## The lock: `classroom-policy.js` and `class-policy.js`

Split the way `classroom-core.js` and `classroom-dashboard.js` are split, and for the
same reason.

### `assets/js/classroom-policy.js`, a classic global on `window.PyPathPolicy`

```
MODES = ['sequential', 'manual', 'free']
normalizeMode(raw) -> one of MODES, defaulting to 'sequential'
resolveUnlocked(unit, policy, completedUnits, teaching) -> boolean
```

`policy` is `{ mode, manualUnlocks: [], assignmentUnlocks: [] }` or null. In order:

1. `teaching === true` returns true. First, before anything else, unchanged from today,
   and not negotiable: a teacher previewing unit 7 for tomorrow is not a learner.
2. `policy == null` falls through to the existing sequential rule. Null means "we do not
   know", which covers every guest, every signed-out reader, every offline page, and
   every signed-in student in no class. This is the fail-open case and it is the reason
   the function can stay synchronous.
3. Unit 1 is always open, in every mode. A class that manages to lock unit 1 has locked
   its students out of everything, which is never what anybody meant.
4. `mode === 'free'` returns true.
5. The unit appearing in `manualUnlocks` or `assignmentUnlocks` returns true, in every
   mode, including sequential.
6. `mode === 'manual'` returns false. In manual mode the teacher's list is the whole
   truth, which is what "overriding the sequential chain" in the brief has to mean if a
   teacher is to be able to re-lock something.
7. Otherwise the existing sequential rule: unit `N-1` in `completedUnits`.

### `isUnitUnlocked` keeps its signature

`isUnitUnlocked(unit, completedUnits, teaching)` gains a fourth **optional** argument,
`policy`, and delegates to `resolveUnlocked`. Every existing caller passes three
arguments, gets null for the fourth, and gets exactly today's answer, which is what the
existing tests assert.

This is why the policy arrives as a parameter rather than as a Firestore read inside the
function. The function stays pure, stays synchronous, stays testable with no DOM, and
keeps working for a guest with no network. The brief warns against bolting a read onto a
function that has none, and this is the shape that avoids it.

### `assets/js/class-policy.js`, an ES module

Shaped exactly like `membership.js` and `class-state.js`, which already answer
"which class" and "which teacher" with the same caching problem:

- Session-cached under `pypath-policy:<classId>`, so navigating twenty lessons costs one
  document read rather than twenty.
- Loaded once per sign-in; `force` re-reads, and join and leave update it in place.
- Announces `pypath:policy` with the resolved policy object, the way `role-nav.js`
  announces `pypath:role`.

`lesson-progress.js` listens for `pypath:policy`, holds the value in a module variable,
passes it as the fourth argument, and calls the existing `repaint()`. Until that event
arrives the value is null and the page renders today's answer.

**No timeout is needed here, unlike `gate.js`.** `gate.js` needs its 3-second timer
because failing to hear from auth would leave a permanent paywall over the content. Here
null already means the old sequential behavior, so a policy that never arrives is
indistinguishable from a class that never set one. Offline, blocked SDK, denied read:
all of them land on the pre-existing rule, which is the correct fail-open answer, and
they get there by doing nothing rather than by racing a timer.

**The late-arriving lock is not a flash-of-content problem.** In manual mode the policy
can close a unit that sequential would have opened, so the answer can get stricter after
first paint. That is acceptable here and would not be in `gate.js`, because this lock
prepends a notice and never removes the lesson. A notice appearing a moment after load is
a notice appearing a moment after load. No content is snatched away, so nothing has to be
hidden while the answer is pending.

## Teacher surfaces

Built with `.claude/skills/frontend-design`, matching the plain, information-dense
`cr-*` style already in `classroom.html`. No new visual language.

**Assignments section**, in `classroom.html` between the join code and needs-attention:
a list of assignments, each with title, due date, what is required, and a
done / late / not-done count, plus a create form (title, due date, unit checkboxes, and
lesson checkboxes inside an expanded unit).

**Mastery grid overlay**, in `classroom-dashboard.js`. Not a third disconnected table.
`MASTERY_MARK` exists because a grid that means nothing in greyscale means nothing to a
colourblind teacher and nothing on a printout, so the overlay follows the same rule and
is a character, not only a colour: a trailing `!` on the existing mark for assigned,
past due, not done, and a trailing `~` for done late. The scope picker gains an
"Assignment" scope so the grid can show one assignment's required items as its columns.

**Student detail**, in `student-detail.js`: an "Assigned to this class" block above the
existing per-lesson table, so "what I asked them to do" reads separately from
"everything they have explored".

**Unit access section**, in `classroom.html`: three radio buttons for the mode, and in
manual mode ten unit checkboxes. The copy states in as many words that free-roam does not
cancel assignments, because "everything is unlocked" quietly meaning "nothing is owed" is
the exact misreading this section invites.

**Honesty copy.** New `EXPLANATIONS` entries next to the existing ones, in the same
voice: `assignmentLate` explains that the completion time comes from the student's own
browser, stamped with server time on arrival, so the date is reliable and the authorship
is not; `lockMode` explains what each mode does and that assignments are unaffected by
free-roam; `assignmentExpired` names the 180-day window. `classroom-export.js` gains
assignment columns under the "Not a grade." footer it already prints.

**The legacy path is not extended.** `classroom-page.js` and its flat `roster/{uid}`
documents get nothing: no assignments, no lock modes, no new fields. A teacher with
students on both sees assignments only for students in a real class, and the legacy
table keeps the label the page already gives it. Building this twice would double every
future change to it.

## Files

| File | Change |
|---|---|
| `assets/js/classroom-policy.js` | new, `window.PyPathPolicy`, pure lock rules |
| `assets/js/class-policy.js` | new ES module, reads and caches the policy, fires `pypath:policy` |
| `assets/js/lesson-progress.js` | optional 4th arg on `isUnitUnlocked`, listens for `pypath:policy` |
| `assets/js/classroom-core.js` | `completedAt`, `assignmentStatus`, `assignmentUnlocks`, `EXPLANATIONS` |
| `assets/js/classroom-store.js` | assignment CRUD, `setLockPolicy` |
| `assets/js/classroom-dashboard.js` | assignments section, grid overlay, assignment scope, lock controls |
| `assets/js/student-detail.js` | "Assigned to this class" block |
| `assets/js/classroom-export.js` | assignment columns |
| `classroom.html` | assignments and unit-access sections |
| `assets/css/classroom.css` | new sections, the `!` and `~` marks |
| `firestore.rules` | assignments subcollection, wider class key allowlist |
| `scripts/bake_layout.py` | inject `classroom-policy.js` next to `curriculum.js` |
| `tests/classroom-policy.test.js` | new |
| `tests/classroom-core.test.js` | `completedAt`, `assignmentStatus`, `assignmentUnlocks` |
| `tests/lesson-progress.test.js` | the 4th argument, and that three arguments are unchanged |
| `tests/rules/classroom-rules.test.js` | assignment rules, `lockMode` enum |

## Testing

**Unit (vitest, no emulator).**

- `resolveUnlocked` across the full matrix: three modes, times teacher/learner, times
  unit 1 / a sequentially earned unit / an unearned unit, times in/out of
  `manualUnlocks`, times in/out of `assignmentUnlocks`. Explicit cases for null policy
  equalling today's answer, and for an unrecognized mode string resolving to sequential.
- `isUnitUnlocked` called with three arguments returns what it returns today. This is a
  regression test for the whole compatibility claim and should read as one.
- `completedAt`: never completed returns null; completed once returns that time; a later
  worse attempt does not move it; a later better attempt does not move it either.
- `assignmentStatus`: on-time, one minute late reading as 1 day, several days late,
  overdue, not-due, expired, and a multi-part assignment taking the max of its parts.
- `assignmentUnlocks`: units, lesson paths mapped through `unitOf`, archived excluded,
  past-due still included.

**Rules (`npm run test:rules`, against the emulator).** The cases listed under Rules
above.

**Browser (`.claude/skills/webapp-testing`, served with `npm run serve`).** The brief
names `scripts/with_server.py`; it does not exist in this repo, and `npm run serve` is
the helper.

1. Teacher creates an assignment for unit 3 and a unit-4 lesson due tomorrow. It appears
   in the list with the right required items.
2. A student who has finished unit 3 shows done-on-time; one who has not shows not-due;
   after moving the due date into the past, the same student shows overdue and the grid
   cell carries the `!`.
3. A student who finished after the due date shows done-late with the day count, and the
   cell carries the `~`.
4. Switch the class to manual, unlock only units 1 and 5, reload a unit-3 lesson as an
   enrolled student: the lock notice appears after the policy arrives, and the lesson
   text is still readable underneath it.
5. Same student on unit 5: no notice.
6. Switch to free-roam: no notice on any unit, and the assignment from step 1 still shows
   as due.
7. Assign unit 7 while the class is in manual mode with unit 7 locked: the student can
   open unit 7 with no notice. Delete the assignment: the notice comes back.
8. With the Firestore SDK blocked, an enrolled student sees exactly today's sequential
   behavior and no error.
9. A signed-out guest and a signed-in student in no class both see today's behavior.

## Out of scope

Per-student assignments and per-student unlocks, by decision 1. New question types and
the `kind` discriminator, which are spec 2. AI grading, which is spec 3. Notifications,
email, or any reminder that leaves the browser. Grade weighting, points, or anything that
turns an assignment into a mark. Any change to the legacy `roster/{uid}` path. Any change
to what an event contains or to the retention windows.
