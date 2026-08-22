/* PyPath — which localStorage keys sync, and how they map to Firestore doc ids */
(function () {
  'use strict';

  var COMPLETED_UNITS_KEY = 'pypath-completed-units';
  var COMPLETED_AT_KEY = 'pypath-completed-at';
  var LESSON_PROGRESS_KEY = 'pypath-progress-lessons';
  var UNIT_TESTS_KEY = 'pypath-unit-tests';
  // Best auto-graded check result per exercise, keyed by lesson path.
  var CHECKS_PREFIX = 'pypath-checks-';
  // A short history of how each editor's code developed, keyed by lesson path.
  var SNAPSHOTS_PREFIX = 'pypath-snapshots-';

  // Allowlist, deliberately. A new pypath-* key must not sync until it is
  // added here on purpose.
  var SYNC_PATTERNS = [
    /^pypath-completed-units$/,
    /^pypath-completed-at$/,
    /^pypath-progress-lessons$/,
    /^pypath-unit-tests$/,
    /^pypath-lesson-.+/,
    /^pypath-checks-.+/,
    /^pypath-snapshots-.+/,
    /^exercise_.+/
  ];

  function isSyncable(key) {
    if (typeof key !== 'string') return false;
    return SYNC_PATTERNS.some(function (re) { return re.test(key); });
  }

  // `/` is illegal in a Firestore document id. Escape underscores first so the
  // mapping stays injective: without this, a literal `__` in a lesson filename
  // would be indistinguishable from an encoded `/`, and two different lessons
  // could collide onto one document.
  function toDocId(key) {
    return String(key).replace(/_/g, '_5F').replace(/\//g, '__');
  }

  window.PyPathKeys = {
    COMPLETED_UNITS_KEY: COMPLETED_UNITS_KEY,
    COMPLETED_AT_KEY: COMPLETED_AT_KEY,
    LESSON_PROGRESS_KEY: LESSON_PROGRESS_KEY,
    UNIT_TESTS_KEY: UNIT_TESTS_KEY,
    CHECKS_PREFIX: CHECKS_PREFIX,
    SNAPSHOTS_PREFIX: SNAPSHOTS_PREFIX,
    isSyncable: isSyncable,
    toDocId: toDocId
  };
})();
