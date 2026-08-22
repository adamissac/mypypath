/* PyPath — "Join a class" in the account menu, for everyone, at any time.

   Joining used to happen only in the signup form, which meant anyone who
   signed up with Google or GitHub never saw it: those buttons skip the form
   entirely. Rather than patch the code field into three signup paths, the
   whole thing moved here, where it is reachable from any page, before or long
   after the account was made.

   The menu item and the dialog are built in script rather than added to the
   markup of every page: the account panel already exists on all 124 of them,
   and threading one more element through each one is a change that has to be
   repeated for every future page. */
import { currentUser } from '/assets/js/auth.js';
import { joinClass, leaveClass, readRoster } from '/assets/js/class-join.js';

const ROLES = window.PyPathRoles;

let dialog = null;
let uid = null;
let roster = {};
// What to hand focus back to when the dialog closes: the menu item that
// opened it, so a keyboard user lands where they started.
let opener = null;

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

function el(tag, attrs, text) {
  const node = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => {
    if (k === 'class') node.className = attrs[k];
    else node.setAttribute(k, attrs[k]);
  });
  if (text != null) node.textContent = text;
  return node;
}

function inClass() {
  return !!roster.teacherUid;
}

function close() {
  if (!dialog) return;
  dialog.hidden = true;
  document.body.classList.remove('join-modal-open');
  if (opener && document.contains(opener)) opener.focus();
  opener = null;
}

function buildDialog() {
  const wrap = el('div', { class: 'join-modal', hidden: 'hidden' });
  wrap.innerHTML = `
    <div class="join-modal__scrim"></div>
    <div class="join-modal__card" role="dialog" aria-modal="true"
         aria-labelledby="join-modal-title" aria-describedby="join-modal-body">
      <div class="join-modal__head">
        <h2 class="join-modal__title" id="join-modal-title">Join a class</h2>
        <button type="button" class="join-modal__close" data-join-close
                aria-label="Close">&times;</button>
      </div>
      <p class="join-modal__body" id="join-modal-body" data-join-body></p>
      <form data-join-form>
        <label for="join-modal-code">Teacher join code</label>
        <input id="join-modal-code" type="text" inputmode="latin" autocomplete="off"
               autocapitalize="characters" spellcheck="false"
               maxlength="9" placeholder="ABC234">
        <p class="auth-error" data-join-error role="alert" hidden></p>
        <div class="join-modal__actions">
          <button type="submit" class="btn btn-primary" data-join-submit>Join class</button>
          <button type="button" class="btn btn-ghost" data-join-close>Cancel</button>
        </div>
      </form>
      <p class="join-modal__leave" hidden>
        <button type="button" class="btn btn-ghost btn-small" data-join-leave>Leave this class</button>
      </p>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelectorAll('[data-join-close]').forEach((b) => {
    b.addEventListener('click', close);
  });

  // Codes are handed out in capitals and the field renders them that way, so
  // the value follows what is on screen rather than what was typed.
  const codeInput = wrap.querySelector('#join-modal-code');
  codeInput.addEventListener('input', () => {
    const at = codeInput.selectionStart;
    codeInput.value = codeInput.value.toUpperCase();
    codeInput.setSelectionRange(at, at);
  });

  // A click that starts on the card and ends on the scrim is a drag, not a
  // dismissal, so only close on a press that begins outside.
  wrap.querySelector('.join-modal__scrim').addEventListener('mousedown', close);

  wrap.querySelector('[data-join-form]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = wrap.querySelector('[data-join-error]');
    const input = wrap.querySelector('#join-modal-code');
    err.hidden = true;
    if (!ROLES.normalizeCode(input.value)) {
      err.hidden = false;
      err.textContent = 'Enter the join code your teacher gave you.';
      return;
    }
    const submit = wrap.querySelector('[data-join-submit]');
    submit.disabled = true;
    try {
      await joinClass(uid, input.value);
      roster = await readRoster(uid);
      input.value = '';
      close();
      paint();
      toast('You joined the class.');
    } catch (e) {
      err.hidden = false;
      err.textContent = (e && e.message) || 'Could not join that class.';
    } finally {
      submit.disabled = false;
    }
  });

  const leave = wrap.querySelector('[data-join-leave]');
  leave.addEventListener('click', async () => {
    // Reversible, and the code is on screen a moment ago, so a plain confirm
    // step here is enough friction without a modal inside a modal.
    if (leave.dataset.confirming !== 'yes') {
      leave.dataset.confirming = 'yes';
      leave.textContent = 'Confirm leaving';
      return;
    }
    try {
      await leaveClass(uid);
      roster = await readRoster(uid);
      leave.textContent = 'Leave this class';
      delete leave.dataset.confirming;
      close();
      paint();
      toast('You left the class. Your progress is unchanged.');
    } catch (e) {
      toast('Could not leave the class. Please try again.');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !wrap.hidden) close();
  });

  return wrap;
}

function open() {
  if (!dialog) dialog = buildDialog();
  const body = dialog.querySelector('[data-join-body]');
  const leaveRow = dialog.querySelector('.join-modal__leave');
  const form = dialog.querySelector('[data-join-form]');
  const err = dialog.querySelector('[data-join-error]');

  err.hidden = true;
  if (inClass()) {
    body.textContent = 'You are in the class with join code ' + (roster.joinCode || '') +
      '. Entering a different code moves you to that class.';
    leaveRow.hidden = false;
  } else {
    body.textContent = 'Enter the code your teacher gave you. Your teacher will be able ' +
      'to see your progress and time spent, but never the code you write.';
    leaveRow.hidden = true;
  }

  dialog.hidden = false;
  document.body.classList.add('join-modal-open');
  const input = form.querySelector('#join-modal-code');
  if (input) {
    input.value = '';
    input.focus();
  }
}

// The item lives in the account dropdown next to "My progress", so it is one
// click from anywhere on the site.
function paint() {
  document.querySelectorAll('[data-account-panel]').forEach((panel) => {
    let item = panel.querySelector('[data-join-open]');
    if (!uid) {
      if (item) item.remove();
      return;
    }
    if (!item) {
      item = el('button', { type: 'button', role: 'menuitem' });
      item.setAttribute('data-join-open', '');
      item.addEventListener('click', (ev) => {
        opener = ev.currentTarget;
        open();
      });
      const anchor = panel.querySelector('[data-account-classroom]')
        || panel.querySelector('a[href="/progress.html"]');
      if (anchor && anchor.nextSibling) panel.insertBefore(item, anchor.nextSibling);
      else panel.appendChild(item);
    }
    item.textContent = inClass() ? 'My class' : 'Join a class';
  });
}

async function apply(user) {
  uid = user ? user.uid : null;
  roster = {};
  if (uid) {
    try {
      roster = await readRoster(uid);
    } catch (e) { /* offline: the dialog still opens and the join can retry */ }
  }
  paint();
}

document.addEventListener('pypath:auth', (e) => apply(e.detail.user));
if (currentUser()) apply(currentUser());
