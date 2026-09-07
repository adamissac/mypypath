/* PyPath — every Firestore read and write the classroom feature makes.
 *
 * Kept in one module so that "what can a teacher see" has a single answer you
 * can read top to bottom, rather than being spread across whichever page
 * happened to need a query.
 *
 * Two things shape the code here more than anything else:
 *
 * There are no Cloud Functions in this project, so every write below is made
 * by a client under its own credentials and is constrained only by
 * firestore.rules. Anything this module appears to guarantee that the rules do
 * not is not actually guaranteed.
 *
 * The rules deny `list` on both /classes and /joinCodes, so neither can be
 * walked to harvest codes or find other people's classrooms. A teacher's own
 * classes are therefore found through an index of ids on their own user
 * document and fetched one get at a time, never by querying the collection.
 */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { loadProfile, invalidateProfile } from '/assets/js/profile.js';
/* Dev-only, off unless ?readcount=1. Every call below is a no-op returning its
   argument until it is switched on -- see the header of read-counter.js for why
   this file is instrumented at all. */
import { counted, delivery } from '/assets/js/read-counter.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  orderBy, limit, writeBatch, serverTimestamp, arrayUnion, arrayRemove,
  onSnapshot,
} = await import(`${BASE}/firebase-firestore.js`);

const ROLES = window.PyPathRoles;
const KEYS = window.PyPathKeys;
const SCHEMA = window.PyPathSchema;

const MAX_CODE_ATTEMPTS = 6;

/* The zone this browser is in, as an IANA name. Guarded because a browser that
   cannot answer must not stop a teacher creating a class -- a class with no
   timezone falls back to the reader's, which is exactly the behaviour every
   class created before this field existed already has. */
function classTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (e) {
    return '';
  }
}

function version() {
  return SCHEMA ? SCHEMA.SCHEMA_VERSION : 1;
}

export class ClassroomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ codes */

/* Reuses the join code alphabet in roles.js, which already excludes O/0, I/1
   and S/5 -- a code gets read off a whiteboard and typed by a room full of
   people, and ambiguous glyphs turn into support requests. */
async function claimCode(uid, classId) {
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
    const code = ROLES.generateCode(ROLES.cryptoRandom);
    try {
      // create, not set-with-merge: the rules forbid update on joinCodes, so a
      // collision fails here rather than stealing another teacher's code.
      await setDoc(doc(db, `joinCodes/${code}`), {
        teacherUid: uid,
        classId,
        active: true,
        createdAt: Date.now(),
      });
      return code;
    } catch (e) {
      if (i === MAX_CODE_ATTEMPTS - 1) throw e;
    }
  }
  throw new ClassroomError('exhausted', 'Could not issue a join code. Please try again.');
}

export async function resolveJoinCode(rawCode) {
  const code = ROLES.normalizeCode(rawCode);
  if (!ROLES.isValidCode(code)) {
    throw new ClassroomError('invalid-format', 'That join code does not look right.');
  }
  const snap = counted(await getDoc(doc(db, `joinCodes/${code}`)), 'resolveJoinCode');
  if (!snap.exists()) {
    throw new ClassroomError('not-found', 'No class has that join code. Check it with your teacher.');
  }
  const data = snap.data();
  if (data.active === false) {
    throw new ClassroomError('retired', 'That join code is no longer in use.');
  }
  if (!data.classId) {
    // A code issued before classes existed. It still resolves for the legacy
    // roster path, but there is no class document to enroll into.
    throw new ClassroomError('legacy', 'That code belongs to an older class. Ask your teacher for a new one.');
  }
  return { code, classId: data.classId, teacherUid: data.teacherUid };
}

/* ---------------------------------------------------------------- classes */

export async function createClass(uid, name) {
  const clean = String(name || '').trim().slice(0, 100);
  if (!clean) throw new ClassroomError('no-name', 'Give the class a name.');

  const classId = doc(collection(db, 'classes')).id;
  const code = await claimCode(uid, classId);

  await setDoc(doc(db, `classes/${classId}`), {
    name: clean,
    joinCode: code,
    teacherUids: [uid],
    /* The class's timezone, so a due date means the end of a calendar day in
       the ROOM rather than in whichever browser typed it. An IANA name, never
       an offset: '-04:00' is what a zone was on one particular day, and a
       class setting an April deadline in March would be an hour wrong across
       the boundary. Defaults to the creating teacher's zone, which is right
       far more often than not -- a class is usually created from the room it
       will be taught in. */
    timezone: classTimezone(),
    createdAt: serverTimestamp(),
    archived: false,
    schemaVersion: version(),
  });

  // The index that stands in for a list query. Written after the class, so a
  // failure here leaves an unindexed class rather than an index entry pointing
  // at nothing.
  await setDoc(
    doc(db, `users/${uid}`),
    { role: 'teacher', classIds: arrayUnion(classId), updatedAt: Date.now() },
    { merge: true }
  );
  invalidateProfile(uid);

  return { classId, joinCode: code, name: clean };
}

export async function readClass(classId) {
  const snap = counted(await getDoc(doc(db, `classes/${classId}`)), 'readClass');
  return snap.exists() ? { id: classId, ...snap.data() } : null;
}

