import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* A teacher at 1024px has the full desktop nav plus Classroom. The
 * avatar's display name was the control hanging off the right edge. */

const auth = fs.readFileSync('assets/css/auth.css', 'utf8');
const fast = fs.readFileSync('assets/css/pypath-fast.css', 'utf8');

describe('the header fits a signed-in teacher on a small laptop', () => {
  it('hides the username before 1024px of nav runs out of room', () => {
    expect(auth).toMatch(/@media \(max-width: 1024px\) \{\s*\.account-username \{ display: none; \}/);
  });

  it('hides Start learning on the same width so the CTA is not the overflow', () => {
    expect(fast).toMatch(/@media \(max-width: 1024px\) \{\s*\.header-cta \{/);
  });
});
