/* PyPath — build assets/data/curriculum.json, the machine-readable lesson manifest.
 *
 * Everything downstream (classroom dashboards, check authoring, validators) reads
 * this manifest instead of hardcoding lesson lists. It is a superset of what
 * assets/js/curriculum.js carries: that file is the unit -> path map the site
 * loads at runtime, this one adds titles, order, and the editor and exercise ids
 * present on each page.
 *
 * Lesson order is curriculum order, not filename order, so it is read from the
 * links on each unit overview page -- the same source scripts/generate_curriculum.py
 * uses, so the two stay consistent.
 *
 * Usage: npm run build:curriculum
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'data', 'curriculum.json');
const TOTAL_UNITS = 10;

/* Matches in document order, de-duplicated, first occurrence wins. */
function orderedMatches(html, re) {
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(re)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function firstGroup(html, re, fallback) {
  const m = html.match(re);
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, '')) : fallback;
}

/* The unit overview page is the authority on which lessons exist and in what
   order. A lesson on disk that nothing links to has no defined position, so it
   is an error rather than something to guess at. */
function lessonPathsFor(unit) {
  const overview = path.join(ROOT, 'units', `unit-${unit}.html`);
  const html = fs.readFileSync(overview, 'utf8');
  const linked = orderedMatches(
    html,
    new RegExp(`href="(/units/unit-${unit}/[a-z0-9-]+\\.html)"`, 'g')
  );
  const dir = path.join(ROOT, 'units', `unit-${unit}`);
  const onDisk = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.html'))
    .map((n) => `/units/unit-${unit}/${n}`);
  const missing = onDisk.filter((p) => !linked.includes(p)).sort();
  if (missing.length) {
    throw new Error(
      `unit-${unit}: ${missing.length} lesson(s) exist on disk but are not linked ` +
        `from unit-${unit}.html, so their order is unknown: ${missing.join(', ')}`
    );
  }
  return linked;
}

export function buildCurriculum() {
  const lessons = [];
  for (let unit = 1; unit <= TOTAL_UNITS; unit += 1) {
    const overviewHtml = fs.readFileSync(
      path.join(ROOT, 'units', `unit-${unit}.html`),
      'utf8'
    );
    // "Unit 1: Foundations" -> "Foundations"; the unit number is already a field.
    const unitTitle = firstGroup(
      overviewHtml,
      /<h1[^>]*class="page-title"[^>]*>([\s\S]*?)<\/h1>/,
      `Unit ${unit}`
    ).replace(new RegExp(`^Unit\\s*${unit}\\s*[:•-]\\s*`), '');

    lessonPathsFor(unit).forEach((lessonPath, index) => {
      const slug = path.basename(lessonPath, '.html');
      const html = fs.readFileSync(path.join(ROOT, lessonPath.slice(1)), 'utf8');
      lessons.push({
        unit,
        unitTitle,
        slug,
        path: lessonPath,
        title: firstGroup(
          html,
          /<h1[^>]*class="lesson-title"[^>]*>([\s\S]*?)<\/h1>/,
          slug
        ),
        order: index + 1,
        editors: orderedMatches(html, /data-editor-id="([^"]+)"/g),
        exercises: orderedMatches(html, /data-exercise-id="([^"]+)"/g)
      });
    });
  }
  return lessons;
}

function main() {
  const lessons = buildCurriculum();
  const json = JSON.stringify(
    {
      schemaVersion: 1,
      generatedBy: 'scripts/build-curriculum.js',
      totalUnits: TOTAL_UNITS,
      lessonCount: lessons.length,
      lessons
    },
    null,
    2
  );
  fs.writeFileSync(OUT, json + '\n', 'utf8');
  process.stdout.write(
    `Wrote ${path.relative(ROOT, OUT)}: ${lessons.length} lessons across ${TOTAL_UNITS} units\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
