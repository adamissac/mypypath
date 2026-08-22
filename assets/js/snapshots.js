/* PyPath — a short history of how a solution was written.
 *
 * A teacher looking at finished code cannot tell the student who worked it out
 * from the student who pasted it, and cannot see where the difficulty actually
 * was. A handful of snapshots shows the shape of the work.
 *
 * Pure: a ring buffer and a diff heuristic, no I/O. lesson-runner.js decides
 * when to take one and the progress store carries them.
 *
 * Storage discipline matters more here than anywhere else in this feature.
 * Snapshots are the only thing that grows without bound, so the caps below are
 * enforced on every write rather than tidied up later, and the same numbers
 * are written into the retention policy in privacy.html.
 */
(function () {
  'use strict';

  /* Twenty is enough to see the shape of the work and small enough that a
     whole class of them stays cheap. Oldest goes first. */
  var MAX_PER_EDITOR = 20;

  /* Hard ceiling per lesson regardless of count, so twenty snapshots of a
     large file cannot quietly become a megabyte. */
  var MAX_BYTES_PER_LESSON = 64 * 1024;

  /* A single snapshot larger than this is truncated rather than dropped: the
     fact that it happened is worth more than the tail of the text. */
  var MAX_SNAPSHOT_BYTES = 8 * 1024;

  /* Roughly a screenful of code arriving between one snapshot and the next.
     Labelled "large paste" and nothing more. This is not a plagiarism score
     and no number is derived from it: a student who typed fast, pasted their
     own earlier work, or used an example from the lesson all look identical
     here, and the only honest use of the flag is as a reason to ask a
     question. */
  var LARGE_INSERTION_CHARS = 120;

  function bytes(text) {
    return String(text == null ? '' : text).length;
  }

  /* Characters added since the previous snapshot. A plain length difference,
     deliberately: a real diff would let someone read a rewrite as an insertion
     or the reverse, and this number is only ever used to decide whether to
     show a neutral label. */
  function charsAdded(previous, next) {
    return Math.max(0, bytes(next) - bytes(previous));
  }

  function isLargeInsertion(previous, next) {
    return charsAdded(previous, next) >= LARGE_INSERTION_CHARS;
  }

  function truncate(code) {
    var text = String(code == null ? '' : code);
    return text.length <= MAX_SNAPSHOT_BYTES ? text : text.slice(0, MAX_SNAPSHOT_BYTES);
  }

  /* Adds one snapshot to an editor's history and returns the new history.
     Never mutates the input, so a caller cannot half-apply a write. */
  function push(history, code, at, reason) {
    var list = Array.isArray(history) ? history.slice() : [];
    var text = truncate(code);
    var previous = list.length ? list[list.length - 1].code : '';

    // Nothing changed, so there is nothing to record. Running the same code
    // three times is one state, not three.
    if (list.length && previous === text) return list;

    list.push({
      code: text,
      at: typeof at === 'number' ? at : Date.now(),
      added: charsAdded(previous, text),
      largeInsertion: list.length > 0 && isLargeInsertion(previous, text),
      reason: reason === 'run' ? 'run' : 'save'
    });

    while (list.length > MAX_PER_EDITOR) list.shift();
    return list;
  }

  function historyBytes(byEditor) {
    var total = 0;
    Object.keys(byEditor || {}).forEach(function (id) {
      (byEditor[id] || []).forEach(function (snap) { total += bytes(snap.code); });
    });
    return total;
  }

  /* Drops the oldest snapshots, across all editors on the lesson, until the
     whole lesson fits. Oldest first regardless of which editor it belongs to,
     so one busy editor cannot evict another editor's entire history. */
  function trimToBudget(byEditor) {
    var out = {};
    Object.keys(byEditor || {}).forEach(function (id) {
      out[id] = (byEditor[id] || []).slice();
    });

    while (historyBytes(out) > MAX_BYTES_PER_LESSON) {
      var oldestId = null;
      var oldestAt = Infinity;
      Object.keys(out).forEach(function (id) {
        if (out[id].length && out[id][0].at < oldestAt) {
          oldestAt = out[id][0].at;
          oldestId = id;
        }
      });
      if (!oldestId) break;
      out[oldestId].shift();
      if (!out[oldestId].length) delete out[oldestId];
    }
    return out;
  }

  function record(byEditor, editorId, code, at, reason) {
    var next = {};
    Object.keys(byEditor || {}).forEach(function (id) { next[id] = byEditor[id]; });
    next[editorId] = push(next[editorId], code, at, reason);
    return trimToBudget(next);
  }

  window.PyPathSnapshots = {
    MAX_PER_EDITOR: MAX_PER_EDITOR,
    MAX_BYTES_PER_LESSON: MAX_BYTES_PER_LESSON,
    MAX_SNAPSHOT_BYTES: MAX_SNAPSHOT_BYTES,
    LARGE_INSERTION_CHARS: LARGE_INSERTION_CHARS,
    charsAdded: charsAdded,
    isLargeInsertion: isLargeInsertion,
    push: push,
    record: record,
    historyBytes: historyBytes,
    trimToBudget: trimToBudget
  };
})();
