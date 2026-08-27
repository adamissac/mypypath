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

/* Mirrors the case kinds checker.js can run. The two new ones cannot be
   inferred from shape the way the older three can, so an author who mistypes
   `kind` gets a case that silently grades as something else unless this catches
   it. That is the whole reason the discriminator exists. */
export const CASE_KINDS = ['stdout', 'value', 'property', 'generated', 'ast'];

const AST_KEYS = ['loops', 'conditionals', 'functions', 'calls', 'binop',
  'names', 'returns', 'imports'];

const ARG_TYPES = ['int', 'float', 'str', 'bool', 'list', 'choice'];

function validateArgSpec(spec, where, errors) {
  if (!spec || typeof spec !== 'object') {
    errors.push(`${where}: each arg needs a type`);
    return;
  }
  if (!ARG_TYPES.includes(spec.type)) {
    errors.push(`${where}: type "${spec.type}" is not one of ${ARG_TYPES.join(', ')}`);
    return;
  }
  if (spec.type === 'choice' && (!Array.isArray(spec.values) || !spec.values.length)) {
    errors.push(`${where}: a choice arg needs a non-empty values list`);
  }
  if (spec.type === 'list') validateArgSpec(spec.of || { type: 'int' }, `${where}.of`, errors);
  if (spec.min !== undefined && spec.max !== undefined && Number(spec.min) > Number(spec.max)) {
    errors.push(`${where}: min is above max, so nothing can be drawn`);
  }
}

function validateCase(testCase, where, errors) {
  const kind = testCase.kind;
  if (kind !== undefined && !CASE_KINDS.includes(kind)) {
    errors.push(`${where}: kind "${kind}" is not one of ${CASE_KINDS.join(', ')}`);
    return;
  }

  if (kind === 'generated') {
    // Without a reference there is no oracle, and the case would report every
    // student as wrong rather than failing loudly here.
    if (typeof testCase.reference !== 'string' || !testCase.reference.trim()) {
      errors.push(`${where}: a generated case needs a reference solution`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(testCase.entry || ''))) {
      errors.push(`${where}: a generated case needs an entry function name`);
    } else if (testCase.reference && !testCase.reference.includes(testCase.entry)) {
      // The reference has to define the same name the student's code does, or
      // the two are being asked different questions.
      errors.push(`${where}: the reference does not define ${testCase.entry}`);
    }
    if (!Array.isArray(testCase.args)) {
      errors.push(`${where}: a generated case needs an args list, even an empty one`);
    } else {
      testCase.args.forEach((a, i) => validateArgSpec(a, `${where}.args[${i}]`, errors));
    }
    if (testCase.runs !== undefined
        && (!Number.isInteger(testCase.runs) || testCase.runs < 1)) {
      errors.push(`${where}: runs must be a whole number of cases`);
    }
  }

  if (kind === 'ast') {
    const requires = testCase.requires || {};
    const forbids = testCase.forbids || {};
    if (!Object.keys(requires).length && !Object.keys(forbids).length
        && testCase.max_nesting === undefined) {
      errors.push(`${where}: an ast case that requires and forbids nothing checks nothing`);
    }
    for (const source of [requires, forbids]) {
      for (const key of Object.keys(source)) {
        if (!AST_KEYS.includes(key)) {
          errors.push(`${where}: "${key}" is not one of ${AST_KEYS.join(', ')}`);
        }
      }
    }
    if (!testCase.describe) {
      // The describe is what a student is shown; without it the failure reads
      // as "code matching the exercise", which tells them nothing.
      errors.push(`${where}: an ast case needs a describe, or its failure says nothing`);
    }
  }
}

/* What a lesson's author says a good written answer touches. Optional
   throughout: almost every lesson has none, and that is a normal state. */
function validateReflections(spec, rel, errors) {
  const reflections = spec.reflections;
  if (reflections === undefined) return;
  if (!reflections || typeof reflections !== 'object' || Array.isArray(reflections)) {
    errors.push(`${rel} / reflections: expected an object keyed by reflection id`);
    return;
  }
  for (const [id, entry] of Object.entries(reflections)) {
    const where = `${rel} / reflections.${id}`;
    if (!/^reflection\d+$/.test(id)) {
      errors.push(`${where}: id should match a reflection input on the page`);
    }
    if (!Array.isArray(entry.expect_any) || !entry.expect_any.length) {
      errors.push(`${where}: needs an expect_any list of synonym groups`);
      continue;
    }
    entry.expect_any.forEach((group, i) => {
      if (!Array.isArray(group) || !group.length) {
        errors.push(`${where}.expect_any[${i}]: each group is a list of phrasings`);
      } else if (group.some((phrase) => typeof phrase !== 'string' || !phrase.trim())) {
        errors.push(`${where}.expect_any[${i}]: every phrasing must be text`);
      }
    });
    if (entry.min_concepts !== undefined
        && (!Number.isInteger(entry.min_concepts) || entry.min_concepts < 1)) {
      errors.push(`${where}: min_concepts must be a whole number of groups`);
    }
    if (!entry.hint) {
      // Without a hint a miss shows the learner nothing at all, which is worse
      // than not checking: they are told to try again with no idea what for.
      errors.push(`${where}: needs a hint, or a miss shows the learner nothing`);
    }
  }
}

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

      validateReflections(spec, rel, errors);

      for (const [exerciseId, entry] of Object.entries(spec)) {
        // `questions` is the checks-for-understanding key and lives alongside
        // the exercise ids rather than under one; it is validated above.
        // `reflections` likewise.
        if (exerciseId === 'questions' || exerciseId === 'reflections') continue;

        for (const bucket of ['cases', 'hiddenCases']) {
          const list = entry && entry[bucket];
          if (!Array.isArray(list)) continue;
          list.forEach((testCase, i) => {
            validateCase(testCase || {}, `${rel} / ${exerciseId}.${bucket}[${i}]`, errors);
          });
        }

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
            // The two kinds that carry no property key and no call. They are
            // checked in full by validateCase above; here they only need to
            // not be mistaken for a case with nothing in it.
            const isDeclared = c.kind === 'generated' || c.kind === 'ast';

            if (!isExpression && !isStdout && !isProperty && !isDeclared) {
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
