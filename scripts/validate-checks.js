#!/usr/bin/env node
/* PyPath — validates the authored check files against the curriculum manifest.
 *
 * A check file that names an exercise the page does not have is silently dead:
 * no button appears, nothing fails, and nobody notices until a teacher asks
 * why a lesson shows no results. This turns that into a build error.
 *
 * Usage: npm run validate:checks
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKS_DIR = path.join(ROOT, 'assets', 'data', 'checks');

const PROPERTY_KEYS = ['nonempty', 'min_lines', 'max_lines', 'stdout_matches', 'source_matches'];

/* Mirrors QUESTION_KINDS in assets/js/question-types.js. Repeated rather than
   imported because that file is a browser global with no export, the same way
   classroom-core.js repeats the unit-test pass mark. A test asserts the two
   lists agree, so they cannot drift. */
export const QUESTION_KINDS = ['mcq', 'multi', 'match', 'order', 'blank'];

/* What each kind needs to be answerable at all. An unanswerable question is
   worse than no question: the learner reads the explanation for an option that
   was never right and learns something untrue. */
function validateQuestionKind(q, where, errors) {
  const kind = q.kind === undefined ? 'mcq' : q.kind;
  if (!QUESTION_KINDS.includes(kind)) {
    errors.push(`${where}: kind "${q.kind}" is not one of ${QUESTION_KINDS.join(', ')}`);
    return;
  }

  if (kind === 'mcq' || kind === 'multi') {
    if (!Array.isArray(q.choices) || q.choices.length < 2) {
      errors.push(`${where}: needs at least two choices`);
      return;
    }
    if (new Set(q.choices).size !== q.choices.length) {
      errors.push(`${where}: has two identical choices`);
    }
  }

  if (kind === 'mcq') {
    // Singular `answer` on a multi-select would silently accept one box, so
    // the two are kept apart here rather than left to the scorer.
    if ('answers' in q) errors.push(`${where}: mcq takes answer, not answers`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.choices || []).length) {
      errors.push(`${where}: answer ${q.answer} is not one of the ` +
        `${(q.choices || []).length} choices`);
    }
  }

  if (kind === 'multi') {
    if ('answer' in q) errors.push(`${where}: multi takes answers, not answer`);
    if (!Array.isArray(q.answers) || !q.answers.length) {
      errors.push(`${where}: multi needs an answers list`);
    } else if (q.answers.some((a) => !Number.isInteger(a) || a < 0 || a >= q.choices.length)) {
      errors.push(`${where}: an answer is not one of the ${q.choices.length} choices`);
    } else if (q.answers.length === q.choices.length) {
      // Every box correct is a question with nothing to judge.
      errors.push(`${where}: every choice is correct, so there is nothing to decide`);
    }
  }

  if (kind === 'match') {
    if (!Array.isArray(q.left) || !Array.isArray(q.right) || q.left.length < 2) {
      errors.push(`${where}: match needs a left and a right list, with at least two rows`);
    } else if (!Array.isArray(q.answer) || q.answer.length !== q.left.length) {
      errors.push(`${where}: match needs one answer per left item`);
    } else if (q.answer.some((a) => !Number.isInteger(a) || a < 0 || a >= q.right.length)) {
      errors.push(`${where}: a pairing points outside the right-hand list`);
    }
  }

  if (kind === 'order') {
    if (!Array.isArray(q.items) || q.items.length < 2) {
      errors.push(`${where}: order needs at least two items`);
    } else if (!Array.isArray(q.answer) || q.answer.length !== q.items.length) {
      errors.push(`${where}: order needs one answer index per item`);
    } else if (new Set(q.answer).size !== q.answer.length
        || q.answer.some((a) => !Number.isInteger(a) || a < 0 || a >= q.items.length)) {
      errors.push(`${where}: the answer is not a permutation of the items`);
    }
  }

  if (kind === 'blank') {
    if (!Array.isArray(q.blanks) || !q.blanks.length) {
      errors.push(`${where}: blank needs a blanks list`);
      return;
    }
    q.blanks.forEach((b, i) => {
      if (!b || !Array.isArray(b.accept) || !b.accept.length) {
        errors.push(`${where}: blanks[${i}] has nothing in accept`);
      }
    });
    const gaps = String(q.prompt || '').split('___').length - 1;
    if (gaps !== q.blanks.length) {
      errors.push(`${where}: prompt has ${gaps} gap(s) but ${q.blanks.length} blank(s)`);
    }
  }
}

