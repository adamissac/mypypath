import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

/* A per-class cap on end-of-unit test retakes.

   The shape of the decision, which every test below is a restatement of: a
   student in a class gets whatever their teacher set, and a learner working on
   their own gets unlimited retakes and can never acquire a limit. Nothing here
   is a product-wide number. */

let P;
beforeAll(() => {
  new Function(fs.readFileSync('assets/js/classroom-policy.js', 'utf8')).call(window);
  new Function(fs.readFileSync('assets/js/classroom-core.js', 'utf8')).call(window);
  P = window.PyPathPolicy;
});

const rules = fs.readFileSync('firestore.rules', 'utf8');
const store = fs.readFileSync('assets/js/classroom-store.js', 'utf8');
const read = fs.readFileSync('assets/js/class-policy.js', 'utf8');
const page = fs.readFileSync('assets/js/unit-test-page.js', 'utf8');
const html = fs.readFileSync('classroom.html', 'utf8');
const testHtml = fs.readFileSync('unit-test.html', 'utf8');

// Shorthand for the object class-policy.js hands over.
function policy(cap, mode) {
  return {
    mode: mode || 'sequential',
    manualUnlocks: [],
    assignmentUnlocks: [],
    maxTestAttempts: cap,
  };
}

describe('a self-study learner is never capped', () => {
  /* The angle that matters most, because it is the one a regression would be
     quietest about: nobody in no class would report being stopped, they would
     just stop. */
  it('has no cap with no policy at all', () => {
    expect(P.attemptCap(null, false)).toBe(null);
    expect(P.attemptsLeft(null, 99, false)).toBe(null);
    expect(P.canSitTest(null, 99, false)).toBe(true);
  });

  it('still has none after a hundred sittings', () => {
    for (const used of [0, 1, 5, 100]) {
      expect(P.canSitTest(null, used, false)).toBe(true);
    }
  });

  it('is unaffected by an undefined or denied policy read', () => {
    // class-policy.js announces null when it cannot ask. A failed read must
    // never invent a limit somebody never set.
    expect(P.canSitTest(undefined, 50, false)).toBe(true);
  });
});

describe('a class that has not set one is unlimited', () => {
  it('treats an absent field as no cap', () => {
    expect(P.attemptCap({ mode: 'free', manualUnlocks: [] }, false)).toBe(null);
    expect(P.canSitTest(policy(undefined), 40, false)).toBe(true);
  });

  it('treats null as no cap, which is how clearing it is stored', () => {
    expect(P.attemptCap(policy(null), false)).toBe(null);
  });

  it('ignores junk rather than reading it as zero', () => {
    // A zero or a string would otherwise mean "no attempts at all", which is
    // a whole class locked out of every test by one bad value.
    for (const junk of [0, -3, 1.5, NaN, {}, [], true, false, 'three']) {
      expect(P.attemptCap(policy(junk), false), String(junk)).toBe(null);
    }
  });

  it('still admits a number that arrived as a string', () => {
    // Firestore and a <select> both hand these back as strings, which is the
    // same reason hasUnit() in this file coerces before comparing.
    expect(P.attemptCap(policy('3'), false)).toBe(3);
  });
});

describe('a classroom student under the cap', () => {
  it('may sit while attempts remain', () => {
    expect(P.canSitTest(policy(3), 0, false)).toBe(true);
    expect(P.canSitTest(policy(3), 2, false)).toBe(true);
    expect(P.attemptsLeft(policy(3), 2, false)).toBe(1);
  });

  it('is refused once the cap is reached', () => {
    expect(P.canSitTest(policy(3), 3, false)).toBe(false);
    expect(P.attemptsLeft(policy(3), 3, false)).toBe(0);
  });

  it('is still refused past the cap, never handed a negative', () => {
    // A record that came back from another device with more attempts than the
    // cap allows is possible: the cap can be lowered after the fact.
    expect(P.attemptsLeft(policy(3), 9, false)).toBe(0);
    expect(P.canSitTest(policy(3), 9, false)).toBe(false);
  });

  it('counts a missing or broken attempt count as none used', () => {
    expect(P.attemptsLeft(policy(3), undefined, false)).toBe(3);
    expect(P.attemptsLeft(policy(3), NaN, false)).toBe(3);
    expect(P.attemptsLeft(policy(3), -2, false)).toBe(3);
  });

  it('clamps an absurd stored cap rather than trusting it', () => {
    expect(P.attemptCap(policy(1000), false)).toBe(P.MAX_ATTEMPT_CAP);
  });
});

describe('a teacher-granted raise lets a student through', () => {
  it('reopens the test the moment the cap moves up', () => {
    // The same student, the same three sittings, before and after their
    // teacher changes the setting.
    expect(P.canSitTest(policy(3), 3, false)).toBe(false);
    expect(P.canSitTest(policy(5), 3, false)).toBe(true);
    expect(P.canSitTest(policy(null), 3, false)).toBe(true);
  });
});

describe('a teacher is never capped by their own setting', () => {
  it('may sit their own class test to check the paper', () => {
    expect(P.attemptCap(policy(1), true)).toBe(null);
    expect(P.canSitTest(policy(1), 12, true)).toBe(true);
  });
});

