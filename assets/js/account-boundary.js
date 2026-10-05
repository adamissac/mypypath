/* Unscoped local learner state belongs to exactly one signed-in account. */
export const OWNER_KEY = 'pypath-local-owner';
const PREFERENCES = new Set(['pypath-theme', 'pypath-fontscale', 'pypath-compact', 'pypath-codetheme', 'pypath-sidebar', 'pypath-sidebar-closed', 'pypath-motion', 'pypath-course']);

export function transitionLocalOwner(uid, local = localStorage, session = sessionStorage) {
  const next = uid || '';
  const previous = local.getItem(OWNER_KEY) || '';
  // Pre-marker installations still have signed-account reconciliation stamps.
  const legacyOwners = [...Object.keys(local), ...Object.keys(session)]
    .filter(key => /^pypath-(?:code-seen|code-scanned|synced):/.test(key))
    .map(key => key.slice(key.indexOf(':') + 1));
  const changed = !!(previous && previous !== next)
    || (!previous && legacyOwners.some(owner => owner !== next));
  if (changed) {
    for (const storage of [local, session]) {
      for (const key of Object.keys(storage)) {
        if ((key.startsWith('pypath-') && !PREFERENCES.has(key)) || key.startsWith('exercise_')) storage.removeItem(key);
      }
    }
  }
  if (next) local.setItem(OWNER_KEY, next);
  else local.removeItem(OWNER_KEY);
  return changed;
}
