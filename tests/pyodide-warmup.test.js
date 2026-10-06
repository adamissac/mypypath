import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

/* scheduleWarmup used to treat "no editor on the page" as "warm now",
 * which is right for the unit test (it builds the editor later) and
 * wrong for a course landing that inherited pyodide-loader.js. */

function loadLoader() {
  new Function(fs.readFileSync('assets/js/pyodide-loader.js', 'utf8')).call(window);
}

describe('scheduleWarmup without an editor', () => {
  let idle;

  beforeEach(() => {
    idle = vi.fn();
    window.requestIdleCallback = idle;
    window.IntersectionObserver = function () {
      this.observe = vi.fn();
      this.disconnect = vi.fn();
    };
    document.body.className = '';
    document.body.innerHTML = '<main></main>';
    loadLoader();
  });

  afterEach(() => {
    delete window.Pyodide;
    delete window.requestIdleCallback;
    delete window.IntersectionObserver;
  });

  it('does not fetch Pyodide on a page with nothing to run', () => {
    window.Pyodide.scheduleWarmup();
    expect(idle).not.toHaveBeenCalled();
  });

  it('still warms the unit test, which builds its editor later', () => {
    document.body.className = 'page page-unit-test';
    window.Pyodide.scheduleWarmup();
    expect(idle).toHaveBeenCalled();
  });
});
