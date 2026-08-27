import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { QUESTION_KINDS, validateChecks } from '../scripts/validate-checks.js';

let Q;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/question-types.js', 'utf8')).call(window);
  Q = window.PyPathQuestions;
});

const POOLS = 'assets/data/unit-tests';

function poolFiles() {
  return fs.readdirSync(POOLS)
    .filter((f) => f.endsWith('-mcq.json'))
    .map((f) => path.join(POOLS, f));
}

describe('the kind lists', () => {
  /* The validator is a Node script and question-types.js is a browser global
     with no export, so the list is written twice, the same way classroom-core
     repeats the unit-test pass mark. This is what stops the two drifting. */
  it('agree between the browser and the validator', () => {
    expect(QUESTION_KINDS).toEqual(Q.QUESTION_KINDS);
  });
});

describe('the migrated unit-test pools', () => {
  it('finds the pools', () => {
    expect(poolFiles().length).toBeGreaterThan(5);
  });

  /* kind used to mean a content category, valued vocab or code, read by
     nothing. It now means the question type. A stale value would parse as "a
     type that does not exist", so the migration is guarded rather than
     trusted. */
  it('carries no kind outside the known set', () => {
    for (const file of poolFiles()) {
      const questions = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const q of questions) {
        expect(QUESTION_KINDS, `${file} / ${q.id}: kind "${q.kind}"`).toContain(q.kind);
      }
    }
  });

  it('has no question left carrying the old category values', () => {
    for (const file of poolFiles()) {
      const raw = fs.readFileSync(file, 'utf8');
      expect(raw, file).not.toMatch(/"kind"\s*:\s*"(vocab|code)"/);
    }
  });

  it('states a kind on every pool question rather than relying on the default', () => {
    for (const file of poolFiles()) {
      for (const q of JSON.parse(fs.readFileSync(file, 'utf8'))) {
        expect(q.kind, `${file} / ${q.id}`).toBeTruthy();
      }
    }
  });

  it('scores every pool question through the shared scorer', () => {
    for (const file of poolFiles()) {
      for (const q of JSON.parse(fs.readFileSync(file, 'utf8'))) {
        expect(Q.score(q, q.answer).right, `${file} / ${q.id}`).toBe(true);
      }
    }
  });
});

describe('the authored check files', () => {
  it('pass the validator, kinds included', () => {
    const { errors } = validateChecks();
    expect(errors).toEqual([]);
  });
});
