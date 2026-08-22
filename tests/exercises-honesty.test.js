import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* The reflection exercises used to run a 60%-word-overlap check and report the
   result as correctness. These tests pin down that nothing here claims to know
   whether a written answer is right, because nothing here can. */

let E;
const src = fs.readFileSync('assets/js/exercises.js', 'utf8');

beforeAll(() => {
  document.body.innerHTML = '<div class="exercise-item" data-exercise-id="exercise1"></div>';
  new Function(src).call(window);
  E = window.PyPathExercises;
});

const SAMPLE = 'Print statements help debug by showing variable values at specific '
  + 'points, tracing program flow, confirming functions are called, and revealing '
  + 'what is happening inside code.';

describe('the old heuristic is gone', () => {
  it('no longer has a function that decides whether an answer matches', () => {
    expect(src).not.toContain('function compareAnswers');
  });

  it('no longer tells a learner their answer "matches well"', () => {
    expect(src).not.toContain('matches well');
    expect(src).not.toContain('Great job! Your answer');
  });

  it('no longer divides by the longer of the two texts', () => {
    // That ratio was why a correct one-sentence answer could never pass.
    expect(src).not.toMatch(/Math\.max\(userWords\.length, correctWords\.length\)/);
  });

  it('drops the match/no-match classes that coloured an answer right or wrong', () => {
    expect(src).not.toMatch(/\$\{matches \? 'match' : 'no-match'\}/);
  });
});

describe('coverage, which is all the overlap number now claims to be', () => {
  it('measures against the sample rather than the longer text', () => {
    const short = 'They let you see what a variable actually holds while the program runs.';
    // The old check scored this below its 0.6 threshold purely because the
    // sample was longer. Coverage reports what it actually is.
    const coverage = E.overlapWithSample(short, SAMPLE);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThanOrEqual(1);
  });

  it('gives a verbatim copy full coverage', () => {
    expect(E.overlapWithSample(SAMPLE, SAMPLE)).toBe(1);
  });

  it('gives an unrelated answer no coverage', () => {
    expect(E.overlapWithSample('I went to the shop and bought bread', SAMPLE)).toBe(0);
  });

  it('ignores short filler words, which every English sentence shares', () => {
    expect(E.overlapWithSample('the and that with this from they', SAMPLE)).toBe(0);
  });

  it('does not reward repeating one keyword', () => {
    // Each sample word counts once, so padding cannot inflate the figure.
    const once = E.overlapWithSample('variable', SAMPLE);
    const many = E.overlapWithSample('variable variable variable variable', SAMPLE);
    expect(many).toBe(once);
  });

  it('handles an empty answer or an empty sample', () => {
    expect(E.overlapWithSample('', SAMPLE)).toBe(0);
    expect(E.overlapWithSample('anything', '')).toBe(0);
    expect(E.overlapWithSample(null, null)).toBe(0);
  });
});

describe('what the learner is told', () => {
  it('never claims the answer is correct or incorrect', () => {
    const answers = [SAMPLE, 'They show you values.', 'Completely unrelated text here.', ''];
    for (const answer of answers) {
      const text = E.coverageNudge(answer, SAMPLE).text.toLowerCase();
      for (const banned of ['correct', 'incorrect', 'right', 'wrong', 'matches']) {
        expect(text, `"${text}" should not say "${banned}"`).not.toContain(banned);
      }
    }
  });

  it('always confirms the answer was saved', () => {
    expect(E.coverageNudge('a real answer with enough words in it to count', SAMPLE).text)
      .toContain('saved');
  });

  it('points out a very short answer without marking it down', () => {
    const nudge = E.coverageNudge('print shows values', SAMPLE);
    expect(nudge.tone).toBe('thin');
    expect(nudge.text).toContain('short');
  });

  it('treats different wording as possibly fine rather than as a failure', () => {
    const nudge = E.coverageNudge(
      'You can watch what the program is doing as it goes along step by step', SAMPLE
    );
    if (nudge.tone === 'differs') {
      expect(nudge.text).toContain('may be fine');
      expect(nudge.text).toContain('decide for yourself');
    }
  });

  it('still says something useful when there is no sample answer', () => {
    const nudge = E.coverageNudge('my answer', null);
    expect(nudge.text).toContain('saved');
  });

  it('calls the sample one good answer rather than the answer', () => {
    expect(src).toContain('This is one good answer, not the only one');
  });
});

describe('the self-check rubric', () => {
  it('states what a good reflection answer does', () => {
    expect(E.RUBRIC.length).toBeGreaterThanOrEqual(3);
    for (const point of E.RUBRIC) expect(point.startsWith('I ')).toBe(true);
  });

  it('asks about reasoning and evidence, not about keywords', () => {
    const text = E.RUBRIC.join(' ').toLowerCase();
    expect(text).toContain('why');
    expect(text).toContain('example');
    expect(text).toContain('own words');
  });

  it('renders as real checkboxes with labels bound to them', () => {
    expect(src).toMatch(/box\.type = 'checkbox'/);
    expect(src).toMatch(/label\.setAttribute\('for', id\)/);
  });

  it('does not store or report the ticks', () => {
    // A self-check a teacher could read would stop being a self-check.
    const rubricFn = src.slice(src.indexOf('function renderRubric'), src.indexOf('function initExercises'));
    expect(rubricFn).not.toMatch(/ProgressStore|setItem|record\(/);
  });
});

describe('nothing about a written answer reaches a teacher as a score', () => {
  it('puts no overlap figure in the event payload', () => {
    const start = src.indexOf("note('answer.submitted'");
    const call = src.slice(start, src.indexOf('});', start));
    expect(call).not.toMatch(/overlap|similarity|score|matches/i);
  });

  it('records only the exercise and the attempt number', () => {
    const start = src.indexOf("note('answer.submitted'");
    const call = src.slice(start, src.indexOf('});', start));
    expect(call).toMatch(/exerciseId/);
    expect(call).toMatch(/attempt/);
  });

  it('is not in the event vocabulary at all', () => {
    new Function(fs.readFileSync('assets/js/events.js', 'utf8')).call(window);
    const built = window.PyPathEvents.makeEvent('answer.submitted', {
      lessonPath: '/units/unit-1/x.html', exerciseId: 'exercise1', attempt: 1, overlap: 0.9,
    });
    expect(Object.keys(built.payload).sort()).toEqual(['attempt', 'exerciseId', 'lessonPath']);
  });
});
