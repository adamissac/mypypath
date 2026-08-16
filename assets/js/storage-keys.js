/* PyPath — which localStorage keys sync, and how they map to Firestore doc ids */
(function () {
  'use strict';

  var COMPLETED_UNITS_KEY = 'pypath-completed-units';

  // Allowlist, deliberately. A new pypath-* key must not sync until it is
  // added here on purpose.
  var SYNC_PATTERNS = [
    /^pypath-completed-units$/,
    /^pypath-lesson-.+/,
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
    isSyncable: isSyncable,
    toDocId: toDocId
  };
})();
