/* PyPath — the per-student summary the teacher's grid reads instead of 500 events.
 *
 * WHY. classroom-dashboard.js used to derive every cell by replaying up to 500
 * events per student, so one dashboard open cost roughly 500 reads per student
 * -- 25,000 for a class of fifty, against a Spark plan budget of 50,000 per DAY
 * for the entire project across all of its users. Two opens exhausted
 * everybody's quota. This is one document per student holding exactly what the
 * grid needs, so the same open costs one read per student.
 *
 * Full argument, including what is deliberately NOT stored here and why, in
 * docs/superpowers/specs/2026-09-05-roster-summary-design.md.
 *
 * WHO WRITES IT: the student's own browser, because there is nowhere else --
 * no Cloud Functions in this project. That means a determined student can
 * forge every number in it, which firestore.rules says out loud rather than
 * pretending otherwise. What stops it mattering is that this is a CACHE and the
 * append-only, server-timestamped event log is the RECORD: the drill-down and
 * both exports read events, so a forged summary changes the glance and not the
 * evidence.
 *
 * THE ONE INVARIANT THIS FILE MUST NOT BREAK is the ratchet. Every value here
 * is a best or an earliest, never a latest:
 *
 *   bestRatio, testBest   best, so a bad retake cannot undo a good attempt
 *   firstPassAt           earliest, so a completion date cannot move
 *   verifiedAt            earliest, same
 *   firstTestPassAt       earliest, same
 *
 * That is the same ratchet mergeAttempt, recordBest and completedAt already
 * keep, and it is load-bearing rather than tidy. A student who reopens a passed
 * lesson and does badly has not un-finished it. And a completion date that
 * could move is a completion that could silently walk ACROSS A DUE DATE, which
 * turns an on-time submission into a late one for no reason the student did.
 *
 * THE SECOND INVARIANT is that the derivations here must agree with
 * classroom-core.js's. Both compute the same facts -- one from the whole log at
 * read time, one incrementally at write time -- and if they disagree the grid
 * says one thing and the drill-down another about the same student.
 * tests/roster-summary.test.js pins them against each other over the same
 * event fixtures, which is the only way that agreement stays true.
 */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc, setDoc, serverTimestamp } =
  await import(`${BASE}/firebase-firestore.js`);

export const SUMMARY_SCHEMA = 3;

/* Copied from classroom-core.js rather than imported, because that file is a
   window global loaded by a script tag and this is an ES module. Pinned by a
   test so the two cannot drift apart silently -- a pass mark that disagreed
   between the grid and the write path would mark the same test both ways. */
const UNIT_TEST_PASS_MARK = 70;

/* Lesson states, weakest first. The ratchet takes the strongest ever seen, so
   the order is the comparison and not just documentation. */
const STATE_ORDER = ['not-opened', 'in-progress', 'attempted', 'passed'];

/* 'verified' is deliberately absent from that list. A lesson is verified
   because its UNIT is verified, which is a fact about the unit and is stored
   there; baking it into each lesson would mean rewriting every lesson entry
   when a unit is completed, and would go stale if a unit's lesson list changed.
   The grid applies it at render, exactly as classroom-core.js's lessonState
   does with its unitVerified argument. */

export function emptySummary() {
  return {
    schemaVersion: SUMMARY_SCHEMA,
    lessons: {},
    units: {},
    quizzes: {},
    lastEventAt: 0,
  };
}

/* The same escaping the progress mirror uses for its document ids, so a lesson
   path is a legal map key and the mapping stays injective. Firestore map keys
   may not contain '/', and '_' is escaped first so the two cannot collide. */
