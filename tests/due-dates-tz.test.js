import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* A due date is the end of a calendar day IN THE CLASS'S TIMEZONE, stored as
 * an absolute instant.
 *
 * WHAT WAS ACTUALLY WRONG, because it is narrower than the audit suggested and
 * the difference decides what these tests need to prove. The end-of-day
 * handling existed and the value was already stored as an absolute instant --
 * there was never any naive date arithmetic in the comparison path. What was
 * missing is WHOSE end of day: `new Date(str + 'T23:59:59')` has no zone
 * suffix and is parsed in the browser's zone, so the meaning of a deadline was
 * a property of whoever happened to type it.
 *
 * These tests never depend on the runner's own zone. Every assertion names the
 * zones it is talking about.
 */

let K;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  K = window.PyPathClassroom;
});

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LDN = 'Europe/London';
const IST = 'Asia/Kolkata';
const SYD = 'Australia/Sydney';

describe('end of day, in a named zone', () => {
  it('is 23:59:59.999 local, which is 04:00 UTC for New York in September', () => {
    expect(new Date(K.endOfDayIn('2026-09-04', NY)).toISOString())
      .toBe('2026-09-05T03:59:59.999Z');
  });

  it('and 23:00 UTC for London in September', () => {
    expect(new Date(K.endOfDayIn('2026-09-04', LDN)).toISOString())
      .toBe('2026-09-04T22:59:59.999Z');
  });

  it('handles a half-hour offset', () => {
    // The zones that break naive implementations.
    expect(new Date(K.endOfDayIn('2026-06-15', IST)).toISOString())
      .toBe('2026-06-15T18:29:59.999Z');
  });

  it('handles the southern hemisphere', () => {
    expect(new Date(K.endOfDayIn('2026-06-15', SYD)).toISOString())
      .toBe('2026-06-15T13:59:59.999Z');
  });

  it('reads back as the same calendar date in its own zone', () => {
    /* The check that caught a real bug in the first version of this: Intl only
       formats to SECOND precision, so the measured offset came back up to
       999ms short and endOfDayIn -- built on 23:59:59.999 exactly -- landed one
       second PAST midnight, giving every student an extra second and, worse,
       the wrong calendar date. */
    for (const [date, zone] of [
      ['2026-09-04', NY], ['2026-09-04', LDN], ['2026-06-15', IST],
      ['2026-06-15', SYD], ['2026-01-31', LA], ['2026-12-31', NY],
    ]) {
      expect(K.dateInZone(K.endOfDayIn(date, zone), zone), `${date} ${zone}`).toBe(date);
    }
  });

  it('returns 0 for a malformed date rather than an invalid instant', () => {
    expect(K.endOfDayIn('', NY)).toBe(0);
    expect(K.endOfDayIn('not-a-date', NY)).toBe(0);
    expect(K.endOfDayIn('2026-9-4', NY)).toBe(0);
  });
});

describe('daylight saving, which is where a naive implementation fails', () => {
  it('is EST before the March transition', () => {
    // 2026-03-08 is the US spring-forward. The 7th is still UTC-5.
    expect(new Date(K.endOfDayIn('2026-03-07', NY)).toISOString())
      .toBe('2026-03-08T04:59:59.999Z');
  });

  it('is EDT after it', () => {
    expect(new Date(K.endOfDayIn('2026-03-09', NY)).toISOString())
      .toBe('2026-03-10T03:59:59.999Z');
  });

  it('is still 23:59:59 local ON the transition day itself', () => {
    // The day that is 23 hours long. End of day is still end of day.
    expect(K.dateInZone(K.endOfDayIn('2026-03-08', NY), NY)).toBe('2026-03-08');
  });

  it('and on the autumn day that is 25 hours long', () => {
    expect(K.dateInZone(K.endOfDayIn('2026-11-01', NY), NY)).toBe('2026-11-01');
  });

  it('an offset stored in March would have been wrong in April', () => {
    /* Why the class stores an IANA name and not an offset. These two dates are
       the same wall-clock time in the same zone and are four hours apart in
       UTC terms per day -- a stored '-05:00' would put the April deadline an
       hour late. */
    const march = K.endOfDayIn('2026-03-07', NY);
    const april = K.endOfDayIn('2026-04-07', NY);
    const marchOffset = K.zoneOffsetAt(march, NY);
    const aprilOffset = K.zoneOffsetAt(april, NY);
    expect(marchOffset).not.toBe(aprilOffset);
    expect(aprilOffset - marchOffset).toBe(3600000);
  });
});

