import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateChecks } from '../scripts/validate-checks.js';

/* A reflection spec is looked up by the DOM id of the textarea it belongs to
 * (`conceptSpec[input.id]` in lesson-progress.js, no normalisation). So an id
 * that does not appear on the page is not a check that is wrong -- it is a
 * check that never runs, and nothing anywhere reports it.
 *
 * The validator used to enforce `^reflection\d+$`, which matched one lesson in
 * the repo. The shared lesson template names its boxes `reflection-exercise1`
 * and `reflection-exercise2`, on forty pages. Every id that validated was an
 * id that never fired. Twenty lessons shipped reflection checks that could not
 * run, and the suite was green throughout.
 *
 * These tests are the pair that makes that impossible to reintroduce: one
 * proves the guard can fail, the other proves nothing in the repo trips it.
 */

const CHECKS = 'assets/data/checks';

function reflectionInputsOn(page) {
  if (!fs.existsSync(page)) return null;
  return [...fs.readFileSync(page, 'utf8').matchAll(/id="(reflection[^"]*)"/g)]
    .map((m) => m[1]);
}

function lessonPageFor(unit, slug) {
  const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
  const lesson = manifest.lessons.find((l) => l.unit === unit && l.slug === slug);
  return lesson ? lesson.path.replace(/^\//, '') : null;
}

function authoredReflections() {
  const rows = [];
  for (const dir of fs.readdirSync(CHECKS)) {
    const unit = Number(/^unit-(\d+)$/.exec(dir)[1]);
    for (const name of fs.readdirSync(path.join(CHECKS, dir))) {
      const spec = JSON.parse(fs.readFileSync(path.join(CHECKS, dir, name), 'utf8'));
      if (!spec.reflections) continue;
      rows.push({
        unit,
        slug: name.replace(/\.json$/, ''),
        file: `${CHECKS}/${dir}/${name}`,
        ids: Object.keys(spec.reflections),
      });
    }
  }
  return rows;
}

describe('reflection ids point at inputs that exist', () => {
  it('finds reflections to check, so this suite is not vacuous', () => {
    const rows = authoredReflections();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((r) => r.ids.length > 1)).toBe(true);
  });

  it('every authored id is on its own lesson page', () => {
    const offenders = [];
    for (const row of authoredReflections()) {
      const page = lessonPageFor(row.unit, row.slug);
      const onPage = page ? reflectionInputsOn(page) : null;
      for (const id of row.ids) {
        if (!onPage || !onPage.includes(id)) {
          offenders.push(`${row.file}: "${id}" is not on ${page} `
            + `(it has: ${(onPage || []).join(', ') || 'nothing'})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /* The half that matters. A guard nobody has watched fail is a guard nobody
     knows is connected. */
  it('the validator rejects an id that is not on the page', () => {
    const row = authoredReflections()[0];
    const original = fs.readFileSync(row.file, 'utf8');
    const spec = JSON.parse(original);
    const [first] = Object.keys(spec.reflections);
    spec.reflections = { 'reflection-not-on-any-page': spec.reflections[first] };
    try {
      fs.writeFileSync(row.file, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
      const errors = validateChecks().errors
        .filter((e) => e.includes('reflection-not-on-any-page'));
      expect(errors.length, 'a bad reflection id must be reported').toBe(1);
      expect(errors[0]).toMatch(/no input with that id on the page/);
    } finally {
      fs.writeFileSync(row.file, original, 'utf8');
    }
    expect(validateChecks().errors).toEqual([]);
  });
});

/* Not a failure, but worth counting: pages that offer a reflection box nobody
   authored a check for. The box still works -- the word floor in
   reflection-check.js applies -- but nothing looks at what was written. */
describe('reflection coverage', () => {
  it('reports how many lesson pages have an unchecked reflection box', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const authored = new Map(
      authoredReflections().map((r) => [`${r.unit}/${r.slug}`, r.ids])
    );
    let unchecked = 0;
    for (const lesson of manifest.lessons) {
      const onPage = reflectionInputsOn(lesson.path.replace(/^\//, '')) || [];
      const have = authored.get(`${lesson.unit}/${lesson.slug}`) || [];
      unchecked += onPage.filter((id) => !have.includes(id)).length;
    }
    // Pinned rather than asserted to zero: authoring the rest is lesson work,
    // and this number going up unnoticed is the thing to catch.
    expect(unchecked).toBeLessThanOrEqual(50);
  });
});
