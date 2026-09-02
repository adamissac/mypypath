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

/* The slip the checks above cannot see.
 *
 * README.md shipped with "MIT <mojibake> see LICENSE" where an em dash was
 * meant. Every check above passes on it: there is no byte order mark, no NUL,
 * and it decodes as UTF-8 perfectly, because it *is* valid UTF-8 -- of the
 * wrong characters. A UTF-8 em dash was read back as cp1252, giving three
 * characters, and those three were then saved as UTF-8 again.
 *
 * PowerShell's Set-Content does this by default on this project's usual
 * machine, so it is not a hypothetical.
 *
 * The signatures below are written as escapes rather than as the characters
 * themselves, so that this file does not contain the very sequences it fails
 * other files for.
 */
const ch = (...codes) => String.fromCharCode(...codes);
const anyOf = (codes) => `[${codes.map((c) => ch(c)).join('')}]`;

/* Built from code points rather than written out, so that the source of this
   file stays pure ASCII. A file that spelled these sequences literally would
   be the first thing its own scan below reported. */
const MOJIBAKE = [
  // 'A with tilde' followed by what had been a UTF-8 continuation byte.
  [new RegExp(ch(0x00c3) + `[${ch(0x0080)}-${ch(0x00bf)}]`),
    'a UTF-8 byte pair read back as cp1252'],
  // The cp1252 reading of the punctuation block: em dash, curly quotes.
  [new RegExp(ch(0x00e2, 0x20ac)
    + anyOf([0x009c, 0x009d, 0x2122, 0x201a, 0x201c, 0x201d, 0x00a2, 0x0153])),
  'punctuation double-encoded through cp1252'],
  // A non-breaking space that went through the same trip.
  [new RegExp(ch(0x00c2) + `[${ch(0x00a0)}-${ch(0x00bf)}]`),
    'a non-breaking space double-encoded through cp1252'],
];

function mojibakeIn(file) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [pattern, why] of MOJIBAKE) {
    const found = text.match(pattern);
    if (found) {
      const line = text.slice(0, found.index).split('\n').length;
      return `line ${line}: ${why}`;
    }
  }
  return null;
}

describe('text that decoded through the wrong codepage', () => {
  it('catches the shape it exists for', () => {
    // The exact sequence README.md carried, so this test cannot quietly stop
    // matching anything at all.
    const spoiled = 'MIT ' + ch(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00e2, 0x20ac, 0x009d) + ' see';
    const intended = 'MIT ' + ch(0x2014) + ' see';
    expect(MOJIBAKE.some(([p]) => p.test(spoiled))).toBe(true);
    expect(MOJIBAKE.some(([p]) => p.test(intended))).toBe(false);
  });

  it('finds none in any tracked text file', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((f) => !BINARY.test(f) && fs.existsSync(f) && fs.statSync(f).isFile());
    // This file included: the escapes above are why it can scan itself without
    // reporting itself, and if that ever stops being true this is where it shows.
    const offenders = tracked
      .map((f) => [f, mojibakeIn(f)])
      .filter(([, problem]) => problem !== null)
      .map(([f, problem]) => `${f}: ${problem}`);
    expect(offenders).toEqual([]);
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
