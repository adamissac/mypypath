// Run with the real local site and Auth/Firestore emulators running:
// PYPATH_TEST_BASE=http://localhost:8199 node tests/browser/teacher-actions.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.PYPATH_TEST_BASE || 'http://localhost:8199';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Emulator-only audit');
const run = Date.now();
const browser = await chromium.launch();
const failures = [];
let passed = 0;
async function check(name, fn) {
  try { await fn(); console.log('PASS', name); passed++; }
  catch (e) { failures.push(name); console.error('FAIL', name, e.message); }
}
async function call(page, name, ...args) {
  return page.evaluate(async ({ name, args }) => {
    const store = await import('/assets/js/classroom-store.js');
    return store[name](...args);
  }, { name, args });
}
async function sdk(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const { db, SDK_VERSION } = await import('/assets/js/firebase-config.js');
    const f = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);
    const ref = f.doc(db, path);
    if (data) await f.setDoc(ref, data, { merge: true });
    await f.waitForPendingWrites(db);
    const snap = await f.getDocFromServer(ref);
    return snap.exists() ? snap.data() : null;
  }, { path, data });
}
async function account(label, role) {
  const context = await browser.newContext({ timezoneId: 'America/New_York', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('requestfailed', req => {
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') console.error('REQUEST FAILED', req.url(), req.failure()?.errorText);
  });
  await page.goto(base + '/account.html');
  const uid = await page.evaluate(async ({ email, role }) => {
    const { auth, db, SDK_VERSION } = await import('/assets/js/firebase-config.js');
    const a = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
    const f = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);
    const { user } = await a.createUserWithEmailAndPassword(auth, email, 'emulator-only-password');
    await a.updateProfile(user, { displayName: email.split('@')[0] });
    await f.setDoc(f.doc(db, `users/${user.uid}`), { role }, { merge: true });
    (await import('/assets/js/profile.js')).invalidateProfile(user.uid);
    return user.uid;
  }, { email: `${label}-${run}@pypath.test`, role });
  await page.waitForFunction(() => !!window.PyPathRoles);
  return { page, uid, context };
}
async function dashboard(page) {
  await page.goto(base + '/classroom.html');
  await page.waitForSelector('[data-cr-root][aria-busy="false"]');
}
async function waitFor(page, fn, arg) {
  await page.waitForFunction(fn, arg);
}
// waitForFunction treats an async callback's Promise as truthy and returns at
// once, so anything that reads Firestore polls the resolved value from here.
async function until(page, fn, arg, timeout = 12000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${fn.toString().slice(0, 80)}`);
    await new Promise(r => setTimeout(r, 200));
  }
}
async function join(student, code) {
  return student.page.evaluate(async ({ uid, code }) =>
    (await import('/assets/js/join-flow.js')).joinAnyClass(uid, code), { uid: student.uid, code });
}
// Fixture writes alone bypass rules, solely to represent records older than a year.
async function oldEvent(classId, uid) {
  const url = `http://127.0.0.1:8081/v1/projects/mypypath/databases/(default)/documents/classes/${classId}/roster/${uid}/events/old`;
  const res = await fetch(url, { method: 'PATCH', headers: {
    Authorization: 'Bearer owner', 'Content-Type': 'application/json',
  }, body: JSON.stringify({ fields: {
    type: { stringValue: 'lesson.opened' },
    at: { timestampValue: new Date(Date.now() - 366 * 86400000).toISOString() },
    unit: { integerValue: '1' }, lessonPath: { stringValue: '/units/unit-1/what-is-python.html' },
    payload: { mapValue: { fields: {} } }, schemaVersion: { integerValue: '1' },
  } }) });
  assert(res.ok, await res.text());
}

try {
  const teacher = await account('teacher', 'teacher');
  const co = await account('colleague', 'teacher');
  const student = await account('learner', 'student');
  const { page: t } = teacher;
  const room = await call(t, 'createClass', teacher.uid, `Audit ${run}`);
  const room2 = await call(t, 'createClass', teacher.uid, `Second ${run}`);
  const due = Date.now() + 7 * 86400000;
  const lesson = '/units/unit-1/what-is-python.html';
  await check('class creation, index, timezone and rename persist', async () => {
    assert((await call(t, 'classesFor', teacher.uid)).some(c => c.id === room.classId));
    assert.equal((await call(t, 'readClass', room.classId)).timezone, 'America/New_York');
    await call(t, 'renameClass', room.classId, `Audit renamed ${run}`);
    assert.equal((await call(t, 'readClass', room.classId)).name, `Audit renamed ${run}`);
  });
  await join(student, room.joinCode);
  await dashboard(t);
  await check('joined student appears in teacher roster', async () => {
    await waitFor(t, uid => document.querySelector(`[data-cr-student-pick] option[value="${uid}"]`), student.uid);
  });
  let assignment;
  await check('screenshot flow: assign individual lessons using the form', async () => {
    await t.locator('summary').filter({ hasText: 'Set new work' }).click();
    await t.locator('#cr-assign-title').fill('Introduction to Python');
    await t.locator('#cr-assign-due').fill('2027-02-10');
    await t.locator('[data-cr-assign-lesson]').first().check();
    await t.locator('[data-cr-assign-form] button[type="submit"]').click();
    await waitFor(t, () => document.querySelector('[data-cr-assign-list]')?.textContent.includes('Introduction to Python'));
    assignment = (await call(t, 'readAssignments', room.classId))[0];
    assert(assignment.lessonPaths.length > 0);
    assert((await call(student.page, 'readAssignments', room.classId)).some(a => a.id === assignment.id));
  });
  await check('unit modes, manual access, solutions and retake cap save from UI', async () => {
    await t.locator('input[name="cr-lock-mode"][value="manual"]').check();
    await t.locator('[data-cr-access-units]').waitFor({ state: 'visible' });
    await t.locator('[data-cr-access-unit][value="3"]').check();
    await t.locator('[data-cr-show-solutions]').uncheck();
    await t.locator('[data-cr-max-attempts]').selectOption('2');
    await until(t, async classId => {
      const c = await (await import('/assets/js/classroom-store.js')).readClass(classId);
      return c.lockMode === 'manual' && c.manualUnlocks.includes(3) && c.showSolutions === false && c.maxTestAttempts === 2;
    }, room.classId);
    for (const mode of ['free', 'sequential']) {
      await call(t, 'setLockPolicy', room.classId, mode, []);
      assert.equal((await call(t, 'readClass', room.classId)).lockMode, mode);
    }
    await call(t, 'setMaxTestAttempts', room.classId, null);
    assert.equal((await call(t, 'readClass', room.classId)).maxTestAttempts, null);
  });
  await check('unit and quiz assignments open units for actual student writes', async () => {
    await call(t, 'setLockPolicy', room.classId, 'manual', []);
    const quiz = await call(t, 'createAssignment', room.classId, {
      title: 'Quiz', units: [], lessonPaths: [], dueAt: due,
      quiz: { unit: 4, questionIds: ['q4-match-1'], passMark: 70, attempts: 2 },
    });
    await call(student.page, 'writeEvents', room.classId, student.uid, [{
      type: 'quiz.submitted', unit: 4, lessonPath: '',
      payload: { assignmentId: quiz.id, score: 100, correct: 1, total: 1, attempt: 1 },
    }]);
    await call(t, 'deleteAssignment', room.classId, quiz.id);
    assert(!(await call(t, 'readClass', room.classId)).assignmentUnlocks.includes(4));
    await assert.rejects(call(student.page, 'writeEvents', room.classId, student.uid, [{
      type: 'quiz.submitted', unit: 4, lessonPath: '', payload: {},
    }]), /permission/i);
    const work = await call(t, 'createAssignment', room.classId, { title: 'Whole unit', units: [5], dueAt: due });
    await call(t, 'updateAssignment', room.classId, work.id, { title: 'Edited', units: [6], dueAt: due + 86400000 });
    assert((await call(t, 'readClass', room.classId)).assignmentUnlocks.includes(6));
    assert(!(await call(t, 'readClass', room.classId)).assignmentUnlocks.includes(5));
    await call(t, 'deleteAssignment', room.classId, work.id);
  });
  await check('duplicate, bulk assignments and rollover preserve data', async () => {
    const work = await call(t, 'createAssignment', room.classId, { title: 'Copy me', units: [2], dueAt: due });
    const copy = await call(t, 'duplicateAssignment', room.classId, work.id, room2.classId, { dueAt: due + 86400000 });
    assert.notEqual(copy.id, work.id);
    const bulk = await call(t, 'createAssignmentIn', [room.classId, room2.classId], { title: 'Both classes', units: [3], dueAt: due });
    assert(bulk.every(r => r.ok));
    const rolled = await call(t, 'rolloverClass', teacher.uid, room.classId, { name: 'Next term', shiftMs: 86400000 });
    assert.equal(rolled.failed.length, 0);
    assert.notEqual(rolled.joinCode, room.joinCode);
    assert.equal((await call(t, 'readRoster', rolled.classId)).length, 0);
    assert.equal((await call(t, 'readClass', rolled.classId)).showSolutions, false);
  });
  await check('grade and due-date overrides can be read by student and withdrawn', async () => {
    const work = await call(t, 'createAssignment', room.classId, { title: 'Extension', units: [1], dueAt: due });
    const by = { uid: teacher.uid, name: 'Teacher' };
    const ext = await call(t, 'setDueOverride', room.classId, student.uid, work.id, due + 86400000, 'Extra time', by);
    const grade = await call(t, 'setGradeOverride', room.classId, student.uid, 1, 80, 100, 'Reviewed', by);
    assert.equal((await call(student.page, 'readOverrides', room.classId, student.uid)).length, 2);
    await call(t, 'clearOverride', room.classId, student.uid, ext.id);
    await call(t, 'clearOverride', room.classId, student.uid, grade.id);
    assert.equal((await call(t, 'readOverrides', room.classId, student.uid)).length, 0);
  });
  await check('certificate approval and decline reach the student record', async () => {
    await sdk(student.page, `roster/${student.uid}`, { hasCertificate: true, certificateRequestedAt: Date.now() });
    await dashboard(t);
    await t.locator('[data-cr-fold="certs"] > summary').click();
    for (const [action, expected] of [['Approve', true], ['Decline', false]]) {
      await t.getByRole('button', { name: new RegExp(`^${action} the certificate`) }).click();
      await until(t, async ({ uid, expected }) => {
        const { db, SDK_VERSION } = await import('/assets/js/firebase-config.js');
        const f = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);
        await f.waitForPendingWrites(db);
        return (await f.getDocFromServer(f.doc(db, `roster/${uid}`))).data().certificateApproved === expected;
      }, { uid: student.uid, expected });
      assert.equal((await sdk(student.page, `roster/${student.uid}`)).certificateApproved, expected);
    }
  });
  await check('co-teacher can discover shared class without access to private profile', async () => {
    await t.locator('[data-cr-fold="share"] > summary').click();
    await t.locator('#cr-coteacher').fill(co.uid);
    await t.locator('[data-cr-share] button[type="submit"]').click();
    await waitFor(t, uid => document.querySelector('[data-cr-teachers]').textContent.includes(uid), co.uid);
    assert((await call(co.page, 'classesFor', co.uid)).some(c => c.id === room.classId), 'Shared class is missing from recipient dashboard');
    await dashboard(co.page);
    assert.equal(await co.page.locator('[data-cr-switcher]').inputValue(), room.classId);
    await call(co.page, 'createAssignment', room.classId, { title: 'Co-teacher work', units: [1], dueAt: due });
    await t.getByRole('button', { name: `Remove co-teacher ${co.uid}`, exact: true }).click();
    await waitFor(t, uid => !document.querySelector('[data-cr-teachers]').textContent.includes(uid), co.uid);
    assert(!(await call(co.page, 'classesFor', co.uid)).some(c => c.id === room.classId));
    await assert.rejects(call(co.page, 'readAssignments', room.classId), /permission|evaluation error/i);
  });
  await dashboard(t);
  await check('roster filters, grid scopes, sorting and student drill-down work', async () => {
    for (const segment of ['attention', 'overdue', 'notstarted', 'idle', 'all']) {
      await t.locator(`[data-cr-seg="${segment}"]`).click();
      assert.equal(await t.locator(`[data-cr-seg="${segment}"]`).getAttribute('aria-pressed'), 'true');
    }
    await t.locator('[data-cr-roster-head] button').first().click();
    await t.locator('input[name="cr-view"][value="grid"]').locator('..').click();
    await t.locator('[data-cr-pane="grid"]').waitFor({ state: 'visible' });
    for (const scope of ['lessons', 'assignment', 'units']) {
      await t.locator(`input[name="cr-scope"][value="${scope}"]`).locator('..').click();
      assert(await t.locator('[data-cr-grid-head] th').count() > 1);
    }
    await t.locator('[data-cr-student-pick]').selectOption(student.uid);
    await t.locator('[data-sd-root]').waitFor({ state: 'visible' });
    await t.locator('[data-sd-root][aria-busy="false"]').waitFor();
    assert((await t.locator('[data-sd-name]').innerText()).includes('learner'));
    await t.locator('[data-sd-close]').click();
    await t.locator('[data-sd-root]').waitFor({ state: 'hidden' });
    await t.locator('input[name="cr-view"][value="roster"]').locator('..').click();
    await t.locator('[data-cr-info="joinCode"]').click();
    await t.locator('[data-cr-explain]').waitFor({ state: 'visible' });
    await t.locator('[data-cr-explain-close]').click();
  });
  await check('teacher forms, roster, grid and student panel fit phone through wide desktop', async () => {
    const opened = await t.locator('details').evaluateAll(nodes => nodes.map(n => n.open));
    await t.locator('details').evaluateAll(nodes => nodes.forEach(n => { n.open = true; }));
    async function fits(label) {
      const dimensions = await t.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('input:not([type="hidden"]), select, textarea, button')]
          .filter(el => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || el.closest('[hidden], [aria-hidden="true"]')) return false;
            // Grid cells deliberately scroll inside their table container.
            if (el.closest('.cr-tablewrap')) return false;
            return r.left < -1 || r.right > document.documentElement.clientWidth + 1;
          }).map(el => el.id || el.textContent.trim().slice(0, 40)),
      }));
      assert(dimensions.page <= dimensions.viewport + 1, `${label}: page ${dimensions.page}px exceeds ${dimensions.viewport}px`);
      assert.deepEqual(dimensions.controls, [], `${label}: controls outside screen`);
    }
    try {
      for (const [width, height] of [[320,568], [390,844], [768,1024], [844,390], [1024,768], [1440,900], [1920,1080]]) {
        await t.setViewportSize({ width, height });
        await fits(`roster at ${width}`);
        await t.locator('[data-account-avatar]').click();
        await t.locator('[data-account-panel]').waitFor({ state: 'visible' });
        await fits(`account menu at ${width}`);
        for (const item of await t.locator('[data-account-panel] [role="menuitem"]').all()) {
          if (await item.isVisible()) await item.click({ trial: true });
        }
        await t.locator('[data-account-avatar]').click();
        await t.locator('input[name="cr-view"][value="grid"]').locator('..').click();
        await fits(`grid at ${width}`);
        await t.locator('input[name="cr-view"][value="roster"]').locator('..').click();
        await t.locator('[data-cr-student-pick]').selectOption(student.uid);
        await t.locator('[data-sd-root][aria-busy="false"]').waitFor();
        await fits(`student panel at ${width}`);
        await t.locator('[data-sd-close]').click();
      }
    } finally {
      await t.setViewportSize({ width: 1280, height: 720 });
      await t.locator('details').evaluateAll((nodes, states) => nodes.forEach((n, i) => { n.open = states[i]; }), opened);
    }
  });
  await check('copy code, CSV, Excel, weekly summary and print controls work', async () => {
    await t.locator('[data-cr-copy]').click();
    assert.equal(await t.evaluate(() => navigator.clipboard.readText()), room.joinCode);
    await t.locator('[data-cr-fold="reports"] > summary').click();
    for (const [selector, suffix] of [['[data-cr-export]', '.csv'], ['[data-cr-export-xlsx]', '.xlsx']]) {
      const download = t.waitForEvent('download');
      await t.locator(selector).click();
      const file = await download;
      assert(file.suggestedFilename().endsWith(suffix));
      const bytes = await readFile(await file.path());
      assert(bytes.length > 100);
      if (suffix === '.csv') assert(bytes.toString().includes('learner'));
      else assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    }
    await t.locator('[data-cr-digest]').click();
    const digest = await t.locator('[data-cr-digest-text]').inputValue();
    assert(digest.includes(`Audit renamed ${run}`));
    await t.locator('[data-cr-digest-copy]').click();
    assert.equal(await t.evaluate(() => navigator.clipboard.readText()), digest);
    await t.evaluate(() => { window.print = () => { window.__printed = true; }; });
    await t.locator('[data-cr-print]').click();
    assert(await t.evaluate(() => window.__printed));
  });
  await check('quiz builder and assignment removal work through visible controls', async () => {
    await t.locator('summary').filter({ hasText: 'Set new work' }).click();
    await t.locator('#cr-assign-title').fill('UI quiz');
    await t.locator('#cr-assign-due').fill('2027-02-11');
    await t.locator('[data-cr-quiz-unit]').selectOption('2');
    await t.locator('[data-cr-quiz-list] input[type="checkbox"]').first().check();
    await t.locator('[data-cr-assign-form] button[type="submit"]').click();
    const card = t.locator('[data-cr-assign-list] > li').filter({ hasText: 'UI quiz' });
    await card.waitFor();
    assert((await call(t, 'readAssignments', room.classId)).find(a => a.title === 'UI quiz').quiz.questionIds.length === 1);
    t.once('dialog', dialog => dialog.accept());
    await card.getByRole('button', { name: 'Remove', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    assert(!(await call(student.page, 'readAssignments', room.classId)).some(a => a.title === 'UI quiz'));
  });
  await check('new-class UI clears old assignments and subscribes to new roster', async () => {
    assert((await t.locator('[data-cr-assign-list]').innerText()).includes('Introduction to Python'));
    await t.locator('[data-cr-new-class]').click();
    await t.locator('#cr-class-name').fill('Brand new room');
    await t.locator('[data-cr-create] button[type="submit"]').click();
    await waitFor(t, () => document.querySelector('[data-cr-switcher]')?.selectedOptions[0]?.textContent === 'Brand new room');
    assert.equal(await t.locator('[data-cr-assign-list] > li').count(), 0, 'Assignments from previous class leaked into new class');
    const newId = await t.locator('[data-cr-switcher]').inputValue();
    const newcomer = await account('newcomer', 'student');
    await join(newcomer, (await call(t, 'readClass', newId)).joinCode);
    await waitFor(t, uid => document.querySelector(`[data-cr-student-pick] option[value="${uid}"]`), newcomer.uid);
  });
  await check('repeated submit creates only one assignment', async () => {
    const id = await t.locator('[data-cr-switcher]').inputValue();
    await t.locator('summary').filter({ hasText: 'Set new work' }).click();
    await t.locator('#cr-assign-title').fill('Submit once');
    await t.locator('#cr-assign-due').fill('2027-02-12');
    await t.locator('[data-cr-assign-unit][value="1"]').check();
    await t.locator('[data-cr-assign-form]').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await waitFor(t, () => document.querySelector('[data-cr-assign-list]').textContent.includes('Submit once'));
    assert.equal((await call(t, 'readAssignments', id)).filter(a => a.title === 'Submit once').length, 1);
  });
  await check('archiving blocks joining and reopening restores it', async () => {
    await call(t, 'setArchived', room2.classId, true);
    const newcomer = await account('archive-join', 'student');
    await assert.rejects(join(newcomer, room2.joinCode), /archived|closed/i);
    await call(t, 'setArchived', room2.classId, false);
    await join(newcomer, room2.joinCode);
  });
  await check('purging recent records fails honestly and keeps roster reachable', async () => {
    await call(t, 'setArchived', room.classId, true);
    await assert.rejects(call(t, 'purgeArchivedClass', room.classId), /year|recent|retention/i);
    assert((await call(t, 'readRoster', room.classId)).some(r => r.uid === student.uid), 'Purge stranded records by deleting the roster');
    await call(t, 'setArchived', room.classId, false);
  });
  await check('eligible archived purge removes events, mirrors, summaries and overrides', async () => {
    const oldRoom = await call(t, 'createClass', teacher.uid, 'Old room');
    const oldStudent = await account('old-learner', 'student');
    await join(oldStudent, oldRoom.joinCode);
    await oldEvent(oldRoom.classId, oldStudent.uid);
    await sdk(oldStudent.page, `classes/${oldRoom.classId}/roster/${oldStudent.uid}/progress/example`, { content: 'saved code' });
    await oldStudent.page.evaluate(async ({ classId, uid }) => {
      const { db, SDK_VERSION } = await import('/assets/js/firebase-config.js');
      const f = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);
      await f.setDoc(f.doc(db, `classes/${classId}/roster/${uid}/summary/current`), {
        schemaVersion: 1, updatedAt: f.serverTimestamp(), lessons: {}, units: {}, quizzes: {},
        exercises: {}, flagged: [], lastLessonPath: '', lastEventAt: 0,
      });
    }, { classId: oldRoom.classId, uid: oldStudent.uid });
    await call(t, 'setGradeOverride', oldRoom.classId, oldStudent.uid, 1, 70, 100, 'Reviewed', { uid: teacher.uid });
    await call(t, 'setArchived', oldRoom.classId, true);
    const result = await call(t, 'purgeArchivedClass', oldRoom.classId);
    assert.equal(result.students, 1);
    assert.equal((await call(t, 'readEvents', oldRoom.classId, oldStudent.uid)).length, 0);
    assert.equal(await sdk(t, `classes/${oldRoom.classId}/roster/${oldStudent.uid}/progress/example`), null);
    assert.equal((await call(t, 'readOverrides', oldRoom.classId, oldStudent.uid)).length, 0);
    assert.equal(await sdk(t, `classes/${oldRoom.classId}/roster/${oldStudent.uid}/summary/current`), null);
  });
} finally {
  await browser.close();
}
console.log(`\n${passed} passed; ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
