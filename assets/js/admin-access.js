/* PyPath — who may see the admin dashboard.

   This file decides what the browser renders. It is NOT access control: the
   whole list ships in the page source and anyone can read it. Enforcement
   lives in firestore.rules, which refuses to hand a non-admin anyone else's
   documents no matter what this file says. Keep ADMIN_UIDS identical to the
   isAdmin() list in firestore.rules. */
(function () {
  'use strict';

  var ADMIN_UIDS = [
    'qwf4tTlGi3W1Vse6Za0RT8sVDz02', // sai.chowdarapu09@gmail.com
    'SJMr8717NFNORxruQIxM3jIM1Sr2', // vvihaankrishna@gmail.com
    'q05xHtWt12QDvbWG4ZluhvpUw3W2'  // adamissac08@gmail.com
  ];

  function isAdminUid(uid) {
    return typeof uid === 'string' && ADMIN_UIDS.indexOf(uid) !== -1;
  }

  function isAdmin(user) {
    return !!user && isAdminUid(user.uid);
  }

  // ---------- roster paging ----------

  // How many user documents one query pulls. The dashboard used to read the
  // whole `users` collection in a single query, which is one Firestore read per
  // account every time an admin opened the page -- fine at a hundred learners,
  // a bill at ten thousand, and past roughly fifty thousand the page simply
  // stops loading. Big enough that a small site is still one page.
  var PAGE_SIZE = 200;

  // The query carries no total, so the only signal that the scan is finished is
  // a page that came back short. A page that exactly fills the limit is
  // ambiguous -- there may be nothing after it -- and has to be followed by one
  // more query to find out.
  function isLastPage(received, pageSize) {
    var got = Number(received);
    var size = Number(pageSize);
    if (!isFinite(size) || size <= 0) size = PAGE_SIZE;
    if (!isFinite(got) || got < 0) return true;
    return got < size;
  }

  // What the table is allowed to claim it is showing. Sorting, searching, the
  // stat tiles and the CSV all work off rows already in the browser, so a
  // partial load has to say so -- a count that reads like a total when it is
  // the first page is how an admin ends up reporting the wrong number.
  function coverageNote(loaded, complete) {
    var n = Number(loaded);
    if (!isFinite(n) || n < 0) n = 0;
    if (complete === true) return '';
    return 'Showing the first ' + n.toLocaleString() + ' accounts. Sorting, search ' +
      'and the totals above cover only what is loaded.';
  }

  window.PyPathAdmin = {
    ADMIN_UIDS: ADMIN_UIDS,
    PAGE_SIZE: PAGE_SIZE,
    isAdminUid: isAdminUid,
    isAdmin: isAdmin,
    isLastPage: isLastPage,
    coverageNote: coverageNote
  };
})();
