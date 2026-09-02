import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  setup, havePython, score, specFor, runMutation, errorsForUnit,
} from './helpers/check-runner.js';

/* Unit 8 is the unit where the grader had to change shape.
 *
 * Everywhere else the student writes a solution and the check runs it. Here,
 * twice, the student writes the *tests* and there is no output to compare --
 * so the check runs their suite against a working implementation and against
 * three broken ones, and passes only if it can tell them apart.
 *
 * All ten lesson pages had no editor at all before this work. Seven now have
 * one; the three that do not are discussion lessons where a code task would
 * have had to be invented, and they carry questions alone.
 */

beforeAll(() => setup());

const GRADED = [
  'common-types-errors',
  'print-statements-debugging',
  'understanding-tracebacks',
  'writing-running-tests',
  'introduction-unittest',
  'test-driven-development',
  'debugging-logical-runtime-errors',
];

const QUESTIONS_ONLY = [
  'what-is-debugging',
  'breakpoints-debuggers',
  'maintaining-code-quality',
];

/* A correct solution and a plausible wrong one for every graded exercise. The
   wrong answers are the mistakes the lesson is about, not nonsense: the guard
   that swallows the error the lesson wanted to see, the fix applied without
   the trace that found it, the boundary excluded by one character. */
const FIXTURES = [
  ['common-types-errors', 'practice1',
    'def student_score(scores, name):\n    return scores[name]\n\n'
      + 'def share(total, people):\n    return total / people\n\n'
      + 'print(student_score({"Ada": 90, "Grace": 95}, "Ada"))\nprint(share(10, 4))\n',
    // Both guards return a plausible value and destroy the error that named
    // the problem. This is the shape the lesson exists to argue against.
    'def student_score(scores, name):\n    try:\n        return scores[name]\n'
      + '    except KeyError:\n        return 0\n\n'
      + 'def share(total, people):\n    if people == 0:\n        return 0\n'
      + '    return total / people\n'],

  ['print-statements-debugging', 'practice1',
    'def running_total(numbers):\n    running = 0\n    for n in numbers:\n'
      + '        running = running + n\n        print("DEBUG running:", running)\n'
      + '    return running\n\nprint(running_total([1, 2, 3]))\n',
    // The bug fixed, but the trace that would have found it never written.
    'def running_total(numbers):\n    running = 0\n    for n in numbers:\n'
      + '        running = running + n\n    return running\n\nprint(running_total([1, 2, 3]))\n'],

  ['understanding-tracebacks', 'practice1',
    'def calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\n'
      + 'def process_data(numbers):\n    return calculate_average(numbers)\n\n'
      + 'print(process_data([2, 4, 6]))\n',
    // Catching it collapses the two-frame chain the exercise is about.
    'def calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\n'
      + 'def process_data(numbers):\n    try:\n        return calculate_average(numbers)\n'
      + '    except ZeroDivisionError:\n        return 0\n'],

  ['introduction-unittest', 'practice1',
    'def letter_grade(score):\n    if score < 0 or score > 100:\n'
      + '        raise ValueError("score out of range")\n'
      + '    if score >= 90:\n        return "A"\n    if score >= 80:\n        return "B"\n'
      + '    if score >= 70:\n        return "C"\n    if score >= 60:\n        return "D"\n'
      + '    return "F"\n',
    // Every boundary excluded by one character: 80 becomes a C.
    'def letter_grade(score):\n    if score < 0 or score > 100:\n'
      + '        raise ValueError("score out of range")\n'
      + '    if score > 90:\n        return "A"\n    if score > 80:\n        return "B"\n'
      + '    if score > 70:\n        return "C"\n    if score > 60:\n        return "D"\n'
      + '    return "F"\n'],

  ['debugging-logical-runtime-errors', 'practice1',
    'def count_passing(scores, pass_mark):\n    total = 0\n    for score in scores:\n'
      + '        if score >= pass_mark:\n            total = total + 1\n    return total\n',
    // The off-by-one left exactly as the page ships it.
    'def count_passing(scores, pass_mark):\n    total = 0\n    for score in scores:\n'
      + '        if score > pass_mark:\n            total = total + 1\n    return total\n'],

  ['writing-running-tests', 'practice1',
    'def test_normal_list():\n    assert find_max([1, 5, 3]) == 5\n\n'
      + 'def test_empty_list():\n    assert find_max([]) is None\n\n'
      + 'def test_single_item():\n    assert find_max([7]) == 7\n',
    // Sincere and weak: it catches two of the three, and the empty list --
    // the case the page names -- goes untested.
    'def test_normal_list():\n    assert find_max([1, 5, 3]) == 5\n'],

  ['test-driven-development', 'practice1',
    'def test_typical_discount():\n    assert apply_discount(200, 10) == 180\n\n'
      + 'def test_no_discount():\n    assert apply_discount(50, 0) == 50\n\n'
      + 'def test_uneven_price():\n    assert apply_discount(10, 25) == 7.5\n',
    // The starter test, unchanged. 100 minus 20 percent and 100 minus 20 are
    // the same number, which is why all three bugs survive it.
    'def test_typical_discount():\n    assert apply_discount(100, 20) == 80\n'],
];

