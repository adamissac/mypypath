# Teacher-assignable quizzes

Date: 2026-08-31
Status: awaiting sign-off
Related: `2026-08-27-assignments-and-unit-locking-design.md` (the assignment model this
extends rather than parallels), `2026-08-27-autograder-and-question-types-design.md`
(the five question kinds this finally makes reachable),
`2026-08-20-unit-tests-design.md` (the graded exam this is deliberately *not*)

Adds no new deployed component and no new cost: one new event type, one optional field
on a document that already exists, one new page, and content that is already authored.

## Goal

A teacher can say "answer these ten questions about Unit 3 by Friday", pick the
questions, and then see who did it, who was late, and what they scored — in the same
table where every other piece of set work already appears.

## What this is, and what it is not

Three systems already exist and this connects them. It does not build any of them again.

- **`question-types.js`** already marks five kinds — `mcq`, `multi`, `match`, `order`,
  `blank` — with partial credit. Matching already exists. It has simply never been
  reachable from anything a teacher can assign.
- **`question-render.js`** already draws all five, keyboard-answerable, no drag and drop.
- **`createAssignment()`** already schedules work with a due date, and
  `assignmentStatus()` already computes on-time/late/overdue/expired against the event
  log, with the retention-expiry case handled.

What this is **not**:

- **Not the end-of-unit test.** `unit-test.js` stays exactly as it is, including the
  earlier decision that it does not use the newer question kinds. Nothing here touches
  it.
- **Not the per-lesson quiz.** `lesson-quiz.js` is three to five MCQs at the foot of a
  lesson, unlimited, explicitly ungraded, and says so in its own comment. This sits
  beside it. A student will meet both and they must not feel like the same thing — see
  *Telling the three apart*.
- **Not a gradebook.** A quiz score is an event, the same as everything else the class
  view reads. It is a record of what the site saw.

## Decision 1: questions come from a bank, not an authoring UI

**Decided: a teacher picks from questions already authored for that unit. There is no
question-authoring UI in this version.**

The case for the bank is mostly that it already exists and nobody noticed. There are
**550 authored, reviewed questions** sitting in `assets/data/unit-tests/unit-N-mcq.json`
— fifty per unit for all ten units, each with a prompt, choices, an answer and an
explanation. A teacher building a ten-question quiz on Unit 3 is choosing from fifty
questions written for Unit 3 by whoever wrote the course. That is a real feature on day
one for every unit, with no content work and no new storage.

The case against authoring, beyond scope: teacher-authored questions have to *live*
somewhere. With no backend and no CMS, that means Firestore documents holding
free-text prompts and answer keys, which brings validation of a shape
`question-types.js` will later be asked to mark, a size budget, an injection surface in
a field rendered into other students' pages, and an edit/version story for a quiz that
has already been sat. Each of those is answerable; none is answerable *cheaply*; and
none of them is what "assign a quiz about Unit 3" needs in order to be useful. Authoring
is a coherent second feature and should be designed as one.

### The bank is wider than the MCQ pool

One wrinkle the bank alone does not solve: all 550 pool questions are `kind: "mcq"` (500
explicitly, 50 by the default). So a quiz drawn purely from the pool would never show a
matching question, and "matching questions already exist" would stay technically true
and practically invisible.

So the bank is the union of two sources, read by one loader:

- `assets/data/unit-tests/unit-N-mcq.json` — the existing pool, unchanged, untouched by
  this work. Also still the source for the end-of-unit test, which must keep behaving
  identically.
- `assets/data/quiz-bank/unit-N.json` — **new**, and the home for the newer kinds. Same
  question shape `question-types.js` already marks, so no new schema.

This shipped seeded for **units 1–3**, with the rest recorded below as outstanding
content work. That gap is now closed: **all ten units** carry six authored questions each
— two matching, one choose-several, two fill-the-blank, one ordering — so every unit
offers all five kinds from the picker, not just fifty MCQs.

The reason the gap was worth closing rather than living with: a teacher assigning a quiz
on Unit 7 got only MCQs, which is precisely the thing this feature existed to move past.
"Every unit has a usable bank" was true and beside the point.

Every authored key is checked by test against the real scorers — the key scores full
marks, a deliberately wrong answer does not, a fill-the-blank has exactly as many gaps as
blanks, a matching question has as many options as rows, ids are unique across all sixty,
and every question carries an explanation, since the review screen shows it. An answer
index typed one out is the realistic content bug and nothing else would catch it.

The teacher-facing picker still names which kinds a unit offers rather than leaving a
teacher to discover them, which stays useful if a future unit is added before its bank.

## Decision 2: a quiz is an assignment, not a parallel structure

**Decided: extend the existing assignment document with an optional `quiz` field. No
`classes/{classId}/quizzes` collection.**

