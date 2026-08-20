import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let R;
let signup;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/roles.js', 'utf8')).call(window);
  R = window.PyPathRoles;
  signup = fs.readFileSync('signup.html', 'utf8');
});

describe('normalizeRole', () => {
  it('keeps each known role', () => {
    R.ROLES.forEach((role) => expect(R.normalizeRole(role)).toBe(role));
  });

  // Every account that existed before roles shipped has no role field, and
  // those accounts must keep behaving exactly as they did.
  it('treats a missing or unknown role as personal', () => {
    [undefined, null, '', 'admin', 'TEACHER', 42, {}].forEach((v) => {
      expect(R.normalizeRole(v)).toBe('personal');
    });
  });
});

describe('normalizeCode', () => {
  it('uppercases and strips spaces and hyphens', () => {
    expect(R.normalizeCode(' abc-234 ')).toBe('ABC234');
    expect(R.normalizeCode('ab c2 34')).toBe('ABC234');
  });

  it('is empty for a non-string', () => {
    expect(R.normalizeCode(null)).toBe('');
    expect(R.normalizeCode(7)).toBe('');
  });
});

describe('isValidCode', () => {
  it('accepts a well-formed code in any casing', () => {
    expect(R.isValidCode('ABC234')).toBe(true);
    expect(R.isValidCode('abc234')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(R.isValidCode('ABC23')).toBe(false);
    expect(R.isValidCode('ABC2345')).toBe(false);
  });

  // O/0, I/1 and S/5 are excluded so a code read aloud or off a whiteboard
  // cannot be typed two ways.
  it('rejects the ambiguous glyphs left out of the alphabet', () => {
    ['ABC23O', 'ABC23I', 'ABC23S', 'ABC230', 'ABC231', 'ABC235'].forEach((c) => {
      expect(R.isValidCode(c)).toBe(false);
    });
  });

  it('rejects punctuation and empties', () => {
    expect(R.isValidCode('')).toBe(false);
    expect(R.isValidCode('ABC_34')).toBe(false);
  });
});

describe('generateCode', () => {
  it('produces a code that passes its own validator', () => {
    for (let i = 0; i < 200; i++) {
      expect(R.isValidCode(R.generateCode())).toBe(true);
    }
  });

  it('uses the injected randomness', () => {
    expect(R.generateCode(() => 0)).toBe('A'.repeat(R.CODE_LENGTH));
  });

  // Math.random() can return values arbitrarily close to 1; an off-by-one
  // there would index past the alphabet and put "undefined" in a code.
  it('stays inside the alphabet at the top of the range', () => {
    const code = R.generateCode(() => 0.9999999999);
    expect(R.isValidCode(code)).toBe(true);
    expect(code.length).toBe(R.CODE_LENGTH);
  });

  it('does not always return the same code', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(R.generateCode());
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('validateJoin', () => {
  it('ignores the code entirely for personal and teacher accounts', () => {
    expect(R.validateJoin('personal', 'garbage')).toEqual({ ok: true, code: '', error: null });
    expect(R.validateJoin('teacher', 'garbage')).toEqual({ ok: true, code: '', error: null });
  });

  // A student may sign up before the teacher has handed the code out; losing
  // the signup over a blank field would be the worse failure.
  it('lets a student sign up with no code at all', () => {
    expect(R.validateJoin('student', '')).toEqual({ ok: true, code: '', error: null });
    expect(R.validateJoin('student', '   ')).toEqual({ ok: true, code: '', error: null });
  });

  it('normalizes a good student code', () => {
    expect(R.validateJoin('student', 'abc-234').code).toBe('ABC234');
  });

  it('rejects a malformed student code', () => {
    const out = R.validateJoin('student', 'ABC2');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/join code/i);
  });
});

// The picker is only real if the page actually offers all three and wires the
// role through to the account that gets created.
describe('signup.html wiring', () => {
  it('offers all three roles', () => {
    R.ROLES.forEach((role) => {
      expect(signup).toContain(`value="${role}"`);
    });
  });

  it('defaults to a personal account', () => {
    expect(signup).toMatch(/value="personal"\s+checked/);
  });

  it('has a join code field for students', () => {
    expect(signup).toContain('id="signup-join-code"');
    expect(signup).toContain('data-role-join');
  });

  it('applies the role on both the email and the provider path', () => {
    const calls = signup.match(/await applyRole\(/g) || [];
    expect(calls.length).toBe(2);
  });

  it('loads roles.js', () => {
    expect(signup).toContain('/assets/js/roles.js');
  });
});
