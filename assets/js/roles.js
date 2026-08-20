/* PyPath — account roles and classroom join codes: pure rules, no I/O.

   Three roles. `personal` is the default and behaves exactly as an account did
   before roles existed; `teacher` owns a join code and a roster; `student` is
   attached to at most one teacher at a time. */
(function () {
  'use strict';

  var ROLES = ['personal', 'student', 'teacher'];
  var DEFAULT_ROLE = 'personal';

  var CODE_LENGTH = 6;

  // No O/0, I/1, or S/5. A join code gets read off a whiteboard and typed by a
  // room full of people; ambiguous glyphs turn into support requests.
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';
  var CODE_RE = /^[ABCDEFGHJKLMNPQRTUVWXY2346789]{6}$/;

  function isRole(value) {
    return typeof value === 'string' && ROLES.indexOf(value) !== -1;
  }

  // Accounts created before roles existed have no role field. They are
  // personal accounts and must keep behaving like one.
  function normalizeRole(value) {
    return isRole(value) ? value : DEFAULT_ROLE;
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
  // empty code is allowed and simply leaves them unattached.
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

  window.PyPathRoles = {
    ROLES: ROLES,
    DEFAULT_ROLE: DEFAULT_ROLE,
    CODE_LENGTH: CODE_LENGTH,
    CODE_ALPHABET: CODE_ALPHABET,
    isRole: isRole,
    normalizeRole: normalizeRole,
    normalizeCode: normalizeCode,
    isValidCode: isValidCode,
    generateCode: generateCode,
    cryptoRandom: cryptoRandom,
    validateJoin: validateJoin
  };
})();
