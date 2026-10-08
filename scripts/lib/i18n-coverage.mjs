import { load } from 'cheerio';
import { createHash } from 'node:crypto';

const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const readable = value => /\p{L}/u.test(value);
const idFor = text => createHash('sha256').update(text).digest('hex').slice(0, 24);
const excluded = 'script, style, pre, code, textarea, [contenteditable]:not([contenteditable="false"]), [data-no-translate], [translate="no"], svg';

// Inventory only. No source HTML, code, user content, or grading data is rewritten.
export function inventoryHtml(html, file) {
  const $ = load(html, { sourceCodeLocationInfo: true });
  const entries = [];
  const add = (node, value, attribute, key) => {
    const text = normalize(value);
    if (!readable(text)) return;
    entries.push({ id: idFor(text), file, line: node.sourceCodeLocation?.startLine || 1,
      kind: 'prose', attribute, text, ...(key ? { key } : {}) });
  };
  function walk(node) {
    if (node.type === 'text') {
      const parent = $(node.parent);
      if (parent.closest(excluded).length) return;
      const key = parent.children().length === 0 ? parent.attr('data-i18n') : undefined;
      add(node, node.data, 'text', key);
      return;
    }
    if (node.type === 'tag' && !$(node).closest(excluded).length) {
      for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
        if (node.attribs?.[attr]) add(node, node.attribs[attr], attr, attr === 'alt' ? undefined : node.attribs[`data-i18n-${attr}`]);
      }
    }
    for (const child of node.children || []) walk(child);
  }
  walk($.root()[0]);
  return entries;
}

const proseFields = new Set(['title', 'unitTitle', 'description', 'prompt', 'explain', 'explanation', 'hint', 'hints', 'label', 'summary']);
const ambiguousFields = new Set(['choices', 'left', 'right', 'options']);
const protectedFields = new Set(['answer', 'answers', 'correct', 'code', 'starter', 'solution', 'tests', 'checks', 'expected', 'id', 'slug', 'path', 'url']);
export function inventoryJson(data, file) {
  const entries = [];
  function walk(value, path, field) {
    if (protectedFields.has(field)) return;
    if (typeof value === 'string') {
      if (!proseFields.has(field) && !ambiguousFields.has(field)) return;
      const text = normalize(value);
      if (readable(text)) entries.push({ id: idFor(text), file, pointer: path, text,
        kind: ambiguousFields.has(field) ? 'needs-classification' : 'prose' });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}/${index}`, field));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) walk(item, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, key);
    }
  }
  walk(data, '', '');
  return entries;
}

export function assessCoverage(entries, english, target) {
  const tokens = value => (String(value).match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g) || []).sort().join('|');
  const result = { unwired: 0, needsClassification: 0, sourceDrift: 0, missing: 0, invalidPlaceholders: 0 };
  for (const entry of entries) {
    if (entry.kind === 'needs-classification') result.needsClassification++;
    if (!entry.key) result.unwired++;
    else if (normalize(english[entry.key] || '') !== entry.text) result.sourceDrift++;
  }
  for (const [key, source] of Object.entries(english)) {
    if (typeof target[key] !== 'string' || !target[key].trim()) result.missing++;
    else if (tokens(source) !== tokens(target[key])) result.invalidPlaceholders++;
  }
  return { ...result, ready: Object.values(result).every(count => count === 0) };
}
