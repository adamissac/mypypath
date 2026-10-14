/* Summit — the home hero's artwork follows the selected course.
 *
 * Foundations shows the illustrated mountain (assets/img/summit-art.svg),
 * Python for Data the moon (data-moon.svg). Exactly one is mounted at a time:
 * the inactive one is detached so it cannot flash, take up space, or sit in
 * the accessibility tree. Both drawings carry their own gentle motion, inside
 * prefers-reduced-motion: no-preference. */
(function () {
  'use strict';

  var root = document.documentElement;
  var host = document.querySelector('.home-summit');
  var mountain = host && host.querySelector('.home-summit__mountain');
  var moon = host && host.querySelector('.home-summit__moon');
  if (!host || !mountain || !moon) return;

  function syncCourseArtwork() {
    var next = root.dataset.course === 'data' ? moon : mountain;
    if (host.firstElementChild !== next || host.children.length !== 1) host.replaceChildren(next);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncCourseArtwork, { once: true });
  } else {
    syncCourseArtwork();
  }
  new MutationObserver(syncCourseArtwork).observe(root, { attributes: true, attributeFilter: ['data-course'] });
})();