describe('the setting is stored and typed the way showSolutions is', () => {
  it('the store writes one field and clears it with null', () => {
    expect(store).toMatch(/updateDoc\(doc\(db, `classes\/\$\{classId\}`\), \{ maxTestAttempts: clean \}\)/);
    expect(store).toMatch(/normalizeAttemptCap\(cap\)/);
  });

  it('the reader treats absent as unlimited', () => {
    expect(read).toMatch(/maxTestAttempts: POLICY \? POLICY\.normalizeAttemptCap\(data\.maxTestAttempts\) : null/);
  });

  it('the rules admit the field', () => {
    const update = rules.slice(rules.indexOf('allow update: if isTeacherOf(classId)'));
    expect(update.slice(0, update.indexOf(';'))).toContain("'maxTestAttempts'");
  });

  it('the rules pin it to a bounded integer or null', () => {
    // Only a teacher can write the class document at all, so this is about
    // shape rather than authorship: a string or a zero stored here would be
    // read by some future client as "no attempts allowed".
    expect(rules).toMatch(/request\.resource\.data\.maxTestAttempts == null/);
    expect(rules).toMatch(/request\.resource\.data\.maxTestAttempts is int/);
    expect(rules).toMatch(/request\.resource\.data\.maxTestAttempts >= 1/);
  });
});

describe('the cap is enforced where it can be, and says where it cannot', () => {
  it('the test page refuses a new sitting', () => {
    expect(page).toMatch(/function blockedReason/);
    expect(page).toMatch(/POLICY\.attemptsLeft\(classPolicy, attemptsUsed\(\), teaching\(\)\)/);
  });

  it('a blocked sitting is stopped at the click too, not only at render', () => {
    const start = page.slice(page.indexOf('function startPaper'), page.indexOf('function renderIntro'));
    expect(start).toMatch(/if \(blockedReason\(\)\)/);
  });

  it('a half-finished paper in this tab is not a way round it', () => {
    expect(page).toMatch(/blockedReason\(\) \? null : readAttempt\(unit\)/);
  });

  it('says which teacher setting is why, and that the best score stands', () => {
    const fn = page.slice(page.indexOf('function blockedReason'), page.indexOf('function paintRetakeLine'));
    expect(fn).toMatch(/Your teacher allows/);
    expect(fn).toMatch(/still stands/);
  });

  it('the rules say plainly that they do not enforce it', () => {
    // The whole point of writing this down: a reader who finds maxTestAttempts
    // in the class document must not assume the server is counting.
    const note = rules.slice(rules.indexOf('NOT ENFORCED HERE'), rules.indexOf('function validEvent'));
    expect(note).toMatch(/cannot check it/);
    expect(note).toMatch(/aggregat/);
    expect(note).toMatch(/client-side rule/);
  });

  it('the teacher copy does not claim more than it delivers', () => {
    const joined = html.replace(/\s+/g, ' ');
    expect(joined).toMatch(/keeps unlimited retakes/);
    expect(joined).toMatch(/not by the database/);
    const K = window.PyPathClassroom;
    expect(K.EXPLANATIONS.maxTestAttempts).toMatch(/not one the database enforces/);
    expect(K.EXPLANATIONS.maxTestAttempts).toMatch(/best score stands/);
  });
});

describe('the ratchet is untouched', () => {
  it('nothing in the cap path writes to the stored record', () => {
    // The cap stops new attempts. It must never reach mergeAttempt, which is
    // where "best never decreases" lives.
    const merge = page.slice(page.indexOf('function mergeAttempt'), page.indexOf('window.PyPathUnitTestPage'));
    expect(merge).not.toMatch(/cap|attemptsLeft|canSitTest|blockedReason/);
  });
});

describe('the controls exist where a teacher and a student would look', () => {
  it('the dashboard offers the setting beside the solutions toggle', () => {
    expect(html).toMatch(/data-cr-max-attempts/);
    expect(html).toMatch(/<option value="">Unlimited<\/option>/);
  });

  it('the test page has somewhere to say why the button is gone', () => {
    expect(testHtml).toMatch(/id="ut-gate"/);
    expect(testHtml).toMatch(/id="ut-retakes"/);
    expect(testHtml).toMatch(/id="ut-start-row"/);
  });

  it('the unlimited sentence is still the authored default', () => {
    // What a learner outside any class reads, unchanged.
    expect(testHtml).toMatch(/retake the test as many times as you like/);
  });
});

/* ------------------------------------------------------------------------
   The gate as a learner meets it, driven through the real page code rather
   than asserted about with a regex. The page fetches its question pools, so
   fetch is served from the repo's own data files.
   ------------------------------------------------------------------------ */

const PAGE_SRC = fs.readFileSync('assets/js/unit-test-page.js', 'utf8');

