import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

/* The whole classroom feature has to be invisible to a signed-out learner, and
   nothing added for it may break work that was already saved. These are the
   two regressions that would matter most and are easiest to introduce. */

const GLOBALS = [
  'assets/js/storage-keys.js',
  'assets/js/schema-version.js',
  'assets/js/events.js',
  'assets/js/snapshots.js',
  'assets/js/progress-store.js',
  'assets/js/classroom-core.js',
  'assets/js/classroom-export.js',
  'assets/js/checker.js',
];

function loadAll() {
  for (const file of GLOBALS) {
    new Function(fs.readFileSync(file, 'utf8')).call(window);
  }
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('every added global loads without a signed-in user', () => {
  it('parses and initialises with no window.firebase and no user', () => {
    expect(() => loadAll()).not.toThrow();
  });

  it('leaves the event log switched off by default', () => {
    loadAll();
    expect(window.PyPathEvents.isEnabled()).toBe(false);
    expect(window.PyPathEvents.record('lesson.opened', {
      lessonPath: '/units/unit-1/x.html', unit: 1,
    })).toBe(false);
    expect(window.PyPathEvents.pending()).toBe(0);
  });

  it('installs no class adapter until one is set', () => {
    loadAll();
    const store = window.ProgressStore;
    store._setRemoteAdapter(null);
    store._setClassAdapter(null);
    expect(() => store.setCompletedUnits([1])).not.toThrow();
    expect(localStorage.getItem('pypath-completed-units')).toBe('[1]');
  });
});

describe('work saved before this change still loads', () => {
  it('reads saved editor code under the existing key shape', () => {
    loadAll();
    const key = 'pypath-lesson-/units/unit-1/first-program.html-code-practice1';
    localStorage.setItem(key, 'print("saved earlier")');
    expect(window.ProgressStore.getItem(key)).toBe('print("saved earlier")');
  });

  it('reads a saved reflection answer under the existing key shape', () => {
    loadAll();
    const key = 'exercise_/units/unit-1/comments-docs.html_reflection-exercise1';
    localStorage.setItem(key, 'My earlier answer.');
    expect(window.ProgressStore.getItem(key)).toBe('My earlier answer.');
  });

  it('still syncs both of those keys', () => {
    loadAll();
    expect(window.PyPathKeys.isSyncable(
      'pypath-lesson-/units/unit-1/first-program.html-code-practice1'
    )).toBe(true);
    expect(window.PyPathKeys.isSyncable(
      'exercise_/units/unit-1/comments-docs.html_reflection-exercise1'
    )).toBe(true);
  });

  it('keeps the doc-id mapping injective, including for the new keys', () => {
    loadAll();
    const keys = [
      'pypath-lesson-/units/unit-1/a.html-code-practice1',
      'pypath-lesson-/units/unit-1/a.html-code-practice2',
      'pypath-lesson-/units/unit-1/b.html-code-practice1',
      'exercise_/units/unit-1/a.html_reflection-exercise1',
      'pypath-checks-/units/unit-1/a.html',
      'pypath-checks-/units/unit-1/b.html',
      'pypath-snapshots-/units/unit-1/a.html',
      'pypath-snapshots-/units/unit-1/b.html',
      'pypath-completed-units',
    ];
    const ids = keys.map((k) => window.PyPathKeys.toDocId(k));
    expect(new Set(ids).size).toBe(keys.length);
    for (const id of ids) expect(id).not.toContain('/');
  });

  it('does not change the existing keys the allowlist accepted', () => {
    loadAll();
    // The four original patterns, unchanged.
    for (const key of ['pypath-completed-units', 'pypath-completed-at',
      'pypath-progress-lessons', 'pypath-unit-tests']) {
      expect(window.PyPathKeys.isSyncable(key), key).toBe(true);
    }
  });

  it('still refuses a key nobody put on the allowlist', () => {
    loadAll();
    expect(window.PyPathKeys.isSyncable('pypath-theme')).toBe(false);
    expect(window.PyPathKeys.isSyncable('pypath-sandbox-projects')).toBe(false);
  });
});

describe('a guest writes nothing to a classroom', () => {
  it('takes no snapshot when the event log is off', () => {
    loadAll();
    const runner = fs.readFileSync('assets/js/lesson-runner.js', 'utf8');
    // The guard is what makes this true; assert it is still in the code.
    expect(runner).toMatch(
      /if \(!window\.PyPathEvents \|\| !window\.PyPathEvents\.isEnabled\(\)\) return;/
    );
  });

  it('has no Firebase import in any of the plain-global files', () => {
    // These load on every lesson page, including for a guest. An import here
    // would pull the SDK onto pages that have no use for it.
    for (const file of GLOBALS) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/firebase|gstatic/i);
      expect(src, file).not.toMatch(/^import /m);
    }
  });

  it('degrades to nothing when the classroom globals are missing entirely', () => {
    // A CDN blip or a stale cache must not take down the lesson page.
    const runner = fs.readFileSync('assets/js/lesson-runner.js', 'utf8');
    const exercises = fs.readFileSync('assets/js/exercises.js', 'utf8');
    const quiz = fs.readFileSync('assets/js/lesson-quiz.js', 'utf8');
    for (const [name, src] of [['runner', runner], ['exercises', exercises], ['quiz', quiz]]) {
      expect(src, name).toMatch(/if \(!window\.PyPathEvents\) return;/);
    }
  });
});

describe('the classroom modules that do touch Firebase are modules', () => {
  const MODULES = [
    'assets/js/classroom-store.js',
    'assets/js/event-sink.js',
    'assets/js/membership.js',
    'assets/js/classroom-dashboard.js',
    'assets/js/student-detail.js',
  ];

  it('are loaded with type="module", so an old browser skips them silently', () => {
    const html = fs.readFileSync('classroom.html', 'utf8');
    for (const file of ['classroom-dashboard', 'student-detail']) {
      expect(html).toMatch(
        new RegExp(`<script type="module" src="/assets/js/${file}\\.js">`)
      );
    }
  });

  it('never reach for Firebase outside the shared config', () => {
    for (const file of MODULES) {
      const src = fs.readFileSync(file, 'utf8');
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec.startsWith('/assets/js/'), `${file} imports ${spec}`).toBe(true);
      }
    }
  });
});
