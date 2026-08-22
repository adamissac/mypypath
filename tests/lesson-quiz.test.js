import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';

let Q;
const src = fs.readFileSync('assets/js/lesson-quiz.js', 'utf8');

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/events.js', 'utf8')).call(window);
  new Function(src).call(window);
  Q = window.PyPathQuiz;
});

beforeEach(() => {
  document.body.innerHTML = '';
  window.PyPathEvents.reset();
});

const QUESTION = {
  id: 'u1-first-1',
  prompt: 'What does print() actually do?',
  choices: ['Sends it to a printer', 'Writes the value to the output', 'Saves a file'],
  answer: 1,
  explain: 'print() writes to standard output.',
};

describe('rendering a question', () => {
  it('groups the choices in a fieldset with the prompt as its legend', () => {
    // Otherwise a screen reader reads four unrelated radio buttons with no
    // idea what they are answering.
    const node = Q.renderQuestion(QUESTION, 0);
    expect(node.querySelector('fieldset')).toBeTruthy();
    expect(node.querySelector('legend').textContent).toContain('What does print()');
  });

  it('numbers the question', () => {
    expect(Q.renderQuestion(QUESTION, 2).querySelector('legend').textContent).toMatch(/^3\./);
  });

  it('binds every label to its own input', () => {
    const node = Q.renderQuestion(QUESTION, 0);
    const inputs = node.querySelectorAll('input[type="radio"]');
    const labels = node.querySelectorAll('label');
    expect(inputs.length).toBe(3);
    expect(labels.length).toBe(3);
    inputs.forEach((input, i) => {
      expect(labels[i].getAttribute('for')).toBe(input.id);
      expect(input.name).toBe('quiz-u1-first-1');
    });
  });

  it('starts with no feedback shown', () => {
    expect(Q.renderQuestion(QUESTION, 0).querySelector('.quiz-feedback').hidden).toBe(true);
  });
});

describe('answering', () => {
  function answer(node, index) {
    const input = node.querySelectorAll('input[type="radio"]')[index];
    input.checked = true;
    input.dispatchEvent(new window.Event('change'));
    return node.querySelector('.quiz-feedback');
  }

  it('gives feedback the moment a choice is made', () => {
    const node = Q.renderQuestion(QUESTION, 0);
    document.body.appendChild(node);
    const feedback = answer(node, 1);
    expect(feedback.hidden).toBe(false);
    expect(feedback.textContent).toContain('Correct');
    expect(feedback.className).toContain('is-right');
  });

  it('marks a wrong answer without hiding the reason', () => {
    const node = Q.renderQuestion(QUESTION, 0);
    document.body.appendChild(node);
    const feedback = answer(node, 0);
    expect(feedback.textContent).toContain('Not quite');
    // The explanation is what makes a wrong answer worth anything.
    expect(feedback.textContent).toContain('standard output');
    expect(feedback.className).toContain('is-wrong');
  });

  it('carries the verdict in a mark and a word, not colour alone', () => {
    const node = Q.renderQuestion(QUESTION, 0);
    document.body.appendChild(node);
    expect(answer(node, 1).textContent).toMatch(/^✓ Correct/);
    const other = Q.renderQuestion(QUESTION, 0);
    document.body.appendChild(other);
    expect(answer(other, 0).textContent).toMatch(/^✕ Not quite/);
  });

  it('allows unlimited attempts', () => {
    const node = Q.renderQuestion(QUESTION, 0);
    document.body.appendChild(node);
    answer(node, 0);
    answer(node, 2);
    const feedback = answer(node, 1);
    expect(feedback.textContent).toContain('Correct');
    expect(node.querySelectorAll('input:disabled').length).toBe(0);
  });

  it('announces new feedback to a screen reader', () => {
    const node = Q.renderQuestion(QUESTION, 0);
    const feedback = node.querySelector('.quiz-feedback');
    expect(feedback.getAttribute('role')).toBe('status');
    expect(feedback.getAttribute('aria-live')).toBe('polite');
  });
});