describe('the Unit 8 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 8)).toEqual([]);
  });

  it('covers every Unit 8 lesson', () => {
    const authored = fs
      .readdirSync('assets/data/checks/unit-8')
      .map((n) => n.replace(/\.json$/, ''))
      .sort();
    expect(authored).toEqual([...GRADED, ...QUESTIONS_ONLY].sort());
  });

  /* The seven editors were added to the pages by this work. If a later edit
     removes one, the check file for it becomes dead weight that no button
     reaches, and only this test says so. */
  it('every graded lesson really has the editor its check file names', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    for (const slug of GRADED) {
      const lesson = manifest.lessons.find((l) => l.unit === 8 && l.slug === slug);
      expect([...(lesson.editors || []), ...(lesson.exercises || [])], slug)
        .toContain('practice1');
    }
  });

  /* Three lessons are discussion, and inventing a code task for them would
     mean grading something the page never asked for. Pinned so that a later
     author adds an editor deliberately rather than by drift. */
  it('leaves the three discussion lessons without a code exercise', () => {
    for (const slug of QUESTIONS_ONLY) {
      const spec = JSON.parse(
        fs.readFileSync(`assets/data/checks/unit-8/${slug}.json`, 'utf8')
      );
      // Questions and reflections need no editor. Anything else here would be
      // an exercise id that no button on the page reaches.
      expect(Object.keys(spec).sort(), slug).toEqual(['questions', 'reflections']);
    }
  });

  it('gives every graded exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(specFor(8, slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });

  /* quiz-bank.js pools questions per unit, so ids have to be unique across
     the whole unit and not merely within a file, which is all the validator
     can see. */
  it('has no duplicate question id anywhere in the unit', () => {
    const seen = new Map();
    for (const name of fs.readdirSync('assets/data/checks/unit-8')) {
      const spec = JSON.parse(fs.readFileSync(`assets/data/checks/unit-8/${name}`, 'utf8'));
      for (const q of spec.questions || []) {
        expect(seen.has(q.id), `${q.id} is in both ${seen.get(q.id)} and ${name}`).toBe(false);
        seen.set(q.id, name);
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe.skipIf(!havePython)('every Unit 8 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(specFor(8, slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(specFor(8, slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 180000);

/* ------------------------------------------------- grading tests, not output */

/* The two mutation exercises are the only place in the course where the thing
   being marked is the student's judgement about what could go wrong. These
   tests are about the property that makes that grading mean anything: a suite
   that asserts nothing must not pass. */
describe.skipIf(!havePython)('a suite is judged on what it catches', () => {
  const findMax = () => specFor(8, 'writing-running-tests', 'practice1').cases[0];
  const discount = () => specFor(8, 'test-driven-development', 'practice1').cases[0];

  it('refuses a suite that asserts nothing', () => {
    for (const testCase of [findMax(), discount()]) {
      const out = runMutation('def test_nothing():\n    assert True\n', testCase);
      expect(out.green, testCase.name).toBe(true);
      expect(out.caught, 'assert True cannot catch a bug').toBe(0);
    }
  });

  it('refuses an empty suite', () => {
    expect(runMutation('', findMax()).caught).toBe(0);
  });

  /* The page tells the student the starter catches some of the bugs but not
     all of them. If that ever stops being true the lesson text is wrong, and
     this is where it shows. */
  it('scores the starter suite as partial, not as zero and not as complete', () => {
    const starter = 'def test_normal_list():\n    assert find_max([1, 5, 3]) == 5\n';
    const out = runMutation(starter, findMax());
    expect(out.green).toBe(true);
    expect(out.caught).toBeGreaterThan(0);
    expect(out.caught).toBeLessThan(out.total);
  });

  /* Told apart on purpose: a suite that fails the working version and a suite
     that misses a bug send a student to two different places. */
  it('reports a suite that fails the correct version as not green', () => {
    const out = runMutation('def test_wrong():\n    assert find_max([1, 5, 3]) == 3\n', findMax());
    expect(out.green).toBe(false);
    expect(out.greenError).toBe('AssertionError');
  });

  /* Every discount mutant survives 100 and 20 percent, because 100 minus 20
     percent and 100 minus 20 are the same number. That is what makes the
     exercise worth setting, so it is asserted rather than assumed. */
  it('the discount starter catches nothing at all until the numbers change', () => {
    const starter = 'def test_typical_discount():\n    assert apply_discount(100, 20) == 80\n';
    const out = runMutation(starter, discount());
    expect(out.green).toBe(true);
    expect(out.caught).toBe(0);
  });
});

/* --------------------------------------------------------------- the habits */

describe.skipIf(!havePython)('the habits, not just the answers', () => {
  it('refuses the guard that swallows the error the lesson wanted', () => {
    const guarded = 'def student_score(scores, name):\n    return scores.get(name, 0)\n\n'
      + 'def share(total, people):\n    return total / people if people else 0\n';
    const s = score(specFor(8, 'common-types-errors', 'practice1'), guarded);
    expect(s.failed).toContain('a missing name raises KeyError');
    expect(s.failed).toContain('zero people raises ZeroDivisionError');
  });

  it('refuses a fix that arrived without the trace that finds it', () => {
    const noTrace = 'def running_total(numbers):\n    return sum(numbers)\n\n'
      + 'print(running_total([1, 2, 3]))\n';
    const s = score(specFor(8, 'print-statements-debugging', 'practice1'), noTrace);
    expect(s.failed).toContain('the trace shows every pass through the loop');
  });

  it('refuses a single function where the traceback needed two frames', () => {
    const flat = 'def process_data(numbers):\n    return sum(numbers) / len(numbers)\n';
    const s = score(specFor(8, 'understanding-tracebacks', 'practice1'), flat);
    expect(s.failed).toContain('process_data hands its work to calculate_average');
  });

  /* The comment cheat, in this unit's clothing. A regex over source would
     accept a try/except described in a comment; the analyzer never sees it,
     and equally never mistakes the real thing for prose about it. */
  it('does not mistake a comment about try/except for a try/except', () => {
    const commented = 'def calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\n'
      + 'def process_data(numbers):\n    # no try/except here: let the error out\n'
      + '    return calculate_average(numbers)\n';
    const s = score(specFor(8, 'understanding-tracebacks', 'practice1'), commented);
    expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
  });
});
