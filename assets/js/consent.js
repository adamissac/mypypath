/* PyPath — the terms a new account has to agree to, and the record of it.

   Version-stamped on purpose. "They ticked a box once" is not a useful record
   if nobody can say which wording was on screen at the time, so consent is
   stored against the dated version below and a future change to the terms can
   be told apart from this one. */
(function () {
  'use strict';

  // Bump when terms.html or privacy.html change materially, and match the
  // "Last updated" dates on those pages.
  var TERMS_VERSION = '2026-10-05';

  var ERROR = 'Please agree to the Terms of use and acknowledge the Privacy policy to create an account.';

  // Takes the checkbox's checked state rather than the element, so the rule is
  // testable without a DOM and cannot be fooled by a missing element reading
  // as falsy-but-fine.
  function check(agreed) {
    if (agreed !== true) return { ok: false, error: ERROR };
    return { ok: true, error: null };
  }

  function checkAge(ageRange) {
    return { ok: ageRange === '13-plus' };
  }

  // Keep personal fields and OAuth unavailable until the age step is complete.
  // No age or birth date is written to storage or sent to a server here.
  var age = document.getElementById('signup-age');
  if (age) {
    age.addEventListener('change', function () {
      var eligible = checkAge(age.value).ok;
      document.getElementById('signup-details').disabled = !eligible;
      document.getElementById('signup-google').disabled = !eligible;
      document.getElementById('signup-github').disabled = !eligible;
      if (age.value === 'under-13') {
        // Do not encourage trying another age after an ineligible answer.
        age.disabled = true;
        document.getElementById('signup-form').reset();
        age.value = 'under-13';
        document.getElementById('school-access').hidden = false;
        document.getElementById('signup-age-hint').textContent =
          'Check your school code below. You cannot create an account until verified school enrollment is available.';
      }
    });
  }

  var schoolCheck = document.getElementById('school-code-check');
  if (schoolCheck) schoolCheck.addEventListener('click', async function () {
    var output = document.getElementById('school-code-result');
    var code = document.getElementById('school-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      output.textContent = 'Enter the six-character code from your teacher.';
      return;
    }
    schoolCheck.disabled = true;
    output.textContent = 'Checking school authorization…';
    try {
      var response = await fetch('/api/school-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({ code: code }), signal: AbortSignal.timeout(10000)
      });
      var result = response.ok ? await response.json() : null;
      output.textContent = result && result.status === 'school-approved-enrollment-pending'
        ? 'Your school authorization is on file. Account creation is not open yet. Ask your teacher for next steps.'
        : 'We could not confirm school access. Ask your teacher to contact PyPath. Your account has not been created.';
    } catch (_) {
      output.textContent = 'School access could not be checked. Ask your teacher for help. Your account has not been created.';
    } finally {
      schoolCheck.disabled = false;
    }
  });

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
    checkAge: checkAge,
    record: record,
    hasAccepted: hasAccepted
  };
})();
