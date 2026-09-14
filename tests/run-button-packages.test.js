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
      // Every editor on the page has a Run button: each graded exercise and
      // each mini practice, not only the first exercise.
      const starters = [
        ...(lesson.exercises || (lesson.exercise ? [lesson.exercise] : [])),
        ...(lesson.practices || []),
      ].map((ed) => ed.starter);

      it(`u${n}/${lesson.slug}`, () => {
        expect(starters.length).toBeGreaterThan(0);
        const declared = (lesson.packages || unit.packages || []).slice().sort();
        for (const starter of starters) {
          const detected = P.packagesFor(starter).sort();

          // The starter may import something the spec does not declare (the
          // checker only needs what the *cases* touch), but it must never
          // import something we cannot load -- that is the bug this closes.
          for (const name of detected) {
            expect(['numpy', 'pandas']).toContain(name);
          }
          // And anything the spec declares that the starter also imports must
          // be detected, or Run and Check disagree.
          for (const name of declared) {
            if (new RegExp(`\\b${name}\\b`).test(starter)) {
              expect(detected).toContain(name);
            }
          }
        }
      });
    }
  }
});

/* An exercise that reads a file gets that file from its check spec. Check has
   always written it into a scratch directory; Run did not, so pressing Run on
   the fourteen file-reading exercises raised FileNotFoundError on a starter
   that was correct. writeFixtures is what Run now uses to put them there. */
describe('writeFixtures', () => {
  const fakePyodide = () => {
    const written = {};
    const dirs = [];
    return {
      written, dirs,
      FS: {
        writeFile: (name, body) => { written[name] = body; },
        mkdirTree: (d) => { dirs.push(d); },
      },
    };
  };

  it('writes every fixture into the working directory', () => {
    const py = fakePyodide();
    const names = P.writeFixtures(py, { 'scores.csv': 'name,score\nAda,92\n', 'raw.csv': 'a,1\n' });
    expect(names.sort()).toEqual(['raw.csv', 'scores.csv']);
    expect(py.written['scores.csv']).toBe('name,score\nAda,92\n');
  });

  it('makes the folder for a nested fixture', () => {
    const py = fakePyodide();
    P.writeFixtures(py, { 'data/in.csv': 'x\n' });
    expect(py.dirs).toContain('data');
    expect(py.written['data/in.csv']).toBe('x\n');
  });

  it('refuses a name that climbs out or is absolute', () => {
    const py = fakePyodide();
    const names = P.writeFixtures(py, { '../etc/passwd': 'no', '/abs.txt': 'no', 'ok.txt': 'yes' });
    expect(names).toEqual(['ok.txt']);
    expect(Object.keys(py.written)).toEqual(['ok.txt']);
  });

  it('does nothing with no fixtures', () => {
    const py = fakePyodide();
    expect(P.writeFixtures(py, null)).toEqual([]);
    expect(P.writeFixtures(py, {})).toEqual([]);
  });
});

describe('every exercise that reads a file has that file in its spec', () => {
  const C = require('../scripts/data-course-content.cjs');
  for (let n = 1; n <= 10; n++) {
    for (const lesson of C[`unit${n}`].lessons) {
      const exercises = lesson.exercises || (lesson.exercise ? [lesson.exercise] : []);
      exercises.forEach((ex, i) => {
        if (!ex.files) return;
        it(`u${n}/${lesson.slug} exercise${i + 1}`, () => {
          const spec = JSON.parse(fs.readFileSync(
            `assets/data/checks/data/unit-${n}/${lesson.slug}.json`, 'utf8'))[`exercise${i + 1}`];
          expect(spec.files).toEqual(ex.files);
        });
      });
    }
  }
});

/* Run has to ask for them, or the helper is dead code. */
describe('runEditorCode seeds the fixtures before it runs', () => {
  it('calls writeFixtures ahead of runCode', () => {
    const src = fs.readFileSync('assets/js/lesson-runner.js', 'utf8');
    const body = src.slice(src.indexOf('window.runEditorCode'));
    const seed = body.indexOf('writeFixtures');
    const run = body.indexOf('Pyodide.runCode(');
    expect(seed).toBeGreaterThan(-1);
    expect(seed).toBeLessThan(run);
  });
});
