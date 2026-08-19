/* PyPath — single owner of learner progress state.
   Local-first: every write hits localStorage, then optionally a remote adapter. */
(function () {
  'use strict';

  var KEYS = window.PyPathKeys;

  // Degraded local-only mode: if storage-keys.js failed to load (CDN blip,
  // stale cache, missing script tag), don't let this module throw and take
  // down every consumer's init sequence with it. Nothing syncs, but reads
  // and writes to localStorage keep working.
  var UNITS_KEY = KEYS ? KEYS.COMPLETED_UNITS_KEY : 'pypath-completed-units';
  function isSyncable(key) {
    return KEYS ? KEYS.isSyncable(key) : false;
  }

  var STAMPS_KEY = 'pypath-progress-stamps';

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

  function readStamps() {
    try {
      var parsed = JSON.parse(rawGet(STAMPS_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch (e) {
      return {};
    }
  }
  function writeStamps(obj) {
    rawSet(STAMPS_KEY, JSON.stringify(obj));
  }

  function stamp(key, when) {
    var s = readStamps();
    s[key] = typeof when === 'number' ? when : Date.now();
    writeStamps(s);
  }
  function unstamp(key) {
    var s = readStamps();
    delete s[key];
    writeStamps(s);
  }

  function emit(key) {
    try {
      if (typeof document === 'undefined' || !document.dispatchEvent) return;
      document.dispatchEvent(new CustomEvent('pypath:progress', { detail: { key: key } }));
    } catch (e) {}
  }

  function pushRemote(key, value) {
    if (!remote || !isSyncable(key)) return;
    try { remote.push(key, value); } catch (e) {}
  }

  function removeRemote(key) {
    if (!remote || !isSyncable(key)) return;
    if (typeof remote.remove !== 'function') return;
    try { remote.remove(key); } catch (e) {}
  }

  function isValidUnit(n) {
    return Number.isInteger(n) && n >= 1 && n <= 10;
  }

  function getCompletedUnits() {
    try {
      var parsed = JSON.parse(rawGet(UNITS_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(Number).filter(isValidUnit);
    } catch (e) {
      return [];
    }
  }

  function setCompletedUnits(list) {
    var unique = Array.from(new Set((list || []).map(Number)))
      .filter(isValidUnit)
      .sort(function (a, b) { return a - b; });
    var value = JSON.stringify(unique);
    rawSet(UNITS_KEY, value);
    stamp(UNITS_KEY);
    pushRemote(UNITS_KEY, value);
    emit(UNITS_KEY);
  }

  function getItem(key) { return rawGet(key); }

  function setItem(key, value) {
    rawSet(key, value);
    stamp(key);
    pushRemote(key, value);
    emit(key);
  }

  function removeItem(key) {
    rawRemove(key);
    unstamp(key);
    removeRemote(key);
    emit(key);
  }

  // Apply a value that came FROM the remote — write locally without
  // re-uploading it (that would re-echo to the server, clobber the real
  // updatedAt with "now", and double write billing).
  function applyRemote(key, value, updatedAt) {
    rawSet(key, value);
    stamp(key, updatedAt);
    emit(key);
  }

  function snapshot() {
    var out = {};
    try {
      var stamps = readStamps();
      Object.keys(localStorage).forEach(function (k) {
        if (isSyncable(k)) {
          out[k] = {
            content: localStorage.getItem(k),
            updatedAt: typeof stamps[k] === 'number' ? stamps[k] : 0
          };
        }
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
    applyRemote: applyRemote,
    snapshot: snapshot,
    _setRemoteAdapter: _setRemoteAdapter
  };
})();
