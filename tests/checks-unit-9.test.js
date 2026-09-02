import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  score, specFor, havePython, setup, errorsForUnit,
} from './helpers/check-runner.js';

/* PyPath — Unit 9's authored checks, run for real.
 *
 * Same contract as Unit 1: every exercise is given a solution that must pass
 * and a wrong answer that must not, and the wrong answers are the mistakes
 * this unit actually produces -- the loop wearing recursion's name, json.load
 * where json.loads was meant, a date compared as a string, a nested loop where
 * one pass would do, a copy where a move was asked for.
 *
 * Two of the ten lessons are graded structurally rather than by running them:
 * apis-data-retrieval needs a network and data-visualization-matplotlib needs
 * a package that is not loaded, in the browser or here. Their cases are ast
 * cases, which parse the student's code and never execute it, so the pairs
 * below still run in this suite -- the correct fixture for the APIs lesson
 * makes no request, because nothing about it is ever called.
 */

const UNIT = 9;

function spec(slug, exerciseId) {
  return specFor(UNIT, slug, exerciseId);
}

/* A correct solution and a plausible wrong one for every Unit 9 exercise.
   Where a lesson's whole point is a property no output can reveal, the wrong
   answer deliberately produces the right output: the iterative count_down and
   the O(n^2) duplicate finder are both correct programs, and the ast case is
   the only thing between them and a pass. */
