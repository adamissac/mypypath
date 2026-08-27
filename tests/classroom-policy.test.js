import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
});

const P = () => window.PyPathPolicy;

// Shorthand for the policy object class-policy.js hands over.
function policy(mode, manual, assigned) {
  return {
    mode: mode,
    manualUnlocks: manual || [],
    assignmentUnlocks: assigned || []
  };
}

describe('MODES', () => {
  it('names the three modes once, in order', () => {
    expect(P().MODES).toEqual(['sequential', 'manual', 'free']);
  });
});

describe('normalizeMode', () => {
  it('passes the three legal values through', () => {
    P().MODES.forEach((m) => expect(P().normalizeMode(m)).toBe(m));
  });

  it('falls back to sequential for anything else', () => {
    ['', 'SEQUENTIAL', 'open', 'freeroam', null, undefined, 0, {}, []].forEach((v) => {
      expect(P().normalizeMode(v)).toBe('sequential');
    });
  });
});

describe('resolveUnlocked with no policy', () => {
  // Guest, offline, blocked SDK, denied read and "in no class" are all this
  // case. It must be indistinguishable from the behaviour before this feature.
  it('reproduces the sequential rule exactly', () => {
    expect(P().resolveUnlocked(1, null, [], false)).toBe(true);
    expect(P().resolveUnlocked(2, null, [1], false)).toBe(true);
    expect(P().resolveUnlocked(2, null, [], false)).toBe(false);
    expect(P().resolveUnlocked(5, null, [1, 2, 3, 10], false)).toBe(false);
    expect(P().resolveUnlocked(3, null, ['2'], false)).toBe(true);
  });

  it('rejects junk unit numbers', () => {
    [0, -1, null, undefined, 'two', 1.5, NaN].forEach((v) => {
      expect(P().resolveUnlocked(v, null, [1, 2, 3], false)).toBe(false);
    });
  });
});

describe('resolveUnlocked for a teacher', () => {
  it('opens everything, in every mode, before any other check', () => {
    P().MODES.forEach((mode) => {
      for (let u = 1; u <= 10; u += 1) {
        expect(P().resolveUnlocked(u, policy(mode, [], []), [], true)).toBe(true);
      }
    });
  });

  it('opens everything even with no policy at all', () => {
    expect(P().resolveUnlocked(9, null, [], true)).toBe(true);
  });
});

describe('resolveUnlocked in sequential mode', () => {
  const seq = policy('sequential');

  it('behaves as the chain does today', () => {
    expect(P().resolveUnlocked(1, seq, [], false)).toBe(true);
    expect(P().resolveUnlocked(3, seq, [1, 2], false)).toBe(true);
    expect(P().resolveUnlocked(3, seq, [1], false)).toBe(false);
  });

  it('still opens a unit the teacher unlocked by hand', () => {
    expect(P().resolveUnlocked(7, policy('sequential', [7]), [], false)).toBe(true);
  });

  it('still opens a unit an assignment names', () => {
    expect(P().resolveUnlocked(7, policy('sequential', [], [7]), [], false)).toBe(true);
  });
});

describe('resolveUnlocked in manual mode', () => {
  // The teacher's list is the whole truth here. Additive-only overrides could
  // never re-lock a unit opened by mistake, which is half of what manual is for.
  it('closes a unit the chain would have opened', () => {
    expect(P().resolveUnlocked(3, policy('manual', [5]), [1, 2], false)).toBe(false);
  });

  it('opens exactly what the teacher listed', () => {
    const p = policy('manual', [5, 7]);
    expect(P().resolveUnlocked(5, p, [], false)).toBe(true);
    expect(P().resolveUnlocked(7, p, [], false)).toBe(true);
    expect(P().resolveUnlocked(6, p, [], false)).toBe(false);
  });

  it('still opens unit 1', () => {
    // A class that locked unit 1 has locked its students out of everything.
    expect(P().resolveUnlocked(1, policy('manual', []), [], false)).toBe(true);
  });

  it('opens a unit an assignment names even when it is not on the list', () => {
    expect(P().resolveUnlocked(6, policy('manual', [], [6]), [], false)).toBe(true);
  });

  it('tolerates numeric strings in the unlock list', () => {
    expect(P().resolveUnlocked(4, policy('manual', ['4']), [], false)).toBe(true);
  });
});

describe('resolveUnlocked in free mode', () => {
  it('opens every unit to every learner', () => {
    for (let u = 1; u <= 10; u += 1) {
      expect(P().resolveUnlocked(u, policy('free'), [], false)).toBe(true);
    }
  });
});

describe('resolveUnlocked with a mode it does not recognize', () => {
  it('falls back to sequential rather than opening everything', () => {
    const p = policy('nonsense');
    expect(P().resolveUnlocked(3, p, [1, 2], false)).toBe(true);
    expect(P().resolveUnlocked(3, p, [1], false)).toBe(false);
  });
});
