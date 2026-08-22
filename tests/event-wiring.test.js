import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* The emitters are wired into files that need a browser, Pyodide and
   CodeMirror to run, so these are source-level checks: that the call sites
   exist, that they are guarded so a guest page cannot throw, and that the one
   piece of real logic -- pulling an exception class name out of a traceback --
   behaves. The traceback cases are the ones that matter: a mistake there puts
   student source code into a collection a teacher can read. */

let E;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/events.js', 'utf8')).call(window);
  E = window.PyPathEvents;
});

const runner = fs.readFileSync('assets/js/lesson-runner.js', 'utf8');
const exercises = fs.readFileSync('assets/js/exercises.js', 'utf8');
const progress = fs.readFileSync('assets/js/lesson-progress.js', 'utf8');

describe('errorClassOf keeps student code out of the log', () => {
  it('takes the class name off the last line of a traceback', () => {
    const tb = [
      'Traceback (most recent call last):',
      '  File "<exec>", line 3, in <module>',
      '    my_secret_answer = total / 0',
      'ZeroDivisionError: division by zero',
    ].join('\n');
    expect(E.errorClassOf(tb)).toBe('ZeroDivisionError');
    expect(E.errorClassOf(tb)).not.toMatch(/my_secret_answer|total/);
  });

  it('unwraps the Pyodide wrapper to the real exception', () => {
    expect(E.errorClassOf('pyodide.ffi.PythonError: IndentationError: expected an indented block'))
      .toBe('IndentationError');
  });

  it('reports the wrapper only when it is all there is', () => {
    expect(E.errorClassOf('PythonError: something went wrong')).toBe('PythonError');
  });

  it('is not fooled by a colon inside the error message', () => {
    // KeyError: 'name: value' would otherwise hand back "name", which is a
    // fragment of the student's own data.
    expect(E.errorClassOf("KeyError: 'name: value'")).toBe('KeyError');
    expect(E.errorClassOf("ValueError: invalid literal for int() with base 10: 'x'"))
      .toBe('ValueError');
  });

  it('handles a syntax error, whose frame has no function name', () => {
    expect(E.errorClassOf('  File "x", line 1\n    print("hi"\nSyntaxError: unexpected EOF'))
      .toBe('SyntaxError');
  });

  it('accepts the exceptions that are not named Error', () => {
    expect(E.errorClassOf('KeyboardInterrupt: ')).toBe('KeyboardInterrupt');
    expect(E.errorClassOf('SystemExit: 1')).toBe('SystemExit');
  });

  it('falls back rather than guessing at unrecognized text', () => {
    expect(E.errorClassOf('')).toBe('UnknownError');
    expect(E.errorClassOf(null)).toBe('UnknownError');
    expect(E.errorClassOf('some words with no exception in them')).toBe('UnknownError');
  });

  it('never returns something the event sanitizer would reject', () => {
    const samples = ['', 'x', 'KeyError: 1', 'a.b.c.ValueError: q', 'Traceback:\nTypeError: t'];
    for (const s of samples) {
      const ev = E.makeEvent('code.error', {
        lessonPath: '/units/unit-1/x.html', editorId: 'e1', errorType: E.errorClassOf(s),
      });
      expect(ev).not.toBe(null);
      expect(ev.payload.errorType).toBe(E.errorClassOf(s));
    }
  });
});

describe('lesson-runner emits run and error events', () => {
  it('records a run on both the success and the failure path', () => {
    expect(runner.match(/note\('code\.run'/g).length).toBe(2);
  });

  it('records an error alongside a failed run', () => {
    expect(runner.match(/note\('code\.error'/g).length).toBe(2);
  });

  it('records a lesson open once, on page init', () => {
    expect(runner.match(/note\('lesson\.opened'/g).length).toBe(1);
  });

  it('passes the exception through errorClassOf rather than raw', () => {
    expect(runner).toMatch(/errorClassOf\(result\.error \|\| result\.stderr\)/);
    expect(runner).toMatch(/errorClassOf\(error\)/);
    // The raw traceback must not be handed to the log anywhere.
    expect(runner).not.toMatch(/errorType:\s*(?:String\()?(?:result\.|error)/);
  });

  it('guards every call so a page with no event log cannot throw', () => {
    expect(runner).toMatch(/function note\(type, payload\) \{\s*\n\s*if \(!window\.PyPathEvents\) return;/);
    expect(runner).toMatch(/try \{ window\.PyPathEvents\.record\(type, payload\); \} catch \(e\) \{\}/);
  });
});

describe('exercises emits a submission with a rising attempt count', () => {
  it('records the submission', () => {
    expect(exercises).toMatch(/note\('answer\.submitted'/);
  });

  it('counts attempts per exercise', () => {
    expect(exercises).toMatch(/attempt: nextAttempt\(exerciseId\)/);
  });

  it('does not put the answer text in the event', () => {
    // The answer is already mirrored through the progress store, where the
    // size cap and the same rules apply to it. Duplicating it into an event
    // payload would put it somewhere neither of those covers.
    const start = exercises.indexOf("note('answer.submitted'");
    const call = exercises.slice(start, exercises.indexOf('});', start));
    expect(call).toMatch(/exerciseId/);
    expect(call).not.toMatch(/userAnswer|textarea\.value/);
  });

  it('guards the call for a page with no event log', () => {
    expect(exercises).toMatch(/if \(!window\.PyPathEvents\) return;/);
  });
});

describe('unit completion reports whether it was verified', () => {
  it('emits the event where the unit is actually rolled up', () => {
    expect(progress).toMatch(/record\('unit\.completed'/);
  });

  it('computes verified from the test record rather than hardcoding it', () => {
    expect(progress).toMatch(/verified: unitTestPassed\(testRecords\(\), target\)/);
    expect(progress).not.toMatch(/verified: false/);
  });
});

describe('every page that syncs progress also loads the event log', () => {
  const html = (p) => fs.readFileSync(p, 'utf8');
  const pages = fs
    .readdirSync('units')
    .filter((n) => n.endsWith('.html'))
    .map((n) => `units/${n}`)
    .concat(
      fs.readdirSync('units/unit-1').map((n) => `units/unit-1/${n}`)
    );

  it('loads events.js wherever storage-keys.js is loaded', () => {
    for (const page of pages) {
      const src = html(page);
      if (!src.includes('/assets/js/storage-keys.js')) continue;
      expect(src, page).toContain('/assets/js/events.js');
      expect(src, page).toContain('/assets/js/schema-version.js');
    }
  });

  it('parses events.js before lesson-runner.js needs it', () => {
    const src = html('units/unit-1/first-program.html');
    expect(src.indexOf('/assets/js/events.js'))
      .toBeLessThan(src.indexOf('/assets/js/lesson-runner.js'));
  });

  it('loads the sink as a module, after sync.js', () => {
    const src = html('units/unit-1/first-program.html');
    expect(src).toMatch(/<script type="module" src="\/assets\/js\/event-sink\.js"><\/script>/);
    expect(src.indexOf('/assets/js/sync.js')).toBeLessThan(src.indexOf('/assets/js/event-sink.js'));
  });
});
