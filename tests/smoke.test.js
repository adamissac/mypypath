import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('provides a jsdom localStorage', () => {
    localStorage.setItem('probe', '1');
    expect(localStorage.getItem('probe')).toBe('1');
    localStorage.clear();
  });
});
