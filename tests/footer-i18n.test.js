import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* Every page's footer links to Settings with data-i18n="footer.settings". With
   no entry for that key, the runtime printed the key itself in the footer. */
describe('the footer Settings link has words', () => {
  it('is in the English catalog', () => {
    const en = JSON.parse(fs.readFileSync('assets/i18n/en.json', 'utf8'));
    expect(en['footer.settings']).toBe('Settings');
  });

  it('is in the English fallback built into i18n.js', () => {
    expect(fs.readFileSync('assets/js/i18n.js', 'utf8')).toContain('"footer.settings":"Settings"');
  });

  it('is a key some page actually uses', () => {
    expect(fs.readFileSync('units/unit-1.html', 'utf8')).toContain('data-i18n="footer.settings"');
  });
});
