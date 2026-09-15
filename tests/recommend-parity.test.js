import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* The browser's scorer and policy against the Python engine's own outputs.
 *
 * tests/fixtures/adaptive/*.json were written by `python -m pypath_engine
 * fixtures` from the same artifact the page loads. engine/tests/test_parity.py
 * checks the fixtures still match the Python engine; this checks the JS port
 * matches the fixtures. Together: Python and JS agree, or one of the two
 * suites fails. A quietly diverging JS reimplementation is the most likely way
 * an engine like this becomes fiction, which is why the tolerance is 1e-6 and
 * the ranked lists, reasons included, must be identical. */

const FIXTURES = 'tests/fixtures/adaptive';
const ARTIFACT = 'assets/data/model/mastery-v1.json';
const TOL = 1e-6;

let R;
let art;
const cases = fs.existsSync(FIXTURES)
  ? fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8')))
  : [];

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/recommend.js', 'utf8')).call(window);
  R = window.PyPathRecommend;
  art = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
});

describe('the parity fixtures', () => {
  it('exist, and were written for the artifact the site ships', () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases) {
      expect(c.model_version, c.name).toBe(art.model_version);
      expect(c.skills_hash, c.name).toBe(art.skills_hash);
    }
  });

  it('pin the artifact to the skill taxonomy on disk', () => {
    const skills = JSON.parse(fs.readFileSync('assets/data/skills.json', 'utf8'));
    expect(art.skills_hash).toBe(skills.hash);
  });
});

describe.each(cases.map((c) => [c.name, c]))('JS agrees with Python: %s', (_name, c) => {
  const eventsFor = () => (c.input.storage ? R.fromLocalStorage(c.input.storage) : c.input.events);

  it('turns local storage into the same events', () => {
    if (!c.input.storage) return;
    expect(R.fromLocalStorage(c.input.storage)).toEqual(c.expected.events_from_storage);
  });

  it('estimates every skill within 1e-6', () => {
    const state = R.replay(art, eventsFor());
    for (const [skill, want] of Object.entries(c.expected.mastery)) {
      expect(Math.abs(R.mastery(art, state, skill, c.input.now) - want), skill).toBeLessThan(TOL);
    }
  });

  it('scores items within 1e-6', () => {
    const state = R.replay(art, eventsFor());
    for (const [item, want] of Object.entries(c.expected.scores)) {
      expect(Math.abs(R.scoreItem(art, state, item, c.input.now) - want), item).toBeLessThan(TOL);
    }
  });

  it('ranks the same items, for the same reasons', () => {
    const got = R.recommend(art, eventsFor(), c.input.now, c.input.courses);
    const want = c.expected.recommendations;
    expect(got.map((r) => r.item)).toEqual(want.map((r) => r.item));
    expect(got.map((r) => r.reason)).toEqual(want.map((r) => r.reason));
    expect(got.map((r) => r.reason_code)).toEqual(want.map((r) => r.reason_code));
    got.forEach((r, i) => {
      expect(Math.abs(r.p - want[i].p)).toBeLessThan(TOL);
      expect(Math.abs(r.gain - want[i].gain)).toBeLessThan(TOL);
    });
  });
});

describe('recommend.js on its own', () => {
  it('never returns an empty list, even for nothing at all', () => {
    expect(R.recommend(art, [], 1790000000000, ['foundations']).length).toBeGreaterThan(0);
    expect(R.recommend(art, [], 1790000000000, ['data']).length).toBeGreaterThan(0);
    expect(R.recommend(art, [], 1790000000000, null).length).toBeGreaterThan(0);
  });

  it('ignores junk rather than throwing', () => {
    const junk = [{ type: 'check.answered' }, { type: 'nonsense', at: 'x' }, null && {}, { at: 5 }]
      .filter(Boolean);
    expect(() => R.recommend(art, junk, 1790000000000, null)).not.toThrow();
    expect(R.fromLocalStorage({ 'pypath-unit-tests': '{not json', 'pypath-checks-/x': '[1,2]' })).toEqual([]);
  });

  it('never words a reason as a number or a grade', () => {
    for (const c of cases) {
      for (const r of c.expected.recommendations) {
        expect(r.reason).not.toMatch(/%|grade|score|rank/i);
      }
    }
  });
});
