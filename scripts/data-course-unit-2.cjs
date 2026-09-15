/* Python for Data, unit 2 — Cleaning and Shaping.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * Still pure standard library, for the same reason as unit 1: it is free, and
 * a signed-out visitor should never pay for the numpy and pandas wheels.
 *
 * The argument of the whole unit is that dirty data is dangerous because it is
 * quiet. Nothing raises; the average is simply wrong. So every lesson pairs
 * the fix with the check that shows the problem was there -- count before and
 * after, look at the distinct values -- and the exercises test the boundary
 * cases (a score exactly on the mark, "-5" that isdigit() rejects, "Ada" and
 * " ada ") where the quiet mistakes actually live.
 */

module.exports = {
  unit2: {
    title: 'Cleaning and Shaping',
    blurb: 'Fix missing values, wrong types and duplicate rows before you count anything.',
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'what-dirty-data-looks-like',
        title: 'What Dirty Data Looks Like',
        summary: 'The four problems you will meet in almost every real file.',
        objectives: [
          'Name the four problems that turn up in almost every real data file.',
          'Explain why each one produces a wrong answer rather than an error.',
          'Inspect a column with <code>set</code> and a count before summarising it.',
          'Write a small report of what is wrong with a table.',
        ],
        why: 'A crash tells you where to look. Dirty data does not crash: a blank score, a number stored as text, a student entered twice all flow through to an average that looks exactly as trustworthy as a correct one. Learning to look before you summarise is the habit that separates an analysis you can defend from one that is merely confident — and it costs a few lines.',
        sections: [
          {
            heading: 'Four recurring problems',
            intro: 'Almost every file you will ever clean has some mix of the same four faults.',
            steps: [
              {
                heading: 'Missing values and wrong types',
                prose: 'A missing value is a blank, or a marker like <code>"n/a"</code>, where a value should be. A wrong type is a number stored as text, which is every number read from a file until you convert it. Both break arithmetic, and some of those breaks are silent.',
                code: 'rows = [\n    {"name": "Ada", "score": "92"},\n    {"name": "Grace", "score": ""},\n    {"name": "Alan", "score": "n/a"},\n]\nfor r in rows:\n    print(repr(r["score"]))',
              },
              {
                heading: 'Duplicates and inconsistent spellings',
                prose: 'A duplicate is the same record twice, often from a file being appended to more than once. An inconsistent spelling is the same value written several ways — <code>"Maths"</code>, <code>"maths"</code>, <code>" maths"</code> — which a computer counts as three different things.',
                code: 'subjects = ["Maths", "maths", " maths", "Computing"]\nprint(len(set(subjects)), "distinct values for what is really 2 subjects")',
              },
            ],
          },
          {
            heading: 'Why they are dangerous',
            intro: 'The problem is not that dirty data is hard to work with. It is that it is easy to work with and wrong.',
            steps: [
              {
                heading: 'A wrong answer that looks right',
                prose: 'A duplicated row is counted twice. Nothing about the resulting average tells you so.',
                code: 'scores = [92, 88, 79, 92]   # Ada entered twice\nprint(round(sum(scores) / len(scores), 1))\n\nclean = [92, 88, 79]\nprint(round(sum(clean) / len(clean), 1))',
              },
              {
                heading: 'Text that adds',
                prose: 'Adding two strings does not raise — it joins them. A total computed over a text column is a long string of digits, and if it is then printed next to a label it can look like a number.',
                code: 'scores = ["92", "88"]\ntotal = scores[0] + scores[1]\nprint("total:", total)',
              },
            ],
          },
          {
            heading: 'Look before you summarise',
            intro: 'Three cheap looks catch most of the four problems.',
            steps: [
              {
                heading: 'The distinct values in a column',
                prose: '<code>set(column)</code> collapses a column to the values that actually occur. Blanks, markers and spelling variants all show up at once.',
                code: 'subjects = ["maths", "Maths", "art", "", "art", "n/a"]\nprint(sorted(set(subjects)))',
              },
              {
                heading: 'How many of each problem',
                prose: 'Counting blanks and repeats turns “the data seems a bit messy” into “4 of 300 scores are blank and 2 students appear twice”, which is something you can act on and report.',
                code: 'scores = ["92", "", "88", "", "79"]\nprint("blank:", scores.count(""), "of", len(scores))\n\nnames = ["Ada", "Grace", "Ada"]\nprint("repeated:", len(names) - len(set(names)))',
              },
            ],
            note: 'Looking is not cleaning. The next four lessons fix each problem in turn; this one is about knowing they are there before any number leaves your program.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Spot the four',
            prompt: 'Print the distinct values of <code>subject</code> and of <code>score</code>. Which of the four problems can you see?',
            starter: 'rows = [\n    {"name": "Ada", "subject": "Maths", "score": "92"},\n    {"name": "Grace", "subject": "maths ", "score": ""},\n    {"name": "Ada", "subject": "Maths", "score": "92"},\n    {"name": "Alan", "subject": "Art", "score": "n/a"},\n]\n\n# distinct subjects, then distinct scores:\n',
          },
          {
            after: 2,
            title: 'Count the blanks',
            prompt: 'Print how many scores are blank and how many names are repeated.',
            starter: 'names = ["Ada", "Grace", "Alan", "Grace", "Katherine"]\nscores = ["92", "", "79", "88", ""]\n\n# blanks:\n\n# repeated names:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Every new file', text: 'Look at the distinct values and count blanks and repeats before any summary leaves your program.', code: 'print(sorted(set(column)))' },
            { title: 'When a result surprises you', text: 'An unexpected average is more often dirty data than a discovery. Inspect before you explain.' },
          ],
          avoid: 'Do not start fixing as soon as you see a problem. Count all four kinds first, so you can report what was wrong and decide the order of the fixes.',
        },
        exercises: [
          {
            title: 'Count the missing scores',
            prompt: 'Write <code>count_missing(rows)</code> that returns how many rows have an empty string for <code>score</code>.',
            starter: 'def count_missing(rows):\n    # How many rows have "" for score?\n    return 0\n\nprint(count_missing([{"score": "92"}, {"score": ""}]))\n',
            call: 'count_missing([{"score": "92"}, {"score": ""}, {"score": ""}])',
            expectValue: '2',
            hidden: [
              { name: 'nothing missing counts zero', call: 'count_missing([{"score": "1"}])', expect: '0' },
              { name: 'an empty table counts zero', call: 'count_missing([])', expect: '0' },
              // `loops: true` is "any loop at all". A list of kinds means all of
              // them, and either a for loop or a comprehension is a fine answer
              // here, so naming both would demand the student write two.
              { name: 'the rows are actually inspected', kind: 'ast', requires: { loops: true, functions: ['count_missing'] }, describe: 'a loop or comprehension over the rows' },
            ],
            hint: 'An empty string is falsy, which is convenient and also a trap: 0 is falsy too. Compare against "" when that is what you mean.',
            correct: 'def count_missing(rows):\n    total = 0\n    for row in rows:\n        if row["score"] == "":\n            total = total + 1\n    return total\n',
            wrong: 'def count_missing(rows):\n    return 2\n',
          },
          {
            title: 'A dirt report',
            prompt: 'Write <code>dirt_report(rows)</code> for rows with <code>name</code> and <code>score</code> keys (both strings). Return a dictionary with three counts: <code>"blank"</code>, scores that are empty or only spaces; <code>"not_number"</code>, non-blank scores that are not made of digits; and <code>"repeated"</code>, how many rows repeat a name already seen.',
            starter: 'def dirt_report(rows):\n    # {"blank": ..., "not_number": ..., "repeated": ...}\n    return {}\n\nrows = [\n    {"name": "Ada", "score": "92"},\n    {"name": "Grace", "score": ""},\n    {"name": "Ada", "score": "n/a"},\n]\nprint(dirt_report(rows))\n',
            call: 'dirt_report([{"name": "Ada", "score": "92"}, {"name": "Grace", "score": ""}, {"name": "Ada", "score": "n/a"}])',
            expectValue: "{'blank': 1, 'not_number': 1, 'repeated': 1}",
            hidden: [
              { name: 'clean rows report nothing', call: 'dirt_report([{"name": "a", "score": "1"}, {"name": "b", "score": "2"}])', expect: "{'blank': 0, 'not_number': 0, 'repeated': 0}" },
              { name: 'spaces alone count as blank, not as a bad number', call: 'dirt_report([{"name": "a", "score": "   "}])', expect: "{'blank': 1, 'not_number': 0, 'repeated': 0}" },
              { name: 'a name seen three times repeats twice', call: 'dirt_report([{"name": "a", "score": "1"}, {"name": "a", "score": "1"}, {"name": "a", "score": "1"}])', expect: "{'blank': 0, 'not_number': 0, 'repeated': 2}" },
              { name: 'an empty table reports nothing', call: 'dirt_report([])', expect: "{'blank': 0, 'not_number': 0, 'repeated': 0}" },
            ],
            hint: 'Keep a set of names seen so far. For each row: if score.strip() == "" it is blank; elif not score.strip().isdigit() it is not a number; and if the name is already in the set it is a repeat.',
            correct: 'def dirt_report(rows):\n    report = {"blank": 0, "not_number": 0, "repeated": 0}\n    seen = set()\n    for row in rows:\n        score = row["score"].strip()\n        if score == "":\n            report["blank"] += 1\n        elif not score.isdigit():\n            report["not_number"] += 1\n        if row["name"] in seen:\n            report["repeated"] += 1\n        seen.add(row["name"])\n    return report\n',
            wrong: 'def dirt_report(rows):\n    report = {"blank": 0, "not_number": 0, "repeated": 0}\n    seen = set()\n    for row in rows:\n        score = row["score"]\n        if score == "":\n            report["blank"] += 1\n        elif not score.isdigit():\n            report["not_number"] += 1\n        if row["name"] in seen:\n            report["repeated"] += 1\n        seen.add(row["name"])\n    return report\n',
          },
        ],
        questions: [
          { id: 'd2-ddl-1', prompt: 'What makes dirty data dangerous rather than merely annoying?',
            choices: ['It is slow to load', 'Nothing raises — the summary is simply wrong', 'It cannot be opened', 'It uses more memory'], answer: 1,
            explain: 'A crash tells you where to look. A wrong average looks exactly like a right one.' },
          { id: 'd2-ddl-2', kind: 'multi',
            prompt: 'Which of these are the common problems in a real data file?',
            choices: ['Missing values', 'Numbers stored as text', 'Duplicate rows', 'The file being sorted'],
            answers: [0, 1, 2],
            explain: 'Sorting is a property of the file, not a fault in it. The other three change your answer without telling you.' },
          { id: 'd2-ddl-3', prompt: 'What is a quick way to see the variety in a column?',
            choices: ['len()', 'set()', 'sum()', 'sorted()'], answer: 1,
            explain: 'A set collapses the column to its distinct values, which is where "Maths", "maths" and "MATHS" become visible as three things.' },
          { id: 'd2-ddl-4', prompt: 'What does "92" + "88" evaluate to?',
            choices: ['180', '"180"', '"9288"', 'A TypeError'], answer: 2,
            explain: 'Adding strings joins them. That is why a text column can be "totalled" without any error.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'missing-values',
        title: 'Missing Values',
        summary: 'Find them, then decide between dropping and filling on purpose.',
        objectives: [
          'Count missing values, including markers like <code>"n/a"</code>, before deciding anything.',
          'Drop incomplete rows into a new list without touching the original.',
          'Fill missing values, and say what filling does to the summary.',
          'Choose between dropping and filling, and report which you chose.',
        ],
        why: 'Every real data set has gaps, and every choice about them changes the answer. Dropping loses rows and can bias what is left; filling keeps the rows and invents values. Neither is wrong, but doing either without noticing is. pandas’ <code>dropna</code> and <code>fillna</code> in unit 5 are these exact decisions, so they are worth understanding as decisions first.',
        sections: [
          {
            heading: 'Find them first',
            intro: 'You cannot decide what to do about a gap you have not counted.',
            steps: [
              {
                heading: 'Blanks and markers',
                prose: 'A missing value is not only <code>""</code>. Files use <code>"n/a"</code>, <code>"NA"</code>, <code>"-"</code> and more. Put every marker you know about in a set, and test membership after stripping spaces.',
                code: 'MISSING = {"", "n/a", "na", "-"}\n\nscores = ["92", "", "N/A", "88", " - "]\nmissing = [s for s in scores if s.strip().lower() in MISSING]\nprint(len(missing), "of", len(scores), "missing")',
              },
              {
                heading: 'How many changes the decision',
                prose: 'Two gaps in three hundred rows can be dropped without much thought. A column that is mostly empty is not a cleaning problem — it is a finding, and it should be reported.',
                code: 'scores = ["92", "", "", "", "88"]\nshare = scores.count("") / len(scores)\nprint(f"{share:.0%} of scores are missing")',
              },
            ],
          },
          {
            heading: 'Dropping',
            intro: 'Keep only the rows that have what you need.',
            steps: [
              {
                heading: 'Build a new list',
                prose: 'A comprehension with a condition builds the complete rows into a new list. The original stays as it was, which matters when another part of the analysis still needs it.',
                code: 'rows = [{"name": "Ada", "score": "92"}, {"name": "Grace", "score": ""}, {"name": "Alan", "score": "79"}]\n\ncomplete = [r for r in rows if r["score"] != ""]\nprint(len(rows), "->", len(complete))',
              },
              {
                heading: 'Never remove while looping',
                prose: 'Removing from a list while a <code>for</code> loop walks it shifts every later item one place left, and the loop steps over the item that moved into the gap. Two blanks in a row and one survives.',
                code: 'scores = ["92", "", "", "88"]\nfor s in scores:\n    if s == "":\n        scores.remove(s)\nprint(scores)   # one blank survived',
              },
            ],
          },
          {
            heading: 'Filling, and what it costs',
            intro: 'Filling keeps every row by putting a value where the gap was. The value you choose is a claim.',
            steps: [
              {
                heading: 'Fill with zero',
                prose: 'Zero says the student sat the test and scored nothing. If that is not true, it drags the average down.',
                code: 'scores = [92, None, 88]\nfilled = [s if s is not None else 0 for s in scores]\nprint(filled, sum(filled) / len(filled))',
              },
              {
                heading: 'Fill with the mean',
                prose: 'Filling with the mean of the known values leaves the mean unchanged — but every filled row sits exactly on it, so the data looks less spread out than it is.',
                code: 'scores = [92, None, 88, None]\nknown = [s for s in scores if s is not None]\nmean = sum(known) / len(known)\nfilled = [s if s is not None else mean for s in scores]\nprint(filled)\nprint(sum(filled) / len(filled))',
              },
            ],
            note: 'Whichever you choose, write it down next to the result: “2 of 30 scores were missing and were left out.” A reader cannot judge the number otherwise.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'All the markers',
            prompt: 'Count how many readings are missing, treating blanks, <code>"n/a"</code> in any case, and <code>"-"</code> as missing.',
            starter: 'readings = ["12.1", "N/A", "", "11.8", "-", "n/a", " "]\n\nMISSING = {"", "n/a", "-"}\n# how many are missing?\n',
          },
          {
            after: 2,
            title: 'Zero versus mean',
            prompt: 'Fill the gaps with 0, then with the mean of the known scores. Print the average each way and the lowest value each way.',
            starter: 'scores = [80, None, 90, None, 70]\n\n# filled with 0:\n\n# filled with the mean of the known scores:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Drop when the gaps are few', text: 'A handful of incomplete rows in a large table, in the column you are analysing.', code: 'complete = [r for r in rows if r["score"] != ""]' },
            { title: 'Fill when the fill value is true', text: 'Zero when zero really happened; a known default when the source documents one.' },
          ],
          avoid: 'Do not fill with the mean just to keep a row count, and never remove items from a list while looping over it. Build a new list, and say how many rows you dropped.',
        },
        exercises: [
          {
            title: 'Drop the incomplete rows',
            prompt: 'Write <code>drop_missing(rows)</code> that returns a new list containing only the rows whose <code>score</code> is not an empty string. Leave the original list alone.',
            starter: 'def drop_missing(rows):\n    # Return the rows that have a score.\n    return []\n\nprint(drop_missing([{"score": "92"}, {"score": ""}]))\n',
            call: 'len(drop_missing([{"score": "92"}, {"score": ""}, {"score": "88"}]))',
            expectValue: '2',
            hidden: [
              { name: 'nothing missing keeps everything', call: 'len(drop_missing([{"score": "1"}, {"score": "2"}]))', expect: '2' },
              { name: 'everything missing keeps nothing', call: 'len(drop_missing([{"score": ""}]))', expect: '0' },
              { name: 'the original list is not modified', call: '(lambda rows: (drop_missing(rows), len(rows))[-1])([{"score": ""}, {"score": "5"}])', expect: '2' },
            ],
            hint: 'Build a new list rather than removing from the one you were given. Removing while looping skips rows, and a caller who still needs their data will not thank you.',
            correct: 'def drop_missing(rows):\n    return [row for row in rows if row["score"] != ""]\n',
            wrong: 'def drop_missing(rows):\n    for row in rows:\n        if row["score"] == "":\n            rows.remove(row)\n    return rows\n',
          },
          {
            title: 'Fill with the mean',
            prompt: 'Write <code>fill_with_mean(scores)</code> for a list of numbers and <code>None</code>s. Return a new list where each <code>None</code> is replaced by the mean of the known values, rounded to one decimal place. If there are no known values, return the list unchanged.',
            starter: 'def fill_with_mean(scores):\n    # Replace each None with the mean of the known scores, rounded to 1 place.\n    return scores\n\nprint(fill_with_mean([92, None, 88]))\n',
            call: 'fill_with_mean([92, None, 88])',
            expectValue: '[92, 90.0, 88]',
            hidden: [
              { name: 'the mean uses only the known values, not zeros', call: 'fill_with_mean([10, None, None, 20])', expect: '[10, 15.0, 15.0, 20]' },
              { name: 'nothing missing changes nothing', call: 'fill_with_mean([1, 2])', expect: '[1, 2]' },
              { name: 'all missing is left alone', call: 'fill_with_mean([None, None])', expect: '[None, None]' },
              { name: 'the mean is rounded to one place', call: 'fill_with_mean([1, 1, 2, None])', expect: '[1, 1, 2, 1.3]' },
              { name: 'the caller\'s list is not changed', call: '(lambda v: (fill_with_mean(v), v)[1])([4, None])', expect: '[4, None]' },
            ],
            hint: 'known = [s for s in scores if s is not None]. If known is empty, return the list. Otherwise compute mean = round(sum(known) / len(known), 1) and build [mean if s is None else s for s in scores].',
            correct: 'def fill_with_mean(scores):\n    known = [s for s in scores if s is not None]\n    if not known:\n        return list(scores)\n    mean = round(sum(known) / len(known), 1)\n    return [mean if s is None else s for s in scores]\n',
            wrong: 'def fill_with_mean(scores):\n    if all(s is None for s in scores):\n        return list(scores)\n    zeroed = [0 if s is None else s for s in scores]\n    mean = round(sum(zeroed) / len(zeroed), 1)\n    return [mean if s is None else s for s in scores]\n',
          },
        ],
        questions: [
          { id: 'd2-mv-1', prompt: 'What does filling missing scores with the average do to the average?',
            choices: ['Nothing', 'Leaves it the same but makes the spread look smaller', 'Raises it', 'Lowers it'], answer: 1,
            explain: 'Every filled row sits exactly at the mean, so the mean does not move and the data looks less varied than it is.' },
          { id: 'd2-mv-2', prompt: 'Why is removing items from a list while looping over it a bug?',
            choices: ['It is slow', 'The loop skips the item after each removal', 'Python forbids it', 'It sorts the list'], answer: 1,
            explain: 'Removing shifts everything left while the loop moves right, so every removal steps over its neighbour.' },
          { id: 'd2-mv-3', kind: 'multi',
            prompt: 'When is dropping rows with missing values reasonable?',
            choices: ['Very few rows are affected', 'The missing column is the one you are analysing', 'Most of the file is missing that column', 'You need the row count to stay the same'],
            answers: [0, 1],
            explain: 'Dropping most of your data is not cleaning, it is selecting. If the column is mostly missing, that fact is the finding.' },
          { id: 'd2-mv-4', prompt: 'Filling a missing test score with 0 claims what?',
            choices: ['Nothing', 'That the student sat the test and scored nothing', 'That the score is unknown', 'That the row should be ignored'], answer: 1,
            explain: 'A fill value is a statement about the world. Zero is the right fill only when zero is what actually happened.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'fixing-types',
        title: 'Fixing Types',
        summary: 'Everything out of a file is text, and text sorts and adds in the wrong way.',
        objectives: [
          'Show how text that looks like a number compares, sorts and adds wrongly.',
          'Convert with <code>int</code> and <code>float</code>, and read the <code>ValueError</code> they raise.',
          'Write a safe converter with <code>try</code>/<code>except ValueError</code>.',
          'Clean common decorations — spaces, thousands separators, percent signs — before converting.',
        ],
        why: 'Every value from a CSV is a string, and strings behave like numbers just often enough to be dangerous: <code>"9" &gt; "10"</code> is True, and a sort puts 100 before 20. Converting types correctly on the way in is the step that makes every later sum, sort and comparison mean what it says. In pandas this is <code>to_numeric</code> and <code>dtype</code>, and the reasoning is identical.',
        sections: [
          {
            heading: 'Text that looks like a number',
            intro: 'The bug is quiet because every operation still works — it just does the text version.',
            steps: [
              {
                heading: 'Comparing and sorting as text',
                prose: 'Strings compare one character at a time. <code>"9"</code> beats <code>"10"</code> because <code>"9"</code> comes after <code>"1"</code>. A sorted text column puts <code>"100"</code> before <code>"20"</code>.',
                code: 'print("9" > "10")\nprint(sorted(["100", "20", "3"]))\nprint(sorted([100, 20, 3]))',
              },
              {
                heading: 'Adding as text',
                prose: '<code>+</code> joins strings. <code>sum</code> on a list of strings raises, which is at least loud; the <code>+</code> in a loop is not.',
                code: 'print("9" + "10")\nprint(int("9") + int("10"))',
              },
            ],
          },
          {
            heading: 'Converting safely',
            intro: '<code>int()</code> and <code>float()</code> convert text that is a clean number and raise <code>ValueError</code> on anything else.',
            steps: [
              {
                heading: 'What converts and what raises',
                prose: '<code>int</code> accepts surrounding spaces and a sign, but not a decimal point. <code>float</code> accepts decimals. Both raise on blanks and words.',
                code: 'print(int(" 42 "), int("-5"), float("3.5"))\n\nfor text in ["", "n/a", "3.5"]:\n    try:\n        print(int(text))\n    except ValueError as e:\n        print("ValueError:", e)',
              },
              {
                heading: 'Catch the failure, do not predict it',
                prose: 'Testing first with <code>isdigit()</code> looks tidy and misses <code>"-5"</code> and <code>"3.5"</code>. Trying the conversion and catching <code>ValueError</code> lets <code>int</code> itself decide what counts as a number.',
                code: 'def to_int(text, default=0):\n    try:\n        return int(text)\n    except ValueError:\n        return default\n\nprint(to_int("92"), to_int(""), to_int("-5"), to_int("n/a", None))\nprint("-5".isdigit())',
              },
            ],
            note: 'Catch <code>ValueError</code> by name. A bare <code>except:</code> also swallows typos in your own code, so a misspelled variable silently becomes the default.',
          },
          {
            heading: 'Clean, then convert',
            intro: 'Real files decorate numbers for human readers. Strip the decoration first.',
            steps: [
              {
                heading: 'Thousands separators and percent signs',
                prose: '<code>"1,250"</code> and <code>"85%"</code> are numbers to a person and errors to <code>float</code>. <code>replace</code> and <code>strip</code> remove what does not belong.',
                code: 'raw = ["1,250", " 85% ", "3.5"]\n\nfor text in raw:\n    cleaned = text.strip().replace(",", "").rstrip("%")\n    print(repr(text), "->", float(cleaned))',
              },
              {
                heading: 'Convert the whole column once',
                prose: 'Convert on the way in, into a new column of numbers, rather than calling <code>int()</code> at every place the value is used. Then every later line works with real numbers.',
                code: 'rows = [{"name": "Ada", "score": "92"}, {"name": "Grace", "score": "88"}]\n\nscores = [int(r["score"]) for r in rows]\nprint(scores, sum(scores), max(scores))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Sort it properly',
            prompt: 'Print the file order, the text sort, and a numeric sort of <code>raw</code>. Which one would put the wrong student first?',
            starter: 'raw = ["9", "85", "100", "72"]\n\nprint(raw)\nprint(sorted(raw))\n# a numeric sort:\n',
          },
          {
            after: 2,
            title: 'Decorated numbers',
            prompt: 'Convert every price to a float by stripping spaces, the pound sign and commas, then print the total.',
            starter: 'prices = ["£1,200", " £85 ", "£3,000.50"]\n\ntotal = 0\n# clean and convert each price\n\nprint(total)\n',
          },
        ],
        use: {
          cards: [
            { title: 'Straight after reading a file', text: 'Convert every numeric column on the way in, so every later line works with real numbers.', code: 'scores = [int(r["score"]) for r in rows]' },
            { title: 'Columns with decorations or junk', text: 'Strip commas, currency and percent signs, then try the conversion and catch ValueError by name.' },
          ],
          avoid: 'Do not test with isdigit() to decide what is a number — it rejects "-5" and "3.5". And do not use a bare except, which hides your own bugs along with bad data.',
        },
        exercises: [
          {
            title: 'A safe score converter',
            prompt: 'Write <code>to_score(text)</code> that returns the number in <code>text</code>, or <code>0</code> when it is not a number at all.',
            starter: 'def to_score(text):\n    # A whole number, or 0 when text is not one.\n    return 0\n\nprint(to_score("92"))\nprint(to_score(""))\n',
            call: 'to_score("92")', expectValue: '92',
            hidden: [
              { name: 'an empty string becomes 0', call: 'to_score("")', expect: '0' },
              { name: 'text that is not a number becomes 0', call: 'to_score("n/a")', expect: '0' },
              { name: 'a negative number still converts', call: 'to_score("-5")', expect: '-5' },
              { name: 'the failure is handled rather than avoided', kind: 'ast', requires: { handlers: ['ValueError'] }, describe: 'an except ValueError around the conversion' },
              { name: 'nothing is swallowed by a bare except', kind: 'ast', forbids: { handlers: ['bare'] }, describe: 'the specific error caught, not everything' },
            ],
            hint: 'Try the conversion and catch ValueError. Testing the string yourself with isdigit() misses the minus sign on negative numbers.',
            correct: 'def to_score(text):\n    try:\n        return int(text)\n    except ValueError:\n        return 0\n',
            wrong: 'def to_score(text):\n    if text.isdigit():\n        return int(text)\n    return 0\n',
          },
          {
            title: 'Parse a decorated amount',
            prompt: 'Write <code>parse_amount(text)</code> that turns strings like <code>"1,250"</code>, <code>" 85% "</code> or <code>"3.5"</code> into a float, by stripping spaces, removing commas and a trailing <code>%</code>. Return <code>None</code> when what is left is not a number.',
            starter: 'def parse_amount(text):\n    # Strip spaces, commas and a trailing %, then float(); None if it fails.\n    return None\n\nprint(parse_amount("1,250"))\nprint(parse_amount(" 85% "))\nprint(parse_amount("n/a"))\n',
            call: 'parse_amount("1,250")',
            expectValue: '1250.0',
            hidden: [
              { name: 'a percent sign and spaces are removed', call: 'parse_amount(" 85% ")', expect: '85.0' },
              { name: 'a decimal survives', call: 'parse_amount("3.5")', expect: '3.5' },
              { name: 'a negative amount survives', call: 'parse_amount("-1,000")', expect: '-1000.0' },
              { name: 'a word is not a number', call: 'parse_amount("n/a")', expect: 'None' },
              { name: 'a blank is not a number', call: 'parse_amount("  ")', expect: 'None' },
              { name: 'the failure is caught by name', kind: 'ast', requires: { handlers: ['ValueError'] }, describe: 'except ValueError around float()' },
            ],
            hint: 'cleaned = text.strip().replace(",", "").rstrip("%"), then try: return float(cleaned) except ValueError: return None.',
            correct: 'def parse_amount(text):\n    cleaned = text.strip().replace(",", "").rstrip("%")\n    try:\n        return float(cleaned)\n    except ValueError:\n        return None\n',
            wrong: 'def parse_amount(text):\n    cleaned = text.strip().replace(",", "").rstrip("%")\n    if cleaned.replace(".", "").isdigit():\n        return float(cleaned)\n    return None\n',
          },
        ],
        questions: [
          { id: 'd2-ft-1', prompt: 'Why is "9" > "10" True?',
            choices: ['It is a bug in Python', 'Text compares character by character, and "9" comes after "1"', 'Strings compare by length', 'It is False'], answer: 1,
            explain: 'Comparison stops at the first character that differs. This is why a column of numbers left as text sorts wrongly and nothing raises.' },
          { id: 'd2-ft-2', prompt: 'What does int("") raise?',
            choices: ['TypeError', 'ValueError', 'KeyError', 'Nothing, it returns 0'], answer: 1,
            explain: 'The type is right — it is a string, which int accepts — but the value is not a number, so it is a ValueError.' },
          { id: 'd2-ft-3', prompt: 'Why does isdigit() fail as a test for "is this a number"?',
            choices: ['It is slow', 'It is False for negative numbers and decimals', 'It only works on integers above zero', 'It raises on empty strings'], answer: 1,
            explain: '"-5".isdigit() is False, and so is "3.5".isdigit(). Trying the conversion and catching the failure covers what the test misses.' },
          { id: 'd2-ft-4', prompt: 'Why catch ValueError by name instead of using a bare except?',
            choices: ['It is faster', 'A bare except also hides unrelated bugs, like a misspelled variable', 'Python requires a name', 'A bare except does not catch ValueError'], answer: 1,
            explain: 'Catch the failure you expect. Anything else should still be loud.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'removing-duplicates',
        title: 'Removing Duplicates',
        summary: 'Deciding what counts as the same row is most of the work.',
        objectives: [
          'Remove exact repeats while keeping the original order.',
          'Normalise text with <code>strip</code> and <code>lower</code> so the same value is recognised.',
          'Keep the first spelling of each value while comparing a normalised key.',
          'Deduplicate whole records on the fields that identify them.',
        ],
        why: 'A student entered twice is counted twice, in every count and every average, and nothing warns you. Removing duplicates is easy; the real work is deciding what “the same” means — the same name in a different case, the same person with a different score — and that decision is the one pandas’ <code>drop_duplicates(subset=...)</code> will ask you to make explicitly in unit 6.',
        sections: [
          {
            heading: 'Exact duplicates',
            intro: 'Start with the easy case: values that are character-for-character identical.',
            steps: [
              {
                heading: 'set() removes repeats and the order',
                prose: 'A set keeps one of each value, which answers “how many distinct?” instantly. It has no order, so it is the wrong tool when the order of the rows means something.',
                code: 'names = ["Grace", "Ada", "Grace", "Alan"]\nprint(len(names), "rows,", len(set(names)), "distinct")\nprint(set(names))',
              },
              {
                heading: 'A seen-set keeps the order',
                prose: 'Walk the list, remember what you have already kept, and keep a value only the first time. The set is for fast membership tests; the list is the result.',
                code: 'names = ["Grace", "Ada", "Grace", "Alan"]\n\nseen = set()\nunique = []\nfor n in names:\n    if n not in seen:\n        seen.add(n)\n        unique.append(n)\nprint(unique)',
              },
            ],
          },
          {
            heading: 'Same value, written differently',
            intro: '“Ada”, “ada” and “ Ada ” are one person to a human and three strings to Python.',
            steps: [
              {
                heading: 'Normalise to compare',
                prose: '<code>strip()</code> removes surrounding spaces and <code>lower()</code> removes case. The normalised form is a key for deciding sameness.',
                code: 'names = ["Ada", "ada", " Ada ", "GRACE"]\nkeys = [n.strip().lower() for n in names]\nprint(keys)\nprint(len(set(keys)), "people")',
              },
              {
                heading: 'Compare the key, keep the original',
                prose: 'The output should still say <code>"Ada"</code>, not <code>"ada"</code>. Use the key for the seen-set and append the original text.',
                code: 'names = ["Ada", " ada ", "Grace", "GRACE"]\n\nseen = set()\nkept = []\nfor n in names:\n    key = n.strip().lower()\n    if key not in seen:\n        seen.add(key)\n        kept.append(n)\nprint(kept)',
              },
            ],
          },
          {
            heading: 'Duplicate records',
            intro: 'For whole rows, decide which fields identify a record. Two rows can share a name and be different people, or differ in a score and be the same entry typed twice.',
            steps: [
              {
                heading: 'A tuple of fields as the key',
                prose: 'Dictionaries cannot go in a set, but a tuple of their identifying values can. Choose the fields that define “the same record” — here, name and date.',
                code: 'rows = [\n    {"name": "Ada", "date": "2024-01-05", "score": 92},\n    {"name": "Ada", "date": "2024-01-05", "score": 92},\n    {"name": "Ada", "date": "2024-02-01", "score": 95},\n]\n\nseen = set()\nunique = []\nfor r in rows:\n    key = (r["name"], r["date"])\n    if key not in seen:\n        seen.add(key)\n        unique.append(r)\nprint(len(rows), "->", len(unique))',
              },
              {
                heading: 'Report what you removed',
                prose: 'The number of duplicates removed is part of the result. A few is housekeeping; a third of the file means something upstream is wrong.',
                code: 'names = ["Ada", "Grace", "Ada", "Ada"]\nunique = list(dict.fromkeys(names))\nprint("removed", len(names) - len(unique), "duplicates of", len(names), "rows")',
              },
            ],
            note: '<code>dict.fromkeys(values)</code> is a one-line order-keeping deduplication for exact matches — dictionary keys are unique and keep insertion order. It cannot normalise, so the loop is still the tool when case and spaces matter.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two ways to count',
            prompt: 'Print how many distinct cities there are with <code>set</code>, then print the distinct cities in their original order.',
            starter: 'cities = ["Leeds", "York", "Leeds", "Hull", "York"]\n\n# how many distinct:\n\n# distinct, in order:\n',
          },
          {
            after: 1,
            title: 'Messy subjects',
            prompt: 'Count the subjects as a human would, ignoring case and spaces.',
            starter: 'subjects = ["Maths", "maths ", "MATHS", "Art", " art", "Computing"]\n\n# how many real subjects?\n',
          },
        ],
        use: {
          cards: [
            { title: 'Files that were appended to', text: 'Exports run twice, forms submitted twice. Deduplicate on the fields that identify a record.', code: 'key = (r["name"], r["date"])' },
            { title: 'Text typed by people', text: 'Normalise case and spaces to see that “Ada” and “ ada ” are one value, while keeping the original spelling.' },
          ],
          avoid: 'Do not deduplicate on every field when two real records can share them, and do not use set() when order matters. Decide what “the same” means first.',
        },
        exercises: [
          {
            title: 'Unique names, first spelling kept',
            prompt: 'Write <code>unique_names(names)</code> that returns the names with duplicates removed, ignoring case and surrounding spaces, keeping the first spelling of each and the original order.',
            starter: 'def unique_names(names):\n    # Keep the first spelling of each name, in order.\n    return []\n\nprint(unique_names(["Ada", " ada ", "Grace"]))\n',
            call: 'unique_names(["Ada", " ada ", "Grace"])',
            expectValue: "['Ada', 'Grace']",
            hidden: [
              { name: 'nothing repeated keeps everything', call: 'unique_names(["Ada", "Grace"])', expect: "['Ada', 'Grace']" },
              { name: 'an empty list stays empty', call: 'unique_names([])', expect: '[]' },
              { name: 'the first spelling is the one kept', call: 'unique_names(["GRACE", "grace"])', expect: "['GRACE']" },
              { name: 'the order is not sorted away', call: 'unique_names(["Zoe", "Ada"])', expect: "['Zoe', 'Ada']" },
            ],
            hint: 'Two things at once: a normalised key for deciding sameness, and the original text for the output. Keep a set of keys you have already seen.',
            correct: 'def unique_names(names):\n    seen = set()\n    out = []\n    for n in names:\n        key = n.strip().lower()\n        if key not in seen:\n            seen.add(key)\n            out.append(n)\n    return out\n',
            wrong: 'def unique_names(names):\n    return sorted(set(n.strip().lower() for n in names))\n',
          },
          {
            title: 'Duplicate records by key',
            prompt: 'Write <code>dedupe(rows, fields)</code> that returns a new list of the rows (dictionaries) with repeats removed, where two rows are the same if they agree on every field named in <code>fields</code>. Keep the first of each and the original order.',
            starter: 'def dedupe(rows, fields):\n    # Rows are the same when they agree on every field in `fields`.\n    return []\n\nrows = [\n    {"name": "Ada", "date": "01-05", "score": 92},\n    {"name": "Ada", "date": "01-05", "score": 90},\n    {"name": "Ada", "date": "02-01", "score": 95},\n]\nprint(dedupe(rows, ["name", "date"]))\n',
            call: 'len(dedupe([{"name": "Ada", "date": "01-05", "score": 92}, {"name": "Ada", "date": "01-05", "score": 90}, {"name": "Ada", "date": "02-01", "score": 95}], ["name", "date"]))',
            expectValue: '2',
            hidden: [
              { name: 'the first of each is kept', call: 'dedupe([{"id": 1, "v": "first"}, {"id": 1, "v": "second"}], ["id"])', expect: "[{'id': 1, 'v': 'first'}]" },
              { name: 'only the named fields decide', call: 'len(dedupe([{"a": 1, "b": 1}, {"a": 1, "b": 2}], ["a", "b"]))', expect: '2' },
              { name: 'one field can be enough', call: 'len(dedupe([{"a": 1, "b": 1}, {"a": 1, "b": 2}], ["a"]))', expect: '1' },
              { name: 'order is kept', call: '[r["id"] for r in dedupe([{"id": 3}, {"id": 1}, {"id": 3}], ["id"])]', expect: '[3, 1]' },
              { name: 'no rows gives no rows', call: 'dedupe([], ["id"])', expect: '[]' },
            ],
            hint: 'For each row build key = tuple(row[f] for f in fields). Keep the row only if key is not already in a seen set, then add it.',
            correct: 'def dedupe(rows, fields):\n    seen = set()\n    out = []\n    for row in rows:\n        key = tuple(row[f] for f in fields)\n        if key not in seen:\n            seen.add(key)\n            out.append(row)\n    return out\n',
            wrong: 'def dedupe(rows, fields):\n    seen = set()\n    out = []\n    for row in rows:\n        key = row[fields[0]]\n        if key not in seen:\n            seen.add(key)\n            out.append(row)\n    return out\n',
          },
        ],
        questions: [
          { id: 'd2-rd-1', prompt: 'What does set() cost you when you use it to remove duplicates?',
            choices: ['Nothing', 'The order of the items', 'The values themselves', 'Speed'], answer: 1,
            explain: 'A set has no order, so the output comes back in an arrangement you did not choose. When order carries meaning, that is a loss.' },
          { id: 'd2-rd-2', prompt: 'Why normalise before comparing names?',
            choices: ['It is faster', '"Ada" and " ada " are one person and two strings', 'Python requires it', 'To sort them'], answer: 1,
            explain: 'Case and stray spaces are the two most common ways the same value arrives looking different.' },
          { id: 'd2-rd-blank', kind: 'blank',
            prompt: 'To decide sameness you compare a normalised ___, while keeping the original text for the output.',
            blanks: [{ accept: ['key', 'version', 'form', 'value'] }],
            explain: 'Two representations, one for deciding and one for showing. Collapsing them is what makes cleaned data unreadable.' },
          { id: 'd2-rd-4', prompt: 'Why use a tuple of fields, not the dictionary itself, as the key for duplicate records?',
            choices: ['Tuples are shorter', 'Dictionaries cannot go in a set, and you choose which fields define sameness', 'Tuples sort automatically', 'It removes more rows'], answer: 1,
            explain: 'A tuple is hashable, and building it from chosen fields is where you state what "the same record" means.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'filtering-rows',
        title: 'Filtering Rows',
        summary: 'Selecting the rows you meant, and noticing how many you dropped.',
        objectives: [
          'Write a filter as a comprehension with a condition.',
          'Combine conditions with <code>and</code>, <code>or</code> and <code>not</code> without changing their meaning.',
          'Get the boundary right: <code>&gt;=</code> versus <code>&gt;</code>.',
          'Check how many rows a filter kept, and name the rule in one place.',
        ],
        why: 'Filtering decides who is in the analysis, so it changes the answer more than any calculation after it. A pass mark written as <code>&gt;</code> instead of <code>&gt;=</code> fails everyone exactly on the line, and marks cluster on the line. The boolean masks you meet in numpy (unit 3) and pandas (unit 6) are the same conditions applied to a whole column at once — the logic, and the traps, carry straight over.',
        sections: [
          {
            heading: 'A filter is a comprehension with a test',
            intro: 'Keep the rows for which a condition is true.',
            steps: [
              {
                heading: 'One condition',
                prose: 'The <code>if</code> at the end of a comprehension keeps a row only when the test holds. The rows themselves come through whole.',
                code: 'rows = [{"name": "Ada", "score": 92}, {"name": "Alan", "score": 58}, {"name": "Grace", "score": 88}]\n\npassing = [r for r in rows if r["score"] >= 60]\nprint([r["name"] for r in passing])',
              },
              {
                heading: 'The boundary',
                prose: '“At least 60” includes 60. <code>&gt; 60</code> silently excludes everyone who scored exactly 60, and grades pile up at pass marks because people are marked up to them.',
                code: 'scores = [59, 60, 60, 61, 75]\nprint(len([s for s in scores if s >= 60]))\nprint(len([s for s in scores if s > 60]))',
              },
            ],
          },
          {
            heading: 'Combining conditions',
            intro: 'Real filters are rarely one test.',
            steps: [
              {
                heading: 'and, or, not',
                prose: '<code>and</code> needs both; <code>or</code> needs either; <code>not</code> flips a test. Parentheses make the intent visible and stop precedence surprises — <code>and</code> binds tighter than <code>or</code>.',
                code: 'rows = [\n    {"name": "Ada", "subject": "maths", "score": 92},\n    {"name": "Alan", "subject": "maths", "score": 58},\n    {"name": "Grace", "subject": "art", "score": 88},\n]\n\nprint([r["name"] for r in rows if r["subject"] == "maths" and r["score"] >= 60])\nprint([r["name"] for r in rows if r["subject"] == "art" or r["score"] < 60])',
              },
              {
                heading: 'A range',
                prose: 'Python allows a chained comparison, <code>60 &lt;= s &lt; 70</code>, which reads like the maths and avoids repeating the value.',
                code: 'scores = [55, 60, 65, 70, 90]\nprint([s for s in scores if 60 <= s < 70])',
              },
            ],
          },
          {
            heading: 'Name the rule, count the result',
            intro: 'Two habits that stop filters quietly going wrong.',
            steps: [
              {
                heading: 'Say the condition once',
                prose: 'If “passing” is written in three places, one of them will be edited and the others will not. Put the rule in a function and use it everywhere.',
                code: 'PASS_MARK = 60\n\ndef passed(row):\n    return row["score"] >= PASS_MARK\n\nrows = [{"score": 92}, {"score": 58}]\nprint(len([r for r in rows if passed(r)]))\nprint(len([r for r in rows if not passed(r)]))',
              },
              {
                heading: 'Check the counts add up',
                prose: 'A filter and its opposite should account for every row. If they do not, something in the data — a missing score, say — is falling through both.',
                code: 'rows = [{"score": 92}, {"score": 58}, {"score": None}]\n\nkept = [r for r in rows if r["score"] is not None and r["score"] >= 60]\ndropped = [r for r in rows if r["score"] is not None and r["score"] < 60]\nprint(len(kept), "+", len(dropped), "of", len(rows))',
              },
            ],
            note: 'Printing before-and-after counts is the cheapest check in data work. A filter that keeps 3 rows of 900 is almost always a mistake in the condition, not a finding.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Where the boundary bites',
            prompt: 'Count how many students pass with <code>&gt;= 50</code> and with <code>&gt; 50</code>. How many students does the wrong operator fail?',
            starter: 'scores = [48, 50, 50, 50, 51, 67, 50, 72]\n\n# with >=\n\n# with >\n',
          },
          {
            after: 1,
            title: 'Two conditions',
            prompt: 'Print the names of students who study computing and scored between 70 and 89 inclusive.',
            starter: 'rows = [\n    {"name": "Ada", "subject": "computing", "score": 92},\n    {"name": "Grace", "subject": "computing", "score": 88},\n    {"name": "Alan", "subject": "maths", "score": 75},\n    {"name": "Katherine", "subject": "computing", "score": 70},\n]\n\n# names:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Selecting who is in the analysis', text: 'Pass marks, date ranges, one category. Put the rule in one function and use it everywhere.', code: 'passing = [r for r in rows if r["score"] >= PASS_MARK]' },
            { title: 'Splitting a table into parts', text: 'A filter and its opposite, with a check that the counts add up to the whole.' },
          ],
          avoid: 'Do not test for a missing value with “if not score”: a real 0 is falsy too. Use “is None”, and print the before-and-after row counts.',
        },
        exercises: [
          {
            title: 'Rows at or above the mark',
            prompt: 'Write <code>passing(rows, mark)</code> that returns the rows whose <code>score</code> is at least <code>mark</code>.',
            starter: 'def passing(rows, mark):\n    # The rows scoring mark or above.\n    return []\n\nprint(len(passing([{"score": 92}, {"score": 58}], 60)))\n',
            call: 'len(passing([{"score": 92}, {"score": 58}, {"score": 88}], 60))',
            expectValue: '2',
            hidden: [
              { name: 'a score exactly on the mark passes', call: 'len(passing([{"score": 60}], 60))', expect: '1' },
              { name: 'nobody passes an empty table', call: 'len(passing([], 50))', expect: '0' },
              { name: 'the rows themselves come back', call: 'passing([{"score": 92}], 60)', expect: "[{'score': 92}]" },
              { name: 'the boundary is included', kind: 'ast', requires: { compares: ['GtE'] }, describe: 'a >= comparison, so the mark itself counts' },
            ],
            hint: 'At least the mark means the mark passes. A plain greater-than silently fails everyone sitting exactly on the boundary, which is where marks cluster.',
            correct: 'def passing(rows, mark):\n    return [row for row in rows if row["score"] >= mark]\n',
            wrong: 'def passing(rows, mark):\n    return [row for row in rows if row["score"] > mark]\n',
          },
          {
            title: 'Pass, fail and unknown',
            prompt: 'Write <code>split_results(rows, mark)</code> returning a tuple <code>(passed, failed, unknown)</code> of counts. A row passes when its <code>score</code> is at least <code>mark</code>, fails when it is below, and is unknown when the score is <code>None</code>. The three counts must add up to the number of rows.',
            starter: 'def split_results(rows, mark):\n    # (passed, failed, unknown) -- they must total len(rows).\n    return (0, 0, 0)\n\nrows = [{"score": 92}, {"score": 58}, {"score": None}]\nprint(split_results(rows, 60))\n',
            call: 'split_results([{"score": 92}, {"score": 58}, {"score": None}], 60)',
            expectValue: '(1, 1, 1)',
            hidden: [
              { name: 'the mark itself passes', call: 'split_results([{"score": 60}, {"score": 59}], 60)', expect: '(1, 1, 0)' },
              { name: 'a score of 0 is a fail, not unknown', call: 'split_results([{"score": 0}], 50)', expect: '(0, 1, 0)' },
              { name: 'the counts always total the rows', call: 'sum(split_results([{"score": 1}, {"score": None}, {"score": 99}, {"score": None}], 50))', expect: '4' },
              { name: 'an empty table is all zeros', call: 'split_results([], 50)', expect: '(0, 0, 0)' },
            ],
            hint: 'Test for None first, with "is None", so that 0 is not mistaken for missing. Only then compare with >= mark.',
            correct: 'def split_results(rows, mark):\n    passed = failed = unknown = 0\n    for row in rows:\n        score = row["score"]\n        if score is None:\n            unknown += 1\n        elif score >= mark:\n            passed += 1\n        else:\n            failed += 1\n    return (passed, failed, unknown)\n',
            wrong: 'def split_results(rows, mark):\n    passed = failed = unknown = 0\n    for row in rows:\n        score = row["score"]\n        if not score:\n            unknown += 1\n        elif score >= mark:\n            passed += 1\n        else:\n            failed += 1\n    return (passed, failed, unknown)\n',
          },
        ],
        questions: [
          { id: 'd2-fr-1', prompt: 'Why write a filter condition in one place rather than repeating it?',
            choices: ['It is faster', 'Two copies can disagree after an edit, and both look right', 'Python requires it', 'It uses less memory'], answer: 1,
            explain: 'The second copy is the one nobody updates. Two parts of the same analysis then quietly count different people.' },
          { id: 'd2-fr-2', prompt: 'What should you check immediately after filtering?',
            choices: ['The column types', 'How many rows you have left', 'The file size', 'Nothing'], answer: 1,
            explain: 'A filter that keeps three rows out of nine hundred is a finding in itself, and usually a mistake in the condition.' },
          { id: 'd2-fr-3', prompt: 'A pass mark of 60 with a > test does what?',
            choices: ['Nothing different', 'Fails everyone who scored exactly 60', 'Fails everyone below 61', 'Raises an error'], answer: 1,
            explain: 'Both wordings describe the same off-by-one, and marks bunch at the boundary, so it usually affects more rows than you would guess.' },
          { id: 'd2-fr-4', prompt: 'Why is "if not score" a bad test for a missing score?',
            choices: ['It is slow', 'A real score of 0 is falsy too, so it would be treated as missing', 'It raises on None', 'It is not valid Python'], answer: 1,
            explain: 'Use "score is None" when you mean missing. Falsiness lumps 0 in with None.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'sorting-and-ranking',
        title: 'Sorting and Ranking',
        summary: 'Order by the value you mean, and remember that sorted returns a new list.',
        objectives: [
          'Sort records by a field with <code>key</code> and <code>reverse</code>.',
          'Avoid the <code>.sort()</code>-returns-None trap.',
          'Break ties with a tuple key, including a descending number and an ascending name.',
          'Take the top n with a slice, and give tied values the same rank.',
        ],
        why: 'Most reports end in a ranking: the top five products, the lowest-scoring topics, the students who most need help. Getting the order right means sorting by the right field, in the right direction, with a sensible rule for ties — and not losing the list along the way. pandas’ <code>sort_values</code> and <code>nlargest</code> in unit 6 take the same arguments for the same reasons.',
        sections: [
          {
            heading: 'Sorting by a field',
            intro: 'Records do not have a natural order. <code>key</code> tells <code>sorted</code> which part of each one to compare.',
            steps: [
              {
                heading: 'key and reverse',
                prose: '<code>key</code> is a function applied to each item; its result is what gets compared. <code>reverse=True</code> puts the largest first.',
                code: 'rows = [{"name": "Ada", "score": 92}, {"name": "Alan", "score": 79}, {"name": "Grace", "score": 88}]\n\nbest = sorted(rows, key=lambda r: r["score"], reverse=True)\nprint([r["name"] for r in best])',
              },
              {
                heading: 'sorted versus .sort()',
                prose: '<code>sorted(x)</code> returns a new list and leaves <code>x</code> alone. <code>x.sort()</code> reorders <code>x</code> itself and returns <code>None</code>. So <code>names = names.sort()</code> throws the list away.',
                code: 'names = ["Grace", "Ada", "Alan"]\nprint(sorted(names), names)\n\nresult = names.sort()\nprint(result, names)',
              },
            ],
          },
          {
            heading: 'Ties',
            intro: 'Two rows with the same score come out in whatever order they went in. If the order matters, say what breaks the tie.',
            steps: [
              {
                heading: 'A tuple key',
                prose: 'Tuples compare element by element, so <code>key=lambda r: (r["score"], r["name"])</code> sorts by score and then by name within equal scores.',
                code: 'rows = [{"name": "Grace", "score": 88}, {"name": "Ada", "score": 88}, {"name": "Alan", "score": 79}]\n\nprint([r["name"] for r in sorted(rows, key=lambda r: (r["score"], r["name"]))])',
              },
              {
                heading: 'Descending numbers, ascending names',
                prose: '<code>reverse=True</code> would flip both parts. Negating the number flips only the score: highest score first, and alphabetical among ties.',
                code: 'rows = [{"name": "Grace", "score": 88}, {"name": "Ada", "score": 88}, {"name": "Katherine", "score": 99}]\n\nranked = sorted(rows, key=lambda r: (-r["score"], r["name"]))\nprint([(r["name"], r["score"]) for r in ranked])',
              },
            ],
          },
          {
            heading: 'Top n and ranks',
            intro: 'A ranking is a sort followed by either a slice or a numbering.',
            steps: [
              {
                heading: 'Slicing the top',
                prose: 'Sort, then take <code>[:n]</code>. A slice longer than the list simply returns what there is, so asking for the top ten of a short list needs no special case.',
                code: 'scores = [92, 79, 88]\nprint(sorted(scores, reverse=True)[:2])\nprint(sorted(scores, reverse=True)[:10])',
              },
              {
                heading: 'Equal scores, equal rank',
                prose: 'Numbering the sorted list with <code>enumerate</code> gives tied students different ranks. The fairer rule (“competition ranking”) gives a tie the same rank, and the next student the rank after all the tied ones: 1, 2, 2, 4.',
                code: 'scores = sorted([92, 88, 88, 79], reverse=True)\n\nranks = []\nfor i, s in enumerate(scores):\n    if i > 0 and s == scores[i - 1]:\n        ranks.append(ranks[-1])\n    else:\n        ranks.append(i + 1)\nprint(list(zip(scores, ranks)))',
              },
            ],
            note: 'Sorting a column that is still text sorts it alphabetically — <code>"100"</code> before <code>"20"</code>. Convert types (lesson 3) before sorting numbers.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Lowest first',
            prompt: 'Print the names from lowest score to highest, then check that <code>rows</code> itself is still in its original order.',
            starter: 'rows = [{"name": "Ada", "score": 92}, {"name": "Alan", "score": 79}, {"name": "Grace", "score": 88}]\n\n# names, lowest score first:\n\n# rows unchanged?\nprint([r["name"] for r in rows])\n',
          },
          {
            after: 1,
            title: 'Break the tie',
            prompt: 'Sort by score, highest first, with ties in alphabetical order by name.',
            starter: 'rows = [\n    {"name": "Zoe", "score": 90},\n    {"name": "Ada", "score": 90},\n    {"name": "Max", "score": 95},\n    {"name": "Bea", "score": 90},\n]\n\n# sorted names:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Top and bottom n', text: 'Leaderboards, the weakest topics, the largest orders: sorted with a key and reverse, then a slice.', code: 'sorted(rows, key=lambda r: r["score"], reverse=True)[:5]' },
            { title: 'Rankings people will read', text: 'A tuple key to break ties, and shared ranks for equal values.' },
          ],
          avoid: 'Do not write x = x.sort() — it replaces your list with None. And do not sort a column that is still text: "100" comes before "20".',
        },
        exercises: [
          {
            title: 'The top n names',
            prompt: 'Write <code>top_names(rows, n)</code> that returns the names of the <code>n</code> highest scorers, highest first.',
            starter: 'def top_names(rows, n):\n    # The n highest scorers, best first.\n    return []\n\nrows = [{"name": "Ada", "score": 92}, {"name": "Alan", "score": 79}]\nprint(top_names(rows, 1))\n',
            call: 'top_names([{"name": "Ada", "score": 92}, {"name": "Alan", "score": 79}, {"name": "Grace", "score": 88}], 2)',
            expectValue: "['Ada', 'Grace']",
            hidden: [
              { name: 'asking for none gives none', call: 'top_names([{"name": "Ada", "score": 92}], 0)', expect: '[]' },
              { name: 'asking for more than there is gives everyone', call: 'top_names([{"name": "Ada", "score": 92}], 5)', expect: "['Ada']" },
              { name: 'an empty table gives an empty list', call: 'top_names([], 3)', expect: '[]' },
              { name: 'the rows are sorted rather than assumed', kind: 'ast', requires: { calls: ['sorted'] }, describe: 'sorted() ordering the rows' },
            ],
            hint: 'sorted with a key and reverse, then take a slice. A slice longer than the list is not an error, which is why asking for five out of one works.',
            correct: 'def top_names(rows, n):\n    best = sorted(rows, key=lambda r: r["score"], reverse=True)\n    return [r["name"] for r in best[:n]]\n',
            wrong: 'def top_names(rows, n):\n    best = sorted(rows, key=lambda r: r["score"])\n    return [r["name"] for r in best[:n]]\n',
          },
          {
            title: 'A fair ranking',
            prompt: 'Write <code>rank(rows)</code> returning a list of <code>(rank, name, score)</code> tuples, highest score first, with ties broken alphabetically by name. Tied scores share a rank, and the next score takes the rank after all the tied ones (1, 2, 2, 4).',
            starter: 'def rank(rows):\n    # [(rank, name, score)] best first; ties share a rank; names break ties.\n    return []\n\nrows = [{"name": "Grace", "score": 88}, {"name": "Ada", "score": 92}, {"name": "Alan", "score": 88}]\nprint(rank(rows))\n',
            call: 'rank([{"name": "Grace", "score": 88}, {"name": "Ada", "score": 92}, {"name": "Alan", "score": 88}, {"name": "Zoe", "score": 70}])',
            expectValue: "[(1, 'Ada', 92), (2, 'Alan', 88), (2, 'Grace', 88), (4, 'Zoe', 70)]",
            hidden: [
              { name: 'no ties counts 1, 2, 3', call: '[r[0] for r in rank([{"name": "a", "score": 3}, {"name": "b", "score": 2}, {"name": "c", "score": 1}])]', expect: '[1, 2, 3]' },
              { name: 'everyone tied shares first place', call: '[r[0] for r in rank([{"name": "b", "score": 5}, {"name": "a", "score": 5}])]', expect: '[1, 1]' },
              { name: 'ties are in name order', call: '[r[1] for r in rank([{"name": "Zed", "score": 5}, {"name": "Amy", "score": 5}])]', expect: "['Amy', 'Zed']" },
              { name: 'no rows gives no ranks', call: 'rank([])', expect: '[]' },
            ],
            hint: 'Sort with key=lambda r: (-r["score"], r["name"]). Then walk it with enumerate: if the score equals the previous one, reuse the previous rank; otherwise the rank is i + 1.',
            correct: 'def rank(rows):\n    ordered = sorted(rows, key=lambda r: (-r["score"], r["name"]))\n    out = []\n    for i, r in enumerate(ordered):\n        if i > 0 and r["score"] == ordered[i - 1]["score"]:\n            place = out[-1][0]\n        else:\n            place = i + 1\n        out.append((place, r["name"], r["score"]))\n    return out\n',
            wrong: 'def rank(rows):\n    ordered = sorted(rows, key=lambda r: (-r["score"], r["name"]))\n    return [(i + 1, r["name"], r["score"]) for i, r in enumerate(ordered)]\n',
          },
        ],
        questions: [
          { id: 'd2-sr-1', prompt: 'What does names.sort() return?',
            choices: ['The sorted list', 'None', 'A copy', 'The original order'], answer: 1,
            explain: 'It sorts in place and returns None. Assigning that result over your variable replaces the list with nothing, and nothing raises until later.' },
          { id: 'd2-sr-2', prompt: 'What is the key argument to sorted for?',
            choices: ['The column names', 'Deciding which part of each item to order by', 'Reversing the order', 'Removing duplicates'], answer: 1,
            explain: 'It is a function applied to each item, and the result is what gets compared. That is how you sort dictionaries by one of their values.' },
          { id: 'd2-sr-3', prompt: 'What does a slice of [:5] do to a list of one item?',
            choices: ['Raises IndexError', 'Returns the one item', 'Returns five copies', 'Returns an empty list'], answer: 1,
            explain: 'Slices clamp rather than raise, which is why taking the top ten of a short list needs no special case.' },
          { id: 'd2-sr-4', prompt: 'How do you sort highest score first but alphabetical names within a tie?',
            choices: ['reverse=True with key (score, name)', 'key=lambda r: (-r["score"], r["name"])', 'Sort twice with reverse both times', 'It cannot be done'], answer: 1,
            explain: 'Negating the number reverses just that part of the tuple; reverse=True would reverse the names too.' },
        ],
      },
    ],
  },
};
