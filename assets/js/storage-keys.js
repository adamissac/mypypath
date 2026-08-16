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

  function toDocId(key) {
    return String(key).replace(/\//g, '__');
  }

  window.PyPathKeys = {
    COMPLETED_UNITS_KEY: COMPLETED_UNITS_KEY,
    isSyncable: isSyncable,
    toDocId: toDocId
  };
})();
