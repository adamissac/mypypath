/* PyPath — header account control. Reacts to `pypath:auth`. */
import { signOutUser } from '/assets/js/auth.js';

const menu = document.querySelector('[data-account-menu]');
if (menu) {
  const signin = menu.querySelector('[data-account-signin]');
  const avatar = menu.querySelector('[data-account-avatar]');
  const photo = menu.querySelector('[data-account-photo]');
  const panel = menu.querySelector('[data-account-panel]');

  const nameChip = menu.querySelector('[data-account-username]');

  document.addEventListener('pypath:auth', (e) => {
    const user = e.detail.user;
    signin.hidden = !!user;
    avatar.hidden = !user;
    if (user && user.photoURL) photo.src = user.photoURL;
    if (nameChip) {
      // displayName is the username. Never fall back to the email here: the
      // header is visible over anyone's shoulder.
      nameChip.textContent = user && user.displayName ? user.displayName : '';
    }
    if (!user) {
      panel.hidden = true;
      avatar.setAttribute('aria-expanded', 'false');
    }
  });

  avatar.addEventListener('click', () => {
    const open = !panel.hidden;
    panel.hidden = open;
    avatar.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) {
      panel.hidden = true;
      avatar.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      avatar.setAttribute('aria-expanded', 'false');
      avatar.focus();
    }
  });

  menu.querySelector('[data-account-signout]').addEventListener('click', async () => {
    await signOutUser();
    window.PyUI && window.PyUI.showToast('Signed out');
  });
}