const FIXTURES = [
  ['recursion-problem-decomposition', 'practice1',
    'def count_down(n):\n'
    + '    if n <= 0:\n'
    + '        print("Done!")\n'
    + '        return\n'
    + '    print(n)\n'
    + '    count_down(n - 1)\n'
    + '\n'
    + 'count_down(5)\n',
    // Prints exactly the same six lines. Only the ast case can tell them apart.
    'def count_down(n):\n'
    + '    while n > 0:\n'
    + '        print(n)\n'
    + '        n -= 1\n'
    + '    print("Done!")\n'
    + '\n'
    + 'count_down(5)\n'],

  ['working-with-external-libraries', 'practice1',
    'import math\n'
    + '\n'
    + 'print(f"Square root of 16: {math.sqrt(16)}")\n'
    + 'print(f"Pi: {math.pi}")\n'
    + 'print(f"Cosine of 0: {math.cos(0)}")\n'
    + 'print(f"Factorial of 5: {math.factorial(5)}")\n',
    // The answers typed out rather than asked for, which also gets the float
    // formatting wrong in two places.
    'print("Square root of 16: 4")\n'
    + 'print("Pi: 3.14")\n'
    + 'print("Cosine of 0: 1")\n'
    + 'print("Factorial of 5: 120")\n'],

  ['apis-data-retrieval', 'practice1',
    'import requests\n'
    + '\n'
    + 'response = requests.get("https://api.example.com/data", timeout=5)\n'
    + 'if response.status_code == 200:\n'
    + '    data = response.json()\n'
    + '    print(data)\n'
    + 'else:\n'
    + '    print(f"Error: {response.status_code}")\n',
    // Asks for the data and then trusts whatever came back, as text.
    'import requests\n'
    + '\n'
    + 'response = requests.get("https://api.example.com/data")\n'
    + 'print(response.text)\n'],

  ['introduction-json-data-parsing', 'practice1',
    'import json\n'
    + '\n'
    + 'json_str = \'{"name": "Alice", "age": 25}\'\n'
    + 'data = json.loads(json_str)\n'
    + 'print(f"Name: {data[\'name\']}")\n'
    + 'print(f"Age: {data[\'age\']}")\n'
    + '\n'
    + 'person = {"name": "Bob", "age": 30}\n'
    + 'json_output = json.dumps(person)\n'
    + 'print(f"\\nJSON string: {json_output}")\n',
    // load wants a file to read from, so handing it a string raises before
    // anything is printed. The single letter is the whole bug.
    'import json\n'
    + '\n'
    + 'json_str = \'{"name": "Alice", "age": 25}\'\n'
    + 'data = json.load(json_str)\n'
    + 'print(f"Name: {data[\'name\']}")\n'
    + 'print(f"Age: {data[\'age\']}")\n'
    + '\n'
    + 'person = {"name": "Bob", "age": 30}\n'
    + 'json_output = json.dumps(person)\n'
    + 'print(f"\\nJSON string: {json_output}")\n'],

  ['efficiency-big-o-basics', 'practice1',
    'def has_duplicate(items):\n'
    + '    seen = set()\n'
    + '    for item in items:\n'
    + '        if item in seen:\n'
    + '            return True\n'
    + '        seen.add(item)\n'
    + '    return False\n',
    // Right answer, wrong cost. It passes every drawn case, which is exactly
    // why the nesting limit is there.
    'def has_duplicate(items):\n'
    + '    for i in range(len(items)):\n'
    + '        for j in range(i + 1, len(items)):\n'
    + '            if items[i] == items[j]:\n'
    + '                return True\n'
    + '    return False\n'],

  ['working-with-dates-times', 'practice1',
    'from datetime import datetime, timedelta\n'
    + '\n'
    + 'birthday = datetime(2000, 5, 15)\n'
    + 'print(birthday.strftime("%B %d, %Y"))\n'
    + '\n'
    + 'later = birthday + timedelta(days=365)\n'
    + 'print(later.strftime("%B %d, %Y"))\n'
    + '\n'
    + 'start = datetime(2024, 1, 1)\n'
    + 'end = datetime(2024, 1, 15)\n'
    + 'print((end - start).days)\n',
    // Dates held as strings and pulled apart with slicing. It prints the right
    // three lines for these three dates and nothing else.
    'from datetime import datetime, timedelta\n'
    + '\n'
    + 'birthday = "May 15, 2000"\n'
    + 'print(birthday)\n'
    + 'print("May 15, 2001")\n'
    + '\n'
    + 'start = "2024-01-01"\n'
    + 'end = "2024-01-15"\n'
    + 'print(int(end[8:]) - int(start[8:]))\n'],

  ['data-visualization-matplotlib', 'practice1',
    'import matplotlib.pyplot as plt\n'
    + '\n'
    + 'x = [1, 2, 3, 4, 5]\n'
    + 'y = [2, 4, 6, 8, 10]\n'
    + '\n'
    + 'plt.plot(x, y)\n'
    + 'plt.xlabel("X Axis")\n'
    + 'plt.ylabel("Y Axis")\n'
    + 'plt.title("My First Plot")\n'
    + 'plt.show()\n',
    // The lesson's own simulation, left in place. It prints the points and
    // draws nothing.
    'x = [1, 2, 3, 4, 5]\n'
    + 'y = [2, 4, 6, 8, 10]\n'
    + '\n'
    + 'for i in range(len(x)):\n'
    + '    print(f"  Point ({x[i]}, {y[i]})")\n'],

  ['basic-automation-python', 'practice1',
    'import os\n'
    + 'import shutil\n'
    + 'from pathlib import Path\n'
    + '\n'
    + 'for filename in os.listdir("."):\n'
    + '    path = Path(filename)\n'
    + '    if path.is_file():\n'
    + '        folder = Path(path.suffix[1:])\n'
    + '        folder.mkdir(exist_ok=True)\n'
    + '        shutil.move(str(path), str(folder / filename))\n'
    + '        print(f"Moved {filename} to {folder}/")\n',
    // Copies instead of moving, so the folders look right and the originals
    // are all still sitting where they were.
    'import os\n'
    + 'import shutil\n'
    + 'from pathlib import Path\n'
    + '\n'
    + 'for filename in os.listdir("."):\n'
    + '    path = Path(filename)\n'
    + '    if path.is_file():\n'
    + '        folder = Path(path.suffix[1:])\n'
    + '        folder.mkdir(exist_ok=True)\n'
    + '        shutil.copy(str(path), str(folder / filename))\n'
    + '        print(f"Copied {filename} to {folder}/")\n'],

  ['introduction-file-formats', 'practice1',
    'import csv\n'
    + '\n'
    + 'with open("data.csv", "r") as f:\n'
    + '    rows = list(csv.DictReader(f))\n'
    + '\n'
    + 'for row in rows:\n'
    + '    print(f"{row[\'name\']} is {row[\'age\']}")\n'
    + '\n'
    + 'with open("output.csv", "w", newline="") as f:\n'
    + '    writer = csv.writer(f)\n'
    + '    writer.writerow(["name", "age"])\n'
    + '    for row in rows:\n'
    + '        writer.writerow([row["name"], row["age"]])\n',
    // csv.reader hands back the header row as data, so the first line printed
    // is "name is age".
    'import csv\n'
    + '\n'
    + 'with open("data.csv", "r") as f:\n'
    + '    reader = csv.reader(f)\n'
    + '    for row in reader:\n'
    + '        print(f"{row[0]} is {row[1]}")\n'],

  ['applying-advanced-concepts', 'practice1',
    'import json\n'
    + 'from datetime import datetime\n'
    + '\n'
    + 'reading = {"temperature": 72, "humidity": 50}\n'
    + 'reading["collected_at"] = datetime(2024, 1, 15, 9, 30).isoformat()\n'
    + '\n'
    + 'with open("reading.json", "w") as f:\n'
    + '    json.dump(reading, f, indent=2)\n'
    + '\n'
    + 'with open("reading.json", "r") as f:\n'
    + '    saved = json.load(f)\n'
    + '\n'
    + 'print(saved["temperature"])\n'
    + 'print(saved["collected_at"])\n',
    // Formats the JSON and never saves it. The printed output is identical,
    // because it prints from the dictionary it still has in memory.
    'import json\n'
    + 'from datetime import datetime\n'
    + '\n'
    + 'reading = {"temperature": 72, "humidity": 50}\n'
    + 'reading["collected_at"] = datetime(2024, 1, 15, 9, 30).isoformat()\n'
    + '\n'
    + 'text = json.dumps(reading, indent=2)\n'
    + '\n'
    + 'print(reading["temperature"])\n'
    + 'print(reading["collected_at"])\n'],
];

