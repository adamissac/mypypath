/* The three student states nobody had walked end to end.
 *
 * A student in NO CLASS, a student whose class was ARCHIVED, and a student
 * MID-TRANSFER (left one class, not yet in another). Each is a real state a
 * real learner reaches, and each is a state where the honest failure -- "we
 * could not reach the database" -- and the dishonest one -- "you have nothing"
 * -- look identical if nobody checked.
 *
 * Runs against the emulators with a seeded class.
 *
 *     npm run emulators
 *     STUDENTS=4 node scripts/seed-classroom.mjs
 *     node scripts/verify-student-paths.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.SP_PORT || 8069);
const FS = 'http://127.0.0.1:8081';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'mypypath';
const PASSWORD = 'pypath123';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(file)).isDirectory()) throw new Error('dir');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

async function owner(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  });
  if (!res.ok && res.status !== 404) throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  return res.status === 404 ? null : res.json();
}

const docs = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;

async function firstClass() {
  const page = await owner(`${docs}/classes?pageSize=50`);
  const found = (page.documents || []).map((d) => ({
    id: d.name.split('/').pop(),
    archived: d.fields?.archived?.booleanValue,
  }));
  for (const c of found) {
    const roster = await owner(`${docs}/classes/${c.id}/roster?pageSize=50`);
    if ((roster?.documents || []).length >= 1) return { ...c, roster: roster.documents };
  }
  throw new Error('no seeded class with a roster; run: STUDENTS=4 node scripts/seed-classroom.mjs');
}

async function signIn(page, email) {
  await page.goto(`http://127.0.0.1:${PORT}/login.html`);
  await page.waitForLoadState('networkidle');
  await page.fill('#login-email', email);
  await page.fill('#login-password', PASSWORD);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('[data-account-avatar]:not([hidden])', { timeout: 30000 });
}

/* What /progress.html shows: the work panel, its empty states, and -- the one
   that matters -- whether the ERROR state is up. "Nothing outstanding" and "we
   could not load your work" must never be confusable. */
const STATE = `(() => {
  const on = (sel) => { const el = document.querySelector(sel); return !!el && !el.hidden; };
  const txt = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim().slice(0, 60) : null; };
  return {
    section: on('[data-sw]'),
    error: on('[data-sw-error]'),
    nothingOutstanding: on('[data-sw-empty]'),
    noneSet: on('[data-sw-none]'),
    closed: on('[data-sw-closed]'),
    listItems: document.querySelectorAll('[data-sw-list] > *').length,
    heading: txt('#sw-h'),
  };
})()`;

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const fails = [];
  const klass = await firstClass();

  /* The uid of the account we actually sign in as, looked up rather than
     assumed to be the first roster row. The first version of this script
     deleted roster[0] and signed in as student01, which are different people
     -- so it reported a bug that was in the test. */
  const signedInUid = await (async () => {
    const res = await fetch(
      `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'student01@pypath.test', password: PASSWORD, returnSecureToken: true,
        }),
      }
    );
    return (await res.json()).localId;
  })();
  const studentUid = signedInUid;
  console.log(`signed-in student uid: ${studentUid}`);

  async function look(email, label) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await signIn(p, email);
    const prog = await ctx.newPage();
    await prog.goto(`http://127.0.0.1:${PORT}/progress.html`, { waitUntil: 'domcontentloaded' });
    await prog.waitForTimeout(9000);
    const state = await prog.evaluate(STATE);
    const errors = [];
    prog.on('pageerror', (e) => errors.push(String(e)));
    console.log(`  ${label.padEnd(28)} ${JSON.stringify(state)}`);
    await ctx.close();
    return state;
  }

  // 1. Enrolled and working. The control: everything else is compared to this.
  console.log('\nenrolled student');
  const enrolled = await look('student01@pypath.test', 'work set by their class');
  if (!enrolled.section) fails.push('an enrolled student sees no work panel at all');
  if (enrolled.error) fails.push('an enrolled student sees the error state');

  // 2. A student in no class. Not a failure and gets no empty state -- a
  //    learner working alone has nothing owed to anyone.
  console.log('\nstudent in no class');
  const email = `solo-${Date.now()}@pypath.test`;
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const solo = await look(email, 'no class');
  if (solo.section) fails.push('a student in no class is shown an empty work panel');
  if (solo.error) fails.push('a student in no class is shown an error');

  // 3. Their class is archived. The teacher has closed the term. The student
  //    must not be told the database is broken, and must not silently lose
  //    what they did.
  console.log('\nstudent whose class was archived');
  await owner(`${docs}/classes/${klass.id}?updateMask.fieldPaths=archived`, {
    method: 'PATCH', body: JSON.stringify({ fields: { archived: { booleanValue: true } } }),
  });
  const archived = await look('student01@pypath.test', 'class archived');
  if (archived.error) fails.push('an archived class reports an error to the student');
  if (!archived.closed) fails.push('an archived class does not say the term is over');
  if (archived.nothingOutstanding) fails.push('an archived class still claims nothing is outstanding');
  await owner(`${docs}/classes/${klass.id}?updateMask.fieldPaths=archived`, {
    method: 'PATCH', body: JSON.stringify({ fields: { archived: { booleanValue: false } } }),
  });

  // 4. Mid-transfer: the roster row is gone but users/{uid}.classId still
  //    points at the class. This is the window between leaving and joining,
  //    and it is the state most likely to produce a confident wrong answer.
  console.log('\nstudent mid-transfer');
  const seat = await owner(`${docs}/classes/${klass.id}/roster/${studentUid}`);
  await owner(`${docs}/classes/${klass.id}/roster/${studentUid}`, { method: 'DELETE' });
  const gone = await owner(`${docs}/classes/${klass.id}/roster/${studentUid}`);
  console.log(`  seat deleted? ${gone === null ? 'yes' : 'NO -- still present'}`);
  const mid = await look('student01@pypath.test', 'left, not yet rejoined');
  const after = await owner(`${docs}/classes/${klass.id}/roster/${studentUid}`);
  console.log(`  seat after page load? ${after === null ? 'still gone' : 'RE-CREATED by the page'}`);
  if (mid.error) fails.push('mid-transfer reports a database error');
  if (mid.listItems > 0) fails.push('mid-transfer still lists work from the class they left');
  if (seat) {
    await owner(`${docs}/classes/${klass.id}/roster/${studentUid}`, {
      method: 'PATCH', body: JSON.stringify({ fields: seat.fields }),
    });
  }

  await browser.close();
  server.close();

  console.log('');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error('  -', f);
    process.exitCode = 1;
  } else {
    console.log('PASS: all four student states render honestly');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
