import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let ACT;

beforeAll(() => {
  const src = fs.readFileSync('assets/js/activity-core.js', 'utf8');
  new Function(src).call(window);
  ACT = window.PyPathActivity;
});

describe('dayKey', () => {
  it('formats a local calendar day as YYYY-MM-DD', () => {
    const ts = new Date(2026, 7, 19, 13, 30).getTime(); // 19 Aug 2026, local
    expect(ACT.dayKey(ts)).toBe('2026-08-19');
  });

  it('zero-pads single-digit months and days', () => {
    expect(ACT.dayKey(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });

  it('returns an empty string for a nonsense timestamp', () => {
    expect(ACT.dayKey(NaN)).toBe('');
  });
});

describe('activeMs', () => {
  const now = 1_000_000;

  it('counts the elapsed time when visible and recently active', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now - 5000, lastInputAt: now - 1000, visible: true,
    })).toBe(5000);
  });

  it('counts nothing while the tab is hidden', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now - 5000, lastInputAt: now - 1000, visible: false,
    })).toBe(0);
  });

  it('counts nothing once the learner has been idle past the threshold', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now - 5000, lastInputAt: now - ACT.IDLE_MS - 1, visible: true,
    })).toBe(0);
  });

  it('still counts at the exact idle boundary', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now - 5000, lastInputAt: now - ACT.IDLE_MS, visible: true,
    })).toBe(5000);
  });

  // A laptop closed for two hours resumes with one enormous gap since the last
  // tick. Banking it would credit sleep as study time.
  it('clamps a huge gap from a sleeping machine', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now - 2 * 3600 * 1000, lastInputAt: now, visible: true,
    })).toBe(ACT.MAX_TICK_MS);
  });

  it('counts nothing when the clock has not moved', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now, lastInputAt: now, visible: true,
    })).toBe(0);
  });

  it('counts nothing when the clock jumped backwards', () => {
    expect(ACT.activeMs({
      now, lastTickAt: now + 5000, lastInputAt: now, visible: true,
    })).toBe(0);
  });

  it('counts nothing without state', () => {
    expect(ACT.activeMs(null)).toBe(0);
  });
});

describe('splitSeconds', () => {
  it('splits whole seconds from the sub-second remainder', () => {
    expect(ACT.splitSeconds(5400)).toEqual({ seconds: 5, remainderMs: 400 });
  });

  it('carries a remainder that never reaches a full second', () => {
    expect(ACT.splitSeconds(900)).toEqual({ seconds: 0, remainderMs: 900 });
  });

  // Three 400ms carries must eventually become a second, not vanish.
  it('accumulates carried remainders into whole seconds', () => {
    let carry = 0;
    let seconds = 0;
    for (let i = 0; i < 3; i++) {
      const out = ACT.splitSeconds(400 + carry);
      carry = out.remainderMs;
      seconds += out.seconds;
    }
    expect(seconds).toBe(1);
    expect(carry).toBe(200);
  });

  it('never returns negative time', () => {
    expect(ACT.splitSeconds(-500)).toEqual({ seconds: 0, remainderMs: 0 });
  });
});

describe('formatDuration', () => {
  it('shows hours and minutes', () => {
    expect(ACT.formatDuration(3 * 3600 + 42 * 60)).toBe('3h 42m');
  });

  it('shows minutes alone under an hour', () => {
    expect(ACT.formatDuration(42 * 60)).toBe('42m');
  });

  // "0m" for someone who genuinely used the site reads as a bug.
  it('marks a sub-minute visit as less than a minute', () => {
    expect(ACT.formatDuration(30)).toBe('< 1m');
  });

  it('shows a true zero as 0m', () => {
    expect(ACT.formatDuration(0)).toBe('0m');
    expect(ACT.formatDuration(null)).toBe('0m');
    expect(ACT.formatDuration('nonsense')).toBe('0m');
  });

  it('drops a zero minute part on a whole hour', () => {
    expect(ACT.formatDuration(7200)).toBe('2h 0m');
  });
});

describe('toHours', () => {
  it('rounds to one decimal place', () => {
    expect(ACT.toHours(5400)).toBe(1.5);
    expect(ACT.toHours(3660)).toBe(1);
  });

  it('is zero for no time at all', () => {
    expect(ACT.toHours(0)).toBe(0);
    expect(ACT.toHours(undefined)).toBe(0);
  });
});
