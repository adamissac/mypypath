import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

/* A unit page, which is a list of lesson titles rather than a lesson.

   In its own file on purpose. lesson-progress.js is re-instantiated per boot in
   these suites and every instance keeps its listeners on document, so a suite
   that has already booted a lesson page has instances that still believe they
   are on one -- and one of the things a locked lesson page now does is take the
   page's content away. Nothing here shares a document with a lesson boot. */

const SRC = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');

beforeAll(() => {
  ['storage-keys', 'progress-store', 'roles', 'curriculum', 'classroom-policy'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

function policyArrives(value) {
  document.dispatchEvent(new CustomEvent('pypath:policy', { detail: { policy: value } }));
}

const LOCKED = { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [] };

describe('a unit listing still names the units', () => {
  /* The distinction this pins, made on purpose rather than by accident: the
     lesson's content is what a lock takes away. A unit's title is not content
     -- it is how a student knows what is ahead of them and what to ask their
     teacher about, and it is how "By hand" mode's own unlock panel talks about
     units already. So a unit page keeps its list and gets the screen as a
     notice above it. */
  it('keeps its lesson list and adds the screen above it', () => {
    history.pushState({}, '', '/units/unit-2.html');
    document.body.innerHTML = `
      <main>
        <h1 class="page-title">Unit 2: Control Flow</h1>
        <ol class="unit-lesson-list">
          <li><a class="route" href="/units/unit-2/understanding-control-flow.html">1. Control flow</a></li>
        </ol>
      </main>`;
    new Function(SRC).call(window);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    policyArrives(LOCKED);

    const screen = document.querySelector('.unit-lock-screen');
    expect(screen).not.toBe(null);
    // Nothing was taken off this page, and the copy says so rather than
    // claiming a lesson was hidden.
    expect(screen.getAttribute('data-lesson-hidden')).toBe('false');
    expect(document.querySelectorAll('.unit-lesson-list a').length).toBe(1);
    expect(document.body.textContent).toMatch(/1\. Control flow/);
  });
});
