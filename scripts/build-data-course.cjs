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

function lessonMain(unitN, unit, i, lesson, prev, next) {
  const sections = lesson.sections.map(([heading, prose, code]) => `
<div class="content-section">
<h2>${esc(heading)}</h2>
<p>${prose}</p>
<pre class="code"><code>${esc(code)}</code></pre>
</div>`).join('\n');

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
<section class="lesson-body">
${sections}

<div class="practice-box interactive">
<div class="practice-header">
<h4>Exercise</h4>
<span class="practice-badge">Try It Yourself</span>
</div>
<p>${lesson.exercise.prompt}</p>

<div class="interactive-editor" data-editor-id="exercise1">
<div class="editor-toolbar-small">
<button class="btn-run" onclick="runEditorCode('exercise1')">Run</button>
<button class="btn-reset" onclick="resetEditor('exercise1', '${attr(lesson.exercise.starter)}')">Reset</button>
<button class="btn-clear" onclick="clearSaved('exercise1')" title="Clear saved code">Clear Saved</button>
</div>
<textarea class="code-editor-small" id="editor-exercise1">${esc(lesson.exercise.starter)}</textarea>
<div class="editor-output" id="output-exercise1">
<div class="output-placeholder">Press Run to see output</div>
</div>
</div>
</div>

<div class="exercise-section">
<h2>Check Your Understanding</h2>
<div data-lesson-quiz></div>
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
</div>
</section>
</main>`;
}

/* ------------------------------------------------------- course + picker pages */

function courseCards(courses) {
  return courses.map((c, i) => {
    const ready = c.units.filter((u) => !u.stub).length;
    const meta = ready < c.units.length
      ? `${ready} of ${c.units.length} units ready`
      : `${c.units.length} units`;
    return `<a class="unit-card route" href="${c.curriculum}">
<div class="unit-ribbon">${i + 1}</div>
<h3>${esc(c.title)}</h3>
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
<h3>${esc(u.title)}</h3>
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
    const ex = lesson.exercise;
    const cases = [];
    if (ex.expect_stdout) {
      cases.push({ name: 'produces the expected output', expect_stdout: ex.expect_stdout });
    } else {
      cases.push({ name: 'returns the right answer', call: ex.call, expect: ex.expectValue });
    }
    const spec = { [`exercise1`]: {
      prompt: lesson.summary,
      ...(ex.files ? { files: ex.files } : {}),
      cases,
      hiddenCases: ex.hidden || [],
      hint: ex.hint,
    }, questions: lesson.questions };
    write(`assets/data/checks/data/unit-${unit.n}/${lesson.slug}.json`,
      `${JSON.stringify(spec, null, 2)}\n`);
    checks++;

    manifest.lessons.push({
      unit: unit.n,
      unitTitle: C[`unit${unit.n}`].title,
      slug: lesson.slug,
      path: `/data/unit-${unit.n}/${lesson.slug}.html`,
      title: lesson.title,
      order: i + 1,
      editors: ['exercise1'],
      exercises: ['exercise1'],
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
