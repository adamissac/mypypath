/* PyPath — which units a class has open, and how it decides.
 *
 * The read half of classroom-policy.js, which holds the rules and no I/O. Same
 * shape as membership.js and class-state.js, which answer "which class" and
 * "which teacher" with the same caching problem: the answer changes rarely, and
 * a learner navigating twenty lessons must not pay twenty document reads to
 * keep hearing it.
 *
 * Two reads, both cached for the session: the class document carries the lock
 * mode and any units the teacher opened by hand, and the assignments
 * subcollection says which units are held open because work was set on them.
 *
 * Nothing here fails loudly. A denied read, an offline page or a blocked SDK
 * all leave the policy unannounced, and lesson-progress.js then keeps the
 * sequential chain it rendered with. That is the correct answer rather than a
 * degraded one: a broken network must never turn into a student locked out of
 * something they earned.
 */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc, getDocs, collection } = await import(`${BASE}/firebase-firestore.js`);

const POLICY = window.PyPathPolicy;
// Not window.PyPathClassroom: that module is the teacher dashboard's and is
// not loaded on a lesson page, which is exactly where this policy is enforced.
// Reading it here is what made assignmentUnlocks silently empty for students.
const CACHE_PREFIX = 'pypath-policy:';

let policy = null;

export function currentPolicy() {
  return policy;
}

function readCache(classId) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + classId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(classId, value) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + classId, JSON.stringify(value));
  } catch (e) {}
}

function announce(value) {
  policy = value;
  document.dispatchEvent(new CustomEvent('pypath:policy', { detail: { policy: value } }));
}

/* Reads the class's settings and announces them.
 *
 * `force` skips the session cache. A teacher changing the mode on their own
 * dashboard passes it, and so does joining a class, because both change the
 * answer inside a session that has already cached the old one.
 */
export async function loadPolicy(classId, force) {
  if (!classId) {
    // In no class is a real answer, and it is the same answer as "we could not
    // ask": the sequential chain, unchanged.
    announce(null);
    return null;
  }

  if (force !== true) {
    const cached = readCache(classId);
    if (cached) {
      announce(cached);
      return cached;
    }
  }

  try {
    const [klass, assignments] = await Promise.all([
      getDoc(doc(db, `classes/${classId}`)),
      getDocs(collection(db, `classes/${classId}/assignments`)),
    ]);

    const data = klass.exists() ? klass.data() : {};
    const live = assignments.docs.map((d) => d.data());

    const value = {
      mode: POLICY ? POLICY.normalizeMode(data.lockMode) : 'sequential',
      manualUnlocks: Array.isArray(data.manualUnlocks) ? data.manualUnlocks : [],
      // Derived here rather than stored, so deleting an assignment re-locks
      // whatever it was holding open with no cleanup step anywhere.
      assignmentUnlocks: POLICY ? POLICY.assignmentUnlocks(live, Date.now()) : [],
    };
    writeCache(classId, value);
    announce(value);
    return value;
  } catch (e) {
    // Deliberately not cached and deliberately not announced as anything other
    // than null. Remembering a failure would leave a learner on the fallback
    // for the rest of the session even once the network came back.
    announce(null);
    return null;
  }
}
