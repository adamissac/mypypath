/* PyPath — the landing after the cockpit's launch cutscene.
 *
 * cockpit.js sets a flag in sessionStorage just before it opens a unit. This
 * runs in the head of that unit page, before first paint, so the page is
 * already under the flash when it appears: it reads and clears the flag, and
 * marks <html> while the landing plays (unit-page.css draws it). A visitor
 * who asks for reduced motion gets neither the cutscene nor this, but the
 * flag is still used up so it cannot fire on a later visit.
 */
(function () {
  'use strict';

  var KEY = 'pypath-arrive';
  var flagged = false;
  try {
    flagged = window.sessionStorage.getItem(KEY) === '1';
    window.sessionStorage.removeItem(KEY);
  } catch (e) {
    return;
  }
  if (!flagged) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var root = document.documentElement;
  root.classList.add('is-arriving');
  window.setTimeout(function () { root.classList.remove('is-arriving'); }, 1100);
})();
