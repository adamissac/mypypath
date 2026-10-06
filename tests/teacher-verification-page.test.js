import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const markup = readFileSync(resolve('teacher-verification.html'), 'utf8');
const script = readFileSync(resolve('assets/js/teacher-verification-page.js'), 'utf8').replace(/^import .*;\n/, '');
const verified = { verified: true, status: 'affiliation-verified-automatically', request: {
  fullName: 'Ada Lovelace', email: 'ada@district.k12.ga.us', checkedAt: 1800000000000,
  expiresAt: 1802592000000, evidence: [{ source: 'https://district.k12.ga.us/staff', result: 'name-email-teaching-role-matched' }],
} };
let user;
let listeners;
let fetchMock;
function boot() { new Function('currentUser', script)(() => user); }
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function reply(data, status = 200) { return { ok: status < 400, status, json: async () => data }; }
function state() { return document.querySelector('[data-verification-state]').dataset.verificationState; }

beforeEach(() => {
  document.body.innerHTML = markup.match(/<main[\s\S]*?<\/main>/)[0];
  listeners = [];
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((name, handler, options) => {
    listeners.push([name, handler]); add(name, handler, options);
  });
  user = { uid: 'teacher-1', email: 'ada@district.k12.ga.us', emailVerified: true, displayName: 'Ada Lovelace', getIdToken: vi.fn().mockResolvedValue('fixture-token') };
  fetchMock = vi.fn().mockResolvedValue(reply(verified));
  vi.stubGlobal('fetch', fetchMock);
  // jsdom 25 lacks AbortSignal.any; model the browser API without changing
  // production request handling or bypassing cancellation semantics.
  const BrowserSignal = AbortSignal;
  vi.stubGlobal('AbortSignal', class extends BrowserSignal {
    static any(signals) {
      const combined = new AbortController();
      for (const signal of signals) {
        if (signal.aborted) combined.abort(signal.reason);
        else signal.addEventListener('abort', () => combined.abort(signal.reason), { once: true });
      }
      return combined.signal;
    }
  });
});
afterEach(() => {
  listeners.forEach(([name, handler]) => document.removeEventListener(name, handler));
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('teacher verification page', () => {
  it('automatically checks once for the signed-in identity and renders readable evidence', async () => {
    boot(); await settle();
    document.dispatchEvent(new Event('pypath:auth')); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'ensure' });
    expect(state()).toBe('verified');
    expect(document.getElementById('verification-classroom-action').hidden).toBe(false);
    expect(document.getElementById('verification-status').textContent).toContain('matched an official staff listing');
    expect(document.getElementById('verification-sources').textContent).toContain('Name, email, and teaching role matched');
    expect(document.getElementById('verification-details').open).toBe(false);
  });
  it('explains a match on an official teacher directory without claiming a role field was present', async () => {
    fetchMock.mockResolvedValue(reply({ ...verified, request: { ...verified.request, evidence: [
      { source: 'https://district.k12.ga.us/teachers', result: 'name-email-teacher-directory-matched' },
    ] } }));
    boot(); await settle();
    expect(state()).toBe('verified');
    expect(document.getElementById('verification-status').textContent).toContain('official teacher directory');
    expect(document.getElementById('verification-sources').textContent).toContain('Name and email matched');
  });
  it('does not call the backend when signed out or email is unconfirmed', async () => {
    user = null; boot(); await settle();
    expect(state()).toBe('signed-out');
    expect(fetchMock).not.toHaveBeenCalled();
    user = { uid: 'teacher-2', emailVerified: false };
    document.dispatchEvent(new Event('pypath:auth')); await settle();
    expect(state()).toBe('email-required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[403, 'ineligible'], [422, 'unsupported'], [400, 'needs-name'], [429, 'cooldown'], [503, 'unavailable'], [401, 'signed-out']])('explains error %i as %s without an approval queue', async (status, expected) => {
    fetchMock.mockResolvedValue(reply({ error: 'fixture error' }, status));
    boot(); await settle();
    expect(state()).toBe(expected);
    expect(document.getElementById('verification-classroom-action').hidden).toBe(true);
    expect(document.getElementById('verification-status').textContent).not.toMatch(/fixture|administrator|approval queue/);
  });
  it('renders not-verified honestly and lets the teacher correct a directory name', async () => {
    fetchMock.mockResolvedValueOnce(reply({ verified: false, status: 'not-verified', request: { fullName: 'Ada L.', evidence: [] } }));
    boot(); await settle();
    expect(state()).toBe('unverified');
    expect(document.getElementById('verification-details').open).toBe(true);
    document.getElementById('teacher-review-name').value = 'Ada Lovelace';
    document.getElementById('teacher-verification-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'check', fullName: 'Ada Lovelace', directoryUrl: '', registryUrl: '' });
    expect(state()).toBe('verified');
  });
  it('polls an existing check using GET without triggering a second scrape', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(reply({ verified: false, status: 'checking', request: {} }));
    boot(); await settle();
    expect(state()).toBe('checking');
    await vi.advanceTimersByTimeAsync(5000); await settle();
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    expect(state()).toBe('verified');
  });
  it('does not show the old account result after sign-out during a check', async () => {
    let resolve;
    fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
    boot(); await settle();
    user = null; document.dispatchEvent(new Event('pypath:auth'));
    resolve(reply(verified)); await settle();
    expect(state()).toBe('signed-out');
    expect(document.getElementById('verification-identity').hidden).toBe(true);
    expect(document.getElementById('verification-sources').children).toHaveLength(0);
  });
  it('renders directory text as text and rejects unsafe source links', async () => {
    fetchMock.mockResolvedValue(reply({ ...verified, request: { ...verified.request, fullName: '<img src=x onerror=alert(1)>', evidence: [
      { source: 'javascript:alert(1)', result: 'no-match' },
      { source: 'https://user:password@district.k12.ga.us/staff', result: 'no-match' },
    ] } }));
    boot(); await settle();
    expect(document.getElementById('teacher-review-name').value).toContain('<img');
    expect(document.getElementById('verification-sources').children).toHaveLength(0);
    expect(document.querySelector('img[src="x"]')).toBe(null);
  });
});
