/* Which stops on the summit are lit, and where the hiker stands.
 *
 * `completedUnits` is the learner's own roll-up (ProgressStore's completed
 * units: every lesson and the end-of-unit test passed), so the mountain and
 * the progress page can never disagree about what "finished" means. */
export function stopStates(completedUnits, total = 10) {
  const done = new Set();
  if (Array.isArray(completedUnits)) {
    for (const value of completedUnits) {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1 && n <= total) done.add(n);
    }
  }
  const lit = Array.from({ length: total }, (_, i) => done.has(i + 1));
  const first = lit.indexOf(false);
  return { lit, hiker: first === -1 ? total - 1 : first };
}
