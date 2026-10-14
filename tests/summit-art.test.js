import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

/* The hero mountain is a flat illustration, the twin of the Python for Data
   moon: one SVG with its own gentle animations, nothing to drag, no 3D. */
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
const index = fs.readFileSync('index.html', 'utf8');

describe('the hero mountain', () => {
  it('is the illustrated summit, versioned by its bytes', () => {
    expect(index).toContain(`/assets/img/summit-art.svg?v=${hash('assets/img/summit-art.svg')}`);
  });

  it('ships no 3D scene, model or loading gate', () => {
    for (const gone of ['summit-scene', 'summit.glb', 'summit-pending', 'summit-diorama']) expect(index).not.toContain(gone);
    expect(fs.existsSync('assets/js/summit-scene.js')).toBe(false);
    expect(fs.existsSync('assets/models/summit.glb')).toBe(false);
    expect(fs.readFileSync('assets/js/summit-3d.js', 'utf8')).not.toMatch(/import\(|three/i);
  });

  it('keeps every motion in the drawing behind prefers-reduced-motion', () => {
    const svg = fs.readFileSync('assets/img/summit-art.svg', 'utf8');
    const style = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
    const outside = style.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n    \}/, '');
    expect(outside).not.toMatch(/animation:/);
  });

  it('cannot be picked up and dragged, by mouse or by touch', () => {
    const doc = new JSDOM(index).window.document;
    for (const sel of ['.home-summit__art', '.home-summit__moon']) {
      const img = doc.querySelector(sel);
      expect(img.getAttribute('draggable'), sel).toBe('false');
    }
    const css = fs.readFileSync('assets/css/home-path.css', 'utf8');
    const rule = css.match(/\.home-summit img \{[^}]*\}/);
    expect(rule, 'a .home-summit img rule').toBeTruthy();
    expect(rule[0]).toMatch(/-webkit-user-drag:\s*none/);
    expect(rule[0]).toMatch(/user-select:\s*none/);
  });
});
