import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  const src = fs.readFileSync('assets/js/storage-keys.js', 'utf8');
  new Function(src).call(window);
});

describe('isSyncable', () => {
  it('accepts completed units', () => {
    expect(window.PyPathKeys.isSyncable('pypath-completed-units')).toBe(true);
  });

  it('accepts lesson code keys', () => {
    expect(
      window.PyPathKeys.isSyncable('pypath-lesson-/units/unit-1/first-program.html-editor-1')
    ).toBe(true);
  });

  it('accepts exercise answer keys', () => {
    expect(
      window.PyPathKeys.isSyncable('exercise_/units/unit-2/if-statement.html_q3')
    ).toBe(true);
  });

  it('rejects device-local preference keys', () => {
    ['pypath-theme',
     'pypath-fontscale',
     'pypath-sidebar-closed',
     'pypath-inspire-banner-dismissed',
     'pypath-sandbox-projects'].forEach((k) => {
      expect(window.PyPathKeys.isSyncable(k)).toBe(false);
    });
  });

  it('rejects unknown future pypath keys by default', () => {
    expect(window.PyPathKeys.isSyncable('pypath-some-new-feature')).toBe(false);
  });

  it('exports the completed-units key it matches on', () => {
    expect(window.PyPathKeys.COMPLETED_UNITS_KEY).toBe('pypath-completed-units');
    expect(window.PyPathKeys.isSyncable(window.PyPathKeys.COMPLETED_UNITS_KEY)).toBe(true);
  });
});

describe('toDocId', () => {
  it('replaces every slash so the id is a legal Firestore doc id', () => {
    const id = window.PyPathKeys.toDocId('pypath-lesson-/units/unit-1/a.html-editor-1');
    expect(id).toBe('pypath-lesson-__units__unit-1__a.html-editor-1');
    expect(id).not.toContain('/');
  });

  it('escapes underscores in the source key', () => {
    const id = window.PyPathKeys.toDocId('exercise_/units/unit-1/a.html_q1');
    expect(id).toBe('exercise_5F__units__unit-1__a.html_5Fq1');
    expect(id).not.toContain('/');
  });

  it('round-trips distinct keys to distinct ids', () => {
    const a = window.PyPathKeys.toDocId('exercise_/units/unit-1/a.html_q1');
    const b = window.PyPathKeys.toDocId('exercise_/units/unit-1/b.html_q1');
    expect(a).not.toBe(b);
  });

  it('does not collide when a path segment contains an underscore', () => {
    // Without escaping, both of these would encode to the same document id.
    const withUnderscore = window.PyPathKeys.toDocId('pypath-lesson-/units/unit_1/a.html-editor-1');
    const withSlash = window.PyPathKeys.toDocId('pypath-lesson-/units/unit/1/a.html-editor-1');
    expect(withUnderscore).not.toBe(withSlash);
  });

  it('never produces an id that Firestore reserves', () => {
    // Firestore rejects ids matching __.*__ , and ids of "." or "..".
    ['pypath-completed-units',
     'pypath-lesson-/units/unit-1/a.html-editor-1',
     'exercise_/units/unit-1/a.html_q1'].forEach((key) => {
      const id = window.PyPathKeys.toDocId(key);
      expect(id).not.toMatch(/^__.*__$/);
      expect(id).not.toBe('.');
      expect(id).not.toBe('..');
    });
  });
});
