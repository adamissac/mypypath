# Data contract

## Where the data comes from

`classes/{classId}/roster/{uid}/events/{autoId}`, written by
`assets/js/classroom-store.js` `writeEvents`:

```
{ type, lessonPath, unit, at: serverTimestamp(), payload, schemaVersion }
```

Only enrolled students write events. The browser additionally keeps a
device-only mirror in `localStorage['pypath-local-events']` (`events.js`
`mirrorLocal`, capped at 800, not synced) for everyone, and `recommend.js` reads
that, never Firestore.

## The ten types (`assets/js/events.js` EVENT_TYPES)

| type | payload | becomes |
|---|---|---|
| lesson.opened | lessonPath, unit | exposure on the lesson's skills |
| code.run | lessonPath, editorId, ok | exposure |
| code.error | lessonPath, editorId, errorType (class name only) | error-class counts |
| code.tests_passed | lessonPath, editorId, passed, total | attempt on `exercise:<path>#<editorId>`; correct = passed >= total; partial = passed/total |
| answer.submitted | lessonPath, exerciseId, attempt | exposure |
| check.answered | lessonPath, questionId, correct, attempt | attempt on `question:<id>` |
| test.started | unit | (nothing) |
| test.submitted | unit, score, total, attempt, durationSec | attempt on `test:<course>:<unit>`; correct = score >= 70; duration bucket |
| quiz.submitted | assignmentId, unit, score, correct, total, attempt | attempt on `quiz:<course>:<unit>` |
| unit.completed | unit, verified | (nothing) |

## Known holes, and what the engine does about them

| Hole | Handling |
|---|---|
| A flush of up to 50 events shares one `serverTimestamp()` | order within it rebuilt by `model_core.TYPE_RANK`, then attempt, then passed |
| `code.tests_passed` has no attempt counter | attempt index recomputed from order |
| `check.answered.attempt` resets on page reload | recomputed; payload value kept for gap detection |
| Late flushes from hidden tabs | quiz answers reordered within their slots when counters prove it |
| 500-event page cap, lost batches | cannot be recovered; flagged |
| `test.submitted` has no course | the student's most recent lesson path; flagged as inferred |
| Python for Data events stored with `unit: 0`; no `lesson.opened` on Data pages | unit recovered from path; simulator reproduces the missing event |
| End-of-unit MCQ answers are not logged per question | tagged in skills.json, never attempt rows |
| `lesson-progress.js` records `answer.submitted` with fields the schema lacks, so it is dropped | reported in `REVIEW/adaptive-audit.md`, not changed |

## Export format `ingest` accepts

JSON lines, a JSON array, or CSV with a JSON `payload` column. Fields: `id`,
`class`, `student`, `type`, `lessonPath`, `unit`, `at` (epoch ms, ISO-8601, or
`{seconds, nanoseconds}`), `payload`.

Ids that are not already pseudonymous (`s0001`, `p_<12 hex>`) make `ingest`
refuse to run without `--salt` / `PYPATH_INGEST_SALT`. It hashes them before
writing anything.

## Item keys (`assets/data/skills.json` `items`)

`lesson:<path>`, `exercise:<path>#exerciseN`, `question:<id>` (globally unique),
`mcq:<id>`, `frq:<id>`, plus the engine-only `test:<course>:<unit>` and
`quiz:<course>:<unit>`, tagged with every skill their unit teaches.
