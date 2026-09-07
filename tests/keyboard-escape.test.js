import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Every code editor on the site can be left with the keyboard.
 *
 * WCAG 2.1.2 (No Keyboard Trap): if focus can be moved into a component with
 * the keyboard, it must be possible to move it out with the keyboard, and the
 * user must be advised of the method if it is not a plain Tab.
 *
 * All three editors here bind Tab to indentation, which is correct for writing
 * Python and makes every one of them a trap without an advertised exit.
 * Measured before the fix: a keyboard walk of the homepage stopped at the hero
 * editor and never reached the eight controls below it -- the entire footer --
 * and a lesson page stopped at the first of its exercises.
 *
 * scripts/verify-keyboard.mjs walks the real tab order in a browser and is the
 * authority. These are the cheap checks that keep the contract from being
 * quietly removed.
 */

const FILES = {
  'lesson-runner.js': 'assets/js/lesson-runner.js',
  'sandbox.js': 'assets/js/sandbox.js',
  'hero-editor.js': 'assets/js/hero-editor.js',
};

describe('every editor advertises its escape in its accessible name', () => {
  for (const [name, path] of Object.entries(FILES)) {
    it(name, () => {
      /* The advertisement is the half people forget. An escape nobody is told
         about does not satisfy 2.1.2 and does not help anyone. */
      expect(fs.readFileSync(path, 'utf8')).toContain('Press Escape to leave the editor');
    });
  }
});

describe('every editor actually binds Escape', () => {
  it('the CodeMirror editors bind it through extraKeys', () => {
    for (const path of [FILES['lesson-runner.js'], FILES['sandbox.js']]) {
      const src = fs.readFileSync(path, 'utf8');
      expect(src, path).toContain('function makeEscapable');
      expect(src, path).toMatch(/Esc: function/);
      expect(src, path).toContain('makeEscapable(');
    }
  });

  it('the hero textarea handles it in its keydown', () => {
    const src = fs.readFileSync(FILES['hero-editor.js'], 'utf8');
    expect(src).toContain("if (e.key === 'Escape')");
  });
});

describe('the escape moves focus on, rather than only blurring', () => {
  /* A bare blur() drops the visitor at the top of the document on their next
     Tab, which is a worse place to be than the editor they were trying to
     leave -- they would have to walk the whole page again to get past it. */
  for (const [name, path] of Object.entries(FILES)) {
    it(name, () => {
      const src = fs.readFileSync(path, 'utf8');
      expect(src, name).toMatch(/next\.focus\(\)/);
      expect(src, name).toMatch(/all\.indexOf\(/);
    });
  }
});

describe('Tab still indents, because that is what a code editor should do', () => {
  it('the CodeMirror editors keep their Tab binding', () => {
    // The fix adds an exit; it does not take away the reason the trap existed.
    expect(fs.readFileSync(FILES['sandbox.js'], 'utf8')).toMatch(/Tab: \(cm\) =>/);
  });

  it('the hero editor keeps inserting four spaces', () => {
    const src = fs.readFileSync(FILES['hero-editor.js'], 'utf8');
    expect(src).toContain("if (e.key === 'Tab')");
    expect(src).toContain("'    '");
  });
});

describe('a lesson editor is named for its own exercise', () => {
  it('takes its label from the nearest heading', () => {
    // Four editors on one page must be four distinct things to a screen
    // reader, not four "Code editor"s.
    const src = fs.readFileSync(FILES['lesson-runner.js'], 'utf8');
    expect(src).toContain("'Code editor: ' + heading.textContent.trim()");
  });
});