The assignment model already owns due dates, `dueAt` validation, the widen-unlocks-first
ordering that stops a student meeting assigned-but-locked work, archival, the retention
expiry case, and `assignmentStatus()` with its tested on-time/late/overdue/expired logic
and its `daysLate` rounding. A second collection would need every one of those again,
and the failure mode is not that the second copy is missing something — it is that the
two drift, and a teacher ends up with two "due Friday" lists that disagree about what
late means.

So an assignment gains one optional field:

```js
{
  title: 'Loops check',
  units: [],            // as today
  lessonPaths: [],      // as today
  quiz: {               // NEW, optional
    unit: 3,
    questionIds: ['u3-m01', 'u3-m14', 'q3-match-1', ...],
    passMark: 70,       // per quiz; the unit test's 70 is not assumed
    attempts: 0         // 0 = unlimited; see Decision 4
  },
  dueAt: 1756...,
  archived: false
}
```

`createAssignment()` today requires at least one unit or lesson target. That rule
becomes: at least one unit, lesson, **or** quiz. A quiz-only assignment is the common
case; a mixed one ("finish Unit 3 *and* sit this quiz") falls out for free and is
genuinely useful, so it is allowed rather than forbidden.

`assignmentStatus()` gains a `quiz` part alongside its `unit` and `lesson` parts,
completed by a `quiz.submitted` event carrying this assignment's id. Everything
downstream — the dashboard column, the roster's "work done" count, the CSV export, the
new .xlsx export's Assignments sheet — then works with no further change, because they
all read `assignmentStatus()`.

## Decision 3: grading is client-side, and says so

**Decided: `question-types.js` marks the quiz in the student's browser, and the score
travels as a `quiz.submitted` event through the same validated path as everything else.**

There is no other option that is honest. There are no Cloud Functions in this project;
`firestore.rules` cannot execute a marking rule; and the answer key ships inside the
bank JSON the page fetches, so a determined student can read it. This is the same tier
as every other client-side gate here, and the same tier the end-of-unit test already
runs at — `firestore.rules` already says so at length in its `THE UNIT LOCK` note, and
that framing is reused rather than re-argued.

What that means concretely, and what the teacher-facing copy must say without dressing
it up: **a quiz score is a record of what the site saw in the student's browser, not a
proctored result.** The `trust` explanation in `classroom-core.js` already says exactly
this about every event, in those words. A quiz is not a special case and must not be
presented as a stronger one.

The rules do enforce what they can, which is not nothing:

- `quiz.submitted` joins the `validEvent()` type list, so an unknown type is still
  rejected.
- It joins `countsForCredit()`, so `unitAllowed()` refuses a quiz submission for a unit
  that is shut to the class. A teacher's "By hand" list is enforced server-side for
  quizzes exactly as it is for tests.
- `at == request.time` still pins the timestamp, so "submitted late" cannot be forged by
  a wrong client clock — which matters more here than usual, because lateness is the
  thing this feature reports.

What they cannot enforce: the score itself, and the attempt count. Both are stated in
the code comment beside the rule, in the same voice as the existing `NOT ENFORCED HERE`
note about `maxTestAttempts`.

## Decision 4: unit locking applies; `maxTestAttempts` does not

**Decided: a quiz respects unit locking. It does *not* inherit `maxTestAttempts`; it
carries its own `attempts`, set by the teacher when they create it, defaulting to
unlimited.**

Locking is easy and not really a choice: a student must not be quizzed on a unit their
class has not opened, and `countsForCredit()` already gives that for free once
`quiz.submitted` is in the list. It is also the safer default — a teacher who assigns a
quiz on a locked unit has almost certainly made a mistake, and the existing
widen-unlocks-before-write ordering in `createAssignment()` already prevents the common
version of it.

Retakes are the real choice, and the argument that decides it is a copy argument.
`maxTestAttempts`' own teacher-facing explanation reads: *"How many times a student in
this class may sit the same **end-of-unit test**."* If quizzes silently inherited it,
that sentence would become false the day this ships, and the teacher who set "2" would
have set something they were never shown. Changing the copy to cover both would be worse
still: it would mean one number governing a summative exam and a Tuesday check, which
are not the same decision.

So `attempts` lives on the quiz, is chosen at the moment the teacher is thinking about
that quiz, and defaults to unlimited — the same default `maxTestAttempts` has, and the
same behaviour as every class that never touches the setting.

The cap is client-side, like `maxTestAttempts`, and the same note says so.

## Telling the three apart

A student now has three things that ask them questions. If they cannot tell which is
which, the ungraded one will be treated as an exam and the assigned one will be skipped.