/* One get per class rather than a query, because /classes denies list. A
   teacher has a handful of classes, so this is a handful of reads.

   The index itself comes from profile.js rather than a getDoc of its own. It
   is the same document classroom-page.js and classroom-dashboard.js read to
   decide whether this person is a teacher at all, and a cold cache could hand
   this one a half-built local copy with no classIds on it -- a teacher with
   classes, shown as a teacher with none. profile.js has the long version. */
export async function classesFor(uid) {
  const profile = await loadProfile(uid).catch(() => ({}));
  const ids = profile.classIds || [];
  const found = await Promise.all(ids.map((id) => readClass(id).catch(() => null)));
  return found.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function renameClass(classId, name) {
  const clean = String(name || '').trim().slice(0, 100);
  if (!clean) throw new ClassroomError('no-name', 'Give the class a name.');
  await updateDoc(doc(db, `classes/${classId}`), { name: clean });
}

export async function setArchived(classId, archived) {
  await updateDoc(doc(db, `classes/${classId}`), { archived: archived === true });
}

/* A read-only share for a co-teacher is a second uid on the class, not a
   public URL. An unguessable link is a credential that cannot be revoked and
   travels wherever it is forwarded; a uid can be removed again. */
export async function addCoTeacher(classId, uid) {
  await updateDoc(doc(db, `classes/${classId}`), { teacherUids: arrayUnion(uid) });
  await setDoc(
    doc(db, `users/${uid}`),
    { classIds: arrayUnion(classId), updatedAt: Date.now() },
    { merge: true }
  ).catch(() => {
    // Their own user document is theirs to write, not ours. If this is denied
    // the class is still shared; they reach it through the code on the card.
  });
  invalidateProfile(uid);
}

export async function removeCoTeacher(classId, uid) {
  await updateDoc(doc(db, `classes/${classId}`), { teacherUids: arrayRemove(uid) });
}

/* ----------------------------------------------------------- assignments */

/* What a teacher has asked the class to finish, and by when.

   Class-wide by design: there is no assignedTo field, so an assignment is for
   everyone enrolled. The rules refuse any key not on the list below, so adding
   per-student targeting later is a change in two places rather than a field
   that quietly starts working.

   Nothing about who completed what is written here. Completion is derived from
   the event log the dashboard already reads, which is why there is no write
   path for a student to claim one. */

const MAX_UNIT = 10;

function cleanTargets(units, lessonPaths) {
  const cleanUnits = Array.from(new Set((units || [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_UNIT)))
    .sort((a, b) => a - b);
  const cleanPaths = Array.from(new Set((lessonPaths || [])
    .filter((p) => typeof p === 'string' && p.startsWith('/units/') && p.length <= 200)))
    .sort();
  return { units: cleanUnits, lessonPaths: cleanPaths };
}

/* Which units the stored unlock list on the class document should hold.
 *
 * The list exists because firestore.rules cannot enumerate a subcollection:
 * an unlock derived from /assignments is invisible to the server, and the unit
 * lock is enforced there now. class-policy.js reads this same field, so the
 * two answers cannot drift apart -- see its comment for the transitional case
 * where the field does not exist yet.
 *
 * Every write below is ordered so that a failure leaves the class more open
 * than it should be rather than less. Locking a student out of work that has
 * been set is the one failure this feature must not have; carrying a stale
 * unlock for a few minutes is merely untidy.
 */
function unitsTargetedBy(assignments) {
  const POLICY = window.PyPathPolicy;
  return POLICY ? POLICY.assignmentUnlocks(assignments, Date.now()) : [];
}

function sameUnits(a, b) {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

async function storedOrDerivedUnlocks(classId, klass) {
  const found = klass || await readClass(classId);
  if (found && Array.isArray(found.assignmentUnlocks)) {
    return found.assignmentUnlocks.map(Number);
  }
  // No field yet. Derive what it would have been, so the first write does not
  // silently drop the unlocks every other assignment was already holding.
  return unitsTargetedBy(await readAssignments(classId).catch(() => []));
}

/* Opens these units before the assignment that needs them exists. */
async function widenUnlocks(classId, units) {
  const want = (units || []).map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_UNIT);
  if (!want.length) return;
  const base = await storedOrDerivedUnlocks(classId);
  const merged = Array.from(new Set(base.concat(want))).sort((a, b) => a - b);
  if (sameUnits(merged, base)) return;
  await updateDoc(doc(db, `classes/${classId}`), { assignmentUnlocks: merged });
}

/* Brings the stored list back in line with the assignments that actually
   exist. This is the narrowing half, so it runs after the write it follows,
   and it is also the backfill: a class whose teacher has not touched an
   assignment since this shipped gets its field the first time the dashboard
   loads. Returns the list it settled on. */
export async function refreshAssignmentUnlocks(classId, assignments) {
  const live = assignments || await readAssignments(classId);
  const next = unitsTargetedBy(live);
  const klass = await readClass(classId);
  const base = klass && Array.isArray(klass.assignmentUnlocks)
    ? klass.assignmentUnlocks.map(Number) : null;
  if (base && sameUnits(next, base)) return next;
  await updateDoc(doc(db, `classes/${classId}`), { assignmentUnlocks: next });
  return next;
}

/* The quiz half of an assignment draft, cleaned to the shape firestore.rules
   will accept and the shape assignmentStatus() expects.
 *
 * Bounded on every axis, because this document is read by every student in the
 * class: a teacher client that could write an unbounded blob here would be
 * writing it into everyone's page. The caps match the rule, and the rule is
 * the one that is actually enforced -- this function is the courtesy that
 * turns a rejected write into a sentence a teacher can act on. */
function cleanQuiz(quiz) {
  if (!quiz) return null;
  const unit = Number(quiz.unit);
  if (!Number.isInteger(unit) || unit < 1 || unit > 10) {
    throw new ClassroomError('quiz-unit', 'Choose which unit the quiz is about.');
  }

  const ids = Array.from(new Set((Array.isArray(quiz.questionIds) ? quiz.questionIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && id.length <= 40)));
  if (!ids.length) throw new ClassroomError('quiz-empty', 'Pick at least one question.');
  if (ids.length > 25) {
    throw new ClassroomError('quiz-long', 'A quiz can hold at most 25 questions.');
  }

  const passMark = Number(quiz.passMark);
  const attempts = Number(quiz.attempts);
  return {
    unit,
    questionIds: ids,
    passMark: Number.isFinite(passMark) ? Math.min(100, Math.max(0, Math.round(passMark))) : 70,
    // 0 is unlimited, and is the default: the same default maxTestAttempts
    // has, and the same behaviour as a class that never touches the setting.
    attempts: Number.isInteger(attempts) && attempts > 0 ? Math.min(10, attempts) : 0,
  };
}

export async function createAssignment(classId, draft) {
  const title = String((draft && draft.title) || '').trim().slice(0, 100);
  if (!title) throw new ClassroomError('no-title', 'Give the assignment a name.');

  const targets = cleanTargets(draft && draft.units, draft && draft.lessonPaths);
  const quiz = cleanQuiz(draft && draft.quiz);
  if (!targets.units.length && !targets.lessonPaths.length && !quiz) {
    throw new ClassroomError('no-targets', 'Choose at least one unit, lesson or quiz.');
  }

  const dueAt = Number(draft && draft.dueAt);
  if (!isFinite(dueAt) || dueAt <= 0) {
    throw new ClassroomError('no-due-date', 'Give the assignment a due date.');
  }

  /* Before the assignment, never after: a student must never meet a unit that
     is assigned to them and locked against them.

     The quiz's own unit is widened too, and has to be. quiz.submitted counts
     for credit in the rules, so a quiz on a unit the class has not opened
     would be refused server-side -- a student sitting it, finishing it, and
     losing the result to a permission error. That is precisely the failure the
     ordering here already exists to prevent. */
  const openUnits = unitsTargetedBy([targets]);
  if (quiz) openUnits.push(quiz.unit);
  await widenUnlocks(classId, openUnits);

  const ref = doc(collection(db, `classes/${classId}/assignments`));
  const record = {
    title,
    units: targets.units,
    lessonPaths: targets.lessonPaths,
    dueAt,
    createdAt: serverTimestamp(),
    archived: false,
    schemaVersion: version(),
  };
  // Absent rather than null when there is no quiz: the rule checks
  // `'quiz' in resource.data`, and a null would satisfy that and then fail the
  // shape check underneath it.
  if (quiz) record.quiz = quiz;
  await setDoc(ref, record);
  return { id: ref.id, title, dueAt, ...targets, ...(quiz ? { quiz } : {}) };
}

/* ------------------------------------------------------------ overrides */

/* A teacher's adjustment to one student, kept OUTSIDE that student's record.
 *
 * Everywhere else in this module a teacher reads and never writes: the grid is
 * a view of what the student did, and a teacher who could edit it is a teacher
 * who could be blamed for it. These two functions are the deliberate exception,
 * and they are shaped so they do not actually break that rule -- nothing here
 * mutates an event or a summary. An override is a separate, attributed document
 * that the dashboard applies on top. The student's own account of themselves
 * stays exactly as they wrote it.
 *
 * WHY THE EXCEPTION EXISTS. Two things a school requires that were impossible:
 * extended time for a student with an IEP or 504 plan, which they are legally
 * entitled to and which PyPath could not express at all; and correcting a
 * score, whose absence does not keep the record pure -- it just moves the real
 * marks into a spreadsheet and makes this decoration.
 *
 * `at` and `byUid` are pinned by the rules, not merely set here, so an
 * extension cannot be backdated to look like it predated the deadline it
 * excuses and an adjustment cannot be attributed to a colleague.
 */

function overrideId(kind, key) {
  // One override per kind per target, so setting an extension twice replaces
  // it rather than accumulating two answers to the same question.
  return `${kind}__${String(key).replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/* Extended time for one student on one assignment.
 *
 * A later date only. An override that could move a deadline EARLIER for one
 * student is a punishment with no name in any policy, and the accommodation
 * this exists for is by definition more time -- so the direction is enforced
 * rather than trusted to the UI.
 */
export async function setDueOverride(classId, uid, assignmentId, dueAt, reason, by) {
  const when = Number(dueAt);
  if (!isFinite(when) || when <= 0) {
    throw new ClassroomError('no-due-date', 'Give the extension a date.');
  }
  const assignment = counted(
    await getDoc(doc(db, `classes/${classId}/assignments/${assignmentId}`)),
    'setDueOverride');
  if (!assignment.exists()) {
    throw new ClassroomError('not-found', 'That assignment no longer exists.');
  }
  if (when <= Number(assignment.data().dueAt || 0)) {
    throw new ClassroomError('not-later',
      'An extension has to be later than the date set for the class.');
  }

  const id = overrideId('due', assignmentId);
  await setDoc(doc(db, `classes/${classId}/roster/${uid}/overrides/${id}`), {
    kind: 'due',
    assignmentId,
    dueAt: when,
    reason: String(reason || '').slice(0, 500),
    byUid: (by && by.uid) || '',
    byName: String((by && by.name) || '').slice(0, 100),
    at: serverTimestamp(),
  });
  return { id, kind: 'due', assignmentId, dueAt: when };
}

/* A corrected mark for one student on one unit test.
 *
 * The original stays. The dashboard shows the adjusted score AND says it was
 * adjusted, by whom -- a corrected score that hid the original would destroy
 * the evidence this project exists to provide, and one that hid who corrected
 * it would be worse.
 *
 * A reason is required. Not for bureaucracy: this record is the thing a
 * teacher will be asked about in a parents' evening eighteen months from now,
 * and "37 -> 62, no reason given, by someone" is not a defensible answer.
 */
export async function setGradeOverride(classId, uid, unit, score, outOf, reason, by) {
  const n = Number(unit);
  const marks = Number(score);
  const total = Number(outOf) || 100;
  if (!isFinite(n) || n <= 0) throw new ClassroomError('no-unit', 'Which unit?');
  if (!isFinite(marks) || marks < 0 || marks > total) {
    throw new ClassroomError('bad-score', `Give a score between 0 and ${total}.`);
  }
  const why = String(reason || '').trim().slice(0, 500);
  if (!why) {
    throw new ClassroomError('no-reason', 'Say why the score was changed.');
  }

  const id = overrideId('grade', `u${n}`);
  await setDoc(doc(db, `classes/${classId}/roster/${uid}/overrides/${id}`), {
    kind: 'grade',
    unit: n,
    score: marks,
    outOf: total,
    reason: why,
    byUid: (by && by.uid) || '',
    byName: String((by && by.name) || '').slice(0, 100),
    at: serverTimestamp(),
  });
  return { id, kind: 'grade', unit: n, score: marks, outOf: total };
}

export async function readOverrides(classId, uid) {
  const snap = counted(
    await getDocs(collection(db, `classes/${classId}/roster/${uid}/overrides`)),
    'readOverrides');
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* Withdrawing an adjustment deletes it rather than writing a counter-override.
   The student's own record was never touched, so removing the override simply
   returns the view to what they actually did -- which is the correct meaning
   of "I was wrong about that extension". */
export async function clearOverride(classId, uid, id) {
  await deleteDoc(doc(db, `classes/${classId}/roster/${uid}/overrides/${id}`));
}

/* ------------------------------------------------- bulk and rollover */

/* The same work, set for several classes at once.
 *
 * A teacher with three periods of the same course sets the same assignment
 * three times, and every LMS in the world has this because that is a
 * ridiculous thing to make someone do. It is genuinely three assignments --
 * one per class, each with its own id, its own completion state and its own
 * later edits -- and not one shared object, because two periods diverge the
 * moment one of them has a fire drill.
 *
 * PARTIAL SUCCESS IS THE NORMAL CASE and is reported rather than thrown. A
 * co-teacher may have archived one of the three classes since the picker was
 * drawn; failing the whole call would throw away two assignments that were
 * created perfectly well and leave the teacher unable to tell which. So each
 * class is attempted independently and the caller is told exactly what
 * happened to each.
 */
export async function createAssignmentIn(classIds, draft) {
  const ids = Array.from(new Set(classIds || [])).filter(Boolean);
  if (!ids.length) throw new ClassroomError('no-classes', 'Choose at least one class.');

  const results = [];
  for (const classId of ids) {
    try {
      const made = await createAssignment(classId, draft);
      results.push({ classId, ok: true, assignment: made });
    } catch (e) {
      results.push({
        classId,
        ok: false,
        code: e && e.code,
        message: (e && e.message) || 'Could not set this assignment.',
      });
    }
  }
  return results;
}

/* Copy an assignment, into this class or another one.
 *
 * The copy is a NEW assignment with a new id and no completion state. Nothing
 * about who has done what travels with it, which is the whole point: a
 * duplicate exists so last term's carefully chosen set of lessons can be given
 * to a class that has not done them.
 *
 * The due date is the caller's to supply and is not copied by default. A
 * duplicate that silently inherits a date three weeks in the past would land
 * in every student's list already overdue, which is the single most likely way
 * this feature could hurt somebody.
 */
export async function duplicateAssignment(fromClassId, assignmentId, toClassId, overrides) {
  const snap = counted(
    await getDoc(doc(db, `classes/${fromClassId}/assignments/${assignmentId}`)),
    'duplicateAssignment');
  if (!snap.exists()) {
    throw new ClassroomError('not-found', 'That assignment no longer exists.');
  }
  const source = snap.data();
  const o = overrides || {};
  const draft = {
    title: o.title != null ? o.title : source.title,
    units: source.units || [],
    lessonPaths: source.lessonPaths || [],
    quiz: source.quiz,
    dueAt: o.dueAt,
  };
  if (!draft.dueAt) {
    throw new ClassroomError('no-due-date', 'Give the copy its own due date.');
  }
  return createAssignment(toClassId || fromClassId, draft);
}

/* Roll a class into a new term: same settings, same work, none of the students.
 *
 * Archive already exists and is the wrong tool for September. Archiving Period
 * 1 preserves last year's record, which is correct, and leaves the teacher
 * rebuilding the same class from scratch -- name, lock mode, solutions policy,
 * attempt cap, and every assignment -- for a room of new students. Every
 * teacher does this in August and nobody should be doing it by hand.
 *
 * WHAT TRAVELS: the class settings, and the assignments as fresh copies.
 * WHAT DOES NOT: the roster, and every student's events, progress mirror,
 * summary and certificate state. A new class is a new group of people. Copying
 * a roster would enroll last year's students in this year's class without
 * their consent and would show their work to a teacher who is no longer
 * theirs -- the enrollment-is-consent boundary this whole model rests on.
 *
 * The new class gets its own join code, because a code is a credential and
 * last year's is on a whiteboard photo in forty camera rolls.
 *
 * Due dates are shifted by `shiftMs` rather than copied. A term's worth of
 * assignments landing in a new class all already overdue is not a rollover,
 * it is a mess someone has to clean up before they can teach.
 */
export async function rolloverClass(uid, fromClassId, options) {
  const opts = options || {};
  const source = await readClass(fromClassId);
  if (!source) throw new ClassroomError('not-found', 'That class no longer exists.');

  const name = String(opts.name || '').trim().slice(0, 100)
    || `${source.name} (new term)`.slice(0, 100);

  const made = await createClass(uid, name);

  /* Settings copied one at a time through their own setters, not as a blind
     document write. Each setter validates -- setLockPolicy checks the mode is
     one of the three the rules accept -- and a class document written wholesale
     from another one would carry its teacherUids, its join code and its
     createdAt, which is three ways to corrupt the new class at once. */
  const patch = {};
  if (source.showSolutions != null) patch.showSolutions = source.showSolutions === true;
  if (source.maxTestAttempts != null) {
    patch.maxTestAttempts = Number(source.maxTestAttempts) || 0;
  }
  if (Object.keys(patch).length) {
    await updateDoc(doc(db, `classes/${made.classId}`), patch).catch(() => {});
  }
  if (source.lockMode) {
    await setLockPolicy(made.classId, source.lockMode, source.manualUnlocks || [])
      .catch(() => {});
  }

  const copied = [];
  const failed = [];
  if (opts.withAssignments !== false) {
    const shift = Number(opts.shiftMs) || 0;
    for (const a of await readAssignments(fromClassId)) {
      if (a.archived) continue;
      try {
        copied.push(await createAssignment(made.classId, {
          title: a.title,
          units: a.units || [],
          lessonPaths: a.lessonPaths || [],
          quiz: a.quiz,
          // Shifted, never copied. See the note above.
          dueAt: Number(a.dueAt || 0) + shift,
        }));
      } catch (e) {
        failed.push({ title: a.title, message: (e && e.message) || 'Could not copy.' });
      }
    }
  }

  return {
    classId: made.classId,
    joinCode: made.joinCode,
    name,
    copied: copied.length,
    failed,
  };
}

export async function readAssignments(classId) {
  const snap = counted(
    await getDocs(collection(db, `classes/${classId}/assignments`)), 'readAssignments');
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(a.dueAt || 0) - Number(b.dueAt || 0));
}

export async function updateAssignment(classId, assignmentId, changes) {
  const patch = {};
  if (changes && changes.title != null) {
    const title = String(changes.title).trim().slice(0, 100);
    if (!title) throw new ClassroomError('no-title', 'Give the assignment a name.');
    patch.title = title;
  }
  if (changes && changes.dueAt != null) {
    const dueAt = Number(changes.dueAt);
    if (!isFinite(dueAt) || dueAt <= 0) {
      throw new ClassroomError('no-due-date', 'Give the assignment a due date.');
    }
    patch.dueAt = dueAt;
  }
  if (changes && changes.archived != null) patch.archived = changes.archived === true;
  if (changes && (changes.units || changes.lessonPaths)) {
    const targets = cleanTargets(changes.units, changes.lessonPaths);
    if (!targets.units.length && !targets.lessonPaths.length) {
      throw new ClassroomError('no-targets', 'Choose at least one unit or lesson.');
    }
    patch.units = targets.units;
    patch.lessonPaths = targets.lessonPaths;
  }
  // Widen first, edit, then settle. An edit that adds a unit must open it
  // before the assignment claims it; an edit that drops one may re-lock late.
  if (patch.units || patch.lessonPaths) {
    await widenUnlocks(classId, unitsTargetedBy([patch]));
  }
  await updateDoc(doc(db, `classes/${classId}/assignments/${assignmentId}`), patch);
  await refreshAssignmentUnlocks(classId).catch(() => {
    // The assignment is saved. A stale unlock is the open-erring failure.
  });
}

/* Deleted rather than archived, unlike a class. An assignment holds no
   subcollection to strand, and a teacher who set the wrong due date wants it
   gone rather than filed. Deleting also re-locks whatever it was holding open,
   with no cleanup step, because that unlock was never stored. */
export async function deleteAssignment(classId, assignmentId) {
  await deleteDoc(doc(db, `classes/${classId}/assignments/${assignmentId}`));
  // The unlock is stored now rather than derived, so "no cleanup step" is no
  // longer true and this is the step. After the delete, so a failure here
  // leaves a unit open that should have re-locked.
  await refreshAssignmentUnlocks(classId).catch(() => {});
}

/* ------------------------------------------------------------ lock policy */

/* Which units are open to the class, and how that is decided.

   Stored on the class document rather than in a collection of its own because
   /classes already allows get to any signed-in user, so a student's lesson page
   can read it under a rule that already exists. Anywhere else would need a new
   read rule and a second document read on every lesson page. */
export async function setLockPolicy(classId, mode, manualUnlocks) {
  const POLICY = window.PyPathPolicy;
  const clean = POLICY ? POLICY.normalizeMode(mode) : 'sequential';
  const units = Array.from(new Set((manualUnlocks || [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_UNIT)))
    .sort((a, b) => a - b);
  await updateDoc(doc(db, `classes/${classId}`), {
    lockMode: clean,
    manualUnlocks: units,
  });

  /* Arm the lock as part of the same save.
   *
   * A class only started being enforced server-side once its assignmentUnlocks
   * field exists -- the events rule permits a class that has never had one,
   * because it cannot see the assignments to know better. Switching a class to
   * "By hand" is the moment that matters most and was the one path that could
   * still leave it unwritten. After the mode, so a failure here leaves the
   * class more open than intended rather than locking students out of assigned
   * work, which is the direction every write in this file errs. */
  await refreshAssignmentUnlocks(classId).catch(() => {});

  return { mode: clean, manualUnlocks: units };
}

/* ---------------------------------------------------------------- roster */

export async function joinClass(uid, rawCode, displayName) {
  const resolved = await resolveJoinCode(rawCode);
  const klass = await readClass(resolved.classId);
  if (!klass) throw new ClassroomError('not-found', 'That class no longer exists.');
  if (klass.archived) throw new ClassroomError('archived', 'That class has been closed.');
  if ((klass.teacherUids || []).includes(uid)) {
    throw new ClassroomError('self', 'That is your own class code.');
  }

  // Submitting a code you are already in has to be quiet, and cannot be done
  // by writing again: the update rule pins joinedAt as the record of consent,
  // and serverTimestamp() is a new value every time, so the identical write
  // that was a create a moment ago is a denied update now. Read first, and
  // write only when there is nothing there.
  //
  // The read carries the repair path too. Anyone enrolled before join-flow.js
  // shipped has the legacy roster document and not this one, so for them this
  // is still a create and re-entering their code is how they fix themselves.
  const seat = doc(db, `classes/${resolved.classId}/roster/${uid}`);
  const already = counted(await getDoc(seat), 'joinClass');
  if (!already.exists()) {
    // displayName is a username. A legal name must never reach this collection,
    // and the rules refuse the fields one would arrive in.
    await setDoc(seat, {
      displayName: String(displayName || '').slice(0, 64),
      joinedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      joinCode: resolved.code,
      schemaVersion: version(),
    });
  }

  // Where membership.js looks the class up on the next page load. Written
  // after the roster document, so a failure here leaves an enrollment the
  // learner can retry rather than a pointer to a class they never joined.
  await setDoc(
    doc(db, `users/${uid}`),
    { role: 'student', classId: resolved.classId, updatedAt: Date.now() },
    { merge: true }
  );
  invalidateProfile(uid);

  return { classId: resolved.classId, className: klass.name, code: resolved.code };
}

export async function leaveClass(uid, classId) {
  await deleteDoc(doc(db, `classes/${classId}/roster/${uid}`));
  await setDoc(
    doc(db, `users/${uid}`),
    { classId: '', updatedAt: Date.now() },
    { merge: true }
  ).catch(() => {});
  invalidateProfile(uid);
}

/* Whether this class gets the "Show Solution" button on an exercise.
 *
 * Stored as a boolean and read as "absent means yes", so every class that
 * existed before this setting did keeps the behaviour it had. */
export async function setShowSolutions(classId, allowed) {
  const on = allowed !== false;
  await updateDoc(doc(db, `classes/${classId}`), { showSolutions: on });
  return on;
}

/* How many times this class may sit the same end-of-unit test.
 *
 * null clears the cap, and absent means unlimited, so a class created before
 * this setting existed needs no migration and a learner in no class is never
 * subject to it at all.
 *
 * Client-side only, and said out loud rather than left to be discovered: the
 * rules pin the field's type and range so only a teacher can set it and only
 * to something sane, but they cannot count a student's prior attempts, because
 * a rule can get() one document and cannot aggregate a collection. See the
 * note above validEvent() in firestore.rules. */
export async function setMaxTestAttempts(classId, cap) {
  const POLICY = window.PyPathPolicy;
  const clean = POLICY ? POLICY.normalizeAttemptCap(cap) : null;
  await updateDoc(doc(db, `classes/${classId}`), { maxTestAttempts: clean });
  return clean;
}

export async function readRoster(classId) {
  const snap = counted(
    await getDocs(collection(db, `classes/${classId}/roster`)), 'readRoster');
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* The one live read on the dashboard.
 *
 * Everything else here is one-shot on purpose: a teacher's page is a report,
 * and a report that rearranges itself while being read is worse than one that
 * is a minute old. Who is in the room is the exception. A teacher reads the
 * join code aloud and then watches for the names to appear, and a roster that
 * only updates on reload makes a working join look like a broken one.
 *
 * Same collection and same row shape as readRoster, so a caller can merge a
 * snapshot into what that returned without translating between the two. The
 * read rule is `isOwner(uid) || isTeacherOf(classId)`; the teacher half does
 * not depend on the document, which is what makes the collection listenable
 * rather than only gettable one row at a time.
 *
 * Errors are swallowed deliberately. A dropped or denied listener leaves the
 * last painted roster on screen, which is the same fallback the rest of the
 * page takes: stale beats blank.
 */
export function watchRoster(classId, onChange) {
  return onSnapshot(
    collection(db, `classes/${classId}/roster`),
    (snap) => {
      /* Counted, because a listener is not free and this is the one read on
         the dashboard that keeps happening after the page has finished
         loading. Firestore bills the initial snapshot at one read per
         document, and every later delivery at one read per CHANGED document
         -- docChanges(), not docs. Counting snap.docs on every delivery would
         report a class of thirty as costing thirty reads every time one
         student's heartbeat landed, which is four times the truth and would
         send someone optimising the wrong thing. */
      delivery(snap.docChanges().length, snap.metadata.fromCache, 'watchRoster');
      onChange(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    },
    () => {}
  );
}

export async function touchLastActive(classId, uid) {
  await updateDoc(doc(db, `classes/${classId}/roster/${uid}`), {
    lastActiveAt: serverTimestamp(),
  }).catch(() => {});
}

/* ---------------------------------------------------------- certificates */

/* The certificate handshake still lives on the flat roster/{uid} document, and
 * deliberately stays there. The rules' gradingOwnStudent() predicate targets
 * that document, the learner's own request half writes it, and join-flow.js
 * guarantees every class-enrolled student has one alongside their class seat.
 * Moving the storage would mean moving all three; moving only the controls
 * that read it costs nothing.
 *
 * One query for the whole class rather than a read per student: the flat
 * roster is queryable by teacherUid, which is the same query the page this
 * replaces used.
 */
export async function readCertificates(teacherUid) {
  const snap = counted(await getDocs(
    query(collection(db, 'roster'), where('teacherUid', '==', teacherUid))
  ), 'readCertificates');
  const out = {};
  snap.forEach((d) => {
    const v = d.data() || {};
    out[d.id] = {
      requestedAt: Number(v.certificateRequestedAt) || 0,
      approved: typeof v.certificateApproved === 'boolean' ? v.certificateApproved : null,
      decidedAt: Number(v.certificateDecidedAt) || 0,
      earned: !!v.hasCertificate,
    };
  });
  return out;
}

/* Exactly the three keys the rules let a teacher change. Anything else in this
 * object -- even a field read straight back off the row unchanged -- makes the
 * whole write fail. */
export async function setCertificateDecision(uid, approved) {
  const now = Date.now();
  await updateDoc(doc(db, `roster/${uid}`), {
    certificateApproved: approved,
    certificateDecidedAt: now,
    updatedAt: now,
  });
  return now;
}

/* ---------------------------------------------------------------- events */

/* One batch per flush. Ids are generated client-side so the whole batch is a
   single round trip, and the rules pin `at` to request.time so the id carrying
   no ordering information costs nothing. */
export async function writeEvents(classId, uid, events) {
  if (!events || !events.length) return 0;
  const batch = writeBatch(db);
  const eventsRef = collection(db, `classes/${classId}/roster/${uid}/events`);
  for (const event of events) {
    batch.set(doc(eventsRef), {
      type: event.type,
      lessonPath: event.lessonPath || '',
      unit: event.unit === null ? 0 : event.unit,
      at: serverTimestamp(),
      payload: event.payload,
      schemaVersion: version(),
    });
  }
  await batch.commit();
  return events.length;
}

export async function readEvents(classId, uid, max) {
  const snap = counted(await getDocs(
    query(
      collection(db, `classes/${classId}/roster/${uid}/events`),
      orderBy('at', 'desc'),
      limit(max || 500)
    )
  ), 'readEvents');
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* --------------------------------------------------------------- mirror */

/* The adapter ProgressStore._setClassAdapter takes. Same doc-id escaping as
   the private code collection, so the key-to-id mapping stays injective. */
export function makeClassAdapter(classId, uid) {
  const base = `classes/${classId}/roster/${uid}/progress`;
  return {
    push(key, value) {
      setDoc(doc(db, `${base}/${KEYS.toDocId(key)}`), {
        key,
        content: String(value == null ? '' : value),
        updatedAt: Date.now(),
        schemaVersion: version(),
      }).catch(() => {
        // A mirror write that fails is a dashboard that is briefly stale. It
        // must never surface to the learner, who did nothing wrong and cannot
        // act on it.
      });
    },
    remove(key) {
      deleteDoc(doc(db, `${base}/${KEYS.toDocId(key)}`)).catch(() => {});
    },
  };
}

export async function readMirror(classId, uid) {
  const snap = counted(
    await getDocs(collection(db, `classes/${classId}/roster/${uid}/progress`)), 'readMirror');
  const out = {};
  for (const d of snap.docs) {
    const data = d.data();
    if (data.key) out[data.key] = data.content;
  }
  return out;
}

/* Brings the mirror up to date with everything already in local storage.
   Called once after a join and after a sign-in merge, rather than echoing
   every pulled document back out as it arrives. */
export async function mirrorAll(classId, uid) {
  const snapshot = window.ProgressStore ? window.ProgressStore.snapshot() : {};
  const keys = Object.keys(snapshot);
  if (!keys.length) return 0;
  const batch = writeBatch(db);
  for (const key of keys) {
    batch.set(doc(db, `classes/${classId}/roster/${uid}/progress/${KEYS.toDocId(key)}`), {
      key,
      content: String(snapshot[key].content == null ? '' : snapshot[key].content),
      updatedAt: snapshot[key].updatedAt || Date.now(),
      schemaVersion: version(),
    });
  }
  await batch.commit();
  return keys.length;
}

/* ---------------------------------------------------------- retention */

/* Deletes events past the retention window.
 *
 * Run by the student's own browser, because there is nowhere else to run it:
 * no Cloud Functions, and the rules quite rightly let nobody else delete a
 * student's record. The rules permit exactly this window and no more, so a
 * client that skipped the call cannot keep anything alive that the policy says
 * should go -- but it does mean expiry happens on next sign-in rather than on
 * the stroke of midnight, and the policy is worded as "after" rather than "at".
 */
export async function purgeExpired(classId, uid, retentionDays) {
  const days = retentionDays || 180;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let removed = 0;

  for (;;) {
    const snap = await getDocs(
      query(
        collection(db, `classes/${classId}/roster/${uid}/events`),
        where('at', '<', cutoff),
        limit(400)
      )
    );
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  return removed;
}

/* Purges an archived class.
 *
 * Exists because the student-run expiry cannot cover everyone: someone who
 * finishes the year and never signs in again will never run it, and their
 * records would outlive the class indefinitely. The rules let a teacher clear
 * an archived class's records once they are past the stated year, and nothing
 * wider than that.
 *
 * Deliberately not automatic. It deletes a year of a class's records, so it is
 * a thing a person decides to do.
 */
export async function purgeArchivedClass(classId) {
  const klass = await readClass(classId);
  if (!klass) throw new ClassroomError('not-found', 'That class no longer exists.');
  if (!klass.archived) {
    throw new ClassroomError('not-archived', 'Archive the class before purging it.');
  }

  const counts = { students: 0, events: 0, progress: 0 };
  const roster = await readRoster(classId);

  for (const row of roster) {
    for (const sub of ['events', 'progress']) {
      for (;;) {
        const snap = await getDocs(
          query(collection(db, `classes/${classId}/roster/${row.uid}/${sub}`), limit(400))
        );
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        // A partial failure leaves the rest to the next run rather than
        // aborting the whole purge.
        await batch.commit().catch(() => {});
        counts[sub] += snap.size;
        if (snap.size < 400) break;
      }
    }
    // The roster row goes last, so a failure above leaves the student still
    // reachable to try again rather than orphaning their records.
    await deleteDoc(doc(db, `classes/${classId}/roster/${row.uid}`)).catch(() => {});
    counts.students += 1;
  }

  return counts;
}

/* ------------------------------------------------------- erasure (Phase 6) */

/* Deletes everything a class holds about one student. Client-side and
   therefore best-effort in batches; the caller reports what it managed. */
export async function purgeStudent(classId, uid) {
  const counts = { events: 0, progress: 0 };
  // The roster document goes first. The rules only permit deleting events once
  // the student is no longer enrolled, so this order is required, not a
  // preference.
  await deleteDoc(doc(db, `classes/${classId}/roster/${uid}`)).catch(() => {});

  for (const sub of ['events', 'progress']) {
    // Loop because a batch caps at 500 writes and an active student can have
    // more events than that.
    for (;;) {
      const snap = await getDocs(
        query(collection(db, `classes/${classId}/roster/${uid}/${sub}`), limit(400))
      );
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      counts[sub] += snap.size;
      if (snap.size < 400) break;
    }
  }
  return counts;
}
