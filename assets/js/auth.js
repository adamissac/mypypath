/* PyPath — Firebase Auth wrapper. Dispatches `pypath:auth` on document so no
   UI file has to import Firebase. */
import { auth, SDK_VERSION } from '/assets/js/firebase-config.js';
import { shouldRejectNewUser } from '/assets/js/auth-rules.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  getAdditionalUserInfo,
  deleteUser,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} = await import(`${BASE}/firebase-auth.js`);

let user = null;
// Set while a provider popup is being checked for the create-account case.
let validatingProvider = false;

function toast(message) {
  if (window.PyUI && window.PyUI.showToast) window.PyUI.showToast(message);
}

export function currentUser() { return user; }

export async function signUpWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// Thrown when a provider popup would have created an account on a surface that
// is only meant to sign existing learners in.
export const NO_ACCOUNT = 'pypath/no-account';

// Firebase creates the account as part of the popup, so "do not sign up here"
// has to be enforced afterwards: detect the brand-new user and undo it. Callers
// must opt in with allowNewAccount, so a new surface fails closed.
async function popupSignIn(provider, options) {
  const allowNewAccount = !!(options && options.allowNewAccount);
  validatingProvider = true;
  try {
    const cred = await signInWithPopup(auth, provider);

    if (shouldRejectNewUser(getAdditionalUserInfo(cred), { allowNewAccount })) {
      try {
        await deleteUser(cred.user);
      } catch (e) {
        // Deleting can fail (stale token, network). Signing out at least leaves
        // the learner where they started instead of silently logged in.
        try { await signOut(auth); } catch (e2) { /* nothing left to try */ }
      }
      const err = new Error('That account has not signed up for PyPath yet.');
      err.code = NO_ACCOUNT;
      throw err;
    }

    return cred.user;
  } finally {
    // Always reopen the gate, on every path including a closed popup, then
    // announce whatever the real state settled to.
    validatingProvider = false;
    user = auth.currentUser;
    handleAuth(auth.currentUser);
  }
}

export function signInWithGoogle(options) {
  return popupSignIn(new GoogleAuthProvider(), options);
}

export function signInWithGitHub(options) {
  return popupSignIn(new GithubAuthProvider(), options);
}

export async function sendReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

let reloadedOnce = false;

function handleAuth(next) {
  document.dispatchEvent(
    new CustomEvent('pypath:auth', { detail: { user: next } })
  );

  // The SDK restores the user from IndexedDB, and that cached copy can predate
  // a displayName set on another page -- the header would then show no username
  // until something else refreshed it. Reload once and re-announce.
  if (next && !next.displayName && !reloadedOnce) {
    reloadedOnce = true;
    next.reload().then(() => {
      if (auth.currentUser && auth.currentUser.displayName) {
        user = auth.currentUser;
        document.dispatchEvent(
          new CustomEvent('pypath:auth', { detail: { user: auth.currentUser } })
        );
      }
    }).catch(() => {});
  }
}

onAuthStateChanged(auth, (next) => {
  user = next;
  // A provider popup is still being validated. Announcing now would let sync.js
  // write a profile -- email, display name, photo -- for an account that is
  // about to be deleted, leaving that person's details behind under a dead uid.
  if (validatingProvider) return;
  handleAuth(next);
});

// A failed auth bootstrap must never take a lesson page down.
window.addEventListener('unhandledrejection', (e) => {
  if (String(e.reason || '').includes('firebase')) {
    toast('Sign-in is unavailable right now');
  }
});
