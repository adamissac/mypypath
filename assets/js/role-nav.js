/* PyPath — reveals the "My classroom" link for teacher accounts.

   The role lives in Firestore, and this runs on every page, so the answer is
   cached per session: a teacher navigating twenty lessons should not pay
   twenty document reads to keep one menu item visible. */
import { db, SDK_VERSION } from '/assets/js/firebase-config.js';
import { currentUser } from '/assets/js/auth.js';
// Rides along here rather than as its own script tag: this module is already
// loaded on every page, and adding a tag to all 124 of them is a change that
// would have to be repeated for every page added later.
import '/assets/js/join-menu.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const { doc, getDoc } = await import(`${BASE}/firebase-firestore.js`);

const ROLES = window.PyPathRoles;
const CACHE_PREFIX = 'pypath-role:';

function cached(uid) {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + uid);
  } catch (e) {
    return null;
  }
}

function remember(uid, role) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + uid, role);
  } catch (e) {}
}

function paint(role) {
  const isTeacher = ROLES.normalizeRole(role) === 'teacher';
  document.querySelectorAll('[data-account-classroom]').forEach((el) => {
    el.hidden = !isTeacher;
  });
}

async function apply(user) {
  if (!user) {
    paint('student');
    return;
  }
  const known = cached(user.uid);
  if (known) {
    paint(known);
    return;
  }
  try {
    const snap = await getDoc(doc(db, `users/${user.uid}`));
    const role = ROLES.normalizeRole(snap.exists() ? snap.data().role : '');
    remember(user.uid, role);
    paint(role);
  } catch (e) {
    // Offline or denied: leave the link hidden rather than showing a page the
    // account cannot use.
    paint('student');
  }
}

// Changing role on the account page must not need a reload to show up.
document.addEventListener('pypath:role', (e) => {
  const user = currentUser();
  const role = ROLES.normalizeRole(e.detail && e.detail.role);
  if (user) remember(user.uid, role);
  paint(role);
});

document.addEventListener('pypath:auth', (e) => apply(e.detail.user));
if (currentUser()) apply(currentUser());
