import { describe, it, expect, beforeAll } from 'vitest';
import { setup, havePython, score, specFor, editorsFor, errorsForUnit } from './helpers/check-runner.js';

/* The shared runner, checked against the one unit whose answers are already
   known. Eight unit suites are about to trust this file; if it marked
   everything green it would tell all eight that lessons nobody wrote were
   verified. */

beforeAll(() => setup());

describe('the shared check runner', () => {
  it('reads the editor ids a lesson really has', () => {
    expect(editorsFor(1, 'arithmetic-expressions')).toContain('exercise1');
    expect(editorsFor(1, 'arithmetic-expressions')).not.toContain('exercise9');
    expect(editorsFor(99, 'nothing')).toEqual([]);
  });

  it('keeps one unit\'s problems out of another unit\'s suite', () => {
    const all = [
      'assets/data/checks/unit-3/for-loop.json / exercise1: no hint',
      'assets/data/checks/unit-7/try-except-blocks.json / practice1: no hint',
    ];
    expect(errorsForUnit(all, 7)).toHaveLength(1);
    expect(errorsForUnit(all, 3)).toHaveLength(1);
    expect(errorsForUnit(all, 4)).toHaveLength(0);
  });
});

describe.skipIf(!havePython)('the shared runner against Unit 1, whose answers are known', () => {
  it('accepts the honest solution to the area exercise', () => {
    const s = score(specFor(1, 'arithmetic-expressions', 'exercise1'),
      'length = 8\nwidth = 5\nprint(length * width)');
    expect(s.failed, s.failed.join(', ')).toEqual([]);
    expect(s.total).toBeGreaterThan(0);
  });

  /* The cheat the AST work was written for. A runner that let this through
     would be a runner that verifies nothing. */
  it('still refuses the answer typed into a comment', () => {
    const s = score(specFor(1, 'arithmetic-expressions', 'exercise1'),
      'length = 8\nwidth = 5\n# length * width\nprint(40)');
    expect(s.failed).toContain('the area is calculated, not typed in');
  });

  it('refuses a plausible wrong answer to a stdout exercise', () => {
    const s = score(specFor(1, 'type-io', 'exercise1'),
      'text_number = "10"\nprint(text_number * 5)');
    expect(s.passed).toBeLessThan(s.total);
  });
});
