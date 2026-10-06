import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Skill HTML and generator templates are in the repo so Vercel would
 * serve them, but they are not site pages. Listing them in sitemap.xml
 * asked crawlers to index them. */

const SITEMAP = fs.readFileSync('sitemap.xml', 'utf8');
const ROBOTS = fs.readFileSync('robots.txt', 'utf8');
const GEN = fs.readFileSync('scripts/generate_sitemap.py', 'utf8');

describe('the sitemap only advertises public pages', () => {
  it('does not list skill, agent, generator, audit, or leftover HTML', () => {
    expect(SITEMAP).not.toMatch(/mypypath\.com\/\.claude\//);
    expect(SITEMAP).not.toMatch(/mypypath\.com\/\.agents\//);
    expect(SITEMAP).not.toMatch(/mypypath\.com\/\.audit\//);
    expect(SITEMAP).not.toMatch(/mypypath\.com\/scripts\//);
    expect(SITEMAP).not.toMatch(/mypypath\.com\/engine\//);
  });

  it('still lists the homepage and a lesson', () => {
    expect(SITEMAP).toContain('<loc>https://mypypath.com/</loc>');
    expect(SITEMAP).toContain('/units/unit-1/what-is-python.html');
  });

  it('the generator skips those trees so a regenerate cannot put them back', () => {
    expect(GEN).toMatch(/SKIP_DIRS = \{[^}]*"\.claude"/);
    expect(GEN).toMatch(/SKIP_DIRS = \{[^}]*"\.agents"/);
    expect(GEN).toMatch(/SKIP_DIRS = \{[^}]*"scripts"/);
    expect(GEN).toMatch(/SKIP_DIRS = \{[^}]*"\.audit"/);
    expect(GEN).toMatch(/SKIP_DIRS = \{[^}]*"engine"/);
  });
});

describe('robots.txt keeps crawlers off the same trees', () => {
  it('disallows the skill and generator paths', () => {
    expect(ROBOTS).toMatch(/^Disallow: \/\.claude\//m);
    expect(ROBOTS).toMatch(/^Disallow: \/\.agents\//m);
    expect(ROBOTS).toMatch(/^Disallow: \/scripts\//m);
  });
});
