import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/username.js', 'utf8')).call(window);
});

describe('constants', () => {
  it('exposes the length cap', () => {
    expect(window.PyPathUsername.MAX_PART).toBe(40);
  });

  it('exposes the reserved list', () => {
    const reserved = window.PyPathUsername.RESERVED;
    expect(Array.isArray(reserved)).toBe(true);
    ['admin', 'root', 'support', 'help', 'pypath', 'moderator', 'mod', 'staff', 'system', 'api']
      .forEach(function (name) { expect(reserved).toContain(name); });
  });
});

describe('normalizePart', () => {
  it('trims surrounding whitespace', () => {
    expect(window.PyPathUsername.normalizePart('   Ada   ')).toBe('Ada');
  });

  it('collapses interior whitespace', () => {
    expect(window.PyPathUsername.normalizePart('van    Beethoven')).toBe('van Beethoven');
  });

  it('collapses tabs and newlines', () => {
    expect(window.PyPathUsername.normalizePart('\t Ada \n Lovelace ')).toBe('Ada Lovelace');
  });

  it('preserves capitalization exactly', () => {
    expect(window.PyPathUsername.normalizePart('McDonald')).toBe('McDonald');
    expect(window.PyPathUsername.normalizePart('van Beethoven')).toBe('van Beethoven');
    expect(window.PyPathUsername.normalizePart('LOVELACE')).toBe('LOVELACE');
  });

  it('returns empty string for non-strings', () => {
    expect(window.PyPathUsername.normalizePart(null)).toBe('');
    expect(window.PyPathUsername.normalizePart(undefined)).toBe('');
    expect(window.PyPathUsername.normalizePart(42)).toBe('');
    expect(window.PyPathUsername.normalizePart({})).toBe('');
  });
});

describe('format', () => {
  it('joins first and last with a single space', () => {
    expect(window.PyPathUsername.format('Ada', 'Lovelace')).toBe('Ada Lovelace');
  });

  it('trims each part before joining', () => {
    expect(window.PyPathUsername.format('  Vihaan ', ' Krishna ')).toBe('Vihaan Krishna');
  });

  it('keeps a multi-word family name intact', () => {
    expect(window.PyPathUsername.format('Ludwig', 'van Beethoven')).toBe('Ludwig van Beethoven');
  });

  it('does not title-case', () => {
    expect(window.PyPathUsername.format('Ronald', 'McDonald')).toBe('Ronald McDonald');
    expect(window.PyPathUsername.format('ada', 'lovelace')).toBe('ada lovelace');
  });

  it('returns empty string when either part is missing', () => {
    expect(window.PyPathUsername.format('', 'Lovelace')).toBe('');
    expect(window.PyPathUsername.format('Ada', '')).toBe('');
    expect(window.PyPathUsername.format(null, undefined)).toBe('');
  });
});

