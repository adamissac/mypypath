/* PyPath — pure merge rules for reconciling local and remote learner state. */
(function () {
  'use strict';

  function mergeCompletedUnits(local, remote) {
    var all = [].concat(local || [], remote || []).map(Number)
      .filter(function (n) { return !isNaN(n); });
    return Array.from(new Set(all)).sort(function (a, b) { return a - b; });
  }

  function pickNewer(local, remote) {
    if (!local && !remote) return null;
    if (!local) return remote;
    if (!remote) return local;
    // Tie goes to remote so every device converges on the same value.
    return (local.updatedAt > remote.updatedAt) ? local : remote;
  }

  // How long a device may go on trusting the reconciliation it already did.
  //
  // sync.js merges local and remote state when pypath:auth fires -- but that
  // fires on every page load, not only on a real sign-in, and the merge reads
  // the learner's entire code collection: one Firestore read per saved editor.
  // Ungated, a learner deep in the course paid a few hundred reads to open each
  // lesson. Once per window instead, plus whenever a backgrounded tab comes
  // back stale, keeps cross-device pickup and cuts reads by well over 90%.
  var RESYNC_AFTER_MS = 15 * 60 * 1000;

  // How long a device may reconcile incrementally -- asking only for documents
  // written since it last looked -- before it owes a read of the whole code
  // collection. An incremental query returns only documents that were written,
  // so a document deleted on another device is invisible to it; the full scan
  // is what eventually notices. A day is far more often than a learner deletes
  // saved work, and rare enough to be a rounding error on the bill.
  var FULL_SCAN_AFTER_MS = 24 * 60 * 60 * 1000;

  function needsFullSync(lastSyncedAt, now, ttl) {
    var last = Number(lastSyncedAt);
    var span = Number(ttl);
    if (!isFinite(span) || span < 0) span = RESYNC_AFTER_MS;
    // Never synced on this device, or a stamp that will not parse.
    if (!isFinite(last) || last <= 0) return true;
    var age = Number(now) - last;
    // A stamp in the future means the clock moved backwards -- a timezone
    // change, an NTP correction, a device with a flat battery. Trusting it
    // would strand the learner unsynced for however long the skew lasts.
    if (!isFinite(age) || age < 0) return true;
    return age >= span;
  }

  window.PyPathMerge = {
    RESYNC_AFTER_MS: RESYNC_AFTER_MS,
    FULL_SCAN_AFTER_MS: FULL_SCAN_AFTER_MS,
    mergeCompletedUnits: mergeCompletedUnits,
    pickNewer: pickNewer,
    needsFullSync: needsFullSync
  };
})();
