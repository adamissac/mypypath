import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

describe('join disclosure headings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div data-join-disclosure></div><div data-join-disclosure></div>';
    window.PyPathClassroom = {
      TEACHER_CAN_SEE: ['progress'],
      TEACHER_CANNOT_SEE: ['legal name'],
      RETENTION: { EVENT_DAYS: 30 },
    };
    new Function(fs.readFileSync('assets/js/join-disclosure.js', 'utf8')).call(window);
  });

  it('gives each panel a unique heading id', () => {
    const ids = [...document.querySelectorAll('.disclosure')]
      .map((n) => n.getAttribute('aria-labelledby'));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(document.getElementById(id), id).toBeTruthy();
    }
  });
});
