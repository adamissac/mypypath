/* Validates assets/data/skills.json.
 *
 *   node scripts/validate-skills.mjs      (npm run validate:skills)
 *
 * Fails when:
 *   - the skill count leaves 30..60 (small enough to estimate)
 *   - a skill id repeats, or a prerequisite names a skill that does not exist
 *   - the prerequisite graph has a cycle (the cycle is printed)
 *   - any lesson, exercise, lesson quiz question or end-of-unit item on the
 *     site has no tag, or a tag names an unknown skill
 *   - skills.json tags an item that no longer exists
 *   - a skill tags nothing
 *   - the recorded hash does not match the content, or the file is stale
 *     against scripts/skills-source.mjs (rebuild with node scripts/build-skills.mjs)
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildSkills } from './build-skills.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* Every item key the site actually has, from the files that define them. */
export function expectedItemKeys() {
  const keys = new Set();
  const courses = [
    ['assets/data/curriculum.json', 'assets/data/checks', 'assets/data/unit-tests'],
    ['assets/data/curriculum-data.json', 'assets/data/checks/data', 'assets/data/unit-tests/data'],
  ];
  for (const [manifest, checks, tests] of courses) {
    const units = new Set();
    for (const lesson of read(manifest).lessons) {
      units.add(lesson.unit);
      keys.add(`lesson:${lesson.path}`);
      const spec = read(`${checks}/unit-${lesson.unit}/${lesson.slug}.json`);
      for (const k of Object.keys(spec)) if (/^exercise\d+$/.test(k)) keys.add(`exercise:${lesson.path}#${k}`);
      for (const q of spec.questions || []) keys.add(`question:${q.id}`);
    }
    for (const unit of units) {
      for (const kind of ['mcq', 'frq']) {
        const file = `${tests}/unit-${unit}-${kind}.json`;
        if (fs.existsSync(file)) for (const q of read(file)) keys.add(`${kind}:${q.id}`);
      }
    }
  }
  return keys;
}

/* A cycle as a list of ids, or null. Depth-first with a colour per node. */
export function findCycle(skills) {
  const edges = Object.fromEntries(skills.map((s) => [s.id, s.prerequisites || []]));
  const state = {};
  const stack = [];
  function visit(id) {
    state[id] = 1; stack.push(id);
    for (const next of edges[id] || []) {
      if (state[next] === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state[next]) { const c = visit(next); if (c) return c; }
    }
    state[id] = 2; stack.pop();
    return null;
  }
  for (const s of skills) if (!state[s.id]) { const c = visit(s.id); if (c) return c; }
  return null;
}

export function validateSkills(doc = read('assets/data/skills.json'), { expected = expectedItemKeys(), checkStale = true } = {}) {
  const errors = [];
  const skills = doc.skills || [];
  const ids = new Set();

  if (skills.length < 30 || skills.length > 60) errors.push(`${skills.length} skills; keep between 30 and 60`);
  for (const s of skills) {
    if (ids.has(s.id)) errors.push(`duplicate skill id ${s.id}`);
    ids.add(s.id);
  }
  for (const s of skills) {
    for (const p of s.prerequisites || []) {
      if (!ids.has(p)) errors.push(`${s.id} requires unknown skill ${p}`);
      if (p === s.id) errors.push(`${s.id} requires itself`);
    }
  }
  const cycle = findCycle(skills);
  if (cycle) errors.push(`prerequisite cycle: ${cycle.join(' -> ')}`);

  const items = doc.items || {};
  const used = new Set();
  for (const key of expected) {
    const tags = items[key];
    if (!Array.isArray(tags) || tags.length === 0) { errors.push(`untagged item ${key}`); continue; }
    for (const t of tags) {
      if (!ids.has(t)) errors.push(`${key} tagged with unknown skill ${t}`);
      used.add(t);
    }
  }
  for (const key of Object.keys(items)) if (!expected.has(key)) errors.push(`stale tag for missing item ${key}`);
  for (const id of ids) if (!used.has(id)) errors.push(`skill ${id} tags no item`);

  const hash = crypto.createHash('sha256').update(JSON.stringify({ skills, items })).digest('hex').slice(0, 16);
  if (doc.hash !== hash) errors.push(`hash ${doc.hash} does not match content (${hash})`);

  if (checkStale && JSON.stringify(buildSkills()) !== JSON.stringify(doc)) {
    errors.push('skills.json is stale against scripts/skills-source.mjs; run node scripts/build-skills.mjs');
  }
  return { errors, skills: skills.length, items: Object.keys(items).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, skills, items } = validateSkills();
  if (errors.length) {
    console.error(errors.slice(0, 50).join('\n'));
    console.error(`\n${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log(`skills.json valid: ${skills} skills, ${items} items tagged, no cycles`);
}
