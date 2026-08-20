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

  window.PyPathAdmin = {
    ADMIN_UIDS: ADMIN_UIDS,
    isAdminUid: isAdminUid,
    isAdmin: isAdmin
  };
})();
