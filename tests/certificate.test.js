import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  // The renderer half bails on any page that is not certificate.html, so
  // loading the file here exercises only the pure rules.
  new Function(fs.readFileSync('assets/js/certificate.js', 'utf8')).call(window);
});

const C = () => window.PyPathCertificate;

describe('isCourseComplete', () => {
  it('is true for all ten units', () => {
    expect(C().isCourseComplete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(true);
  });

  it('ignores order', () => {
    expect(C().isCourseComplete([10, 3, 1, 2, 9, 4, 5, 8, 6, 7])).toBe(true);
  });

  it('tolerates duplicates', () => {
    expect(C().isCourseComplete([1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10])).toBe(true);
  });

  it('accepts numeric strings, matching ProgressStore coercion', () => {
    expect(C().isCourseComplete(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])).toBe(true);
  });

  it('is false when one unit is missing', () => {
    expect(C().isCourseComplete([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(false);
    expect(C().isCourseComplete([2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(C().isCourseComplete([])).toBe(false);
  });

  it('is false for non-arrays', () => {
    [null, undefined, 'all', 10, {}].forEach((v) => {
      expect(C().isCourseComplete(v)).toBe(false);
    });
  });

  it('does not count out-of-range units toward completion', () => {
    expect(C().isCourseComplete([1, 2, 3, 4, 5, 6, 7, 8, 9, 11])).toBe(false);
    expect(C().isCourseComplete([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(false);
  });
});

describe('remainingUnits', () => {
  it('lists nothing when complete', () => {
    expect(C().remainingUnits([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([]);
  });

  it('lists every unit when nothing is done', () => {
    expect(C().remainingUnits([])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('lists the gaps in ascending order', () => {
    expect(C().remainingUnits([10, 2, 5])).toEqual([1, 3, 4, 6, 7, 8, 9]);
  });

  it('ignores junk entries', () => {
    expect(C().remainingUnits([1, 99, 'x', null, 2])).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('certificateName', () => {
  it('uses the account display name', () => {
    expect(C().certificateName({ displayName: 'Ada Lovelace' })).toBe('Ada Lovelace');
  });

  it('trims and collapses whitespace', () => {
    expect(C().certificateName({ displayName: '  Ada   Lovelace  ' })).toBe('Ada Lovelace');
  });

  it('never falls back to email or uid', () => {
    expect(C().certificateName({ email: 'ada@example.com', uid: 'abc123' })).toBe('');
    expect(C().certificateName({ displayName: '', email: 'ada@example.com' })).toBe('');
  });

  it('returns empty for a missing user', () => {
    expect(C().certificateName(null)).toBe('');
    expect(C().certificateName(undefined)).toBe('');
  });
});

describe('formatDate', () => {
  it('formats a timestamp as a long date', () => {
    expect(C().formatDate(Date.parse('2026-08-19T12:00:00'))).toBe('August 19, 2026');
  });

  it('does not zero-pad the day', () => {
    expect(C().formatDate(Date.parse('2026-01-05T12:00:00'))).toBe('January 5, 2026');
  });

  it('returns empty for junk', () => {
    [null, undefined, 'yesterday', NaN, {}].forEach((v) => {
      expect(C().formatDate(v)).toBe('');
    });
  });
});

describe('fileName', () => {
  it('slugifies a plain name', () => {
    expect(C().fileName('Ada Lovelace')).toBe('PyPath-Certificate-Ada-Lovelace');
  });

  it('strips accents rather than dropping the letters', () => {
    expect(C().fileName('Ana Sofía García')).toBe('PyPath-Certificate-Ana-Sofia-Garcia');
  });

  it('collapses punctuation into single hyphens', () => {
    expect(C().fileName("Anne-Marie O'Brien")).toBe('PyPath-Certificate-Anne-Marie-O-Brien');
  });

  it('falls back to Learner when nothing usable survives', () => {
    expect(C().fileName('')).toBe('PyPath-Certificate-Learner');
    expect(C().fileName('***')).toBe('PyPath-Certificate-Learner');
    expect(C().fileName(null)).toBe('PyPath-Certificate-Learner');
  });

  it('never leaves a path separator in the filename', () => {
    expect(C().fileName('Ada/../Lovelace')).not.toContain('/');
  });
});
