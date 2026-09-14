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

/* The lesson page is written in the markup Foundations lessons use -- the same
   .layout-course grid, sidebar, breadcrumb, eyebrow, overview card and
   .lesson-content column -- so the two courses share one stylesheet and one set
   of scripts rather than drifting apart. core.js adds the sidebar's collapse
   button to .layout-course, and lesson-progress.js puts its chip under the
   title, exactly as it does on a Foundations page. */

function sidebar(unitN, lessons, currentSlug) {
  const items = lessons.map((l, i) => {
    const here = l.slug === currentSlug ? ' class="active" aria-current="page"' : '';
    return `<li><a href="/data/unit-${unitN}/${l.slug}.html"${here}>${i + 1}. ${esc(l.title)}</a></li>`;
  }).join('\n');
  return `<aside class="course-sidebar" id="lesson-sidebar">
<p class="sidebar-unit-label">Unit ${unitN} &bull; ${esc(C[`unit${unitN}`].title)}</p>
<nav>
<ul>
${items}
</ul>
</nav>
</aside>`;
}

/* ------------------------------------------------------- the lesson schema

   A lesson is normalised before it is rendered.

     slug, title, summary
     objectives  [string]        what the learner will be able to do
     why         string          why this matters, before the how
     sections    [ { heading, intro, note?, steps: [ { heading, prose, code, note } ] } ]
     practices   [ { after, title, prompt, starter } ]   interleaved: `after` is
                                 the index of the section the practice follows
     use         { cards: [ { title, text, code? } ], avoid }   optional; the
                                 "when to use it" step, rendered last
     exercises   [ { title, prompt, hint, starter, correct, wrong, ... } ]  two or more, graded
     questions   [ ... ]         the end-of-lesson quiz

   The first-draft shape -- sections as [heading, prose, code] and a single
   `exercise` -- is still accepted, so an old lesson renders rather than breaks,
   but tests/checks-data-course.test.js fails any lesson written that way. */
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
    use: lesson.use || null,
  };
}

/* The ids an exercise and its editor share. Kept in one place because the
   check file, the manifest and the markup all have to agree on them. */
const exId = (n) => `exercise${n + 1}`;

const LEVEL = (unitN) => (unitN <= 2 ? 'Beginner' : 'Intermediate');

/* A reading-time estimate from the lesson itself rather than a typed number:
   prose at 200 words a minute, plus a few minutes per editor. Rounded to five
   and shown as a range, because it is an estimate. */
function minutes(lesson) {
  const text = [
    lesson.why, ...lesson.objectives,
    ...lesson.sections.flatMap((s) => [s.intro, s.note, ...s.steps.map((t) => t.prose)]),
  ].join(' ').replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const est = words / 200 + lesson.practices.length * 3 + lesson.exercises.length * 6;
  const low = Math.max(10, Math.round(est / 5) * 5);
  return `${low}&ndash;${low + 5} min`;
}

const OVERVIEW_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>';

function introSection(lesson) {
  if (!lesson.objectives.length && !lesson.why) return '';
  return `
<div class="content-section">
<h2>What You Will Learn in This Lesson</h2>
<p>By the end of this lesson, you will be able to:</p>
<ul>
${lesson.objectives.map((o) => `<li>${o}</li>`).join('\n')}
</ul>
${lesson.why ? `<div class="info-card">
<h3 class="h4">Why This Matters</h3>
<p>${lesson.why}</p>
</div>` : ''}
</div>`;
}

/* Each step is a numbered sub-step, in the .process-steps markup Foundations
   uses for the same job, followed by its example. */
function stepSection(sec, n) {
  const steps = sec.steps.map((step, i) => `
<div class="step">
<div class="step-number">${i + 1}</div>
<div class="step-content">
${step.heading ? `<h3 class="h4">${esc(step.heading)}</h3>` : ''}
${step.prose ? `<p>${step.prose}</p>` : ''}
${step.code ? `<pre class="code"><code>${esc(step.code)}</code></pre>` : ''}
${step.note ? `<p class="note">${step.note}</p>` : ''}
</div>
</div>`).join('');

  return `
<div class="content-section">
<h2>Step ${n}: ${esc(sec.heading)}</h2>
${sec.intro ? `<p>${sec.intro}</p>` : ''}
${sec.steps.length ? `<div class="process-steps">${steps}
</div>` : ''}
${sec.note ? `<div class="info-callout"><p><strong>Key idea:</strong> ${sec.note}</p></div>` : ''}
</div>`;
}

/* The "when to use it" step: feature cards for the cases it is for, and an
   info card for the case it is not. */
function useSection(use, n) {
  if (!use) return '';
  const cards = (use.cards || []).map((c) => `
<div class="feature-card">
<h3 class="h4">${esc(c.title)}</h3>
<p>${c.text}</p>
${c.code ? `<pre class="code"><code>${esc(c.code)}</code></pre>` : ''}
</div>`).join('');
  return `
<div class="content-section">
<h2>Step ${n}: When to Use It</h2>
${use.intro ? `<p>${use.intro}</p>` : ''}
<div class="feature-grid">${cards}
</div>
${use.avoid ? `<div class="info-card">
<h3 class="h4">When Not to Use It</h3>
<p>${use.avoid}</p>
</div>` : ''}
</div>`;
}

/* A mini practice is an ungraded editor mid-lesson: somewhere to try the thing
   that was just explained, while it is still the thing being explained. */
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

