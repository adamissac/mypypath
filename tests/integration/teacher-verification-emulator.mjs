// Run with scripts/verify-teacher-verification.mjs. Authentication, profile
// reads, verification writes, transactions and rules use real local emulators.
// Only the public school website is a fixture; no school receives test traffic.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, terminate } from 'firebase/firestore';
import { automaticTeacherCheck } from '../../server/automatic-teacher-verification.js';
import { createTeacherHandler } from '../../server/teacher-verification-service.js';

const projectId = process.env.PYPATH_VERIFICATION_TEST_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/, 'This test must use a disposable demo project.');
for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
  assert.match(process.env[key] || '', /^127\.0\.0\.1:\d+$/, `${key} must target a local emulator.`);
}
assert.equal(process.env.PYPATH_FIREBASE_SERVICE_ACCOUNT, undefined, 'Production credentials must not be present.');

const domain = 'integration-fixture.k12.ga.us';
const source = `https://${domain}/`;
const directory = `<article class="staff-card"><h3>Ada Lovelace</h3><span>Teacher</span><a href="mailto:ada@${domain}">Email</a></article>
  <article class="staff-card"><h3>Grace Hopper</h3><span>Instructor</span><a href="mailto:grace@${domain}">Email</a></article>`;
let admin, auth, db, server, base, fetches = 0, pauseDirectory;
let ada, grace, student, unconfirmed, unmatched;
const clients = [];
const requestsPath = uid => `teacherVerificationRequests/${uid}`;

async function account(uid, name, role, emailVerified = true) {
  const email = `${uid}@${domain}`;
  const password = 'Local-emulator-only-123!';
  await auth.createUser({ uid, email, displayName: name, password, emailVerified });
  await db.doc(`users/${uid}`).set({ role, displayName: name });
  const app = initializeApp({ apiKey: 'emulator-only-key', projectId }, `verification-${uid}`);
  const clientAuth = getAuth(app);
  connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const clientDb = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(clientDb, host, Number(port));
  const credential = await signInWithEmailAndPassword(clientAuth, email, password);
  const result = { uid, email, token: await credential.user.getIdToken(), db: clientDb, app };
  clients.push(result);
  return result;
}

