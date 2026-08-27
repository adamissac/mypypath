/* PyPath — how a class decides which units are open.
 *
 * Pure rules, no I/O, so the lock can be argued with in a test rather than
 * through a Firestore read. class-policy.js fetches the class's settings and
 * hands the result here; lesson-progress.js asks the question.
 *
 * The single most important property in this file is that a null policy
 * reproduces the sequential chain exactly. "We do not know what this class
 * wants" is the answer for a guest, for an offline page, for a blocked SDK,
 * for a denied read and for a learner in no class at all, and every one of
 * those has to keep reading what they already earned. Failing open is not a
 * concession here, it is the default that the rest of the file is an exception
 * to.
 */
(function () {
  'use strict';

  /* Sequential is the chain that existed before any of this: unit N opens once
     N-1 is finished. Manual is the teacher's list and nothing else. Free opens
     everything to everyone.

     Free-roam does not cancel assignments. Navigation and required work are
     independent axes, and a class that can read ahead still owes what it was
     set. */
  var MODES = ['sequential', 'manual', 'free'];

  function normalizeMode(raw) {
    return MODES.indexOf(raw) === -1 ? 'sequential' : raw;
  }

  /* Storage and Firestore both hand back numbers as strings often enough that
     comparing without this is a bug waiting for one bad round trip. */
  function hasUnit(list, n) {
    if (!list || typeof list.length !== 'number') return false;
    for (var i = 0; i < list.length; i++) {
      if (Number(list[i]) === n) return true;
    }
    return false;
  }

  function sequentiallyOpen(n, completedUnits) {
    return hasUnit(completedUnits, n - 1);
  }

  /* `policy` is { mode, manualUnlocks, assignmentUnlocks } or null.

     The order of these checks is the design. Each one is a rule somebody would
     be right to be angry about if it came second. */
  function resolveUnlocked(unit, policy, completedUnits, teaching) {
    var n = Number(unit);
    if (!Number.isInteger(n) || n < 1) return false;

    // A teacher previewing unit 7 for tomorrow is not a learner working
    // through the course in order, and never has been.
    if (teaching === true) return true;

    // Unchanged behaviour for anyone whose class we could not ask.
    if (!policy || typeof policy !== 'object') {
      return n === 1 || sequentiallyOpen(n, completedUnits);
    }

    // A class that manages to lock unit 1 has locked its students out of the
    // whole course, which is never what anybody meant by any of the modes.
    if (n === 1) return true;

    var mode = normalizeMode(policy.mode);

    if (mode === 'free') return true;

    if (hasUnit(policy.manualUnlocks, n)) return true;

    // Set in every mode, including sequential. Marking a student late for work
    // they could not open is the one failure this feature must not have, so an
    // assigned unit is reachable regardless of how the class is gated.
    if (hasUnit(policy.assignmentUnlocks, n)) return true;

    // In manual mode the teacher's list is the whole truth. Adding to the
    // chain rather than replacing it would leave no way to re-lock a unit that
    // was opened by mistake, which is half of what manual mode is for.
    if (mode === 'manual') return false;

    return sequentiallyOpen(n, completedUnits);
  }

  window.PyPathPolicy = {
    MODES: MODES,
    normalizeMode: normalizeMode,
    resolveUnlocked: resolveUnlocked
  };
})();
