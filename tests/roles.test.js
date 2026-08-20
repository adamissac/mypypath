import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
  it('treats a missing or unknown role as student', () => {
    [undefined, null, '', 'admin', 'TEACHER', 42, {}].forEach((v) => {
      expect(R.normalizeRole(v)).toBe('student');
    });
  });

  // `personal` was the role's old name; existing production accounts still
  // carry it and must keep behaving like an unattached student.
  it('maps the legacy personal role to student', () => {
    expect(R.normalizeRole('personal')).toBe('student');
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
  it('ignores the code entirely for teacher accounts', () => {
    expect(R.validateJoin('teacher', 'garbage')).toEqual({ ok: true, code: '', error: null });
  });

  // `personal` normalizes to `student` now, so a legacy caller passing it
  // still gets the student code path rather than being silently ignored.
  it('validates the code for the legacy personal role like a student', () => {
    expect(R.validateJoin('personal', 'abc-234').code).toBe('ABC234');
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

// The picker is only real if the page actually offers exactly the two roles
// and wires the role through to the account that gets created.
describe('signup.html wiring', () => {
  it('offers exactly two role options', () => {
    const inputs = signup.match(/<input type="radio" name="signup-role"/g) || [];
    expect(inputs.length).toBe(2);
    R.ROLES.forEach((role) => {
      expect(signup).toContain(`value="${role}"`);
    });
  });

  it('defaults to a student account', () => {
    expect(signup).toMatch(/value="student"\s+checked/);
  });

  it('drops the legacy personal role', () => {
    expect(signup).not.toContain('value="personal"');
  });

  it('has no join-code entry at signup', () => {
    expect(signup).not.toContain('id="signup-join-code"');
    expect(signup).not.toContain('data-role-join');
  });

  it('applies the role on both the email and the provider path', () => {
    const calls = signup.match(/await applyRole\(/g) || [];
    expect(calls.length).toBe(2);
  });

  it('loads roles.js', () => {
    expect(signup).toContain('/assets/js/roles.js');
  });
});

describe('isTeacher', () => {
  it('is true only for the teacher role', () => {
    expect(R.isTeacher('teacher')).toBe(true);
    expect(R.isTeacher('student')).toBe(false);
  });

  it('normalizes before deciding, so no legacy value reads as a teacher', () => {
    ['personal', '', null, undefined, 'TEACHER', 'admin', 42].forEach((v) => {
      expect(R.isTeacher(v)).toBe(false);
    });
  });
});

describe('session role', () => {
  beforeEach(() => {
    sessionStorage.clear();
    delete document.documentElement.dataset.role;
  });

  it('defaults to student when nothing has been remembered', () => {
    expect(R.lastKnownRole()).toBe('student');
    expect(R.teachingNow()).toBe(false);
  });

  it('round-trips a remembered role', () => {
    expect(R.rememberRole('teacher')).toBe('teacher');
    expect(R.lastKnownRole()).toBe('teacher');
    expect(R.teachingNow()).toBe(true);
  });

  it('stamps the role onto the document for CSS', () => {
    R.rememberRole('teacher');
    expect(document.documentElement.dataset.role).toBe('teacher');
    R.rememberRole('student');
    expect(document.documentElement.dataset.role).toBe('student');
  });

  // The gating scripts read this before auth resolves; a junk value there must
  // fall back to the strictest role, not the most permissive one.
  it('normalizes whatever it finds in storage', () => {
    sessionStorage.setItem(R.SESSION_KEY, 'headmaster');
    expect(R.lastKnownRole()).toBe('student');
    sessionStorage.setItem(R.SESSION_KEY, 'personal');
    expect(R.lastKnownRole()).toBe('student');
  });

  it('normalizes on the way in as well', () => {
    expect(R.rememberRole('headmaster')).toBe('student');
    expect(sessionStorage.getItem(R.SESSION_KEY)).toBe('student');
  });
});
