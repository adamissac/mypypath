/* PyPath — pure display-name rules: normalization and validation, no I/O.

   A username here is a person's real first and last name, shown to other
   learners. Email is the unique login identifier, so two learners who share a
   name are both allowed -- there is no global uniqueness claim. */
(function () {
  'use strict';

  // Per-part cap; the joined name is therefore at most 81 characters.
  var MAX_PART = 40;

  var RESERVED = [
    'admin', 'root', 'support', 'help', 'pypath',
    'moderator', 'mod', 'staff', 'system', 'api'
  ];

  // Unicode letters, because learners have names like Ada Lovelace-O'Brien,
  // Ana Sofía, and Ludwig van Beethoven. Must begin with a letter so a name
  // cannot be padded into a fake title (" Admin").
  var ALLOWED = /^\p{L}[\p{L}\p{M}'’\-. ]*$/u;

  function normalizePart(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(/\s+/g, ' ');
  }

  // Capitalization is preserved, never title-cased: "van Beethoven" and
  // "McDonald" are correct as typed and a naive title-case would break both.
  function format(first, last) {
    var f = normalizePart(first);
    var l = normalizePart(last);
    if (!f || !l) return '';
    return f + ' ' + l;
  }

  function fail(error) {
    return { ok: false, error: error };
  }

  function isReserved(value) {
    return RESERVED.indexOf(value.toLowerCase()) !== -1;
  }

  function validate(first, last) {
    var f = normalizePart(first);
    var l = normalizePart(last);

    if (!f) return fail('Enter your first name.');
    if (!l) return fail('Enter your last name.');
    if (f.length > MAX_PART) return fail('First name is at most ' + MAX_PART + ' characters.');
    if (l.length > MAX_PART) return fail('Last name is at most ' + MAX_PART + ' characters.');
    if (!ALLOWED.test(f) || !ALLOWED.test(l)) {
      return fail('Names use letters, spaces, hyphens, and apostrophes only.');
    }
    if (isReserved(f) || isReserved(l)) return fail('That name is reserved.');
    return { ok: true, error: null };
  }

  window.PyPathUsername = {
    MAX_PART: MAX_PART,
    RESERVED: RESERVED,
    normalizePart: normalizePart,
    format: format,
    validate: validate
  };
})();
