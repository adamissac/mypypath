/* Builds assets/data/skills.json from scripts/skills-source.mjs.
 *
 *   node scripts/build-skills.mjs
 *
 * Every assessable item on the site gets one or more skill tags:
 *
 *   lesson:<path>                 from LESSONS, by hand
 *   exercise:<path>#exerciseN     inherits its lesson's tags
 *   question:<id>                 lesson quiz question; inherits its lesson's tags
 *   mcq:<id>, frq:<id>            end-of-unit test items; keyword-tagged (below)
 *
 * End-of-unit questions are not attached to a lesson, so they are tagged by
 * matching each skill's keywords, weighted by rarity within the unit, against
 * the question's prompt, code, choices and explanation -- restricted to the skills taught in that unit of that
 * course, so a unit 2 question cannot be tagged with a unit 8 skill. The
 * best-scoring skill wins; an exact tie keeps both. A question that matches
 * nothing falls back to the unit's most-taught skill, and `itemSource` records
 * which of the three happened, so the weakest tags can be found and reviewed.
 *
 * Deterministic: same sources in, byte-identical file out.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SKILLS, LESSONS, TAG_OVERRIDES } from './skills-source.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const COURSES = {
  foundations: { manifest: 'assets/data/curriculum.json', checks: 'assets/data/checks', tests: 'assets/data/unit-tests' },
  data: { manifest: 'assets/data/curriculum-data.json', checks: 'assets/data/checks/data', tests: 'assets/data/unit-tests/data' },
};

/* A keyword that appears in nearly every question of a unit says nothing about
   which skill a question is on -- every unit 3 question contains "def ", every
   unit 6 question "self". Each keyword is weighted by how rare it is within
   the unit's own question pool (an IDF weight), so a match on "nonlocal"
   outweighs a match on "def ". A keyword in every question weighs ~0. */
function keywordWeights(candidates, texts) {
  const n = texts.length;
  const weights = {};
  for (const skill of candidates) {
    for (const kw of skill.keywords) {
      const k = kw.toLowerCase();
      if (k in weights) continue;
      const df = texts.filter((t) => t.includes(k)).length;
      weights[k] = Math.log((n + 1) / (df + 1));
    }
  }
  return weights;
}

function keywordScore(skill, text, weights) {
  let score = 0;
  for (const kw of skill.keywords) {
    const k = kw.toLowerCase();
    if (text.includes(k)) score += weights[k];
  }
  return score;
}

export function buildSkills() {
  const byId = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
  const items = {};
  const itemSource = {};
  const tag = (key, skills, source) => { items[key] = [...new Set(skills)]; itemSource[key] = source; };

  for (const [course, cfg] of Object.entries(COURSES)) {
    const lessons = read(cfg.manifest).lessons;
    const unitSkills = {};    // unit -> ordered unique skills taught in it
    const unitPrimary = {};   // unit -> { skill: lessons whose primary skill it is }

    for (const lesson of lessons) {
      const skills = LESSONS[course]?.[lesson.unit]?.[lesson.slug];
      if (!skills) throw new Error(`no skills for ${course} unit ${lesson.unit} ${lesson.slug}`);
      tag(`lesson:${lesson.path}`, skills, 'lesson');
      (unitSkills[lesson.unit] ||= []).push(...skills.filter((s) => !unitSkills[lesson.unit]?.includes(s)));
      const prim = (unitPrimary[lesson.unit] ||= {});
      prim[skills[0]] = (prim[skills[0]] || 0) + 1;

      const spec = read(`${cfg.checks}/unit-${lesson.unit}/${lesson.slug}.json`);
      for (const key of Object.keys(spec).filter((k) => /^exercise\d+$/.test(k)).sort()) {
        tag(`exercise:${lesson.path}#${key}`, skills, 'lesson');
      }
      for (const q of spec.questions || []) tag(`question:${q.id}`, skills, 'lesson');
    }

    for (const unit of Object.keys(unitSkills).map(Number).sort((a, b) => a - b)) {
      const candidates = unitSkills[unit].map((id) => byId[id]);
      // Most-taught primary skill; ties go to the one taught first.
      const fallback = Object.entries(unitPrimary[unit])
        .sort((a, b) => b[1] - a[1] || unitSkills[unit].indexOf(a[0]) - unitSkills[unit].indexOf(b[0]))[0][0];

      const pool = [];
      for (const [kind, file] of [['mcq', `${cfg.tests}/unit-${unit}-mcq.json`], ['frq', `${cfg.tests}/unit-${unit}-frq.json`]]) {
        if (!fs.existsSync(file)) continue;
        for (const q of read(file)) {
          const text = [q.title, q.prompt, q.code, q.starter, ...(q.choices || []), q.explain]
            .filter(Boolean).join('\n').toLowerCase();
          pool.push({ key: `${kind}:${q.id}`, text });
        }
      }
      const weights = keywordWeights(candidates, pool.map((p) => p.text));
      for (const { key, text } of pool) {
        const scored = candidates.map((s) => [s.id, keywordScore(s, text, weights)]);
        const best = Math.max(...scored.map(([, n]) => n));
        if (best < 1e-9) tag(key, [fallback], 'fallback');
        else tag(key, scored.filter(([, n]) => Math.abs(n - best) < 1e-9).map(([id]) => id), 'keyword');
      }
    }
  }

  for (const [key, skills] of Object.entries(TAG_OVERRIDES)) {
    if (!(key in items)) throw new Error(`override for unknown item ${key}`);
    tag(key, skills, 'override');
  }

  const skills = SKILLS.map(({ keywords, ...rest }) => rest);
  const sortedItems = Object.fromEntries(Object.keys(items).sort().map((k) => [k, items[k]]));
  const sortedSource = Object.fromEntries(Object.keys(itemSource).sort().map((k) => [k, itemSource[k]]));
  // What the browser model is pinned to: the skills and every item's tags.
  // A model trained against one tagging must not silently score another.
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ skills, items: sortedItems })).digest('hex').slice(0, 16);

  const counts = {};
  for (const s of Object.values(sortedSource)) counts[s] = (counts[s] || 0) + 1;

  return {
    schemaVersion: 1,
    version: 'skills-v1',
    hash,
    generatedBy: 'scripts/build-skills.mjs from scripts/skills-source.mjs -- edit the source, not this file',
    tagging: {
      lesson: 'lessons, exercises and lesson quiz questions: tagged by hand per lesson',
      keyword: 'end-of-unit MCQ and FRQ: best keyword match among the skills of the same course and unit',
      fallback: 'end-of-unit items no keyword matched: the unit\'s most-taught skill; least trustworthy',
      override: 'end-of-unit items whose keyword tag was corrected by hand (TAG_OVERRIDES)',
      counts,
    },
    skills,
    items: sortedItems,
    itemSource: sortedSource,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildSkills();
  fs.writeFileSync('assets/data/skills.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote assets/data/skills.json: ${out.skills.length} skills, ${Object.keys(out.items).length} items`, out.tagging.counts, out.hash);
}
