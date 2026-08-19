/* PyPath — Firebase Auth wrapper. Dispatches `pypath:auth` on document so no
   UI file has to import Firebase. */
import { auth, SDK_VERSION } from '/assets/js/firebase-config.js';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} = await import(`${BASE}/firebase-auth.js`);

let user = null;

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

export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export async function signInWithGitHub() {
  const cred = await signInWithPopup(auth, new GithubAuthProvider());
  return cred.user;
}

export async function sendReset(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

onAuthStateChanged(auth, (next) => {
  user = next;
  document.dispatchEvent(
    new CustomEvent('pypath:auth', { detail: { user: next } })
  );
});

// A failed auth bootstrap must never take a lesson page down.
window.addEventListener('unhandledrejection', (e) => {
  if (String(e.reason || '').includes('firebase')) {
    toast('Sign-in is unavailable right now');
  }
});
