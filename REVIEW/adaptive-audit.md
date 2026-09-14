# Adaptive engine, checkpoint 0: audit

Branch `feat/adaptive-engine`, cut from `main` at `aae1a91`. Every claim
below was read from the code at that commit; line numbers are from that
tree.

## Confirmed as briefed

- **Vocabulary.** The ten event types and their payload fields are exactly
  as listed (`assets/js/events.js:29-43`).
- **Storage.** Events are written to
  `classes/{classId}/roster/{uid}/events/{autoId}`
  (`assets/js/classroom-store.js:961-977`). Progress mirrors go under
  `.../progress/{docId}` (`:994`), and the teacher grid reads
  `.../summary/current`.
- **Caps.** `SESSION_CAP = 500`, `FLUSH_MS = 10000`, `MAX_BATCH = 50`,
  `MAX_PAYLOAD_CHARS = 512` (`events.js:52-61`). `code.error` keeps only a
  class name that matches
  `(Error|Exception|Warning|…)$` (`events.js:163-205`).
- **Honesty note.** At the top of `events.js`. It is carried into the model
  card verbatim.
- **No Cloud Functions.** The event rules are append-only, owner-only
  creates (`firestore.rules:701-707`).
- **Read access.** A student can read their own events
  (`firestore.rules:701`), so client-side scoring can use a signed-in,
  enrolled student's real log.
- **Lesson quiz question IDs.** 653 across 159 check files, all globally
  unique. Examples: `u3-lf-1`, `d8-wmgw-2`.
- **Unit test MCQs.** Foundations has 50 per unit (`u3-m01`). Python for
  Data has 14 per unit (`u3d-m01`) under `assets/data/unit-tests/data/`.
  FRQs: Foundations 5 per unit (`u3-f1`), Data 1 per unit (`u3d-f1`).
- **No skill tagging, no training data, no recommendation surface.**

## Wrong, or missing from the brief

1. **`code.tests_passed` has no `attempt` field**
   (`events.js:33`, emitted at `check-ui.js:200`). Attempt index for
   exercises has to be inferred from event order.
2. **`check.answered.attempt` resets on reload.** The counter is an in-memory
   map in `lesson-quiz.js` (`attempts[question.id]`), so a student who
   reloads the page answers "attempt 1" again. `attempt` is a lower bound,
   not a count.
3. **Ordering inside a flush is lost.** Every event in a batch is stored
   with `at: serverTimestamp()` (`classroom-store.js:970`) and a random
   document ID. Up to 50 events can share one timestamp, and nothing
   records their client order. Ingest has to order within a batch by
   attempt counters and type precedence, and must say that order is
   approximate.
4. **Unit test answers are not logged per question.** `test.submitted`
   carries only `score` out of 100 (`unit-test-page.js:736`), and the
   local record keeps `mcqCorrect` as a count. No event or stored record
   ties `u3-m01` to right or wrong, and the same is true of quiz questions
   (`quiz.submitted` is aggregate). Those 640 MCQ IDs can be tagged, but no
   real data exists to train on them. Only the simulator can produce
   per-item outcomes for them.
5. **`test.submitted` does not say which course.** A Python for Data unit 3
   test and a Foundations unit 3 test produce identical events. The schema
   has no course field, and the brief rules out widening it. Ingest can
   only attribute a test to a course by the student's surrounding
   `lessonPath`s, which is a heuristic.
6. **Python for Data events have no unit.** `curriculum.js:130` (`unitOf`)
   and `events.js` `makeEvent` recognise only `/units/unit-N/`, so Data
   pages never emit `lesson.opened`, and their other events are stored with
   `unit: 0`. Ingest recovers the unit and course from `lessonPath`.
7. **Exercise IDs are not globally unique.** `exercise1` appears in 118
   specs. An exercise item is `(lessonPath, exerciseId)`.
8. **A dead event.** `lesson-progress.js:1155` records `answer.submitted`
   with `itemId` and `missedConcepts`, fields the schema does not have. The
   payload builder needs `exerciseId`, finds none and returns null, so this
   event is silently never written. Reported, not changed: fixing it would
   widen what that call records.
9. **No local event mirror.** The in-browser buffer is drained to Firestore
   and only exists for enrolled students. A guest's browser keeps
   `pypath-checks-<path>` (best `passed`/`total` per exercise, with
   timestamp), `pypath-progress-lessons` and `pypath-unit-tests` (scores and
   attempt counts). The browser scorer must work from these, plus the
   student's own events when enrolled, and the shared fixtures must cover
   both.
10. **`npm run seed` stops after the first student.** Only `teacher@` and
    `student01@` exist afterwards (found in the last pass). It has to be
    fixed before Phase 5 can show a populated class.

## Proposed taxonomy shape (built in Phase 1)

- **About 50 skills.** Foundations skills are prefixed `py.`, Data skills
  `data.`, `np.` and `pd.`. Each skill has a name, a course, a description
  and prerequisites.
- **A prerequisite DAG.** Cross-course edges go only into the Python
  fundamentals the Data course assumes (lists, dictionaries, conditionals,
  functions, files).
- **Lessons map to one or two skills.** Lesson quiz questions and exercises
  inherit their lesson's tags, since they were written for that lesson.
- **Unit test MCQs and FRQs** are tagged by a documented keyword pass over
  prompt, code, choices and explanation, limited to that unit's skills,
  falling back to the unit's primary skill. The pass is deterministic and
  its output is committed and validated. The report states how many items
  fell back, because that is where tags are least trustworthy.
- **Item key namespaces:** `lesson:<path>`,
  `exercise:<path>#exercise1`, `question:<id>`, `mcq:<id>`, `frq:<id>`.
