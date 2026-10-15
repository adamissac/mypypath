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

  it('is drawn in the site\'s own blues, with the sky blue kept for accents', () => {
    const svg = fs.readFileSync('assets/img/summit-art.svg', 'utf8');
    // pypath-theme.css: ink #0c4566, ink-soft #165a7a, line #0ea5e9, fog #e8f4fb,
    // mist #f3f9fc, border #d0e4ef -- and the steel ramp between ink and fog
    // that the original mountain used.
    const ALLOWED = new Set([
      '#ffffff', '#f3f9fc', '#e8f4fb', '#d0e4ef', '#a8d0e8', '#8fbdd6', '#7fb0cf', '#4078a0', '#2b6a8f', '#165a7a',
      '#11506f', '#0c4566', '#0a3a57', '#082f49', '#0ea5e9', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff', '#f2bc63',
    ]);
    const used = [...new Set((svg.match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toLowerCase()))];
    expect(used.filter((c) => !ALLOWED.has(c))).toEqual([]);
    // The accent is an accent: no big shape may use it (trail, stops, lake and
    // flag are the only users, so it stays a small share of the colours).
    const accent = (svg.match(/#0ea5e9/gi) || []).length;
    const all = (svg.match(/#[0-9a-fA-F]{6}\b/g) || []).length;
    expect(accent / all).toBeLessThan(0.28);
  });
});
