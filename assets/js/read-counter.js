/* PyPath — how many Firestore documents a page actually read.
 *
 * WHY THIS EXISTS. The teacher dashboard was fanning out one 500-event query
 * plus one unbounded mirror query per student, which on a 50-student class is
 * roughly 25,000 document reads for one page open, against a Spark plan budget
 * of 50,000 per day for the entire project across all users. Nobody noticed for
 * months, because a read costs nothing visible: the page is fast, the console
 * is quiet, and the bill is a number on a website nobody has open.
 *
 * So the cost is instrumented rather than reasoned about. Optimising without a
 * baseline is how you end up unable to prove the fix worked, and "it should be
 * about one read per student now" is not a measurement.
 *
 * OFF BY DEFAULT, and free when off. Every call site is a function call that
 * returns immediately unless counting was switched on, and the counter is not
 * switched on by anything the site does on its own. Turn it on with either:
 *
 *     ?readcount=1                      in the URL, for one page load
 *     localStorage['pypath:readcount']  set to '1', for a session
 *
 * and read the result from the console, or from window.PyPathReads.report().
 *
 * WHAT IT COUNTS is documents returned, not queries issued, because documents
 * returned is what Firestore bills. A getDocs that matches 400 documents is 400
 * reads; a getDoc that finds nothing is still one. An empty query result is
 * billed as one read by Firestore's own rules, and this counts it as one so the
 * number matches the console rather than being tidier than the truth.
 */

const ON = (() => {
  try {
    if (typeof location !== 'undefined'
        && new URLSearchParams(location.search).get('readcount') === '1') return true;
    return localStorage.getItem('pypath:readcount') === '1';
  } catch (e) {
    // Private browsing can throw on localStorage. Not being able to instrument
    // is never a reason to break the page.
    return false;
  }
})();

const tally = new Map();
let total = 0;

/* Records `n` documents read under a label.
 *
 * The label is the call site, not the collection: two different features
 * reading the same collection are two different costs, and the point of the
 * report is to say which feature to go and fix. */
export function docs(n, label) {
  if (!ON) return n;
  const count = Number(n) || 0;
  // Firestore bills an empty query result as one read. Counting it as zero
  // would make a page look cheaper than the invoice says it is.
  const billed = count === 0 ? 1 : count;
  tally.set(label, (tally.get(label) || 0) + billed);
  total += billed;
  return n;
}

/* Convenience for the common `getDocs` shape, so a call site reads as one
   expression rather than a temporary and a count. */
export function counted(snap, label) {
  docs(snap && typeof snap.size === 'number' ? snap.size : 1, label);
  return snap;
}

/* A listener delivery, which is billed differently from a query.
 *
 * Firestore bills a listener's FIRST snapshot at one read per document and
 * every later delivery at one read per CHANGED document. A delivery served
 * from the local cache is not billed at all, and a delivery carrying no
 * changes costs nothing -- which is why this does not apply docs()'s
 * empty-query-is-one-read rule. That rule is about queries; applying it here
 * reported an idle listener as costing a read every time it woke up, which is
 * the opposite of the fact the instrument exists to establish. */
export function delivery(changed, fromCache, label) {
  if (!ON || fromCache) return;
  const n = Number(changed) || 0;
  if (!n) return;
  tally.set(label, (tally.get(label) || 0) + n);
  total += n;
}

export function enabled() {
  return ON;
}

export function reset() {
  tally.clear();
  total = 0;
}

export function report() {
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return { total, byLabel: Object.fromEntries(rows) };
}

/* Printed rather than returned, because the audience is a person with a
   console open and the useful form is a table. */
export function print(note) {
  if (!ON) {
    console.info('[pypath] read counting is off. Add ?readcount=1 to switch it on.');
    return;
  }
  const { total: t, byLabel } = report();
  console.info(`[pypath] ${t} document reads${note ? ` — ${note}` : ''}`);
  console.table(byLabel);
}

if (ON && typeof window !== 'undefined') {
  window.PyPathReads = { report, print, reset, docs };
  console.info('[pypath] counting Firestore document reads. window.PyPathReads.print()');
}
