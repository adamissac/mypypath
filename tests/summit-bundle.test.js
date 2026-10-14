import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);

describe('the summit scene bundle', () => {
  it('is up to date with its sources', () => {
    expect(() => execFileSync('node', ['scripts/build-summit.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('exports mountSummit and points at the current model by content hash', () => {
    const bundle = fs.readFileSync('assets/js/summit-scene.js', 'utf8');
    expect(bundle).toMatch(/mountSummit/);
    expect(bundle).toContain(`/assets/models/summit.glb?v=${hash('assets/models/summit.glb')}`);
  });
});
