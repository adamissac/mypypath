/* PyPath — Firebase initialization. ES module; the SDK requires it.
   This config is public by design. Access control lives in firestore.rules
   and in the Firebase console's Authorized Domains list.

   importFirebaseModule lives here, not its own file, so every other
   Firebase-dependent file gets it from the same import as `db`/`auth` —
   no extra request (a separate file cost classroom.html 3KB critical-path
   against a budget it was already over; see verify-perf-budget.mjs). */
export const SDK_VERSION = '11.1.0';

const FIREBASE_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

// Null instead of throwing (offline/blocked CDN): an unguarded top-level
// `await import()` used to crash this module's evaluation, and every file
// that imports from it, on any flaky connection. Destructuring from a null
// result just yields undefined bindings, which throw inside whatever
// try/catch a caller already wraps its Firestore calls in.
export async function importFirebaseModule(name) {
  try {
    return await import(`${FIREBASE_BASE}/${name}`);
  } catch (err) {
    return null;
  }
}

const appMod = await importFirebaseModule('firebase-app.js');
const authMod = await importFirebaseModule('firebase-auth.js');
const firestoreMod = await importFirebaseModule('firebase-firestore.js');

// null means "no Firebase this page load" (SDK unreachable). Every importer
// already treats a Firestore/Auth call failing as "stay on the local copy".
export let auth = null;
export let db = null;

if (appMod && authMod && firestoreMod) {
  const { initializeApp } = appMod;
  const { getAuth, connectAuthEmulator } = authMod;
  const {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    connectFirestoreEmulator,
  } = firestoreMod;

  const firebaseConfig = {
    apiKey: 'AIzaSyD4amHpNmUicOLngTlbW9gu0oU4FeO4dxc',
    authDomain: 'mypypath.firebaseapp.com',
    projectId: 'mypypath',
    storageBucket: 'mypypath.firebasestorage.app',
    messagingSenderId: '600070287432',
    appId: '1:600070287432:web:02568d63a8253ccb1ea87d',
  };

  const app = initializeApp(firebaseConfig);

  auth = getAuth(app);

/* Offline persistence: a signed-in learner who loses connectivity keeps
   working and syncs on reconnect.

   THE tabManager IS NOT OPTIONAL, whatever the type signature suggests.
   persistentLocalCache() with no options does not mean "persistence, defaults
   fine". Read the shipped SDK -- 11.1.0, firebase-firestore.js:

       constructor(e){ ... (e?.tabManager) ? ... : (i = persistentSingleTabManager(void 0)) ... }

   So the no-argument form is single-tab persistence, and single-tab means
   exactly what it says: one tab holds an exclusive lock on IndexedDB and every
   other tab fails to take it, logs

       failed-precondition: Failed to obtain exclusive access to the
       persistence layer

   and SILENTLY FALLS BACK TO A MEMORY-ONLY CACHE. Not a smaller cache -- an
   empty one, for the life of that tab.

   That empty cache is the precondition profile.js exists to survive: a merge
   write landing in a cache that has never seen the document synthesizes a
   users/{uid} view with no `role` on it, and a genuine teacher gets told they
   are a student. The warning was in the console on every page for weeks and
   was read as noise. It was the bug.

   persistentMultipleTabManager() shares one IndexedDB-backed cache across
   every tab of the origin, so opening a second tab no longer costs the first
   one its persistence. It takes no arguments in this SDK version. */
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  // Local development talks to the emulators, never to the live project, so a
  // test sign-up never creates a real user or writes real documents. Ports match
  // firebase.json.
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  if (LOCAL_HOSTS.includes(location.hostname)) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8081);
    console.info('[pypath] Firebase emulators connected (auth 9099, firestore 8081)');
  }
}
