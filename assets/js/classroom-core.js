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

  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  /* Three failed attempts at the same exercise with nothing passing. Two is a
     normal amount of wrong; by the fourth a student has usually stopped
     learning and started guessing. */
  var STUCK_ATTEMPTS = 3;

  var IDLE_DAYS = 7;

  /* Below this first-try pass rate across a unit, the problem is more likely
     the explanation than the student. */
  var STRUGGLE_RATE = 0.5;

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

  function percentComplete(events, lessonsByUnit) {
    var total = 0;
    var done = 0;
    Object.keys(lessonsByUnit || {}).forEach(function (unit) {
      var verified = verifiedUnits(events)[Number(unit)];
      lessonsByUnit[unit].forEach(function (path) {
        total += 1;
        var state = lessonState(events, path, verified);
        if (state === 'passed' || state === 'verified') done += 1;
      });
    });
    return total ? Math.round((done / total) * 100) : 0;
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
  function firstTryRate(events, unit) {
    var attempted = 0;
    var passed = 0;
    var byExercise = attemptsByExercise(events);
    Object.keys(byExercise).forEach(function (key) {
      var entry = byExercise[key];
      var m = /^\/units\/unit-(\d+)\//.exec(entry.lessonPath);
      if (!m || Number(m[1]) !== unit) return;
      attempted += 1;
      if (entry.firstTryPassed) passed += 1;
    });
    return attempted ? passed / attempted : null;
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
        var rate = firstTryRate(events, unit);
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

  /* Every number on the dashboard gets one of these next to it. A teacher who
     cannot interrogate a number does not trust it, and a number they do not
     trust is worse than no number, because it is still taking up the space
     where a usable one would go. */
  var EXPLANATIONS = {
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
    trust: 'These events are recorded by each student\'s own browser. They are a '
      + 'record of what the site saw, not proof of what happened, and a determined '
      + 'student could send something untrue. Use them to decide who to talk to, '
      + 'not to decide a grade.'
  };

  window.PyPathClassroom = {
    MASTERY: MASTERY,
    MASTERY_LABEL: MASTERY_LABEL,
    MASTERY_MARK: MASTERY_MARK,
    STUCK_ATTEMPTS: STUCK_ATTEMPTS,
    IDLE_DAYS: IDLE_DAYS,
    STRUGGLE_RATE: STRUGGLE_RATE,
    EXPLANATIONS: EXPLANATIONS,
    toMillis: toMillis,
    lessonState: lessonState,
    unitState: unitState,
    verifiedUnits: verifiedUnits,
    percentComplete: percentComplete,
    attemptsByExercise: attemptsByExercise,
    firstTryRate: firstTryRate,
    lastEventAt: lastEventAt,
    needsAttention: needsAttention,
    classSummary: classSummary
  };
})();
