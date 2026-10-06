import { currentUser } from '/assets/js/auth.js';

const card = document.querySelector('[data-verification-state]');
const badge = document.getElementById('verification-badge');
const title = document.getElementById('verification-result-title');
const status = document.getElementById('verification-status');
const form = document.getElementById('teacher-verification-form');
const details = document.getElementById('verification-details');
const nameInput = document.getElementById('teacher-review-name');
const accountAction = document.getElementById('verification-account-action');
const classroomAction = document.getElementById('verification-classroom-action');
const identity = document.getElementById('verification-identity');
const evidenceSection = document.getElementById('verification-evidence');
const sources = document.getElementById('verification-sources');
const submit = form.querySelector('button');
let generation = 0;
let identityKey = null;
let pollTimer;
let controller;
let pollCount = 0;

function setState(state, label, heading, message) {
  card.dataset.verificationState = state;
  badge.textContent = label;
  title.textContent = heading;
  status.textContent = message;
  submit.disabled = state === 'checking';
  submit.textContent = state === 'checking' ? 'Checking…' : 'Check again';
  classroomAction.hidden = state !== 'verified';
}
function accountLink(text, href = '/account.html') {
  accountAction.textContent = text;
  accountAction.href = href;
  accountAction.hidden = false;
}
function date(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
async function api(user, body) {
  const token = await user.getIdToken();
  const response = await fetch('/api/teacher-verification', {
    method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Automatic verification is temporarily unavailable.'), { status: response.status });
  }
  return data;
}
function renderEvidence(row) {
  sources.replaceChildren();
  const entries = Array.isArray(row?.evidence) ? row.evidence : [];
  const labels = {
    'name-email-teaching-role-matched': 'Name, email, and teaching role matched',
    'no-match': 'No complete match on this page',
    'source-unavailable': 'Page could not be reached',
  };
  for (const entry of entries) {
    let url;
    try { url = new URL(entry.source); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const item = document.createElement('li'); item.className = 'verification-source';
    const marker = document.createElement('span'); marker.className = 'verification-source-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = entry.result === 'name-email-teaching-role-matched' ? '✓' : '·';
    const content = document.createElement('div');
    const result = document.createElement('p'); result.textContent = labels[entry.result] || 'School page checked';
    const link = document.createElement('a');
    link.textContent = url.hostname + (url.pathname === '/' ? '' : url.pathname) + ' ↗';
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Open school source: ' + url.hostname + url.pathname + ' (opens in a new tab)');
    content.append(result, link); item.append(marker, content); sources.append(item);
  }
  evidenceSection.hidden = !sources.children.length;
  document.getElementById('verification-checked-at').textContent = date(row?.checkedAt);
}
function render(data, user, version) {
  const row = data.request;
  accountAction.hidden = true;
  identity.hidden = false;
  document.getElementById('verification-email').textContent = user.email || row?.email || 'No account email';
  const expiry = data.verified && date(row?.expiresAt);
  document.getElementById('verification-expiry-row').hidden = !expiry;
  document.getElementById('verification-expiry').textContent = expiry || '';
  if (row?.fullName && document.activeElement !== nameInput) nameInput.value = row.fullName;
  details.hidden = false;
  renderEvidence(row);
  if (data.verified) {
    setState('verified', 'Verified teacher', 'Your school connection is verified.', 'Your verified school email, directory name, and teaching role matched an official staff listing. Your affiliation will be checked again automatically when this result expires.');
    details.open = false;
  } else if (data.status === 'checking') {
    setState('checking', 'Check in progress', 'Checking your school connection…', 'We’re checking your official school website for a matching staff listing. Your result will appear here automatically.');
    if (pollCount++ < 12) pollTimer = setTimeout(() => run(user, version), 5000);
    else setState('unavailable', 'Check taking longer', 'Your check is still in progress.', 'The directory is taking longer than expected. Return to this page in a few minutes to see the result.');
  } else if (data.status === 'account-ineligible') {
    details.hidden = true;
    setState('ineligible', 'Teacher account required', 'Use your teacher account.', 'Teacher verification requires a teacher account with a confirmed school sign-in email.');
    accountLink('Go to account');
  } else {
    details.open = true;
    const unavailable = row?.evidence?.length && row.evidence.every(entry => entry.result === 'source-unavailable');
    setState('unverified', 'Not verified yet', unavailable ? 'We couldn’t reach your school directory.' : 'We couldn’t confirm a complete match.', unavailable
      ? 'Your account is still unverified. Your school’s site may be temporarily unavailable or may block automated checks. You can try again after 24 hours.'
      : 'We need your full name, exact school email, and teaching role in the same public staff listing. Check your directory name below. Missing listings do not mean you aren’t a teacher.');
  }
}
function renderError(error, user) {
  if (error.name === 'AbortError') return;
  accountAction.hidden = true;
  details.hidden = false;
  if (error.status === 401) {
    details.hidden = true;
    setState('signed-out', 'Sign-in required', 'Sign in to continue.', 'Your session needs to be refreshed before we can check your teacher account.');
    accountLink('Sign in again', '/login.html');
  } else if (error.status === 403) {
    details.hidden = true;
    setState('ineligible', 'Account action needed', 'Check your school account.', 'Use a teacher account and confirm your school sign-in email before starting an automatic check.');
    accountLink('Go to account');
  } else if (error.status === 422) {
    details.hidden = true;
    setState('unsupported', 'School not supported yet', 'Your school’s domain isn’t covered yet.', 'Automatic checks support institutional .k12.[state].us, .edu, .org, .school, and .academy domains. This account stays unverified; using a personal email or a different domain cannot confirm your school affiliation.');
    accountLink('Check account email');
  } else if (error.status === 400) {
    details.open = true;
    setState('needs-name', 'Directory name needed', 'Add your school directory name.', 'Enter your full name exactly as it appears in your school’s staff listing so the automatic check can find a match.');
  } else if (error.status === 429) {
    details.open = true;
    setState('cooldown', 'Check already requested', 'Give your last check a little time.', 'Automatic checks are limited to once every 24 hours. If a check is already running, return in a few minutes to see its result.');
  } else {
    setState('unavailable', 'Temporarily unavailable', 'We couldn’t complete the check.', 'The verification service is unavailable right now. Please try again later. Your account has not been marked as verified.');
  }
  if (user?.email) { identity.hidden = false; document.getElementById('verification-email').textContent = user.email; }
}
async function run(user, version, body) {
  try {
    const data = await api(user, body);
    if (version === generation && currentUser()?.uid === user.uid) render(data, user, version);
  } catch (error) {
    if (version === generation && currentUser()?.uid === user.uid) renderError(error, user);
  }
}
function refresh() {
  const user = currentUser();
  const nextKey = user ? `${user.uid}:${user.email}:${user.emailVerified}` : 'signed-out';
  if (nextKey === identityKey) return;
  identityKey = nextKey;
  const version = ++generation;
  controller?.abort(); controller = new AbortController();
  clearTimeout(pollTimer); pollCount = 0;
  sources.replaceChildren();
  identity.hidden = true; evidenceSection.hidden = true; details.hidden = true;
  document.getElementById('verification-expiry-row').hidden = true;
  nameInput.value = user?.displayName || '';
  accountAction.hidden = true;
  if (!user) {
    setState('signed-out', 'Automatic verification', 'Let’s connect your school.', 'Sign in with your teacher account to see your verification status.');
    accountLink('Sign in to continue', '/login.html'); return;
  }
  if (!user.emailVerified) {
    setState('email-required', 'Confirm your email', 'Start with your school email.', 'Open the verification email sent when you signed up, then sign in again. We can check your school directory once your email is confirmed.');
    accountLink('Go to account'); return;
  }
  setState('checking', 'Automatic verification', 'Checking your school connection…', 'We’re looking for your name, school email, and teaching role in an official staff listing. This may take a moment.');
  run(user, version, { action: 'ensure' });
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const user = currentUser();
  if (!user || submit.disabled) return;
  clearTimeout(pollTimer); pollCount = 0;
  setState('checking', 'Automatic verification', 'Checking your school connection…', 'We’re checking your directory name against your official school website. Your result will appear here automatically.');
  run(user, generation, { action: 'check', fullName: nameInput.value.trim() });
});
document.addEventListener('pypath:auth', refresh);
refresh();
