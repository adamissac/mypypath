import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { qualifies } from '../assets/summit/qualify.js';

const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
let boot;

beforeAll(() => {
  // The bootstrap is a classic script; with no .home-summit on the page it
  // only defines its API.
  new Function(fs.readFileSync('assets/js/summit-3d.js', 'utf8')).call(window);
  boot = window.PyPathSummit;
});

describe('the summit bootstrap', () => {
  it('decides who gets 3D exactly as the scene module does', () => {
    const base = { reduced: false, saveData: false, effectiveType: '4g', webgl: true, isHome: true, course: null };
    const flips = [{}, { reduced: true }, { saveData: true }, { effectiveType: 'slow-2g' }, { effectiveType: '2g' },
      { effectiveType: '3g' }, { effectiveType: undefined }, { webgl: false }, { isHome: false }, { course: 'data' }, { course: 'foundations' }];
    for (const f of flips) expect(boot.qualifies({ ...base, ...f }), JSON.stringify(f)).toBe(qualifies({ ...base, ...f }));
  });

  it('loads the scene bundle at its current hash, and the old three.js build is gone', () => {
    const src = fs.readFileSync('assets/js/summit-3d.js', 'utf8');
    expect(src).toContain(`/assets/js/summit-scene.js?v=${hash('assets/js/summit-scene.js')}`);
    expect(src).not.toMatch(/three\.min\.js/);
    expect(fs.existsSync('assets/vendor/three.min.js')).toBe(false);
  });

  it('reads unit names and hours from the trail cards', () => {
    document.body.innerHTML = `<article data-stop-card data-stop-index="0"><h3>Foundations</h3>
      <div class="path-stop-card__meta"><span>1–2 hrs</span><span>Beginner</span></div></article>
      <article data-stop-card data-stop-index="1"><h3>Control Flow</h3></article>`;
    const units = boot.unitsFromCards(document);
    expect(units[0]).toEqual({ n: 1, title: 'Foundations', hours: '1–2 hrs', href: '/units/unit-1.html' });
    expect(units[1]).toEqual({ n: 2, title: 'Control Flow', hours: '', href: '/units/unit-2.html' });
    expect(units).toHaveLength(10);
    expect(units[9]).toEqual({ n: 10, title: 'Unit 10', hours: '', href: '/units/unit-10.html' });
  });

  it('only lets the entrance play once per session', () => {
    sessionStorage.clear();
    expect(boot.seenThisSession()).toBe(false);
    boot.markSeen();
    expect(boot.seenThisSession()).toBe(true);
  });
});
