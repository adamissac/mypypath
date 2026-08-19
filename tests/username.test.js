import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/username.js', 'utf8')).call(window);
});

describe('constants', () => {
  it('exposes MIN and MAX', () => {
    expect(window.PyPathUsername.MIN).toBe(3);
    expect(window.PyPathUsername.MAX).toBe(20);
  });

  it('exposes the reserved list', () => {
    const reserved = window.PyPathUsername.RESERVED;
    expect(Array.isArray(reserved)).toBe(true);
    ['admin', 'root', 'support', 'help', 'pypath', 'moderator', 'mod', 'staff', 'system', 'api']
      .forEach(function (name) { expect(reserved).toContain(name); });
  });
});

describe('normalize', () => {
  it('lowercases mixed case', () => {
    expect(window.PyPathUsername.normalize('AdaLovelace')).toBe('adalovelace');
  });

  it('trims surrounding whitespace', () => {
    expect(window.PyPathUsername.normalize('   ada   ')).toBe('ada');
  });

  it('trims and lowercases together', () => {
    expect(window.PyPathUsername.normalize('\t  Ada_99 \n')).toBe('ada_99');
  });

  it('returns empty string for null', () => {
    expect(window.PyPathUsername.normalize(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(window.PyPathUsername.normalize(undefined)).toBe('');
  });

  it('returns empty string for a number', () => {
    expect(window.PyPathUsername.normalize(42)).toBe('');
  });

  it('returns empty string for an object', () => {
    expect(window.PyPathUsername.normalize({})).toBe('');
  });
});

describe('validate', () => {
  it('accepts a plain valid name', () => {
    expect(window.PyPathUsername.validate('ada')).toEqual({ ok: true, error: null });
  });

  it('accepts digits and an interior underscore', () => {
    expect(window.PyPathUsername.validate('ada_99')).toEqual({ ok: true, error: null });
  });

  it('accepts a name that only becomes valid after normalizing', () => {
    expect(window.PyPathUsername.validate('  Ada_Lovelace9 ')).toEqual({ ok: true, error: null });
  });

  it('rejects an empty string', () => {
    expect(window.PyPathUsername.validate('')).toEqual({ ok: false, error: 'Pick a username.' });
  });

  it('rejects whitespace only', () => {
    expect(window.PyPathUsername.validate('   ')).toEqual({ ok: false, error: 'Pick a username.' });
  });

  it('rejects null', () => {
    expect(window.PyPathUsername.validate(null)).toEqual({ ok: false, error: 'Pick a username.' });
  });

  it('rejects undefined', () => {
    expect(window.PyPathUsername.validate(undefined)).toEqual({ ok: false, error: 'Pick a username.' });
  });

  it('rejects a number', () => {
    expect(window.PyPathUsername.validate(12345)).toEqual({ ok: false, error: 'Pick a username.' });
  });

  it('rejects 2 characters as too short', () => {
    expect(window.PyPathUsername.validate('ab')).toEqual({
      ok: false, error: 'Usernames are at least 3 characters.'
    });
  });

  it('accepts exactly 3 characters', () => {
    expect(window.PyPathUsername.validate('abc').ok).toBe(true);
  });

  it('accepts exactly 20 characters', () => {
    expect(window.PyPathUsername.validate('a'.repeat(20)).ok).toBe(true);
  });

  it('rejects 21 characters as too long', () => {
    expect(window.PyPathUsername.validate('a'.repeat(21))).toEqual({
      ok: false, error: 'Usernames are at most 20 characters.'
    });
  });

  it('rejects a hyphen', () => {
    expect(window.PyPathUsername.validate('ada-lovelace')).toEqual({
      ok: false, error: 'Use letters, numbers, and underscores only.'
    });
  });

  it('rejects interior whitespace', () => {
    expect(window.PyPathUsername.validate('ada lovelace')).toEqual({
      ok: false, error: 'Use letters, numbers, and underscores only.'
    });
  });

  it('rejects punctuation and symbols', () => {
    expect(window.PyPathUsername.validate('ada!').error)
      .toBe('Use letters, numbers, and underscores only.');
    expect(window.PyPathUsername.validate('ada@home').error)
      .toBe('Use letters, numbers, and underscores only.');
    expect(window.PyPathUsername.validate('adá').error)
      .toBe('Use letters, numbers, and underscores only.');
  });

  it('rejects a leading underscore', () => {
    expect(window.PyPathUsername.validate('_ada')).toEqual({
      ok: false, error: 'Usernames cannot start or end with an underscore.'
    });
  });

  it('rejects a trailing underscore', () => {
    expect(window.PyPathUsername.validate('ada_')).toEqual({
      ok: false, error: 'Usernames cannot start or end with an underscore.'
    });
  });

  it('rejects underscores on both ends', () => {
    expect(window.PyPathUsername.validate('_ada_')).toEqual({
      ok: false, error: 'Usernames cannot start or end with an underscore.'
    });
  });

  it('rejects a reserved name', () => {
    expect(window.PyPathUsername.validate('admin')).toEqual({
      ok: false, error: 'That username is reserved.'
    });
  });

  it('rejects reserved names case-insensitively', () => {
    expect(window.PyPathUsername.validate('ADMIN')).toEqual({
      ok: false, error: 'That username is reserved.'
    });
    expect(window.PyPathUsername.validate('  PyPath ')).toEqual({
      ok: false, error: 'That username is reserved.'
    });
  });

  it('rejects every listed reserved name', () => {
    window.PyPathUsername.RESERVED.forEach(function (name) {
      expect(window.PyPathUsername.validate(name).error).toBe('That username is reserved.');
    });
  });

  it('reports the first failure in order: empty before length', () => {
    expect(window.PyPathUsername.validate('  ').error).toBe('Pick a username.');
  });

  it('reports length before charset', () => {
    expect(window.PyPathUsername.validate('a-').error)
      .toBe('Usernames are at least 3 characters.');
    expect(window.PyPathUsername.validate('a-'.repeat(11)).error)
      .toBe('Usernames are at most 20 characters.');
  });

  it('reports charset before underscore edges', () => {
    expect(window.PyPathUsername.validate('_ada-b').error)
      .toBe('Use letters, numbers, and underscores only.');
  });

  it('reports underscore edges before reserved', () => {
    expect(window.PyPathUsername.validate('_admin_').error)
      .toBe('Usernames cannot start or end with an underscore.');
  });
});
