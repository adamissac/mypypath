/* PyPath — whether a written answer mentions what the lesson was about.
 *
 * The floor in reflection-check.js asks "did they write something". This asks
 * "is it about this". Between them they cover the two ways a reflection box
 * gets filled without being answered, and neither of them is a grader.
 *
 * Be honest about how weak this is, because the weakness is what decides what
 * it is allowed to do. It is a word check. It cannot tell an insightful answer
 * from a keyword-stuffed one, and a genuinely thoughtful answer written in
 * words the author did not think of fails it. A check with that error rate must
 * never gate anything, and this one does not: the learner sees the author's own
 * hint and their answer still counts, and a teacher sees a row only after three
 * of them, worded as the word check it is.
 *
 * The author writes the expectations because the author already knows them.
 * That is the whole trick, and it is why this needs no model.
 */
(function () {
  'use strict';

  /* One group is one idea, spelled the several ways a fourteen-year-old might
     spell it. Matching is on word boundaries so "read" does not fire on
     "already", and case-insensitive because nobody capitalises consistently in
     a textarea. */
  function mentions(text, phrase) {
    var needle = String(phrase || '').trim().toLowerCase();
    if (!needle) return false;
    var hay = String(text == null ? '' : text).toLowerCase();
    // Escaped, because an author's phrase is data and a phrase like "len()"
    // would otherwise be a regex with a group in it.
    var escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i').test(hay);
  }

  function groupHit(text, group) {
    var options = Array.isArray(group) ? group : [group];
    return options.some(function (phrase) { return mentions(text, phrase); });
  }

  /* Returns { checked, hits, needed, ok, hint }.

     `checked` is false when the author wrote no expectations for this item,
     which is the state almost every lesson is in and will stay in for a while.
     Not-checked is a real answer and is not the same as passing: a caller that
     treated the two as one would start reporting "did not mention any ideas"
     for every unauthored reflection in the course. */
  function assess(text, spec) {
    var s = spec || {};
    var groups = Array.isArray(s.expect_any) ? s.expect_any : null;
    if (!groups || !groups.length) {
      return { checked: false, hits: 0, needed: 0, ok: true, hint: '' };
    }

    var hits = groups.filter(function (group) { return groupHit(text, group); }).length;
    var needed = Math.max(1, Math.min(Number(s.min_concepts) || 1, groups.length));
    var ok = hits >= needed;

    return {
      checked: true,
      hits: hits,
      needed: needed,
      ok: ok,
      // The author's own words. This module never writes feedback of its own,
      // because "you did not mention any of the expected words" is a sentence
      // about the check rather than about the lesson, and it would be the same
      // sentence on all ninety-nine of them.
      hint: ok ? '' : String(s.hint || '')
    };
  }

  window.PyPathConcepts = {
    mentions: mentions,
    groupHit: groupHit,
    assess: assess
  };
})();
