import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

/* The unit-test papers had no automated coverage at all.
 *
 * validate-checks.js reads assets/data/checks and stops there, so the ten
 * papers a student is actually graded on -- the only marks that gate the next
 * unit -- were checked by nobody. Walking the course by hand raised a false
 * alarm about them that took three attempts to settle, precisely because there
 * was nothing to ask.
 *
 * The important question is the one a student asks: does a correct answer
 * score full marks? For every free-response question that ships a reference,
 * that is answerable here, using the comparison unit-test-page.js really uses
 * (`got == expect` in Python, so 4 and 4.0 are the same answer).
 */

const havePython = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' }).status === 0;

const PAPERS = [];
for (let unit = 1; unit <= 10; unit++) {
  const mcq = `assets/data/unit-tests/unit-${unit}-mcq.json`;
  const frq = `assets/data/unit-tests/unit-${unit}-frq.json`;
  if (!fs.existsSync(frq)) continue;
  PAPERS.push({
    unit,
    mcq: fs.existsSync(mcq) ? JSON.parse(fs.readFileSync(mcq, 'utf8')) : [],
    frq: JSON.parse(fs.readFileSync(frq, 'utf8')),
  });
}

const referenceFor = (q) => {
  const gen = (q.cases || []).find((c) => c.kind === 'generated');
  return {
    source: q.reference || (gen && gen.reference) || null,
    entry: q.entry || (gen && gen.entry) || null,
  };
};

describe('the unit test papers exist and are shaped like papers', () => {
  it('covers all ten units', () => {
    expect(PAPERS.map((p) => p.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  /* The paper draws one free response from the bank per attempt, so every
     question in it has to be answerable on its own -- a bank where one entry
     is broken fails only the students unlucky enough to draw it, which is the
     hardest kind of bug to hear about. */
  it('gives every unit a bank to draw from, not a single question', () => {
    for (const p of PAPERS) {
      expect(p.frq.length, `unit ${p.unit} free response bank`).toBeGreaterThan(1);
      expect(p.mcq.length, `unit ${p.unit} multiple choice bank`).toBeGreaterThanOrEqual(10);
    }
  });

  it('gives every free response an entry name, a prompt and sample cases', () => {
    const bad = [];
    for (const p of PAPERS) {
      for (const q of p.frq) {
        const { entry } = referenceFor(q);
        if (!entry) bad.push(`u${p.unit} ${q.id}: no entry function name`);
        if (!q.prompt) bad.push(`u${p.unit} ${q.id}: no prompt`);
        const listed = (q.cases || []).filter((c) => Array.isArray(c.args));
        if (listed.length < 3) bad.push(`u${p.unit} ${q.id}: only ${listed.length} listed cases`);
        // A student is shown the cases that are not hidden. Showing none means
        // the prompt is the only specification they get.
        if (!listed.some((c) => c.hidden !== true)) {
          bad.push(`u${p.unit} ${q.id}: every sample case is hidden`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('names the entry function in the prompt, so the requirement is visible', () => {
    const silent = [];
    for (const p of PAPERS) {
      for (const q of p.frq) {
        const { entry } = referenceFor(q);
        if (entry && !String(q.prompt || '').includes(entry)) {
          silent.push(`u${p.unit} ${q.id}: prompt never says "${entry}"`);
        }
      }
    }
    expect(silent).toEqual([]);
  });
});

describe.skipIf(!havePython)('a correct answer scores full marks', () => {
  /* Runs each question's own reference against its own listed cases, with the
     grader's comparison. If this fails, the paper is marking a right answer
     wrong -- the one defect in an exam that no student can work around. */
  for (const p of PAPERS) {
    const withReference = p.frq.filter((q) => referenceFor(q).source && referenceFor(q).entry);
    if (!withReference.length) continue;

    it(`unit ${p.unit}: every reference solution passes its own paper`, () => {
      const failures = [];
      for (const q of withReference) {
        const { source, entry } = referenceFor(q);
        const listed = (q.cases || []).filter((c) => Array.isArray(c.args) && c.expect !== undefined);
        if (!listed.length) continue;
        const script = [
          'import json',
          '_ns = {}',
          `exec(${JSON.stringify(source)}, _ns)`,
          '_out = []',
          `for _args, _want in json.loads(${JSON.stringify(JSON.stringify(
            listed.map((c) => [c.args, c.expect])))}):`,
          `    _got = _ns[${JSON.stringify(entry)}](*_args)`,
          // The comparison unit-test-page.js uses: value equality, not repr.
          '    _out.append([repr(_got), repr(_want), bool(_got == _want)])',
          'print(json.dumps(_out))',
        ].join('\n');
        const rows = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim());
        for (const [got, want, ok] of rows) {
          if (!ok) failures.push(`${q.id}: returns ${got} where the paper expects ${want}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
}, 120000);

describe('the multiple choice is answerable', () => {
  it('has exactly one defensible answer per question, and an explanation', () => {
    const bad = [];
    for (const p of PAPERS) {
      const seen = new Set();
      for (const q of p.mcq) {
        if (seen.has(q.id)) bad.push(`u${p.unit} duplicate id ${q.id}`);
        seen.add(q.id);
        if (!Array.isArray(q.choices) || q.choices.length < 2) {
          bad.push(`u${p.unit} ${q.id}: fewer than two choices`);
          continue;
        }
        if (new Set(q.choices).size !== q.choices.length) {
          bad.push(`u${p.unit} ${q.id}: two identical choices`);
        }
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
          bad.push(`u${p.unit} ${q.id}: answer ${q.answer} is not one of the choices`);
        }
        if (!q.explain) bad.push(`u${p.unit} ${q.id}: no explanation, so a wrong answer teaches nothing`);
      }
    }
    expect(bad).toEqual([]);
  });
});
