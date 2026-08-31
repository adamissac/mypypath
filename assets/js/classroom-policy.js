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

  function unitOfPath(path) {
    var m = /^\/units\/unit-(\d+)\//.exec(String(path || ''));
    return m ? Number(m[1]) : null;
  }

  /* Which units are held open because work was set on them.
   *
   * This lives here rather than in classroom-core.js, where it used to, for one
   * reason: this file is loaded on every lesson page and that one is not. When
   * this was over there, class-policy.js read window.PyPathClassroom, found it
   * undefined on every lesson a student opens, and quietly substituted an empty
   * list -- so the guarantee the unit access panel prints in as many words, that
   * a unit you assign is always reachable whatever the mode says, held only on
   * the teacher's dashboard and never anywhere a student is actually gated.
   *
   * Due dates are deliberately not consulted. An assignment that has come and
   * gone still has to be openable, or a student marked late for it has no way
   * to go and do it.
   */
  function assignmentUnlocks(assignments, now) {
    var seen = {};
    (assignments || []).forEach(function (a) {
      if (!a || a.archived === true) return;
      (a.units || []).forEach(function (u) {
        var n = Number(u);
        if (Number.isInteger(n) && n >= 1) seen[n] = true;
      });
      (a.lessonPaths || []).forEach(function (path) {
        var n = unitOfPath(path);
        if (n !== null) seen[n] = true;
      });
    });
    return Object.keys(seen).map(Number).sort(function (x, y) { return x - y; });
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

  /* Whether a learner may reveal an exercise solution.
   *
   * A teacher always may: they are checking the exercise, not sitting it.
   * No policy at all means yes, which is what a learner outside any class has
   * always had. Only an explicit false from their class turns it off, so a
   * class that predates the setting, an offline page and a denied read all
   * leave the button where it was.
   *
   * Worth being exact about what this does. The solutions are part of the
   * lesson's own HTML -- window.exerciseSolutions, in the page -- so this
   * removes the button, not the answer. Anyone who opens the page source can
   * still read it. It is a setting about what the site offers, not a lock, and
   * the teacher's copy says so in as many words.
   */
  function solutionsAllowed(policy, teaching) {
    if (teaching === true) return true;
    if (!policy || typeof policy !== 'object') return true;
    return policy.showSolutions !== false;
  }

  window.PyPathPolicy = {
    MODES: MODES,
    normalizeMode: normalizeMode,
    resolveUnlocked: resolveUnlocked,
    assignmentUnlocks: assignmentUnlocks,
    solutionsAllowed: solutionsAllowed
  };
})();
