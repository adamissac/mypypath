import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(() => {
  const src = fs.readFileSync('assets/js/schema-version.js', 'utf8');
  new Function(src).call(window);
});

describe('SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    const v = window.PyPathSchema.SCHEMA_VERSION;
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });

  it('starts at 1', () => {
    expect(window.PyPathSchema.SCHEMA_VERSION).toBe(1);
  });

  it('matches the version the generated manifest was written with', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    expect(manifest.schemaVersion).toBe(window.PyPathSchema.SCHEMA_VERSION);
  });
});

describe('stamp', () => {
  it('adds the version without mutating the input', () => {
    const input = { a: 1 };
    const out = window.PyPathSchema.stamp(input);
    expect(out).toEqual({ a: 1, schemaVersion: 1 });
    expect(input.schemaVersion).toBeUndefined();
  });

  it('overrides a version a caller tried to set by hand', () => {
    expect(window.PyPathSchema.stamp({ schemaVersion: 99 }).schemaVersion).toBe(1);
  });

  it('handles an empty object', () => {
    expect(window.PyPathSchema.stamp({})).toEqual({ schemaVersion: 1 });
  });
});
