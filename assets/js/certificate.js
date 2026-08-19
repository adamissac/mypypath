/* PyPath — end-of-course certificate.

   Two halves: pure rules on window.PyPathCertificate (unit-testable, no I/O),
   and a renderer that runs only on certificate.html. */
(function () {
  'use strict';

  var TOTAL_UNITS = 10;

  // ---------- pure rules ----------

  function isCourseComplete(units) {
    if (!Array.isArray(units)) return false;
    var seen = {};
    for (var i = 0; i < units.length; i++) {
      var n = Number(units[i]);
      if (Number.isInteger(n) && n >= 1 && n <= TOTAL_UNITS) seen[n] = true;
    }
    for (var u = 1; u <= TOTAL_UNITS; u++) {
      if (!seen[u]) return false;
    }
    return true;
  }

  function remainingUnits(units) {
    var seen = {};
    (Array.isArray(units) ? units : []).forEach(function (v) {
      var n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= TOTAL_UNITS) seen[n] = true;
    });
    var out = [];
    for (var u = 1; u <= TOTAL_UNITS; u++) {
      if (!seen[u]) out.push(u);
    }
    return out;
  }

  // The certificate carries a real name, so it must never fall back to an email
  // local-part or a uid -- either would print something the learner did not
  // choose to display.
  function certificateName(user) {
    if (!user) return '';
    var name = typeof user.displayName === 'string' ? user.displayName.trim() : '';
    return name.replace(/\s+/g, ' ');
  }

  function formatDate(ts) {
    var d = new Date(typeof ts === 'number' ? ts : NaN);
    if (isNaN(d.getTime())) return '';
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // A stable filename: "PyPath-Certificate-Ada-Lovelace.pdf".
  function fileName(name) {
    var slug = String(name || 'Learner')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return 'PyPath-Certificate-' + (slug || 'Learner');
  }

  window.PyPathCertificate = {
    TOTAL_UNITS: TOTAL_UNITS,
    isCourseComplete: isCourseComplete,
    remainingUnits: remainingUnits,
    certificateName: certificateName,
    formatDate: formatDate,
    fileName: fileName
  };

  // ---------- page renderer ----------

  if (!document.body || document.body.className.indexOf('page-certificate') === -1) return;

  function qs(sel) { return document.querySelector(sel); }

  function show(state) {
    ['guest', 'incomplete', 'ready'].forEach(function (s) {
      var el = qs('[data-cert-state="' + s + '"]');
      if (el) el.hidden = (s !== state);
    });
  }

  function completedAt() {
    var store = window.ProgressStore;
    var raw = store ? store.getItem('pypath-completed-at') : null;
    var n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  }

  function render() {
    var store = window.ProgressStore;
    var units = store ? store.getCompletedUnits() : [];
    var user = window.PyPathAuthUser || null;
    var name = certificateName(user);

    if (!user || !name) { show('guest'); return; }

    if (!isCourseComplete(units)) {
      var left = remainingUnits(units);
      var listEl = qs('[data-cert-remaining]');
      if (listEl) {
        listEl.textContent = left.length === 1
          ? 'Unit ' + left[0]
          : 'Units ' + left.slice(0, -1).join(', ') + ' and ' + left[left.length - 1];
      }
      var countEl = qs('[data-cert-count]');
      if (countEl) countEl.textContent = String(TOTAL_UNITS - left.length);
      show('incomplete');
      return;
    }

    var nameEl = qs('[data-cert-name]');
    if (nameEl) nameEl.textContent = name;
    var dateEl = qs('[data-cert-date]');
    if (dateEl) dateEl.textContent = formatDate(completedAt());
    document.title = 'Certificate • ' + name + ' • PyPath';
    show('ready');
  }

  document.addEventListener('pypath:auth', function (e) {
    window.PyPathAuthUser = e.detail.user;
    render();
  });

  document.addEventListener('pypath:progress', render);

  document.addEventListener('DOMContentLoaded', function () {
    render();
    var printBtn = qs('[data-cert-print]');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        var name = certificateName(window.PyPathAuthUser);
        // The browser's PDF filename comes from document.title.
        var prev = document.title;
        document.title = fileName(name);
        window.print();
        setTimeout(function () { document.title = prev; }, 500);
      });
    }
  });
})();
