/* Idempotently refresh the authored extension in Foundations Unit 1. */
const fs = require('node:fs');
const {entries, questions, markup} = require('./intro-lesson-enrichment.cjs');
for (const entry of entries.filter(e => e.course === 'foundations')) {
  const path = `units/unit-1/${entry.slug}.html`;
  let html = fs.readFileSync(path, 'utf8');
  const block = `<!-- intro-enrichment:start -->\n${markup(entry)}\n<!-- intro-enrichment:end -->\n`;
  if (html.includes('<!-- intro-enrichment:start -->')) {
    html = html.replace(/<!-- intro-enrichment:start -->[\s\S]*?<!-- intro-enrichment:end -->\n?/, block);
  } else {
    const anchor = '<div class="exercise-section">';
    if (!html.includes(anchor)) throw new Error(`Missing exercise section: ${path}`);
    html = html.replace(anchor, block + anchor);
  }
  fs.writeFileSync(path, html);
  const checkPath = `assets/data/checks/unit-1/${entry.slug}.json`;
  const checks = JSON.parse(fs.readFileSync(checkPath, 'utf8'));
  checks.questions = (checks.questions || []).filter(q => !q.id.startsWith('intro-')).concat(questions(entry));
  fs.writeFileSync(checkPath, JSON.stringify(checks, null, 2) + '\n');
}
