import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const login = fs.readFileSync('login.html', 'utf8');
const css = fs.readFileSync('assets/css/auth.css', 'utf8');

describe('forgot-password is a button, not a hash link', () => {
  it('cannot jump the page to the top before JS runs', () => {
    expect(login).toContain('id="login-reset"');
    expect(login).toContain('<button type="button" id="login-reset" class="link">');
    expect(login).not.toMatch(/href="#"[^>]*id="login-reset"/);
  });

  it('still looks like a text link', () => {
    expect(css).toMatch(/button\.link\s*\{/);
  });
});
