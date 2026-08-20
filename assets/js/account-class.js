/* PyPath — the class controls on the account page: join, leave, become a teacher.

   A student cannot read their teacher's account document — the rules only let
   a teacher read downward — so this shows the code they joined with rather
   than the teacher's name. The code is what they were given and what they can
   check against, which is the useful half anyway. */
import { currentUser } from '/assets/js/auth.js';
import {
  readProfile, joinClass, leaveClass, ensureJoinCode, setRole,
} from '/assets/js/class-join.js';

const ROLES = window.PyPathRoles;

const section = document.querySelector('[data-class-section]');
if (section) {
  let uid = null;
  let profile = {};

  const errEl = section.querySelector('[data-class-error]');

  function fail(message) {
    if (!errEl) return;
    errEl.hidden = false;
    errEl.textContent = message;
  }

  function clearError() {
    if (errEl) errEl.hidden = true;
  }

  function announce(role) {
    document.dispatchEvent(new CustomEvent('pypath:role', { detail: { role: role } }));
  }

  function render() {
    const role = ROLES.normalizeRole(profile.role);
    // A "student" with no class left to show is back to learning alone, and
    // showing them the student panel with a blank code reads as a bug.
    const view = role === 'student' && !profile.teacherUid ? 'personal' : role;

    section.querySelectorAll('[data-class-view]').forEach((el) => {
      el.hidden = el.dataset.classView !== view;
    });
    section.querySelectorAll('[data-class-current-code]').forEach((el) => {
      el.textContent = profile.joinCode || '——————';
    });
    section.hidden = false;
  }

  async function refresh() {
    profile = await readProfile(uid);
    render();
  }

  section.querySelectorAll('[data-class-join-form]').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearError();
      const input = form.querySelector('input');
      const raw = input ? input.value : '';
      if (!ROLES.normalizeCode(raw)) {
        fail('Enter the join code your teacher gave you.');
        return;
      }
      try {
        await joinClass(uid, raw);
        if (input) input.value = '';
        await refresh();
        announce('student');
        window.PyUI && window.PyUI.showToast('You joined the class.');
      } catch (e) {
        fail((e && e.message) || 'Could not join that class.');
      }
    });
  });

  const leave = section.querySelector('[data-class-leave]');
  if (leave) {
    leave.addEventListener('click', async () => {
      clearError();
      if (leave.dataset.confirming !== 'yes') {
        leave.dataset.confirming = 'yes';
        leave.textContent = 'Confirm leaving';
        return;
      }
      try {
        await leaveClass(uid);
        await refresh();
        leave.textContent = 'Leave this class';
        delete leave.dataset.confirming;
        window.PyUI && window.PyUI.showToast('You left the class. Your progress is unchanged.');
      } catch (e) {
        fail('Could not leave the class. Please try again.');
      }
    });
  }

  const become = section.querySelector('[data-class-become-teacher]');
  if (become) {
    become.addEventListener('click', async () => {
      clearError();
      become.disabled = true;
      try {
        await setRole(uid, 'teacher');
        await ensureJoinCode(uid, {});
        await refresh();
        announce('teacher');
        window.PyUI && window.PyUI.showToast('You now have a class join code.');
      } catch (e) {
        fail('Could not switch your account to a teacher account.');
      } finally {
        become.disabled = false;
      }
    });
  }

  async function apply(user) {
    if (!user) {
      section.hidden = true;
      uid = null;
      return;
    }
    uid = user.uid;
    try {
      await refresh();
    } catch (e) {
      section.hidden = true;
    }
  }

  document.addEventListener('pypath:auth', (e) => apply(e.detail.user));
  if (currentUser()) apply(currentUser());
}
