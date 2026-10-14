/* Write the unit overview pages (units/unit-N.html, data/unit-N.html) from the
   course data and the lesson pages themselves.

     node scripts/build-unit-pages.mjs           # rewrite all 20 regions
     node scripts/build-unit-pages.mjs --check   # exit 1 if any page is stale
     node scripts/build-unit-pages.mjs --print   # list each lesson's derived summary and time

   Only the region between <!-- unit-page:begin --> and <!-- unit-page:end -->
   is generated; the head, header and footer stay whatever the rest of the
   pipeline made them. A page without markers (the first run) has everything
   after its noscript notice inside <main> replaced. The generator also makes
   sure each page loads unit-page.css and unit-progress-panel.js. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonSummary, lessonTime, lessonTitle, renderUnitRegion } from './unit-pages-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const COURSES = json('assets/data/courses.json').courses;
const MANIFEST = { units: json('assets/data/curriculum.json'), data: json('assets/data/curriculum-data.json') };
const DATA_CONTENT = require('./data-course-content.cjs');

const TEST_TEXT = {
  units: (n, last) => `Ten multiple choice questions worth 7 points each and one free response problem worth 30, so 100 in total. Score 70 or more to finish Unit ${n}${n === last ? ', the last unit on the path.' : ` and unlock Unit ${n + 1}.`}`,
  data: () => 'Ten multiple choice questions and one free response problem. You need 70 to finish the unit. Retakes are unlimited and your best score is the one that counts.',
};

function unitsFor(courseKey) {
  const course = COURSES.find((c) => c.slug === (courseKey === 'units' ? 'foundations' : 'data'));
  const last = course.units.length;
  return course.units.filter((u) => !u.stub).map((u) => {
    const lessons = MANIFEST[courseKey].lessons
      .filter((l) => l.unit === u.n)
      .sort((a, b) => a.order - b.order)
      .map((l) => {
        const html = read(l.path.replace(/^\//, ''));
        return {
          path: l.path,
          title: lessonTitle(html, courseKey, l.title),
          summary: lessonSummary(html, courseKey),
          time: lessonTime(html, { editors: (l.editors || []).length, exercises: (l.exercises || []).length }),
        };
      });
    return {
      course: courseKey,
      courseTitle: course.title,
      courseHref: courseKey === 'units' ? '/curriculum.html' : '/data.html',
      n: u.n,
      title: u.title,
      blurb: courseKey === 'units' ? u.blurb : DATA_CONTENT[`unit${u.n}`].blurb,
      hours: u.hours,
      level: u.level,
      testText: TEST_TEXT[courseKey](u.n, last),
      testHref: courseKey === 'units' ? `/unit-test.html?unit=${u.n}` : `/unit-test.html?unit=${u.n}&course=data`,
      lessons,
      file: `${courseKey}/unit-${u.n}.html`,
    };
  });
}

const BEGIN = /<!-- unit-page:begin[^>]*-->/;
const END = '<!-- unit-page:end -->';

function withRegion(html, region) {
  const b = html.search(BEGIN);
  const e = html.indexOf(END);
  if (b !== -1 && e > b) return html.slice(0, b) + region + html.slice(e + END.length);
  const mainOpen = html.match(/<main[^>]*>/);
  const mainClose = html.lastIndexOf('</main>');
  if (!mainOpen || mainClose === -1) throw new Error('no <main> to write into');
  const noscriptEnd = html.indexOf('<!-- noscript:end -->', mainOpen.index);
  const start = noscriptEnd !== -1 && noscriptEnd < mainClose
    ? noscriptEnd + '<!-- noscript:end -->'.length
    : mainOpen.index + mainOpen[0].length;
  return `${html.slice(0, start)}\n${region}\n${html.slice(mainClose)}`;
}

function withAssets(html, course) {
  let out = html;
  if (!/\/assets\/css\/unit-page\.css/.test(out)) {
    out = out.replace(/(<link rel="stylesheet" href="\/assets\/css\/lesson-progress\.css[^"]*"\s*\/>)/, '$1\n    <link rel="stylesheet" href="/assets/css/unit-page.css" />');
  }
  if (!/\/assets\/js\/unit-progress-panel\.js/.test(out)) {
    out = out.replace(/(<script defer src="\/assets\/js\/lesson-progress\.js[^"]*"><\/script>)/, '$1\n    <script defer src="/assets/js/unit-progress-panel.js"></script>');
  }
  // The cockpit launches into a Python for Data unit page, which plays the
  // landing (arrive.js). It runs in the head, before first paint.
  if (course === 'data' && !/\/assets\/js\/arrive\.js/.test(out)) {
    out = out.replace(/(<script src="\/assets\/js\/theme-init\.js[^"]*"><\/script>)/, '$1\n    <script src="/assets/js/arrive.js"></script>');
  }
  return out;
}

const check = process.argv.includes('--check');
const print = process.argv.includes('--print');
const stale = [];
let written = 0;

for (const courseKey of ['units', 'data']) {
  for (const unit of unitsFor(courseKey)) {
    if (print) {
      console.log(`\n${unit.file}  ${unit.title}`);
      unit.lessons.forEach((l, i) => console.log(`  ${i + 1}. ${l.title} (${l.time}) — ${l.summary}`));
    }
    const file = path.join(ROOT, unit.file);
    if (!existsSync(file)) { stale.push(`${unit.file} (missing)`); continue; }
    const html = readFileSync(file, 'utf8');
    const next = withAssets(withRegion(html, renderUnitRegion(unit)), courseKey);
    if (next === html) continue;
    if (check) stale.push(unit.file);
    else if (!print) { writeFileSync(file, next); written += 1; }
  }
}

if (check) {
  if (stale.length) {
    console.error(`stale unit pages: ${stale.join(', ')} -- run node scripts/build-unit-pages.mjs`);
    process.exit(1);
  }
  console.log('unit pages are up to date');
} else if (!print) {
  console.log(`wrote ${written} unit pages`);
}