async function request(user, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base, { method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
}

before(async () => {
  admin = initializeAdmin({ projectId }, 'automatic-teacher-emulator-test');
  auth = adminAuth(admin);
  db = adminFirestore(admin);
  [ada, grace, student, unconfirmed, unmatched] = await Promise.all([
    account('ada', 'Ada Lovelace', 'teacher'),
    account('grace', 'Grace Hopper', 'teacher'),
    account('student', 'Student Account', 'student'),
    account('unconfirmed', 'Unconfirmed Teacher', 'teacher', false),
    account('unmatched', 'Unlisted Teacher', 'teacher'),
  ]);
  const handler = createTeacherHandler({
    getServices: async () => ({ auth, db }),
    checkTeacher: input => automaticTeacherCheck({ ...input,
      fetchPage: async (url, allowedHosts) => {
        assert.ok(allowedHosts.includes(domain));
        assert.ok(allowedHosts.every(host => host === domain || host === `www.${domain}`));
        assert.ok([source, `${source}staff`].includes(url), `Unexpected directory request: ${url}`);
        fetches += 1;
        if (pauseDirectory) await pauseDirectory;
        return url === source ? '<a href="/staff">Staff directory</a>' : directory;
      },
    }),
  });
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    res.status = status => { res.statusCode = status; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    await handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/teacher-verification`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await Promise.all(clients.map(async client => { await terminate(client.db); await deleteApp(client.app); }));
  if (db) await db.terminate();
  if (admin) await deleteAdmin(admin);
});

test('real Auth credentials, profile and official-directory evidence produce a stored verification', async () => {
  const result = await request(ada, { action: 'ensure' });
  assert.equal(result.status, 200);
  assert.equal(result.body.verified, true, JSON.stringify(result.body));
  assert.equal(result.body.status, 'affiliation-verified-automatically');
  const stored = (await db.doc(requestsPath(ada.uid)).get()).data();
  assert.equal(stored.uid, ada.uid);
  assert.equal(stored.email, ada.email);
  assert.equal(stored.fullName, 'Ada Lovelace');
  assert.equal(stored.schoolAuthorization, false);
  assert.equal(stored.evidence.at(-1).source, `${source}staff`);
  assert.equal(stored.evidence.at(-1).result, 'name-email-teaching-role-matched');
  assert.ok(stored.expiresAt > Date.now());
  assert.equal(fetches, 2);
});

test('status reads and passive page loads reuse a current stored result without crawling again', async () => {
  const count = fetches;
  assert.equal((await request(ada)).body.verified, true);
  assert.equal((await request(ada, { action: 'ensure' })).body.verified, true);
  assert.equal(fetches, count);
});

test('Firestore rules deny clients creating, updating, reading or deleting verification records', async () => {
  const denied = error => error.code === 'permission-denied';
  for (const user of [ada, student]) {
    await assert.rejects(setDoc(doc(user.db, requestsPath('forged')), {
      uid: user.uid, email: user.email, status: 'affiliation-verified-automatically',
      method: 'official-directory-v1', expiresAt: Date.now() + 86400000,
    }), denied);
    await assert.rejects(updateDoc(doc(user.db, requestsPath(ada.uid)), { expiresAt: Date.now() + 365 * 86400000 }), denied);
    await assert.rejects(getDoc(doc(user.db, requestsPath(ada.uid))), denied);
    await assert.rejects(deleteDoc(doc(user.db, requestsPath(ada.uid))), denied);
  }
  assert.equal((await request(ada)).body.verified, true);
});

test('unsigned, student and unconfirmed accounts cannot initiate checks', async () => {
  const count = fetches;
  assert.equal((await request(null, { action: 'ensure' })).status, 401);
  assert.equal((await request({ token: 'forged' }, { action: 'ensure' })).status, 401);
  assert.equal((await request(student, { action: 'ensure' })).status, 403);
  assert.equal((await request(unconfirmed, { action: 'ensure' })).status, 403);
  for (const user of [student, unconfirmed]) assert.equal((await db.doc(requestsPath(user.uid)).get()).exists, false);
  assert.equal(fetches, count);
});

test('the HTTP boundary rejects caller-supplied identity and verification status', async () => {
  for (const forged of [{ uid: grace.uid }, { email: grace.email }, { verified: true }, { status: 'affiliation-verified-automatically' }]) {
    assert.equal((await request(ada, { action: 'ensure', ...forged })).status, 400);
  }
  assert.equal((await db.doc(requestsPath(grace.uid)).get()).exists, false);
});

test('a concurrent duplicate check loses the Firestore transaction reservation', async () => {
  let release;
  pauseDirectory = new Promise(resolve => { release = resolve; });
  const first = request(grace, { action: 'check' });
  try {
    const deadline = Date.now() + 10000;
    while (!(await db.doc(requestsPath(grace.uid)).get()).exists) {
      assert.ok(Date.now() < deadline, 'First check did not reserve its record.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal((await request(grace, { action: 'check' })).status, 429);
  } finally {
    release();
    pauseDirectory = undefined;
  }
  assert.equal((await first).body.verified, true);
});

test('missing directory evidence fails closed and gets a reusable automatic result', async () => {
  const result = await request(unmatched, { action: 'ensure' });
  assert.equal(result.status, 200);
  assert.equal(result.body.verified, false);
  assert.equal(result.body.status, 'not-verified');
  assert.equal(result.body.request.schoolAuthorization, false);
  const count = fetches;
  assert.equal((await request(unmatched, { action: 'ensure' })).body.status, 'not-verified');
  assert.equal(fetches, count);
});

test('expired affiliation rechecks automatically and an account role change removes its badge', async () => {
  await db.doc(requestsPath(ada.uid)).update({ requestedAt: Date.now() - 31 * 86400000, windowStartedAt: Date.now() - 31 * 86400000, expiresAt: Date.now() - 1000 });
  const expired = await request(ada);
  assert.equal(expired.body.verified, false);
  assert.equal(expired.body.status, 'expired');
  const count = fetches;
  assert.equal((await request(ada, { action: 'ensure' })).body.verified, true);
  assert.equal(fetches, count + 2);
  await db.doc(`users/${ada.uid}`).update({ role: 'student' });
  const changed = await request(ada);
  assert.equal(changed.body.verified, false);
  assert.equal(changed.body.status, 'account-ineligible');
});
