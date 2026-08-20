/* PyPath — teacher approval on the end-of-course certificate.

   Finishing all ten units is enough on its own only for a learner with no
   teacher, which is the common case and stays untouched. A learner who is in a
   class has their finish sent to their teacher first, and waits.

   Same shape as certificate.js: pure rules on window.PyPathCertGate, then a
   page half that runs only on certificate.html. Nothing is imported
   statically, so the pure half can be loaded straight into a unit test with
   new Function(src).call(window) the way the other suites do -- a static
   `import` line would make the file unparseable as a classic script. The page
   half pulls auth.js and Firestore in with import() instead, which resolves to
   the very same module instances the rest of the site shares. */
(function () {
  'use strict';

  // ---------- pure rules ----------

  // The single source of truth for whether the certificate may be shown.
  // A missing teacher is the unattached learner; anything short of an explicit
  // `true` from a teacher is not approval, so a half-written or absent verdict
  // fails closed rather than opening the gate.
  function isUnlocked(complete, roster) {
    if (!complete) return false;
    var r = roster || {};
    if (!r.teacherUid) return true;
    return r.certificateApproved === true;
  }

  // A teacher who declined is still "not approved yet", never a hard failure:
  // they can approve later, and telling a learner they were rejected would be
  // wrong the moment their teacher changes their mind.
  function certificateState(complete, roster, signedIn) {
    if (!signedIn) return 'guest';
    if (!complete) return 'incomplete';
    return isUnlocked(complete, roster) ? 'ready' : 'pending';
  }

  // Whether this page view owes the roster a request stamp. False once one is
  // already there: the teacher's queue is ordered by that timestamp, so
  // rewriting it on every visit would both cost a write per page view and keep
  // shuffling a waiting learner back to the end of the line.
  function needsRequest(complete, roster) {
    if (!complete || !roster || !roster.teacherUid) return false;
    if (roster.certificateApproved === true) return false;
    var at = roster.certificateRequestedAt;
    return !(typeof at === 'number' && at > 0);
  }

  window.PyPathCertGate = {
    isUnlocked: isUnlocked,
    certificateState: certificateState,
    needsRequest: needsRequest
  };

  // ---------- page half ----------

  if (!document.body || document.body.className.indexOf('page-certificate') === -1) return;

  var CACHE_PREFIX = 'pypath-cert-gate:';

  var deps = null;
  var user = null;
  // null means "not read yet", which is different from {} meaning "read, and
  // this learner is in no class".
  var roster = null;
  var stamped = false;

  function qs(sel) { return document.querySelector(sel); }

  function isComplete() {
    var C = window.PyPathCertificate;
    var store = window.ProgressStore;
    return !!(C && C.isCourseComplete(store ? store.getCompletedUnits() : []));
  }

  function cached(uid) {
    try { return sessionStorage.getItem(CACHE_PREFIX + uid); } catch (e) { return null; }
  }

  function remember(uid, state) {
    try { sessionStorage.setItem(CACHE_PREFIX + uid, state); } catch (e) {}
  }

  // Returns null for "no opinion" -- either nobody is signed in or the roster
  // read has not landed yet -- which leaves certificate.js's own rendering
  // alone.
  function state() {
    if (!user) return null;
    if (roster === null) {
      // The read is still in flight, or it failed. A learner we last saw
      // waiting on their teacher keeps waiting, rather than being shown a
      // certificate that is about to be pulled back off the screen.
      return isComplete() && cached(user.uid) === 'pending' ? 'pending' : null;
    }
    return window.PyPathCertGate.certificateState(isComplete(), roster, true);
  }

  // certificate.js owns guest/incomplete/ready and re-renders on the same auth
  // and progress events this module listens to, so rather than duplicate its
  // logic the gate only ever downgrades: it shows `pending` and hides the rest,
  // or hides `pending` and says nothing. It gets the last word because the
  // deferred classic script is executed before this module, which puts its
  // listeners ahead of ours on every event; and the synchronous repaint below
  // happens before any await, so an in-flight read can never let the ready
  // section survive a repaint.
  function paint() {
    var s = state();
    var pending = qs('[data-cert-state="pending"]');
    if (!pending) return;
    pending.hidden = s !== 'pending';
    if (s !== 'pending') return;

    ['guest', 'incomplete', 'ready'].forEach(function (name) {
      var el = qs('[data-cert-state="' + name + '"]');
      if (el) el.hidden = true;
    });

    var C = window.PyPathCertificate;
    var at = roster && roster.certificateRequestedAt;
    var when = C && typeof at === 'number' ? C.formatDate(at) : '';
    var line = qs('[data-cert-requested-line]');
    if (line) line.hidden = !when;
    var el = qs('[data-cert-requested]');
    if (el) el.textContent = when;
  }

  // Every roster read and write on the site already lives in class-join.js;
  // going through it keeps the shape of these documents defined in one file.
  async function classJoin() {
    if (!deps) deps = await import('/assets/js/class-join.js');
    return deps;
  }

  async function readRoster(uid) {
    try {
      return await (await classJoin()).readRoster(uid);
    } catch (e) {
      // Offline, or the document is not readable. Leaving this null keeps the
      // gate silent instead of erroring the page out from under a learner who
      // simply lost their connection.
      return null;
    }
  }

  async function stampRequest(uid) {
    if (stamped || !window.PyPathCertGate.needsRequest(isComplete(), roster)) return;
    stamped = true;
    try {
      roster.certificateRequestedAt = await (await classJoin()).requestCertificate(uid);
      paint();
    } catch (e) {
      // The waiting screen is already up and the teacher sees the learner in
      // their class regardless; retry on the next visit.
      stamped = false;
    }
  }

  async function apply(next) {
    user = next || null;
    roster = null;
    paint();
    if (!user) return;

    var uid = user.uid;
    var data = await readRoster(uid);
    // Signed out or switched accounts while the read was in flight; the newer
    // call owns the page now.
    if (!user || user.uid !== uid) return;

    roster = data;
    paint();
    if (!data) return;
    remember(uid, state());
    await stampRequest(uid);
  }

  document.addEventListener('pypath:auth', function (e) { apply(e.detail.user); });
  document.addEventListener('pypath:progress', paint);
  document.addEventListener('DOMContentLoaded', paint);

  // auth.js may have announced the user before this module finished loading,
  // so the current value is read once here as well as listened for.
  import('/assets/js/auth.js').then(function (mod) {
    var known = mod.currentUser();
    if (known && !user) apply(known);
  }).catch(function () {});
})();
