/* Generates Python for Data: lesson pages, unit pages, the course page, the
   course picker, its check files and its manifest.

   The head and script list are lifted from an existing Foundations lesson
   rather than retyped, so a course-2 page loads exactly what a course-1 page
   loads. bake_layout.py re-bakes the header and footer afterwards. */
const fs = require('fs');
const path = require('path');

const C = require('./data-course-content.cjs');
const ROOT = process.cwd();
const DONOR = 'units/unit-7/with-statement-file-operations.html';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (code) => code.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
  .replace(/'/g, "\\'").replace(/"/g, '&quot;');

const donor = fs.readFileSync(path.join(ROOT, DONOR), 'utf8');
const mainOpen = donor.indexOf('<main id="main-content">');
const mainClose = donor.indexOf('</main>') + '</main>'.length;
const PREFIX = donor.slice(0, mainOpen);
const SUFFIX = donor.slice(mainClose);

function shell(title, description, main) {
  const head = PREFIX
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[\s\S]*?"\s*\/>/,
      `<meta name="description" content="${esc(description)}" />`);
  return `${head}${main}${SUFFIX}`;
}

const COURSE = JSON.parse(fs.readFileSync('assets/data/courses.json', 'utf8'))
  .courses.find((c) => c.slug === 'data');

/* ------------------------------------------------------------- lesson pages */

/* The lesson list every Foundations lesson carries. Without it a learner can
   see the lesson they are on and nothing either side of it, which is most of
   what makes a course feel like a course rather than a page. */
function sidebar(unitN, lessons, currentSlug) {
  const items = lessons.map((l, i) => {
    const here = l.slug === currentSlug ? ' class="is-current" aria-current="page"' : '';
    return `<li><a href="/data/unit-${unitN}/${l.slug}.html"${here}>${i + 1}. ${esc(l.title)}</a></li>`;
  }).join('\n');
  return `<aside class="course-sidebar" id="lesson-sidebar">
<p class="sidebar-unit-label">Unit ${unitN} &middot; ${esc(C[`unit${unitN}`].title)}</p>
<nav>
<ul>
${items}
</ul>
</nav>
</aside>`;
}

/* ------------------------------------------------------- the lesson schema

   A lesson is normalised before it is rendered, so the content modules can be
   upgraded one unit at a time instead of all sixty lessons in one commit.

   The shape a rewritten lesson uses:

     objectives  [string]        what the learner will be able to do
     why         string          why this matters, before the how
     sections    [ { heading, intro, steps: [ { heading, prose, code, note } ] } ]
     practices   [ { after, title, prompt, starter } ]   interleaved, not dumped
     exercises   [ { title, prompt, hint, starter, ... } ]  two or more, graded
     questions   [ ... ]         the end-of-lesson quiz

   The shape the first draft used, still accepted:

     sections    [ [heading, prose, code] ]
     exercise    { prompt, starter, ... }                 exactly one
*/
function normalise(lesson) {
  const sections = (lesson.sections || []).map((sec) => {
    if (Array.isArray(sec)) {
      const [heading, prose, code] = sec;
      return { heading, intro: prose, steps: code ? [{ code }] : [] };
    }
    return {
      heading: sec.heading,
      intro: sec.intro || '',
      note: sec.note || '',
      steps: sec.steps || [],
    };
  });

  const exercises = lesson.exercises
    ? lesson.exercises.slice()
    : (lesson.exercise ? [lesson.exercise] : []);

  return {
    ...lesson,
    sections,
    exercises,
    objectives: lesson.objectives || [],
    why: lesson.why || '',
    practices: lesson.practices || [],
  };
}

/* The ids an exercise and its editor share. Kept in one place because the
   check file, the manifest and the markup all have to agree on them. */
const exId = (n) => `exercise${n + 1}`;

function objectivesBlock(objectives) {
  if (!objectives.length) return '';
  return `
<div class="content-section">
<h2>What You Will Learn in This Lesson</h2>
<ul class="objective-list">
${objectives.map((o) => `<li>${o}</li>`).join('\n')}
</ul>
</div>`;
}

function whyBlock(why) {
  if (!why) return '';
  return `
<div class="info-card">
<h3 class="h4">Why This Matters</h3>
<p>${why}</p>
</div>`;
}

/* A mini practice is an ungraded editor mid-lesson: somewhere to try the thing
   that was just explained, while it is still the thing being explained. They
   are interleaved by `after`, which is the index of the section they follow. */
