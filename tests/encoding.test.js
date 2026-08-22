import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* robots.txt was once saved as UTF-16 LE. Crawlers cannot parse that, so the
   site read as having no robots.txt at all -- an encoding slip with the same
   effect as a missing file, and invisible in every editor that guesses well.
   These tests fail if any text file regresses that way.

   Note that a UTF-8 decode is not enough on its own: UTF-16 LE text that is
   pure ASCII decodes as valid UTF-8, because a NUL is a legal code point. The
   NUL check below is the one that actually catches it. */

const ROOT = path.resolve('.');
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|mp4|DS_Store)$/i;

function textFilesInRoot() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && !BINARY.test(e.name))
    .map((e) => e.name);
}

function isValidUtf8(buf) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function encodingProblem(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return 'UTF-16 LE byte order mark';
  if (buf.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return 'UTF-16 BE byte order mark';
  if (buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return 'UTF-8 byte order mark';
  if (buf.includes(0x00)) return 'NUL byte, so this is not plain UTF-8 text';
  if (!isValidUtf8(buf)) return 'not decodable as UTF-8';
  return null;
}

describe('repo root file encoding', () => {
  it('finds files to check', () => {
    expect(textFilesInRoot().length).toBeGreaterThan(5);
  });

  it('has no file in the repo root that is not plain UTF-8', () => {
    const offenders = textFilesInRoot()
      .map((name) => [name, encodingProblem(path.join(ROOT, name))])
      .filter(([, problem]) => problem !== null)
      .map(([name, problem]) => `${name}: ${problem}`);
    expect(offenders).toEqual([]);
  });
});

describe('robots.txt', () => {
  it('is plain UTF-8 with no byte order mark and no NULs', () => {
    expect(encodingProblem(path.join(ROOT, 'robots.txt'))).toBe(null);
  });

  it('still declares a user-agent and a sitemap', () => {
    const text = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
    expect(text).toMatch(/^User-agent:/m);
    expect(text).toMatch(/^Sitemap:/m);
  });
});

describe('tracked text files', () => {
  it('are all plain UTF-8 outside of known binary assets', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((f) => !BINARY.test(f) && fs.existsSync(f) && fs.statSync(f).isFile());
    const offenders = tracked
      .map((f) => [f, encodingProblem(f)])
      .filter(([, problem]) => problem !== null)
      .map(([f, problem]) => `${f}: ${problem}`);
    expect(offenders).toEqual([]);
  });
});
