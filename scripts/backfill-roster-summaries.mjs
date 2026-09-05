/* PyPath — write a roster summary for every student who predates the feature.
 *
 * WHY THIS EXISTS.
 *
 * The teacher dashboard now reads one summary document per student instead of
 * replaying up to 500 events, which takes a 50-student class from ~25,000
 * document reads per open to 50. Students maintain their own summary as they
 * work (roster-summary.js), so anyone active since that shipped has one.
 *
 * Everyone else does not, and the dashboard falls back to the old 500-event
 * replay for them. That fallback is correct and it is also the entire cost
 * problem, still being paid, for every student who has not been back yet --
 * over a summer break, that is the whole class. Waiting for each student to
 * open a lesson means the fix arrives for a teacher's dashboard piecemeal
 * across September, which is exactly when they are looking at it.
 *
 * The lesson is the assignmentUnlocks one, written down in that script's
 * header: do not leave correctness waiting on someone happening to open a
 * page. This closes it directly.
 *
 * WHAT IT COSTS. The backfill itself performs the expensive replay -- it reads
 * every student's event log once. That is the point: it pays 500 reads per
 * student ONCE, so the dashboard stops paying them on every open.
 *
 * SAFETY. Dry run unless --apply is passed. Idempotent in the strong sense: it
 * folds the event log with the same applyEvents() the live write path uses, so
 * re-running produces an identical document and it skips writing when the
 * result already matches. A summary that is already RICHER than the event log
 * can support is left alone -- see the note on the 180-day retention window
 * below, which is the case where that actually happens.
 *
 * USAGE
 *   node scripts/backfill-roster-summaries.mjs              # dry run
 *   node scripts/backfill-roster-summaries.mjs --apply      # write
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 node scripts/... --apply
 *   PYPATH_PROJECT=other-project node scripts/...        # override .firebaserc
 *
 * Credentials come from the Firebase CLI you are already logged in to, the
 * same way backfill-assignment-unlocks.mjs borrows them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

function projectId() {
  if (process.env.PYPATH_PROJECT) return process.env.PYPATH_PROJECT;
  const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
  const id = rc.projects && rc.projects.default;
  if (!id) throw new Error('No default project in .firebaserc');
  return id;
}

/* The real fold, loaded rather than reimplemented.
 *
 * Same reasoning as backfill-assignment-unlocks.mjs loading classroom-policy.js:
 * a second implementation would be a second answer, and the whole value of the
 * summary is that it agrees with the event log. roster-summary.js is an ES
 * module whose I/O half imports the Firebase SDK from an absolute site path, so
 * the imports are stripped and only the pure half is evaluated -- the same
 * technique tests/roster-summary.test.js uses, which is also what keeps this
 * loader honest: if the module's shape changes, that test fails too. */
function loadFold() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/roster-summary.js'), 'utf8');
  const body = src
    .replace(/^import \{[^}]*\} from '\/assets\/js\/firebase-config\.js';$/m, '')
    .replace(/^const BASE = [\s\S]*?firebase-firestore\.js`\);$/m, '')
    .replace(/\bexport (async function|function|const)/g, '$1');
  if (/\bimport\b/.test(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) {
    throw new Error('roster-summary.js imports could not be stripped; this script needs updating');
  }
  const fn = new Function(
    'db', 'doc', 'getDoc', 'setDoc', 'serverTimestamp',
    `${body}\nreturn { applyEvents, emptySummary, SUMMARY_SCHEMA };`
  );
  return fn({}, () => ({}), null, null, () => null);
}

async function accessToken() {
  if (EMULATOR) return 'owner';
  try {
    const auth = await import(path.join(ROOT, 'node_modules/firebase-tools/lib/auth.js'));
    const scopes = await import(path.join(ROOT, 'node_modules/firebase-tools/lib/scopes.js'));
    const get = auth.getAccessToken || (auth.default && auth.default.getAccessToken);
    if (typeof get !== 'function') throw new Error('no getAccessToken');
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
  return `${apiRoot(project)}/documents`;
}

/* The database, without the /documents suffix. :commit hangs off the database
   and not off the document collection, and building it by string-surgery on
   baseUrl() is how the first version of this produced a 404. */
function apiRoot(project) {
  const host = EMULATOR ? `http://${EMULATOR}` : 'https://firestore.googleapis.com';
  return `${host}/v1/projects/${project}/databases/(default)`;
}

