import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* An SVG inlined as url("data:image/svg+xml,...") must not contain a bare
   double quote: the first one ends the url() and the rest of the rule is
   thrown away, so the image silently never draws. Two sheets shipped that
   way (the cockpit's stars, the hero's cloud bank). */
describe('inline SVG data URIs in stylesheets', () => {
  for (const name of fs.readdirSync('assets/css').filter((n) => n.endsWith('.css'))) {
    it(`${name} quotes them safely`, () => {
      const css = fs.readFileSync(`assets/css/${name}`, 'utf8');
      for (const m of css.matchAll(/url\("data:image\/svg\+xml,([^)]*)\)/g)) {
        const body = m[1].replace(/"$/, '');
        expect(body.includes('"'), `${name}: ${body.slice(0, 60)}`).toBe(false);
      }
    });
  }
});
