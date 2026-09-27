/* PyPath — the one guarded entry point for a Firebase SDK submodule import.
 *
 * Eleven files each built `https://www.gstatic.com/firebasejs/${SDK_VERSION}`
 * and did `await import(...)` against it, with no try/catch around the import
 * itself. Every one of those files already has its own handling for "a
 * Firestore call failed" — sync.js's fullSync() catches and toasts "working
 * offline", profile.js's loadProfile() rejects with a message callers render,
 * activity.js's flush() re-queues the unwritten seconds. None of that ever
 * ran, because the import failing crashed the module before any of it was
 * reached: a top-level `await import()` that rejects makes the whole module's
 * evaluation throw, including every downstream file that imports from it, per
 * the ES module spec, which is why guarding this one seam fixes eleven files
 * instead of eleven one-off try/catches maintained separately.
 *
 * Returns null on failure rather than throwing. A caller that destructures
 * from a null result gets undefined bindings, and calling an undefined
 * binding throws inside whatever try/catch that caller already wraps its
 * Firestore calls in — the same shape as a network error from a call that did
 * reach the SDK. Nothing downstream needed to change to benefit from that.
 */
export const SDK_VERSION = '11.1.0';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

export async function importFirebaseModule(name) {
  try {
    return await import(`${BASE}/${name}`);
  } catch (err) {
    return null;
  }
}
