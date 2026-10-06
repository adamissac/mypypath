import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* These buttons sit outside a form, but the HTML default type is submit.
 * A later wrap in a form would export or wipe progress on enter. */

const html = fs.readFileSync('settings.html', 'utf8');

describe('settings data actions are explicit buttons', () => {
  it('marks export, reset, and desktop save controls type=button', () => {
    for (const id of ['export-btn', 'reset-btn']) {
      expect(html).toMatch(new RegExp(`<button type="button"[^>]*id="${id}"`));
    }
    for (const attr of ['data-desktop-save-open', 'data-desktop-save-as', 'data-desktop-save-now']) {
      expect(html).toMatch(new RegExp(`<button type="button"[^>]*${attr}`));
    }
  });
});
