/* PyPath — pure username rules: normalization and validation, no I/O. */
(function () {
  'use strict';

  var MIN = 3;
  var MAX = 20;

  var RESERVED = [
    'admin', 'root', 'support', 'help', 'pypath',
    'moderator', 'mod', 'staff', 'system', 'api'
  ];

  var ALLOWED = /^[a-z0-9_]+$/;

  function normalize(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().toLowerCase();
  }

  function fail(error) {
    return { ok: false, error: error };
  }

  function validate(raw) {
    var name = normalize(raw);
    if (!name) return fail('Pick a username.');
    if (name.length < MIN) return fail('Usernames are at least ' + MIN + ' characters.');
    if (name.length > MAX) return fail('Usernames are at most ' + MAX + ' characters.');
    if (!ALLOWED.test(name)) return fail('Use letters, numbers, and underscores only.');
    if (name.charAt(0) === '_' || name.charAt(name.length - 1) === '_') {
      return fail('Usernames cannot start or end with an underscore.');
    }
    if (RESERVED.indexOf(name) !== -1) return fail('That username is reserved.');
    return { ok: true, error: null };
  }

  window.PyPathUsername = {
    MIN: MIN,
    MAX: MAX,
    RESERVED: RESERVED,
    normalize: normalize,
    validate: validate
  };
})();