describe('the check.answered event', () => {
  function answer(node, index) {
    const input = node.querySelectorAll('input[type="radio"]')[index];
    input.checked = true;
    input.dispatchEvent(new window.Event('change'));
  }

  it('records the question, the verdict and a rising attempt count', () => {
    window.PyPathEvents.setEnabled(true);
    const node = Q.renderQuestion({ ...QUESTION, id: 'q-count' }, 0);
    document.body.appendChild(node);
    answer(node, 0);
    answer(node, 1);
    const drained = window.PyPathEvents.drain();
    expect(drained.length).toBe(2);
    expect(drained[0].type).toBe('check.answered');
    expect(drained[0].payload.correct).toBe(false);
    expect(drained[0].payload.attempt).toBe(1);
    expect(drained[1].payload.correct).toBe(true);
    expect(drained[1].payload.attempt).toBe(2);
  });

  it('records nothing for a learner who is not in a class', () => {
    window.PyPathEvents.setEnabled(false);
    const node = Q.renderQuestion({ ...QUESTION, id: 'q-guest' }, 0);
    document.body.appendChild(node);
    answer(node, 1);
    expect(window.PyPathEvents.pending()).toBe(0);
  });

  it('puts no chosen answer text in the payload', () => {
    window.PyPathEvents.setEnabled(true);
    const node = Q.renderQuestion({ ...QUESTION, id: 'q-text' }, 0);
    document.body.appendChild(node);
    answer(node, 0);
    const [event] = window.PyPathEvents.drain();
    expect(Object.keys(event.payload).sort())
      .toEqual(['attempt', 'correct', 'lessonPath', 'questionId']);
  });
});

describe('the section on the page', () => {
  it('says the questions are not marked', () => {
    document.body.innerHTML = '<main></main>';
    Q.render([QUESTION]);
    const section = document.querySelector('.quiz');
    expect(section.textContent).toContain('not marked');
    expect(section.textContent).toContain('as many times as you like');
  });

  it('uses an h2, matching the lesson\'s other section headings', () => {
    document.body.innerHTML = '<main></main>';
    Q.render([QUESTION]);
    expect(document.querySelector('.quiz h2')).toBeTruthy();
    expect(document.querySelector('.quiz').getAttribute('aria-labelledby')).toBe('quiz-heading');
  });

  it('renders once even if asked twice', () => {
    document.body.innerHTML = '<main></main>';
    Q.render([QUESTION]);
    Q.render([QUESTION]);
    expect(document.querySelectorAll('.quiz').length).toBe(1);
  });

  it('is loaded on every lesson page, after the checker', () => {
    const page = fs.readFileSync('units/unit-1/first-program.html', 'utf8');
    expect(page).toContain('/assets/js/lesson-quiz.js');
    const pages = [];
    for (let u = 1; u <= 10; u += 1) {
      for (const n of fs.readdirSync(`units/unit-${u}`)) {
        if (n.endsWith('.html')) pages.push(`units/unit-${u}/${n}`);
      }
    }
    const missing = pages.filter(
      (p) => !fs.readFileSync(p, 'utf8').includes('/assets/js/lesson-quiz.js')
    );
    expect(missing).toEqual([]);
  });
});

describe('the authored questions for Units 1 and 2', () => {
  const files = [];
  for (const unit of ['unit-1', 'unit-2']) {
    for (const name of fs.readdirSync(`assets/data/checks/${unit}`)) {
      files.push([`${unit}/${name}`, JSON.parse(
        fs.readFileSync(`assets/data/checks/${unit}/${name}`, 'utf8')
      )]);
    }
  }

  it('validates, including every answer index and explanation', () => {
    expect(validateChecks().errors).toEqual([]);
  });

  it('covers every lesson in Units 1 and 2', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    for (const unit of [1, 2]) {
      const slugs = manifest.lessons.filter((l) => l.unit === unit).map((l) => l.slug);
      const authored = fs.readdirSync(`assets/data/checks/unit-${unit}`)
        .map((n) => n.replace(/\.json$/, ''));
      expect(slugs.filter((s) => !authored.includes(s)), `unit ${unit}`).toEqual([]);
    }
  });

  it('gives each lesson three to five questions', () => {
    for (const [name, spec] of files) {
      expect(spec.questions, name).toBeTruthy();
      expect(spec.questions.length, name).toBeGreaterThanOrEqual(3);
      expect(spec.questions.length, name).toBeLessThanOrEqual(5);
    }
  });

  it('uses a unique id for every question across both units', () => {
    const ids = files.flatMap(([, spec]) => spec.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not always put the answer in the same place', () => {
    // A quiz whose answer is always B is a quiz about noticing that.
    const positions = files.flatMap(([, spec]) => spec.questions.map((q) => q.answer));
    expect(new Set(positions).size).toBeGreaterThan(2);
  });

  it('explains every answer', () => {
    for (const [name, spec] of files) {
      for (const q of spec.questions) {
        expect(q.explain, `${name} / ${q.id}`).toBeTruthy();
        expect(q.explain.length, `${name} / ${q.id}`).toBeGreaterThan(25);
      }
    }
  });
});
