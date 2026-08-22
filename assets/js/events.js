/* PyPath — the classroom event log: what a learner did, not just what they left behind.
 *
 * The site already stores artifacts -- the latest code in an editor, the latest
 * text in an answer box. Artifacts cannot tell "opened it, tried four times,
 * gave up" apart from "never opened it", and that difference is the only thing
 * a teacher actually needs. Events carry it.
 *
 * Two halves, matching progress-store/sync and activity-core/activity: this
 * file is the vocabulary, the buffer and the sanitizer, with no I/O, so it can
 * be loaded straight into a test with new Function(src).call(window).
 * event-sink.js does the Firestore writes on top of it.
 *
 * HONESTY NOTE, and it belongs in the code rather than only in a design doc:
 * these events are written by the student's own browser under their own
 * credentials. A student who opens devtools can fabricate any of them. There
 * are no Cloud Functions in this project, so there is nowhere else the write
 * could come from. This is fine for a free practice site, and it is why
 * nothing built on this data may be called a grade or presented to a teacher
 * as tamper-proof. It is evidence for starting a conversation, not for
 * ending one.
 */
(function () {
  'use strict';

  /* The full vocabulary. A type not in this map is dropped rather than
     written: the security rules enforce the same list, so an unknown type
     would be rejected server-side anyway, and failing here keeps a typo from
     costing a round trip. */
  var EVENT_TYPES = {
    'lesson.opened': ['lessonPath', 'unit'],
    'code.run': ['lessonPath', 'editorId', 'ok'],
    'code.error': ['lessonPath', 'editorId', 'errorType'],
    'code.tests_passed': ['lessonPath', 'editorId', 'passed', 'total'],
    'answer.submitted': ['lessonPath', 'exerciseId', 'attempt'],
    'check.answered': ['lessonPath', 'questionId', 'correct', 'attempt'],
    'test.started': ['unit'],
    'test.submitted': ['unit', 'score', 'total', 'attempt', 'durationSec'],
    'unit.completed': ['unit', 'verified']
  };

  var TYPE_LIST = Object.keys(EVENT_TYPES);

  /* One session cannot write more than this. A student holding Ctrl+Enter, or
     a run button wired into a loop, would otherwise generate writes until
     something gave out. Past the cap events are dropped and counted, never
     queued: dropping a redundant event costs a teacher nothing, and blocking
     the page to write it costs the student their lesson. */
  var SESSION_CAP = 500;

  var FLUSH_MS = 10000;
  var MAX_BATCH = 50;

  /* Payload size cap, mirrored in firestore.rules. Small on purpose: nothing
     in the vocabulary above needs room, and a generous cap is how student code
     ends up in a collection a teacher can read. */
  var MAX_PAYLOAD_CHARS = 512;

  /* A Python exception class name and nothing else. The full traceback is
     never recorded: tracebacks quote the offending source line, which is the
     student's own code, and that would put code into the event log by the back
     door. */
  var ERROR_TYPE_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

  var buffer = [];
  var dropped = 0;
  var recorded = 0;
  var enabled = false;

  function isValidType(type) {
    return Object.prototype.hasOwnProperty.call(EVENT_TYPES, type);
  }

  function isUnit(n) {
    return Number.isInteger(n) && n >= 1 && n <= 10;
  }

  /* Lesson paths are site-relative and come from the page's own location, but
     they are normalized here anyway so a dashboard can group by path without
     the same lesson arriving under three spellings. */
  function normalizePath(value) {
    var path = String(value == null ? '' : value).trim();
    if (!path) return '';
    var q = path.indexOf('?');
    if (q !== -1) path = path.slice(0, q);
    var h = path.indexOf('#');
    if (h !== -1) path = path.slice(0, h);
    if (path.charAt(0) !== '/') path = '/' + path;
    return path.slice(0, 200);
  }

  function cleanId(value) {
    // Editor, exercise and question ids are authored by us, not typed by a
    // learner, so anything outside this shape is a bug rather than input.
    var id = String(value == null ? '' : value).trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : '';
  }

  function cleanCount(value, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    n = Math.floor(n);
    if (n < 0) n = 0;
    if (n > max) n = max;
    return n;
  }

  /* Builds the payload field by field from the declared shape. Deliberately a
     whitelist and not a copy-with-deletions: a future caller that passes an
     extra field gets it dropped, rather than silently publishing whatever it
     happened to have in scope to a collection a teacher can read. */
  function buildPayload(type, input) {
    var src = input && typeof input === 'object' ? input : {};
    var out = {};
    var fields = EVENT_TYPES[type];

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      switch (field) {
        case 'lessonPath':
          out.lessonPath = normalizePath(src.lessonPath);
          break;
        case 'unit':
          if (!isUnit(Number(src.unit))) return null;
          out.unit = Number(src.unit);
          break;
        case 'editorId':
        case 'exerciseId':
        case 'questionId':
          out[field] = cleanId(src[field]);
          if (!out[field]) return null;
          break;
        case 'errorType':
          out.errorType = ERROR_TYPE_RE.test(String(src.errorType || ''))
            ? String(src.errorType)
            : 'UnknownError';
          break;
        case 'ok':
        case 'correct':
        case 'verified':
          out[field] = src[field] === true;
          break;
        case 'attempt':
          out.attempt = Math.max(1, cleanCount(src.attempt, 9999));
          break;
        case 'passed':
        case 'total':
        case 'score':
          out[field] = cleanCount(src[field], 9999);
          break;
        case 'durationSec':
          // A tab left open over a weekend must not read as a two-day test.
          out.durationSec = cleanCount(src.durationSec, 86400);
          break;
        default:
          break;
      }
    }
    return out;
  }

  function makeEvent(type, input) {
    if (!isValidType(type)) return null;
    var payload = buildPayload(type, input);
    if (payload === null) return null;
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) return null;

    var event = {
      type: type,
      payload: payload,
      // Duplicated out of the payload so a dashboard can filter without
      // unpacking, and so the rules can check them cheaply.
      lessonPath: payload.lessonPath || '',
      unit: typeof payload.unit === 'number' ? payload.unit : null
    };
    if (event.unit === null && event.lessonPath) {
      var m = /^\/units\/unit-(\d+)\//.exec(event.lessonPath);
      if (m && isUnit(Number(m[1]))) event.unit = Number(m[1]);
    }
    return event;
  }

  /* Off until someone turns it on. A guest has no account to attribute an
     event to, and a signed-in learner who has joined no class has no teacher
     to show it to -- in both cases the whole module is a no-op, which is what
     keeps the classroom feature from costing a lone learner anything. */
  function setEnabled(value) {
    enabled = value === true;
    if (!enabled) {
      buffer = [];
      dropped = 0;
    }
  }

  function isEnabled() { return enabled; }

  function record(type, input) {
    if (!enabled) return false;
    var event = makeEvent(type, input);
    if (!event) return false;
    if (recorded >= SESSION_CAP) {
      dropped += 1;
      return false;
    }
    buffer.push(event);
    recorded += 1;
    return true;
  }

  /* Hands out at most MAX_BATCH events and removes them from the buffer. The
     caller owns them from here: if the write fails they are gone, which is the
     right trade for telemetry. Re-queueing a failed batch is how a flaky
     connection turns into an unbounded retry loop that outlives the lesson. */
  function drain(limit) {
    var size = Math.min(buffer.length, limit || MAX_BATCH);
    return buffer.splice(0, size);
  }

  function pending() { return buffer.length; }
  function droppedCount() { return dropped; }

  function reset() {
    buffer = [];
    dropped = 0;
    recorded = 0;
    enabled = false;
  }

  window.PyPathEvents = {
    TYPES: TYPE_LIST,
    SESSION_CAP: SESSION_CAP,
    FLUSH_MS: FLUSH_MS,
    MAX_BATCH: MAX_BATCH,
    MAX_PAYLOAD_CHARS: MAX_PAYLOAD_CHARS,
    isValidType: isValidType,
    makeEvent: makeEvent,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    record: record,
    drain: drain,
    pending: pending,
    dropped: droppedCount,
    reset: reset
  };
})();