const PAGE_MARKUP = `
  <main>
    <p class="ut-eyebrow" id="ut-eyebrow" hidden></p>
    <h1 id="ut-title"></h1>
    <div id="ut-notice" hidden></div>
    <section class="ut-intro" id="ut-intro" hidden>
      <p id="ut-retakes">You can retake the test as many times as you like. Your best score is the
         one that counts, so a worse retake never takes anything away.</p>
      <p class="ut-best" id="ut-best" hidden></p>
      <p class="ut-gate" id="ut-gate" role="note" hidden></p>
      <p id="ut-start-row"><button type="button" id="ut-start">Start the test</button></p>
    </section>
    <form class="ut-paper" id="ut-paper" hidden>
      <div id="ut-mcq"></div>
      <section id="ut-frq"></section>
      <button type="submit" id="ut-submit">Submit the paper</button>
    </form>
    <section id="ut-result" hidden></section>
  </main>`;

function servePools() {
  window.fetch = (url) => {
    const file = 'assets/data/unit-tests/' + String(url).split('/').pop();
    if (!fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))) });
  };
}

/* Loaded once. Re-evaluating the file per test would leave every previous
   copy still listening for DOMContentLoaded, each with a stale unit number
   closed over, and they would fight over the same DOM. */
let pageLoaded = false;
function loadPageOnce() {
  if (pageLoaded) return;
  ['storage-keys', 'progress-store', 'roles', 'curriculum', 'classroom-policy',
    'unit-progress', 'unit-test', 'lesson-progress'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
  new Function(PAGE_SRC).call(window);
  pageLoaded = true;
}

async function openTest({ unit = 2, attempts = 0, best = 80, classPolicy = null } = {}) {
  loadPageOnce();
  servePools();
  localStorage.clear();
  sessionStorage.clear();
  // Unit 2 is open under the sequential chain once unit 1 is done, so these
  // cases are about the retake cap and nothing else.
  localStorage.setItem('pypath-completed-units', JSON.stringify([1]));
  if (attempts) {
    localStorage.setItem('pypath-unit-tests', JSON.stringify({
      [unit]: { best, passed: best >= 70, attempts, lastAt: 1, last: null },
    }));
  }
  history.pushState({}, '', `/unit-test.html?unit=${unit}`);
  document.body.className = 'page page-unit-test';
  document.body.innerHTML = PAGE_MARKUP;

  document.dispatchEvent(new Event('DOMContentLoaded'));
  // Two turns: the pool fetch resolves, then renderIntro runs.
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  document.dispatchEvent(new CustomEvent('pypath:policy', { detail: { policy: classPolicy } }));

  return {
    startShown: !document.getElementById('ut-start-row').hidden,
    gate: document.getElementById('ut-gate').hidden ? '' : document.getElementById('ut-gate').textContent,
    retakes: document.getElementById('ut-retakes').textContent,
    paperShown: () => !document.getElementById('ut-paper').hidden,
    clickStart: () => document.getElementById('ut-start').click(),
  };
}

describe('what a learner meets on the test page', () => {
  it('a self-study learner is offered the test after any number of sittings', async () => {
    const page = await openTest({ attempts: 12, classPolicy: null });
    expect(page.startShown).toBe(true);
    expect(page.gate).toBe('');
    expect(page.retakes).toMatch(/as many times as you like/);
    // And the paper really opens, so the negative cases below are measuring
    // the gate rather than a page that failed to boot.
    page.clickStart();
    expect(page.paperShown()).toBe(true);
  });

  it('a classroom student under the cap is offered it, and told what is left', async () => {
    const page = await openTest({ attempts: 1, classPolicy: policy(3) });
    expect(page.startShown).toBe(true);
    expect(page.gate).toBe('');
    expect(page.retakes).toMatch(/allows 3 attempts/);
    expect(page.retakes).toMatch(/used 1 of 3, so you have 2 attempts left/);
  });

  it('a classroom student who has used them all is refused, and told why', async () => {
    const page = await openTest({ attempts: 3, best: 84, classPolicy: policy(3) });
    expect(page.startShown).toBe(false);
    expect(page.gate).toMatch(/Your teacher allows 3 attempts/);
    expect(page.gate).toMatch(/used them all/);
    expect(page.gate).toMatch(/best score of 84 out of 100 still stands/);
  });

  it('cannot start the paper anyway by clicking a stale button', async () => {
    const page = await openTest({ attempts: 3, classPolicy: policy(3) });
    page.clickStart();
    expect(page.paperShown()).toBe(false);
  });

  it('is let through the moment their teacher raises the limit', async () => {
    const before = await openTest({ attempts: 3, classPolicy: policy(3) });
    expect(before.startShown).toBe(false);
    const after = await openTest({ attempts: 3, classPolicy: policy(5) });
    expect(after.startShown).toBe(true);
    expect(after.gate).toBe('');
  });

  it('is refused a locked unit before it counts attempts at all', async () => {
    // Unit 3 with only unit 1 done, in a by-hand class that has not opened it.
    const page = await openTest({
      unit: 3,
      attempts: 0,
      classPolicy: { mode: 'manual', manualUnlocks: [], assignmentUnlocks: [], maxTestAttempts: 3 },
    });
    expect(page.startShown).toBe(false);
    expect(page.gate).toMatch(/not open for your class yet/);
    expect(page.gate).not.toMatch(/attempts/);
  });
});
