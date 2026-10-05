import { describe, it, expect, vi } from 'vitest';
vi.mock('/assets/js/profile.js', () => ({ loadProfile: vi.fn(), invalidateProfile: vi.fn() }));
vi.mock('/assets/js/firebase-config.js', () => ({ db: {}, importFirebaseModule: vi.fn() }));
import { loadProfile } from '/assets/js/profile.js';
import { loadClassroomAlias, normalizeClassroomAlias, fallbackClassroomAlias } from '../assets/js/classroom-alias.js';

describe('classroom aliases', () => {
  it('never derives a missing alias from identity fields', async () => {
    loadProfile.mockResolvedValue({ displayName: 'Private Full Name', email: 'private@example.com', firstName: 'Private' });
    expect(await loadClassroomAlias('uid-123')).toBe(fallbackClassroomAlias('uid-123'));
    expect(await loadClassroomAlias('uid-123')).toMatch(/^Learner-[a-z0-9]+$/);
  });
  it('uses an explicitly chosen alias', async () => {
    loadProfile.mockResolvedValue({ classroomAlias: '  Python   Explorer ' });
    expect(await loadClassroomAlias('uid')).toBe('Python Explorer');
  });
  it('bounds aliases and refuses email, markup and control characters', () => {
    for (const value of ['', 'ab', 'a'.repeat(33), 'name@example.com', '<script>', 'abc\nxyz', null]) {
      expect(normalizeClassroomAlias(value)).toBe('');
    }
    expect(normalizeClassroomAlias('Coder_42-blue')).toBe('Coder_42-blue');
  });
  it('does not disguise a failed profile read as a selected alias', async () => {
    loadProfile.mockRejectedValue(new Error('offline'));
    await expect(loadClassroomAlias('uid')).rejects.toThrow('offline');
  });
});
