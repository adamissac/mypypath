/* Python for Data, unit 1 — Data in Plain Python.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * Pure standard library on purpose. numpy and pandas cost about twenty
 * megabytes of wheels on a cold start, and the two free units are the ones a
 * signed-out visitor reaches, so they teach the habits -- rows, records,
 * reading a file, summarising, grouping -- with lists, dicts and the csv
 * module. Every idea here comes back in pandas from unit 4 on, and the lessons
 * say so, so the later units read as a faster way to do something already
 * understood rather than as new magic.
 */

const LOOPS = (describe) => ({
  name: 'the rows are actually walked', kind: 'ast', requires: { loops: true }, describe,
});

module.exports = {
  unit1: {
    title: 'Data in Plain Python',
    blurb: 'Read CSV files and summarise rows with plain Python lists and dictionaries.',
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'what-is-data-analysis',
        checkpoint: {
          "title": "A boundary can change the answer",
          "prompt": "Before you run this, predict both lists. Does a score of exactly 60 count as a pass?",
          "code": "scores = [59, 60, 61]\nprint([score for score in scores if score > 60])\nprint([score for score in scores if score >= 60])",
          "output": "[61]\n[60, 61]",
          "explain": "The first condition excludes 60; the second includes it. Translate “60 or more” into >= before choosing a function. A calculation can run perfectly and still answer the wrong question.",
          "tryIt": "Change the passing threshold to 61. Predict which list becomes empty before running again."
        },
        title: 'What Data Analysis Actually Is',
        summary: 'Four steps that turn a file of rows into an answer you can defend.',
        objectives: [
          'Name the four steps every analysis goes through, in order.',
          'Turn a vague goal into a question a table can answer.',
          'Compute an answer from the data rather than reading it off and typing it.',
          'Say why the cleaning step is where most of the time and most of the mistakes go.',
        ],
        why: 'Every tool in this course — the csv module, numpy, pandas — is a faster way of doing one of four steps. Knowing the steps first is what stops the tools feeling like a pile of unrelated functions, and it is what lets you notice when an analysis skipped one. The most common bad result is not a wrong calculation; it is a correct calculation over data nobody looked at.',
        sections: [
          {
            heading: 'The shape of the work',
            intro: 'Every analysis, from a class spreadsheet to a national survey, makes the same four moves. The tools change; the moves do not.',
            steps: [
              {
                heading: 'Get, clean, summarise, explain',
                prose: 'Get the data into your program. Clean it until it means what you think it means. Summarise it into a few numbers. Explain what those numbers say — and what they do not. This unit covers getting and summarising with plain Python; unit 2 is entirely about cleaning.',
                code: 'rows = [\n    ["Ada", 92],\n    ["Grace", 88],\n    ["Alan", 79],\n]\n\n# Get: the rows are here.\n# Summarise: how many, and the best score.\nprint("students:", len(rows))\nprint("best:", max(r[1] for r in rows))',
              },
              {
                heading: 'Where the time actually goes',
                prose: 'The summary is often three lines. Getting the data fit to summarise — finding the blank score, the name typed twice, the number stored as text — is most of the job. It is also where mistakes hide, because nothing raises when a column is dirty; the average simply comes out wrong.',
                code: 'scores = ["92", "88", ""]\n\n# One blank value, and a sum over the column fails outright.\n# Worse cases do not fail at all -- that is unit 2.\nprint(len(scores), "values, one of them empty:", scores.count(""))',
              },
            ],
          },
          {
            heading: 'An answer needs a question first',
            intro: 'A table on its own says nothing. It answers questions, and only the ones precise enough to be computed.',
            steps: [
              {
                heading: 'Vague goals and computable questions',
                prose: '"Is this class doing well?" cannot be computed until you decide what well means. "What is the average score, and how many students are below 60?" can. Writing the question down first is also what stops you fishing — a table always contains some pattern if you look long enough.',
                code: 'scores = [92, 88, 79, 55]\n\nprint("average:", sum(scores) / len(scores))\nprint("below 60:", len([s for s in scores if s < 60]))',
              },
              {
                heading: 'The question decides the summary',
                prose: '"Who scored highest?" wants <code>max</code>. "How spread out are the scores?" wants the smallest and largest together. "How many passed?" wants a count. Choosing the summary is the second half of asking the question.',
                code: 'scores = [92, 88, 79, 55]\n\nprint("highest:", max(scores))\nprint("range:", min(scores), "to", max(scores))\nprint("passed:", len([s for s in scores if s >= 60]))',
              },
            ],
          },
          {
            heading: 'Compute it, do not copy it',
            intro: 'The single habit that separates analysis code from a calculator: the answer is derived from the data every time the code runs.',
            steps: [
              {
                heading: 'A typed answer is right once',
                prose: '<code>print(3)</code> is correct today. Add a fourth student and it is silently wrong, and nothing in the code tells you. <code>print(len(rows))</code> is correct for every version of the data.',
                code: 'rows = [["Ada", 92], ["Grace", 88], ["Alan", 79], ["Katherine", 99]]\n\nprint(3)          # stale the moment the data changed\nprint(len(rows))  # still right',
              },
              {
                heading: 'Reading a column out of rows',
                prose: 'To take the largest score you need the scores on their own. A generator over the rows pulls one position out of each — the same idea the next lesson calls a column.',
                code: 'rows = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\n\nprint(max(r[1] for r in rows))\nprint(min(r[1] for r in rows))',
              },
            ],
            note: 'Later, pandas will do <code>df["score"].max()</code>. It is the same move: select a column, then summarise it. Nothing in this unit is thrown away.',
          },
        ],
        practices: [
          {
            after: 1,
            title: 'Pick the summary',
            prompt: 'Each comment is a question. Replace each <code>None</code> with the expression that answers it from <code>scores</code>.',
            starter: 'scores = [92, 88, 79, 55, 61]\n\n# How many students are there?\nprint(None)\n\n# What is the lowest score?\nprint(None)\n\n# How many scored 60 or more?\nprint(None)\n',
          },
          {
            after: 2,
            title: 'Break the typed answer',
            prompt: 'Run it once. Then add a fifth row to <code>rows</code> and run it again. Which line went stale?',
            starter: 'rows = [["Ada", 92], ["Grace", 88], ["Alan", 79], ["Katherine", 99]]\n\nprint("typed:", 4)\nprint("computed:", len(rows))\n',
          },
        ],
        use: {
          cards: [
            { title: 'A question with a computable answer', text: 'When you can say what number would settle it — a count, an average, a highest — the four steps apply directly.', code: 'print(len([s for s in scores if s < 60]))' },
            { title: 'Before you trust a number someone quotes', text: 'Walking back through get, clean, summarise and explain is how you check someone else’s figure as well as your own.' },
          ],
          avoid: 'Do not start summarising before you have written the question down. A table always offers some pattern, and a pattern found by browsing is not a finding.',
        },
        exercises: [
          {
            title: 'Count and top score',
            prompt: 'Three students and their scores are in <code>rows</code>. Print how many students there are, then the highest score.',
            starter: 'rows = [\n    ["Ada", 92],\n    ["Grace", 88],\n    ["Alan", 79],\n]\n\n# Print the number of students, then the highest score.\n',
            expect_stdout: '3\n92',
            hidden: [
              { name: 'the count is measured, not typed', kind: 'ast', requires: { calls: ['len'] }, describe: 'len() counting the rows' },
              { name: 'the highest score is found, not typed', kind: 'ast', requires: { calls: ['max'] }, describe: 'max() finding the top score' },
            ],
            hint: 'print(3) is right today and wrong the moment a fourth student arrives. Ask len() and max() for the answers so the code still holds when the data changes.',
            correct: 'rows = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\nprint(len(rows))\nprint(max(r[1] for r in rows))\n',
            wrong: 'print(3)\nprint(92)\n',
          },
          {
            title: 'Answer three questions',
            prompt: 'Write <code>quick_look(scores)</code> that returns a tuple <code>(count, lowest, passed)</code>: how many scores there are, the lowest one, and how many are 60 or more. The input is a non-empty list of numbers. Count zero scores as observations, and include exactly 60 as a pass. Return the tuple; do not just print it.',
            starter: 'def quick_look(scores):\n    # (how many, the lowest, how many are 60 or above)\n    return (0, 0, 0)\n\nprint(quick_look([92, 88, 55]))\n',
            call: 'quick_look([92, 88, 55])',
            expectValue: '(3, 55, 2)',
            hidden: [
              {"name":"zero is a real observation","call":"quick_look([0, 60, 60])","expect":"(3, 0, 2)"},
              { name: 'a score of exactly 60 passes', call: 'quick_look([60, 59])', expect: '(2, 59, 1)' },
              { name: 'everyone can fail', call: 'quick_look([10, 20, 30])', expect: '(3, 10, 0)' },
              { name: 'a single score is its own lowest', call: 'quick_look([75])', expect: '(1, 75, 1)' },
              { name: 'the answers are computed', kind: 'ast', requires: { calls: ['len', 'min'] }, describe: 'len() and min() over the scores' },
            ],
            hint: 'len(scores) and min(scores) give the first two. For the third, count the scores where s >= 60 — a comprehension inside len() does it in one line.',
            correct: 'def quick_look(scores):\n    passed = len([s for s in scores if s >= 60])\n    return (len(scores), min(scores), passed)\n',
            wrong: 'def quick_look(scores):\n    passed = len([s for s in scores if s > 60])\n    return (len(scores), min(scores), passed)\n',
          },
        ],
        questions: [
          { id: 'd1-wda-1', prompt: 'Which step of an analysis usually takes the longest?',
            choices: ['Getting the data', 'Cleaning it', 'Summarising it', 'Presenting it'], answer: 1,
            explain: 'Real data arrives with missing values, wrong types and duplicates. The summarising is often three lines; getting the data fit to summarise is the job.' },
          { id: 'd1-wda-2', prompt: 'Why write the question down before looking at the data?',
            choices: ['It is a formality', 'Without it you will find something that looks interesting and call it a finding', 'Python requires it', 'It makes the code faster'], answer: 1,
            explain: 'A table will always yield some pattern if you look long enough. Deciding the question first is what makes the answer mean anything.' },
          { id: 'd1-wda-3', kind: 'order',
            prompt: 'Put the four steps of an analysis in order.',
            items: ['Clean it', 'Get the data', 'Say what it means', 'Summarise it'],
            answer: [1, 0, 3, 2],
            explain: 'Summarising dirty data produces a confident wrong answer, which is the worst of the four outcomes.' },
          { id: 'd1-wda-4', prompt: 'Why is print(len(rows)) better than print(3) when there are three rows?',
            choices: ['It is shorter', 'It stays correct when the data changes', 'print(3) raises an error', 'len is faster than a literal'], answer: 1,
            explain: 'A typed answer is a copy of the result that nothing keeps in step with the data.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'rows-and-columns-with-lists',
        checkpoint: {
          "title": "Trace one row at a time",
          "prompt": "Which names will remain, and in what order? Trace the condition for each row before reading the answer.",
          "code": "table = [[\"Zoe\", 0, \"art\"], [\"Ada\", 85, \"maths\"], [\"Kai\", 70, \"art\"]]\nnames = [row[0] for row in table if row[2] == \"art\"]\nprint(names)",
          "output": "['Zoe', 'Kai']",
          "explain": "The condition uses column 2, while the result takes column 0. Zoe still belongs to art even though her score is zero. A filter keeps the original order unless you explicitly sort it.",
          "tryIt": "Change Zoe’s subject to maths, then add a new art row. Predict the new list."
        },
        title: 'Rows and Columns with Lists',
        summary: 'A table is a list of lists, and a column is what you pull out of it.',
        objectives: [
          'Store a small table as a list of row lists.',
          'Read one row, one cell, and one column out of it.',
          'Build a column with a comprehension over the rows.',
          'Explain the weakness of position-based rows that the next lesson fixes.',
        ],
        why: 'Every table you will ever analyse — a CSV, a spreadsheet, a DataFrame — is rows and columns. Building one out of plain lists first shows exactly what a table is underneath, so when pandas hands you <code>df["score"]</code> you know it is doing the comprehension in this lesson for you, and why it needed column names to do it.',
        sections: [
          {
            heading: 'A table is a list of rows',
            intro: 'The simplest possible table: an outer list, holding one inner list per row, each inner list holding the values in a fixed order.',
            steps: [
              {
                heading: 'One index for a row, two for a cell',
                prose: 'The first index picks the row. The second picks a position inside that row. Row first, then column — the same order a spreadsheet uses.',
                code: 'table = [\n    ["Ada", 92, "maths"],\n    ["Grace", 88, "computing"],\n    ["Alan", 79, "maths"],\n]\n\nprint(table[0])      # the first row\nprint(table[0][1])   # the second cell of the first row\nprint(table[2][2])   # the third cell of the third row',
              },
              {
                heading: 'The shape of the table',
                prose: '<code>len(table)</code> is the number of rows. <code>len(table[0])</code> is the number of columns, assuming every row has the same length — an assumption real files break more often than you would hope.',
                code: 'table = [["Ada", 92, "maths"], ["Grace", 88, "computing"]]\n\nprint("rows:", len(table))\nprint("columns:", len(table[0]))',
              },
            ],
          },
          {
            heading: 'A column is a comprehension',
            intro: 'There is no column object in a list of lists. To work on one, you build a new list out of the same position in every row.',
            steps: [
              {
                heading: 'Pulling one position out of every row',
                prose: '<code>[row[1] for row in table]</code> reads as “the second value of each row”. That is what a column is.',
                code: 'table = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\n\nscores = [row[1] for row in table]\nnames = [row[0] for row in table]\nprint(names)\nprint(scores)',
              },
              {
                heading: 'Summarise the column, not the table',
                prose: 'Once the column is a list of numbers, every summary from the last lesson works on it.',
                code: 'table = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\n\nscores = [row[1] for row in table]\nprint(sum(scores) / len(scores))',
              },
              {
                heading: 'A column with a condition',
                prose: 'Adding an <code>if</code> keeps only some rows while taking the column — the names of everyone who studies maths, say.',
                code: 'table = [["Ada", 92, "maths"], ["Grace", 88, "computing"], ["Alan", 79, "maths"]]\n\nmaths = [row[0] for row in table if row[2] == "maths"]\nprint(maths)',
              },
            ],
          },
          {
            heading: 'The weakness: positions mean nothing',
            intro: 'This representation works, and it has one serious problem.',
            steps: [
              {
                heading: 'row[1] does not say what it is',
                prose: 'You have to remember that position 1 is the score. Six months later, or for someone else reading the code, <code>row[1]</code> is a mystery.',
                code: 'row = ["Ada", 92, "maths"]\nprint(row[1])   # the score -- but only if you remember',
              },
              {
                heading: 'A new column moves everything',
                prose: 'Insert an age column after the name and every <code>row[1]</code> now reads the age. Nothing raises; the average is just the average age. The next lesson fixes this by giving every value a name.',
                code: 'table = [["Ada", 36, 92], ["Grace", 45, 88]]\n\n# Written before the age column existed. Still runs. Now wrong.\nscores = [row[1] for row in table]\nprint(sum(scores) / len(scores))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Find the cell',
            prompt: 'Print Alan’s subject using two indexes, then print the number of columns in the table.',
            starter: 'table = [\n    ["Ada", 92, "maths"],\n    ["Grace", 88, "computing"],\n    ["Alan", 79, "maths"],\n]\n\n# Alan\'s subject:\n\n# The number of columns:\n',
          },
          {
            after: 1,
            title: 'Two columns',
            prompt: 'Build <code>names</code> and <code>scores</code> as columns, then print the name of the student with the highest score using <code>scores.index</code>.',
            starter: 'table = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\n\nnames = []\nscores = []\n\n# The name at the same position as the highest score:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Small, fixed-shape tables', text: 'A handful of rows whose column order you control — test data, a few results typed into a script.', code: 'scores = [row[1] for row in table]' },
            { title: 'Data that arrives as positions', text: 'csv.reader and many APIs hand back rows as lists; a comprehension is how you get a column out of them.' },
          ],
          avoid: 'Do not keep list rows for anything long-lived or shared. The moment a column is added or reordered, every row[1] silently reads the wrong thing — switch to dictionaries.',
        },
        exercises: [
          {
            title: 'Pull out a column',
            prompt: 'Pull the second column out of <code>table</code> into a list called <code>scores</code>, then print it.',
            starter: 'table = [\n    ["Ada", 92],\n    ["Grace", 88],\n    ["Alan", 79],\n]\n\n# Build scores from the second column, then print it.\n',
            expect_stdout: '[92, 88, 79]',
            hidden: [
              { name: 'scores really is a list of the three numbers', call: 'scores', expect: '[92, 88, 79]' },
              { name: 'the column is taken from the table', kind: 'ast', requires: { loops: ['comprehension'] }, describe: 'a comprehension over the rows' },
            ],
            hint: 'One value per row, always at the same position. A comprehension over the rows is the shortest way to say that.',
            correct: 'table = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\nscores = [row[1] for row in table]\nprint(scores)\n',
            wrong: 'table = [["Ada", 92], ["Grace", 88], ["Alan", 79]]\nscores = [92, 88, 79]\nprint(scores)\n',
          },
          {
            title: 'A column, filtered',
            prompt: 'Write <code>names_in(table, subject)</code> returning the names, in table order, of the rows whose third column equals <code>subject</code>. Each row is <code>[name, score, subject]</code>.',
            starter: 'def names_in(table, subject):\n    # Names of the rows studying `subject`.\n    return []\n\ntable = [["Ada", 92, "maths"], ["Grace", 88, "computing"], ["Alan", 79, "maths"]]\nprint(names_in(table, "maths"))\n',
            call: 'names_in([["Ada", 92, "maths"], ["Grace", 88, "computing"], ["Alan", 79, "maths"]], "maths")',
            expectValue: "['Ada', 'Alan']",
            hidden: [
              { name: 'a subject nobody takes gives an empty list', call: 'names_in([["Ada", 92, "maths"]], "art")', expect: '[]' },
              { name: 'the order of the table is kept', call: 'names_in([["Zoe", 1, "art"], ["Ada", 2, "art"]], "art")', expect: "['Zoe', 'Ada']" },
              { name: 'an empty table gives an empty list', call: 'names_in([], "maths")', expect: '[]' },
              { name: 'the column is filtered with a comprehension or loop', kind: 'ast', requires: { loops: true }, describe: 'the rows walked and tested' },
            ],
            hint: 'The subject is at position 2 and the name at position 0: [row[0] for row in table if row[2] == subject].',
            correct: 'def names_in(table, subject):\n    return [row[0] for row in table if row[2] == subject]\n',
            wrong: 'def names_in(table, subject):\n    return sorted(row[0] for row in table if row[2] == subject)\n',
          },
        ],
        questions: [
          { id: 'd1-rcl-1', prompt: 'In a list of lists, what does table[2][0] give you?',
            choices: ['The third row', 'The first cell of the third row', 'The third column', 'The first row'], answer: 1,
            explain: 'The first index picks the row, the second picks the position within it. Row first, then column.' },
          { id: 'd1-rcl-2', prompt: 'What is the weakness of storing rows as plain lists?',
            choices: ['They are slow', 'You have to remember what each position means', 'They cannot hold text', 'They cannot be sorted'], answer: 1,
            explain: 'row[1] tells you nothing about what it holds. Six months later, neither does the code.' },
          { id: 'd1-rcl-blank', kind: 'blank',
            prompt: 'To collect one column you build a new list with a ___ over the rows.',
            blanks: [{ accept: ['comprehension', 'list comprehension', 'loop', 'for loop'] }],
            explain: 'A comprehension states the shape of the result, which is what makes a column extraction read as one idea.' },
          { id: 'd1-rcl-4', prompt: 'A column is inserted at position 1 of every row. What happens to code that reads row[1] as the score?',
            choices: ['It raises IndexError', 'It silently reads the new column instead', 'Python adjusts the index', 'It still reads the score'], answer: 1,
            explain: 'Nothing raises, which is the danger. The summary is computed over the wrong column and looks perfectly plausible.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'records-as-dictionaries',
        checkpoint: {
          "title": "Missing is different from zero",
          "prompt": "One record has no score; another has a score of zero. Which values should contribute to the average?",
          "code": "records = [{\"score\": 0}, {\"name\": \"Ada\"}, {\"score\": 80}]\nvalues = [r[\"score\"] for r in records if \"score\" in r]\nprint(values)\nprint(sum(values) / len(values))",
          "output": "[0, 80]\n40.0",
          "explain": "Membership checks whether a field exists. A truthiness check such as if r.get(\"score\") would discard the real zero and report 80.0. Filling the missing field with zero would instead divide by three. Those are different assumptions, not interchangeable shortcuts.",
          "tryIt": "Add another record with score 40. Work out the new denominator before running."
        },
        title: 'Records as Dictionaries',
        summary: 'Name the columns, and the code stops depending on their order.',
        objectives: [
          'Store each row as a dictionary keyed by column name.',
          'Loop over records and read fields by name.',
          'Handle a missing field with <code>.get</code> and a default, on purpose.',
          'Convert a list-of-lists table into a list of records.',
        ],
        why: 'Naming the columns is the single change that makes analysis code survive contact with real files, where columns get added, reordered and occasionally left out. It is also exactly the shape <code>csv.DictReader</code> hands you in the next lesson, and the shape pandas builds a DataFrame from, so this is the representation the rest of the course assumes.',
        sections: [
          {
            heading: 'A row that says what it holds',
            intro: 'Replace the list for each row with a dictionary. The keys are the column names; the values are the cells.',
            steps: [
              {
                heading: 'Reading by name',
                prose: '<code>row["score"]</code> says what it reads. It keeps working when someone inserts a column, because there are no positions to shift.',
                code: 'rows = [\n    {"name": "Ada", "score": 92},\n    {"name": "Grace", "score": 88},\n]\n\nfor row in rows:\n    print(row["name"], row["score"])',
              },
              {
                heading: 'Order no longer matters',
                prose: 'Two records with their keys written in different orders are the same record. The code that reads them does not care.',
                code: 'a = {"name": "Ada", "score": 92}\nb = {"score": 92, "name": "Ada"}\n\nprint(a == b)\nprint(a["score"], b["score"])',
              },
            ],
          },
          {
            heading: 'Working with a list of records',
            intro: 'Everything from the last lesson still applies — columns are comprehensions, filters are conditions — but now every access has a name.',
            steps: [
              {
                heading: 'A column by name',
                prose: 'The same comprehension, with a key instead of an index.',
                code: 'rows = [{"name": "Ada", "score": 92}, {"name": "Grace", "score": 88}, {"name": "Alan", "score": 79}]\n\nscores = [r["score"] for r in rows]\nprint(scores)\nprint(sum(scores) / len(scores))',
              },
              {
                heading: 'Filtering records',
                prose: 'A condition on one field selects whole records, so every other field comes along with them.',
                code: 'rows = [{"name": "Ada", "score": 92}, {"name": "Grace", "score": 88}, {"name": "Alan", "score": 79}]\n\nstrong = [r for r in rows if r["score"] >= 85]\nfor r in strong:\n    print(r["name"])',
              },
              {
                heading: 'From lists to records',
                prose: 'When data arrives as rows of lists and a header, <code>zip</code> pairs each column name with its value, and <code>dict</code> turns the pairs into a record.',
                code: 'header = ["name", "score"]\ntable = [["Ada", 92], ["Grace", 88]]\n\nrows = [dict(zip(header, row)) for row in table]\nprint(rows)',
              },
            ],
          },
          {
            heading: 'Missing fields, on purpose',
            intro: 'Real records have gaps. A dictionary makes you decide what a gap means.',
            steps: [
              {
                heading: 'Brackets raise, .get does not',
                prose: '<code>row["score"]</code> on a record without a score raises <code>KeyError</code>. <code>row.get("score")</code> returns <code>None</code>, or the default you give it.',
                code: 'row = {"name": "Alan"}\n\nprint(row.get("score"))\nprint(row.get("score", 0))',
              },
              {
                heading: 'Which one you want',
                prose: 'A crash is sometimes the right behaviour: a column you expected to always be there is missing, and you want to know loudly. <code>.get</code> is for gaps you know about and have decided how to treat.',
                code: 'rows = [{"name": "Ada", "score": 92}, {"name": "Alan"}]\n\n# Decided: a missing score is left out of the count, not counted as 0.\nknown = [r["score"] for r in rows if r.get("score") is not None]\nprint(known)',
              },
            ],
            note: 'Defaulting a missing score to 0 is a decision with consequences: it drags the average down as if the student had sat the test and scored nothing. Unit 2 spends a lesson on that choice.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Add a field',
            prompt: 'Add a <code>"subject"</code> key to each record, then print each name with its subject. Notice that no existing line had to change.',
            starter: 'rows = [\n    {"name": "Ada", "score": 92},\n    {"name": "Grace", "score": 88},\n]\n\nfor row in rows:\n    print(row["name"], row["score"])\n',
          },
          {
            after: 1,
            title: 'Header plus rows',
            prompt: 'Turn <code>table</code> into a list of records with <code>zip</code>, then print the average score using the <code>"score"</code> key.',
            starter: 'header = ["name", "age", "score"]\ntable = [["Ada", 36, 92], ["Grace", 45, 88], ["Alan", 41, 79]]\n\nrows = []   # build records here\n\n# average score by name, not by position:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Rows with named fields', text: 'Any table you will read by column name, especially one whose columns might change order or grow.', code: 'strong = [r["name"] for r in rows if r["score"] >= 85]' },
            { title: 'Records with optional fields', text: 'When some rows legitimately lack a field, .get with a deliberate default says how you treat the gap.' },
          ],
          avoid: 'Do not use .get with a default to hide a column that should always be there. A missing required field is an error you want to see, so use brackets and let it raise.',
        },
        exercises: [
          {
            title: 'Everyone at 85 or above',
            prompt: 'Each row is a dictionary. Print the name of every student whose score is at least 85, one per line.',
            starter: 'rows = [\n    {"name": "Ada", "score": 92},\n    {"name": "Grace", "score": 88},\n    {"name": "Alan", "score": 79},\n]\n\n# Print the name of everyone scoring 85 or more.\n',
            expect_stdout: 'Ada\nGrace',
            hidden: [
              { name: 'the rows are read by name, not by position', kind: 'ast', requires: { loops: ['for'], conditionals: 1 }, describe: 'a loop with a test on the score' },
              { name: 'the boundary is included', kind: 'ast', requires: { compares: ['GtE'] }, describe: 'a >= comparison, so exactly 85 counts' },
            ],
            hint: 'At least 85 includes 85. Loop the rows, read row["score"], and print row["name"] when the test holds.',
            correct: 'rows = [{"name": "Ada", "score": 92}, {"name": "Grace", "score": 88}, {"name": "Alan", "score": 79}]\nfor row in rows:\n    if row["score"] >= 85:\n        print(row["name"])\n',
            wrong: 'rows = [{"name": "Ada", "score": 92}, {"name": "Grace", "score": 88}, {"name": "Alan", "score": 79}]\nfor row in rows:\n    if row["score"] > 85:\n        print(row["name"])\n',
          },
          {
            title: 'Records from a header',
            prompt: 'Write <code>to_records(header, table)</code> that turns a header list and a list of row lists into a list of dictionaries. Then write <code>average_of(records, field)</code> returning the mean of that field over the records that have it, or <code>None</code> if none do.',
            starter: 'def to_records(header, table):\n    # [{header[0]: row[0], header[1]: row[1], ...} for each row]\n    return []\n\ndef average_of(records, field):\n    # Mean of `field` over the records that have it; None if none do.\n    return None\n\nrows = to_records(["name", "score"], [["Ada", 92], ["Grace", 88]])\nprint(rows)\nprint(average_of(rows, "score"))\n',
            call: 'to_records(["name", "score"], [["Ada", 92], ["Grace", 88]])',
            expectValue: "[{'name': 'Ada', 'score': 92}, {'name': 'Grace', 'score': 88}]",
            hidden: [
              { name: 'an empty table gives no records', call: 'to_records(["a"], [])', expect: '[]' },
              {"name":"zero is present and must be included","call":"average_of([{\"score\": 0}, {\"score\": 80}, {\"name\": \"x\"}], \"score\")","expect":"40.0"},
              { name: 'the average reads the named field', call: 'average_of([{"age": 40, "score": 90}, {"age": 20, "score": 70}], "score")', expect: '80.0' },
              { name: 'records missing the field are skipped, not counted as 0', call: 'average_of([{"score": 90}, {"name": "x"}], "score")', expect: '90.0' },
              { name: 'no record has it', call: 'average_of([{"name": "x"}], "score")', expect: 'None' },
            ],
            hint: 'dict(zip(header, row)) builds one record. For the average, collect r[field] for the records where field in r, and return None before dividing if that list is empty.',
            correct: 'def to_records(header, table):\n    return [dict(zip(header, row)) for row in table]\n\ndef average_of(records, field):\n    values = [r[field] for r in records if field in r]\n    if not values:\n        return None\n    return sum(values) / len(values)\n',
            wrong: 'def to_records(header, table):\n    return [dict(zip(header, row)) for row in table]\n\ndef average_of(records, field):\n    values = [r.get(field, 0) for r in records]\n    if not values:\n        return None\n    return sum(values) / len(values)\n',
          },
        ],
        questions: [
          { id: 'd1-rad-1', prompt: 'What does a dictionary row give you that a list row does not?',
            choices: ['Speed', 'Names for the columns, so order stops mattering', 'The ability to store text', 'Automatic sorting'], answer: 1,
            explain: 'row["score"] keeps working when a column is inserted before it. row[1] silently starts meaning something else.' },
          { id: 'd1-rad-2', prompt: 'What does row.get("score") do when there is no score key?',
            choices: ['Raises KeyError', 'Returns None', 'Returns 0', 'Creates the key'], answer: 1,
            explain: 'It hands back None, or whatever default you pass as a second argument. The bracket form raises instead.' },
          { id: 'd1-rad-3', kind: 'multi',
            prompt: 'Which are good reasons to prefer .get over brackets when reading real data?',
            choices: ['The column is sometimes missing', 'You want a sensible default', 'You want the code to crash on a missing column', 'It is shorter to type'],
            answers: [0, 1],
            explain: 'Crashing is sometimes exactly right — a missing column you did not expect should be loud. .get is for gaps you know about.' },
          { id: 'd1-rad-4', prompt: 'What does dict(zip(["name", "score"], ["Ada", 92])) produce?',
            choices: ['[("name", "Ada"), ("score", 92)]', '{"name": "Ada", "score": 92}', '{"Ada": 92}', 'An error'], answer: 1,
            explain: 'zip pairs each name with the value in the same position, and dict turns the pairs into a record.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'reading-a-csv-file',
        checkpoint: {
          "title": "Parse first, convert second",
          "prompt": "The header is deliberately in a different order, and the name contains a comma. Predict the two printed values.",
          "code": "import csv\nimport io\n\ntext = 'score,name\\n7,\"Hopper, Grace\"\\n'\nrow = next(csv.DictReader(io.StringIO(text)))\nprint(row[\"name\"])\nprint(int(row[\"score\"]) + 1)",
          "output": "Hopper, Grace\n8",
          "explain": "DictReader uses the header names, so changing the column order does not change the meaning. It handles the quoted comma as part of the name. The score is still text: int converts it before addition. Opening a real CSV with newline=\"\" lets the csv module handle line endings itself.",
          "tryIt": "Change the score to 12 and reverse the header and values together. The name should still print correctly."
        },
        title: 'Reading a CSV File',
        summary: 'The csv module turns a file of text into rows you can work with.',
        objectives: [
          'Say why splitting each line on commas breaks on real files.',
          'Read a file with <code>csv.reader</code> inside a <code>with</code> block.',
          'Read named records with <code>csv.DictReader</code>.',
          'Remember that every value read from a file is a string.',
        ],
        why: 'Almost all data you analyse arrives as a file, and CSV is the most common format there is. Reading it correctly is the “get the data” step for real — and the two traps in it, quoted commas and everything-is-text, are the same two traps <code>pandas.read_csv</code> handles for you in unit 5. Seeing them by hand first is what makes its options make sense.',
        sections: [
          {
            heading: 'Why not just split on commas',
            intro: 'A CSV file looks like lines of values separated by commas, so <code>line.split(",")</code> looks like it should work. It works until the first real file.',
            steps: [
              {
                heading: 'A comma inside a value',
                prose: 'A name like <code>"Lovelace, Ada"</code> is one field. CSV protects it with quotes; <code>split</code> does not know about quotes and cuts the row in the wrong place, shifting every column after it.',
                code: 'line = \'"Lovelace, Ada",92\'\n\nprint(line.split(","))   # three pieces -- wrong',
              },
              {
                heading: 'The csv module knows the rules',
                prose: '<code>csv.reader</code> understands quoting, escaped quotes and the line endings different systems write. Here it reads from an in-memory string, so the example runs without a file; on a real file the loop is identical.',
                code: 'import csv\nimport io\n\ntext = \'name,score\\n"Lovelace, Ada",92\\nGrace,88\\n\'\nfor row in csv.reader(io.StringIO(text)):\n    print(row)',
              },
            ],
          },
          {
            heading: 'Opening the file properly',
            intro: 'A file has to be opened and closed. The <code>with</code> statement does both, including when something goes wrong halfway through.',
            steps: [
              {
                heading: 'with open(...) as f',
                prose: 'The block reads the file; leaving the block closes it. The example writes a small file first so there is something to read.',
                code: 'import csv\n\nwith open("scores.csv", "w") as f:\n    f.write("name,score\\nAda,92\\nGrace,88\\n")\n\nwith open("scores.csv") as f:\n    for row in csv.reader(f):\n        print(row)',
              },
              {
                heading: 'The header is just the first row',
                prose: '<code>csv.reader</code> does not treat the header specially. <code>next(reader)</code> takes it off the front, so the loop sees only data.',
                code: 'import csv\n\nwith open("scores.csv", "w") as f:\n    f.write("name,score\\nAda,92\\nGrace,88\\n")\n\nwith open("scores.csv") as f:\n    reader = csv.reader(f)\n    header = next(reader)\n    print("columns:", header)\n    for row in reader:\n        print(row)',
              },
            ],
          },
          {
            heading: 'DictReader gives you named rows',
            intro: 'The last lesson argued for records keyed by column name. <code>csv.DictReader</code> builds exactly those, using the header line for the keys.',
            steps: [
              {
                heading: 'One dictionary per row',
                prose: 'No <code>next</code>, no <code>zip</code>: the header becomes the keys automatically, and <code>row["score"]</code> works straight away.',
                code: 'import csv\n\nwith open("scores.csv", "w") as f:\n    f.write("name,score\\nAda,92\\nGrace,88\\n")\n\nwith open("scores.csv") as f:\n    for row in csv.DictReader(f):\n        print(row["name"], row["score"])',
              },
              {
                heading: 'Everything arrives as text',
                prose: 'A file is text, so <code>row["score"]</code> is <code>"92"</code>, not <code>92</code>. Adding two of them concatenates. Convert on the way in, with <code>int</code> or <code>float</code>, before any arithmetic.',
                code: 'import csv\n\nwith open("scores.csv", "w") as f:\n    f.write("name,score\\nAda,92\\nGrace,88\\n")\n\nwith open("scores.csv") as f:\n    rows = list(csv.DictReader(f))\n\nprint(rows[0]["score"] + rows[1]["score"])            # "9288"\nprint(int(rows[0]["score"]) + int(rows[1]["score"]))  # 180',
              },
            ],
            note: 'The exercises below use a supplied <code>scores.csv</code>. Pressing Run puts that file in place for you, and Check swaps in different files to make sure your code reads it rather than reciting it.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Split versus csv',
            prompt: 'Print what <code>split</code> makes of each line, then what <code>csv.reader</code> makes of the same text. Count the fields in each.',
            starter: 'import csv\nimport io\n\ntext = \'"Hopper, Grace",88\\n"Turing, Alan",79\\n\'\n\nfor line in text.splitlines():\n    print(line.split(","))\n\n# Now read the same text with csv.reader(io.StringIO(text)):\n',
          },
          {
            after: 1,
            title: 'Skip the header',
            prompt: 'Write the file, then read it with <code>csv.reader</code>. Take the header off with <code>next</code> and print only the names.',
            starter: 'import csv\n\nwith open("people.csv", "w") as f:\n    f.write("name,subject\\nAda,maths\\nGrace,computing\\n")\n\nwith open("people.csv") as f:\n    reader = csv.reader(f)\n    # take the header off, then print each name\n',
          },
        ],
        use: {
          cards: [
            { title: 'Any comma-separated file', text: 'Spreadsheet exports, logs and downloads. csv handles quoting and line endings that split() gets wrong.', code: 'with open(path) as f:\n    rows = list(csv.DictReader(f))' },
            { title: 'Files with a header row', text: 'DictReader turns the header into keys, so the rest of the code reads fields by name.' },
          ],
          avoid: 'Do not split lines on commas yourself, even for a file that looks simple today. The first quoted name with a comma in it shifts every column after it, with no error.',
        },
        exercises: [
          {
            title: 'Print every row',
            prompt: 'A file <code>scores.csv</code> is supplied, with a <code>name</code> and a <code>score</code> column. Print each name and score on its own line, separated by a space.',
            starter: 'import csv\n\n# scores.csv has columns: name, score\n',
            files: { 'scores.csv': 'name,score\nAda,92\nGrace,88\nAlan,79\n' },
            expect_stdout: 'Ada 92\nGrace 88\nAlan 79',
            hidden: [
              { name: 'a different file gives different output', files: { 'scores.csv': 'name,score\nKatherine,99\nDorothy,95\n' }, expect_stdout: 'Katherine 99\nDorothy 95' },
              { name: 'the csv module does the reading', kind: 'ast', requires: { imports: ['csv'] }, describe: 'the csv module imported and used' },
              { name: 'the file is opened with a with statement', kind: 'ast', requires: { withs: 1 }, describe: 'a with statement around the open' },
            ],
            hint: 'DictReader reads the header for you, so row["name"] and row["score"] work straight away. Typing the three lines out passes the first check and fails the second.',
            correct: 'import csv\n\nwith open("scores.csv") as f:\n    for row in csv.DictReader(f):\n        print(row["name"], row["score"])\n',
            wrong: 'print("Ada 92")\nprint("Grace 88")\nprint("Alan 79")\n',
          },
          {
            title: 'Total a column from a file',
            prompt: 'Write <code>total_score(path)</code> that reads the CSV at <code>path</code> (columns <code>name</code> and <code>score</code>) and returns the sum of the scores as a number. Scores are integer text. A quoted name may contain a comma, columns may be reordered, and a header-only file should return 0. Use the path passed into the function; return the number rather than printing it.',
            starter: 'import csv\n\ndef total_score(path):\n    # Read the file and add up the score column.\n    return 0\n\nprint(total_score("scores.csv"))\n',
            files: { 'scores.csv': 'name,score\n"Lovelace, Ada",92\nGrace,88\nAlan,79\n' },
            call: 'total_score("scores.csv")',
            expectValue: '259',
            hidden: [
              { name: 'a different file gives a different total', files: { 'scores.csv': 'name,score\nKatherine,99\n' }, call: 'total_score("scores.csv")', expect: '99' },
              {"name":"use the provided path and header names","files":{"reordered.csv":"score,name\n0,Ada\n12,Grace\n"},"call":"total_score(\"reordered.csv\")","expect":"12"},
              { name: 'a file with only a header totals 0', files: { 'scores.csv': 'name,score\n' }, call: 'total_score("scores.csv")', expect: '0' },
              { name: 'a comma inside quotes does not shift the columns', files: { 'scores.csv': 'name,score\n"Hopper, Grace",10\n"Turing, Alan",5\n' }, call: 'total_score("scores.csv")', expect: '15' },
              { name: 'the csv module does the reading', kind: 'ast', requires: { imports: ['csv'] }, describe: 'the csv module, which understands quotes' },
            ],
            hint: 'Loop csv.DictReader(f) and add int(row["score"]) each time. Splitting lines on commas breaks on "Lovelace, Ada", and adding the strings without int() joins them instead of summing.',
            correct: 'import csv\n\ndef total_score(path):\n    total = 0\n    with open(path) as f:\n        for row in csv.DictReader(f):\n            total += int(row["score"])\n    return total\n',
            wrong: 'def total_score(path):\n    total = 0\n    with open(path) as f:\n        for line in f.read().splitlines()[1:]:\n            total += int(line.split(",")[1])\n    return total\n',
          },
        ],
        questions: [
          { id: 'd1-csv-1', prompt: 'Why use the csv module instead of splitting each line on commas?',
            choices: ['It is faster', 'A quoted field can contain a comma, and split would break the row there', 'split does not work on files', 'csv sorts the rows'], answer: 1,
            explain: '"Lovelace, Ada" is one field with a comma in it. csv knows about the quotes; split sees three fields where there are two.' },
          { id: 'd1-csv-2', prompt: 'What does csv.DictReader use the first line of the file for?',
            choices: ['It skips it', 'As the column names for every row after it', 'As the first row of data', 'To count the rows'], answer: 1,
            explain: 'The header becomes the keys, which is why row["score"] works without you saying which position that is.' },
          { id: 'd1-csv-3', prompt: 'What type is row["score"] straight out of a CSV file?',
            choices: ['int', 'float', 'str', 'It depends on the value'], answer: 2,
            explain: 'A file is text, so everything read out of one is text until you convert it. That is the source of more early bugs than anything else in this course.' },
          { id: 'd1-csv-4', prompt: 'What does the with statement guarantee when reading a file?',
            choices: ['The file is read faster', 'The file is closed when the block ends, even if an error happens', 'The file exists', 'The header is skipped'], answer: 1,
            explain: 'Leaving the block, for any reason, closes the file. That is the whole job of with.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'summarising-numbers',
        checkpoint: {
          "title": "One outlier, two summaries",
          "prompt": "A slow response appears beside three ordinary ones. Predict which summary changes most when 100 becomes 1000.",
          "code": "import statistics\n\ntimes = [2, 3, 3, 100]\nprint(statistics.mean(times))\nprint(statistics.median(times))",
          "output": "27\n3.0",
          "explain": "The mean uses every value, so the 100 affects it strongly. The median uses the middle two values after sorting: (3 + 3) / 2. Report what the numbers measure and the sample size; neither summary alone describes the whole distribution.",
          "tryIt": "Replace 100 with 1000, then compare both summaries. Explain which is more useful for a typical response time."
        },
        title: 'Summarising Numbers',
        summary: 'Totals, averages and extremes, and what each one hides.',
        objectives: [
          'Compute a count, total, mean, minimum and maximum from a column.',
          'Handle the empty column before it raises <code>ZeroDivisionError</code>.',
          'Find the middle value with a median, and say when it beats the mean.',
          'Report an average together with its spread.',
        ],
        why: 'A summary is the answer most analyses are asked for, and a single average is the most-quoted and most-misleading number in any report. Knowing what each summary throws away — the mean hides spread, one outlier drags it, an empty column breaks it — is what lets you choose the right one and report it honestly. pandas’ <code>describe()</code> in unit 4 is these same numbers in one call.',
        sections: [
          {
            heading: 'The summaries you reach for first',
            intro: 'Five built-ins answer most questions about a column of numbers.',
            steps: [
              {
                heading: 'Count, total, extremes',
                prose: '<code>len</code>, <code>sum</code>, <code>min</code> and <code>max</code> work directly on a list of numbers.',
                code: 'scores = [92, 88, 79, 55]\n\nprint("count:", len(scores))\nprint("total:", sum(scores))\nprint("lowest:", min(scores), "highest:", max(scores))',
              },
              {
                heading: 'The mean, written out',
                prose: 'The average is the total divided by the count. Writing it out once, rather than reaching for a library, makes the next problem obvious.',
                code: 'scores = [92, 88, 79, 55]\n\nmean = sum(scores) / len(scores)\nprint(round(mean, 1))',
              },
            ],
          },
          {
            heading: 'The empty column',
            intro: 'Real data sometimes has nothing in it: a filter kept no rows, a class had no scores yet.',
            steps: [
              {
                heading: 'Dividing by zero',
                prose: '<code>len([])</code> is 0, so the mean of an empty list raises <code>ZeroDivisionError</code>. <code>min</code> and <code>max</code> raise <code>ValueError</code>.',
                code: 'scores = []\n\ntry:\n    print(sum(scores) / len(scores))\nexcept ZeroDivisionError as e:\n    print("mean failed:", e)',
              },
              {
                heading: 'Decide the answer before the division',
                prose: 'Check for an empty list first and return something deliberate — 0, or <code>None</code> if “no answer” should look different from “scored zero”.',
                code: 'def mean(values):\n    if not values:\n        return None\n    return sum(values) / len(values)\n\nprint(mean([92, 88]))\nprint(mean([]))',
              },
            ],
          },
          {
            heading: 'What an average hides',
            intro: 'Very different data can share an average. Two small additions make a summary much harder to misread.',
            steps: [
              {
                heading: 'Same mean, different class',
                prose: 'Everyone scoring 50, and half scoring 0 while half score 100, both average 50. Reporting the lowest and highest next to the mean shows the difference at the cost of one line.',
                code: 'a = [50, 50, 50, 50]\nb = [0, 0, 100, 100]\n\nprint(sum(a) / len(a), min(a), max(a))\nprint(sum(b) / len(b), min(b), max(b))',
              },
              {
                heading: 'One outlier moves the mean',
                prose: 'A single typo of 900 instead of 90 drags the mean far from any real score. The median — the middle value once sorted — barely moves. The <code>statistics</code> module has both.',
                code: 'import statistics\n\nscores = [88, 90, 92, 900]\nprint("mean:", statistics.mean(scores))\nprint("median:", statistics.median(scores))',
              },
              {
                heading: 'Finding the median by hand',
                prose: 'Sort, then take the middle value — or the mean of the two middle values when the count is even.',
                code: 'scores = sorted([79, 92, 88, 55])\nn = len(scores)\nmid = n // 2\nif n % 2:\n    print(scores[mid])\nelse:\n    print((scores[mid - 1] + scores[mid]) / 2)',
              },
            ],
            note: 'Neither summary is “correct”. The mean uses every value, which is its strength and its weakness. When a mean and a median disagree a lot, that disagreement is itself worth reporting.',
          },
        ],
        practices: [
          {
            after: 1,
            title: 'Guard the extremes',
            prompt: 'Run it: the empty list raises <code>ValueError</code>, caught and printed below. Change <code>lowest</code> so it returns <code>None</code> for an empty list, and the second line prints <code>None</code> instead.',
            starter: 'def lowest(values):\n    return min(values)\n\nprint(lowest([3, 1, 2]))\n\ntry:\n    print(lowest([]))\nexcept ValueError as e:\n    print("ValueError:", e)\n',
          },
          {
            after: 2,
            title: 'Mean or median?',
            prompt: 'Print the mean and the median of each list. For which list do they disagree, and why?',
            starter: 'import statistics\n\nsalaries = [30, 32, 31, 29, 400]\nheights = [160, 170, 165, 175, 168]\n\n# mean and median of each:\n',
          },
        ],
        use: {
          cards: [
            { title: 'Mean with its range', text: 'The default report for a column of numbers: the average, and the lowest and highest beside it so the spread is visible.', code: 'print(mean, min(scores), max(scores))' },
            { title: 'Median when values are skewed', text: 'Incomes, response times, anything with a long tail or a possible typo. The median ignores a single extreme value.' },
          ],
          avoid: 'Do not report a mean on its own, and do not divide before checking the column has anything in it. An empty column should give a deliberate answer, not a ZeroDivisionError.',
        },
        exercises: [
          {
            title: 'A safe average',
            prompt: 'Write a function <code>average(scores)</code> that returns the mean, and returns <code>0</code> for an empty list rather than raising.',
            starter: 'def average(scores):\n    # Return the mean, or 0 when there is nothing to average.\n    return None\n\nprint(average([92, 88, 79]))\n',
            call: 'average([2, 4])', expectValue: '3.0',
            hidden: [
              { name: 'an empty list averages to 0', call: 'average([])', expect: '0' },
              { name: 'one number averages to itself', call: 'average([7])', expect: '7.0' },
              { kind: 'generated', name: 'works for any list of scores', entry: 'average',
                reference: 'def average(scores):\n    if not scores:\n        return 0\n    return sum(scores) / len(scores)\n',
                args: [{ type: 'list', of: { type: 'int', min: 0, max: 100 }, minLength: 0, maxLength: 6 }],
                runs: 40 },
            ],
            hint: 'The empty case has to be handled before the division, not after it — len([]) is 0 and dividing by it raises.',
            correct: 'def average(scores):\n    if not scores:\n        return 0\n    return sum(scores) / len(scores)\n',
            wrong: 'def average(scores):\n    return sum(scores) / len(scores)\n',
          },
          {
            title: 'The median, by hand',
            prompt: 'Write <code>median(values)</code> that returns the middle value of the list once sorted, or the mean of the two middle values when there is an even number of them. Return <code>None</code> for an empty list. Do not change the list you were given, and do not import <code>statistics</code>.',
            starter: 'def median(values):\n    # Middle value once sorted; mean of the middle two for an even count.\n    return None\n\nprint(median([79, 92, 88]))\nprint(median([79, 92, 88, 55]))\n',
            call: 'median([79, 92, 88])',
            expectValue: '88',
            hidden: [
              {"name":"negative and repeated values are retained","call":"median([4, -2, -2, 0])","expect":"-1.0"},
              { name: 'an even count averages the middle two', call: 'median([79, 92, 88, 55])', expect: '83.5' },
              { name: 'an empty list has no median', call: 'median([])', expect: 'None' },
              { name: 'an outlier does not drag it', call: 'median([88, 90, 92, 900, 91])', expect: '91' },
              { name: 'the caller\'s list is not sorted in place', call: '(lambda v: (median(v), v)[1])([3, 1, 2])', expect: '[3, 1, 2]' },
              { name: 'the median is worked out, not imported', kind: 'ast', forbids: { imports: ['statistics'] }, describe: 'no statistics module' },
            ],
            hint: 's = sorted(values) makes a sorted copy. With n = len(s) and mid = n // 2, an odd count gives s[mid]; an even count gives (s[mid - 1] + s[mid]) / 2.',
            correct: 'def median(values):\n    if not values:\n        return None\n    s = sorted(values)\n    n = len(s)\n    mid = n // 2\n    if n % 2:\n        return s[mid]\n    return (s[mid - 1] + s[mid]) / 2\n',
            wrong: 'def median(values):\n    if not values:\n        return None\n    values.sort()\n    n = len(values)\n    mid = n // 2\n    if n % 2:\n        return values[mid]\n    return (values[mid - 1] + values[mid]) / 2\n',
          },
        ],
        questions: [
          { id: 'd1-sum-1', prompt: 'What does sum(scores) / len(scores) do when scores is empty?',
            choices: ['Returns 0', 'Returns None', 'Raises ZeroDivisionError', 'Returns an empty list'], answer: 2,
            explain: 'len([]) is 0, and dividing by it raises. An empty column is common in real data, so this case has to be decided rather than discovered.' },
          { id: 'd1-sum-2', prompt: 'Two classes both average 50. What does that tell you?',
            choices: ['They performed the same', 'Almost nothing on its own', 'One had more students', 'Both had a top score of 50'], answer: 1,
            explain: 'Everyone scoring 50 and half scoring 0 with half scoring 100 give the same average. The spread is the part the average threw away.' },
          { id: 'd1-sum-blank', kind: 'blank',
            prompt: 'Reporting the smallest and ___ value next to an average shows the spread the average hides.',
            blanks: [{ accept: ['largest', 'biggest', 'highest', 'maximum', 'max'] }],
            explain: 'Two extra numbers turn a figure that can mislead into one that can be read.' },
          { id: 'd1-sum-4', prompt: 'One score is mistyped as 900 instead of 90. Which summary barely changes?',
            choices: ['The mean', 'The total', 'The median', 'The maximum'], answer: 2,
            explain: 'The median depends only on the middle of the sorted values, so a single extreme value at the end hardly moves it.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'counting-and-grouping',
        checkpoint: {
          "title": "Keep each group’s denominator",
          "prompt": "Art has two results and maths has one. Predict both averages without combining the groups.",
          "code": "rows = [(\"art\", 0), (\"maths\", 90), (\"art\", 60)]\ngroups = {}\nfor subject, score in rows:\n    groups.setdefault(subject, []).append(score)\nfor subject, scores in groups.items():\n    print(subject, len(scores), round(sum(scores) / len(scores), 1))",
          "output": "art 2 30.0\nmaths 1 90.0",
          "explain": "Each group has its own total and count. Dividing art’s total by all three rows would give 20.0, which is not its mean. Keeping the count beside the average also shows that maths has only one observation.",
          "tryIt": "Add (\"maths\", 30). Predict the new count and mean for maths; art should stay unchanged."
        },
        title: 'Counting and Grouping',
        summary: 'A dictionary is how you count things, and how you split a table into groups.',
        objectives: [
          'Count how often each value appears with a dictionary and <code>.get</code>.',
          'Use <code>collections.Counter</code> for the same job, and read its most common values.',
          'Group rows into lists by a key with <code>setdefault</code>.',
          'Summarise each group — the split-apply-combine pattern behind every group-by.',
        ],
        why: '“How many in each category?” and “what is the average per group?” are the two questions asked of nearly every table. The dictionary pattern in this lesson is exactly what pandas’ <code>groupby</code> does in unit 7: split the rows by a key, apply a summary to each part, combine the answers. Writing it once by hand is what makes group-by stop looking like magic.',
        sections: [
          {
            heading: 'Counting with a dictionary',
            intro: 'The key is the thing being counted; the value is how many times you have seen it.',
            steps: [
              {
                heading: 'The first sighting problem',
                prose: '<code>counts[s] += 1</code> raises <code>KeyError</code> the first time <code>s</code> appears, because there is nothing to add to yet. <code>counts.get(s, 0) + 1</code> treats an unseen key as zero.',
                code: 'subjects = ["maths", "computing", "maths", "art", "maths"]\n\ncounts = {}\nfor s in subjects:\n    counts[s] = counts.get(s, 0) + 1\nprint(counts)',
              },
              {
                heading: 'Counter does it for you',
                prose: '<code>collections.Counter</code> is a dictionary built for counting. <code>most_common(n)</code> answers “which values are most frequent?” directly.',
                code: 'from collections import Counter\n\nsubjects = ["maths", "computing", "maths", "art", "maths"]\ncounts = Counter(subjects)\nprint(counts)\nprint(counts.most_common(1))',
              },
            ],
          },
          {
            heading: 'Grouping is counting with lists',
            intro: 'Same shape, except the value is a list you append to instead of a number you add to.',
            steps: [
              {
                heading: 'Split the rows by a key',
                prose: '<code>groups.setdefault(key, [])</code> returns the list for that key, creating an empty one on the first sighting. Appending to what it returns fills the group.',
                code: 'rows = [("maths", 92), ("computing", 88), ("maths", 79)]\n\ngroups = {}\nfor subject, score in rows:\n    groups.setdefault(subject, []).append(score)\nprint(groups)',
              },
              {
                heading: 'Apply a summary to each group',
                prose: 'Once the scores are split, each group is an ordinary list and every summary from the last lesson works on it.',
                code: 'groups = {"maths": [92, 79], "computing": [88]}\n\nfor subject, scores in groups.items():\n    print(subject, len(scores), sum(scores) / len(scores))',
              },
              {
                heading: 'Combine into one answer',
                prose: 'A dictionary comprehension collects the per-group results into a single table: one key per group, one summary per key.',
                code: 'rows = [("maths", 92), ("computing", 88), ("maths", 79)]\n\ngroups = {}\nfor subject, score in rows:\n    groups.setdefault(subject, []).append(score)\n\nmeans = {s: sum(v) / len(v) for s, v in groups.items()}\nprint(means)',
              },
            ],
            note: 'Split, apply, combine. In unit 7 this whole block becomes <code>df.groupby("subject")["score"].mean()</code>, and the three words are how that line is explained.',
          },
          {
            heading: 'Reading the result honestly',
            intro: 'A per-group summary invites comparison, and comparisons need the group sizes next to them.',
            steps: [
              {
                heading: 'Report the count with the mean',
                prose: 'A group of one student with 95 “beats” a group of forty with 90. Printing the count beside each mean shows which comparison is worth making.',
                code: 'groups = {"maths": [90, 91, 89, 90], "art": [95]}\n\nfor subject, scores in sorted(groups.items()):\n    print(f"{subject}: mean {sum(scores) / len(scores):.1f} from {len(scores)} scores")',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Most common answer',
            prompt: 'Count the survey answers with <code>Counter</code> and print the two most common.',
            starter: 'from collections import Counter\n\nanswers = ["yes", "no", "yes", "maybe", "yes", "no"]\n\n# The two most common answers:\n',
          },
          {
            after: 1,
            title: 'Highest per group',
            prompt: 'Group the rows by subject, then print the highest score in each subject.',
            starter: 'rows = [("maths", 92), ("computing", 88), ("maths", 79), ("computing", 95)]\n\ngroups = {}\n# split the scores by subject\n\n# print each subject with its highest score\n',
          },
        ],
        use: {
          cards: [
            { title: 'How many of each', text: 'Categories, answers, subjects. Counter or a dictionary with .get gives the frequency table.', code: 'Counter(subjects).most_common(3)' },
            { title: 'A summary per group', text: 'When the question says “per” or “by”: split into lists with setdefault, then summarise each list.' },
          ],
          avoid: 'Do not compare group averages without their sizes. A group of one can top the table by accident — report the count next to every mean.',
        },
        exercises: [
          {
            title: 'Rows per subject',
            prompt: 'Write <code>count_subjects(rows)</code> that takes a list of <code>(subject, score)</code> pairs and returns a dictionary of how many rows each subject has. Count every row, including a zero score, and return an empty dictionary for no rows.',
            starter: 'def count_subjects(rows):\n    # Return {subject: how many rows}\n    return {}\n\nprint(count_subjects([("maths", 92), ("computing", 88), ("maths", 79)]))\n',
            call: 'count_subjects([("maths", 92), ("computing", 88), ("maths", 79)])',
            expectValue: "{'maths': 2, 'computing': 1}",
            hidden: [
              { name: 'an empty list counts nothing', call: 'count_subjects([])', expect: '{}' },
              {"name":"zero scores still count as rows","call":"count_subjects([(\"art\", 0), (\"art\", 0), (\"maths\", 1)])","expect":"{'art': 2, 'maths': 1}"},
              { name: 'one subject counts once', call: 'count_subjects([("art", 70)])', expect: "{'art': 1}" },
              { name: 'the counting is done by a loop', kind: 'ast', requires: { loops: ['for'], functions: ['count_subjects'] }, describe: 'a loop building the dictionary up' },
            ],
            hint: 'Start with an empty dictionary and walk the rows. counts.get(subject, 0) + 1 handles both the first sighting and every one after it.',
            correct: 'def count_subjects(rows):\n    counts = {}\n    for subject, score in rows:\n        counts[subject] = counts.get(subject, 0) + 1\n    return counts\n',
            wrong: 'def count_subjects(rows):\n    return {"maths": 2, "computing": 1}\n',
          },
          {
            title: 'Mean per subject',
            prompt: 'Write <code>mean_by_subject(rows)</code> that takes <code>(subject, score)</code> pairs and returns a dictionary of each subject’s mean score, rounded to one decimal place.',
            starter: 'def mean_by_subject(rows):\n    # {subject: mean score, rounded to 1 place}\n    return {}\n\nprint(mean_by_subject([("maths", 92), ("computing", 88), ("maths", 79)]))\n',
            call: 'mean_by_subject([("maths", 92), ("computing", 88), ("maths", 79)])',
            expectValue: "{'maths': 85.5, 'computing': 88.0}",
            hidden: [
              { name: 'no rows gives no groups', call: 'mean_by_subject([])', expect: '{}' },
              {"name":"unequal group sizes and zero scores","call":"mean_by_subject([(\"art\", 0), (\"maths\", 90), (\"art\", 60)])","expect":"{'art': 30.0, 'maths': 90.0}"},
              { name: 'each group is averaged on its own', call: 'mean_by_subject([("a", 1), ("b", 10), ("a", 2), ("b", 20)])', expect: "{'a': 1.5, 'b': 15.0}" },
              { name: 'the mean is rounded to one place', call: 'mean_by_subject([("a", 1), ("a", 1), ("a", 2)])', expect: "{'a': 1.3}" },
              { name: 'the rows are split by a loop', kind: 'ast', requires: { loops: true }, describe: 'the rows walked into groups' },
            ],
            hint: 'Split first: groups.setdefault(subject, []).append(score). Then combine: {s: round(sum(v) / len(v), 1) for s, v in groups.items()}.',
            correct: 'def mean_by_subject(rows):\n    groups = {}\n    for subject, score in rows:\n        groups.setdefault(subject, []).append(score)\n    return {s: round(sum(v) / len(v), 1) for s, v in groups.items()}\n',
            wrong: 'def mean_by_subject(rows):\n    if not rows:\n        return {}\n    overall = round(sum(score for _, score in rows) / len(rows), 1)\n    return {subject: overall for subject, _ in rows}\n',
          },
        ],
        questions: [
          { id: 'd1-cag-1', prompt: 'Why use counts.get(key, 0) + 1 rather than counts[key] + 1?',
            choices: ['It is faster', 'The first time a key is seen it is not in the dictionary yet', 'It sorts the keys', 'They are the same'], answer: 1,
            explain: 'The bracket form raises KeyError on the first sighting of every key, which is every key exactly once.' },
          { id: 'd1-cag-2', prompt: 'What does setdefault(key, []).append(value) do?',
            choices: ['Replaces the list each time', 'Makes the list if it is missing, then appends to it', 'Appends only if the key exists', 'Counts the values'], answer: 1,
            explain: 'It is the grouping idiom: one line that handles both the first row of a group and all the others.' },
          { id: 'd1-cag-3', kind: 'multi',
            prompt: 'Which questions can a counting dictionary answer directly?',
            choices: ['How many students take each subject', 'Which subject is most common', 'What the average score is', 'How many distinct subjects there are'],
            answers: [0, 1, 3],
            explain: 'Counts tell you about frequency. The average needs the scores themselves, which is grouping rather than counting.' },
          { id: 'd1-cag-4', kind: 'order',
            prompt: 'Put the steps of a per-group average in order.',
            items: ['Combine the results into one dictionary', 'Split the rows into lists by key', 'Apply the mean to each list'],
            answer: [1, 2, 0],
            explain: 'Split, apply, combine — the same three steps pandas groupby performs.' },
        ],
      },
    ],
  },
};

// The shared introductory extension is authored alongside Foundations Unit 1.
const intro = require('./intro-lesson-enrichment.cjs');
for (const lesson of module.exports.unit1.lessons) {
  const entry = intro.entries.find(e => e.course === 'data' && e.slug === lesson.slug);
  if (!entry) throw new Error(`Missing introductory extension: ${lesson.slug}`);
  lesson.deepDive = entry;
  lesson.questions.push(...intro.questions(entry));
}