export function lessonKey(path) {
  return String(path || '').replace(/_/g, '_5F').replace(/\//g, '__');
}

function payloadOf(e) {
  return (e && e.payload) || {};
}

/* Events arrive from two places with two shapes: straight off the buffer in
   events.js, where `at` is a number or absent, and out of Firestore, where it
   is a Timestamp. Both have to work, because the write path sees the first and
   the backfill sees the second. */
function millis(at) {
  if (!at) return 0;
  if (typeof at === 'number') return at;
  if (typeof at.toMillis === 'function') return at.toMillis();
  if (at.seconds != null) return at.seconds * 1000;
  const n = Date.parse(at);
  return isNaN(n) ? 0 : n;
}

function earliest(current, next) {
  if (!next) return current;
  if (!current) return next;
  return next < current ? next : current;
}

function strongest(current, next) {
  const a = STATE_ORDER.indexOf(current);
  const b = STATE_ORDER.indexOf(next);
  return b > a ? next : current;
}

/* ------------------------------------------------------------- the update */

/* Folds a batch of events into a summary. Pure, so it can be tested against
 * classroom-core.js's replay over the same fixtures, and so the backfill and
 * the live write path share one implementation rather than two that agree
 * until they do not.
 *
 * Mutates nothing: returns a new summary. A batch that changes nothing returns
 * a value equal to the input, which is how the caller decides not to write.
 */
export function applyEvents(summary, events) {
  const out = {
    schemaVersion: SUMMARY_SCHEMA,
    lessons: { ...((summary && summary.lessons) || {}) },
    units: { ...((summary && summary.units) || {}) },
    quizzes: { ...((summary && summary.quizzes) || {}) },
    lastEventAt: (summary && summary.lastEventAt) || 0,
  };

  for (const e of events || []) {
    if (!e || !e.type) continue;
    const p = payloadOf(e);
    const at = millis(e.at);
    if (at > out.lastEventAt) out.lastEventAt = at;

    const path = e.lessonPath || p.lessonPath;
    if (path) {
      const key = lessonKey(path);
      const prev = out.lessons[key] || {
        state: 'not-opened', bestRatio: -1, touchedAt: 0,
      };
      const lesson = { ...prev };
      if (at > lesson.touchedAt) lesson.touchedAt = at;
      // Any event at all for a lesson means it was opened. classroom-core.js's
      // lessonState reaches the same conclusion by filtering the log for the
      // path and checking the result is non-empty.
      lesson.state = strongest(lesson.state, 'in-progress');

      if (e.type === 'code.tests_passed') {
        const ratio = p.total ? p.passed / p.total : 0;
        if (ratio > lesson.bestRatio) lesson.bestRatio = ratio;
        lesson.state = strongest(lesson.state, lesson.bestRatio >= 1 ? 'passed' : 'attempted');
        if (p.total && p.passed >= p.total) {
          lesson.firstPassAt = earliest(lesson.firstPassAt, at);
        }
      } else if (
        e.type === 'code.run' || e.type === 'answer.submitted' || e.type === 'check.answered'
      ) {
        lesson.state = strongest(lesson.state, 'attempted');
      }
      out.lessons[key] = lesson;
    }

    if (e.type === 'unit.completed' && p.verified === true && p.unit) {
      const n = String(p.unit);
      const unit = { ...(out.units[n] || {}) };
      unit.verifiedAt = earliest(unit.verifiedAt, at);
      out.units[n] = unit;
    }

    if (e.type === 'test.submitted' && p.total) {
      const n = String(p.unit);
      const unit = { ...(out.units[n] || {}) };
      const best = unit.testBest;
      // Best by RATIO, not by raw score: two papers with different totals are
      // otherwise compared by a number that does not mean the same thing.
      const ratio = p.score / p.total;
      if (!best || !best.total || ratio > best.score / best.total) {
        unit.testBest = { score: Number(p.score) || 0, total: Number(p.total) || 0 };
      }
      if ((p.score / p.total) * 100 >= UNIT_TEST_PASS_MARK) {
        unit.firstTestPassAt = earliest(unit.firstTestPassAt, at);
      }
      out.units[n] = unit;
    }

    if (e.type === 'quiz.submitted' && p.assignmentId) {
      // A quiz is done the first time it is submitted, whatever the score --
      // the same rule classroom-core.js's completedAt uses, and for the same
      // reason: the column answers "did they do the work I set", and a student
      // who sat it and scored 40 did the work.
      out.quizzes[p.assignmentId] = earliest(out.quizzes[p.assignmentId], at) || at;
    }
  }

  return out;
}

/* ------------------------------------------------------------------- I/O */

function ref(classId, uid) {
  return doc(db, `classes/${classId}/roster/${uid}/summary/current`);
}

export async function readSummary(classId, uid) {
  const snap = await getDoc(ref(classId, uid));
  return snap.exists() ? snap.data() : null;
}

export async function writeSummary(classId, uid, summary) {
  await setDoc(ref(classId, uid), {
    schemaVersion: SUMMARY_SCHEMA,
    updatedAt: serverTimestamp(),
    lessons: summary.lessons || {},
    units: summary.units || {},
    quizzes: summary.quizzes || {},
    lastEventAt: summary.lastEventAt || 0,
  });
}

/* --------------------------------------------------------- the write path */

/* One summary per page, read once and written back debounced.
 *
 * The read is lazy and happens at most once: a learner who never triggers an
 * event never pays for it. After that the in-memory copy is authoritative for
 * this page, because this page is the only thing writing it. */
let loaded = null;
let loadedFor = null;
let pending = null;
let timer = null;

/* Long enough that a lesson does not rewrite the summary on every keystroke,
   short enough that a teacher refreshing during the lesson sees the work.
   Events already buffer through events.js's own flush cadence, so this is a
   second debounce on top of a first: what arrives here is batches, not
   keystrokes, and the number that matters is writes per active student per
   minute. Spark allows 20,000 writes a day across the whole project. */
export const WRITE_DEBOUNCE_MS = 15000;

export function _resetForTests() {
  loaded = null;
  loadedFor = null;
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

async function ensureLoaded(classId, uid) {
  const key = `${classId}/${uid}`;
  if (loadedFor === key && loaded) return loaded;
  let existing = null;
  try {
    existing = await readSummary(classId, uid);
  } catch (e) {
    /* A summary we cannot read is not a summary we may overwrite from nothing:
       doing so would erase a term of a student's recorded progress because
       their train went into a tunnel. Left null, and noteEvents below declines
       to write until a read succeeds. */
    return null;
  }
  loaded = existing || emptySummary();
  loadedFor = key;
  return loaded;
}

async function commit(classId, uid) {
  timer = null;
  const batch = pending;
  pending = null;
  if (!batch || !batch.length) return;

  const base = await ensureLoaded(classId, uid);
  if (!base) return;

  const next = applyEvents(base, batch);
  loaded = next;
  try {
    await writeSummary(classId, uid, next);
  } catch (e) {
    /* Same contract as the progress mirror: a summary write that fails is a
       dashboard that is briefly stale, and it must never surface to the
       learner, who did nothing wrong and cannot act on it. The in-memory copy
       keeps the events, so the next successful write carries them. */
  }
}

/* Called with the same batch that was just written to the event log. */
export function noteEvents(classId, uid, events) {
  if (!classId || !uid || !events || !events.length) return;
  pending = (pending || []).concat(events);
  if (timer) return;
  timer = setTimeout(() => { commit(classId, uid).catch(() => {}); }, WRITE_DEBOUNCE_MS);
}

/* Written now rather than at the end of the debounce. Called when the page is
   going away, where fifteen seconds is fifteen seconds it does not have. */
export function flushSummary(classId, uid) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return commit(classId, uid).catch(() => {});
}