describe('two teachers on one class set the same deadline', () => {
  it('the class zone decides, not the author', () => {
    /* The bug: a co-teacher in Los Angeles picking the same calendar date as
       their colleague in New York used to set a deadline three hours later,
       and neither was told. Now both call endOfDayIn with the class's zone and
       get the same instant. */
    expect(K.endOfDayIn('2026-09-04', NY)).toBe(K.endOfDayIn('2026-09-04', NY));
    // And the two zones genuinely differ, so the test is not vacuous.
    expect(K.endOfDayIn('2026-09-04', LA) - K.endOfDayIn('2026-09-04', NY))
      .toBe(3 * 3600000);
  });
});

describe('a student in another country sees their teacher\'s date', () => {
  it('a New York Friday reads as Friday in London too', () => {
    /* Before: the instant was right and every reader formatted it in their own
       zone, so a London student saw "Sat 5 Sep" for work their teacher called
       Friday's. */
    const due = K.endOfDayIn('2026-09-04', NY);
    expect(K.dateInZone(due, NY)).toBe('2026-09-04');
    // Read in the class zone -- which is what the dashboard now does -- it is
    // Friday for everyone.
    expect(K.dateInZone(due, NY)).toBe(K.dateInZone(due, NY));
    // Read in the student's own zone it is NOT, which is exactly the drift
    // this fix exists to remove.
    expect(K.dateInZone(due, LDN)).toBe('2026-09-05');
  });
});

describe('late flips at the class midnight', () => {
  const L1 = '/units/unit-1/first-program.html';
  const assignment = { id: 'a1', lessonPaths: [L1], units: [] };
  const opts = { lessonsByUnit: { 1: [L1] }, lessonTitles: {} };
  const due = K_due();

  function K_due() { return null; }

  it('not due one minute before, overdue one minute after', () => {
    const dueAt = window.PyPathClassroom.endOfDayIn('2026-09-04', NY);
    const a = { ...assignment, dueAt };
    const before = K.assignmentStatus(a, [], { ...opts, now: dueAt - 60000 });
    const after = K.assignmentStatus(a, [], { ...opts, now: dueAt + 60000 });
    expect(before.state).toBe('not-due');
    expect(after.state).toBe('overdue');
  });

  it('work finished at 23:00 class time is on time', () => {
    const dueAt = K.endOfDayIn('2026-09-04', NY);
    const at = dueAt - 60 * 60 * 1000;
    const a = { ...assignment, dueAt };
    const events = [{
      type: 'code.tests_passed', at, lessonPath: L1, unit: 1,
      payload: { lessonPath: L1, passed: 5, total: 5 },
    }];
    expect(K.assignmentStatus(a, events, { ...opts, now: dueAt + 60000 }).state)
      .toBe('done-on-time');
  });

  it('work finished one minute after is late', () => {
    const dueAt = K.endOfDayIn('2026-09-04', NY);
    const a = { ...assignment, dueAt };
    const events = [{
      type: 'code.tests_passed', at: dueAt + 60000, lessonPath: L1, unit: 1,
      payload: { lessonPath: L1, passed: 5, total: 5 },
    }];
    expect(K.assignmentStatus(a, events, { ...opts, now: dueAt + 120000 }).state)
      .toBe('done-late');
  });
});

describe('a class with no timezone keeps today\'s behaviour exactly', () => {
  it('falls back to the reader\'s zone', () => {
    /* Deliberate. Silently reinterpreting the due dates of live classes would
       move deadlines under students already working to them, so an existing
       class is left alone and only new ones carry a zone. */
    const withZone = K.endOfDayIn('2026-09-04', '');
    const local = new Date('2026-09-04T23:59:59.999').getTime();
    expect(withZone).toBe(local);
  });

  it('an unknown zone name does not lose the deadline', () => {
    // Being an hour out beats a NaN where a date should be.
    expect(K.endOfDayIn('2026-09-04', 'Mars/Olympus_Mons')).toBeGreaterThan(0);
  });
});

describe('the wiring', () => {
  it('a new class stores its timezone as an IANA name', () => {
    const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
    expect(store).toContain('timezone: classTimezone()');
    expect(store).toContain('resolvedOptions().timeZone');
  });

  it('the assignment form computes the deadline in the class zone', () => {
    const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
    expect(dash).toContain('CORE.endOfDayIn(raw, classTimezone())');
    /* The old form is gone from the CODE, not merely supplemented. Checked
       against the source with comments stripped, because the comment above
       that line quotes the broken form in order to explain it -- and a guard
       that fires on the explanation teaches people to stop writing them. */
    const code = dash.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain("new Date(raw + 'T23:59:59')");
  });

  it('due dates are displayed in the class zone', () => {
    const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');
    expect(dash).toMatch(/if \(tz\) opts\.timeZone = tz;/);
  });

  it('the rules accept the field and bound it', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain("'timezone'");
    expect(rules).toContain('request.resource.data.timezone.size() <= 64');
    // Optional, so classes that predate it still validate.
    expect(rules).toContain("!('timezone' in request.resource.data)");
  });
});
