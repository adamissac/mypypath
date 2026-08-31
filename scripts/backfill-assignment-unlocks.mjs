/* PyPath — arm the unit lock on classes that predate it.
 *
 * WHY THIS EXISTS.
 *
 * firestore.rules enforces a by-hand class's unit lock by reading
 * assignmentUnlocks off the class document. A rule can get() a document and
 * cannot enumerate a collection, so an unlock derived from /assignments is one
 * the server can never see -- hence the stored field.
 *
 * 47533a6 shipped that field being written on every assignment write and on
 * every dashboard load, and permitted rather than refused for a class that has
 * neither: a student refused a write for a unit their own page said was open is
 * a worse failure than a lock that arms a little late. The cost of that choice
 * is that every class created before it shipped is running unenforced -- the
 * old soft lock exactly -- until its teacher happens to open the dashboard.
 * For a teacher who set "By hand" last term and moved on, that could be never.
 *
 * This closes it directly rather than waiting on a click.
 *
 * WHAT IT DOES NOT DO. It skips classes in "In order" and "Open" mode. Neither
 * consults the unlock list: the rule short-circuits on the mode before it ever
 * looks, so a value there would change nothing. A teacher who later switches
 * such a class to "By hand" is covered by setLockPolicy(), which writes the
 * list as part of the same save.
 *
 * SAFETY. Dry run unless --apply is passed. Idempotent: a class whose stored
 * list already matches its assignments is left untouched, so a teacher's own
 * dashboard visit is never overwritten with the same value or a worse one.
 *
 * USAGE
 *   node scripts/backfill-assignment-unlocks.mjs              # dry run
 *   node scripts/backfill-assignment-unlocks.mjs --apply      # write
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 node scripts/... --apply
 *   PYPATH_PROJECT=other-project node scripts/...          # override .firebaserc
 *
 * Credentials come from the Firebase CLI you are already logged in to, so
 * there is no service-account key to create or keep. That uses an internal
 * firebase-tools module; if a future version moves it, this says so plainly
 * rather than failing halfway through a write.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

function projectId() {
  // Overridable so the emulator suite can point it at its own throwaway
  // project rather than at the real one named in .firebaserc.
  if (process.env.PYPATH_PROJECT) return process.env.PYPATH_PROJECT;
  const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
  const id = rc.projects && rc.projects.default;
  if (!id) throw new Error('No default project in .firebaserc');
  return id;
}

/* The real rule, loaded rather than reimplemented.
 *
 * classroom-policy.js is the one place that decides which units an assignment
 * holds open, and it is the copy class-policy.js and the dashboard already run.
 * A second implementation here would be a second answer, and the whole reason
 * the field is stored is so that there is only ever one. It is a browser IIFE
 * that assigns to `window`, so `window` is passed in as a parameter. */
function loadPolicy() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/classroom-policy.js'), 'utf8');
  const shim = {};
  new Function('window', src)(shim);
  if (!shim.PyPathPolicy || typeof shim.PyPathPolicy.assignmentUnlocks !== 'function') {
    throw new Error('classroom-policy.js did not export assignmentUnlocks');
  }
  return shim.PyPathPolicy;
}

async function accessToken() {
  if (EMULATOR) return 'owner';
  try {
    const auth = await import(
      path.join(ROOT, 'node_modules/firebase-tools/lib/auth.js')
    );
    const scopes = await import(
      path.join(ROOT, 'node_modules/firebase-tools/lib/scopes.js')
    );
    const get = auth.getAccessToken || (auth.default && auth.default.getAccessToken);
    if (typeof get !== 'function') throw new Error('no getAccessToken');

    // The refresh token the CLI already holds, exchanged for an access token
    // by the CLI's own code. Nothing new is stored and nothing is printed.
    const store = JSON.parse(fs.readFileSync(
      path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'
    ));
    const refresh = store.tokens && store.tokens.refresh_token;
    if (!refresh) throw new Error('no refresh token in the CLI credential store');

    const S = scopes.default || scopes;
    const token = await get(refresh, [S.CLOUD_PLATFORM, S.FIREBASE_PLATFORM]);
    const value = typeof token === 'string' ? token : token && token.access_token;
    if (!value) throw new Error('no access_token returned');
    return value;
  } catch (e) {
    throw new Error(
      'Could not borrow a token from the Firebase CLI (' + e.message + ').\n' +
      'Run `npx firebase login` first. If this keeps failing, firebase-tools has '
      + 'probably moved lib/auth.js and this script needs updating.'
    );
  }
}