beforeAll(() => {
  setup();
});

describe('the Unit 9 check files are valid', () => {
  /* Only Unit 9's problems. Units 3 to 10 are being authored in parallel, and
     this suite must not go red because a neighbour is mid-edit. */
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, UNIT)).toEqual([]);
  });

  it('covers every Unit 9 lesson', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const lessons = manifest.lessons.filter((l) => l.unit === UNIT).map((l) => l.slug);
    const authored = fs
      .readdirSync(`assets/data/checks/unit-${UNIT}`)
      .map((n) => n.replace(/\.json$/, ''));
    expect(lessons.filter((s) => !authored.includes(s))).toEqual([]);
  });

  it('has a fixture pair for every exercise it authored', () => {
    const covered = new Set(FIXTURES.map(([slug, id]) => `${slug}/${id}`));
    const missing = [];
    for (const name of fs.readdirSync(`assets/data/checks/unit-${UNIT}`)) {
      const slug = name.replace(/\.json$/, '');
      const file = JSON.parse(
        fs.readFileSync(`assets/data/checks/unit-${UNIT}/${name}`, 'utf8')
      );
      for (const id of Object.keys(file)) {
        if (id === 'questions' || id === 'reflections') continue;
        if (!covered.has(`${slug}/${id}`)) missing.push(`${slug}/${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(spec(slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });
});

describe.skipIf(!havePython)('every Unit 9 check, run against real Python', () => {
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

/* The two lessons whose wrong answer is a correct program.
 *
 * Stated separately from the pairs above because the pairs only assert that
 * something failed, and here it matters exactly what failed: the behaviour has
 * to pass and the structure has to catch it. If these ever start failing for a
 * different case, the check has stopped testing what it was written for. */
describe.skipIf(!havePython)('Unit 9 structure cases, against code that behaves correctly', () => {
  it('the iterative count_down prints the right thing and is still refused', () => {
    const loop = 'def count_down(n):\n'
      + '    while n > 0:\n'
      + '        print(n)\n'
      + '        n -= 1\n'
      + '    print("Done!")\n'
      + '\n'
      + 'count_down(5)\n';
    const s = score(spec('recursion-problem-decomposition', 'practice1'), loop);
    expect(s.failed).toContain('the counting is done by recursion, not by a loop');
    expect(s.failed).not.toContain('counts down from 5 and then stops');
  });

  it('the O(n^2) duplicate finder gets every drawn case right and is still refused', () => {
    const nested = 'def has_duplicate(items):\n'
      + '    for i in range(len(items)):\n'
      + '        for j in range(i + 1, len(items)):\n'
      + '            if items[i] == items[j]:\n'
      + '                return True\n'
      + '    return False\n';
    const s = score(spec('efficiency-big-o-basics', 'practice1'), nested);
    expect(s.failed).toEqual(['one pass, not a loop inside a loop']);
  });

  it('the string-dates answer prints the right three lines and is still refused', () => {
    const strings = 'from datetime import datetime, timedelta\n'
      + '\n'
      + 'birthday = "May 15, 2000"\n'
      + 'print(birthday)\n'
      + 'print("May 15, 2001")\n'
      + '\n'
      + 'start = "2024-01-01"\n'
      + 'end = "2024-01-15"\n'
      + 'print(int(end[8:]) - int(start[8:]))\n';
    const s = score(spec('working-with-dates-times', 'practice1'), strings);
    expect(s.failed).toContain('birthday is a date object, not a string that looks like one');
    expect(s.failed).not.toContain('prints the date, the date a year on, and the gap in days');
  });

  it('copying instead of moving fills the folders and is still refused', () => {
    const copies = 'import os\n'
      + 'import shutil\n'
      + 'from pathlib import Path\n'
      + '\n'
      + 'for filename in os.listdir("."):\n'
      + '    path = Path(filename)\n'
      + '    if path.is_file():\n'
      + '        folder = Path(path.suffix[1:])\n'
      + '        folder.mkdir(exist_ok=True)\n'
      + '        shutil.copy(str(path), str(folder / filename))\n';
    const s = score(spec('basic-automation-python', 'practice1'), copies);
    expect(s.failed).toEqual(['the originals were moved, not left behind']);
  });

  it('formatting the JSON without saving it prints the right thing and is still refused', () => {
    const unsaved = 'import json\n'
      + 'from datetime import datetime\n'
      + '\n'
      + 'reading = {"temperature": 72, "humidity": 50}\n'
      + 'reading["collected_at"] = datetime(2024, 1, 15, 9, 30).isoformat()\n'
      + '\n'
      + 'text = json.dumps(reading, indent=2)\n'
      + '\n'
      + 'print(reading["temperature"])\n'
      + 'print(reading["collected_at"])\n';
    const s = score(spec('applying-advanced-concepts', 'practice1'), unsaved);
    expect(s.failed).toContain('reading.json is actually on disk');
    expect(s.failed).not.toContain('prints the values it read back off disk');
  });

  /* The cheat the ast analyzer exists for, on this unit's own files. A comment
     is raw source and a regex cannot tell it from code; the parser discards it
     before a tree exists. */
  it('refuses the requests call written as a comment', () => {
    const cheat = '# import requests\n'
      + '# response = requests.get("https://api.example.com/data")\n'
      + '# data = response.json()\n'
      + 'print("done")\n';
    const s = score(spec('apis-data-retrieval', 'practice1'), cheat);
    expect(s.passed).toBe(0);
  });
});
