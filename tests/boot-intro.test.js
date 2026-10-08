import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* The inline gate used to add pp-wait before deciding the boot would
 * actually play. Returning visitors, and the mobile suite (which sets
 * pypath-boot-seen), kept an invisible homepage header until motion.js
 * arrived. */

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('pp-wait  → entrance choreography pending');
const script = html.slice(start, html.indexOf('})();', start));

describe('the homepage boot gate does not hide a returning visit', () => {
  it('adds pp-wait only after the seen/fromLink return', () => {
    const ret = script.indexOf('if (seen || fromLink');
    const wait = script.indexOf("root.classList.add('pp-wait')");
    expect(ret).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(ret);
  });
});
