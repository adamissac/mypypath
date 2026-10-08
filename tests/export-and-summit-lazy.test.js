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

describe('the homepage mountain waits for approach before fetching three.js', () => {
  const src = fs.readFileSync('assets/js/summit-3d.js', 'utf8');

  it('observes the summit instead of an idle timeout', () => {
    expect(src).toContain('IntersectionObserver');
    expect(src).toContain('obs.observe(host)');
    expect(src).not.toMatch(/requestIdleCallback\(fetchIt/);
  });

  it('does not fetch three.js the moment the hero is on screen', () => {
    expect(src).toContain("addEventListener('pointerenter', once");
    expect(src).toMatch(/setTimeout\(once,\s*8000\)/);
  });
});
