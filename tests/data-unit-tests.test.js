/* Python for Data's own end-of-unit tests.
 *
 * Both courses number their units from 1. Before this, /unit-test.html?unit=3
 * served Foundations questions whatever course the learner was on, and stored
 * the result under the key "3" -- so a Data result would have overwritten a
 * Foundations one. Nothing was serving the wrong questions in practice only
 * because the Data course linked no tests at all.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MCQ = require('../scripts/data-unit-tests-content.cjs');
const FRQ = require('../scripts/data-unit-tests-frq.cjs');
const UNITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

let P;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/storage-keys.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/unit-test-page.js', 'utf8')).call(window);
  P = window.PyPathUnitTestPage;
});

describe('the question files exist and are the right shape', () => {
  for (const n of UNITS) {
    it(`unit ${n} has a pool of at least ten and one free response`, () => {
      const mcq = JSON.parse(fs.readFileSync(`assets/data/unit-tests/data/unit-${n}-mcq.json`, 'utf8'));
      const frq = JSON.parse(fs.readFileSync(`assets/data/unit-tests/data/unit-${n}-frq.json`, 'utf8'));
      // A paper draws ten. A pool of exactly ten makes every retake identical.
      expect(mcq.length).toBeGreaterThanOrEqual(10);
      expect(frq.length).toBeGreaterThanOrEqual(1);
      for (const q of mcq) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        expect(q.explain, q.id).toBeTruthy();
      }
    });
  }

  it('numbers every free response case with arguments JSON can carry', () => {
    // The grader converts `args` straight to Python and calls entry(*args).
    // There is no hook for building a DataFrame in the case, so a problem that
    // needs one has to take plain data and build it in the answer.
    for (const n of UNITS) {
      for (const f of FRQ[n]) {
        expect(f.entry, `u${n}`).toBeTruthy();
        expect(f.cases.length, `u${n}`).toBeGreaterThan(0);
        for (const c of f.cases) {
          expect(Array.isArray(c.args), `${f.id} args`).toBe(true);
          expect(JSON.parse(JSON.stringify(c.args))).toEqual(c.args);
        }
      }
    }
  });
});

describe('the two courses cannot collide', () => {
  it('gives every Data question an id no Foundations question uses', () => {
    const foundations = new Set();
    for (const n of UNITS) {
      for (const file of [`unit-${n}-mcq.json`, `unit-${n}-frq.json`]) {
        for (const q of JSON.parse(fs.readFileSync(`assets/data/unit-tests/${file}`, 'utf8'))) {
          foundations.add(q.id);
        }
      }
    }
    const clashes = [];
    for (const n of UNITS) {
      for (const q of MCQ[`UNIT_${n}`].concat(FRQ[n])) {
        if (foundations.has(q.id)) clashes.push(q.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keys a stored result by course as well as unit', () => {
    expect(P.recordKey('units', 3)).toBe('3');
    expect(P.recordKey('data', 3)).toBe('data-3');
    expect(P.recordKey('units', 3)).not.toBe(P.recordKey('data', 3));
  });

  it('reads both key shapes back, and drops anything else', () => {
    const records = P.normalizeRecords({
      '3': { best: 80 },
      'data-3': { best: 90 },
      'data-99': { best: 70 },
      'nonsense': { best: 70 },
    });
    expect(Object.keys(records).sort()).toEqual(['3', 'data-3']);
    expect(records['3'].best).toBe(80);
    expect(records['data-3'].best).toBe(90);
  });

  it('parses a key back into its course and unit', () => {
    expect(P.parseRecordKey('3')).toEqual({ course: 'units', unit: 3 });
    expect(P.parseRecordKey('data-3')).toEqual({ course: 'data', unit: 3 });
    expect(P.parseRecordKey('data-11')).toBe(null);
    expect(P.parseRecordKey('other-3')).toBe(null);
  });

  it('sends each course to its own question folder', () => {
    expect(P.COURSES.units.dir).toBe('');
    expect(P.COURSES.data.dir).toBe('data/');
  });
});

describe('every Data unit page offers its test', () => {
  for (const n of UNITS) {
    it(`unit ${n} links the test, with the course named`, () => {
      const html = fs.readFileSync(`data/unit-${n}.html`, 'utf8');
      expect(html).toContain(`href="/unit-test.html?unit=${n}&amp;course=data"`);
    });
  }
});
