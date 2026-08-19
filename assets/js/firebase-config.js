/* PyPath — Firebase initialization. ES module; the SDK requires it.
   This config is public by design. Access control lives in firestore.rules
   and in the Firebase console's Authorized Domains list. */

export const SDK_VERSION = '11.1.0';

const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

const { initializeApp } = await import(`${BASE}/firebase-app.js`);
const { getAuth } = await import(`${BASE}/firebase-auth.js`);
const { initializeFirestore, persistentLocalCache } =
  await import(`${BASE}/firebase-firestore.js`);

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

// Offline persistence: a signed-in learner who loses connectivity keeps
// working and syncs on reconnect.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
