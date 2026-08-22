import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildCurriculum } from '../scripts/build-curriculum.js';

const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));

describe('curriculum.json', () => {
  it('is current with the pages on disk', () => {
    // The manifest is generated, so a stale copy is a silent source of wrong
    // dashboards. Regenerating here is cheap and catches a forgotten rebuild.
    expect(manifest.lessons).toEqual(buildCurriculum());
  });

  it('has one entry per lesson page, excluding the 10 unit overviews', () => {
    const onDisk = [];
    for (let unit = 1; unit <= 10; unit += 1) {
      for (const name of fs.readdirSync(`units/unit-${unit}`)) {
        if (name.endsWith('.html')) onDisk.push(`/units/unit-${unit}/${name}`);
      }
    }
    expect(manifest.lessonCount).toBe(onDisk.length);
    expect(manifest.lessons.length).toBe(onDisk.length);
    expect(manifest.lessons.map((l) => l.path).sort()).toEqual(onDisk.sort());
  });

  it('points every path at a file that exists', () => {
    for (const lesson of manifest.lessons) {
      expect(fs.existsSync(lesson.path.slice(1))).toBe(true);
    }
  });

  it('numbers lessons from 1 within each unit, in curriculum order', () => {
    for (let unit = 1; unit <= 10; unit += 1) {
      const orders = manifest.lessons.filter((l) => l.unit === unit).map((l) => l.order);
      expect(orders).toEqual(orders.map((_, i) => i + 1));
    }
  });

  it('gives every lesson a real title rather than falling back to the slug', () => {
    const fallbacks = manifest.lessons.filter((l) => !l.title || l.title === l.slug);
    expect(fallbacks).toEqual([]);
  });

  it('names each unit consistently across its lessons', () => {
    const byUnit = new Map();
    for (const lesson of manifest.lessons) {
      const seen = byUnit.get(lesson.unit);
      if (seen) expect(lesson.unitTitle).toBe(seen);
      else byUnit.set(lesson.unit, lesson.unitTitle);
    }
    expect(byUnit.size).toBe(10);
  });

  it('records editor and exercise ids without duplicates', () => {
    for (const lesson of manifest.lessons) {
      expect(new Set(lesson.editors).size).toBe(lesson.editors.length);
      expect(new Set(lesson.exercises).size).toBe(lesson.exercises.length);
    }
  });

  it('agrees with the runtime unit map in curriculum.js', () => {
    // Two generators read the same unit pages. If they ever disagree, one of
    // them was not re-run and some page is reading a stale lesson list.
    const src = fs.readFileSync('assets/js/curriculum.js', 'utf8');
    new Function(src).call(window);
    const runtime = window.PyPathCurriculum;
    expect(runtime.TOTAL_UNITS).toBe(10);
    for (let unit = 1; unit <= 10; unit += 1) {
      const fromManifest = manifest.lessons
        .filter((l) => l.unit === unit)
        .map((l) => l.path);
      expect(runtime.lessonsIn(unit)).toEqual(fromManifest);
    }
  });
});
