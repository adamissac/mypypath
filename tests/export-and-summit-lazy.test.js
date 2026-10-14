import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('the classroom page does not fetch export writers until asked', () => {
  const html = fs.readFileSync('classroom.html', 'utf8');
  const dash = fs.readFileSync('assets/js/classroom-dashboard.js', 'utf8');

  it('leaves xlsx-writer and classroom-export out of the page head', () => {
    expect(html).not.toMatch(/xlsx-writer\.js/);
    expect(html).not.toMatch(/classroom-export\.js/);
  });

  it('loads them on the first export, digest, or spreadsheet click', () => {
    expect(dash).toContain("loadScript('/assets/js/xlsx-writer.js')");
    expect(dash).toContain("loadScript('/assets/js/classroom-export.js')");
    expect(dash).toContain('await ensureExport()');
  });
});

/* The summit diorama loads after the page has, not on approach: its entrance
   (rising through the clouds) only works if it arrives while the visitor is
   still looking at the hero. It is decoration, budgeted separately as decorKB
   in scripts/verify-perf-budget.mjs, and still skipped for reduced motion,
   Save-Data and slow connections. See
   docs/superpowers/specs/2026-10-13-summit-diorama-design.md. */
describe('the homepage mountain loads after the page, never before it', () => {
  const src = fs.readFileSync('assets/js/summit-3d.js', 'utf8');

  it('waits for the load event, then an idle moment', () => {
    expect(src).toMatch(/addEventListener\('load', go/);
    expect(src).toMatch(/requestIdleCallback\(load, \{ timeout: 1000 \}\)/);
  });

  it('is skipped for Save-Data and slow connections', () => {
    expect(src).toContain('env.saveData');
    expect(src).toContain("['slow-2g', '2g', '3g']");
  });
});
