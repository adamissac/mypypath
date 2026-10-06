import { currentUser } from '/assets/js/auth.js';
import { loadProfile } from '/assets/js/profile.js';

let runningFor = null;
let completedFor = null;
const target = document.querySelector('[data-teacher-verification-status]');
function show(message) { if (target) target.textContent = message; }
async function ensureVerification() {
  const user = currentUser();
  if (!user) { completedFor = null; show('Sign in to see teacher verification.'); return; }
  if (runningFor === user.uid || completedFor === user.uid) return;
  runningFor = user.uid;
  try {
    const profile = await loadProfile(user.uid);
    if (currentUser()?.uid !== user.uid || profile.role !== 'teacher') return;
    if (!user.emailVerified) { show('Verify your school sign-in email to start automatic teacher verification.'); return; }
    show('Checking teacher affiliation automatically…');
    const token = await user.getIdToken();
    const response = await fetch('/api/teacher-verification', {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ensure' }), signal: AbortSignal.timeout(65000),
    });
    const result = await response.json();
    if (currentUser()?.uid !== user.uid) return;
    completedFor = user.uid;
    if (!response.ok) { show(result.error || 'Automatic verification is unavailable.'); return; }
    show(result.verified ? 'Teacher affiliation verified automatically.'
      : result.status === 'checking' ? 'Teacher verification is in progress. See verification details for the result.'
      : 'Teacher affiliation could not be verified automatically. See verification details.');
  } catch { if (currentUser()?.uid === user.uid) show('Automatic verification is temporarily unavailable.'); }
  finally { if (runningFor === user.uid) runningFor = null; }
}
document.addEventListener('pypath:auth', ensureVerification);
document.addEventListener('pypath:role', ensureVerification);
ensureVerification();
