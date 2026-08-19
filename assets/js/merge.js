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

  window.PyPathMerge = {
    mergeCompletedUnits: mergeCompletedUnits,
    pickNewer: pickNewer
  };
})();
