/* PyPath — turning an event log into the four things a teacher can act on.
 *
 * Pure functions over plain data, no I/O, so every rule below is testable and
 * so there is one place to argue with when a teacher says a number looks
 * wrong. classroom-dashboard.js renders what this returns.
 *
 * Two rules shaped what is in here, and more importantly what is not:
 *
 * Nothing is computed that does not answer "what should I do next". Time on
 * site, session counts, click totals and streaks are all absent on purpose.
 * They are easy to compute and they crowd out the signal, because a teacher
 * reading a dashboard has a few minutes and will spend them on whatever is
 * biggest on the page.
 *
 * Nothing here ranks students against each other. There is no leaderboard and
 * no class position, because live peer comparison discourages exactly the
 * students who most need to keep going. Comparisons are against the work, not
 * against the room.
 */
(function () {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var WEEK_MS = 7 * DAY_MS;

  /* Three failed attempts at the same exercise with nothing passing. Two is a
     normal amount of wrong; by the fourth a student has usually stopped
     learning and started guessing. */
  var STUCK_ATTEMPTS = 3;

  var IDLE_DAYS = 7;

  /* Two flagged answers is a coincidence often enough to be worth ignoring.
     By the third it is a pattern, and the same reasoning as STUCK_ATTEMPTS
     above: a dashboard that flags one of anything is a dashboard nobody reads. */
  var AI_FLAG_RUN = 3;

  /* Mirrors PASS_MARK in unit-test.js, the same way lesson-progress.js does.
     Neither file is loaded on a dashboard, and a teacher still has to be told
     whether a unit test was passed, so the number is repeated rather than
     depended on -- but it is named, so the next person to change it can grep
     for it. */
  var UNIT_TEST_PASS_MARK = 70;

  /* Below this first-try pass rate across a unit, the problem is more likely
     the explanation than the student. */
  var STRUGGLE_RATE = 0.5;

  /* How long classroom data is kept.
   *
   * Indefinite retention is not an option here. The amended COPPA rule that
   * reached full compliance on 22 April 2026 requires a stated retention
   * period and prohibits keeping children's data for longer than needed, and
   * this site is used by minors.
   *
   * These numbers are the policy. privacy.html quotes them and a test asserts
   * the two agree, so the page cannot drift away from the code that enforces
   * it. */
  var RETENTION = {
    EVENT_DAYS: 180,
    SNAPSHOT_DAYS: 180,
    ARCHIVED_CLASS_DAYS: 365,
    // Mirrored from snapshots.js so the policy can state a real figure.
    SNAPSHOTS_PER_EDITOR: 20,
    SNAPSHOT_BYTES_PER_LESSON: 64 * 1024,
    LARGE_INSERTION_CHARS: 120
  };

  /* Exactly what a teacher can see, in the words used on the join screen.
     One list, so the consent panel, the policy page and the dashboard cannot
     describe different things. */
  var TEACHER_CAN_SEE = [
    'Which lessons you have opened, and when',
    'Which exercises you have attempted, and how many attempts each took',
    'Which checks your code passed, and your end-of-unit test scores',
    'The code you write in lesson exercises, including a short history of how you wrote it',
    'The written answers you save to reflection questions',
    'The username you chose, and when you were last active'
  ];

  var TEACHER_CANNOT_SEE = [
    'Your email address',
    'Your legal name',
    'Anything you do outside this class',
    'Anything at all, until you enter their join code yourself'
  ];

  /* Everything that has to be deleted when a student leaves a class. Named
     here so the erasure path and its test are reading the same list. */
  var ERASED_ON_LEAVE = ['roster', 'progress', 'events'];

  var MASTERY = ['not-opened', 'in-progress', 'attempted', 'passed', 'verified'];

  var MASTERY_LABEL = {
    'not-opened': 'Not opened',
    'in-progress': 'In progress',
    attempted: 'Attempted',
    passed: 'Passed',
    verified: 'Verified'
  };

  /* Every cell carries a letter as well as a colour. A grid that means nothing
     in greyscale is a grid that means nothing to a colourblind teacher, and
     one printed for a department meeting is always greyscale. */
  var MASTERY_MARK = {
    'not-opened': '·',
    'in-progress': 'o',
    attempted: '/',
    passed: '+',
    verified: '*'
  };

  /* The certificate handshake, as a teacher sees it.
     `pending` is the only one that is a job: the learner has finished and is
     waiting on a person. The other four are records. */
  var CERT_LABEL = {
    none: 'Not finished',
    earned: 'Earned',
    pending: 'Awaiting you',
    approved: 'Approved',
    declined: 'Declined'
  };

  /* Same rule as MASTERY_MARK, for the same reason: this state ends up on a
     printout for a department meeting, and that printout is greyscale. */
  var CERT_MARK = {
    none: '\u00b7',
    earned: '*',
    pending: '?',
    approved: '+',
    declined: 'x'
  };

  /* The order the certificate queue reads in, highest first, so what is
     waiting on the teacher sits at the top. It orders the five states, never
     the students: this dashboard does not rank people against each other, and
     tests/classroom-core.test.js keeps that word off the public API on
     purpose. */
  var CERT_ORDER = { none: 0, earned: 1, approved: 2, declined: 3, pending: 4 };

  var CERT_CSV = {
    none: 'not finished',
    earned: 'earned',
    pending: 'awaiting approval',
    approved: 'approved',
    declined: 'declined'
  };

  function certificateState(cert) {
    var c = cert || {};
    if (c.approved === true) return 'approved';
    if (c.approved === false) return 'declined';
    if ((c.requestedAt || 0) > 0) return 'pending';
    if (c.earned) return 'earned';
    return 'none';
  }

  function toMillis(value) {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    // Firestore Timestamp, either shape the SDK hands back.
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    var parsed = Date.parse(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function eventsOfType(events, type) {
    return (events || []).filter(function (e) { return e.type === type; });
  }

  function payloadOf(event) {
    return (event && event.payload) || {};
  }

  /* ------------------------------------------------------------- mastery */

  /* The five states, in the order a lesson moves through them. Each one is
     defined by evidence that exists, never by evidence that is missing --
     "not opened" is the only state that means an absence, and it means exactly
     that rather than standing in for "we did not record it". */
  function lessonState(events, lessonPath, unitVerified) {
    var forLesson = (events || []).filter(function (e) {
      return (e.lessonPath || payloadOf(e).lessonPath) === lessonPath;
    });

    if (!forLesson.length) return 'not-opened';
    if (unitVerified) return 'verified';

    var checks = eventsOfType(forLesson, 'code.tests_passed');
    if (checks.length) {
      // Best result, not latest: the record is what the student demonstrated,
      // not what their last keystroke left behind.
      var best = checks.reduce(function (acc, e) {
        var p = payloadOf(e);
        var ratio = p.total ? p.passed / p.total : 0;
        return ratio > acc ? ratio : acc;
      }, 0);
      if (best >= 1) return 'passed';
      return 'attempted';
    }

    var tried = eventsOfType(forLesson, 'code.run').length
      || eventsOfType(forLesson, 'answer.submitted').length
      || eventsOfType(forLesson, 'check.answered').length;
    if (tried) return 'attempted';

    return 'in-progress';
  }

  function verifiedUnits(events) {
    var out = {};
    eventsOfType(events, 'unit.completed').forEach(function (e) {
      var p = payloadOf(e);
      if (p.verified === true && p.unit) out[p.unit] = true;
    });
    return out;
  }

  /* A unit's state is the weakest of its lessons, not the average. A teacher
     scanning a row wants to know whether anything is outstanding; averaging
     hides one untouched lesson behind nine finished ones. */
  function unitState(events, lessonPaths, unit) {
    var verified = verifiedUnits(events);
    if (verified[unit]) return 'verified';

    var states = (lessonPaths || []).map(function (p) {
      return lessonState(events, p, false);
    });
    if (!states.length) return 'not-opened';
    if (states.every(function (s) { return s === 'not-opened'; })) return 'not-opened';
    if (states.every(function (s) { return s === 'passed' || s === 'verified'; })) return 'passed';
    if (states.some(function (s) { return s === 'attempted' || s === 'passed'; })) return 'attempted';
    return 'in-progress';
  }

  /* How far through one unit a student is, as their teacher sees it.
   *
   * The counterpart to lesson-progress.js's unitBreakdown, which computes the
   * same figure on the student's own machine from their stored lesson map.
   * Both hand their counts to PyPathUnitProgress, so the percentage a teacher
   * reads and the percentage the student reads are the same percentage. */
  function unitProgress(events, lessonPaths, unit) {
    var paths = lessonPaths || [];
    var verified = verifiedUnits(events)[unit] === true;

    var lessonsPassed = 0;
    var lessonsStarted = 0;
    paths.forEach(function (path) {
      var state = lessonState(events, path, false);
      if (state === 'passed' || state === 'verified') lessonsPassed += 1;
      if (state !== 'not-opened') lessonsStarted += 1;
    });

    // The test half of the rule. test.submitted carries the score; unit
    // completed with verified:true is the same fact recorded at roll-up, and
    // either is enough.
    var testPassed = verified || eventsOfType(events, 'test.submitted').some(function (e) {
      var p = payloadOf(e);
      return p.unit === unit && p.total > 0
        && (p.score / p.total) * 100 >= UNIT_TEST_PASS_MARK;
    });

    var counts = {
      unit: unit,
      lessonsTotal: paths.length,
      lessonsPassed: lessonsPassed,
      lessonsStarted: lessonsStarted,
      testPassed: testPassed
    };

    var UP = window.PyPathUnitProgress;
    counts.percent = UP ? UP.percentFor(counts) : 0;
    counts.complete = UP ? UP.isComplete(counts) : false;
    counts.summary = UP ? UP.describe(counts) : '';
    counts.state = unitState(events, paths, unit);
    return counts;
  }

  function percentComplete(events, lessonsByUnit) {
    var total = 0;
    var done = 0;
    // One pass over the log, not one per unit: this is called for every
    // student on the dashboard and again for every row of the CSV export.
    var verifiedByUnit = verifiedUnits(events);
    Object.keys(lessonsByUnit || {}).forEach(function (unit) {
      var verified = verifiedByUnit[Number(unit)];
      lessonsByUnit[unit].forEach(function (path) {
        total += 1;
        var state = lessonState(events, path, verified);
        if (state === 'passed' || state === 'verified') done += 1;
      });
    });
    return total ? Math.round((done / total) * 100) : 0;
  }

  /* ------------------------------------------------------- assignments */

  /* When a student first satisfied something, rather than whether they have.
   *
   * Everything else on this file answers "what is true now". An assignment
   * needs "when did that become true", because a date is the whole difference
   * between done and done late.
   *
   * Earliest, never latest, and that is the ratchet the rest of the codebase
   * already keeps: mergeAttempt and recordBest never let a later worse attempt
   * undo an earlier better one, and a completion date must not move either. A
   * student who reopens a passed lesson and does badly has not un-finished it,
   * and one who does it again better has not finished it a second time. Either
   * reading would silently walk a completion across a due date.
   *
   * `target` is { kind: 'lesson', path } or { kind: 'unit', unit, lessonPaths }.
   * Returns millis, or null if the thing was never finished at all.
   */
  function firstPassAt(events, lessonPath) {
    var best = null;
    (events || []).forEach(function (e) {
      if (e.type !== 'code.tests_passed') return;
      var p = payloadOf(e);
      if ((e.lessonPath || p.lessonPath) !== lessonPath) return;
      if (!p.total || p.passed < p.total) return;
      var at = toMillis(e.at);
      if (at && (best === null || at < best)) best = at;
    });
    return best;
  }

  function firstVerifiedAt(events, unit) {
    var best = null;
    eventsOfType(events, 'unit.completed').forEach(function (e) {
      var p = payloadOf(e);
      if (p.verified !== true || Number(p.unit) !== Number(unit)) return;
      var at = toMillis(e.at);
      if (at && (best === null || at < best)) best = at;
    });
    return best;
  }

  function firstTestPassAt(events, unit) {
    var best = null;
    eventsOfType(events, 'test.submitted').forEach(function (e) {
      var p = payloadOf(e);
      if (Number(p.unit) !== Number(unit) || !p.total) return;
      if ((p.score / p.total) * 100 < UNIT_TEST_PASS_MARK) return;
      var at = toMillis(e.at);
      if (at && (best === null || at < best)) best = at;
    });
    return best;
  }

  function earlier(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    return a < b ? a : b;
  }

  function completedAt(events, target) {
    var t = target || {};

    if (t.kind === 'lesson') {
      var unit = unitOfPath(t.path);
      // A verified unit means every lesson in it is done, which is exactly what
      // lessonState says when unitVerified is true.
      return earlier(firstPassAt(events, t.path),
        unit === null ? null : firstVerifiedAt(events, unit));
    }

    if (t.kind !== 'unit') return null;

    var verified = firstVerifiedAt(events, t.unit);
    var paths = t.lessonPaths || [];
    if (!paths.length) return verified;

    // The long route: every lesson passed and the test passed. The unit is not
    // finished until the last outstanding piece lands, so this is a max over
    // the parts, guarded by any one of them never happening.
    var last = firstTestPassAt(events, t.unit);
    for (var i = 0; last !== null && i < paths.length; i++) {
      var lessonAt = firstPassAt(events, paths[i]);
      if (lessonAt === null) { last = null; break; }
      if (lessonAt > last) last = lessonAt;
    }

    // Whichever route finished first is when the unit was finished.
    return earlier(last, verified);
  }

  function unitOfPath(path) {
    var m = /^\/units\/unit-(\d+)\//.exec(String(path || ''));
    return m ? Number(m[1]) : null;
  }

  /* One assignment, for one student, as a row a teacher can read.
   *
   * Nothing here is stored. Late is computed at render time out of the due date
   * and either the completion time or now, the same way unitTestPassed and
   * lessonState are computed rather than cached. A stored flag would go stale
   * the moment nobody re-ran the job that set it, and a teacher would be
   * looking at a late marking that stopped being true weeks ago.
   */
  function assignmentStatus(assignment, events, options) {
    var a = assignment || {};
    var opts = options || {};
    var now = opts.now || Date.now();
    var byUnit = opts.lessonsByUnit || {};
    var titles = opts.lessonTitles || {};
    var dueAt = toMillis(a.dueAt);

    var parts = [];
    (a.units || []).forEach(function (unit) {
      var n = Number(unit);
      parts.push({
        kind: 'unit',
        unit: n,
        title: 'Unit ' + n,
        completedAt: completedAt(events, {
          kind: 'unit', unit: n, lessonPaths: byUnit[n] || byUnit[String(n)] || []
        })
      });
    });
    (a.lessonPaths || []).forEach(function (path) {
      parts.push({
        kind: 'lesson',
        path: path,
        title: titles[path] || path,
        completedAt: completedAt(events, { kind: 'lesson', path: path })
      });
    });
    parts.forEach(function (part) { part.done = part.completedAt !== null; });

    var doneCount = parts.filter(function (p) { return p.done; }).length;

    // An assignment requiring nothing can never be complete. Reading it as
    // done would let an empty row report a class as finished.
    var finishedAt = null;
    if (parts.length && doneCount === parts.length) {
      finishedAt = parts.reduce(function (acc, p) {
        return p.completedAt > acc ? p.completedAt : acc;
      }, 0);
    }

    var state;
    var daysLate = 0;
    if (dueAt && dueAt < now - RETENTION.EVENT_DAYS * DAY_MS) {
      // The evidence has been deleted on purpose, by the retention policy the
      // rules enforce. "We no longer keep this" and "nobody did the work" are
      // different facts and must not paint the same.
      state = 'expired';
    } else if (finishedAt === null) {
      state = now > dueAt ? 'overdue' : 'not-due';
    } else if (finishedAt > dueAt) {
      state = 'done-late';
      // Whole days, rounded up: one minute past the deadline is a day late,
      // never zero days late, which reads as on time to anyone looking at the
      // number rather than the word.
      daysLate = Math.ceil((finishedAt - dueAt) / DAY_MS);
    } else {
      state = 'done-on-time';
    }

    return {
      parts: parts,
      doneCount: doneCount,
      partCount: parts.length,
      completedAt: finishedAt,
      dueAt: dueAt,
      state: state,
      daysLate: daysLate
    };
  }

  /* Which units the class's assignments hold open, whatever its lock mode says.
   *
   * A student marked late for work they could not open is the one failure this
   * feature must not have, so an assigned unit is reachable in every mode.
   *
   * Live means the assignment exists and is not archived, deliberately not
   * "not yet due". Missing a deadline must not close the door on the work:
   * late is tracked separately from not-done precisely so it can still be done.
   *
   * `now` is unused today and taken anyway, so that an "opens only once due"
   * variant would be a change inside this function rather than at every call
   * site.
   */
  /* Moved to classroom-policy.js, which is loaded on every lesson page while
     this file is not. Kept here as a delegation because this module's API is
     what the dashboard and its tests already call, and because a second copy
     of the rule is a second thing to keep in step. Looked up when called, not
     at load, so script order between the two files does not matter. */
  function assignmentUnlocks(assignments, now) {
    return window.PyPathPolicy.assignmentUnlocks(assignments, now);
  }

  /* --------------------------------------------------- needs attention */

  /* Attempts at one exercise, and whether any of them ever passed. */
  function attemptsByExercise(events) {
    var out = {};
    (events || []).forEach(function (e) {
      var p = payloadOf(e);
      var id = p.editorId || p.exerciseId;
      if (!id) return;
      if (e.type !== 'code.tests_passed' && e.type !== 'answer.submitted'
          && e.type !== 'code.run') return;

      var key = (e.lessonPath || p.lessonPath || '') + '#' + id;
      if (!out[key]) {
        out[key] = {
          lessonPath: e.lessonPath || p.lessonPath || '',
          exerciseId: id,
          attempts: 0,
          passed: false,
          firstTryPassed: false
        };
      }
      var entry = out[key];
      entry.attempts += 1;
      if (e.type === 'code.tests_passed' && p.total && p.passed >= p.total) {
        entry.passed = true;
        if (entry.attempts === 1) entry.firstTryPassed = true;
      }
    });
    return out;
  }

  /* First-try pass rate across a unit. Deliberately measured on the first
     attempt only: a rate that counts retries measures persistence, which is
     not what "did the lesson land" is asking. */
  /* `index` is an optional attemptsByExercise() result for the same events. A
     caller that already has one -- needsAttention asks about all ten units in
     a row -- passes it rather than paying for ten identical rebuilds. */
  function firstTryRate(events, unit, index) {
    var attempted = 0;
    var passed = 0;
    var byExercise = index || attemptsByExercise(events);
    Object.keys(byExercise).forEach(function (key) {
      var entry = byExercise[key];
      var m = /^\/units\/unit-(\d+)\//.exec(entry.lessonPath);
      if (!m || Number(m[1]) !== unit) return;
      attempted += 1;
      if (entry.firstTryPassed) passed += 1;
    });
    return attempted ? passed / attempted : null;
  }

  /* Written answers that cleared the substance floor but did not mention any
     of the ideas the lesson's author said a good answer touches.
     
     Note what this is not: it is not a judgement that the answer is wrong. It
     is "none of the words we expected appeared", which is a fact about a
     string, and a thoughtful answer in unexpected words lands here too. That
     is why three of them make a row and one makes nothing. */
  function flaggedAnswers(events) {
    return (events || []).filter(function (e) {
      return e.type === 'answer.submitted' && payloadOf(e).missedConcepts === true;
    }).map(function (e) {
      return {
        lessonPath: e.lessonPath || payloadOf(e).lessonPath || '',
        itemId: payloadOf(e).itemId || '',
        at: toMillis(e.at)
      };
    });
  }

  function lastEventAt(events) {
    return (events || []).reduce(function (acc, e) {
      var at = toMillis(e.at);
      return at > acc ? at : acc;
    }, 0);
  }

  /* Every row is a student, a reason, and something to do about it.
   *
   * The wording is a rule, not a preference. A reason describes what happened
   * -- "has retried 4.2 five times" -- and never what the student is. A
   * dashboard that hands a teacher a word like "weak" has changed how that
   * teacher sees a fourteen-year-old for the rest of the term, on the strength
   * of some click counts a browser reported about itself. */
  function needsAttention(students, options) {
    var opts = options || {};
    var now = opts.now || Date.now();
    var lessonTitles = opts.lessonTitles || {};
    var rows = [];

    (students || []).forEach(function (student) {
      var events = student.events || [];
      var name = student.displayName || student.uid;

      /* Checked before the no-events return below, so a waiting certificate is
         never skipped. It is also the only row here that names something the
         teacher owes the student rather than the other way round, which is
         exactly why it belongs at the top of this table. */
      if (certificateState(student.certificate) === 'pending') {
        rows.push({
          uid: student.uid,
          displayName: name,
          kind: 'certificate',
          priority: 0,
          reason: 'Finished the course and is waiting on their certificate',
          nextStep: 'Approve or decline it in Certificates below',
          lessonPath: '/certificate.html'
        });
      }

      if (!events.length) {
        rows.push({
          uid: student.uid,
          displayName: name,
          kind: 'never-started',
          priority: 1,
          reason: 'Has joined but has not opened a lesson yet',
          nextStep: 'Check they can sign in and see Unit 1',
          lessonPath: '/units/unit-1.html'
        });
        return;
      }

      var last = lastEventAt(events);
      var idleDays = Math.floor((now - last) / (24 * 60 * 60 * 1000));
      if (idleDays >= IDLE_DAYS) {
        rows.push({
          uid: student.uid,
          displayName: name,
          kind: 'idle',
          priority: 3,
          reason: 'No activity for ' + idleDays + ' days',
          nextStep: 'Ask where they got to and what stopped them',
          lessonPath: lastLessonPath(events)
        });
      }

      /* Written answers that did not mention any of the ideas the lesson was
         about. Priority 1, above a quiet week and below being visibly stuck on
         one exercise.

         Wording rule as everywhere else in this function: describe what
         happened, never what the student is. "Did not mention any of the ideas
         the lesson covered" is a thing that happened, and it is also literally
         all that was measured. */
      var flagged = flaggedAnswers(events);
      if (flagged.length >= AI_FLAG_RUN) {
        rows.push({
          uid: student.uid,
          displayName: name,
          kind: 'flagged',
          priority: 1,
          reason: flagged.length + ' written answers did not mention any of the '
            + 'ideas the lesson covered',
          nextStep: 'Read one of them with them and ask what they were going for',
          lessonPath: flagged[flagged.length - 1].lessonPath
        });
      }

      var byExercise = attemptsByExercise(events);
      Object.keys(byExercise).forEach(function (key) {
        var entry = byExercise[key];
        if (entry.passed || entry.attempts < STUCK_ATTEMPTS) return;
        var title = lessonTitles[entry.lessonPath] || entry.lessonPath;
        rows.push({
          uid: student.uid,
          displayName: name,
          kind: 'stuck',
          priority: 0,
          reason: 'Has retried ' + entry.exerciseId + ' in ' + title + ' '
            + entry.attempts + ' times without passing',
          nextStep: 'Look at their code for this exercise together',
          lessonPath: entry.lessonPath,
          exerciseId: entry.exerciseId
        });
      });

      for (var unit = 1; unit <= 10; unit += 1) {
        var rate = firstTryRate(events, unit, byExercise);
        if (rate === null || rate >= STRUGGLE_RATE) continue;
        // One exercise is not a pattern; it is one exercise.
        if (countUnitExercises(byExercise, unit) < 3) continue;
        rows.push({
          uid: student.uid,
          displayName: name,
          kind: 'concept',
          priority: 2,
          reason: 'Passing ' + Math.round(rate * 100) + '% of Unit ' + unit
            + ' exercises on the first try',
          nextStep: 'Revisit the Unit ' + unit + ' explanations with them',
          lessonPath: '/units/unit-' + unit + '.html'
        });
      }
    });

    return rows.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return String(a.displayName).localeCompare(String(b.displayName));
    });
  }

  function countUnitExercises(byExercise, unit) {
    return Object.keys(byExercise).filter(function (key) {
      var m = /^\/units\/unit-(\d+)\//.exec(byExercise[key].lessonPath);
      return m && Number(m[1]) === unit;
    }).length;
  }

  function lastLessonPath(events) {
    var latest = null;
    var latestAt = 0;
    (events || []).forEach(function (e) {
      var path = e.lessonPath || payloadOf(e).lessonPath;
      var at = toMillis(e.at);
      if (path && at >= latestAt) {
        latest = path;
        latestAt = at;
      }
    });
    return latest;
  }

  /* ------------------------------------------------------- class summary */

  function median(numbers) {
    var sorted = (numbers || []).slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) return 0;
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  function highestUnitReached(events) {
    return (events || []).reduce(function (acc, e) {
      var unit = Number(e.unit || payloadOf(e).unit || 0);
      return unit > acc ? unit : acc;
    }, 0);
  }

  /* Median, not mean: one student who raced ahead should not make the class
     look further along than any of them actually is. */
  function classSummary(students, options) {
    var opts = options || {};
    var now = opts.now || Date.now();
    var lessonTitles = opts.lessonTitles || {};
    var list = students || [];

    var activeThisWeek = list.filter(function (s) {
      return lastEventAt(s.events) >= now - WEEK_MS;
    }).length;

    var attemptsByLesson = {};
    var errorCounts = {};

    list.forEach(function (student) {
      var byExercise = attemptsByExercise(student.events);
      Object.keys(byExercise).forEach(function (key) {
        var entry = byExercise[key];
        if (!entry.lessonPath) return;
        if (!attemptsByLesson[entry.lessonPath]) {
          attemptsByLesson[entry.lessonPath] = { attempts: 0, students: 0 };
        }
        attemptsByLesson[entry.lessonPath].attempts += entry.attempts;
        attemptsByLesson[entry.lessonPath].students += 1;
      });

      eventsOfType(student.events, 'code.error').forEach(function (e) {
        if (toMillis(e.at) < now - WEEK_MS) return;
        var type = payloadOf(e).errorType;
        if (!type) return;
        errorCounts[type] = (errorCounts[type] || 0) + 1;
      });
    });

    var hardest = null;
    Object.keys(attemptsByLesson).forEach(function (path) {
      var entry = attemptsByLesson[path];
      // One student struggling with one lesson is not the class's hardest
      // lesson; it is one student to go and talk to.
      if (entry.students < 2) return;
      var average = entry.attempts / entry.students;
      if (!hardest || average > hardest.averageAttempts) {
        hardest = {
          lessonPath: path,
          title: lessonTitles[path] || path,
          averageAttempts: Math.round(average * 10) / 10,
          students: entry.students
        };
      }
    });

    var commonError = null;
    Object.keys(errorCounts).forEach(function (type) {
      if (!commonError || errorCounts[type] > commonError.count) {
        commonError = { errorType: type, count: errorCounts[type] };
      }
    });

    return {
      students: list.length,
      medianUnitReached: median(list.map(function (s) { return highestUnitReached(s.events); })),
      activeThisWeek: activeThisWeek,
      hardestLesson: hardest,
      commonError: commonError
    };
  }

  /* ---------------------------------------------------- student drill-down */

  /* Events grouped into days, newest day first, newest event first within a
     day. A flat feed of four hundred events is not a thing anyone reads; days
     are the unit a teacher already thinks in. */
  function groupByDay(events, options) {
    var opts = options || {};
    var buckets = {};

    (events || []).forEach(function (event) {
      var at = toMillis(event.at);
      if (!at) return;
      var date = new Date(at);
      // Local time on purpose: "which day was that" means the teacher's day.
      var key = date.getFullYear() + '-'
        + String(date.getMonth() + 1).padStart(2, '0') + '-'
        + String(date.getDate()).padStart(2, '0');
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(event);
    });

    var days = Object.keys(buckets).sort().reverse();
    var latest = days[0];

    return days.map(function (day) {
      return {
        day: day,
        events: buckets[day].slice().sort(function (a, b) {
          return toMillis(b.at) - toMillis(a.at);
        }),
        count: buckets[day].length,
        // Collapsed by default, apart from the most recent day, which is
        // what a teacher opened the student for.
        open: opts.openLatest !== false && day === latest
      };
    });
  }

  /* One row per lesson the student has touched, plus any lesson the caller
     asks about explicitly. */
  function perLessonRows(events, lessons) {
    var byExercise = attemptsByExercise(events);
    var verified = verifiedUnits(events);
    var rows = [];

    (lessons || []).forEach(function (lesson) {
      var forLesson = (events || []).filter(function (e) {
        return (e.lessonPath || payloadOf(e).lessonPath) === lesson.path;
      });
      if (!forLesson.length) return;

      var exercises = Object.keys(byExercise)
        .map(function (key) { return byExercise[key]; })
        .filter(function (entry) { return entry.lessonPath === lesson.path; });

      var attempts = exercises.reduce(function (sum, e) { return sum + e.attempts; }, 0);
      var firstTry = exercises.filter(function (e) { return e.firstTryPassed; }).length;

      rows.push({
        lessonPath: lesson.path,
        title: lesson.title,
        unit: lesson.unit,
        state: lessonState(events, lesson.path, !!verified[lesson.unit]),
        attempts: attempts,
        exercises: exercises.length,
        // Null rather than 0 when nothing was attempted: "no data" and "failed
        // everything" are different facts and must not render the same.
        firstTryRate: exercises.length ? firstTry / exercises.length : null,
        lastActivity: lastEventAt(forLesson)
      });
    });

    return rows.sort(function (a, b) { return b.lastActivity - a.lastActivity; });
  }

  /* The header figures for one student. */
  function studentHeader(student, lessonsByUnitMap) {
    var verified = verifiedUnits(student.events);
    return {
      displayName: student.displayName || student.uid,
      joinedAt: toMillis(student.joinedAt),
      lastActiveAt: Math.max(toMillis(student.lastActiveAt), lastEventAt(student.events)),
      unitsVerified: Object.keys(verified).length,
      percentComplete: percentComplete(student.events, lessonsByUnitMap)
    };
  }

  /* Every number on the dashboard gets one of these next to it. A teacher who
     cannot interrogate a number does not trust it, and a number they do not
     trust is worse than no number, because it is still taking up the space
     where a usable one would go. */
  var EXPLANATIONS = {
    unitPercent: 'Each lesson in the unit counts once and the end-of-unit test '
      + 'counts once, so a unit of ten lessons has eleven parts. Finishing every '
      + 'lesson without passing the test shows as 91%, because the unit is not '
      + 'complete until both are done. This is the same figure the student sees '
      + 'on their own progress page.',
    mastery: 'Not opened: no record of the lesson being opened. In progress: opened, '
      + 'nothing attempted yet. Attempted: code was run or an answer saved, but not '
      + 'everything passes. Passed: every visible check on the lesson passes. '
      + 'Verified: the end-of-unit test was passed.',
    stuck: 'Three or more attempts at the same exercise with no passing run. '
      + 'Attempts are counted for this class only.',
    idle: 'Enrolled, has activity in the past, but nothing recorded in the last '
      + IDLE_DAYS + ' days.',
    neverStarted: 'Enrolled, with no recorded activity at all. Most often this means '
      + 'they have not signed in on a device yet.',
    concept: 'Fewer than half of the unit\'s exercises passed on the first attempt, '
      + 'across at least three exercises. Retries are excluded, so this measures '
      + 'whether the lesson landed rather than how persistent the student is.',
    medianUnit: 'The middle value of the highest unit each student has reached. '
      + 'Median rather than average, so one student racing ahead does not make the '
      + 'class look further along than any of them is.',
    activeThisWeek: 'Students with at least one recorded action in the last 7 days.',
    hardestLesson: 'The lesson with the highest average attempts per student, counting '
      + 'only lessons at least two students have tried.',
    commonError: 'The Python exception raised most often across the class in the last '
      + '7 days. Only the exception type is recorded, never the code or the message.',
    firstTry: 'The share of this lesson\'s exercises that passed on the very first '
      + 'attempt. Blank means nothing has been attempted yet, which is not the same '
      + 'as failing everything.',
    largePaste: 'More than ' + RETENTION.LARGE_INSERTION_CHARS + ' characters appeared between one snapshot and '
      + 'the next. That is all this means. Typing quickly, pasting your own earlier '
      + 'work, and copying an example from the lesson all look the same here, so treat '
      + 'it as a reason to ask a question rather than as evidence of anything.',
    snapshots: 'Up to ' + RETENTION.SNAPSHOTS_PER_EDITOR + ' states per editor, captured '
      + 'when code is run and when typing pauses -- never per keystroke. Oldest are '
      + 'dropped once a lesson\'s history passes '
      + (RETENTION.SNAPSHOT_BYTES_PER_LESSON / 1024) + 'KB.',
    assignmentLate: 'Whether the work was finished before the due date. The '
      + 'completion time is the first moment this site saw the work pass, '
      + 'stamped with server time when it arrived, so the date is reliable even '
      + 'if a student\'s own clock is not. What it does not show is who did the '
      + 'work, so treat a late marking as a thing to ask about.',
    assignmentExpired: 'This assignment was due more than ' + RETENTION.EVENT_DAYS
      + ' days ago, and the activity records it would be measured against have '
      + 'been deleted under the retention policy. That is not the same as nobody '
      + 'having done it, so nothing is shown either way.',
    joinCode: 'The code students type on their account page to join this '
      + 'class. Joining is what makes their work visible to you; nothing is '
      + 'shared until they do. A student can be in one class at a time, so a '
      + 'student already in another class has to leave it before this code '
      + 'will work for them.',
    showSolutions: 'Whether an exercise offers a Show Solution button to this '
      + 'class. It changes the button and nothing else: the exercise, the '
      + 'editor, the checker and the hints are all still there. It does not '
      + 'hide the answer either -- solutions are part of the lesson page, so a '
      + 'student who opens the page source can read one whatever this is set '
      + 'to. It takes the answer key off the desk; it does not lock it away.',
    maxTestAttempts: 'How many times a student in this class may sit the same '
      + 'end-of-unit test. Unlimited is the default and is what every class had '
      + 'before this setting existed. It reaches students in this class and '
      + 'nobody else: a learner working on their own has no teacher to set them '
      + 'a limit and never gets one. Running out never costs anything already '
      + 'earned -- the best score stands, and so does a unit already completed. '
      + 'Worth knowing where it is kept: this is a rule the site follows in the '
      + 'student\'s browser, not one the database enforces, so treat it as a '
      + 'setting rather than as a guarantee.',
    certificate: 'A learner who finishes all ten units does not get the '
      + 'certificate straight away: it waits here for you to approve or '
      + 'decline. Either decision can be changed later from the same row, so a '
      + 'decline holds the certificate back rather than ending anything. A '
      + 'learner who is not in anyone\'s class is unaffected and gets theirs '
      + 'the moment they finish.',
    lockMode: 'In order: a unit opens once the one before it is finished. By '
      + 'hand: only the units you tick are open. Open: every unit is open to '
      + 'everyone. Assignments are unaffected by all three, so an open course '
      + 'still owes whatever you set, and a unit you assign is always reachable '
      + 'even if the mode would otherwise keep it shut.',
    flagged: 'Three or more written answers that contained none of the words '
      + 'the lesson author listed as ideas a good answer touches. That is all '
      + 'this measures: it is a word check, not a marker, and a thoughtful '
      + 'answer written in unexpected words counts here too. Read one of them '
      + 'before concluding anything.',
    trust: 'These events are recorded by each student\'s own browser. They are a '
      + 'record of what the site saw, not proof of what happened, and a determined '
      + 'student could send something untrue. Use them to decide who to talk to, '
      + 'not to decide a grade.'
  };

  window.PyPathClassroom = {
    RETENTION: RETENTION,
    TEACHER_CAN_SEE: TEACHER_CAN_SEE,
    TEACHER_CANNOT_SEE: TEACHER_CANNOT_SEE,
    ERASED_ON_LEAVE: ERASED_ON_LEAVE,
    MASTERY: MASTERY,
    MASTERY_LABEL: MASTERY_LABEL,
    MASTERY_MARK: MASTERY_MARK,
    CERT_LABEL: CERT_LABEL,
    CERT_MARK: CERT_MARK,
    CERT_ORDER: CERT_ORDER,
    CERT_CSV: CERT_CSV,
    certificateState: certificateState,
    STUCK_ATTEMPTS: STUCK_ATTEMPTS,
    IDLE_DAYS: IDLE_DAYS,
    STRUGGLE_RATE: STRUGGLE_RATE,
    EXPLANATIONS: EXPLANATIONS,
    toMillis: toMillis,
    lessonState: lessonState,
    unitState: unitState,
    unitProgress: unitProgress,
    verifiedUnits: verifiedUnits,
    percentComplete: percentComplete,
    attemptsByExercise: attemptsByExercise,
    firstTryRate: firstTryRate,
    flaggedAnswers: flaggedAnswers,
    lastEventAt: lastEventAt,
    needsAttention: needsAttention,
    classSummary: classSummary,
    completedAt: completedAt,
    assignmentStatus: assignmentStatus,
    assignmentUnlocks: assignmentUnlocks,
    groupByDay: groupByDay,
    perLessonRows: perLessonRows,
    studentHeader: studentHeader
  };
})();