function practiceBlock(practice, n) {
  return `
<div class="practice-box interactive">
<div class="practice-header">
<h3 class="h4">Mini Practice #${n}: ${esc(practice.title)}</h3>
<span class="practice-badge">Try It Yourself</span>
</div>
<p>${practice.prompt}</p>

<div class="interactive-editor" data-editor-id="practice${n}">
<div class="editor-toolbar-small">
<button class="btn-run" onclick="runEditorCode('practice${n}')">Run</button>
<button class="btn-reset" onclick="resetEditor('practice${n}', '${attr(practice.starter)}')">Reset</button>
<button class="btn-clear" onclick="clearSaved('practice${n}')" title="Clear saved code">Clear Saved</button>
</div>
<textarea class="code-editor-small" id="editor-practice${n}">${esc(practice.starter)}</textarea>
<div class="editor-output" id="output-practice${n}">
<div class="output-placeholder">Press Run to see output</div>
</div>
</div>
</div>`;
}

/* A graded exercise, in the same markup Foundations uses.
 *
 * data-exercise-id is what lesson-progress.js counts as a required item, and
 * .interactive-editor[data-editor-id] is what check-ui.js hangs "Check my
 * work" on. The first draft emitted only the editor, so a Data lesson had a
 * run-only sandbox where Foundations had graded work.
 *
 * No checkExercise/showSolution buttons: those are the legacy Foundations
 * path, they need a hand-written exerciseSolutions map, and they would put a
 * second Check button with a different verdict beside the real one. */
function exerciseBlock(exercise, n) {
  const id = exId(n);
  return `
<div class="exercise-item" data-exercise-id="${id}">
<h3 class="h4">Exercise ${n + 1}: ${esc(exercise.title || 'Practice')}</h3>
<p>${exercise.prompt}</p>
${exercise.hint ? `<p class="hint-text">${esc(exercise.hint)}</p>` : ''}

<div class="interactive-editor" data-editor-id="${id}">
<div class="editor-toolbar-small">
<button class="btn-run" onclick="runEditorCode('${id}')">Run</button>
<button class="btn-reset" onclick="resetEditor('${id}', '${attr(exercise.starter)}')">Reset</button>
<button class="btn-clear" onclick="clearSaved('${id}')" title="Clear saved code">Clear Saved</button>
</div>
<textarea class="code-editor-small" id="editor-${id}">${esc(exercise.starter)}</textarea>
<div class="editor-output" id="output-${id}">
<div class="output-placeholder">Press Run to try it, then Check my work to mark it.</div>
</div>
<div class="exercise-feedback" id="feedback-${id}"></div>
</div>
</div>`;
}

function lessonMain(unitN, unit, i, raw, prev, next) {
  const lesson = normalise(raw);

  /* Heading levels go h1 -> h2 -> h3, never h2 -> h4. axe's heading-order rule
     is enabled in scripts/audit-a11y.mjs and the budget is zero; the first
     draft emitted <h4> here and the violation was fixed in the generated HTML
     instead of in the generator, so every rebuild put it back. */
  const body = [];
  lesson.sections.forEach((sec, idx) => {
    const steps = (sec.steps || []).map((step) => [
      step.heading ? `<h3 class="h4">${esc(step.heading)}</h3>` : '',
      step.prose ? `<p>${step.prose}</p>` : '',
      step.code ? `<pre class="code"><code>${esc(step.code)}</code></pre>` : '',
      step.note ? `<p class="note">${step.note}</p>` : '',
    ].filter(Boolean).join('\n')).join('\n');

    body.push(`
<div class="content-section">
<h2>${esc(sec.heading)}</h2>
${sec.intro ? `<p>${sec.intro}</p>` : ''}
${steps}
${sec.note ? `<div class="info-card"><p>${sec.note}</p></div>` : ''}
</div>`);

    lesson.practices.forEach((pr, pi) => {
      if (pr.after === idx) body.push(practiceBlock(pr, pi + 1));
    });
  });

  // Any practice pointing past the last section still gets rendered.
  lesson.practices.forEach((pr, pi) => {
    if (pr.after === undefined || pr.after >= lesson.sections.length) {
      body.push(practiceBlock(pr, pi + 1));
    }
  });

  const exercises = lesson.exercises.map((ex, n) => exerciseBlock(ex, n)).join('\n');

  return `<main id="main-content">
<section class="section reveal-up">
<div class="container">
<nav class="breadcrumb" aria-label="Breadcrumb">
<a class="route" href="/data.html">Python for Data</a> &middot;
<a class="route" href="/data/unit-${unitN}.html">Unit ${unitN}</a>
</nav>
<h1 class="lesson-title">${esc(lesson.title)}</h1>
<p class="lead">${esc(lesson.summary)}</p>
</div>
</section>
<section class="course-main">
<div class="container">
${sidebar(unitN, C[`unit${unitN}`].lessons, lesson.slug)}
<section class="lesson-body">
${objectivesBlock(lesson.objectives)}
${whyBlock(lesson.why)}
${body.join('\n')}

<div class="exercise-section">
<h2>End-of-Lesson Exercises</h2>
${exercises}
</div>

<div class="lesson-nav">
${prev ? `<a class="btn btn-ghost route" href="${prev}">&larr; Previous</a>` : '<span></span>'}
${next ? `<a class="btn btn-primary route" href="${next}">Next</a>` : '<a class="btn btn-primary route" href="/data.html">Back to the course</a>'}
</div>
</section>
</div>
</section>
</main>`;
}

