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
  const snap = await getDoc(doc(db, `joinCodes/${code}`));
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

  return { classId, joinCode: code, name: clean };
}

export async function readClass(classId) {
  const snap = await getDoc(doc(db, `classes/${classId}`));
  return snap.exists() ? { id: classId, ...snap.data() } : null;
}

/* One get per class rather than a query, because /classes denies list. A
   teacher has a handful of classes, so this is a handful of reads. */
export async function classesFor(uid) {
  const profile = await getDoc(doc(db, `users/${uid}`));
  const ids = (profile.exists() && profile.data().classIds) || [];
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

export async function createAssignment(classId, draft) {
  const title = String((draft && draft.title) || '').trim().slice(0, 100);
  if (!title) throw new ClassroomError('no-title', 'Give the assignment a name.');

  const targets = cleanTargets(draft && draft.units, draft && draft.lessonPaths);
  if (!targets.units.length && !targets.lessonPaths.length) {
    throw new ClassroomError('no-targets', 'Choose at least one unit or lesson.');
  }

  const dueAt = Number(draft && draft.dueAt);
  if (!isFinite(dueAt) || dueAt <= 0) {
    throw new ClassroomError('no-due-date', 'Give the assignment a due date.');
  }

  const ref = doc(collection(db, `classes/${classId}/assignments`));
  await setDoc(ref, {
    title,
    units: targets.units,
    lessonPaths: targets.lessonPaths,
    dueAt,
    createdAt: serverTimestamp(),
    archived: false,
    schemaVersion: version(),
  });
  return { id: ref.id, title, dueAt, ...targets };
}

export async function readAssignments(classId) {
  const snap = await getDocs(collection(db, `classes/${classId}/assignments`));
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
  await updateDoc(doc(db, `classes/${classId}/assignments/${assignmentId}`), patch);
}

/* Deleted rather than archived, unlike a class. An assignment holds no
   subcollection to strand, and a teacher who set the wrong due date wants it
   gone rather than filed. Deleting also re-locks whatever it was holding open,
   with no cleanup step, because that unlock was never stored. */
export async function deleteAssignment(classId, assignmentId) {
  await deleteDoc(doc(db, `classes/${classId}/assignments/${assignmentId}`));
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
  const already = await getDoc(seat);
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

  return { classId: resolved.classId, className: klass.name, code: resolved.code };
}

export async function leaveClass(uid, classId) {
  await deleteDoc(doc(db, `classes/${classId}/roster/${uid}`));
  await setDoc(
    doc(db, `users/${uid}`),
    { classId: '', updatedAt: Date.now() },
    { merge: true }
  ).catch(() => {});
}

export async function readRoster(classId) {
  const snap = await getDocs(collection(db, `classes/${classId}/roster`));
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
    (snap) => onChange(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
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
  const snap = await getDocs(
    query(collection(db, 'roster'), where('teacherUid', '==', teacherUid))
  );
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
  const snap = await getDocs(
    query(
      collection(db, `classes/${classId}/roster/${uid}/events`),
      orderBy('at', 'desc'),
      limit(max || 500)
    )
  );
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
  const snap = await getDocs(collection(db, `classes/${classId}/roster/${uid}/progress`));
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