function lessonMain(unitN, unit, i, raw, prev, next, nextTitle) {
  const lesson = normalise(raw);
  const lessons = C[`unit${unitN}`].lessons;

  /* Heading levels go h1 -> h2 -> h3, never h2 -> h4. axe's heading-order rule
     is enabled in scripts/audit-a11y.mjs and the budget is zero. */
  const body = [introSection(lesson)];
  lesson.sections.forEach((sec, idx) => {
    body.push(stepSection(sec, idx + 1));
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

  body.push(useSection(lesson.use, lesson.sections.length + 1));

  const exercises = lesson.exercises.map((ex, n) => exerciseBlock(ex, n)).join('\n');
  const nextLink = next
    ? `<a class="btn btn-primary route" href="${next}">Next: ${esc(nextTitle)}</a>`
    : `<a class="btn btn-primary route" href="/data/unit-${unitN}.html">Unit ${unitN} test</a>`;

  return `<main id="main-content">
<section class="section">
<div class="container layout-course">
${sidebar(unitN, lessons, lesson.slug)}
<section class="course-main">
<div class="sidebar-toggle">
<button type="button" class="sidebar-toggle-btn" data-sidebar-toggle aria-expanded="false" aria-controls="lesson-sidebar">Toggle lesson menu</button>
</div>
<nav aria-label="Breadcrumb">
<a href="/">Home</a>
<span class="separator">/</span>
<a href="/data.html">Python for Data</a>
<span class="separator">/</span>
<a href="/data/unit-${unitN}.html">Unit ${unitN}</a>
<span class="separator">/</span>
<span class="current">${esc(lesson.title)}</span>
</nav>
<div class="eyebrow">Unit ${unitN} &bull; Lesson ${i + 1}</div>
<h1 class="lesson-title">${esc(lesson.title)}</h1>
<div class="lesson-overview" style="margin-top:8px;">
<div class="lesson-head">
<div class="feature-icon" aria-hidden="true">${OVERVIEW_ICON}</div>
<h2 class="gradient-text" style="margin:0;">Overview</h2>
</div>
<p>${esc(lesson.summary)}</p>
<div class="lesson-meta">
<span class="pill">${LEVEL(unitN)}</span>
<span class="pill">${minutes(lesson)}</span>
</div>
<div class="lesson-actions">
<a class="btn btn-ghost route" href="${prev}">&larr; Previous</a>
${nextLink}
</div>
</div>
<div class="lesson-content">
${body.join('\n')}

<div class="exercise-section">
<h2>End-of-Lesson Exercises</h2>
${exercises}
</div>
</div>

<div class="lesson-nav">
<a class="btn btn-ghost route" href="${prev}">&larr; Prev</a>
${next ? `<a class="btn btn-primary route" href="${next}">Next</a>` : `<a class="btn btn-primary route" href="/data/unit-${unitN}.html">Unit ${unitN} test</a>`}
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
  const first = lessons.length ? `/data/unit-${unit.n}/${lessons[0].slug}.html` : '/data.html';

  /* The same markup as a Foundations unit page. .unit-lesson-list is what
     lesson-progress.js ticks finished lessons in; the first draft emitted an
     unstyled .lesson-list that nothing painted and no stylesheet laid out, so
     number, title and summary ran together on one line. */
  const list = stub
    ? `<p class="muted">This unit is planned and its lessons are not written yet.</p>`
    : `<ol class="unit-lesson-list">
${lessons.map((l, i) => `<li><a class="route" href="/data/unit-${unit.n}/${l.slug}.html">${i + 1}. ${esc(l.title)}</a></li>`).join('\n')}
</ol>`;

  /* The end-of-unit test. ?course=data is what sends unit-test-page.js to this
     course's questions and its own record key; without it the link would serve
     Foundations unit N and overwrite a Foundations result. */
  const test = stub ? '' : `
<section class="section">
<div class="container narrow">
<h2>End of unit test</h2>
<p class="muted">Ten multiple choice questions and one free response problem. You
need 70 to finish the unit. Retakes are unlimited and your best score is the one that counts.</p>
<p class="unit-test-status" data-unit-test-status="${unit.n}" hidden></p>
<div class="cta" style="margin-top: 18px;">
<a class="btn btn-primary route" data-unit-test-link="${unit.n}" href="/unit-test.html?unit=${unit.n}&amp;course=data">Take the Unit ${unit.n} test</a>
</div>
</div>
</section>`;

  return `<main id="main-content">
<section class="section">
<div class="container narrow">
<p class="eyebrow">Python for Data &bull; Unit ${unit.n}</p>
<h1 class="page-title">Unit ${unit.n}: ${esc(unit.title)}</h1>
<p class="muted">${esc(stub ? 'Planned. Not written yet.' : C[`unit${unit.n}`].blurb)}</p>
<div class="cta" style="margin-top: 18px;">
${stub ? '' : `<a class="btn btn-primary route" href="${first}">Start Unit ${unit.n}</a>`}
<a class="btn btn-ghost route" href="/data.html">Back to the course</a>
</div>
</div>
</section>

<section class="section">
<div class="container narrow">
<h2>Lessons</h2>
${list}
</div>
</section>
${test}
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
    const nextTitle = i < lessons.length - 1 ? lessons[i + 1].title : null;
    write(`data/unit-${unit.n}/${lesson.slug}.html`,
      shell(`Python for Data \u2022 ${lesson.title}`, lesson.summary,
        lessonMain(unit.n, unit, i, lesson, prev, next, nextTitle)));
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
