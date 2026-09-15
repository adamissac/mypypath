/* PyPath — the "Practice next" panel on /progress.html.
 *
 * Loads the frozen model (assets/data/model/mastery-v1.json), reads this
 * learner's history from this browser only (the local event mirror plus local
 * progress), and asks recommend.js for three to five items with a reason each.
 *
 * Deliberately local. It never reads the Firestore event log: that would cost
 * up to 500 reads per visit against a project-wide daily budget, and the local
 * mirror holds the same sanitised events. A student on a second device sees
 * suggestions from that device's history plus their synced check results.
 *
 * What it shows is a suggestion built from self-reported practice. It says so
 * on the panel, and it never shows a percentage: a number next to a student's
 * name reads as a mark, and this is not one.
 */
(function () {
  'use strict';

  var ARTIFACT_URL = '/assets/data/model/mastery-v1.json';
  var SHOW = 5;
  var artifactPromise = null;

  function loadArtifact() {
    if (!artifactPromise) {
      artifactPromise = fetch(ARTIFACT_URL, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return artifactPromise;
  }

  function storageSnapshot() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (key.indexOf('pypath-checks-') === 0 || key === 'pypath-unit-tests' || key === 'pypath-progress-lessons')) {
          out[key] = localStorage.getItem(key);
        }
      }
    } catch (e) { /* private mode: nothing stored, cold start */ }
    return out;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function kindLabel(kind) {
    return kind === 'exercise' ? 'Exercise' : 'Quiz question';
  }

  /* A teacher's own practice is not what they came to this page for, and the
     page already says so; the panel stays out of their way. */
  function teaching() {
    var R = window.PyPathRoles;
    return !!(R && typeof R.teachingNow === 'function' && R.teachingNow());
  }

  function render(section, art, recs) {
    var list = section.querySelector('[data-pn-list]');
    list.innerHTML = '';
    recs.slice(0, SHOW).forEach(function (r, i) {
      var li = el('li', 'pn-item pn-item--' + r.reason_code);
      var head = el('div', 'pn-item__head');
      head.appendChild(el('span', 'pn-item__n', String(i + 1)));
      var title = el('h3', 'pn-item__title');
      var link = el('a', 'pn-item__link route', (art.lesson_titles && art.lesson_titles[r.lesson]) || r.lesson);
      link.href = r.lesson;
      title.appendChild(link);
      head.appendChild(title);
      head.appendChild(el('span', 'pn-item__kind', kindLabel(r.kind)));
      li.appendChild(head);
      var skill = el('p', 'pn-item__skill', r.skill_name);
      skill.setAttribute('data-kind', kindLabel(r.kind));
      li.appendChild(skill);
      li.appendChild(el('p', 'pn-item__why', r.reason));
      list.appendChild(li);
    });
    section.hidden = recs.length === 0 || teaching();
  }

  function run() {
    var section = document.querySelector('[data-practice-next]');
    if (!section || !window.PyPathRecommend) return;
    loadArtifact().then(function (art) {
      if (!art) { section.hidden = true; return; }
      var R = window.PyPathRecommend;
      var local = window.PyPathEvents && window.PyPathEvents.readLocal ? window.PyPathEvents.readLocal() : [];
      var events = R.historyFromBrowser(local, storageSnapshot());
      var recs;
      try {
        recs = R.recommend(art, events, Date.now(), null);
      } catch (e) {
        section.hidden = true;
        return;
      }
      render(section, art, recs);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  // A sync landing from another device changes what is known; re-rank.
  document.addEventListener('pypath:progress', run);
  document.addEventListener('pypath:role', run);

  window.PyPathPracticeNext = { run: run, render: render };
})();
