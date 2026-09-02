import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  score, specFor, havePython, setup, errorsForUnit,
} from './helpers/check-runner.js';

/* Unit 7 is where a check file can most easily grade the wrong thing.
 *
 * Every exercise here is about something that leaves no trace in stdout: a file
 * that was closed, a with statement that did the closing, an except that named
 * one error instead of all of them. Code that gets the printing right and the
 * habit wrong prints exactly what the correct answer prints, so the "rejects"
 * half of each pair below is the only thing making these checks mean anything.
 *
 * The wrong answers are therefore chosen to be output-identical wherever the
 * lesson allows it: the open() with no close(), the manual open/close where the
 * lesson asked for with, the bare except, the file contents hardcoded into the
 * program instead of read off the disk. */

beforeAll(() => {
  setup();
});

function spec(slug, exerciseId) {
  return specFor(7, slug, exerciseId);
}

/* [slug, exerciseId, a correct solution, a plausible wrong one].
 *
 * Every lesson in the unit has exactly one editor, `practice1`, so there is one
 * row per lesson that has an editor at all. introduction-file-handling has
 * none and is questions and reflections only, which is why it is absent. */
const FIXTURES = [
  ['opening-closing-files', 'practice1',
    'file = open("notes.txt", "w")\n'
    + 'file.write("Hello, World!")\n'
    + 'file.close()\n'
    + 'print("File created and closed successfully")\n',
    // Opened and never closed: the message is printed before the promise it
    // makes is true.
    'file = open("notes.txt", "w")\n'
    + 'file.write("Hello, World!")\n'
    + 'print("File created and closed successfully")\n'],

  ['reading-data-from-files', 'practice1',
    'file = open("scores.txt")\n'
    + 'lines = file.readlines()\n'
    + 'file.close()\n'
    + 'for line in lines:\n'
    + '    print(line.strip())\n'
    + 'print(len(lines))\n',
    // The lesson's own starter simulates a file with a string, and a student who
    // copies that shape passes the visible case without ever opening anything.
    'content = "80\\n95\\n72"\n'
    + 'lines = content.split("\\n")\n'
    + 'for line in lines:\n'
    + '    print(line)\n'
    + 'print(len(lines))\n'],

  ['writing-data-to-files', 'practice1',
    'names = ["Alice", "Bob", "Cleo"]\n'
    + 'file = open("names.txt", "w")\n'
    + 'for name in names:\n'
    + '    file.write(name + "\\n")\n'
    + 'file.close()\n'
    + 'print(f"Wrote {len(names)} names")\n',
    // Write mode inside the loop, so each pass empties what the last one wrote
    // and only Cleo survives. The printed count is right regardless.
    'names = ["Alice", "Bob", "Cleo"]\n'
    + 'for name in names:\n'
    + '    file = open("names.txt", "w")\n'
    + '    file.write(name + "\\n")\n'
    + '    file.close()\n'
    + 'print(f"Wrote {len(names)} names")\n'],

  ['working-with-file-paths', 'practice1',
    'from pathlib import Path\n'
    + '\n'
    + 'path = Path("data") / "report.txt"\n'
    + 'print(path.name)\n'
    + 'print(path.stem)\n'
    + 'print(path.suffix)\n'
    + 'print(path.parent.name)\n',
    // String surgery on a hardcoded separator. Right answer here, wrong answer
    // on any machine that separates folders the other way.
    'path = "data/report.txt"\n'
    + 'print(path.split("/")[-1])\n'
    + 'print(path.split("/")[-1].split(".")[0])\n'
    + 'print("." + path.split(".")[-1])\n'
    + 'print(path.split("/")[0])\n'],

  ['with-statement-file-operations', 'practice1',
    'with open("poem.txt") as file:\n'
    + '    lines = file.readlines()\n'
    + 'print(len(lines))\n',
    // The manual open/close the lesson exists to replace. It counts the lines
    // correctly and leaves the file open on any run that raises in between.
    'file = open("poem.txt")\n'
    + 'lines = file.readlines()\n'
    + 'file.close()\n'
    + 'print(len(lines))\n'],

  ['understanding-errors-exceptions', 'practice1',
    'def cause_error(kind):\n'
    + '    if kind == "zero":\n'
    + '        return 10 / 0\n'
    + '    if kind == "value":\n'
    + '        return int("abc")\n'
    + '    if kind == "type":\n'
    + '        return "hello" + 5\n'
    + '\n'
    + 'print("ready")\n',
    // The confusion the lesson is about: a string is the right type for int()
    // and the wrong value, so these two are the wrong way round.
    'def cause_error(kind):\n'
    + '    if kind == "zero":\n'
    + '        return 10 / 0\n'
    + '    if kind == "value":\n'
    + '        return "hello" + 5\n'
    + '    if kind == "type":\n'
    + '        return int("abc")\n'
    + '\n'
    + 'print("ready")\n'],

  ['try-except-blocks', 'practice1',
    'def read_total(filename):\n'
    + '    total = 0\n'
    + '    try:\n'
    + '        with open(filename) as file:\n'
    + '            for line in file:\n'
    + '                total += int(line)\n'
    + '    except FileNotFoundError:\n'
    + '        return 0\n'
    + '    return total\n'
    + '\n'
    + 'print(read_total("scores.txt"))\n'
    + 'print(read_total("missing.txt"))\n',
    // The bare except. Identical output, and it also returns 0 for a file full
    // of words, a typo in the loop, and every bug not written yet.
    'def read_total(filename):\n'
    + '    total = 0\n'
    + '    try:\n'
    + '        with open(filename) as file:\n'
    + '            for line in file:\n'
    + '                total += int(line)\n'
    + '    except:\n'
    + '        return 0\n'
    + '    return total\n'
    + '\n'
    + 'print(read_total("scores.txt"))\n'
    + 'print(read_total("missing.txt"))\n'],

  ['raising-customizing-exceptions', 'practice1',
    'class InvalidAgeError(Exception):\n'
    + '    pass\n'
    + '\n'
    + 'def validate_age(age):\n'
    + '    if age < 0:\n'
    + '        raise InvalidAgeError("age cannot be negative")\n'
    + '    if age > 150:\n'
    + '        raise InvalidAgeError("age cannot be above 150")\n'
    + '    return age\n'
    + '\n'
    + 'print(validate_age(30))\n',
    // Complains and hands the bad age back anyway. The caller gets a number it
    // has no way to know is wrong.
    'class InvalidAgeError(Exception):\n'
    + '    pass\n'
    + '\n'
    + 'def validate_age(age):\n'
    + '    if age < 0:\n'
    + '        print("Age cannot be negative!")\n'
    + '    if age > 150:\n'
    + '        print("Age cannot be greater than 150!")\n'
    + '    return age\n'
    + '\n'
    + 'print(validate_age(30))\n'],

  ['file-error-handling-real-projects', 'practice1',
    'def save_note(note, filename="notes.txt"):\n'
    + '    if not note:\n'
    + '        raise ValueError("Note cannot be empty")\n'
    + '    with open(filename, "a") as file:\n'
    + '        file.write(note + "\\n")\n'
    + '    print(f"Saved: {note}")\n'
    + '\n'
    + 'try:\n'
    + '    save_note("First note")\n'
    + '    save_note("")\n'
    + 'except ValueError as e:\n'
    + '    print(f"Invalid input: {e}")\n',
    // Write mode instead of append, and a bare except around the call. Prints
    // the same two lines and loses every note saved before this one.
    'def save_note(note, filename="notes.txt"):\n'
    + '    if not note:\n'
    + '        raise ValueError("Note cannot be empty")\n'
    + '    with open(filename, "w") as file:\n'
    + '        file.write(note + "\\n")\n'
    + '    print(f"Saved: {note}")\n'
    + '\n'
    + 'try:\n'
    + '    save_note("First note")\n'
    + '    save_note("")\n'
    + 'except:\n'
    + '    print("Invalid input: the note was empty")\n'],
];

