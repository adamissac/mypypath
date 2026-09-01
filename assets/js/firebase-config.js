/* PyPath — Firebase initialization. ES module; the SDK requires it.
   This config is public by design. Access control lives in firestore.rules
   and in the Firebase console's Authorized Domains list. */

export const SDK_VERSION = '11.1.0';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

const { initializeApp } = await import(`${BASE}/firebase-app.js`);
const { getAuth, connectAuthEmulator } = await import(`${BASE}/firebase-auth.js`);
const {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator,
} = await import(`${BASE}/firebase-firestore.js`);

const firebaseConfig = {
  apiKey: 'AIzaSyD4amHpNmUicOLngTlbW9gu0oU4FeO4dxc',
  authDomain: 'mypypath.firebaseapp.com',
  projectId: 'mypypath',
  storageBucket: 'mypypath.firebasestorage.app',
  messagingSenderId: '600070287432',
  appId: '1:600070287432:web:02568d63a8253ccb1ea87d',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

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
export const db = initializeFirestore(app, {
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
