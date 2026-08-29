/* PyPath — who is allowed to see the teacher dashboard.
 *
 * This file used to be the dashboard: a join code, a roster table over the flat
 * roster/{uid} collection, and the certificate approval queue. All three have
 * moved to the classes/{classId} model that classroom-dashboard.js renders, and
 * the table they lived in is gone. What is left is the part that never belonged
 * to either model -- the answer to "is this person a teacher", which decides
 * which of the page's four states is on screen.
 *
 * The legacy collection itself is not gone and is not going. join-flow.js still
 * writes roster/{uid} on every join, because the certificate handshake and its
 * gradingOwnStudent() rule are stored there and because admin.html reads the
 * same collection. Only this page's view of it was removed.
 */
import { currentUser } from '/assets/js/auth.js';
import { readProfile } from '/assets/js/class-join.js';

const ROLES = window.PyPathRoles;

function qs(sel) { return document.querySelector(sel); }

function show(name) {
  ['loading', 'guest', 'not-teacher', 'error'].forEach((s) => {
    const el = qs(`[data-class-state="${s}"]`);
    if (el) el.hidden = s !== name;
  });
}

let started = false;

async function start(user) {
  if (started) return;
  started = true;
  try {
    const profile = await readProfile(user.uid);
    if (ROLES.normalizeRole(profile.role) !== 'teacher') {
      show('not-teacher');
      started = false;
      return;
    }
    // Nothing to reveal: classroom-dashboard.js owns everything a teacher sees
    // from here, and shows itself once its own data has loaded. This only has
    // to stop hiding the page behind "Loading your class".
    show(null);
  } catch (e) {
    const msg = qs('[data-class-error-message]');
    if (msg) msg.textContent = String((e && e.message) || e);
    show('error');
    started = false;
  }
}

function apply(user) {
  if (!user) {
    show('guest');
    started = false;
    return;
  }
  start(user);
}

document.addEventListener('pypath:auth', (e) => apply(e.detail.user));
if (currentUser()) apply(currentUser());
