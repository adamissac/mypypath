import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Two co-teachers editing one class at the same time.
 *
 * The audit asked whether the current writes are field-scoped or
 * document-scoped, because last-write-wins on a whole document silently
 * discards the other person's change. Audited, and the answer is better than
 * feared in one place and worse in another.
 */

const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
const code = store.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('every edit to the class document is field-scoped', () => {
  it('uses updateDoc, never a whole-document setDoc, after creation', () => {
    /* updateDoc writes only the named fields, so a teacher renaming the class
       and a co-teacher archiving it do not overwrite each other. The single
       setDoc against a class document is createClass, which is creating it. */
    /* createClass is excluded by slicing it out first -- it is CREATING the
       document, so a whole-document write is the only thing it could do. What
       matters is that nothing after it takes the same liberty. */
    const afterCreate = code.slice(code.indexOf('export async function readClass'));
    const writes = afterCreate.match(/(setDoc|updateDoc)\(doc\(db, `classes\/\$\{classId\}`\)/g) || [];
    expect(writes.length).toBeGreaterThan(4);
    for (const w of writes) expect(w).toContain('updateDoc');
  });

  it('the one whole-document write is the creation', () => {
    const create = store.slice(store.indexOf('export async function createClass'));
    expect(create.slice(0, 1500)).toContain('setDoc(doc(db, `classes/${classId}`)');
  });

  it('co-teacher changes are atomic set operations, not array rewrites', () => {
    // Adding and removing a co-teacher already used arrayUnion/arrayRemove,
    // so two people inviting different colleagues at once both take effect.
    expect(code).toContain('teacherUids: arrayUnion(uid)');
    expect(code).toContain('teacherUids: arrayRemove(uid)');
  });
});

describe('unlock widening is atomic, which it was not', () => {
  const fn = store.slice(
    store.indexOf('async function widenUnlocks'),
    store.indexOf('export async function refreshAssignmentUnlocks')
  );

  /* THE BUG. widenUnlocks read the stored list, merged in the new units, and
     wrote the whole array back. Two co-teachers creating assignments at the
     same moment each read the same base and each wrote a different merged
     list; the second won, and the first teacher's units were silently gone.
     
     That is exactly the failure the function exists to prevent. firestore.rules
     reads assignmentUnlocks off the class document to decide whether a student
     may record work in a unit, so the losing teacher's class met an assignment
     that was set for them and locked against them -- a student doing the work
     and having it refused server-side. */

  it('uses arrayUnion for the common path', () => {
    expect(fn).toContain('assignmentUnlocks: arrayUnion(...want)');
  });

  it('skips the write entirely when the units are already open', () => {
    expect(fn).toContain('if (want.every((n) => base.includes(n))) return;');
  });

  it('still derives the full list for a class that has no stored field', () => {
    /* arrayUnion on an ABSENT field creates an array holding only the new
       units, which would drop the unlocks every existing assignment already
       relies on. So the first write for a class goes through the read, and
       every write after it is atomic. */
    expect(fn).toContain('storedOrDerivedUnlocks(classId, klass)');
    expect(fn).toContain('Array.from(new Set(base.concat(want)))');
  });

  it('narrowing stays a whole-list write, deliberately', () => {
    /* refreshAssignmentUnlocks removes units whose assignments are gone. That
       genuinely needs the full picture and cannot be expressed as a union; it
       is also idempotent and self-correcting, so a lost race there costs one
       stale open unit until the next dashboard load rather than a locked-out
       student. */
    const refresh = store.slice(store.indexOf('export async function refreshAssignmentUnlocks'));
    expect(refresh.slice(0, 900)).toContain('assignmentUnlocks: next');
  });
});