| | Where | Graded | Attempts | Counts toward |
|---|---|---|---|---|
| Lesson quiz | Foot of a lesson | No, explicitly | Unlimited | Nothing |
| **Assigned quiz** | `/quiz.html?a=<id>` | Yes, recorded | Teacher's choice | The assignment |
| End-of-unit test | `/unit-test.html?unit=N` | Yes | `maxTestAttempts` | Unlocking the next unit |

The quiz page states its own row of that table before the first question: what it is,
whether it counts, how many attempts are left, and when it is due. The end-of-unit test
page already does the equivalent, and this copies the pattern rather than inventing one.

A quiz score does **not** unlock the next unit. Only the end-of-unit test does that, and
adding a second route to unlocking would quietly change what "Unit 3 complete" means to
every other surface that reads it.

## Data model

```
classes/{classId}/assignments/{assignmentId}
  quiz: {
    unit:        int 1..10
    questionIds: string[]  (1..25, ids from that unit's bank)
    passMark:    int 0..100
    attempts:    int 0..10   (0 = unlimited)
  }

classes/{classId}/students/{uid}/events/{eventId}
  type: 'quiz.submitted'
  unit: int                       (so unitAllowed() can read it)
  payload: {
    assignmentId: string
    score:        int 0..100      (percent, as test.submitted already uses)
    correct:      int
    total:        int
    attempt:      int
  }
```

`score` is a percentage rather than a raw count so it reads the same way
`test.submitted.score` does and needs no second interpretation in the dashboard.

## Rules

`firestore.rules` changes, all inside the existing events block:

1. `'quiz.submitted'` added to `validEvent()`'s type list.
2. `'quiz.submitted'` added to `countsForCredit()`, so `unitAllowed()` gates it.
3. A comment saying what is and is not enforced, mirroring the existing note.

The assignment document's `quiz` map needs a shape rule, in the same style as the
existing assignment validation, so a teacher client cannot write an unbounded blob into
a document every student in the class reads.

**Deploying rules is a separate step from pushing the site** (`CLAUDE.md`, and the
lesson `47533a6` already learned). The verification task ends with the rules deploy
command handed to the user, not run for them.

## Surfaces

**Teacher** — inside the existing "Set new work" expander in `classroom.html`, not a new
section. The form gains a kind toggle: *Units and lessons* (today's form) or *A quiz*.
Choosing a quiz reveals a unit picker, the question list for that unit with checkboxes
and a kind badge on each, a pass mark, and an attempts select. The dashboard's existing
assignment column then shows it with no further work.

**Student** — a new `quiz.html`, taking `?a=<assignmentId>`. It reads the assignment,
loads the bank, renders through `question-render.js`, marks through `question-types.js`,
writes one `quiz.submitted`, and shows the score with per-question feedback. It refuses
to open for a locked unit, reusing `unit-test-page.js`'s `blockedReason()` shape.

Where a student *finds* it: the "what your class has asked of you" panel on the account
page already lists assignments, and a quiz assignment gets a link there. An assignment a
student cannot reach is the failure this repo already fixed once, in `dcc32f6`.

## Files

New:

- `assets/js/quiz-bank.js` — loads and merges the two bank sources, pure where it can be
- `assets/js/quiz-page.js` — the student quiz page
- `quiz.html`
- `assets/data/quiz-bank/unit-{1..10}.json` — the newer kinds, one file per unit
- `assets/css/quiz.css`

Changed:

- `assets/js/classroom-store.js` — `createAssignment()` accepts and validates `quiz`
- `assets/js/classroom-core.js` — `assignmentStatus()` grows a quiz part; a
  `quizScores()` reader for the dashboard
- `assets/js/events.js` — the new type in `EVENT_TYPES`
- `assets/js/classroom-dashboard.js` + `classroom.html` — the teacher form
- `assets/js/account-class.js` — the student's link to it
- `firestore.rules`

Untouched, deliberately: `unit-test.js`, `unit-test-page.js`, `lesson-quiz.js`.

## Testing

- **Pure**: bank loading and merging, quiz validation in `createAssignment()`, the new
  `assignmentStatus()` part, scoring a mixed-kind quiz end to end.
- **Rules, against the emulator**: a student may write `quiz.submitted` for an open unit;
  may not for a unit their class has shut; may not write one with a bad shape; a teacher
  may not write one into a student's log.
- **Three angles on the cap**, the same coverage `maxTestAttempts` and the unit lock
  already use: capped and refused, allowed through, and a self-study student unaffected.
- **Browser**: a teacher creates a quiz assignment, a student opens it, answers a
  matching question and an MCQ, submits, and the score appears in the teacher's
  assignment column and in the .xlsx export's Assignments sheet.

## Out of scope

- A question-authoring UI (Decision 1) — the coherent next feature.
- ~~`quiz-bank/` content for units 4–10~~ — done; all ten units are authored.
- Changing the end-of-unit test to use the newer kinds. That decision stands as left.
- Any server-side marking. There is no server (Decision 3).
