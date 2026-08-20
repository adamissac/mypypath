/* PyPath — how long a learner actually spent on the platform.

   Two halves, matching progress-store/sync: this file is pure timing logic
   with no I/O so it can be unit-tested, and activity.js does the Firestore
   writes on top of it.

   "Active" means the tab is visible AND the person has moved, typed, clicked
   or scrolled within IDLE_MS. A tab left open overnight must not read as eight
   hours of study. */
(function () {
  'use strict';

  var TICK_MS = 5000;        // resolution of the counter
  var IDLE_MS = 5 * 60000;   // no input for this long = not studying
  var FLUSH_MS = 60000;      // how often accrued time goes to Firestore
  var PENDING_KEY = 'pypath-activity-pending';

  // A tick that claims more than this much elapsed time came from a sleeping
  // machine or a throttled background timer, not from a person. Clamp it.
  var MAX_TICK_MS = TICK_MS * 4;

  function dayKey(ts) {
    var d = new Date(typeof ts === 'number' ? ts : Date.now());
    if (isNaN(d.getTime())) return '';
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // Given the previous tick's timestamp and the last input, how many
  // milliseconds of this tick count as active time?
  function activeMs(state) {
    if (!state || !state.visible) return 0;
    var now = state.now;
    var since = now - state.lastTickAt;
    if (!(since > 0)) return 0;
    if (now - state.lastInputAt > IDLE_MS) return 0;
    return Math.min(since, MAX_TICK_MS);
  }

  // Seconds, floored, plus the sub-second remainder to carry into the next
  // flush. Firestore stores whole seconds; dropping the remainder every minute
  // would lose real time.
  function splitSeconds(ms) {
    var total = Math.max(0, Math.floor(ms));
    return { seconds: Math.floor(total / 1000), remainderMs: total % 1000 };
  }

  // "3h 42m", "42m", "< 1m" — a duration a person reads at a glance, never
  // "0h 0m" for someone who has genuinely used the site.
  function formatDuration(seconds) {
    var s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return '0m';
    if (s < 60) return '< 1m';
    var mins = Math.floor(s / 60);
    var hours = Math.floor(mins / 60);
    mins = mins % 60;
    if (!hours) return mins + 'm';
    return hours + 'h ' + mins + 'm';
  }

  function toHours(seconds) {
    var s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return Math.round((s / 3600) * 10) / 10;
  }

  window.PyPathActivity = {
    TICK_MS: TICK_MS,
    IDLE_MS: IDLE_MS,
    FLUSH_MS: FLUSH_MS,
    MAX_TICK_MS: MAX_TICK_MS,
    PENDING_KEY: PENDING_KEY,
    dayKey: dayKey,
    activeMs: activeMs,
    splitSeconds: splitSeconds,
    formatDuration: formatDuration,
    toHours: toHours
  };
})();
