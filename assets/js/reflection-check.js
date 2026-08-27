/* PyPath — a floor under reflection answers, not a grade on them.
 *
 * Today watchReflections() in lesson-progress.js marks a reflection done the
 * instant the box is not empty. One character passes. This is the sharpest
 * version of "type anything and pass" anywhere in the codebase, sharper than
 * anything in the code-checking path, which at least runs real Python.
 *
 * What this file is not: a judge of whether an answer is any good. It cannot
 * tell a thoughtful answer from a fluent wrong one and it does not try. Every
 * rule below is structural, in the same spirit as `nonempty` in checker.js.
 * Judging meaning needs a model and is a separate piece of work.
 *
 * Two properties matter more than any of the rules:
 *
 * It gates the tick, never the page. A learner whose answer does not clear the
 * floor is told what is missing and can save again as often as they like.
 * Nothing is locked, nothing is recorded, and no event is emitted, because
 * "wrote something short" is not a fact worth pushing at a teacher.
 *
 * It fails toward accepting. Anything unexpected in here resolves to ok. The
 * behaviour before this file existed was to accept everything, so a bug in it
 * must degrade to that rather than to a learner who cannot finish a lesson.
 */
(function () {
  'use strict';

  /* Deliberately low. "It runs faster" is a real answer to some prompts and is
     three words. This is a floor on effort, not on insight, and it exists to
     catch "a" rather than to demand an essay. */
  var MIN_WORDS = 8;

  /* Below this share of distinct words, the answer is one word padded out.
     Ordinary English repeats "the" and "it" freely, so this is set where only
     deliberate padding lands. */
  var MIN_DISTINCT = 0.4;

  var VOWELS = /[aeiouy]/i;

  function words(text) {
    return String(text == null ? '' : text)
      .trim()
      .split(/\s+/)
      .filter(function (w) { return w.length > 0; });
  }

  /* Punctuation and case stripped, so "meaningful name?" and "Meaningful name"
     compare equal when checking whether the prompt was pasted back. */
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function allOneCharacter(text) {
    var stripped = String(text || '').replace(/\s+/g, '');
    if (stripped.length < 4) return false;
    for (var i = 1; i < stripped.length; i++) {
      if (stripped.charAt(i) !== stripped.charAt(0)) return false;
    }
    return true;
  }

  function tooFewDistinct(list) {
    var seen = {};
    list.forEach(function (w) { seen[w.toLowerCase()] = true; });
    return Object.keys(seen).length / list.length < MIN_DISTINCT;
  }

  /* Keyboard mash has no vowels in its longer runs. Checked only on words of
     four or more letters, because "str", "n" and "x" are all real things to
     write about Python and none of them has a vowel. */
  function looksMashed(list) {
    var longWords = list.filter(function (w) {
      return /^[a-z]+$/i.test(w) && w.length >= 4;
    });
    if (longWords.length < 2) return false;
    var vowelless = longWords.filter(function (w) { return !VOWELS.test(w); });
    return vowelless.length / longWords.length > 0.5;
  }

  var REASONS = {
    short: 'This needs a bit more. A sentence or two in your own words is plenty.',
    prompt: 'That is the question again. Have a go at answering it in your own words.',
    padded: 'This is the same word over and over. A sentence or two saying what you '
      + 'think is what is wanted here.',
    mashed: 'That does not look like an answer yet. A sentence or two in your own '
      + 'words is plenty.'
  };

  /* Returns { ok, reason }. `reason` is always something a learner can act on
     and never a verdict on them: a floor that refuses without saying what it
     wants is a wall. */
  function assess(text, options) {
    try {
      var list = words(text);
      if (allOneCharacter(text)) return { ok: false, reason: REASONS.mashed };
      if (list.length < MIN_WORDS) return { ok: false, reason: REASONS.short };

      var opts = options || {};
      if (typeof opts.prompt === 'string' && opts.prompt) {
        var answer = normalize(text);
        var prompt = normalize(opts.prompt);
        // Pasting the question back is the most common way to defeat a length
        // check, and it is the only equality test here: an answer that merely
        // quotes some of the prompt is a normal answer.
        if (prompt && (answer === prompt || answer === prompt + ' ')) {
          return { ok: false, reason: REASONS.prompt };
        }
      }

      if (tooFewDistinct(list)) return { ok: false, reason: REASONS.padded };
      if (looksMashed(list)) return { ok: false, reason: REASONS.mashed };

      return { ok: true, reason: '' };
    } catch (e) {
      // Accept everything is what this replaced, and it is where a bug in here
      // has to land.
      return { ok: true, reason: '' };
    }
  }

  window.PyPathReflection = {
    MIN_WORDS: MIN_WORDS,
    MIN_DISTINCT: MIN_DISTINCT,
    assess: assess
  };
})();
