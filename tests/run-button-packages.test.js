/* The Run button and the checker must agree about what a lesson needs.
 *
 * Pressing Run on any Python for Data lesson from unit 3 on used to return
 * ModuleNotFoundError, because runEditorCode called Pyodide.runCode directly
 * and only the checker ever called loadPackage. These tests pin the detection
 * that closed that gap, and -- more usefully -- assert it against all sixty
 * real starters rather than invented ones. */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let P;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/pyodide-loader.js', 'utf8')).call(window);
  P = window.Pyodide;
});

describe('packagesFor', () => {
  it('finds an aliased import', () => {
    expect(P.packagesFor('import numpy as np')).toEqual(['numpy']);
  });

  it('finds a from-import', () => {
    expect(P.packagesFor('from pandas import DataFrame')).toEqual(['pandas']);
  });

  it('splits a comma list', () => {
    expect(P.packagesFor('import numpy as np, pandas as pd').sort())
      .toEqual(['numpy', 'pandas']);
  });

  it('reads through a submodule', () => {
    expect(P.packagesFor('import numpy.linalg')).toEqual(['numpy']);
  });

  it('ignores the standard library, so Foundations pays nothing', () => {
    expect(P.packagesFor('import csv\nimport json\nfrom collections import Counter'))
      .toEqual([]);
  });

  it('ignores a package it cannot load, rather than rejecting the run', () => {
    // loadPackage rejects on an unknown name, which would take the whole run
    // down with it. An import we cannot satisfy is left to raise its own
    // ModuleNotFoundError in Python, where the message tells the student what
    // happened.
    expect(P.packagesFor('import tensorflow')).toEqual([]);
  });

  it('does not match a name merely containing one', () => {
    expect(P.packagesFor('import numpygrid')).toEqual([]);
  });

  it('survives code that is not valid Python yet', () => {
    expect(() => P.packagesFor('import numpy as np\ndef f(:\n')).not.toThrow();
  });

  it('is empty for empty input', () => {
    expect(P.packagesFor('')).toEqual([]);
    expect(P.packagesFor(null)).toEqual([]);
  });
});

describe('every Python for Data starter resolves to what its spec declares', () => {
  const C = require('../scripts/data-course-content.cjs');
  const units = Array.from({ length: 10 }, (_, i) => i + 1);

  for (const n of units) {
    const unit = C[`unit${n}`];
    if (!unit) continue;
    for (const lesson of unit.lessons) {
      it(`u${n}/${lesson.slug}`, () => {
        const detected = P.packagesFor(lesson.exercise.starter).sort();
        const declared = (lesson.packages || unit.packages || []).slice().sort();

        // The starter may import something the spec does not declare (the
        // checker only needs what the *cases* touch), but it must never
        // import something we cannot load -- that is the bug this closes.
        for (const name of detected) {
          expect(['numpy', 'pandas']).toContain(name);
        }
        // And anything the spec declares that the starter also imports must
        // be detected, or Run and Check disagree.
        for (const name of declared) {
          if (new RegExp(`\\b${name}\\b`).test(lesson.exercise.starter)) {
            expect(detected).toContain(name);
          }
        }
      });
    }
  }
});