function baseUrl(project) {
  const host = EMULATOR ? `http://${EMULATOR}` : 'https://firestore.googleapis.com';
  return `${host}/v1/projects/${project}/databases/(default)/documents`;
}

async function call(url, token, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`${init && init.method || 'GET'} ${url} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/* Firestore's REST value encoding, in both directions. Only the shapes these
   two collections actually use. */
function decode(value) {
  if (value == null) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decode(v);
  return out;
}

function encodeUnits(units) {
  return { arrayValue: { values: units.map((n) => ({ integerValue: String(n) })) } };
}

async function listAll(url, token) {
  const docs = [];
  let pageToken = '';
  for (;;) {
    const page = await call(url + (pageToken ? `&pageToken=${pageToken}` : ''), token);
    for (const d of page.documents || []) {
      docs.push({ name: d.name, id: d.name.split('/').pop(), data: decodeFields(d.fields) });
    }
    if (!page.nextPageToken) return docs;
    pageToken = page.nextPageToken;
  }
}

function sameUnits(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((n, i) => Number(n) === Number(b[i]));
}

async function main() {
  const project = projectId();
  const POLICY = loadPolicy();
  const token = await accessToken();
  const base = baseUrl(project);

  console.log(`project: ${project}${EMULATOR ? '  (emulator ' + EMULATOR + ')' : ''}`);
  console.log(APPLY ? 'mode: APPLY (will write)\n' : 'mode: dry run (pass --apply to write)\n');

  const classes = await listAll(`${base}/classes?pageSize=300`, token);
  console.log(`${classes.length} class document(s)\n`);

  const counts = { armed: 0, corrected: 0, alreadyRight: 0, skipped: 0 };

  for (const klass of classes) {
    const label = `${klass.data.name || '(unnamed)'} [${klass.data.joinCode || klass.id}]`;
    const mode = POLICY.normalizeMode(klass.data.lockMode);

    // A mode that never consults the list. The rule short-circuits before it,
    // so writing one would arm nothing and change nothing.
    if (mode !== 'manual') {
      counts.skipped += 1;
      console.log(`skip   ${label}: mode "${mode}" does not use an unlock list`);
      continue;
    }

    const assignments = await listAll(
      `${base}/classes/${klass.id}/assignments?pageSize=300`, token
    );
    const want = POLICY.assignmentUnlocks(assignments.map((a) => a.data), Date.now());
    const have = klass.data.assignmentUnlocks;

    if (have === undefined) {
      counts.armed += 1;
      console.log(`ARM    ${label}: no field -> [${want.join(', ')}]  (${assignments.length} assignment(s))`);
    } else if (!sameUnits(have, want)) {
      counts.corrected += 1;
      console.log(`FIX    ${label}: [${have.join(', ')}] -> [${want.join(', ')}]`);
    } else {
      counts.alreadyRight += 1;
      console.log(`ok     ${label}: already [${have.join(', ')}]`);
      continue;
    }

    if (!APPLY) continue;

    // updateMask so nothing else on the class document is touched. A blind
    // PATCH would drop every field not sent, which on a class document means
    // its name, its join code and the teachers who own it.
    await call(
      `${base}/classes/${klass.id}?updateMask.fieldPaths=assignmentUnlocks`,
      token,
      { method: 'PATCH', body: JSON.stringify({ fields: { assignmentUnlocks: encodeUnits(want) } }) }
    );
  }

  console.log('');
  console.log(`armed ${counts.armed}, corrected ${counts.corrected}, `
    + `already right ${counts.alreadyRight}, skipped ${counts.skipped}`);
  if (!APPLY && (counts.armed || counts.corrected)) {
    console.log('\nNothing was written. Re-run with --apply.');
  }
}

main().catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});
