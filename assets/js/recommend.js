/* PyPath — "practice next": the adaptive engine's scorer and policy, in the browser.
 *
 * A line-for-line port of engine/pypath_engine/model_core.py and policy.py.
 * The model is trained offline in Python and frozen into
 * assets/data/model/mastery-v1.json; this file only scores it. No scikit-learn,
 * no Pyodide, no network beyond that one JSON file.
 *
 * DO NOT "improve" this file on its own. Every function mirrors a Python one,
 * down to the order floating-point terms are added in, and
 * tests/recommend-parity.test.js runs it against fixtures the Python engine
 * wrote (tests/fixtures/adaptive/) and requires agreement within 1e-6 and an
 * identical ranked list. Change the Python, regenerate the fixtures with
 * `python -m pypath_engine fixtures`, then change this to match.
 *
 * What it produces is a prediction from self-reported practice events, which a
 * student can fabricate. It is evidence for a conversation. It is never a grade
 * and never a ranking of students; see engine/MODEL_CARD.md.
 *
 * Loads with new Function(src).call(window) in tests, like events.js.
 */
(function () {
  'use strict';

  var DAY = 86400000;
  var TYPE_RANK = {
    'lesson.opened': 0, 'code.run': 1, 'code.error': 2, 'answer.submitted': 3,
    'code.tests_passed': 4, 'check.answered': 5, 'test.started': 6,
    'test.submitted': 7, 'quiz.submitted': 8, 'unit.completed': 9
  };
  var COURSE_TITLES = { foundations: 'Python Foundations', data: 'Python for Data' };

  /* ------------------------------------------------------------ model_core */

  function num(x) {
    if (x === null || x === undefined || typeof x === 'object' || typeof x === 'function') return 0;
    if (typeof x === 'string' && x.trim() === '') return 0;
    var v = Number(x);
    return isFinite(v) ? v : 0;
  }

  function int(x) { return Math.trunc(num(x)); }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function sortKey(e) {
    var p = e.payload || {};
    return [int(e.at), Object.prototype.hasOwnProperty.call(TYPE_RANK, e.type) ? TYPE_RANK[e.type] : 99,
      int(p.attempt), int(p.passed), String(e.lessonPath || ''), String(e.id || '')];
  }

  function compareEvents(a, b) {
    var ka = sortKey(a);
    var kb = sortKey(b);
    for (var i = 0; i < ka.length; i++) {
      var c = cmp(ka[i], kb[i]);
      if (c) return c;
    }
    return 0;
  }

  function sortedEvents(events) {
    return (events || []).slice().sort(compareEvents);
  }

  function courseOfPath(path) {
    if (path.indexOf('/units/') === 0) return 'foundations';
    if (path.indexOf('/data/') === 0) return 'data';
    return null;
  }

  function durationBucket(config, seconds) {
    var d = config.duration;
    var s = num(seconds);
    if (s <= 0) return 'missing';
    if (s >= d.outlier_at_or_above) return 'outlier';
    if (s < d.rushed_below) return 'rushed';
    if (s > d.long_above) return 'long';
    return 'normal';
  }

  function errorGroup(config, name) {
    var groups = Object.keys(config.error_groups);
    for (var i = 0; i < groups.length; i++) {
      if (config.error_groups[groups[i]].indexOf(name) !== -1) return groups[i];
    }
    return 'other';
  }

  function resolveAttempt(config, e, currentCourse) {
    var t = e.type;
    var p = e.payload || {};
    if (t === 'check.answered') {
      var qid = p.questionId;
      return qid ? ['question:' + qid, p.correct === true, null] : null;
    }
    if (t === 'code.tests_passed') {
      var path = p.lessonPath || e.lessonPath;
      var ed = p.editorId;
      var total = int(p.total);
      var passed = int(p.passed);
      if (!path || !ed || total <= 0) return null;
      return ['exercise:' + path + '#' + ed, passed >= total, passed / total];
    }
    if (t === 'test.submitted' || t === 'quiz.submitted') {
      var unit = int(p.unit);
      if (unit < 1) return null;
      var course = e.course || currentCourse || 'foundations';
      var kind = t === 'test.submitted' ? 'test' : 'quiz';
      var ok;
      if (kind === 'quiz' && int(p.total) > 0) {
        ok = int(p.correct) / int(p.total) >= config.quiz_pass_fraction;
      } else {
        ok = num(p.score) >= config.pass_mark;
      }
      return [kind + ':' + course + ':' + unit, ok, null];
    }
    return null;
  }

  function SkillState() {
    this.succ = 0; this.fail = 0; this.dsucc = 0.0; this.dfail = 0.0; this.dat = 0; this.last_at = 0;
    this.psum = 0.0; this.pn = 0; this.err_syntax = 0; this.err_name = 0; this.err_type = 0; this.err_other = 0;
    this.exposure = 0;
  }

  function decayed(config, st, at) {
    if (st.dat === 0) return [0.0, 0.0];
    var f = Math.exp(-((at - st.dat) / 86400000.0) / config.decay_days);
    return [st.dsucc * f, st.dfail * f];
  }

  function StudentState() {
    this.skills = new Map();          // insertion order matters: it mirrors a Python dict
    this.itemAttempts = new Map();
    this.itemLast = new Map();
    this.unitDuration = new Map();
    this.course = null;
  }

  StudentState.prototype.skill = function (s) {
    var st = this.skills.get(s);
    if (!st) { st = new SkillState(); this.skills.set(s, st); }
    return st;
  };

  function laplace(st) {
    if (!st) return 0.5;
    return (st.succ + 1.0) / (st.succ + st.fail + 2.0);
  }

  function features(art, state, kind, skills, unitKey, at, attemptIndex, prereqs) {
    var config = art.config;
    var names = art.global_features;
    var m = skills.length;
    var g = {};
    for (var n = 0; n < names.length; n++) g[names[n]] = 0.0;
    g.attempt_log = Math.log1p(attemptIndex - 1);
    g.is_retry = attemptIndex > 1 ? 1.0 : 0.0;
    var anyHistory = false;
    var perSkill = [];
    var partialSum = 0.0;
    var partialN = 0;
    for (var i = 0; i < skills.length; i++) {
      var s = skills[i];
      var st = state.skills.get(s);
      if (!st) {
        perSkill.push([s, 0.0, 0.0]);
      } else {
        var d = decayed(config, st, at);
        g.decay_succ += d[0] / m;
        g.decay_fail += d[1] / m;
        if (st.last_at) {
          anyHistory = true;
          g.days_since_log += Math.log1p(Math.max(0.0, (at - st.last_at) / 86400000.0)) / m;
        }
        if (st.pn) {
          partialSum += st.psum / st.pn;
          partialN += 1;
        }
        g.err_syntax += Math.log1p(st.err_syntax) / m;
        g.err_name += Math.log1p(st.err_name) / m;
        g.err_type += Math.log1p(st.err_type) / m;
        g.err_other += Math.log1p(st.err_other) / m;
        g.exposure_log += Math.log1p(st.exposure) / m;
        perSkill.push([s, Math.log1p(st.succ), Math.log1p(st.fail)]);
      }
      var pre = prereqs[s] || [];
      if (pre.length) {
        var lo = Infinity;
        for (var j = 0; j < pre.length; j++) {
          var l = laplace(state.skills.get(pre[j]));
          if (l < lo) lo = l;
        }
        g.prereq_min += lo / m;
      } else {
        g.prereq_min += 1.0 / m;
      }
    }
    g.no_history = anyHistory ? 0.0 : 1.0;
    if (partialN) {
      g.partial_rate = partialSum / partialN;
      g.has_partial = 1.0;
    }
    var bucket = unitKey ? state.unitDuration.get(unitKey) : undefined;
    if (bucket === 'rushed') g.dur_rushed = 1.0;
    else if (bucket === 'long') g.dur_long = 1.0;
    else if (bucket === 'outlier') g.dur_outlier = 1.0;
    if (kind === 'exercise' || kind === 'test' || kind === 'quiz') g['kind_' + kind] = 1.0;
    return [g, perSkill];
  }

  function updateAttempt(config, state, key, skills, at, correct, partial) {
    state.itemAttempts.set(key, (state.itemAttempts.get(key) || 0) + 1);
    state.itemLast.set(key, [at, correct]);
    for (var i = 0; i < skills.length; i++) {
      var st = state.skill(skills[i]);
      var d = decayed(config, st, at);
      st.dsucc = d[0] + (correct ? 1.0 : 0.0);
      st.dfail = d[1] + (correct ? 0.0 : 1.0);
      st.dat = at;
      st.last_at = at;
      if (correct) st.succ += 1; else st.fail += 1;
      if (partial !== null) {
        st.psum += partial;
        st.pn += 1;
      }
    }
  }

  function score(art, g, perSkill, itemKey) {
    var model = art.model;
    var names = art.global_features;
    var z = model.intercept;
    for (var i = 0; i < names.length; i++) z += model.global[names[i]] * g[names[i]];
    var m = perSkill.length;
    for (var k = 0; k < perSkill.length; k++) {
      var c = model.skills[perSkill[k][0]];
      if (c) z += (c[0] + c[1] * perSkill[k][1] + c[2] * perSkill[k][2]) / m;
    }
    if (itemKey !== null) z += Object.prototype.hasOwnProperty.call(model.items, itemKey) ? model.items[itemKey] : 0.0;
    return 1.0 / (1.0 + Math.exp(-z));
  }

  function replay(art, events) {
    var config = art.config;
    var state = new StudentState();
    var list = sortedEvents(events);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var t = e.type;
      var at = int(e.at);
      var p = e.payload || {};
      var path = p.lessonPath || e.lessonPath || '';
      var c = path ? courseOfPath(path) : null;
      if (c) state.course = c;
      var lessonSkills = art.lesson_skills[path] || [];
      if (t === 'lesson.opened' || t === 'code.run' || t === 'answer.submitted') {
        for (var a = 0; a < lessonSkills.length; a++) state.skill(lessonSkills[a]).exposure += 1;
        continue;
      }
      if (t === 'code.error') {
        var group = errorGroup(config, String(p.errorType || ''));
        for (var b = 0; b < lessonSkills.length; b++) {
          var st = state.skill(lessonSkills[b]);
          st['err_' + group] += 1;
        }
        continue;
      }
      var resolved = resolveAttempt(config, e, state.course);
      if (!resolved) continue;
      var item = art.items[resolved[0]];
      if (!item) continue;
      updateAttempt(config, state, resolved[0], item.skills, at, resolved[1], resolved[2]);
      if (t === 'test.submitted') {
        state.unitDuration.set(item.course + '|' + item.unit, durationBucket(config, p.durationSec));
      }
    }
    return state;
  }

  /* Where each skill is first taught: the earliest practice item carrying it.
     Mirrors ArtifactTaxonomy.skill_first / skill_unit. */
  function skillPlacement(art) {
    if (!art.__placement) {
      var first = {};
      var unit = {};
      Object.keys(art.items).forEach(function (k) {
        var it = art.items[k];
        if (it.kind !== 'question' && it.kind !== 'exercise') return;
        it.skills.forEach(function (s) {
          if (!Object.prototype.hasOwnProperty.call(first, s) || it.order < first[s]) {
            first[s] = it.order;
            unit[s] = it.unit;
          }
        });
      });
      Object.defineProperty(art, '__placement', { value: { first: first, unit: unit }, enumerable: false });
    }
    return art.__placement;
  }

  function prereqMap(art) {
    if (!art.__prereqs) {
      var out = {};
      Object.keys(art.skills).forEach(function (s) { out[s] = art.skills[s].prerequisites; });
      Object.defineProperty(art, '__prereqs', { value: out, enumerable: false });
    }
    return art.__prereqs;
  }

  function mastery(art, state, skill, at) {
    var f = features(art, state, 'question', [skill], null, at, 1, prereqMap(art));
    return score(art, f[0], f[1], null);
  }

  function scoreItem(art, state, key, now) {
    var it = art.items[key];
    var f = features(art, state, it.kind, it.skills, it.course + '|' + it.unit, now,
      (state.itemAttempts.get(key) || 0) + 1, prereqMap(art));
    return score(art, f[0], f[1], key);
  }

  /* ---------------------------------------------------------------- policy */

  function options(art, extra) {
    var o = {};
    var base = art.policy || {};
    Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  function fromLocalStorage(storage) {
    var out = [];
    Object.keys(storage || {}).sort().forEach(function (key) {
      var raw = storage[key];
      var value;
      try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      if (key.indexOf('pypath-checks-') === 0) {
        var path = key.slice('pypath-checks-'.length);
        Object.keys(value).sort().forEach(function (ed) {
          var r = value[ed];
          if (!r || typeof r !== 'object' || Array.isArray(r)) return;
          out.push({ type: 'code.tests_passed', at: int(r.at), lessonPath: path,
            payload: { lessonPath: path, editorId: ed, passed: int(r.passed), total: int(r.total) } });
        });
      } else if (key === 'pypath-unit-tests') {
        Object.keys(value).sort().forEach(function (rk) {
          var r = value[rk];
          if (!r || typeof r !== 'object' || Array.isArray(r)) return;
          var course = rk.indexOf('data-') === 0 ? 'data' : 'foundations';
          var unit = rk.indexOf('data-') === 0 ? rk.slice(5) : rk;
          if (!/^\d+$/.test(unit)) return;
          var last = r.last || {};
          out.push({ type: 'test.submitted', course: course, at: int(last.at || r.lastAt), lessonPath: '',
            payload: { unit: Number(unit), score: int(last.score), total: 100,
              attempt: int(r.attempts) || 1, durationSec: int(last.durationSec) } });
        });
      } else if (key === 'pypath-progress-lessons') {
        Object.keys(value).sort().forEach(function (p) {
          out.push({ type: 'lesson.opened', at: 0, lessonPath: p, payload: { lessonPath: p } });
        });
      }
    });
    return out;
  }

  function skillStatus(art, events, now, courses, extra) {
    var o = options(art, extra);
    var prereqs = prereqMap(art);
    var state = replay(art, events);
    if (!courses || !courses.length) {
      var seen = [];
      sortedEvents(events).forEach(function (e) {
        var p = e.payload || {};
        var c = e.course || courseOfPath(p.lessonPath || e.lessonPath || '');
        if (c && seen.indexOf(c) === -1) seen.push(c);
      });
      courses = seen.length ? seen : ['foundations'];
    }
    var scope = {};
    courses.forEach(function (c) { scope[c] = true; });
    var inScope = art.skill_order.filter(function (s) { return scope[art.skills[s].course]; });
    var mast = {};
    var mastered = {};
    inScope.forEach(function (s) {
      mast[s] = mastery(art, state, s, now);
      var st = state.skills.get(s);
      if (st && st.last_at && st.succ >= o.mastered_min_successes) {
        mastered[s] = mastery(art, state, s, st.last_at) >= o.mastered_at;
      } else {
        mastered[s] = false;
      }
    });
    function prereqOk(s) {
      return prereqs[s].every(function (p) { return !scope[art.skills[p].course] || mastered[p] === true; });
    }
    var place = skillPlacement(art);
    var reach = {};
    state.itemAttempts.forEach(function (_n, key) {
      var it = art.items[key];
      if (it && it.unit > (reach[it.course] || 0)) reach[it.course] = it.unit;
    });
    function withinReach(s) {
      var u = Object.prototype.hasOwnProperty.call(place.unit, s) ? place.unit[s] : 1;
      return u <= (reach[art.skills[s].course] || 1) + 1;
    }
    var frontier = inScope.filter(function (s) { return !mastered[s] && prereqOk(s) && withinReach(s); });
    var due = {};
    inScope.forEach(function (s) {
      var st = state.skills.get(s);
      if (mastered[s] && st && st.last_at) {
        var extraSucc = Math.max(0, st.succ - o.mastered_min_successes);
        var interval = Math.min(o.review_max_days, o.review_base_days * Math.pow(2, Math.min(extraSucc, 10)));
        var days = Math.floor((now - st.last_at) / DAY);
        if (days >= interval) due[s] = days;
      }
    });
    return { o: o, state: state, courses: courses, scope: scope, inScope: inScope, mastery: mast,
      mastered: mastered, prereqOk: prereqOk, frontier: frontier, due: due, reach: reach };
  }

  function bandWeight(p, o) {
    var lo = o.band[0];
    var hi = o.band[1];
    if (lo <= p && p <= hi) return 1.0;
    var d = p < lo ? (lo - p) : (p - hi);
    var x = d / o.band_width;
    return Math.exp(-(x * x));
  }

  function plural(n) { return n !== 1 ? 's' : ''; }

  function reason(art, code, skill, it, state, due) {
    var name = art.skills[skill].name;
    var kind = it.kind === 'exercise' ? 'exercise' : 'question';
    var st = state.skills.get(skill);
    if (code === 'review') {
      var days = due[skill] || 0;
      return 'Review ' + name + ': you last practised it ' + days + ' day' + plural(days) +
        ' ago, and a quick ' + kind + ' keeps it from fading.';
    }
    if (code === 'start' || code === 'relaxed') {
      var course = COURSE_TITLES[it.course] || it.course;
      if (!st || (st.succ + st.fail) === 0) {
        return 'Start here: ' + name + ' is an early step in ' + course + ', and this is one of its gentler ' + kind + 's.';
      }
      return 'Keep going with ' + name + ': it is the next step in ' + course + ' you have not yet got secure.';
    }
    var blocked = null;
    var latest = -1;
    var prereqs = prereqMap(art);
    state.skills.forEach(function (ost, other) {
      if ((prereqs[other] || []).indexOf(skill) !== -1 && (ost.succ + ost.fail) > 0 && ost.last_at > latest) {
        blocked = other;
        latest = ost.last_at;
      }
    });
    if (blocked !== null) {
      return name + ' comes first: ' + art.skills[blocked].name + ', which you have been working on, builds on it, ' +
        'and your ' + name + ' work so far is ' + (st ? st.succ : 0) + ' right, ' + (st ? st.fail : 0) + ' not yet.';
    }
    if (!st || (st.succ + st.fail) === 0) {
      return name + ' is next: everything it builds on is in place, and you have not practised it yet.';
    }
    return name + ': ' + st.succ + ' right and ' + st.fail + ' not yet so far, and what it builds on is in place, ' +
      'so this ' + kind + ' is a good next stretch.';
  }

  function recommend(art, events, now, courses, extra) {
    var S = skillStatus(art, events, now, courses, extra);
    var o = S.o;
    var state = S.state;
    var frontierSet = {};
    S.frontier.forEach(function (s) { frontierSet[s] = true; });

    function excluded(key) {
      var last = state.itemLast.get(key);
      if (!last) return false;
      if (now - last[0] < o.recent_exclude_hours * 3600000) return true;
      return last[1] && now - last[0] < o.correct_exclude_days * DAY;
    }

    var practice = Object.keys(art.items).map(function (k) { return [k, art.items[k]]; })
      .filter(function (kv) {
        var it = kv[1];
        return (it.kind === 'question' || it.kind === 'exercise') && S.scope[it.course] &&
          it.skills.every(function (s) { return S.scope[art.skills[s].course]; });
      })
      .sort(function (a, b) { return cmp(a[1].order, b[1].order) || cmp(a[0], b[0]); });

    var scored = [];
    practice.forEach(function (kv) {
      var key = kv[0];
      var it = kv[1];
      if (!it.skills.every(S.prereqOk) || excluded(key)) return;
      var target = null;
      var code = 'frontier';
      for (var i = 0; i < it.skills.length; i++) { if (frontierSet[it.skills[i]]) { target = it.skills[i]; break; } }
      if (target === null) {
        for (var j = 0; j < it.skills.length; j++) {
          if (Object.prototype.hasOwnProperty.call(S.due, it.skills[j])) { target = it.skills[j]; break; }
        }
        code = 'review';
      }
      if (target === null) return;
      var p = scoreItem(art, state, key, now);
      var gain = code === 'frontier' ? (1.0 - S.mastery[target]) * bandWeight(p, o) : o.review_weight * bandWeight(p, o);
      scored.push({ neg: -gain, order: it.order, key: key, it: it, target: target, p: p, gain: gain, code: code });
    });
    scored.sort(function (a, b) { return cmp(a.neg, b.neg) || cmp(a.order, b.order) || cmp(a.key, b.key); });

    var picked = [];
    var perSkill = {};
    function take(key, it, target, p, gain, code) {
      perSkill[target] = (perSkill[target] || 0) + 1;
      picked.push({ item: key, kind: it.kind, lesson: it.lesson, skill: target, skill_name: art.skills[target].name,
        p: p, gain: gain, reason_code: code, reason: reason(art, code, target, it, state, S.due) });
    }

    if (state.itemAttempts.size === 0) scored = [];
    for (var n = 0; n < scored.length; n++) {
      var r = scored[n];
      if (picked.length >= o.max_items) break;
      if ((perSkill[r.target] || 0) >= o.per_skill_cap) continue;
      take(r.key, r.it, r.target, r.p, r.gain, r.code);
    }

    if (!picked.length) {
      var place = skillPlacement(art);
      var pool = (S.frontier.length ? S.frontier : S.inScope).slice().sort(function (a, b) {
        var fa = Object.prototype.hasOwnProperty.call(place.first, a) ? place.first[a] : 1e9;
        var fb = Object.prototype.hasOwnProperty.call(place.first, b) ? place.first[b] : 1e9;
        return cmp(fa, fb) || cmp(art.skill_order.indexOf(a), art.skill_order.indexOf(b));
      });
      var relaxes = [false, true];
      for (var q = 0; q < relaxes.length; q++) {
        var relax = relaxes[q];
        for (var si = 0; si < pool.length; si++) {
          var s = pool[si];
          var items = practice.filter(function (kv) {
            return kv[1].skills[0] === s && kv[1].skills.every(S.prereqOk) && (relax || !excluded(kv[0]));
          });
          items.sort(function (a, b) {
            var ea = Object.prototype.hasOwnProperty.call(art.model.items, a[0]) ? art.model.items[a[0]] : 0.0;
            var eb = Object.prototype.hasOwnProperty.call(art.model.items, b[0]) ? art.model.items[b[0]] : 0.0;
            return cmp(-ea, -eb) || cmp(a[1].order, b[1].order) || cmp(a[0], b[0]);
          });
          var top = items.slice(0, o.per_skill_cap);
          for (var t = 0; t < top.length; t++) {
            if (picked.length >= o.max_items) break;
            take(top[t][0], top[t][1], s, scoreItem(art, state, top[t][0], now), 0.0, relax ? 'relaxed' : 'start');
          }
          if (picked.length >= o.max_items) break;
        }
        if (picked.length) break;
      }
    }
    if (!picked.length && practice.length) {
      take(practice[0][0], practice[0][1], practice[0][1].skills[0], scoreItem(art, state, practice[0][0], now), 0.0, 'relaxed');
    }
    return picked;
  }

  /* One learner's history as this browser knows it. JS only: there is no Python
     twin because it is about where the browser keeps things, not about scoring.

     The local event mirror (events.js) is the fuller record -- every attempt,
     not just the best -- but it only exists from the day it shipped. Local
     storage holds older results. So: the mirror, plus whatever storage knows
     that the mirror does not. An exercise or a unit test the mirror already has
     is not counted twice. */
  function historyFromBrowser(localEvents, storage) {
    var events = (localEvents || []).slice();
    var exercises = {};
    var tests = {};
    var lessons = {};
    events.forEach(function (e) {
      var p = e.payload || {};
      var path = p.lessonPath || e.lessonPath || '';
      if (path) lessons[path] = true;
      if (e.type === 'code.tests_passed') exercises[path + '#' + p.editorId] = true;
      if (e.type === 'test.submitted') tests[String(int(p.unit))] = true;
    });
    fromLocalStorage(storage).forEach(function (e) {
      var p = e.payload || {};
      if (e.type === 'code.tests_passed' && exercises[e.lessonPath + '#' + p.editorId]) return;
      if (e.type === 'test.submitted' && tests[String(p.unit)]) return;
      if (e.type === 'lesson.opened' && lessons[e.lessonPath]) return;
      events.push(e);
    });
    return events;
  }

  window.PyPathRecommend = {
    historyFromBrowser: historyFromBrowser,
    replay: replay,
    features: features,
    score: score,
    mastery: mastery,
    scoreItem: scoreItem,
    skillStatus: skillStatus,
    recommend: recommend,
    fromLocalStorage: fromLocalStorage,
    sortedEvents: sortedEvents
  };
})();
