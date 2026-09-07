import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* Every control in a quiz has an accessible name.
 *
 * These are the flows where a wrong announcement costs a student marks. A
 * fill-the-blank bug of exactly this kind was found and fixed in 568dcad --
 * the legend repeated the whole code snippet, so the question was unusable by
 * ear -- and the audit asked for its siblings to be checked. This checks all
 * five kinds against one rule: a screen-reader user must be able to tell, from
 * what is announced alone, which control they are on and what it is for.
 */

let R;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/question-types.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/question-render.js', 'utf8')).call(window);
  R = window.PyPathQuestionRender;
});

/* The four kinds question-render.js owns. Plain single-answer MCQs predate
   this module and are still built inline by unit-test-page.js -- covered by
   its own group at the bottom of this file rather than pretended to be here,
   because render() returns null for them and a test that silently skipped
   would be worse than one that names where the code actually lives. */
const QUESTIONS = {
  multi: {
    id: 'q-multi', kind: 'multi', prompt: 'Which of these are sequence types?',
    choices: ['list', 'tuple', 'int', 'str'], answers: [0, 1, 3],
  },
  blank: {
    id: 'q-blank', kind: 'blank',
    prompt: 'Complete the line so it prints a greeting.',
    code: 'print(____)', blanks: ['"hello"'],
  },
  match: {
    // left/right, not pairs -- the shape renderMatch actually reads. The first
    // version of this fixture used `pairs` and rendered zero controls, which
    // looked exactly like a missing-label bug.
    id: 'q-match', kind: 'match', prompt: 'Match each function to what it returns.',
    left: ['len', 'type', 'str'],
    right: ['a length', 'a type', 'a string'],
    answer: [0, 1, 2],
  },
  order: {
    id: 'q-order', kind: 'order', prompt: 'Put these steps in order.',
    items: ['Write the code', 'Run it', 'Read the output'],
  },
};

/* The accessible name of a control, computed the way a screen reader would:
   aria-label, then aria-labelledby, then a wrapping or associated <label>,
   then the element's own text. A <legend> names the FIELDSET, not each control
   in it, so it is not counted here -- which is the point of the test. */
function accessibleName(el, root) {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();

  // jsdom has no CSS.escape; these ids are generated and alphanumeric, so a
  // plain attribute match is exact here and avoids depending on it.
  const byId = (id) => [...root.querySelectorAll('[id]')].find((n) => n.id === id);

  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const parts = by.split(/\s+/).map(byId).filter(Boolean)
      .map((n) => n.textContent.trim());
    if (parts.join(' ').trim()) return parts.join(' ').trim();
  }

  if (el.id) {
    const lab = [...root.querySelectorAll('label[for]')]
      .find((n) => n.getAttribute('for') === el.id);
    if (lab && lab.textContent.trim()) return lab.textContent.trim();
  }

  const wrapping = el.closest('label');
  if (wrapping && wrapping.textContent.trim()) return wrapping.textContent.trim();

  const own = (el.textContent || '').trim();
  if (own) return own;

  const title = el.getAttribute('title');
  return title && title.trim() ? title.trim() : '';
}

/* render() returns { node, read } -- a reader alongside the markup, so the
   page can pull an answer out without knowing the kind. The node is the half
   this file cares about. */
function render(kind) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const out = R.render(QUESTIONS[kind], 0);
  expect(out && out.node, `${kind}: render() produced no node`).toBeTruthy();
  host.appendChild(out.node);
  return host;
}

describe('the renderer is loaded', () => {
  it('exposes a render function', () => {
    expect(typeof R.render).toBe('function');
  });
});

describe('every control in every question kind has an accessible name', () => {
  for (const kind of Object.keys(QUESTIONS)) {
    it(kind, () => {
      const host = render(kind);
      const controls = [...host.querySelectorAll(
        'input:not([type=hidden]), select, textarea, button, [role=button]'
      )];
      expect(controls.length, `${kind} rendered no controls`).toBeGreaterThan(0);

      const nameless = controls
        .filter((el) => !accessibleName(el, host))
        .map((el) => `${el.tagName.toLowerCase()}[type=${el.type || '-'}]`);
      expect(nameless, `${kind}: controls announced as blank`).toEqual([]);
    });
  }
});

describe('the question itself is announced as the group label', () => {
  for (const kind of Object.keys(QUESTIONS)) {
    it(kind, () => {
      const host = render(kind);
      const set = host.querySelector('fieldset');
      expect(set, `${kind} has no fieldset`).toBeTruthy();
      const legend = set.querySelector('legend');
      expect(legend, `${kind} has no legend`).toBeTruthy();
      expect(legend.textContent.trim().length).toBeGreaterThan(4);
    });
  }
});

describe('a fill-the-blank does not read its whole snippet as the question', () => {
  /* The bug fixed in 568dcad, pinned so it cannot come back: the legend
     carried the entire code block, so a screen-reader user heard the snippet
     read out as the question and then had to find the input by touch. */
  it('the legend is the prompt, not the code', () => {
    const host = render('blank');
    const legend = host.querySelector('legend').textContent;
    expect(legend).toContain('Complete the line');
    expect(legend).not.toContain('print(____)');
  });

  it('and each input is named separately from the legend', () => {
    const host = render('blank');
    const inputs = [...host.querySelectorAll('input[type=text], input:not([type])')];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(accessibleName(input, host).length).toBeGreaterThan(0);
    }
  });
});

describe('match and order, where position carries the meaning', () => {
  it('a match control names what it is matching, not just "combo box"', () => {
    /* A match question renders one <select> per left-hand item. Nine selects
       announced as "combo box" with no further name is unusable by ear: the
       student can hear the options but not what they are options FOR. */
    const host = render('match');
    const selects = [...host.querySelectorAll('select')];
    expect(selects.length, 'match rendered no selects').toBeGreaterThan(0);
    for (const sel of selects) {
      expect(accessibleName(sel, host).length,
        'a match select announced as blank').toBeGreaterThan(0);
    }
  });

  it('an order control is not announced by position alone', () => {
    // "1", "2", "3" tells a screen-reader user nothing about what they are
    // ordering.
    const host = render('order');
    const controls = [...host.querySelectorAll('button, select, [role=button]')];
    for (const c of controls) {
      const name = accessibleName(c, host);
      expect(name, 'an order control named only by its position').not.toMatch(/^\d+$/);
    }
  });
});

describe('plain MCQs, which are built by unit-test-page.js and not by the renderer', () => {
  /* Kept honest rather than skipped: question-render.js has no 'mcq' entry in
     RENDERERS, so render() returns null for one. The markup is built inline by
     the unit-test page, and it is the oldest question surface on the site --
     the one most likely to predate the conventions the others follow. */
  const src = fs.readFileSync('assets/js/unit-test-page.js', 'utf8');

  it('each choice is a real label bound to its input', () => {
    // label[for] + input[id] is what makes a radio announce its own choice
    // text rather than "radio button, blank".
    expect(src).toContain("label.setAttribute('for', id)");
    expect(src).toContain('input.id = id;');
  });

  it('the radios in one question share a name, so they are one group', () => {
    expect(src).toMatch(/input\.name = 'ut-q' \+ qi/);
  });

  it('the choice text is inside the label', () => {
    expect(src).toContain("label.appendChild(el('span', 'ut-choice__text', choice))");
  });

  it('and the question is a fieldset', () => {
    expect(src).toMatch(/createElement\('fieldset'\)|el\('fieldset'/);
  });
});
