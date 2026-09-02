import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { validateChecks } from '../scripts/validate-checks.js';
import { setup, havePython, score, specIn } from './helpers/check-runner.js';

/* Python for Data, units 1 and 2.
 *
 * The course is generated: scripts/data-course-content.cjs holds the lessons
 * and scripts/build-data-course.cjs turns them into pages, check files and a
 * manifest. So the fixtures come from the same content module the pages do --
 * a correct solution and a plausible wrong one written next to the exercise
 * they belong to, rather than copied into a second list that can drift.
 *
 * Everything here is standard library. numpy and pandas are not loaded in the
 * page's Pyodide instance, and the two free units were written that way on
 * purpose so that every exercise a signed-out visitor can reach actually runs.
 */

const require = createRequire(import.meta.url);
const CONTENT = require('../scripts/data-course-content.cjs');

const LESSONS = [1, 2].flatMap((n) =>
  CONTENT[`unit${n}`].lessons.map((lesson) => ({ unit: n, lesson })));

beforeAll(() => setup());

describe('the Python for Data check files', () => {
  it('are valid, and so is everything else', () => {
    expect(validateChecks().errors).toEqual([]);
  });

  it('cover every lesson in the two written units', () => {
    for (const { unit, lesson } of LESSONS) {
      const file = `assets/data/checks/data/unit-${unit}/${lesson.slug}.json`;
      expect(fs.existsSync(file), file).toBe(true);
      expect(specIn('data', unit, lesson.slug, 'exercise1'), lesson.slug).toBeTruthy();
    }
    expect(LESSONS.length).toBe(12);
  });

  it('gives every exercise a hint and some questions', () => {
    for (const { unit, lesson } of LESSONS) {
      expect(specIn('data', unit, lesson.slug, 'exercise1').hint, lesson.slug).toBeTruthy();
      const spec = JSON.parse(
        fs.readFileSync(`assets/data/checks/data/unit-${unit}/${lesson.slug}.json`, 'utf8')
      );
      expect(spec.questions.length, lesson.slug).toBeGreaterThanOrEqual(3);
    }
  });

  /* Each course numbers its units from 1. If the two ever shared a checks
     folder, Foundations unit 1 and Data unit 1 would read each other's file
     and both would look fine until a student saw the wrong exercise. */
  it('keeps the two courses\' unit 1 apart', () => {
    const data = JSON.parse(fs.readFileSync(
      'assets/data/checks/data/unit-1/what-is-data-analysis.json', 'utf8'));
    const foundations = JSON.parse(fs.readFileSync(
      'assets/data/checks/unit-1/what-is-python.json', 'utf8'));
    expect(Object.keys(data)).not.toEqual(Object.keys(foundations));
    expect(fs.existsSync('assets/data/checks/unit-1/what-is-data-analysis.json')).toBe(false);
  });

  /* The manifest the validator checks the ids against, and the pages the
     lessons actually live at. */
  it('has a manifest that matches the pages on disk', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum-data.json', 'utf8'));
    expect(manifest.lessonCount).toBe(12);
    for (const lesson of manifest.lessons) {
      expect(fs.existsSync(lesson.path.replace(/^\//, '')), lesson.path).toBe(true);
    }
  });
});

describe.skipIf(!havePython)('every Python for Data check, run against real Python', () => {
  for (const { unit, lesson } of LESSONS) {
    it(`u${unit}/${lesson.slug}: accepts a correct solution`, () => {
      const s = score(specIn('data', unit, lesson.slug, 'exercise1'), lesson.exercise.correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`u${unit}/${lesson.slug}: rejects a plausible wrong answer`, () => {
      const s = score(specIn('data', unit, lesson.slug, 'exercise1'), lesson.exercise.wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 240000);

/* ------------------------------------------------------- the data-specific traps */

describe.skipIf(!havePython)('the mistakes this course is about', () => {
  const rejects = (unit, slug, code, caseName) => {
    const s = score(specIn('data', unit, slug, 'exercise1'), code);
    expect(s.failed, `${slug} accepted it`).toContain(caseName);
  };

  /* The whole argument of lesson four: a file read is not a file recited. */
  it('refuses a CSV answer typed out instead of read', () => {
    rejects(1, 'reading-a-csv-file',
      'print("Ada 92")\nprint("Grace 88")\nprint("Alan 79")\n',
      'a different file gives different output');
  });

  /* The literal list holds the right three numbers, so the value case passes.
     What it does not do is read them off the table, which is the exercise. */
  it('refuses a column typed out instead of taken from the table', () => {
    rejects(1, 'rows-and-columns-with-lists',
      'table = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\nscores = [92, 88, 79]\nprint(scores)\n',
      'the column is taken from the table');
  });

  /* Off-by-one at a boundary, which is where marks and thresholds cluster. */
  it('refuses a filter that drops everyone sitting on the mark', () => {
    rejects(2, 'filtering-rows',
      'def passing(rows, mark):\n    return [r for r in rows if r["score"] > mark]\n',
      'a score exactly on the mark passes');
  });

  it('refuses isdigit as a test for "is this a number"', () => {
    rejects(2, 'fixing-types',
      'def to_score(text):\n    if text.isdigit():\n        return int(text)\n    return 0\n',
      'a negative number still converts');
  });

  /* Removing while looping skips the neighbour of every removal. */
  it('refuses a drop that mutates the caller\'s list', () => {
    rejects(2, 'missing-values',
      'def drop_missing(rows):\n    for row in rows:\n        if row["score"] == "":\n'
        + '            rows.remove(row)\n    return rows\n',
      'the original list is not modified');
  });

  it('refuses a dedupe that sorts the order away', () => {
    rejects(2, 'removing-duplicates',
      'def unique_names(names):\n    return sorted(set(n.strip().lower() for n in names))\n',
      'the first spelling is the one kept');
  });

  it('refuses an average that raises on an empty column', () => {
    rejects(1, 'summarising-numbers',
      'def average(scores):\n    return sum(scores) / len(scores)\n',
      'an empty list averages to 0');
  });
});