describe('validate', () => {
  it('accepts a plain first and last name', () => {
    expect(window.PyPathUsername.validate('Ada', 'Lovelace')).toEqual({ ok: true, error: null });
  });

  it('accepts a name that only becomes valid after trimming', () => {
    expect(window.PyPathUsername.validate('  Ada  ', ' Lovelace ')).toEqual({ ok: true, error: null });
  });

  it('accepts accented letters', () => {
    expect(window.PyPathUsername.validate('Ana Sofía', 'García').ok).toBe(true);
    expect(window.PyPathUsername.validate('Zoë', 'Müller').ok).toBe(true);
  });

  it('accepts non-Latin scripts', () => {
    expect(window.PyPathUsername.validate('妍', '李').ok).toBe(true);
    expect(window.PyPathUsername.validate('Дмитрий', 'Иванов').ok).toBe(true);
  });

  it('accepts hyphens and apostrophes', () => {
    expect(window.PyPathUsername.validate('Anne-Marie', "O'Brien").ok).toBe(true);
    expect(window.PyPathUsername.validate('Anne-Marie', 'O’Brien').ok).toBe(true);
  });

  it('accepts a multi-word family name', () => {
    expect(window.PyPathUsername.validate('Ludwig', 'van Beethoven').ok).toBe(true);
  });

  it('accepts an initial with a period', () => {
    expect(window.PyPathUsername.validate('J. Robert', 'Oppenheimer').ok).toBe(true);
  });

  it('rejects a missing first name', () => {
    expect(window.PyPathUsername.validate('', 'Lovelace')).toEqual({
      ok: false, error: 'Enter your first name.'
    });
    expect(window.PyPathUsername.validate('   ', 'Lovelace').error).toBe('Enter your first name.');
  });

  it('rejects a missing last name', () => {
    expect(window.PyPathUsername.validate('Ada', '')).toEqual({
      ok: false, error: 'Enter your last name.'
    });
    expect(window.PyPathUsername.validate('Ada', '  ').error).toBe('Enter your last name.');
  });

  it('rejects non-string parts', () => {
    expect(window.PyPathUsername.validate(null, undefined).error).toBe('Enter your first name.');
    expect(window.PyPathUsername.validate(42, 7).error).toBe('Enter your first name.');
  });

  it('accepts exactly 40 characters per part', () => {
    expect(window.PyPathUsername.validate('a'.repeat(40), 'b'.repeat(40)).ok).toBe(true);
  });

  it('rejects 41 characters in the first name', () => {
    expect(window.PyPathUsername.validate('a'.repeat(41), 'Lovelace')).toEqual({
      ok: false, error: 'First name is at most 40 characters.'
    });
  });

  it('rejects 41 characters in the last name', () => {
    expect(window.PyPathUsername.validate('Ada', 'b'.repeat(41))).toEqual({
      ok: false, error: 'Last name is at most 40 characters.'
    });
  });

  it('rejects digits', () => {
    expect(window.PyPathUsername.validate('Ada2', 'Lovelace')).toEqual({
      ok: false, error: 'Names use letters, spaces, hyphens, and apostrophes only.'
    });
  });

  it('rejects underscores, which the old handle format allowed', () => {
    expect(window.PyPathUsername.validate('ada_99', 'lovelace').error)
      .toBe('Names use letters, spaces, hyphens, and apostrophes only.');
  });

  it('rejects punctuation and symbols', () => {
    expect(window.PyPathUsername.validate('Ada!', 'Lovelace').error)
      .toBe('Names use letters, spaces, hyphens, and apostrophes only.');
    expect(window.PyPathUsername.validate('Ada@home', 'Lovelace').error)
      .toBe('Names use letters, spaces, hyphens, and apostrophes only.');
  });

  it('rejects a part that does not start with a letter', () => {
    expect(window.PyPathUsername.validate("'Ada", 'Lovelace').error)
      .toBe('Names use letters, spaces, hyphens, and apostrophes only.');
    expect(window.PyPathUsername.validate('-Ada', 'Lovelace').error)
      .toBe('Names use letters, spaces, hyphens, and apostrophes only.');
  });

  it('bounds the joined name through the per-part caps', () => {
    const longest = window.PyPathUsername.format('a'.repeat(40), 'b'.repeat(40));
    expect(longest.length).toBe(81);
    expect(window.PyPathUsername.validate('a'.repeat(40), 'b'.repeat(40) + 'c').error)
      .toBe('Last name is at most 40 characters.');
  });

  it('rejects a reserved first name', () => {
    expect(window.PyPathUsername.validate('Admin', 'Smith')).toEqual({
      ok: false, error: 'That name is reserved.'
    });
  });

  it('rejects a reserved last name', () => {
    expect(window.PyPathUsername.validate('Jane', 'PyPath')).toEqual({
      ok: false, error: 'That name is reserved.'
    });
  });

  it('rejects reserved names case-insensitively', () => {
    expect(window.PyPathUsername.validate('ADMIN', 'Smith').error).toBe('That name is reserved.');
    expect(window.PyPathUsername.validate('  root  ', 'Smith').error).toBe('That name is reserved.');
  });

  it('rejects every listed reserved name in either position', () => {
    window.PyPathUsername.RESERVED.forEach(function (name) {
      expect(window.PyPathUsername.validate(name, 'Smith').error).toBe('That name is reserved.');
      expect(window.PyPathUsername.validate('Jane', name).error).toBe('That name is reserved.');
    });
  });

  it('reports missing parts before length', () => {
    expect(window.PyPathUsername.validate('', 'b'.repeat(41)).error).toBe('Enter your first name.');
  });

  it('reports length before charset', () => {
    expect(window.PyPathUsername.validate('1'.repeat(41), 'Lovelace').error)
      .toBe('First name is at most 40 characters.');
  });

  it('reports charset before reserved', () => {
    expect(window.PyPathUsername.validate('admin9', 'Smith').error)
      .toBe('Names use letters, spaces, hyphens, and apostrophes only.');
  });
});