async function call(url, token, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 404 && (!init || !init.method || init.method === 'GET')) return null;
  if (!res.ok) {
    throw new Error(`${(init && init.method) || 'GET'} ${url} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/* Firestore's REST value encoding, in both directions. */
function decode(value) {
  if (value == null) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return Date.parse(value.timestampValue);
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

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: encodeFields(value) } };
}

function encodeFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    out[k] = encode(v);
  }
  return out;
}

async function listAll(url, token) {
  const docs = [];
  let pageToken = '';
  for (;;) {
    const page = await call(url + (pageToken ? `&pageToken=${pageToken}` : ''), token);
    if (!page) return docs;
    for (const d of page.documents || []) {
      docs.push({ name: d.name, id: d.name.split('/').pop(), data: decodeFields(d.fields) });
    }
    if (!page.nextPageToken) return docs;
    pageToken = page.nextPageToken;
  }
}

/* Compared on the fields the summary actually carries, not on the whole
   document: updatedAt is a server timestamp and differs on every write, so
   including it would make every run report every student as changed. */
function sameSummary(a, b) {
  if (!a || !b) return false;
  const pick = (s) => JSON.stringify({
    lessons: s.lessons || {}, units: s.units || {},
    quizzes: s.quizzes || {}, lastEventAt: s.lastEventAt || 0,
  });
  return pick(a) === pick(b);
}

/* Is the existing summary strictly richer than what the log can rebuild?
 *
 * THE 180-DAY PROBLEM, and the reason this check exists rather than a blind
 * overwrite. Events are deleted after 180 days by rule. A student in a
 * year-long course therefore has a summary that legitimately records work
 * whose events are GONE, and rebuilding from the surviving log would silently
 * delete their first two terms from their teacher's grid.
 *
 * So: never write a summary with fewer lessons or units than the one already
 * there. This is conservative in the right direction -- the cost of skipping
 * is one student still on the slow path, and the cost of getting it wrong is
 * erasing a term of somebody's record. */
function wouldLoseHistory(existing, rebuilt) {
  if (!existing) return false;
  const has = (o) => Object.keys(o || {}).length;
  return has(existing.lessons) > has(rebuilt.lessons)
    || has(existing.units) > has(rebuilt.units)
    || has(existing.quizzes) > has(rebuilt.quizzes);
}

async function main() {
  const project = projectId();
  const FOLD = loadFold();
  const token = await accessToken();
  const base = baseUrl(project);
  const commitUrl = `${apiRoot(project)}/documents:commit`;

  console.log(`project: ${project}${EMULATOR ? '  (emulator ' + EMULATOR + ')' : ''}`);
  console.log(APPLY ? 'mode: APPLY (will write)\n' : 'mode: dry run (pass --apply to write)\n');

  const classes = await listAll(`${base}/classes?pageSize=300`, token);
  console.log(`${classes.length} class document(s)\n`);

  const counts = { written: 0, alreadyRight: 0, protected: 0, empty: 0 };
  let eventsRead = 0;

  for (const klass of classes) {
    const label = `${klass.data.name || '(unnamed)'} [${klass.data.joinCode || klass.id}]`;
    const roster = await listAll(
      `${base}/classes/${klass.id}/roster?pageSize=300`, token
    );
    console.log(`${label}: ${roster.length} student(s)`);

    for (const row of roster) {
      const uid = row.id;
      const who = (row.data.displayName || uid).padEnd(20);

      const events = await listAll(
        `${base}/classes/${klass.id}/roster/${uid}/events?pageSize=300`, token
      );
      eventsRead += events.length;

      const rebuilt = FOLD.applyEvents(
        FOLD.emptySummary(),
        events.map((e) => ({ ...e.data, at: e.data.at }))
      );

      const found = await call(
        `${base}/classes/${klass.id}/roster/${uid}/summary/current`, token
      );
      const existing = found ? decodeFields(found.fields) : null;

      if (!events.length && !existing) {
        counts.empty += 1;
        console.log(`  skip  ${who} no events, no summary`);
        continue;
      }

      if (wouldLoseHistory(existing, rebuilt)) {
        counts.protected += 1;
        console.log(`  KEEP  ${who} existing summary is richer than the surviving log `
          + `(${Object.keys(existing.lessons || {}).length} lessons vs `
          + `${Object.keys(rebuilt.lessons || {}).length}) — retention window, left alone`);
        continue;
      }

      if (sameSummary(existing, rebuilt)) {
        counts.alreadyRight += 1;
        console.log(`  ok    ${who} already current`);
        continue;
      }

      counts.written += 1;
      console.log(`  WRITE ${who} ${events.length} events -> `
        + `${Object.keys(rebuilt.lessons).length} lessons, `
        + `${Object.keys(rebuilt.units).length} units`);

      if (!APPLY) continue;

      await call(
        `${base}/classes/${klass.id}/roster/${uid}/summary/current`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fields: encodeFields({
              schemaVersion: FOLD.SUMMARY_SCHEMA,
              lessons: rebuilt.lessons,
              units: rebuilt.units,
              quizzes: rebuilt.quizzes,
              lastEventAt: rebuilt.lastEventAt,
            }),
          }),
        }
      );
      // updatedAt is a server timestamp the rules pin to request.time, which
      // the REST API cannot send as a sentinel. Written as its own transform so
      // the document the rules see is the one they expect.
      await call(
        commitUrl,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            writes: [{
              transform: {
                document: `projects/${project}/databases/(default)/documents/`
                  + `classes/${klass.id}/roster/${uid}/summary/current`,
                fieldTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
              },
            }],
          }),
        }
      );
    }
  }

  console.log('');
  console.log(`wrote ${counts.written}, already right ${counts.alreadyRight}, `
    + `protected ${counts.protected}, nothing to do ${counts.empty}`);
  console.log(`${eventsRead} event documents read to build them`);
  if (!APPLY && counts.written) {
    console.log('\nNothing was written. Re-run with --apply.');
  }
}

main().catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});
