import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

/* The .xlsx export.
 *
 * These assert against a real workbook written to disk and unzipped, not
 * against the strings on the way in. "The library did not throw" is not
 * evidence that Excel can open the file, and every bug this format has is a
 * bug in the bytes.
 *
 * The dependency question is argued in the header of assets/js/xlsx-writer.js.
 * Short version: SheetJS Community silently drops cell styles and freeze
 * panes -- the two things a real .xlsx was wanted for -- so it was measured
 * and declined rather than waved through.
 */

const WRITER = fs.readFileSync('assets/js/xlsx-writer.js', 'utf8');
const EXPORT = fs.readFileSync('assets/js/classroom-export.js', 'utf8');

function loadDeps() {
  ['storage-keys', 'curriculum', 'classroom-core'].forEach((name) => {
    new Function(fs.readFileSync(`assets/js/${name}.js`, 'utf8')).call(window);
  });
  new Function(WRITER).call(window);
  new Function(EXPORT).call(window);
}

const DAY = 86400000;

/* A class with the shapes that break spreadsheets: a name that Excel would
   read as a formula, a name with XML metacharacters, an apostrophe, and a
   student who has done nothing at all. */
function student(uid, displayName, events, certificate) {
  return { uid, displayName, events: events || [], certificate: certificate || {} };
}

const NOW = Date.UTC(2026, 7, 31);

function sampleClass() {
  return [
    student('u1', '=cmd|\' /C calc\'!A0', [
      { type: 'unit.completed', at: NOW - 3 * DAY, payload: { unit: 1, verified: true } },
      { type: 'lesson.opened', at: NOW - 3 * DAY, payload: { lessonPath: '/units/unit-2/a.html', unit: 2 } },
    ]),
    student('u2', 'O\'Brien & <Sons>', [
      { type: 'unit.completed', at: NOW - 10 * DAY, payload: { unit: 1, verified: true } },
    ], { earned: true, requestedAt: NOW - 2 * DAY }),
    student('u3', 'Никита  ', []),
  ];
}

const OPTIONS = () => ({
  lessonsByUnit: { 1: ['/units/unit-1/a.html'], 2: ['/units/unit-2/a.html'] },
  totalUnits: 3,
  assignments: [
    { id: 'a1', title: 'Loops by Friday', units: [2], lessonPaths: [], dueAt: NOW - DAY },
    { id: 'a2', title: 'Read/Write [odd]: name*', units: [], lessonPaths: ['/units/unit-1/a.html'], dueAt: NOW + DAY },
  ],
  lessonTitles: { '/units/unit-1/a.html': 'Lesson A' },
  now: NOW,
});

let dir;
let file;
let parts = {};

/* An external unzip, not a JS reimplementation: a reimplementation that shares
   a misunderstanding with the writer would open an archive Excel refuses.
   `unzip` is not on a stock Windows box; `tar` is, and its libarchive backend
   reads zip and rejects a malformed one just as flatly. Either will do, and
   which one ran does not change what is being asserted. */
