/* PyPath — account roles and classroom join codes.

   Two roles. `student` is the default; a student with no teacher attached
   behaves exactly as a personal account did before roles existed. `teacher`
   owns a join code and a roster, and is never held behind a learner gate.

   Everything above the session-role section is pure rules with no I/O, so it
   can be loaded straight into a test with new Function(src).call(window). */
(function () {
  'use strict';

  var ROLES = ['student', 'teacher'];
  var DEFAULT_ROLE = 'student';

  var CODE_LENGTH = 6;

  // No O/0, I/1, or S/5. A join code gets read off a whiteboard and typed by a
  // room full of people; ambiguous glyphs turn into support requests.
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';
  var CODE_RE = /^[ABCDEFGHJKLMNPQRTUVWXY2346789]{6}$/;

  function isRole(value) {
    return typeof value === 'string' && ROLES.indexOf(value) !== -1;
  }

  // Accounts created before roles existed have no role field, and `personal`
  // is what the role used to be called before the vocabulary shrank to two
  // values. Both, and anything else unrecognized, fall back to `student` --
  // a student with no teacher attached behaves exactly as a personal account
  // did.
  function normalizeRole(value) {
    if (value === 'personal') return DEFAULT_ROLE;
    return isRole(value) ? value : DEFAULT_ROLE;
  }

  function isTeacher(value) {
    return normalizeRole(value) === 'teacher';
  }

  // Typed codes arrive with stray spaces, hyphens, and lowercase. Normalize
  // before validating so "abc-123" and "ABC123" are the same code.
  function normalizeCode(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/[\s-]/g, '').toUpperCase();
  }

  function isValidCode(raw) {
    return CODE_RE.test(normalizeCode(raw));
  }

  // `random` is injected so the generator is testable and so callers can pass
  // crypto.getRandomValues-backed randomness rather than Math.random.
  function generateCode(random) {
    var rand = typeof random === 'function' ? random : Math.random;
    var out = '';
    for (var i = 0; i < CODE_LENGTH; i++) {
      var idx = Math.floor(rand() * CODE_ALPHABET.length);
      if (!(idx >= 0 && idx < CODE_ALPHABET.length)) idx = 0;
      out += CODE_ALPHABET.charAt(idx);
    }
    return out;
  }

  // Uniform over the alphabet: Math.random() * 29 is fine, but rejection
  // sampling over crypto bytes is not, and the modulo bias would show up as
  // some codes being issued more often than others.
  function cryptoRandom() {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) return Math.random();
    var buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }

  function fail(error) {
    return { ok: false, error: error };
  }

  // A student may sign up before their teacher has handed out the code, so an
  // empty code is allowed and simply leaves them unattached. Only teachers
  // skip this check now -- a bare `role !== 'student'` used to also cover
  // `personal` accounts, which no longer exist.
  function validateJoin(role, rawCode) {
    if (normalizeRole(role) !== 'student') return { ok: true, code: '', error: null };
    var code = normalizeCode(rawCode);
    if (!code) return { ok: true, code: '', error: null };
    if (!isValidCode(code)) {
      return fail('That join code does not look right. It is ' + CODE_LENGTH +
        ' letters and numbers, for example ' + generateCode(function () { return 0.5; }) + '.');
    }
    return { ok: true, code: code, error: null };
  }

  // ---------- session role ----------

  // The role lives in Firestore, which no classic script can read synchronously
  // on load. gate.js and lesson-progress.js both have to decide whether to lock
  // content before the first paint, so role-nav.js writes the resolved role here
  // and they read it back.
  //
  // Cached without the uid, unlike the per-account cache in role-nav.js: the
  // readers run before auth has told anyone who is signed in. That makes it a
  // hint rather than an authority, and the worst a stale value can do is open a
  // unit early for the few milliseconds until role-nav.js announces the real
  // role -- it can never lock a learner out of something they had earned.
  /* Retire role values written before the authoritative profile reader was in
     place. A bad cold-load answer from that version could say student for a
     real teacher until the browser session ended. */
  var SESSION_KEY = 'pypath-role:v2';

  function paintRoleAttr(role) {
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.role = role;
      }
    } catch (e) {}
  }

  function rememberRole(value) {
    var role = normalizeRole(value);
    try { sessionStorage.setItem(SESSION_KEY, role); } catch (e) {}
    paintRoleAttr(role);
    return role;
  }

  function lastKnownRole() {
    try { return normalizeRole(sessionStorage.getItem(SESSION_KEY)); }
    catch (e) { return DEFAULT_ROLE; }
  }

  function teachingNow() {
    return isTeacher(lastKnownRole());
  }

  window.PyPathRoles = {
    ROLES: ROLES,
    DEFAULT_ROLE: DEFAULT_ROLE,
    CODE_LENGTH: CODE_LENGTH,
    CODE_ALPHABET: CODE_ALPHABET,
    SESSION_KEY: SESSION_KEY,
    isRole: isRole,
    normalizeRole: normalizeRole,
    isTeacher: isTeacher,
    normalizeCode: normalizeCode,
    isValidCode: isValidCode,
    generateCode: generateCode,
    cryptoRandom: cryptoRandom,
    validateJoin: validateJoin,
    rememberRole: rememberRole,
    lastKnownRole: lastKnownRole,
    teachingNow: teachingNow
  };

  // So CSS can style a teacher's view without waiting on a round trip.
  paintRoleAttr(lastKnownRole());
})();
