/* PyPath — paints the account's role onto every page.

   Reveals the "My classroom" link and any other teacher-only markup, and
   announces the resolved role so the classic gating scripts (gate.js,
   lesson-progress.js) can drop their learner gates for a teacher.

   The role lives in Firestore, and this runs on every page, so the answer is
   cached per session: a teacher navigating twenty lessons should not pay
   twenty document reads to keep one menu item visible. */
import { currentUser } from '/assets/js/auth.js';
import { loadProfile } from '/assets/js/profile.js';
// Rides along here rather than as its own script tag: this module is already
// loaded on every page, and adding a tag to all 124 of them is a change that
// would have to be repeated for every page added later.
import '/assets/js/join-menu.js';
import { loadMembership } from '/assets/js/membership.js';

const ROLES = window.PyPathRoles;
/* Versioned so sessions poisoned by the old cold-load race are repaired once.
   Before profile.js required a server-confirmed role, a teacher could be
   cached here as a student for the rest of the tab. Keeping the old key would
   make the fixed reader unreachable because apply() returns on any cache hit. */
const CACHE_PREFIX = 'pypath-role:v2:';

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
  const isTeacher = ROLES.isTeacher(role);
  // Also stamps data-role on <html> and caches the role for the classic
  // scripts, which cannot read Firestore themselves.
  ROLES.rememberRole(role);
  document.querySelectorAll('[data-account-classroom], [data-teacher-only]').forEach((el) => {
    el.hidden = !isTeacher;
  });
  // Named in the menu it is asked from, so "am I a teacher on here" is a
  // question the site answers rather than one you infer from which links show.
  document.querySelectorAll('[data-account-role]').forEach((el) => {
    el.textContent = isTeacher ? 'Teacher account' : 'Student account';
    el.className = 'account-panel__role is-' + (isTeacher ? 'teacher' : 'student');
    el.hidden = false;
  });
  document.querySelectorAll('[data-student-only]').forEach((el) => {
    el.hidden = isTeacher;
  });
}

/* The student half of the same idea as the classroom link. A learner in a
   class has somewhere to see what has been set for them; one working alone has
   nothing there, so the link would lead to an empty panel and an obvious
   question about what it was for.

   Enrollment rather than role, and read through membership.js so it comes off
   the session cache rather than costing a document read on every page. */
async function paintClassLinks(user, role) {
  const links = document.querySelectorAll('[data-student-class]');
  if (!links.length) return;
  let inClass = false;
  if (user && !ROLES.isTeacher(role)) {
    try {
      inClass = !!(await loadMembership(user.uid));
    } catch (e) {
      // Leave it hidden. A link to a page we could not confirm they can use is
      // worse than no link.
      inClass = false;
    }
  }
  links.forEach((el) => { el.hidden = !inClass; });
}

// Only the resolver announces. paint() is also called from the pypath:role
// listener below, and announcing from there would echo every event back onto
// itself.
function announce(role) {
  paint(role);
  paintClassLinks(currentUser(), role).catch(() => {});
  document.dispatchEvent(new CustomEvent('pypath:role', { detail: { role: ROLES.normalizeRole(role) } }));
}

async function apply(user) {
  if (!user) {
    announce('student');
    return;
  }
  const known = cached(user.uid);
  if (known) {
    announce(known);
    return;
  }
  /* Through profile.js rather than a getDoc of its own, and this was the
     fifth independent reader of users/{uid} -- the one 47533a6 missed while
     fixing the other four. It had the same cold-cache bug and the worst
     consequence of any of them: a read that came back with no role was
     normalized to 'student' and written to sessionStorage, where it outlives
     the page. ROLES.teachingNow() reads that key, and lesson-progress.js asks
     teachingNow() to decide whether the unit lock applies -- so one unlucky
     first page load in a tab left a teacher with the classroom link hidden and
     the course locked against them for the rest of the session, on every page
     they opened, with no read left to correct it. */
  try {
    const profile = await loadProfile(user.uid);
    const role = ROLES.normalizeRole(profile.role);
    remember(user.uid, role);
    announce(role);
  } catch (e) {
    /* Nothing is announced and nothing is remembered.
       Offline or denied is not evidence of being a student, and the old
       announce('student') here did not merely leave the link hidden: it cached
       that guess for the session and stamped it onto <html>. Leaving the page
       as it already is keeps the teacher-only links hidden, which is the
       cautious half of what that line was for, without recording a fact
       nobody established. */
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
