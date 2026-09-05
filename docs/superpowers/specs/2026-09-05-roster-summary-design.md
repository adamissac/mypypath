# The per-student roster summary

**Status:** design, for Phase 2 of the 2026-09-01 audit remediation.
**Problem it solves:** a dashboard load costs 500+ Firestore reads per student.
**Data model change:** yes — new subcollection, new rules.

---

## The problem, measured from the source

`classroom-dashboard.js`'s `loadClassData` fans out one read pair per student:

```js
return Promise.all(
  roster.map(async (row) => ({
    …
    events: await readEvents(classId, row.uid, 500).catch(() => []),
    mirror: await readMirror(classId, row.uid).catch(() => ({})),
  }))
);
```

`readEvents` is `limit(max || 500)` and the dashboard passes 500. `readMirror` is an **unbounded**
`getDocs` over `classes/{classId}/roster/{uid}/progress`, which grows with every syncable progress
key a student writes across ~80 lessons.

So one dashboard open costs, worst case, `(500 + |mirror|) × students`:

| Class size | Reads per open (events alone) |
|---|---|
| 1 | ~501 |
| 30 | ~15,030 |
| 50 | ~25,050 |

Firestore's Spark plan allows **50,000 document reads per day for the whole project, across all
users**. One teacher with a 50-student class opening their dashboard twice exhausts everybody's
quota for the day. This is not a rendering problem with a billing footnote; it is a data-access
problem, and it lands the first time a real classroom signs up.

> The audit brief said `limit(400)`. It is 500 — the three `limit(400)` calls in
> `classroom-store.js` are all in the purge paths. The real number is worse than the brief's.

### A free win found while measuring

`mirror` is read for **every student on every load** and consumed by **exactly one module**:
`student-detail.js`, the per-student drill-down. The roster grid never touches it —
`classroom-dashboard.js` mentions `.mirror` twice, at the read itself and at an empty placeholder
in `mergeRoster`.

So the entire unbounded half of the cost is paid on every load to serve a panel the teacher has
not opened. Making it lazy is independent of everything else in this document, needs no new data
model, and is the first commit of the implementation.

---

## What the grid actually needs

Everything the roster grid renders comes from six functions in `classroom-core.js`, all of which
take the raw event array:

| Function | What it answers |
|---|---|
| `lessonState(events, path, unitVerified)` | one cell: not-opened / in-progress / attempted / passed / verified |
| `verifiedUnits(events)` | which units carry a `unit.completed` with `verified: true` |
| `unitState(events, paths, unit)` | the weakest of a unit's lesson states |
| `unitProgress(events, paths, unit)` | lessons passed/started, test passed, percent |
| `percentComplete(events, lessonsByUnit)` | the overall column |
| `lastEventAt(events)` | the "last active" column and the inactivity filter |
| `assignmentStatus(assignment, events, opts)` | the assignment columns |

Reading those, the event log is used for exactly three kinds of fact:

1. **Per lesson:** the best `code.tests_passed` ratio, whether anything was tried at all, and the
   *earliest* timestamp at which it was fully passed.
2. **Per unit:** whether a `unit.completed` with `verified: true` exists and when it first did;
   whether a `test.submitted` cleared the pass mark and when it first did.
3. **Per quiz:** when an assignment's quiz was first completed.

Plus one scalar, `lastEventAt`.

That is the whole surface. Nothing else in the 500 events is read by the grid.

---

## The document

One document per student per class:

```
classes/{classId}/roster/{uid}/summary/current
```

A subcollection rather than a field on the roster row, because the roster row is created by the
join flow under a rule that pins its key set with `hasOnly([...])`, and because the roster row is
read by `watchRoster()`'s live listener — putting a payload that changes on every lesson event
inside a document that streams to every open dashboard would replace a read problem with a
listener problem.

```js
{
  schemaVersion: 3,
  updatedAt: <server timestamp>,

  // Per lesson. Key is the lesson path with '/' escaped the same way
  // PyPathKeys.toDocId escapes progress keys, so the map is injective.
  lessons: {
    'units__unit-1__what-is-python': {
      state: 'passed',          // the five states lessonState returns
      bestRatio: 1,             // best passed/total seen, 0..1
      firstPassAt: 1756...,     // millis, or absent if never fully passed
      touchedAt: 1756...,       // millis of the most recent event for it
    },
    …
  },

  // Per unit.
  units: {
    '1': {
      verifiedAt: 1756...,      // first unit.completed with verified:true, or absent
      testBest: { score: 18, total: 20 },
      firstTestPassAt: 1756..., // first test.submitted clearing the pass mark, or absent
    },
    …
  },

  // Per assignment quiz. Key is the assignment id.
  quizzes: { 'a7Kd…': 1756... },

  lastEventAt: 1756...,
}
```

### What is deliberately NOT in it

**Assignment status.** `classroom-core.js` is explicit that this is computed at render time and
never stored:

> Nothing here is stored. Late is computed at render time out of the due date and either the
> completion time or now […] A stored flag would go stale the moment nobody re-ran the job that
> set it, and a teacher would be looking at a late marking that stopped being true weeks ago.

