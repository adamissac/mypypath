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
    SNAPSHOT_BYTES_PER_LESSON: 64 * 1024
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
      return p.unit === unit && p.total > 0 && (p.score / p.total) * 100 >= 70;
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
    largePaste: 'More than ' + 120 + ' characters appeared between one snapshot and '
      + 'the next. That is all this means. Typing quickly, pasting your own earlier '
      + 'work, and copying an example from the lesson all look the same here, so treat '
      + 'it as a reason to ask a question rather than as evidence of anything.',
    snapshots: 'Up to 20 states per editor, captured when code is run and when typing '
      + 'pauses -- never per keystroke. Oldest are dropped once a lesson\'s history '
      + 'passes 64KB.',
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
    lastEventAt: lastEventAt,
    needsAttention: needsAttention,
    classSummary: classSummary,
    groupByDay: groupByDay,
    perLessonRows: perLessonRows,
    studentHeader: studentHeader
  };
})();
