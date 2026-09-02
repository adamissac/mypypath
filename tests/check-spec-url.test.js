import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Three files work out where a lesson's check file lives, from the lesson's
 * own URL: check-ui.js runs the exercises, lesson-quiz.js renders the
 * questions, lesson-progress.js marks the written reflections.
 *
 * They were three copies of one regex, and adding a second course fixed one of
 * them. The result was a course whose exercises graded correctly and whose
 * questions never appeared -- no error, no empty state, just a lesson missing
 * its quiz on every page. Nothing failed, because nothing was looking.
 *
 * This is what looks.
 */

const FILES = {
  'assets/js/check-ui.js': /specUrl/,
  'assets/js/lesson-quiz.js': /specUrl/,
  'assets/js/lesson-progress.js': /loadConceptSpec/,
};

/* Pull the path regex out of each file and run it, rather than comparing the
   source text: two files can spell the same rule differently and still agree,
   and it is the agreement that matters. */
function pathPatternIn(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/\/\^\\\/\(units\|data\)\\\/\(unit-\\d\+\)\\\/\(\[a-z0-9-\]\+\)\\\.html\$\//);
  return m ? m[0] : null;
}

describe('every file that finds a check file agrees where it is', () => {
  it('all three know about both course roots', () => {
    const missing = [];
    for (const [file, marker] of Object.entries(FILES)) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src, `${file} lost its lookup`).toMatch(marker);
      if (!/\(units\|data\)/.test(src)) missing.push(file);
      if (!/COURSE_CHECK_DIR/.test(src)) missing.push(`${file} (no course-to-folder map)`);
    }
    expect(missing).toEqual([]);
  });

  it('all three spell the path rule identically', () => {
    const patterns = Object.keys(FILES).map(pathPatternIn);
    expect(patterns.every(Boolean), 'a file no longer matches the shared shape').toBe(true);
    expect(new Set(patterns).size, 'the three regexes have drifted apart').toBe(1);
  });

  /* The mapping itself, evaluated. Foundations keeps checks/unit-N with no
     prefix; Data nests. Getting this backwards would have each course reading
     the other's unit 1. */
  it('maps each course root to its own checks folder', () => {
    for (const file of Object.keys(FILES)) {
      const src = fs.readFileSync(file, 'utf8');
      const decl = src.match(/COURSE_CHECK_DIR = (\{[^}]*\})/);
      expect(decl, `${file} has no map`).toBeTruthy();
      // eslint-disable-next-line no-eval
      const map = eval(`(${decl[1]})`);
      expect(map.units, file).toBe('');
      expect(map.data, file).toBe('data/');
    }
  });

  it('resolves a lesson from each course to a file that exists', () => {
    const resolve = (pathname) => {
      const m = /^\/(units|data)\/(unit-\d+)\/([a-z0-9-]+)\.html$/.exec(pathname);
      const dir = { units: '', data: 'data/' }[m[1]];
      return `assets/data/checks/${dir}${m[2]}/${m[3]}.json`;
    };
    const foundations = resolve('/units/unit-1/what-is-python.html');
    const data = resolve('/data/unit-1/summarising-numbers.html');
    expect(foundations).toBe('assets/data/checks/unit-1/what-is-python.json');
    expect(data).toBe('assets/data/checks/data/unit-1/summarising-numbers.json');
    expect(fs.existsSync(foundations)).toBe(true);
    expect(fs.existsSync(data)).toBe(true);
  });
});

/* A lesson page that carries a quiz placeholder but has no questions authored
   renders an empty box. Cheap to check, and it is how the Data course's
   missing quiz would have shown up. */
describe('every lesson with a quiz placeholder has questions to put in it', () => {
  it('holds for both courses', () => {
    const manifests = ['assets/data/curriculum.json', 'assets/data/curriculum-data.json'];
    const empty = [];
    for (const mf of manifests) {
      if (!fs.existsSync(mf)) continue;
      const isData = mf.includes('-data');
      for (const lesson of JSON.parse(fs.readFileSync(mf, 'utf8')).lessons) {
        const page = lesson.path.replace(/^\//, '');
        if (!fs.existsSync(page)) continue;
        if (!fs.readFileSync(page, 'utf8').includes('data-lesson-quiz')) continue;
        const file = `assets/data/checks/${isData ? 'data/' : ''}unit-${lesson.unit}/${lesson.slug}.json`;
        const spec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (!(spec.questions || []).length) empty.push(`${lesson.path} has a quiz box and no questions`);
      }
    }
    expect(empty).toEqual([]);
  });
});