describe('the Unit 7 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 7)).toEqual([]);
  });

  it('covers every Unit 7 lesson that has an editor', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const withEditors = manifest.lessons
      .filter((l) => l.unit === 7 && (l.exercises.length || l.editors.length))
      .map((l) => l.slug);
    const authored = fs
      .readdirSync('assets/data/checks/unit-7')
      .map((n) => n.replace(/\.json$/, ''));
    expect(withEditors.filter((s) => !authored.includes(s))).toEqual([]);
  });

  /* The lesson with no editor at all still gets the two things a page without
     an editor can carry, and would be silently unchecked if it did not. */
  it('gives the lesson with no editor questions and reflections instead', () => {
    const file = JSON.parse(
      fs.readFileSync('assets/data/checks/unit-7/introduction-file-handling.json', 'utf8')
    );
    expect(Object.keys(file).sort()).toEqual(['questions', 'reflections']);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(spec(slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });
});

describe.skipIf(!havePython)('every Unit 7 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(spec(slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(spec(slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 180000);

/* ------------------------------------------------- what the unit is for */

/* The two habits Unit 7 exists to build are the two a stdout check cannot see.
 * Both wrong answers below print exactly what the right one prints, so these
 * name the case that has to catch them rather than only counting failures. */
describe.skipIf(!havePython)('the habits, not the output', () => {
  it('refuses a manual open and close where the lesson asked for with', () => {
    const manual = 'file = open("poem.txt")\n'
      + 'lines = file.readlines()\n'
      + 'file.close()\n'
      + 'print(len(lines))\n';
    const s = score(spec('with-statement-file-operations', 'practice1'), manual);
    expect(s.failed).toContain('the file is opened with a with statement');
    expect(s.failed).toContain('nothing is closed by hand');
  });

  it('refuses a bare except where the lesson asked for the named error', () => {
    const bare = 'def read_total(filename):\n'
      + '    try:\n'
      + '        with open(filename) as file:\n'
      + '            return sum(int(line) for line in file)\n'
      + '    except:\n'
      + '        return 0\n'
      + '\n'
      + 'print(read_total("scores.txt"))\n'
      + 'print(read_total("missing.txt"))\n';
    const s = score(spec('try-except-blocks', 'practice1'), bare);
    expect(s.failed).toEqual(['the missing file is caught by name']);
  });

  /* A comment is not code, and this is the cheat the ast keys exist to stop:
     the manual version with the right words written above it in prose. */
  it('is not fooled by a comment that describes the with statement', () => {
    const cheat = '# with open("poem.txt") as file:\n'
      + 'file = open("poem.txt")\n'
      + 'lines = file.readlines()\n'
      + 'file.close()\n'
      + 'print(len(lines))\n';
    const s = score(spec('with-statement-file-operations', 'practice1'), cheat);
    expect(s.failed).toContain('the file is opened with a with statement');
  });

  /* The Unit 7 version of hardcoding: the answer typed into the program rather
     than read off the disk. It passes the visible case by construction. */
  it('refuses file contents pasted into the program', () => {
    const pasted = 'lines = ["80", "95", "72"]\n'
      + 'for line in lines:\n'
      + '    print(line)\n'
      + 'print(len(lines))\n';
    const s = score(spec('reading-data-from-files', 'practice1'), pasted);
    expect(s.failed).toContain('the numbers come out of the file, not out of the code');
    expect(s.failed).toContain('works on a shorter file');
  });

  it('refuses a file that was opened and never closed', () => {
    const leaked = 'file = open("notes.txt", "w")\n'
      + 'file.write("Hello, World!")\n'
      + 'print("File created and closed successfully")\n';
    const s = score(spec('opening-closing-files', 'practice1'), leaked);
    expect(s.failed).toContain('the file is closed, not just opened');
  });

  /* Write mode reopened once per name. The count printed at the end is right,
     and two of the three names are gone. */
  it('refuses a write that empties the file on every pass of the loop', () => {
    const truncating = 'names = ["Alice", "Bob", "Cleo"]\n'
      + 'for name in names:\n'
      + '    file = open("names.txt", "w")\n'
      + '    file.write(name + "\\n")\n'
      + '    file.close()\n'
      + 'print("Wrote 3 names")\n';
    const s = score(spec('writing-data-to-files', 'practice1'), truncating);
    expect(s.failed).toEqual(['names.txt has all three names, one per line']);
  });

  /* Right on this machine, wrong on half of them. The check is about which
     tool built the path, because the output cannot tell. */
  it('refuses a path glued together from a hardcoded separator', () => {
    const glued = 'path = "data/report.txt"\n'
      + 'print(path.split("/")[-1])\n'
      + 'print(path.split("/")[-1].split(".")[0])\n'
      + 'print("." + path.split(".")[-1])\n'
      + 'print(path.split("/")[0])\n';
    const s = score(spec('working-with-file-paths', 'practice1'), glued);
    expect(s.failed).toContain('pathlib does the joining');
    expect(s.failed).toContain('the four parts are read off the path object');
  });

  /* The one a student would never notice: the note is saved, the message is
     right, and every note saved before today is gone. */
  it('refuses a note saved in write mode over the notes already there', () => {
    const clobbering = 'def save_note(note, filename="notes.txt"):\n'
      + '    if not note:\n'
      + '        raise ValueError("Note cannot be empty")\n'
      + '    with open(filename, "w") as file:\n'
      + '        file.write(note + "\\n")\n'
      + '    print(f"Saved: {note}")\n'
      + '\n'
      + 'try:\n'
      + '    save_note("First note")\n'
      + '    save_note("")\n'
      + 'except ValueError as e:\n'
      + '    print(f"Invalid input: {e}")\n';
    const s = score(spec('file-error-handling-real-projects', 'practice1'), clobbering);
    expect(s.failed).toEqual(['the new note is added, not written over the old one']);
  });

  /* An error printed is an error the caller cannot act on, and only the raises
     cases can tell the two apart. */
  it('refuses a validator that prints its complaint instead of raising it', () => {
    const lenient = 'class InvalidAgeError(Exception):\n'
      + '    pass\n'
      + '\n'
      + 'def validate_age(age):\n'
      + '    if age < 0:\n'
      + '        print("too small")\n'
      + '    return age\n'
      + '\n'
      + 'print(validate_age(30))\n';
    const s = score(spec('raising-customizing-exceptions', 'practice1'), lenient);
    expect(s.failed).toContain('rejects a negative age');
    expect(s.failed).toContain('rejects an age above 150');
  });
});
