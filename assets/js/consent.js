/* PyPath — the terms a new account has to agree to, and the record of it.

   Version-stamped on purpose. "They ticked a box once" is not a useful record
   if nobody can say which wording was on screen at the time, so consent is
   stored against the dated version below and a future change to the terms can
   be told apart from this one. */
(function () {
  'use strict';

  // Bump when terms.html or privacy.html change materially, and match the
  // "Last updated" dates on those pages.
  var TERMS_VERSION = '2026-08-19';

  var ERROR = 'Please agree to the Terms of use and Privacy policy to create an account.';

  // Takes the checkbox's checked state rather than the element, so the rule is
  // testable without a DOM and cannot be fooled by a missing element reading
  // as falsy-but-fine.
  function check(agreed) {
    if (agreed !== true) return { ok: false, error: ERROR };
    return { ok: true, error: null };
  }

  function record(when) {
    var ts = typeof when === 'number' && Number.isFinite(when) ? when : Date.now();
    return {
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: ts,
      privacyVersion: TERMS_VERSION,
    };
  }

  // An account created before this shipped, or through a path that never
  // showed the checkbox, has no record — treat that as "not yet agreed"
  // rather than silently assuming consent.
  function hasAccepted(userDoc) {
    if (!userDoc || typeof userDoc !== 'object') return false;
    return userDoc.termsVersion === TERMS_VERSION
      && typeof userDoc.termsAcceptedAt === 'number'
      && userDoc.termsAcceptedAt > 0;
  }

  window.PyPathConsent = {
    TERMS_VERSION: TERMS_VERSION,
    ERROR: ERROR,
    check: check,
    record: record,
    hasAccepted: hasAccepted
  };
})();
