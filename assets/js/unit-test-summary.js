/* PyPath — the teacher-facing view of end-of-unit test results.

   Pure by design: no DOM, no storage, no Firestore. sync.js derives the two
   summary fields from the attempts a learner has stored locally, and the two
   dashboards read those same fields back off a document. Both halves of that
   round trip live here so they cannot drift apart, and so the rules that say
   what counts as a score and what counts as a pass can be tested directly. */

// The storage contract lives in docs/superpowers/specs/2026-08-20-unit-tests-design.md.
// storage-keys.js owns the sync allowlist; this constant is only the name of
// the key to read, so the two can be compared but neither depends on the other.
export const UNIT_TESTS_KEY = 'pypath-unit-tests';
export const PASS_MARK = 70;
export const TOTAL_UNITS = 10;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// The stored value reaches us as whatever localStorage last held, which on a
// bad day is a truncated write, a null, or something another script clobbered.
// Anything that is not a usable record reads as "no attempts", never a throw:
// a dashboard that cannot render is worse than one showing an empty column.
function parseStore(raw) {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  return isPlainObject(raw) ? raw : null;
}

// Unit keys are strings in storage and may be numbers once they have been
// through Firestore, so both are accepted, and only 1..10 survive.
function unitNumber(key) {
  const n = Number(key);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_UNITS) return null;
  return n;
}

// Number(null) and Number('') are both 0, and a missing mark rendered as a zero
// would read as "sat it and got nothing". Only a real number, or a string that
// actually holds one, counts as a score.
function cleanScore(value) {
  const usable = typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '');
  if (!usable) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// A plain unit-to-score map, cleaned. Used on the dashboards, where the map
// arrives from Firestore and could hold anything a stale client wrote.
export function normalizeScores(value) {
  const source = isPlainObject(value) ? value : {};
  const out = {};
  Object.keys(source).forEach(function (key) {
    const unit = unitNumber(key);
    if (unit === null) return;
    const score = cleanScore(source[key]);
    if (score === null) return;
    out[String(unit)] = score;
  });
  return out;
}

export function passedUnits(scores) {
  const clean = normalizeScores(scores);
  return Object.keys(clean)
    .filter(function (unit) { return clean[unit] >= PASS_MARK; })
    .map(Number)
    .sort(function (a, b) { return a - b; });
}

// The two fields the spec puts on users/{uid} and roster/{uid}, derived from
// the raw pypath-unit-tests value.
export function summarizeUnitTests(raw) {
  const store = parseStore(raw) || {};
  const testScores = {};
  Object.keys(store).forEach(function (key) {
    const unit = unitNumber(key);
    if (unit === null) return;
    const entry = store[key];
    if (!isPlainObject(entry)) return;
    let score = cleanScore(entry.best);
    // `best` is the field the engine maintains, but a record half written by a
    // tab that closed mid-save can carry only the last attempt. That still
    // proves the learner sat the test, so it is better evidence than nothing.
    if (score === null && isPlainObject(entry.last)) score = cleanScore(entry.last.score);
    if (score === null) return;
    testScores[String(unit)] = score;
  });
  return { testScores: testScores, testsPassed: passedUnits(testScores) };
}

// One row per attempted unit, in unit order, for a per-student detail view.
export function scoreRows(scores) {
  const clean = normalizeScores(scores);
  return Object.keys(clean)
    .map(Number)
    .sort(function (a, b) { return a - b; })
    .map(function (unit) {
      return {
        unit: unit,
        score: clean[String(unit)],
        passed: clean[String(unit)] >= PASS_MARK,
      };
    });
}