export function validateChecks() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets', 'data', 'curriculum.json'), 'utf8')
  );
  const bySlug = new Map();
  for (const lesson of manifest.lessons) {
    bySlug.set(`${lesson.unit}/${lesson.slug}`, lesson);
  }

  const errors = [];
  const files = [];

  if (!fs.existsSync(CHECKS_DIR)) return { errors, files };

  for (const unitDir of fs.readdirSync(CHECKS_DIR).sort()) {
    const unitMatch = /^unit-(\d+)$/.exec(unitDir);
    if (!unitMatch) {
      errors.push(`${unitDir}: not a unit-N directory`);
      continue;
    }
    const unit = Number(unitMatch[1]);

    for (const name of fs.readdirSync(path.join(CHECKS_DIR, unitDir)).sort()) {
      if (!name.endsWith('.json')) continue;
      const rel = `assets/data/checks/${unitDir}/${name}`;
      const slug = name.replace(/\.json$/, '');
      files.push(rel);

      const lesson = bySlug.get(`${unit}/${slug}`);
      if (!lesson) {
        errors.push(`${rel}: no lesson at units/unit-${unit}/${slug}.html`);
        continue;
      }

      let spec;
      try {
        spec = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      } catch (e) {
        errors.push(`${rel}: not valid JSON -- ${e.message}`);
        continue;
      }

      // Checks for understanding. An unanswerable question is worse than no
      // question: the learner reads the explanation for the wrong option and
      // learns something untrue.
      if (spec.questions !== undefined) {
        const questions = spec.questions;
        if (!Array.isArray(questions) || questions.length < 3 || questions.length > 5) {
          errors.push(`${rel} / questions: expected 3 to 5 questions, found ` +
            `${Array.isArray(questions) ? questions.length : typeof questions}`);
        } else {
          const seen = new Set();
          questions.forEach((q, i) => {
            const where = `${rel} / questions[${i}]`;
            if (!q.id) errors.push(`${where}: no id`);
            else if (seen.has(q.id)) errors.push(`${where}: duplicate id "${q.id}"`);
            else seen.add(q.id);

            if (!q.prompt) errors.push(`${where}: no prompt`);
            validateQuestionKind(q, where, errors);
            if (!q.explain) {
              errors.push(`${where}: no explanation, so a wrong answer teaches nothing`);
            }
          });
        }
      }

      for (const [exerciseId, entry] of Object.entries(spec)) {
        // `questions` is the checks-for-understanding key and lives alongside
        // the exercise ids rather than under one; it is validated above.
        if (exerciseId === 'questions') continue;

        if (!lesson.exercises.includes(exerciseId) && !lesson.editors.includes(exerciseId)) {
          errors.push(
            `${rel}: exercise id "${exerciseId}" is not on the page ` +
              `(it has: ${[...new Set([...lesson.exercises, ...lesson.editors])].join(', ') || 'none'})`
          );
          continue;
        }

        const cases = entry.cases || [];
        const hidden = entry.hiddenCases || [];
        if (!cases.length) {
          errors.push(`${rel} / ${exerciseId}: no visible cases, so nothing would be checked`);
        }

        for (const [kind, list] of [['cases', cases], ['hiddenCases', hidden]]) {
          list.forEach((c, i) => {
            const where = `${rel} / ${exerciseId} / ${kind}[${i}]`;
            if (!c.name) errors.push(`${where}: every case needs a name`);

            const isExpression = typeof c.call === 'string' && c.call.length > 0;
            const isStdout = typeof c.expect_stdout === 'string';
            const isProperty = PROPERTY_KEYS.some((k) => k in c);

            if (!isExpression && !isStdout && !isProperty) {
              errors.push(
                `${where}: needs one of expect_stdout, call+expect, or a property ` +
                  `(${PROPERTY_KEYS.join(', ')})`
              );
            }
            if (isExpression && typeof c.expect !== 'string') {
              errors.push(`${where}: a call case needs an expect string`);
            }
            // Regexes are compiled in the browser at check time; a bad one
            // would throw mid-lesson instead of failing here.
            for (const key of ['stdout_matches', 'source_matches']) {
              if (typeof c[key] === 'string') {
                try {
                  new RegExp(c[key]);
                } catch (e) {
                  errors.push(`${where}: ${key} is not a valid regular expression -- ${e.message}`);
                }
              }
            }
          });
        }

        if (!entry.hint) {
          errors.push(`${rel} / ${exerciseId}: no hint, so a stuck student gets nothing after two tries`);
        }
      }
    }
  }

  return { errors, files };
}

function main() {
  const { errors, files } = validateChecks();
  if (errors.length) {
    console.error(`${errors.length} problem(s) in the check files:\n`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`${files.length} check file(s) valid`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
