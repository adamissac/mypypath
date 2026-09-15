/* PyPath — "Where the class is stuck": per-skill evidence for a teacher.
 *
 * For each skill, counted over the whole class: how many students have tried
 * its graded exercises, how many have an exercise on it they have tried and
 * not yet passed, and how many have made three or more attempts at one without
 * passing. Plus the lesson where most of those unfinished attempts sit.
 *
 * WHAT THIS IS NOT. It is not a model estimate and not a score. The browser
 * model behind "Practice next" needs each student's full attempt history, and
 * the dashboard deliberately reads one summary per student instead of up to
 * 500 events (CLAUDE.md: 2,451 reads per open -> 95). So this counts what the
 * summary-backed log can honestly answer -- attempts and passes per exercise,
 * through classroom-core's own attemptsByExercise -- and says so on the panel.
 *
 * It never names or ranks students. The events are self-reported by each
 * student's browser; a count is a reason to look, not a finding.
 *
 * Pure: students and the model artifact in, rows out. Tested in
 * tests/class-skill-gaps.test.js.
 */
(function () {
  'use strict';

  var MANY_TRIES = 3;

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function classSkillGaps(students, art, attemptsByExercise, options) {
    var o = options || {};
    var minTried = o.minTried || 2;
    // One student with an unfinished exercise is already a named row in "Needs
    // attention"; this panel is for what several students share.
    var minNotYet = o.minNotYet || 2;
    var limit = o.limit || 6;
    var tally = {};

    (students || []).forEach(function (student) {
      var byExercise = attemptsByExercise(student.events || []);
      var perSkill = {};
      Object.keys(byExercise).forEach(function (key) {
        var entry = byExercise[key];
        var item = art.items['exercise:' + entry.lessonPath + '#' + entry.exerciseId];
        if (!item || !entry.attempts) return;
        item.skills.forEach(function (skill) {
          var s = perSkill[skill] || (perSkill[skill] = { tried: true, notYet: false, many: false, lessons: {} });
          if (!entry.passed) {
            s.notYet = true;
            s.lessons[entry.lessonPath] = (s.lessons[entry.lessonPath] || 0) + 1;
            if (entry.attempts >= MANY_TRIES) s.many = true;
          }
        });
      });
      Object.keys(perSkill).forEach(function (skill) {
        var t = tally[skill] || (tally[skill] = { tried: 0, notYet: 0, many: 0, lessons: {} });
        var s = perSkill[skill];
        t.tried += 1;
        if (s.notYet) t.notYet += 1;
        if (s.many) t.many += 1;
        Object.keys(s.lessons).forEach(function (path) {
          t.lessons[path] = (t.lessons[path] || 0) + 1;
        });
      });
    });

    var order = art.skill_order || Object.keys(art.skills);
    var rows = Object.keys(tally)
      .filter(function (skill) { return tally[skill].tried >= minTried && tally[skill].notYet >= minNotYet && art.skills[skill]; })
      .map(function (skill) {
        var t = tally[skill];
        var lesson = Object.keys(t.lessons).sort(function (a, b) {
          return (t.lessons[b] - t.lessons[a]) || (a < b ? -1 : a > b ? 1 : 0);
        })[0] || '';
        var evidence = plural(t.notYet, 'student', 'students') + ' of the ' + t.tried +
          ' who tried its exercises ' + (t.notYet === 1 ? 'has' : 'have') + ' one not passed yet';
        if (t.many) {
          evidence += '; ' + plural(t.many, 'student has', 'students have') +
            ' made three or more attempts at the same exercise';
        }
        return {
          skill: skill,
          name: art.skills[skill].name,
          tried: t.tried,
          notYet: t.notYet,
          manyTries: t.many,
          lessonPath: lesson,
          lessonTitle: (art.lesson_titles && art.lesson_titles[lesson]) || lesson,
          evidence: evidence + '.'
        };
      })
      .sort(function (a, b) {
        return (b.notYet / b.tried - a.notYet / a.tried) || (b.manyTries - a.manyTries) ||
          (order.indexOf(a.skill) - order.indexOf(b.skill));
      });
    return rows.slice(0, limit);
  }

  window.PyPathSkillGaps = { classSkillGaps: classSkillGaps, MANY_TRIES: MANY_TRIES };
})();