That property is preserved exactly. The summary supplies the *completion timestamps*; the
assignment document supplies the due date; `assignmentStatus` still computes the rest at render.
A teacher who edits an assignment's due date sees the new lateness immediately, with no summary
rewrite. This is why the summary stores `firstPassAt` and friends rather than a `done` boolean.

**Percent.** Derivable from `lessons` plus the curriculum, and the curriculum changes when
lessons are added. A stored percent would silently mean "percent of the course as it was the last
time this student opened a lesson". Computed at render.

**Anything a teacher can already read cheaply.** `displayName`, `joinedAt` and `lastActiveAt` are
on the roster row, which is one read for the whole class. Certificates are one query for the whole
class. Neither is duplicated here.

### The ratchet

`firstPassAt`, `verifiedAt`, `firstTestPassAt` are **earliest, never latest**, and `testBest` and
`bestRatio` are **best, never latest**. This is the same ratchet `mergeAttempt`, `recordBest` and
`completedAt` already keep, and it is load-bearing rather than tidy: a student who reopens a passed
lesson and does badly has not un-finished it, and a completion date that moved could silently walk
a completion across a due date.

`state` is the one field that can move backwards under the ratchet — it is a function of
`bestRatio` and `touchedAt`, both of which only improve, so in practice it cannot regress either.

---

## Who writes it

The student's own browser, because there is nowhere else. There are no Cloud Functions in this
project and the owner has declined the Blaze plan, so every write in the system is made by a
client under its own credentials and constrained only by `firestore.rules`.

It is written in the same places progress is already recorded — wherever an event is appended —
debounced so that a lesson does not rewrite the summary on every keystroke-level event.

### What the rules can enforce

```
match /classes/{classId}/roster/{uid}/summary/{docId} {
  allow read:   if isOwner(uid) || isTeacherOf(classId);
  allow write:  if isOwner(uid)
                && isEnrolled(classId, uid)
                && docId == 'current'
                && request.resource.data.updatedAt == request.time
                && request.resource.data.keys().hasOnly(
                     ['schemaVersion','updatedAt','lessons','units','quizzes','lastEventAt']);
}
```

Owner-only write, teacher read, a pinned key set, and a server-stamped `updatedAt` so a student
cannot backdate a completion past a due date.

### What a determined student can still forge, stated plainly

**Everything else.** A student who opens the console can write themselves a summary saying every
lesson is passed, every unit verified, and every test scored full marks. The rules cannot tell a
real `firstPassAt` from an invented one, because the only evidence for it is a document the
student's own browser wrote.

This is the same honesty the project already applies to `maxTestAttempts`, the solutions toggle,
and sequential unlocking:

> Sequential stays a client-side chain […] A rule that consulted either would be asking the
> student whether the student may proceed.

What limits the damage is that **the summary is a cache, not the record**. The event log is the
record. It is append-only under the existing rules, it carries `at == request.time` server
timestamps, and it is what the CSV and Excel exports and the per-student detail view read. A
forged summary changes what the grid shows at a glance; it does not change the evidence a teacher
looks at when the glance matters. The framing the project already commits to — evidence for a
conversation, not a grade — is exactly the framing under which that trade is acceptable.

A teacher who suspects a row must be able to check it, so **rebuilding a summary from the event
log is a teacher-visible action**, not just an internal fallback.

### When the summary disagrees with the event log

The event log wins. Three consequences:

1. `student-detail.js` keeps reading events directly. The drill-down is the place a teacher goes
   when they want the truth, and it is one student, so it costs one student's reads.
2. Both exports keep reading events directly. An export is the artefact that leaves the building.
3. The grid offers "rebuild from event log" per student and for the class, which does the old
   fan-out for the selected scope and overwrites the summary. Expensive and explicit.

---

## Rollout

The dashboard reads `summary/current`; when it is **missing** it falls back to the old
`readEvents` path for that student alone and renders normally. So:

- a student active since the write path shipped has a summary → 1 read;
- a student who has not been back yet has none → 501 reads, as today, for that one student;
- `scripts/backfill-roster-summaries.mjs` closes the gap without waiting for either.

The backfill is idempotent and logs what it changed. The lesson is the `assignmentUnlocks` one:
do not leave correctness waiting on a teacher happening to open a page.

The fallback is **missing-only**, never staleness-based. A summary that exists but is old is still
the student's own claim about themselves, and quietly re-reading 500 events because a timestamp
looked old would reintroduce the whole cost on exactly the classes that have the most data.

---

## What this costs

Per dashboard open, per student: **1 read** (summary) instead of 500 + |mirror|.

| Class size | Before | After |
|---|---|---|
| 1 | ~501 | 1 |
| 30 | ~15,030 | 30 |
| 50 | ~25,050 | 50 |

Against a 50,000/day project-wide budget, a 50-student dashboard goes from two opens a day to
roughly a thousand.

The write cost is one document write per debounce window per active student, against a Spark
budget of 20,000 writes/day. A student generating a summary write every 30 seconds of active work
for a 50-minute lesson costs 100 writes; thirty such students cost 3,000. That fits, but it is the
number to watch if the debounce is ever shortened.

---

## Verification

`scripts/measure-dashboard-reads.mjs` counts documents returned per dashboard load against a
seeded 30-student class, and is run before and after. The target is one read per student, and the
measured before/after goes in the commit message rather than being asserted in prose.
