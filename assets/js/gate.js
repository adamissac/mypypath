/* PyPath — content gate. Units past FREE_UNITS ask for an account.

   This is a conversion prompt, not access control: the lesson ships in the
   page source and anyone can read it with JavaScript off. Enforcement would
   need edge middleware or content in Firestore; both were rejected for this
   iteration. */
(function () {
  'use strict';

  var FREE_UNITS = 2;
  var FAIL_OPEN_MS = 3000;
  var UNIT_RE = /^\/units\/unit-(\d+)(?:\.html|\/[^/]+\.html)$/;

  function unitFromPath(pathname) {
    var m = UNIT_RE.exec(String(pathname || ''));
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return isNaN(n) ? null : n;
  }

  // A teacher is never gated. They are signed in anyway, so this only matters
  // in the window before auth resolves and if the free-unit boundary ever moves
  // above zero for signed-in accounts -- but a teacher hitting a paywall while
  // previewing a unit for their class is the failure worth ruling out outright.
  function isLocked(unit, signedIn, teaching) {
    if (teaching === true) return false;
    return unit !== null && unit > FREE_UNITS && !signedIn;
  }

  function safeNext(raw) {
    var value = String(raw || '');
    // Same-origin paths only. "//host" and "\\host" are both browser-resolvable
    // as other origins, so an unvalidated next is an open redirect.
    if (!value || value.charAt(0) !== '/') return '/progress.html';
    if (value.charAt(1) === '/' || value.charAt(1) === '\\') return '/progress.html';
    return value;
  }

  function paywallHtml(unit) {
    var next = encodeURIComponent(location.pathname);
    return '<div class="gate-paywall" data-gate-paywall>' +
      '<h2>Unit ' + unit + ' opens with a free account</h2>' +
      '<p>Units 1 and ' + FREE_UNITS + ' are free to everyone. An account opens the rest ' +
      'and keeps your progress on every device.</p>' +
      '<div class="gate-paywall__actions">' +
      '<a class="btn btn-primary" href="/signup.html?next=' + next + '">Create free account</a>' +
      '<a class="btn btn-ghost" href="/login.html?next=' + next + '">Sign in</a>' +
      '</div></div>';
  }

  function apply(state, unit) {
    document.documentElement.dataset.gate = state;
    if (state !== 'locked') {
      var old = document.querySelector('[data-gate-paywall]');
      if (old) old.remove();
      return;
    }
    if (document.querySelector('[data-gate-paywall]')) return;
    var main = document.querySelector('main');
    if (!main) return;
    main.insertAdjacentHTML('afterbegin', paywallHtml(unit));
  }

  function teaching() {
    var R = window.PyPathRoles;
    return !!(R && R.teachingNow());
  }

  function markLockedCards(signedIn) {
    var links = document.querySelectorAll('a[href^="/units/unit-"]');
    var teacher = teaching();
    Array.prototype.forEach.call(links, function (a) {
      // Header nav and footer link lists are not cards. Badging them would put
      // a lock on every unit in the dropdown menu on every page.
      if (a.closest('header, nav, footer')) return;
      // Only cards carry the badge. A bare link in a list has nowhere to put an
      // absolutely positioned badge without landing on top of the text.
      var card = a.closest('.unit-card, .curriculum-card, article');
      if (!card) return;
      card.classList.toggle('is-gate-locked', isLocked(unitFromPath(a.getAttribute('href')), signedIn, teacher));
    });
  }

  window.PyPathGate = {
    FREE_UNITS: FREE_UNITS,
    unitFromPath: unitFromPath,
    isLocked: isLocked,
    safeNext: safeNext,
    _apply: apply
  };

  if (typeof document === 'undefined' || !document.documentElement) return;

  var unit = unitFromPath(location.pathname);
  var settled = false;
  var signedInNow = false;

  function settle(signedIn) {
    settled = true;
    signedInNow = !!signedIn;
    if (unit !== null) apply(isLocked(unit, signedInNow, teaching()) ? 'locked' : 'open', unit);
    markLockedCards(signedInNow);
  }

  if (unit !== null) document.documentElement.dataset.gate = 'pending';

  document.addEventListener('pypath:auth', function (e) {
    settle(!!(e.detail && e.detail.user));
  });

  // The role resolves after auth does, so a teacher's first paint can land
  // before anyone knows they are a teacher. Re-settle when the role arrives.
  document.addEventListener('pypath:role', function () {
    if (settled) settle(signedInNow);
  });

  // Fail open. auth.js imports the Firebase SDK from gstatic.com; an ad blocker
  // or a dead network stops pypath:auth from ever firing, and a permanent
  // paywall for a signed-in learner is worse than a guest reading unit 5.
  setTimeout(function () {
    if (settled) return;
    settled = true;
    document.documentElement.dataset.gate = 'open';
    var old = document.querySelector('[data-gate-paywall]');
    if (old) old.remove();
  }, FAIL_OPEN_MS);
})();
