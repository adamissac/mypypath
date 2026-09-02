/* PyPath — drawing test cases instead of listing them.
 *
 * The point of this file, in one sentence: a fixed list of hidden cases can be
 * memorized and a drawn one cannot.
 *
 * checker.js runs three to six authored cases per exercise. A student who
 * writes `if length == 4 and width == 3: return 12` for each of them passes
 * completely, and no amount of adding more hidden cases fixes that, because
 * whatever the number is, it is finite and it is the same every time. Forty
 * cases drawn from a space of forty thousand are not enumerable in a lesson
 * exercise, so the only way through is to write the rule.
 *
 * Pure and Pyodide-free on purpose. Everything here is arithmetic and string
 * building, so the generator can be tested exhaustively without an
 * interpreter, and the interpreter half in checker.js stays small enough to
 * read.
 */
(function () {
  'use strict';

  /* Each drawn case is a real interpreter call, twice: once for the reference
     and once for the student. Forty is generous for a beginner exercise and
     fast; a thousand would be a frozen tab for no extra confidence. */
  var MAX_RUNS = 60;

  var DEFAULT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

  /* mulberry32. Small, fast, and deterministic given a seed, which is the only
     property that matters here: the same attempt must draw the same cases, so
     a student who reports "it failed" and a teacher who reruns it are looking
     at the same run. */
  function seeded(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function intBetween(rand, min, max) {
    return min + Math.floor(rand() * (max - min + 1));
  }

  /* Where beginner code actually breaks: zero, one, the bounds themselves, and
     an empty collection. A uniform draw over 0..500 lands on 0 about twice in a
     thousand, so the edges are placed rather than hoped for. */
  function edgesFor(spec) {
    if (spec.type === 'int' || spec.type === 'float') {
      var lo = spec.min === undefined ? 0 : spec.min;
      var hi = spec.max === undefined ? 100 : spec.max;
      var edges = [lo, hi];
      if (lo < 0 && hi > 0) edges.push(0);
      if (lo <= 1 && hi >= 1) edges.push(1);
      return edges;
    }
    if (spec.type === 'str') {
      return (spec.minLength || 0) === 0 ? [''] : [];
    }
    if (spec.type === 'list') {
      return (spec.minLength || 0) === 0 ? [[]] : [];
    }
    if (spec.type === 'dict') {
      return (spec.minLength || 0) === 0 ? [{ __pytype: 'dict', entries: [] }] : [];
    }
    if (spec.type === 'set') {
      return (spec.minLength || 0) === 0 ? [{ __pytype: 'set', items: [] }] : [];
    }
    return [];
  }

  function drawOne(spec, rand) {
    var s = spec || {};
    switch (s.type) {
      case 'float': {
        var flo = s.min === undefined ? 0 : s.min;
        var fhi = s.max === undefined ? 100 : s.max;
        // Two decimal places, because that is what an exercise about money or
        // measurement asks for and what a student would type.
        return Math.round((flo + rand() * (fhi - flo)) * 100) / 100;
      }
      case 'bool':
        return rand() < 0.5;
      case 'str': {
        var alphabet = s.alphabet || DEFAULT_ALPHABET;
        var min = s.minLength === undefined ? 1 : s.minLength;
        var max = s.maxLength === undefined ? 8 : s.maxLength;
        var length = intBetween(rand, min, Math.max(min, max));
        var out = '';
        for (var i = 0; i < length; i++) {
          out += alphabet.charAt(intBetween(rand, 0, alphabet.length - 1));
        }
        return out;
      }
      case 'list': {
        var lmin = s.minLength === undefined ? 0 : s.minLength;
        var lmax = s.maxLength === undefined ? 6 : s.maxLength;
        var n = intBetween(rand, lmin, Math.max(lmin, lmax));
        var items = [];
        for (var j = 0; j < n; j++) items.push(drawOne(s.of || { type: 'int' }, rand));
        return items;
      }
      /* Unit 4 asks about dictionaries, and a dictionary cannot be drawn as a
         list of pairs and hoped for: the keys have to be unique or the literal
         written from them has fewer entries than the draw thought it made, and
         the reference and the student then disagree about a length neither of
         them chose. Drawing until unique is the whole trick. */
      case 'dict': {
        var dmin = s.minLength === undefined ? 0 : s.minLength;
        var dmax = s.maxLength === undefined ? 5 : s.maxLength;
        var dn = intBetween(rand, dmin, Math.max(dmin, dmax));
        var keySpec = s.keys || { type: 'str' };
        var valueSpec = s.values || { type: 'int' };
        var entries = [];
        var seenKeys = {};
        // Bounded, because a key space smaller than the requested length would
        // otherwise spin here forever. A short dict is a fine draw; a hung tab
        // is not.
        for (var attempts = 0; entries.length < dn && attempts < dn * 20; attempts++) {
          var key = drawOne(keySpec, rand);
          var mark = typeof key + ':' + String(key);
          if (seenKeys[mark]) continue;
          seenKeys[mark] = true;
          entries.push([key, drawOne(valueSpec, rand)]);
        }
        return { __pytype: 'dict', entries: entries };
      }
      /* Sets are drawn for what a function is *given*, not for what it returns.
         Two sets with the same members compare equal in Python but their reprs
         can be written in different orders, and the generated case compares
         reprs. An exercise whose answer is a set should return a sorted list,
         or use a `value` case with an explicit expectation. */
      case 'set': {
        var smin = s.minLength === undefined ? 0 : s.minLength;
        var smax = s.maxLength === undefined ? 5 : s.maxLength;
        var sn = intBetween(rand, smin, Math.max(smin, smax));
        var itemSpec = s.of || { type: 'int' };
        var items = [];
        var seenItems = {};
        for (var tries = 0; items.length < sn && tries < sn * 20; tries++) {
          var item = drawOne(itemSpec, rand);
          var tag = typeof item + ':' + String(item);
          if (seenItems[tag]) continue;
          seenItems[tag] = true;
          items.push(item);
        }
        return { __pytype: 'set', items: items };
      }
      case 'choice': {
        var values = Array.isArray(s.values) && s.values.length ? s.values : [0];
        return values[intBetween(rand, 0, values.length - 1)];
      }
      default: {
        // int, and anything an author mistyped. Falling back to an integer
        // rather than throwing keeps one bad spec from killing a whole lesson.
        var lo2 = s.min === undefined ? 0 : s.min;
        var hi2 = s.max === undefined ? 100 : s.max;
        return intBetween(rand, lo2, Math.max(lo2, hi2));
      }
    }
  }

  /* Returns an array of argument rows. `seed` moves with the attempt number, so
     running the check twice draws two different sets: a fixed seed would be a
     fixed hidden set again, discovered once and passed around the class. */
  function draw(specs, runs, seed) {
    var list = Array.isArray(specs) ? specs : [];
    var want = Math.min(Math.max(Number(runs) || 1, 1), MAX_RUNS);
    var rand = seeded(seed);
    var rows = [];

    // The edge rows first, one per argument, so they are never crowded out by
    // the run count.
    var edges = list.map(edgesFor);
    var deepest = edges.reduce(function (acc, e) { return Math.max(acc, e.length); }, 0);
    for (var e = 0; e < deepest && rows.length < want; e++) {
      rows.push(list.map(function (spec, i) {
        var own = edges[i];
        return own.length ? own[Math.min(e, own.length - 1)] : drawOne(spec, rand);
      }));
    }

    while (rows.length < want) {
      rows.push(list.map(function (spec) { return drawOne(spec, rand); }));
    }
    return rows;
  }

  /* A drawn value written as Python source.
   *
   * Every escape here matters more than it looks. The value is concatenated
   * into a string that Python parses, so a quote or a backslash that escapes
   * its own literal is not a wrong answer, it is arbitrary code in the harness.
   * JSON.stringify handles quotes, backslashes and control characters with the
   * same rules Python uses for a double-quoted string. */
  function toPython(value) {
    if (value === null || value === undefined) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return '[' + value.map(toPython).join(', ') + ']';
    if (value && value.__pytype === 'dict') {
      return '{' + (value.entries || []).map(function (pair) {
        return toPython(pair[0]) + ': ' + toPython(pair[1]);
      }).join(', ') + '}';
    }
    if (value && value.__pytype === 'set') {
      // `{}` is an empty dict in Python, not an empty set, and a case that
      // silently passed a dict where a set was meant would fail the student
      // for the author's mistake.
      var members = value.items || [];
      if (!members.length) return 'set()';
      return '{' + members.map(toPython).join(', ') + '}';
    }
    return JSON.stringify(String(value));
  }

  /* The entry name comes from an authored file rather than from a student, but
     it is still concatenated into source, and refusing anything that is not a
     plain identifier costs one regex. */
  function callFor(entry, row) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(entry || ''))) return null;
    return entry + '(' + (row || []).map(toPython).join(', ') + ')';
  }

  window.PyPathGen = {
    MAX_RUNS: MAX_RUNS,
    seeded: seeded,
    draw: draw,
    drawOne: drawOne,
    toPython: toPython,
    callFor: callFor
  };
})();
