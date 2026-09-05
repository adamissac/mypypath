import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* One module reads users/{uid}, and the others ask it.
 *
 * WHY THIS IS A TEST AND NOT A CONVENTION. Five modules independently grew a
 * read of users/{uid} to decide whether the person in front of them is a
 * teacher: classroom-page.js, classroom-dashboard.js, account-class.js,
 * classroom-store.js's classesFor, and role-nav.js. None of them was wrong on
 * its own. Together they were five reads of one document off one pypath:auth
 * event, and -- the part that actually hurt -- five chances to get five
 * different answers, because a read racing an unacknowledged merge write can
 * see a document with no role on it. A genuine teacher was shown "This page is
 * for teacher accounts". See the header of assets/js/profile.js.
 *
 * The fix consolidated all five onto profile.js's shared, once-per-page,
 * server-confirmed read. Nothing stops a sixth from appearing: adding
 * `const snap = await getDoc(doc(db, \`users/${uid}\`))` to a new page is the
 * obvious thing to write and it will work perfectly in every warm-cache test
 * anyone runs by hand. It fails cold, in front of a class, which is where this
 * bug has already been found twice.
 *
 * So the rule is mechanical: outside profile.js, a module may write
 * users/{uid}, and may read the subcollections beneath it, but may not READ
 * the account document itself. Anything that needs a field off it calls
 * loadProfile().
 */

const DIR = 'assets/js';
const READER = 'profile.js';

/* Reads, not writes. setDoc/updateDoc against users/{uid} are ordinary and
   several modules legitimately do them (class-join.js sets the role,
   classroom-store.js maintains the class index, sync.js merges identity,
   activity.js mirrors totals). Only a READ can return the wrong answer. */
const READ_CALLS = ['getDoc', 'getDocFromServer', 'getDocFromCache', 'onSnapshot'];

/* Documented exceptions. Empty on purpose: an exception belongs here with a
   reason attached, so that granting one is a diff someone reviews rather than
   a silent drift back to five readers. */
const ALLOWED = {};

function sources() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.js') && f !== READER)
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(DIR, f), 'utf8') }));
}

/* Strips comments before matching. profile.js's own story is quoted in several
   files by way of explanation, and a lint that fires on the explanation is a
   lint that teaches people to stop writing them. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/* A read of the account DOCUMENT, not of anything under it.
 *
 *     doc(db, `users/${uid}`)              <- the account record. Ours.
 *     doc(db, `users/${uid}/state/x`)      <- a subcollection. Not ours.
 *
 * The trailing (?!/) is doing the whole job of that distinction, so it is
 * written out rather than left as a clever regex nobody dares touch. */
const ACCOUNT_DOC = /`users\/\$\{[^}]+\}`/;

function offendingLines(text) {
  const out = [];
  const lines = code(text).split('\n');
  lines.forEach((line, i) => {
    if (!ACCOUNT_DOC.test(line)) return;
    // The read call and the path are usually on the same line, but
    // `getDoc(\n  doc(db, ...)\n)` is common in this codebase, so look at a
    // small window around the path rather than only at its own line.
    const window = lines.slice(Math.max(0, i - 2), i + 2).join('\n');
    const call = READ_CALLS.find((c) => new RegExp(`\\b${c}\\s*\\(`).test(window));
    if (call) out.push({ line: i + 1, call, text: line.trim() });
  });
  return out;
}

describe('only profile.js reads the account document', () => {
  it('finds no direct read of users/{uid} outside profile.js', () => {
    const offences = [];
    for (const { file, text } of sources()) {
      for (const hit of offendingLines(text)) {
        if (ALLOWED[file]) continue;
        offences.push(`${DIR}/${file}:${hit.line}  ${hit.call}  ${hit.text}`);
      }
    }
    expect(
      offences,
      'A direct read of users/{uid} outside profile.js.\n\n' +
        'Call loadProfile(uid) instead: it is one shared, server-confirmed read\n' +
        'per page, and it will not answer from a snapshot carrying our own\n' +
        'unacknowledged merge write -- which is how a real teacher got told they\n' +
        'were a student. See the header of assets/js/profile.js.\n\n' +
        'If this really is an exception, add it to ALLOWED with the reason.\n'
    ).toEqual([]);
  });

  it('still catches the pattern it is looking for', () => {
    // A guard nobody has seen fail is a guard nobody knows is wired up.
    const planted = 'const snap = await getDoc(doc(db, `users/${uid}`));';
    expect(offendingLines(planted)).toHaveLength(1);
    expect(offendingLines(planted)[0].call).toBe('getDoc');
  });

  it('does not fire on a write, or on a subcollection', () => {
    expect(offendingLines('await setDoc(doc(db, `users/${uid}`), x, { merge: true });')).toEqual([]);
    expect(offendingLines('await getDoc(doc(db, `users/${uid}/state/progress`));')).toEqual([]);
  });

  it('does not fire on a comment that merely mentions the path', () => {
    expect(offendingLines('// getDoc(doc(db, `users/${uid}`)) is what we stopped doing')).toEqual([]);
  });

  it('the five modules that caused this all call loadProfile', () => {
    // Directly, or through class-join.js's readProfile, which is a one-line
    // re-export of it. Named individually rather than scanned for, because the
    // point is these five specifically.
    const viaProfile = ['role-nav.js', 'classroom-store.js'];
    const viaReadProfile = ['classroom-page.js', 'classroom-dashboard.js', 'account-class.js'];

    for (const f of viaProfile) {
      const text = fs.readFileSync(path.join(DIR, f), 'utf8');
      expect(text, `${f} should import loadProfile`).toContain('loadProfile');
    }
    for (const f of viaReadProfile) {
      const text = fs.readFileSync(path.join(DIR, f), 'utf8');
      expect(text, `${f} should import readProfile`).toContain('readProfile');
    }
    // And readProfile really is loadProfile, not a second reader wearing its name.
    const joinSrc = code(fs.readFileSync(path.join(DIR, 'class-join.js'), 'utf8'));
    expect(joinSrc).toMatch(/function readProfile\(uid\)\s*\{\s*return loadProfile\(uid\);\s*\}/);
  });
});
