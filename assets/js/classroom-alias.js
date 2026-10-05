/* Classroom identity is deliberately independent of Auth names and email. */
import { loadProfile, invalidateProfile } from '/assets/js/profile.js';
import { db, importFirebaseModule } from '/assets/js/firebase-config.js';

export function normalizeClassroomAlias(value) {
  const alias = typeof value === 'string' ? value.trim().replace(/ +/g, ' ') : '';
  return /^[A-Za-z0-9][A-Za-z0-9 _-]{2,31}$/.test(alias) ? alias : '';
}

export function fallbackClassroomAlias(uid) {
  let hash = 2166136261;
  for (const char of String(uid || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return 'Learner-' + (hash >>> 0).toString(36).padStart(7, '0');
}

export async function loadClassroomAlias(uid) {
  const profile = await loadProfile(uid);
  return normalizeClassroomAlias(profile.classroomAlias) || fallbackClassroomAlias(uid);
}

export async function saveClassroomAlias(uid, value) {
  const alias = normalizeClassroomAlias(value);
  if (!uid || !alias) throw new Error('Use 3–32 letters, numbers, spaces, hyphens or underscores for your classroom alias.');
  const { doc, setDoc } = await importFirebaseModule('firebase-firestore.js');
  await setDoc(doc(db, 'users/' + uid), { classroomAlias: alias }, { merge: true });
  invalidateProfile(uid);
  document.dispatchEvent(new CustomEvent('pypath:alias', { detail: { uid, alias } }));
  return alias;
}
