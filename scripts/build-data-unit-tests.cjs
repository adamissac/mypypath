/* Writes the Python for Data end-of-unit test pools and quiz bank.
 *
 * Both courses number their units from 1, so these live under a data/ folder
 * of their own. Foundations keeps its flat paths: every stored result and
 * every teacher-assigned quiz is keyed off them, and moving them buys symmetry
 * and nothing else. unit-test-page.js and quiz-bank.js make the same split.
 */
const fs = require('fs');
const path = require('path');

const MCQ = require('./data-unit-tests-content.cjs');
const FRQ = require('./data-unit-tests-frq.cjs');

const ROOT = process.cwd();
const UNITS = 10;

function write(rel, value) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

let files = 0;
const seen = new Set();

for (let n = 1; n <= UNITS; n++) {
  const mcq = MCQ[`UNIT_${n}`];
  const frq = FRQ[n];
  if (!mcq || !frq) throw new Error(`unit ${n} has no questions`);

  // The paper draws ten; a pool of exactly ten would give an identical retake.
  if (mcq.length < 10) throw new Error(`unit ${n} pool is ${mcq.length}, under the ten a paper needs`);

  for (const q of mcq.concat(frq)) {
    if (seen.has(q.id)) throw new Error(`duplicate question id ${q.id}`);
    seen.add(q.id);
  }

  write(`assets/data/unit-tests/data/unit-${n}-mcq.json`, mcq);
  write(`assets/data/unit-tests/data/unit-${n}-frq.json`, frq);

  /* The quiz bank a teacher picks from. Foundations keeps a separate pool of
     extra questions here; for this course the unit-test pool is the bank, so
     the file is an empty list rather than a second copy that can drift out of
     step with the one above. quiz-bank.js merges the two. */
  write(`assets/data/quiz-bank/data/unit-${n}.json`, []);
  files += 3;
}

console.log(`wrote ${files} files, ${seen.size} questions across ${UNITS} units`);
