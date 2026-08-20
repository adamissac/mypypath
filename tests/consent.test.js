import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

let CONSENT;
let signup;

beforeAll(() => {
  new Function(fs.readFileSync('assets/js/consent.js', 'utf8')).call(window);
  CONSENT = window.PyPathConsent;
  signup = fs.readFileSync('signup.html', 'utf8');
});

describe('check', () => {
  it('passes only when the box is ticked', () => {
    expect(CONSENT.check(true)).toEqual({ ok: true, error: null });
  });

  it('fails when the box is not ticked', () => {
    expect(CONSENT.check(false).ok).toBe(false);
    expect(CONSENT.check(false).error).toBe(CONSENT.ERROR);
  });

  // A missing checkbox element reads as undefined, and "no element" must fail
  // closed rather than sail through as not-false.
  it('fails for anything that is not a literal true', () => {
    [undefined, null, 0, '', 'yes', 1, {}].forEach((v) => {
      expect(CONSENT.check(v).ok).toBe(false);
    });
  });
});

describe('record', () => {
  it('stamps the current terms version', () => {
    expect(CONSENT.record().termsVersion).toBe(CONSENT.TERMS_VERSION);
    expect(CONSENT.record().privacyVersion).toBe(CONSENT.TERMS_VERSION);
  });

  it('uses the supplied timestamp', () => {
    expect(CONSENT.record(1234).termsAcceptedAt).toBe(1234);
  });

  it('falls back to now for a nonsense timestamp', () => {
    const before = Date.now();
    const at = CONSENT.record(NaN).termsAcceptedAt;
    expect(at).toBeGreaterThanOrEqual(before);
  });
});

describe('hasAccepted', () => {
  it('accepts a record written by the current version', () => {
    expect(CONSENT.hasAccepted(CONSENT.record())).toBe(true);
  });

  it('rejects an account with no record at all', () => {
    expect(CONSENT.hasAccepted({})).toBe(false);
    expect(CONSENT.hasAccepted(null)).toBe(false);
  });

  // Someone who agreed to older wording has not agreed to this wording.
  it('rejects a record from an earlier terms version', () => {
    expect(CONSENT.hasAccepted({
      termsVersion: '2020-01-01', termsAcceptedAt: Date.now(),
    })).toBe(false);
  });

  it('rejects a version with no timestamp', () => {
    expect(CONSENT.hasAccepted({ termsVersion: CONSENT.TERMS_VERSION })).toBe(false);
  });
});

// The gate is only real if every path that creates an account runs through it.
describe('signup.html wiring', () => {
  it('has a required consent checkbox linking both documents', () => {
    expect(signup).toContain('id="signup-terms"');
    expect(signup).toContain('href="/terms.html"');
    expect(signup).toContain('href="/privacy.html"');
  });

  it('loads consent.js', () => {
    expect(signup).toContain('/assets/js/consent.js');
  });

  it('gates the email form on agreement', () => {
    expect(signup).toContain('if (!agreed()) return;');
  });

  it('gates Google and GitHub through the same check', () => {
    expect(signup).toContain('viaProvider(signInWithGoogle)');
    expect(signup).toContain('viaProvider(signInWithGitHub)');
  });
});
