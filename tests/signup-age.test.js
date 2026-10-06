import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const script = fs.readFileSync('assets/js/consent.js', 'utf8');
const signup = fs.readFileSync('signup.html', 'utf8');

beforeEach(() => {
  document.body.innerHTML = signup.match(/<main[\s\S]*?<\/main>/)[0];
  new Function(script).call(window);
});
function choose(value) {
  const age = document.getElementById('signup-age');
  age.value = value;
  age.dispatchEvent(new Event('change'));
}
function expectLocked(locked) {
  expect(document.getElementById('signup-details').disabled).toBe(locked);
  expect(document.getElementById('signup-google').disabled).toBe(locked);
  expect(document.getElementById('signup-github').disabled).toBe(locked);
}
describe('signup age eligibility', () => {
  it('starts with personal fields and both provider buttons disabled', () => {
    expectLocked(true);
    expect(document.getElementById('signup-email').matches(':disabled')).toBe(true);
  });
  it('enables signup only for the explicit eligible age range', () => {
    choose('13-plus');
    expectLocked(false);
    choose('');
    expectLocked(true);
    for (const value of [undefined, null, '', 'under-13', 'true']) {
      expect(window.PyPathConsent.checkAge(value).ok).toBe(false);
    }
  });
  it('blocks an under-13 response, clears entered details, and explains the result', () => {
    choose('13-plus');
    document.getElementById('signup-email').value = 'test@example.com';
    choose('under-13');
    expectLocked(true);
    expect(document.getElementById('signup-age').disabled).toBe(true);
    expect(document.getElementById('signup-email').value).toBe('');
    expect(document.getElementById('signup-age-hint').textContent).toContain('cannot create an account');
  });
  it('hides the account-details legend with the class the sheets actually define', () => {
    // .sr-only is not in any stylesheet. Without .visually-hidden the legend
    // paints "Account details" into the signup form.
    expect(signup).toContain('<legend class="visually-hidden">Account details</legend>');
    expect(signup).not.toContain('sr-only');
  });

  it('also checks age in the shared submit guard used by email and OAuth', () => {
    expect(signup).toContain("if (!window.PyPathConsent.checkAge(document.getElementById('signup-age').value).ok) return false;");
    expect(signup.match(/if \(!agreed\(\)\) return;/g)).toHaveLength(2);
  });
});


afterEach(() => vi.unstubAllGlobals());
it.each(['school-approved-enrollment-pending', 'unavailable'])('school check %s cannot unlock child account creation', async status => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status }) });
  vi.stubGlobal('fetch', fetch);
  choose('under-13');
  expect(document.getElementById('school-access').hidden).toBe(false);
  document.getElementById('school-code').value = 'abc123';
  document.getElementById('school-code-check').click();
  await vi.waitFor(() => expect(document.getElementById('school-code-check').disabled).toBe(false));
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ code: 'ABC123' });
  expectLocked(true);
});
