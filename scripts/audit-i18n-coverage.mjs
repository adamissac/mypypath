import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryHtml, inventoryJson, assessCoverage } from './lib/i18n-coverage.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const htmlFiles = files.filter(file => /^(?:[^/]+\.html|(?:units|data)\/.*\.html)$/.test(file));
const dataFiles = files.filter(file => /^assets\/data\/.*\.json$/.test(file) && !file.includes('/model/'));
const dynamicFiles = files.filter(file => /^assets\/js\/.*\.js$/.test(file) && file !== 'assets/js/i18n.js');
const read = file => readFile(resolve(root, file), 'utf8');
const entries = [];
for (const file of htmlFiles) entries.push(...inventoryHtml(await read(file), file));
for (const file of dataFiles) entries.push(...inventoryJson(JSON.parse(await read(file)), file));
const english = JSON.parse(await read('assets/i18n/en.json'));
const registry = JSON.parse(await read('assets/i18n/languages.json'));
const locales = [];
for (const locale of registry.locales.filter(item => item.tag !== 'en')) {
  let target = {};
  try { target = JSON.parse(await read(`assets/i18n/${locale.tag}.json`)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const coverage = assessCoverage(entries, english, target);
  locales.push({ tag: locale.tag, status: locale.status, ...coverage,
    // Static inspection cannot certify strings emitted at runtime. These files
    // must receive explicit key wiring and browser verification before release.
    dynamicReviewPending: dynamicFiles.length, ready: coverage.ready && dynamicFiles.length === 0 });
}
const summary = {
  htmlPages: htmlFiles.length, dataFiles: dataFiles.length, textOccurrences: entries.length,
  uniqueStrings: new Set(entries.map(entry => entry.id)).size,
  unmarkedOccurrences: entries.filter(entry => !entry.key).length,
  ambiguousQuizStrings: entries.filter(entry => entry.kind === 'needs-classification').length,
  dynamicFilesPending: dynamicFiles.length,
  limitation: 'Static inventory only; dynamic scripts, inline scripts, and unclassified data fields still require inspection. No locale is certified by this inventory.'
};
const report = { summary, locales, dynamicFiles, entries };
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
  if (!process.argv[outputIndex + 1]) throw new Error('--output requires a file path');
  const output = resolve(process.argv[outputIndex + 1]);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ summary, locales }, null, 2));
const premature = locales.filter(locale => locale.status === 'ready' && !locale.ready);
if (premature.length || (process.argv.includes('--release') && locales.some(locale => !locale.ready))) {
  console.error('Whole-site localization is incomplete. Finish content wiring, translation, and dynamic/browser review before enabling additional locales.');
  process.exitCode = 1;
}