/* --------------------------------------------------------------- unit pages */

function unitPage(unit) {
  const stub = unit.stub === true;
  const lessons = stub ? [] : C[`unit${unit.n}`].lessons;
  const body = stub
    ? `<div class="content-section">
<h2>Not written yet</h2>
<p>This unit is planned and its lessons are not built. Units 1 and 2 teach the
same habits with the standard library and run today; this one needs numpy and
pandas loaded into the page, which is a piece of work of its own.</p>
<p><a class="btn btn-primary route" href="/data.html">Back to the course</a></p>
</div>`
    : `<ol class="lesson-list">
${lessons.map((l, i) => `<li><a class="route" href="/data/unit-${unit.n}/${l.slug}.html"><span class="lesson-list__num">${i + 1}</span><span class="lesson-list__title">${esc(l.title)}</span><span class="lesson-list__meta">${esc(l.summary)}</span></a></li>`).join('\n')}
</ol>`;

  /* The end-of-unit test, which the first draft of this course never linked.
     ?course=data is what sends unit-test-page.js to this course's questions
     and its own record key; without it the link would serve Foundations unit N
     and overwrite a Foundations result. */
  const test = stub ? '' : `
<div class="unit-test-card">
<h2>End of unit test</h2>
<p>Ten multiple choice questions and one free response problem. You need 70 to
finish the unit. Retakes are unlimited and your best score is the one that counts.</p>
<p class="unit-test-status" data-unit-test-status="${unit.n}" hidden></p>
<a class="btn btn-primary route" data-unit-test-link="${unit.n}" href="/unit-test.html?unit=${unit.n}&amp;course=data">Take the Unit ${unit.n} test</a>
</div>`;

  return `<main id="main-content">
<section class="section reveal-up">
<div class="container">
<nav class="breadcrumb" aria-label="Breadcrumb">
<a class="route" href="/courses.html">Courses</a> &middot;
<a class="route" href="/data.html">Python for Data</a>
</nav>
<h1>Unit ${unit.n} &middot; ${esc(unit.title)}</h1>
<p class="lead">${esc(stub ? 'Planned. Not written yet.' : C[`unit${unit.n}`].blurb)}</p>
</div>
</section>
<section class="course-main">
<div class="container">
${body}
${test}
</div>
</section>
</main>`;
}

/* ------------------------------------------------------- course + picker pages */

/* The card headings are h2 styled as h3, not h3.
   These pages have one h1 and then the card grid, so a literal <h3> skips a
   level and tests/heading-order.test.js fails. Both card builders were fixed
   in the generated HTML once before and not here, so the next rebuild undid
   it -- which is the whole reason rule zero exists. */
function courseCards(courses) {
  return courses.map((c, i) => {
    const ready = c.units.filter((u) => !u.stub).length;
    const meta = ready < c.units.length
      ? `${ready} of ${c.units.length} units ready`
      : `${c.units.length} units`;
    return `<a class="unit-card route" href="${c.curriculum}">
<div class="unit-ribbon">${i + 1}</div>
<h2 class="h3">${esc(c.title)}</h2>
<p>${esc(c.tagline)}</p>
<div class="unit-meta">
<span class="pill"><span class="dot"></span> ${meta}</span>
<span class="pill"><span class="dot"></span> Units 1&ndash;2 free</span>
</div>
</a>`;
  }).join('\n');
}

function unitCards(course) {
  return course.units.map((u) => `<a class="unit-card route" href="/data/unit-${u.n}.html">
<div class="unit-ribbon">${u.n}</div>
<h2 class="h3">${esc(u.title)}</h2>
<p>${esc(u.stub ? 'Planned, not written yet.' : C[`unit${u.n}`].blurb)}</p>
<div class="unit-meta">
<span class="pill"><span class="dot"></span> ${u.stub ? 'Coming later' : `${C[`unit${u.n}`].lessons.length} lessons`}</span>
<span class="pill"><span class="dot"></span> ${u.n <= 2 ? 'Free' : 'Account needed'}</span>
</div>
</a>`).join('\n');
}

