import { describe, it, expect } from 'vitest';
import { shouldRejectNewUser } from '../assets/js/auth-rules.js';

describe('shouldRejectNewUser', () => {
  it('rejects a brand-new provider account when new accounts are not allowed', () => {
    // The whole point: picking a Google account that never signed up must not
    // quietly become a signup.
    expect(shouldRejectNewUser({ isNewUser: true }, {})).toBe(true);
    expect(shouldRejectNewUser({ isNewUser: true }, undefined)).toBe(true);
    expect(shouldRejectNewUser({ isNewUser: true }, { allowNewAccount: false })).toBe(true);
  });

  it('allows a brand-new account when the surface opted in', () => {
    expect(shouldRejectNewUser({ isNewUser: true }, { allowNewAccount: true })).toBe(false);
  });

  it('always allows an existing account through', () => {
    expect(shouldRejectNewUser({ isNewUser: false }, {})).toBe(false);
    expect(shouldRejectNewUser({ isNewUser: false }, { allowNewAccount: true })).toBe(false);
  });

  it('fails open only on a missing verdict, never on a positive one', () => {
    // If Firebase gives us nothing to go on, do not strand an existing learner.
    expect(shouldRejectNewUser(null, {})).toBe(false);
    expect(shouldRejectNewUser(undefined, {})).toBe(false);
    expect(shouldRejectNewUser({}, {})).toBe(false);
  });

  it('treats a truthy non-true isNewUser as not new', () => {
    // Guards against a stringly-typed value flipping the gate open by accident.
    expect(shouldRejectNewUser({ isNewUser: 'yes' }, {})).toBe(false);
    expect(shouldRejectNewUser({ isNewUser: 1 }, {})).toBe(false);
  });

  it('defaults closed: options must opt in explicitly', () => {
    [null, undefined, {}, { allowNewAccount: 0 }, { allowNewAccount: '' }].forEach((opts) => {
      expect(shouldRejectNewUser({ isNewUser: true }, opts)).toBe(true);
    });
  });
});
