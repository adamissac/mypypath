import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { validateSkills, findCycle, expectedItemKeys } from '../scripts/validate-skills.mjs';

/* The skill taxonomy every downstream model is built on. If a tag is missing
   or the prerequisites loop, the engine's features and the recommender's
   prerequisite rule are both wrong, so this runs with the rest of npm test. */

const doc = () => JSON.parse(fs.readFileSync('assets/data/skills.json', 'utf8'));

describe('assets/data/skills.json', () => {
  it('is valid: every item tagged, no cycles, not stale', () => {
    expect(validateSkills().errors).toEqual([]);
  });

  it('covers both courses', () => {
    const courses = new Set(doc().skills.map((s) => s.course));
    expect([...courses].sort()).toEqual(['data', 'foundations']);
    const keys = Object.keys(doc().items);
    expect(keys.some((k) => k.startsWith('lesson:/units/'))).toBe(true);
    expect(keys.some((k) => k.startsWith('lesson:/data/'))).toBe(true);
    expect(keys.some((k) => k.startsWith('mcq:u3d-'))).toBe(true);
  });
});

describe('the validator catches what it claims to', () => {
  it('reports an untagged item', () => {
    const d = doc();
    const victim = Object.keys(d.items).find((k) => k.startsWith('question:'));
    delete d.items[victim];
    const { errors } = validateSkills(d, { checkStale: false });
    expect(errors).toContain(`untagged item ${victim}`);
  });

  it('reports a prerequisite cycle, with its path', () => {
    const d = doc();
    const a = d.skills.find((s) => s.id === 'py.running-code');
    a.prerequisites = ['py.variables-types'];   // variables -> syntax -> running-code -> variables
    const { errors } = validateSkills(d, { checkStale: false });
    expect(errors.some((e) => e.startsWith('prerequisite cycle:') && e.includes('py.running-code'))).toBe(true);
  });

  it('reports a tag naming an unknown skill, and a stale item', () => {
    const d = doc();
    const key = Object.keys(d.items)[0];
    d.items[key] = ['py.not-a-skill'];
    d.items['question:no-such-question'] = ['py.syntax'];
    const { errors } = validateSkills(d, { checkStale: false });
    expect(errors).toContain(`${key} tagged with unknown skill py.not-a-skill`);
    expect(errors).toContain('stale tag for missing item question:no-such-question');
  });

  it('finds no cycle in a DAG and one in a loop', () => {
    expect(findCycle([{ id: 'a', prerequisites: [] }, { id: 'b', prerequisites: ['a'] }])).toBeNull();
    expect(findCycle([{ id: 'a', prerequisites: ['b'] }, { id: 'b', prerequisites: ['a'] }])).toEqual(['a', 'b', 'a']);
  });

  it('knows about every kind of item', () => {
    const kinds = new Set([...expectedItemKeys()].map((k) => k.split(':')[0]));
    expect([...kinds].sort()).toEqual(['exercise', 'frq', 'lesson', 'mcq', 'question']);
  });
});
