import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/concept-check.js', 'utf8')).call(window);
});

const C = () => window.PyPathConcepts;

const SPEC = {
  expect_any: [
    ['read', 'readable', 'reads like', 'english'],
    ['simple', 'simpler', 'easy', 'less code'],
    ['library', 'libraries', 'module'],
  ],
  min_concepts: 1,
  hint: 'Think about what you noticed writing your first program.',
};

describe('matching a phrase', () => {
  it('matches on word boundaries, not inside other words', () => {
    expect(C().mentions('it is easy to read', 'read')).toBe(true);
    // "already" contains "read" and is not a hit.
    expect(C().mentions('I already knew that', 'read')).toBe(false);
  });

  it('ignores case', () => {
    expect(C().mentions('Very READABLE code', 'readable')).toBe(true);
  });

  it('matches a multi-word phrase', () => {
    expect(C().mentions('it reads like english', 'reads like')).toBe(true);
  });

  /* An author's phrase is data. "len()" would otherwise be a regex with an
     empty group in it, and a stray bracket would throw on a lesson page. */
  it('treats an author phrase with regex characters as literal text', () => {
    expect(C().mentions('I used len() to count', 'len()')).toBe(true);
    expect(() => C().mentions('anything', 'a(b')).not.toThrow();
    expect(C().mentions('anything at all', '.*')).toBe(false);
  });
});

describe('coverage', () => {
  it('passes an answer that hits one group', () => {
    const out = C().assess('Python is easy to pick up compared to Java.', SPEC);
    expect(out.ok).toBe(true);
    expect(out.hits).toBe(1);
  });

  it('counts each group once, however many synonyms appear', () => {
    const out = C().assess('It is simple and easy and less code.', SPEC);
    expect(out.hits).toBe(1);
  });

  it('honours a higher min_concepts', () => {
    const strict = { ...SPEC, min_concepts: 2 };
    expect(C().assess('It is easy.', strict).ok).toBe(false);
    expect(C().assess('It is easy and it reads like english.', strict).ok).toBe(true);
  });

  it('cannot ask for more groups than exist', () => {
    const out = C().assess('It is easy.', { ...SPEC, min_concepts: 99 });
    expect(out.needed).toBe(3);
  });

  /* The known miss, asserted rather than hidden. A thoughtful answer in words
     the author did not list fails, which is exactly why this gates nothing. */
  it('misses a good answer written in unexpected words', () => {
    const out = C().assess(
      'The syntax gets out of my way so I can think about the problem.', SPEC);
    expect(out.ok).toBe(false);
  });
});

describe('an unauthored reflection', () => {
  /* Almost every lesson is in this state and will be for a while. Not-checked
     must not read as passing, or a caller starts reporting every unauthored
     reflection in the course as a miss. */
  it('reports not-checked rather than a pass', () => {
    for (const spec of [null, {}, { expect_any: [] }]) {
      const out = C().assess('anything', spec);
      expect(out.checked).toBe(false);
      expect(out.ok).toBe(true);
      expect(out.hint).toBe('');
    }
  });
});

describe('what it says', () => {
  it('hands back the author\'s hint and never writes its own', () => {
    expect(C().assess('nothing relevant here at all', SPEC).hint).toBe(SPEC.hint);
  });

  it('says nothing when the answer lands', () => {
    expect(C().assess('It is easy to read.', SPEC).hint).toBe('');
  });

  it('has no hint to give when the author wrote none', () => {
    const out = C().assess('off topic entirely', { expect_any: [['x']] });
    expect(out.ok).toBe(false);
    expect(out.hint).toBe('');
  });
});
