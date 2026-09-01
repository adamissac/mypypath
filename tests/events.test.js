import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';

let E;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/events.js', 'utf8')).call(window);
  E = window.PyPathEvents;
});

beforeEach(() => {
  E.reset();
  E.setEnabled(true);
});

const LESSON = '/units/unit-1/first-program.html';

describe('the event vocabulary', () => {
  it('defines exactly the ten documented types', () => {
    /* quiz.submitted joined the vocabulary with teacher-assignable quizzes.
       Deliberately its own type rather than a flavour of test.submitted: only
       the end-of-unit test unlocks a unit, and one type carrying both would
       make every reader disambiguate them. */
    expect(E.TYPES.sort()).toEqual(
      [
        'answer.submitted',
        'check.answered',
        'code.error',
        'code.run',
        'code.tests_passed',
        'lesson.opened',
        'quiz.submitted',
        'test.started',
        'test.submitted',
        'unit.completed'
      ].sort()
    );
  });

  it('rejects a type outside the vocabulary', () => {
    expect(E.isValidType('lesson.opened')).toBe(true);
    expect(E.isValidType('keystroke.logged')).toBe(false);
    expect(E.makeEvent('keystroke.logged', { lessonPath: LESSON })).toBe(null);
  });
});

describe('payload construction', () => {
  it('keeps only the fields the type declares', () => {
    const ev = E.makeEvent('lesson.opened', {
      lessonPath: LESSON,
      unit: 1,
      ipAddress: '10.0.0.1',
      userAgent: 'Firefox',
      keystrokes: 'print("hi")'
    });
    expect(Object.keys(ev.payload).sort()).toEqual(['lessonPath', 'unit']);
  });

  it('never carries device, location or keystroke fields through', () => {
    const ev = E.makeEvent('code.run', {
      lessonPath: LESSON,
      editorId: 'practice1',
      ok: true,
      geolocation: { lat: 1, lng: 2 },
      screen: '1440x900',
      code: 'print(1)'
    });
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toMatch(/geolocation|screen|1440|print/);
  });

  it('records only the exception class name, never a traceback', () => {
    const ev = E.makeEvent('code.error', {
      lessonPath: LESSON,
      editorId: 'practice1',
      errorType: 'Traceback (most recent call last):\n  File "<exec>", line 2\n    x = 1'
    });
    expect(ev.payload.errorType).toBe('UnknownError');
    expect(JSON.stringify(ev)).not.toMatch(/Traceback|x = 1/);
  });

  it('accepts a well formed exception class name', () => {
    const ev = E.makeEvent('code.error', {
      lessonPath: LESSON,
      editorId: 'practice1',
      errorType: 'IndentationError'
    });
    expect(ev.payload.errorType).toBe('IndentationError');
  });

  it('coerces ok, correct and verified to real booleans', () => {
    expect(E.makeEvent('code.run', { lessonPath: LESSON, editorId: 'e', ok: 'yes' }).payload.ok)
      .toBe(false);
    expect(E.makeEvent('code.run', { lessonPath: LESSON, editorId: 'e', ok: true }).payload.ok)
      .toBe(true);
    expect(E.makeEvent('unit.completed', { unit: 3, verified: 1 }).payload.verified).toBe(false);
  });

  it('requires a real unit number where the type declares one', () => {
    expect(E.makeEvent('test.started', { unit: 0 })).toBe(null);
    expect(E.makeEvent('test.started', { unit: 11 })).toBe(null);
    expect(E.makeEvent('test.started', { unit: 'three' })).toBe(null);
    expect(E.makeEvent('test.started', { unit: 3 }).payload.unit).toBe(3);
  });

  it('requires an id where the type declares one', () => {
    expect(E.makeEvent('code.run', { lessonPath: LESSON, ok: true })).toBe(null);
    expect(E.makeEvent('answer.submitted', { lessonPath: LESSON, attempt: 1 })).toBe(null);
  });

  it('rejects an id that is not in the authored id shape', () => {
    expect(E.makeEvent('code.run', { lessonPath: LESSON, editorId: '../../etc', ok: true }))
      .toBe(null);
  });

  it('starts attempt counts at 1', () => {
    expect(E.makeEvent('answer.submitted', { lessonPath: LESSON, exerciseId: 'exercise1', attempt: 0 })
      .payload.attempt).toBe(1);
  });

  it('clamps a test duration so a tab left open is not a two-day test', () => {
    const ev = E.makeEvent('test.submitted', {
      unit: 1, score: 8, total: 10, attempt: 1, durationSec: 99999999
    });
    expect(ev.payload.durationSec).toBe(86400);
  });

  it('normalizes a lesson path, dropping query and hash', () => {
    const ev = E.makeEvent('lesson.opened', { lessonPath: LESSON + '?from=nav#top', unit: 1 });
    expect(ev.payload.lessonPath).toBe(LESSON);
  });

  it('infers the unit from the lesson path when the type has no unit field', () => {
    const ev = E.makeEvent('code.run', {
      lessonPath: '/units/unit-7/decorators.html', editorId: 'practice1', ok: true
    });
    expect(ev.unit).toBe(7);
  });

  it('keeps every payload under the documented size cap', () => {
    for (const type of E.TYPES) {
      const ev = E.makeEvent(type, {
        lessonPath: LESSON, unit: 1, editorId: 'practice1', exerciseId: 'exercise1',
        questionId: 'q1', errorType: 'ValueError', ok: true, correct: true, verified: true,
        attempt: 1, passed: 1, total: 1, score: 1, durationSec: 10
      });
      expect(ev, type).not.toBe(null);
      expect(JSON.stringify(ev.payload).length).toBeLessThanOrEqual(E.MAX_PAYLOAD_CHARS);
    }
  });
});

describe('the buffer', () => {
  it('is a no-op until enabled, so a guest writes nothing', () => {
    E.reset();
    expect(E.isEnabled()).toBe(false);
    expect(E.record('lesson.opened', { lessonPath: LESSON, unit: 1 })).toBe(false);
    expect(E.pending()).toBe(0);
  });

  it('discards anything buffered when it is switched off again', () => {
    E.record('lesson.opened', { lessonPath: LESSON, unit: 1 });
    expect(E.pending()).toBe(1);
    E.setEnabled(false);
    expect(E.pending()).toBe(0);
  });

  it('buffers a valid event and drains it once', () => {
    E.record('lesson.opened', { lessonPath: LESSON, unit: 1 });
    expect(E.pending()).toBe(1);
    expect(E.drain().length).toBe(1);
    expect(E.pending()).toBe(0);
  });

  it('drains at most one batch at a time', () => {
    for (let i = 0; i < E.MAX_BATCH + 10; i += 1) {
      E.record('code.run', { lessonPath: LESSON, editorId: 'practice1', ok: true });
    }
    expect(E.drain().length).toBe(E.MAX_BATCH);
    expect(E.pending()).toBe(10);
  });

  it('drops rather than blocks once a session hits the cap', () => {
    for (let i = 0; i < E.SESSION_CAP + 25; i += 1) {
      E.record('code.run', { lessonPath: LESSON, editorId: 'practice1', ok: true });
    }
    expect(E.pending()).toBe(E.SESSION_CAP);
    expect(E.dropped()).toBe(25);
  });

  it('does not buffer an invalid event', () => {
    expect(E.record('code.run', { lessonPath: LESSON })).toBe(false);
    expect(E.pending()).toBe(0);
  });
});
