import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

/* bake_layout.py runs before every push. It used to rewrite each unit page's
   <meta name="description"> to a generic "Unit N: <Foundations name> — PyPath
   curriculum", which silently undid the real per-unit descriptions
   (tests/page-meta.test.js) -- and put Foundations text on Python for Data
   pages. A unit page's description is the page's own; the bake leaves it. */
const pages = [
  ...Array.from({ length: 10 }, (_, i) => `units/unit-${i + 1}.html`),
  ...Array.from({ length: 10 }, (_, i) => `data/unit-${i + 1}.html`),
];

describe('the layout bake leaves unit page descriptions alone', () => {
  it('returns every unit page unchanged by its unit-page step', () => {
    const script = `
import sys, json
from pathlib import Path
sys.path.insert(0, 'scripts')
import bake_layout as b
changed = []
for rel in json.loads(sys.argv[1]):
    p = b.ROOT / rel
    html = p.read_text(encoding='utf-8')
    if b.fix_unit_redirect(html, p) != html:
        changed.append(rel)
print(json.dumps(changed))`;
    const out = execFileSync('python3', ['-c', script, JSON.stringify(pages)], { encoding: 'utf8' });
    expect(JSON.parse(out.trim().split('\n').pop())).toEqual([]);
  });
});