/* ------------------------------------------------------------------- writing */

function write(rel, contents) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf8');
}

const allCourses = JSON.parse(fs.readFileSync('assets/data/courses.json', 'utf8')).courses;
let pages = 0;
let checks = 0;
const manifest = { schemaVersion: 1, course: 'data', totalUnits: 10, lessons: [] };

for (const unit of COURSE.units) {
  write(`data/unit-${unit.n}.html`,
    shell(`Python for Data \u2022 Unit ${unit.n} \u2022 ${unit.title}`,
      `Unit ${unit.n} of Python for Data: ${unit.title}.`, unitPage(unit)));
  pages++;
  if (unit.stub) continue;

  const lessons = C[`unit${unit.n}`].lessons;
  lessons.forEach((lesson, i) => {
    const prev = i > 0 ? `/data/unit-${unit.n}/${lessons[i - 1].slug}.html` : `/data/unit-${unit.n}.html`;
    const next = i < lessons.length - 1 ? `/data/unit-${unit.n}/${lessons[i + 1].slug}.html` : null;
    write(`data/unit-${unit.n}/${lesson.slug}.html`,
      shell(`Python for Data \u2022 ${lesson.title}`, lesson.summary,
        lessonMain(unit.n, unit, i, lesson, prev, next)));
    pages++;

    // The check file, in the course's own folder so that unit 1 of each course
    // does not ask for the other's checks.
    //
    // Packages the exercise needs before it can run. Declared on the unit and
    // inherited by its lessons, since a whole unit is about one library.
    const packages = lesson.packages || C[`unit${unit.n}`].packages || null;
    const exercises = lesson.exercises || (lesson.exercise ? [lesson.exercise] : []);

    const spec = {};
    exercises.forEach((ex, n) => {
      const cases = [];
      if (ex.expect_stdout) {
        cases.push({ name: 'produces the expected output', expect_stdout: ex.expect_stdout });
      } else {
        cases.push({ name: 'returns the right answer', call: ex.call, expect: ex.expectValue });
      }
      spec[`exercise${n + 1}`] = {
        prompt: ex.title ? `${lesson.title}: ${ex.title}` : lesson.summary,
        ...(packages ? { packages } : {}),
        ...(ex.files ? { files: ex.files } : {}),
        cases,
        hiddenCases: ex.hidden || [],
        hint: ex.hint,
      };
    });
    spec.questions = lesson.questions;

    write(`assets/data/checks/data/unit-${unit.n}/${lesson.slug}.json`,
      `${JSON.stringify(spec, null, 2)}\n`);
    checks++;

    // Every editor on the page, graded or not, so validate-checks can tell an
    // id that exists from one that does not. The mini practices are editors
    // only; the exercises are both.
    const exerciseIds = exercises.map((_, n) => `exercise${n + 1}`);
    const practiceIds = (lesson.practices || []).map((_, n) => `practice${n + 1}`);

    manifest.lessons.push({
      unit: unit.n,
      unitTitle: C[`unit${unit.n}`].title,
      slug: lesson.slug,
      path: `/data/unit-${unit.n}/${lesson.slug}.html`,
      title: lesson.title,
      order: i + 1,
      editors: practiceIds.concat(exerciseIds),
      exercises: exerciseIds,
    });
  });
}

manifest.lessonCount = manifest.lessons.length;
write('assets/data/curriculum-data.json', `${JSON.stringify(manifest, null, 2)}\n`);

write('data.html', shell('Python for Data \u2022 PyPath',
  COURSE.summary,
  `<main id="main-content">
<section class="section reveal-up">
<div class="container">
<nav class="breadcrumb" aria-label="Breadcrumb"><a class="route" href="/courses.html">Courses</a></nav>
<h1>Python for Data</h1>
<p class="lead">${esc(COURSE.summary)}</p>
</div>
</section>
<section class="course-main">
<div class="container">
<div class="grid units-grid stagger">
${unitCards(COURSE)}
</div>
</div>
</section>
</main>`));
pages++;

write('courses.html', shell('Courses \u2022 PyPath',
  'Two Python courses: Foundations, and Python for Data.',
  `<main id="main-content">
<section class="section reveal-up">
<div class="container">
<h1>Courses</h1>
<p class="lead">Two courses. Pick one, then pick where in it you want to start.
Units 1 and 2 of each are free; the rest open with an account.</p>
</div>
</section>
<section class="course-main">
<div class="container">
<div class="grid units-grid stagger">
${courseCards(allCourses)}
</div>
</div>
</section>
</main>`));
pages++;

console.log(`wrote ${pages} pages and ${checks} check files`);
console.log(`manifest: ${manifest.lessonCount} lessons`);