const UNZIP = ['unzip', 'tar'].find((exe) => {
  try {
    execFileSync(exe, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

function unzipTo(bytes) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pypath-xlsx-'));
  file = path.join(dir, 'book.xlsx');
  fs.writeFileSync(file, Buffer.from(bytes));
  const into = path.join(dir, 'x');
  fs.mkdirSync(into, { recursive: true });
  // If the archive is malformed this throws, which is exactly the signal wanted.
  if (UNZIP === 'unzip') {
    execFileSync('unzip', ['-o', '-q', file, '-d', into]);
  } else {
    execFileSync('tar', ['-xf', file, '-C', into]);
  }
  const out = {};
  const walk = (base, rel = '') => {
    for (const entry of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(base, next);
      else out[next] = fs.readFileSync(path.join(base, next), 'utf8');
    }
  };
  walk(path.join(dir, 'x'));
  return out;
}

beforeAll(() => {
  loadDeps();
  if (!UNZIP) return;
  const bytes = window.PyPathExport.masteryWorkbook(sampleClass(), OPTIONS());
  parts = unzipTo(bytes);
});

/* Skipped rather than failed on a machine with neither tool. A red that means
   "this computer has no unzip" teaches whoever sees it to ignore reds. */
if (!UNZIP) {
  // eslint-disable-next-line no-console
  console.warn('xlsx-export: neither unzip nor tar found, archive tests skipped');
}

describe('the file is a real workbook, not a CSV with a new extension', () => {
  it('is a ZIP that a real unzip can open', () => {
    // unzipTo would have thrown in beforeAll otherwise; this pins the intent.
    expect(Object.keys(parts).length).toBeGreaterThan(0);
  });

  it('starts with the ZIP magic number', () => {
    const head = fs.readFileSync(file).subarray(0, 4);
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('carries every part OOXML requires', () => {
    [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ].forEach((name) => expect(Object.keys(parts)).toContain(name));
  });

  it('has the three sheets, named', () => {
    expect(parts['xl/workbook.xml']).toMatch(/name="Mastery grid"/);
    expect(parts['xl/workbook.xml']).toMatch(/name="Assignments"/);
    expect(parts['xl/workbook.xml']).toMatch(/name="Roster"/);
    expect(Object.keys(parts).filter((n) => n.startsWith('xl/worksheets/')).length).toBe(3);
  });

  it('declares a content type and a relationship for each sheet', () => {
    // Excel refuses the file outright if these three lists disagree, and it
    // does so with a repair dialog rather than a useful error.
    for (let i = 1; i <= 3; i += 1) {
      expect(parts['[Content_Types].xml']).toContain(`/xl/worksheets/sheet${i}.xml`);
      expect(parts['xl/_rels/workbook.xml.rels']).toContain(`worksheets/sheet${i}.xml`);
    }
    expect(parts['xl/_rels/workbook.xml.rels']).toContain('styles.xml');
  });

  it('every part is well-formed XML', () => {
    // A stray & from a student's name is the realistic way this breaks.
    const { DOMParser } = window;
    Object.entries(parts).forEach(([name, text]) => {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) return;
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      expect(doc.querySelector('parsererror'), name).toBe(null);
    });
  });
});

describe('the formatting CSV could not carry', () => {
  it('freezes the header row on the grid', () => {
    expect(parts['xl/worksheets/sheet1.xml'])
      .toMatch(/<pane ySplit="1" topLeftCell="A2" [^>]*state="frozen"\/>/);
  });

  it('sets column widths', () => {
    expect(parts['xl/worksheets/sheet1.xml']).toMatch(/<cols><col min="1"[^>]*customWidth="1"/);
  });

  it('actually writes cell styles, which is the thing the library would not', () => {
    const styles = parts['xl/styles.xml'];
    expect(styles).toMatch(/<font><b\/>/);
    expect(styles).toMatch(/patternType="solid"/);
    // And a cell references one.
    expect(parts['xl/worksheets/sheet1.xml']).toMatch(/<c r="A1" t="inlineStr" s="1">/);
  });

  it('shades the gap states without relying on the shading to say so', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    // The word is present regardless of the fill: greyscale loses the scan
    // aid, never the fact.
    expect(sheet).toContain('Not opened');
    expect(sheet).toMatch(/s="4"/);
  });
});

describe('a student name cannot break or hijack the sheet', () => {
  it('writes a formula-looking name as text, with no formula element', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('=cmd|');
    // The structural guard: a formula lives in <f>, and there is not one.
    expect(sheet).not.toContain('<f>');
    // And the cell carrying it is an inline string.
    expect(sheet).toMatch(/t="inlineStr"><is><t xml:space="preserve">=cmd\|/);
  });

  it('does not carry the CSV apostrophe guard into a format that would show it', () => {
    // csvField() prefixes ' because Excel eats it on *input*. Stored in a
    // cell it is just a character, so the same rule here would rename every
    // student it touched.
    expect(parts['xl/worksheets/sheet1.xml']).not.toContain("<t xml:space=\"preserve\">'=cmd|");
  });

  it('escapes XML metacharacters rather than ending the document', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    // An apostrophe needs no escaping in element text; & and < end the
    // document if they are not escaped, and are.
    expect(sheet).toContain('O\'Brien &amp; &lt;Sons&gt;');
  });

  it('keeps trailing whitespace instead of silently trimming a name', () => {
    expect(parts['xl/worksheets/sheet3.xml']).toContain('<t xml:space="preserve">Никита  </t>');
  });

  it('the CSV export still applies its own, different guard', () => {
    // Both exports are hardened; they are hardened for different formats and
    // must not be collapsed into one rule.
    const csv = window.PyPathExport.masteryCsv(sampleClass(), OPTIONS());
    expect(csv).toContain("'=cmd|");
  });
});

describe('the sheets say what they are for', () => {
  it('the grid is the same rows the CSV export builds', () => {
    const rows = window.PyPathExport.masteryRows(sampleClass(), OPTIONS());
    expect(rows[0][0]).toBe('Student');
    // One column per unit, then one per assignment, then the certificate trio.
    expect(rows[0]).toContain('Unit 3');
    expect(rows[0]).toContain('Loops by Friday');
    expect(rows[0][rows[0].length - 3]).toBe('Certificate');
  });

  it('the assignments sheet counts the class, one row per piece of work', () => {
    const rows = window.PyPathExport.assignmentRows(sampleClass(), OPTIONS());
    expect(rows[0]).toEqual([
      'Assignment', 'Units', 'Lessons', 'Due', 'On time', 'Late', 'Not done', 'Records expired',
    ]);
    expect(rows.length).toBe(3);
    const loops = rows.find((r) => r[0] === 'Loops by Friday');
    // Three students, none of whom finished unit 2, and it is past due.
    expect(loops[6]).toBe(3);
  });

  it('the roster sheet carries the certificate state as a word', () => {
    const rows = window.PyPathExport.rosterRows(sampleClass(), OPTIONS());
    expect(rows[0]).toContain('Certificate');
    expect(rows.find((r) => r[0] === 'O\'Brien & <Sons>')[4]).toBe('awaiting approval');
  });

  it('a sheet name Excel would refuse is repaired rather than written', () => {
    // Assignment titles are teacher-typed and can contain any of \\ / ? * [ ] :
    expect(window.PyPathXlsx.safeSheetName('Read/Write [odd]: name*', 0))
      .toBe('Read Write  odd   name');
    expect(window.PyPathXlsx.safeSheetName('', 4)).toBe('Sheet 5');
    expect(window.PyPathXlsx.safeSheetName('x'.repeat(60), 0).length).toBe(31);
  });
});

describe('the writer itself', () => {
  it('computes a CRC32 that matches the known value', () => {
    // Without this the archive unzips on a forgiving tool and fails in Excel.
    const bytes = new TextEncoder().encode('123456789');
    expect(window.PyPathXlsx.crc32(bytes)).toBe(0xcbf43926);
  });

  it('names columns past Z the way a spreadsheet does', () => {
    const { colName } = window.PyPathXlsx;
    expect([colName(0), colName(25), colName(26), colName(51), colName(52)])
      .toEqual(['A', 'Z', 'AA', 'AZ', 'BA']);
  });

  it('strips control characters Excel refuses to open a file over', () => {
    expect(window.PyPathXlsx.xmlText('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(7) + 'c')).toBe('abc');
    // Tab, newline and return are legal XML and are kept.
    expect(window.PyPathXlsx.xmlText('a\tb\nc')).toBe('a\tb\nc');
  });

  it('gives two sheets that want the same name different ones', () => {
    const bytes = window.PyPathXlsx.build([
      { name: 'Same', rows: [['a']] },
      { name: 'Same', rows: [['b']] },
    ]);
    const p = unzipTo(bytes);
    expect(p['xl/workbook.xml']).toMatch(/name="Same"/);
    expect(p['xl/workbook.xml']).toMatch(/name="Same 2"/);
  });
});
