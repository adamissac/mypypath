/* PyPath — the class controls on the account page: join, leave, become a teacher.

   A student cannot read their teacher's account document — the rules only let
   a teacher read downward — so this shows the code they joined with rather
   than the teacher's name. The code is what they were given and what they can
   check against, which is the useful half anyway. */
import { currentUser } from '/assets/js/auth.js';
import {
  readProfile, readRoster, ensureJoinCode, setRole,
} from '/assets/js/class-join.js';
import { joinAnyClass, leaveAnyClass } from '/assets/js/join-flow.js';


/* Deletes everything the class holds about this learner: their roster row,
   their mirrored progress and code, their code history, and their activity
   record. Best-effort and client-side, because there are no Cloud Functions
   here -- but the rules permit exactly this and nothing wider, so a student
   really can erase their own class record without asking anyone. */
async function purgeClassCopy(uid) {
  try {
    const { currentClassId, loadMembership, setClassId } =
      await import('/assets/js/membership.js');
    const { purgeStudent } = await import('/assets/js/classroom-store.js');
    const classId = currentClassId() || await loadMembership(uid, true);
    if (!classId) return;
    await purgeStudent(classId, uid);
    setClassId(uid, null);
  } catch (e) {
    // A learner who was never in a classes/{classId} class has nothing to
    // purge, and a failure here must not block leaving.
  }
}

const ROLES = window.PyPathRoles;

/* The classes/{classId} system, imported on demand.

   Lazy because a student never needs it and classroom-store.js pulls in the
   Firestore SDK. A failure here is not fatal: the account page still shows the
   role and the legacy code, which is what it showed before classes existed. */
async function classroomStore() {
  return import('/assets/js/classroom-store.js');
}

const section = document.querySelector('[data-class-section]');
if (section) {
  let uid = null;
  let profile = {};
  let classes = [];

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

  /* Says which kind of account this is, in as many words.
     Before this the only way to tell was to notice which controls were on the
     page, which is not something anyone should have to work out. */
  function paintRole(role) {
    const wrap = section.querySelector('[data-class-role]');
    const badge = section.querySelector('[data-class-role-badge]');
    const note = section.querySelector('[data-class-role-note]');
    if (!wrap || !badge || !note) return;
    const teaching = ROLES.isTeacher(role);
    badge.textContent = teaching ? 'Teacher account' : 'Student account';
    badge.className = 'class-role__badge is-' + (teaching ? 'teacher' : 'student');
    note.textContent = teaching
      ? 'You can create classes, set work with due dates, and choose which units are open.'
      : 'You are learning. Your work is private unless you join a class with a code.';
    wrap.hidden = false;
  }

  /* The teacher's real classes, each with the code for that class.
     A teacher can have several, and the code they hand out has to be the code
     for the one they mean. */
  function paintClasses() {
    const wrap = section.querySelector('[data-class-list-wrap]');
    const list = section.querySelector('[data-class-list]');
    const none = section.querySelector('[data-class-none]');
    if (!list) return;

    list.innerHTML = '';
    classes.forEach((klass) => {
      const item = document.createElement('li');
      item.className = 'class-list__item';
      const name = document.createElement('strong');
      name.textContent = klass.name + (klass.archived ? ' (archived)' : '');
      const code = document.createElement('code');
      code.className = 'class-list__code';
      code.textContent = klass.joinCode || '------';
      item.appendChild(name);
      item.appendChild(document.createTextNode(' \u2014 join code '));
      item.appendChild(code);
      list.appendChild(item);
    });

    if (wrap) wrap.hidden = classes.length === 0;
    if (none) none.hidden = classes.length > 0;

    // Only mentioned when there is one. A teacher who never used the old system
    // should never be told about it.
    const legacy = section.querySelector('[data-class-legacy-code]');
    if (legacy) legacy.hidden = !profile.joinCode;
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
    paintRole(role);
    if (ROLES.isTeacher(role)) paintClasses();
    section.hidden = false;
  }

  async function refresh() {
    // Two documents: the account record holds the role, the roster holds the
    // class. They are separate so a teacher reading the roster never touches
    // the account record.
    const [account, roster] = await Promise.all([readProfile(uid), readRoster(uid)]);
    profile = Object.assign({}, account, {
      teacherUid: roster.teacherUid || '',
      joinCode: roster.joinCode || account.joinCode || '',
    });

    // The classes/{classId} classes this teacher owns. Only for a teacher, and
    // never fatal: an offline read leaves the list empty and the page still
    // shows the role and the code.
    classes = [];
    if (ROLES.isTeacher(ROLES.normalizeRole(profile.role))) {
      try {
        const { classesFor } = await classroomStore();
        classes = await classesFor(uid);
      } catch (e) {
        classes = [];
      }
    }
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
        await joinAnyClass(uid, raw);
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
        await leaveAnyClass(uid);

        // Leaving is the erasure path, not just a disconnection. The rules
        // permit deleting the class copy only once the roster document is
        // gone, so this has to run after leaveClass rather than alongside it.
        await purgeClassCopy(uid);

        await refresh();
        leave.textContent = 'Leave this class';
        delete leave.dataset.confirming;
        document.dispatchEvent(new CustomEvent('pypath:class-left'));
        window.PyUI && window.PyUI.showToast(
          'You left the class. The class copy of your work was deleted; your own progress is unchanged.'
        );
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
        // The legacy code, still issued because class-state.js and the
        // certificate handshake both read it. It is no longer the thing a
        // teacher is handed, though: the class below is.
        await ensureJoinCode(uid, {});

        /* And a real class, which is the part that was missing.
           Setting the role alone left a teacher with a legacy join code and a
           legacy table, and no way to reach assignments or unit access without
           knowing to look for a create form on another page. Whatever they do
           next, they now have a class to do it in. */
        try {
          const { createClass } = await classroomStore();
          await createClass(uid, 'My class');
        } catch (e) {
          // A failure here leaves a teacher with no class, which the account
          // page now says out loud and offers a form to fix, rather than
          // failing the whole switch.
        }

        await refresh();
        announce('teacher');
        window.PyUI && window.PyUI.showToast(
          'You are a teacher now. Your class is ready in your classroom.'
        );
      } catch (e) {
        fail('Could not switch your account to a teacher account.');
      } finally {
        become.disabled = false;
      }
    });
  }

  const createForm = section.querySelector('[data-class-create-form]');
  if (createForm) {
    createForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearError();
      const input = createForm.querySelector('input');
      const name = input ? input.value.trim() : '';
      if (!name) {
        fail('Give the class a name.');
        return;
      }
      const button = createForm.querySelector('button');
      if (button) button.disabled = true;
      try {
        const { createClass } = await classroomStore();
        await createClass(uid, name);
        if (input) input.value = '';
        await refresh();
        window.PyUI && window.PyUI.showToast('Class created. Open your classroom to set work.');
      } catch (e) {
        fail('Could not create that class. Please try again.');
      } finally {
        if (button) button.disabled = false;
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
