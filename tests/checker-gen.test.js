import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/checker-gen.js', 'utf8')).call(window);
});

const G = () => window.PyPathGen;

describe('the seeded generator', () => {
  it('is reproducible for one seed', () => {
    const spec = [{ type: 'int', min: 0, max: 100 }, { type: 'int', min: 0, max: 100 }];
    expect(G().draw(spec, 5, 7)).toEqual(G().draw(spec, 5, 7));
  });

  /* The seed moves with the attempt. A fixed seed would be a fixed hidden set
     again: discovered once, written down, and shared with the class. */
  it('draws a different set for a different attempt', () => {
    const spec = [{ type: 'int', min: 0, max: 1000 }];
    expect(G().draw(spec, 20, 1)).not.toEqual(G().draw(spec, 20, 2));
  });

  it('draws the number of cases asked for', () => {
    expect(G().draw([{ type: 'int', min: 0, max: 9 }], 40, 1).length).toBe(40);
  });

  it('caps the run count, because each run is a real interpreter call', () => {
    expect(G().draw([{ type: 'int' }], 10000, 1).length).toBe(G().MAX_RUNS);
  });
});

describe('the argument types', () => {
  const only = (spec, seed) => G().draw([spec], 60, seed || 1).map((row) => row[0]);

  it('draws integers inside the range, inclusive at both ends', () => {
    const values = only({ type: 'int', min: -3, max: 3 });
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-3);
    expect(Math.max(...values)).toBeLessThanOrEqual(3);
    expect(values.every(Number.isInteger)).toBe(true);
  });

  /* Zero, one, the bounds, and an empty collection are where beginner code
     breaks, and a uniform draw over a wide range almost never lands on them. */
  it('always includes the edges of the range', () => {
    const values = only({ type: 'int', min: 0, max: 500 });
    expect(values).toContain(0);
    expect(values).toContain(500);
  });

  it('draws floats and rounds them to something a student could type', () => {
    const values = only({ type: 'float', min: 0, max: 10 });
    expect(values.every((v) => typeof v === 'number')).toBe(true);
    expect(values.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9)).toBe(true);
  });

  it('draws booleans, and both of them', () => {
    const values = only({ type: 'bool' });
    expect(new Set(values)).toEqual(new Set([true, false]));
  });

  it('draws strings from the given alphabet, within the length bounds', () => {
    const values = only({ type: 'str', minLength: 1, maxLength: 5, alphabet: 'ab' });
    expect(values.every((v) => /^[ab]{1,5}$/.test(v))).toBe(true);
  });

  it('includes the empty string when the minimum allows it', () => {
    expect(only({ type: 'str', minLength: 0, maxLength: 4 })).toContain('');
  });

  it('draws lists of the given item type', () => {
    const values = only({ type: 'list', of: { type: 'int', min: 1, max: 5 }, maxLength: 4 });
    expect(values.every((v) => Array.isArray(v))).toBe(true);
    expect(values.every((v) => v.every((n) => n >= 1 && n <= 5))).toBe(true);
  });

  it('includes the empty list, where most beginner code breaks', () => {
    const values = only({ type: 'list', of: { type: 'int' }, maxLength: 5 });
    expect(values.some((v) => v.length === 0)).toBe(true);
  });

  it('draws from a literal choice list and from nothing else', () => {
    const values = only({ type: 'choice', values: ['red', 'green', 'blue'] });
    expect(values.every((v) => ['red', 'green', 'blue'].includes(v))).toBe(true);
    expect(new Set(values).size).toBe(3);
  });

  it('reads an unknown type as an integer rather than throwing', () => {
    expect(only({ type: 'complex' }).every(Number.isInteger)).toBe(true);
  });
});

describe('rendering a drawn case as Python', () => {
  it('writes literals Python can read back', () => {
    expect(G().toPython(3)).toBe('3');
    expect(G().toPython(-2.5)).toBe('-2.5');
    expect(G().toPython(true)).toBe('True');
    expect(G().toPython(false)).toBe('False');
    expect(G().toPython(null)).toBe('None');
    expect(G().toPython([1, 2])).toBe('[1, 2]');
    expect(G().toPython([])).toBe('[]');
  });

  /* The drawn value is pasted into a source string that Python parses. A quote
     or a backslash that escapes its literal is an injection into the harness,
     not a wrong answer. */
  it('escapes strings so a drawn value cannot break out of its literal', () => {
    expect(G().toPython("it's")).toBe('"it\'s"');
    expect(G().toPython('say "hi"')).toBe('"say \\"hi\\""');
    expect(G().toPython('a\\b')).toBe('"a\\\\b"');
    expect(G().toPython('line\nbreak')).toBe('"line\\nbreak"');
  });

  it('builds a call from an entry name and a drawn row', () => {
    expect(G().callFor('area', [4, 3])).toBe('area(4, 3)');
    expect(G().callFor('shout', ['hi'])).toBe('shout("hi")');
    expect(G().callFor('f', [])).toBe('f()');
  });

  it('refuses an entry name that is not a plain identifier', () => {
    // The entry comes from an authored file, but it is still concatenated into
    // source, and a name is the one place that is cheap to make impossible.
    expect(G().callFor('area(); import os; f', [1])).toBe(null);
    expect(G().callFor('', [1])).toBe(null);
  });
});
