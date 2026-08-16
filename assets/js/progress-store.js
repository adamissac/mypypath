/* PyPath — single owner of learner progress state.
   Local-first: every write hits localStorage, then optionally a remote adapter. */
(function () {
  'use strict';

  var KEYS = window.PyPathKeys;
  var UNITS_KEY = KEYS.COMPLETED_UNITS_KEY;

  var remote = null;

  function rawGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function rawSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function rawRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function pushRemote(key, value) {
    if (!remote || !KEYS.isSyncable(key)) return;
    try { remote.push(key, value); } catch (e) {}
  }

  function getCompletedUnits() {
    try {
      var parsed = JSON.parse(rawGet(UNITS_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(Number).filter(function (n) { return !isNaN(n); });
    } catch (e) {
      return [];
    }
  }

  function setCompletedUnits(list) {
    var unique = Array.from(new Set((list || []).map(Number)))
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });
    var value = JSON.stringify(unique);
    rawSet(UNITS_KEY, value);
    pushRemote(UNITS_KEY, value);
  }

  function getItem(key) { return rawGet(key); }

  function setItem(key, value) {
    rawSet(key, value);
    pushRemote(key, value);
  }

  function removeItem(key) {
    rawRemove(key);
    pushRemote(key, null);
  }

  function snapshot() {
    var out = {};
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (KEYS.isSyncable(k)) out[k] = localStorage.getItem(k);
      });
    } catch (e) {}
    return out;
  }

  function _setRemoteAdapter(adapter) { remote = adapter || null; }

  window.ProgressStore = {
    getCompletedUnits: getCompletedUnits,
    setCompletedUnits: setCompletedUnits,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    snapshot: snapshot,
    _setRemoteAdapter: _setRemoteAdapter
  };
})();
