/* Python for Data, unit 5 — Getting Data In.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * This unit is about the gap between "it loaded" and "it loaded correctly".
 * Every failure it teaches is silent: a wrong separator gives one column, an
 * unnamed missing marker turns a numeric column to text, to_csv writes an index
 * nobody asked for. The habit being built is to check rather than assume.
 */

const READ_CSV = {
  name: 'pandas does the reading',
  kind: 'ast',
  requires: { imports: ['pandas'], calls: ['read_csv'] },
  describe: 'pd.read_csv rather than the answer typed in',
};
const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;

module.exports = {
  unit5: {
    title: 'Getting Data In',
    blurb: 'Separators, missing markers, the columns you keep, and checking what arrived.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'csv-options-that-matter',
        title: 'CSV Options That Matter',
        summary: 'Separators, headers and the arguments you reach for on a real file.',
        objectives: [
          'Read a file whose fields are not separated by commas.',
          'Load a file that has no header row, and name the columns yourself.',
          'Skip junk at the top of a file.',
          'Recognise a wrong separator from the shape alone.',
        ],
        why: 'read_csv makes three assumptions about every file: comma separated, first line is the header, types inferred. Real exports break each of them, and none of the breakages raises — you get a table, it is just the wrong one. Four arguments cover almost every real file you will meet.',
        sections: [
          {
            heading: 'The file is not always comma separated',
            intro: '<code>sep</code> tells read_csv what divides the fields. A tab-separated export read with the default gives one column holding the whole line.',
            steps: [
              {
                heading: 'Naming the separator',
                prose: 'Tabs are <code>"\\t"</code>, semicolons are common in exports from locales where the comma is a decimal point. Pipe-separated files turn up too.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntabbed = "name\\tscore\\nAda\\t92\\n"\nprint(pd.read_csv(StringIO(tabbed), sep="\\t"))',
              },
              {
                heading: 'What it looks like when you get it wrong',
                prose: 'The load succeeds. The shape is the tell: one column where you expected several, and a column name that is the entire header line.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntabbed = "name\\tscore\\nAda\\t92\\n"\nwrong = pd.read_csv(StringIO(tabbed))\nprint(wrong.shape)\nprint(list(wrong.columns))',
                note: 'This is why <code>df.shape</code> is the first of the four checks. It catches this before any number you compute from the table can mislead you.',
              },
            ],
          },
          {
            heading: 'Headers, and files without one',
            intro: '<code>header=None</code> stops pandas taking the first row of data as your column names, and <code>names=</code> supplies your own.',
            steps: [
              {
                heading: 'A file with no header',
                prose: 'Without <code>header=None</code>, your first row of real data silently becomes the column names and you are quietly one row short.',
                code: 'import pandas as pd\nfrom io import StringIO\n\nraw = "Ada,92\\nGrace,88\\n"\nprint(pd.read_csv(StringIO(raw), header=None, names=["name", "score"]))\nprint(len(pd.read_csv(StringIO(raw))))   # one row lost',
              },
              {
                heading: 'Junk above the header',
                prose: 'Exports from reporting tools often carry a title and a blank line before the real header. <code>skiprows</code> steps over them.',
                code: 'import pandas as pd\nfrom io import StringIO\n\nmessy = "Quarterly report\\n\\nname,score\\nAda,92\\n"\nprint(pd.read_csv(StringIO(messy), skiprows=2))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Same data, two separators',
            prompt: 'Read this semicolon file twice — once with the default and once correctly — and print both shapes.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name;city;score\\nAda;Leeds;92\\n"\n\nprint(pd.read_csv(StringIO(text)).shape)\nprint(None)   # the same read, done properly\n',
          },
          {
            after: 1,
            title: 'Supply the names',
            prompt: 'This file has no header. Load it with your own column names and confirm you have two rows, not one.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\nraw = "Ada,92\\nGrace,88\\n"\n\ndf = None   # header=None and names=[...]\nprint(df)\n',
          },
        ],
        use: {
          cards: [
            { title: 'Files that are not plain comma-separated', text: 'Tabs, semicolons, no header, or a few junk lines at the top: sep, header, names and skiprows.', code: 'pd.read_csv(path, sep="\\t")' },
            { title: 'Files from other countries or tools', text: 'Different separators and decimal marks are common in exports; say what the file uses.' },
          ],
          avoid: 'Do not keep adding options until it stops raising. Check the resulting shape and column names — a load that runs with the wrong options is still wrong.',
        },
        exercises: [
          {
            title: 'Count the rows in a tab-separated file',
            prompt: 'A tab-separated file <code>scores.tsv</code> is supplied with <code>name</code> and <code>score</code> columns. Write <code>row_count(path)</code> that reads it properly and returns the number of rows.',
            starter: 'import pandas as pd\n\ndef row_count(path):\n    # Read the tab separated file and count its rows.\n    return 0\n\nprint(row_count("scores.tsv"))\n',
            files: { 'scores.tsv': 'name\tscore\nAda\t92\nGrace\t88\nAlan\t79\n' },
            call: 'row_count("scores.tsv")',
            expectValue: '3',
            hidden: [
              { name: 'a longer file counts higher',
                files: { 'scores.tsv': 'name\tscore\na\t1\nb\t2\nc\t3\nd\t4\n' },
                call: 'row_count("scores.tsv")', expect: '4' },
              { name: 'the separator is actually given', kind: 'ast', requires: { calls: ['read_csv'] }, describe: 'read_csv with the tab separator' },
            ],
            hint: 'Without sep="\\t" the whole line lands in one column and you get one column and three rows — the row count would look right and the table would be wrong. len(df) or df.shape[0] counts the rows.',
            correct: 'import pandas as pd\n\ndef row_count(path):\n    return len(pd.read_csv(path, sep="\\t"))\n',
            wrong: 'import pandas as pd\n\ndef row_count(path):\n    return 3\n',
          },
          {
            title: 'A file with no header',
            prompt: 'A file <code>raw.csv</code> holds names and scores with no header row. Write <code>headerless(path)</code> that reads it, naming the columns <code>name</code> and <code>score</code>, and returns the number of rows. Losing a row to the header is the mistake being checked.',
            starter: 'import pandas as pd\n\ndef headerless(path):\n    # No header in the file. Name the columns and count the rows.\n    return 0\n\nprint(headerless("raw.csv"))\n',
            files: { 'raw.csv': 'Ada,92\nGrace,88\nAlan,79\n' },
            call: 'headerless("raw.csv")',
            expectValue: '3',
            hidden: [
              { name: 'a two-row file gives two rows',
                files: { 'raw.csv': 'a,1\nb,2\n' }, call: 'headerless("raw.csv")', expect: '2' },
              { name: 'a one-row file is not read as header only',
                files: { 'raw.csv': 'solo,5\n' }, call: 'headerless("raw.csv")', expect: '1' },
              READ_CSV,
            ],
            hint: 'Supplying names= tells pandas there is no header to read. Reading it with neither argument takes your first row of data as the column names, and the count comes back one short.',
            correct: 'import pandas as pd\n\ndef headerless(path):\n    return len(pd.read_csv(path, header=None, names=["name", "score"]))\n',
            wrong: 'import pandas as pd\n\ndef headerless(path):\n    return len(pd.read_csv(path))\n',
          },
        ],
        questions: [
          { id: 'd5-cot-1', prompt: 'A file separates fields with tabs. Which argument do you need?',
            choices: ['delim="tab"', 'sep="\\t"', 'split="\\t"', 'tab=True'], answer: 1,
            explain: 'Without it the whole line lands in one column, and the load succeeds while the table is wrong.' },
          { id: 'd5-cot-2', prompt: 'What does header=None do?',
            choices: ['Removes the header from the file', 'Stops the first row being read as column names', 'Hides the column names', 'Raises if there is a header'], answer: 1,
            explain: 'Without it, your first row of real data becomes the header and you are quietly one row short.' },
          { id: 'd5-cot-3', prompt: 'You loaded a six-column file and shape says (1000, 1). What is the likely cause?',
            choices: ['The file is corrupt', 'The separator is wrong', 'There are too many rows', 'The dtypes failed'], answer: 1,
            explain: 'Each line arrived unsplit as a single value. The shape said so before any of the numbers did.' },
          { id: 'd5-cot-4', prompt: 'An export has a title line and a blank line above the header. What handles it?',
            choices: ['skiprows=2', 'header=2', 'drop=2', 'Nothing, it is unreadable'], answer: 0,
            explain: 'skiprows steps over the junk so the real header is where pandas expects it.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'missing-markers-on-load',
        title: 'Missing Markers on Load',
        summary: 'Files write missing values in a dozen ways; na_values names yours.',
        objectives: [
          'List what pandas already treats as missing.',
          'Name a file\'s own missing markers at load time.',
          'Explain why an unnamed marker costs you the whole column.',
          'Count what is missing before deciding what to do about it.',
        ],
        why: 'Every file writes "we do not know" differently: blank, n/a, N/A, -, ., NULL, 999. pandas knows some of them. The ones it does not know do not become missing values — they stay as text, and one of them is enough to turn a numeric column into strings and every calculation on it into nonsense.',
        sections: [
          {
            heading: 'What counts as missing',
            intro: 'pandas already treats an empty field, <code>NA</code>, <code>NaN</code>, <code>NULL</code> and a few others as missing. Real files also use <code>n/a</code>, a single dash, a full stop, or a sentinel number like 999.',
            steps: [
              {
                heading: 'The ones it knows',
                prose: 'An empty field becomes NaN on its own, and the column stays numeric.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,\\n"\ndf = pd.read_csv(StringIO(text))\nprint(df)\nprint(df.dtypes)',
              },
              {
                heading: 'Naming your own',
                prose: '<code>na_values</code> adds to the list. Doing it at load time means the column is numeric from the start, rather than being repaired afterwards.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,n/a\\n"\ndf = pd.read_csv(StringIO(text), na_values=["n/a", "-", "."])\nprint(df)\nprint(df.dtypes)',
              },
            ],
          },
          {
            heading: 'A missing marker left unnamed poisons the column',
            intro: 'One <code>"n/a"</code> in a numeric column makes the whole column text, and every calculation on it is then wrong in a way that does not raise.',
            steps: [
              {
                heading: 'The damage',
                prose: 'Compare these two loads of the same file. The only difference is whether the marker was named.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,n/a\\nAlan,79\\n"\n\nbad = pd.read_csv(StringIO(text))\nprint(bad["score"].dtype, "|", bad["score"].sum())\n\ngood = pd.read_csv(StringIO(text), na_values=["n/a"])\nprint(good["score"].dtype, "|", good["score"].sum())',
                note: 'The first sum concatenated three strings. It did not raise, and on a real file it would have produced a number-shaped answer you might have believed.',
              },
              {
                heading: 'Count before you decide',
                prose: 'How much is missing is a fact about your data and usually belongs in the write-up. Find it before you fill or drop anything, because afterwards it is gone.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,n/a\\nAlan,79\\n"\ndf = pd.read_csv(StringIO(text), na_values=["n/a"])\n\nprint(df.isna().sum())\nprint("rows with a score:", int(df["score"].notna().sum()))',
              },
              {
                heading: 'The sentinel that looks like data',
                prose: 'A missing marker of 999 or -1 is the dangerous kind: the column stays numeric, nothing looks wrong, and the mean is quietly ruined. Only knowing the file catches it.',
                code: 'import pandas as pd\n\nwith_sentinel = pd.Series([92, 88, 999])\nprint(with_sentinel.mean())\n\ncleaned = pd.Series([92, 88, 999]).replace(999, None)\nprint(cleaned.mean())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Name the markers',
            prompt: 'This file uses two different markers. Load it so that both become missing and the column stays numeric.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,n/a\\nAlan,-\\n"\n\ndf = pd.read_csv(StringIO(text))\nprint(df.dtypes)\n\n# Now load it again, naming both markers:\n',
          },
          {
            after: 1,
            title: 'How much is missing',
            prompt: 'Print the count of missing values per column, and the total across the whole table.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score,city\\nAda,92,\\nGrace,,Leeds\\n"\ndf = pd.read_csv(StringIO(text))\n\nprint(df.isna().sum())\nprint(None)   # the total across every column\n',
          },
        ],
        use: {
          cards: [
            { title: 'Files with text markers', text: '"n/a", "-", "missing": name them in na_values so the column stays numeric.', code: 'pd.read_csv(path, na_values=["n/a", "-"])' },
            { title: 'Numeric sentinels', text: 'Values like 999 or -1 that mean “not recorded” should be listed too, or they ruin the mean.' },
          ],
          avoid: 'Do not clean markers after the load with string replacement when read_csv can do it. And do not assume blanks are the only marker — look at the distinct values.',
        },
        exercises: [
          {
            title: 'Count the known scores',
            prompt: 'A file <code>scores.csv</code> uses <code>n/a</code> for a missing score. Write <code>known_scores(path)</code> that returns how many rows have a score.',
            starter: 'import pandas as pd\n\ndef known_scores(path):\n    # How many rows actually have a score?\n    return 0\n\nprint(known_scores("scores.csv"))\n',
            files: { 'scores.csv': 'name,score\nAda,92\nGrace,n/a\nAlan,79\n' },
            call: 'known_scores("scores.csv")',
            expectValue: '2',
            hidden: [
              { name: 'a file with nothing missing counts them all',
                files: { 'scores.csv': 'name,score\na,1\nb,2\n' }, call: 'known_scores("scores.csv")', expect: '2' },
              { name: 'everything missing counts none',
                files: { 'scores.csv': 'name,score\na,n/a\nb,n/a\n' }, call: 'known_scores("scores.csv")', expect: '0' },
            ],
            hint: 'Name "n/a" in na_values so it loads as missing, then count what is left with notna().sum() or by dropping the missing rows.',
            correct: 'import pandas as pd\n\ndef known_scores(path):\n    df = pd.read_csv(path, na_values=["n/a"])\n    return int(df["score"].notna().sum())\n',
            wrong: 'import pandas as pd\n\ndef known_scores(path):\n    return len(pd.read_csv(path))\n',
          },
          {
            title: 'The mean without the sentinel',
            prompt: 'A file <code>readings.csv</code> uses <code>999</code> to mean "no reading". Write <code>true_mean(path)</code> that returns the mean of the real readings, rounded to two decimal places. The column is numeric either way, so nothing will warn you.',
            starter: 'import pandas as pd\n\ndef true_mean(path):\n    # The mean, with 999 treated as missing.\n    return 0.0\n\nprint(true_mean("readings.csv"))\n',
            files: { 'readings.csv': 'value\n10\n20\n999\n' },
            call: 'true_mean("readings.csv")',
            expectValue: '15.0',
            hidden: [
              { name: 'no sentinel leaves the mean alone',
                files: { 'readings.csv': 'value\n2\n4\n' }, call: 'true_mean("readings.csv")', expect: '3.0' },
              { name: 'several sentinels are all excluded',
                files: { 'readings.csv': 'value\n5\n999\n999\n' }, call: 'true_mean("readings.csv")', expect: '5.0' },
              { name: 'it rounds to two places',
                files: { 'readings.csv': 'value\n1\n2\n' }, call: 'true_mean("readings.csv")', expect: '1.5' },
              READ_CSV,
            ],
            hint: 'na_values=[999] at load time turns the sentinel into NaN, and mean() skips NaN. Filtering with != 999 works too; naming it at load is the habit that scales.',
            correct: 'import pandas as pd\n\ndef true_mean(path):\n    df = pd.read_csv(path, na_values=[999])\n    return round(float(df["value"].mean()), 2)\n',
            wrong: 'import pandas as pd\n\ndef true_mean(path):\n    df = pd.read_csv(path)\n    return round(float(df["value"].mean()), 2)\n',
          },
        ],
        questions: [
          { id: 'd5-mm-1', prompt: 'A file writes missing scores as "n/a". What happens if you do not say so?',
            choices: ['pandas works it out', 'The column becomes text', 'The rows are dropped', 'It raises'], answer: 1,
            explain: 'One unconvertible value takes the whole column to object, and then sum concatenates instead of adding.' },
          { id: 'd5-mm-2', prompt: 'Which argument names a file’s own missing markers?',
            choices: ['missing=', 'na_values=', 'nulls=', 'blanks='], answer: 1,
            explain: 'It adds to the list pandas already knows, and doing it at load keeps the column numeric from the start.' },
          { id: 'd5-mm-3', prompt: 'What does df.isna().sum() give you?',
            choices: ['One total', 'A count of missing values per column', 'The missing rows', 'True or False'], answer: 1,
            explain: 'isna gives a boolean frame, and summing a boolean column counts the Trues. Sum it twice for a single total.' },
          { id: 'd5-mm-4', prompt: 'Why is a missing marker of 999 more dangerous than "n/a"?',
            choices: ['It is longer', 'The column stays numeric, so nothing looks wrong and the mean is ruined', 'pandas cannot read it', 'It is not dangerous'], answer: 1,
            explain: 'A text marker at least breaks the dtype and draws attention. A numeric sentinel is absorbed silently into every statistic.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'selecting-what-you-need',
        title: 'Selecting What You Need',
        summary: 'Read the columns you want, and stop carrying the ones you do not.',
        objectives: [
          'Read only the columns you need with <code>usecols</code>.',
          'Tidy shouty or spaced column names in one pass.',
          'Say what a smaller table buys beyond memory.',
          'Keep an id column as text so it does not lose its leading zeros.',
        ],
        why: 'A real export is forty columns and you want six. Carrying the other thirty-four costs memory, but more importantly it costs attention: every one of them is a column that can surprise you later, and none of them is a column you checked.',
        sections: [
          {
            heading: 'usecols on the way in',
            intro: 'A wide export is mostly columns you will never touch. Naming the ones you want keeps the table small and the checks short.',
            steps: [
              {
                heading: 'Ask for what you need',
                prose: '<code>usecols</code> takes the names, and the resulting table has only those. The rest of the file is never turned into columns at all.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,city,score,notes\\nAda,Leeds,92,ignore me\\n"\ndf = pd.read_csv(StringIO(text), usecols=["name", "score"])\nprint(df)\nprint(df.shape)',
              },
              {
                heading: 'The type of an id',
                prose: 'An id made of digits will be read as a number, and a number has no leading zeros. <code>dtype=</code> keeps it as text so <code>007</code> stays <code>007</code>.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "id,score\\n007,92\\n"\nprint(pd.read_csv(StringIO(text))["id"].iloc[0])\nprint(pd.read_csv(StringIO(text), dtype={"id": str})["id"].iloc[0])',
                note: 'This also matters for joining. An id read as a number in one file and as text in another will match nothing in unit 8, and the merge will succeed with an empty result.',
              },
            ],
          },
          {
            heading: 'Renaming as you go',
            intro: 'Column names from real systems are often shouty, spaced, or both. <code>rename</code> takes a dictionary from old name to new.',
            steps: [
              {
                heading: 'One name at a time',
                prose: 'A small mapping for the handful you actually care about.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"Full Name": ["Ada"], "SCORE": [92]})\nprint(list(df.rename(columns={"Full Name": "name"}).columns))',
              },
              {
                heading: 'A rule for all of them',
                prose: 'When every name needs the same treatment, build the mapping with a comprehension rather than typing forty pairs.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"Full Name": ["Ada"], "SCORE": [92]})\ntidy = df.rename(columns={c: c.lower().replace(" ", "_") for c in df.columns})\nprint(list(tidy.columns))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two of six',
            prompt: 'Read only the name and score columns from this wide file, and confirm the shape.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,city,score,age,notes,ref\\nAda,Leeds,92,36,x,r1\\n"\n\ndf = pd.read_csv(StringIO(text))\nprint(df.shape)\n\n# Now read just the two you want:\n',
          },
          {
            after: 1,
            title: 'Tidy every name',
            prompt: 'Lowercase every column name and turn spaces into underscores, in one rename.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"Full Name": [1], "Home City": [2], "SCORE": [3]})\n\nprint(list(df.columns))\nprint(None)   # the tidied names\n',
          },
        ],
        use: {
          cards: [
            { title: 'Wide files', text: 'usecols reads only the columns the analysis needs, which is faster and easier to check.', code: 'pd.read_csv(path, usecols=["id", "score"])' },
            { title: 'Large files', text: 'nrows reads a sample first, so you can inspect the shape before loading everything.' },
          ],
          avoid: 'Do not drop columns you might need to explain a result, such as the one that says where a row came from. Reading less is for columns you are sure about.',
        },
        exercises: [
          {
            title: 'Tidy the column names',
            prompt: 'Write <code>tidy_columns(df)</code> that returns a new table whose column names are all lowercase with spaces turned into underscores.',
            starter: 'import pandas as pd\n\ndef tidy_columns(df):\n    # lowercase, spaces become underscores\n    return df\n\nprint(list(tidy_columns(pd.DataFrame({"Full Name": [1]})).columns))\n',
            call: `list(tidy_columns(${pdf('{"Full Name": [1], "SCORE": [2]}')}).columns)`,
            expectValue: "['full_name', 'score']",
            hidden: [
              { name: 'already tidy names are left alone', call: `list(tidy_columns(${pdf('{"name": [1]}')}).columns)`, expect: "['name']" },
              { name: 'several spaces are all replaced', call: `list(tidy_columns(${pdf('{"A B C": [1]}')}).columns)`, expect: "['a_b_c']" },
              { name: 'the data survives the rename', call: `int(tidy_columns(${pdf('{"A B": [7]}')})["a_b"].iloc[0])`, expect: '7' },
            ],
            hint: 'Build a dictionary from each existing name to its tidy version, then hand it to rename. str.lower() and str.replace(" ", "_") do the work.',
            correct: 'import pandas as pd\n\ndef tidy_columns(df):\n    return df.rename(columns={c: c.lower().replace(" ", "_") for c in df.columns})\n',
            wrong: 'import pandas as pd\n\ndef tidy_columns(df):\n    return df.rename(columns={c: c.lower() for c in df.columns})\n',
          },
          {
            title: 'Read only what you need',
            prompt: 'A wide file <code>wide.csv</code> is supplied. Write <code>narrow(path, keep)</code> that reads only the columns named in <code>keep</code> and returns the resulting shape as a tuple. Read the columns you want rather than reading everything and dropping the rest.',
            starter: 'import pandas as pd\n\ndef narrow(path, keep):\n    # Read only those columns; return (rows, columns).\n    return None\n\nprint(narrow("wide.csv", ["name", "score"]))\n',
            files: { 'wide.csv': 'name,city,score,notes\nAda,Leeds,92,x\nGrace,York,88,y\n' },
            call: 'narrow("wide.csv", ["name", "score"])',
            expectValue: '(2, 2)',
            hidden: [
              { name: 'one column is a valid request',
                files: { 'wide.csv': 'name,city,score,notes\nAda,Leeds,92,x\nGrace,York,88,y\n' },
                call: 'narrow("wide.csv", ["score"])', expect: '(2, 1)' },
              { name: 'the rows are unaffected by the column choice',
                files: { 'wide.csv': 'name,city,score,notes\na,b,1,n\nc,d,2,n\ne,f,3,n\n' },
                call: 'narrow("wide.csv", ["name"])', expect: '(3, 1)' },
              { name: 'usecols does the narrowing', kind: 'ast', requires: { calls: ['read_csv'] }, describe: 'read_csv asked for the columns' },
            ],
            hint: 'pd.read_csv(path, usecols=keep) then .shape. Reading everything and then selecting gives the same shape but does all the work you were trying to avoid.',
            correct: 'import pandas as pd\n\ndef narrow(path, keep):\n    return pd.read_csv(path, usecols=keep).shape\n',
            wrong: 'import pandas as pd\n\ndef narrow(path, keep):\n    return pd.read_csv(path).shape\n',
          },
        ],
        questions: [
          { id: 'd5-swn-1', prompt: 'What does usecols do?',
            choices: ['Renames columns', 'Reads only the columns you name', 'Sorts the columns', 'Sets the index'], answer: 1,
            explain: 'Less memory, and fewer unchecked columns to surprise you later.' },
          { id: 'd5-swn-2', prompt: 'How do you rename several columns at once?',
            choices: ['df.columns = new', 'df.rename(columns={old: new, ...})', 'df.set_names()', 'Both of the first two work'], answer: 3,
            explain: 'Assigning to df.columns replaces all of them positionally; rename maps the ones you name and leaves the rest.' },
          { id: 'd5-swn-3', prompt: 'An id column of 007 read normally becomes what?',
            choices: ['"007"', '7', 'NaN', 'An error'], answer: 1,
            explain: 'It is read as a number, and numbers have no leading zeros. dtype={"id": str} keeps it as text.' },
          { id: 'd5-swn-4', prompt: 'Why does an id read as a number in one file and text in another matter?',
            choices: ['It does not', 'A later join will match nothing, and will not raise', 'It doubles the memory', 'It changes the row order'], answer: 1,
            explain: '3 and "3" are different keys. The merge succeeds with an empty result, which is the quietest failure in unit 8.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'reading-json-data',
        title: 'Reading JSON Data',
        summary: 'A list of records is a table waiting to happen.',
        objectives: [
          'Turn a list of dictionaries into a DataFrame.',
          'Say what happens to a record that is missing a key.',
          'Explain why the column order is not guaranteed to be the key order.',
          'Flatten one level of nesting.',
        ],
        why: 'JSON is what an API gives you, and it is record-shaped rather than column-shaped. pandas bridges the two in one call — but the bridge makes decisions about missing keys and about nesting, and knowing them saves you from a column of dictionaries.',
        sections: [
          {
            heading: 'Records in, table out',
            intro: 'JSON from an API is usually a list of objects, and each object is a row. <code>DataFrame</code> takes that shape directly.',
            steps: [
              {
                heading: 'A list of dictionaries',
                prose: 'The union of all the keys becomes the columns. Each record becomes a row.',
                code: 'import pandas as pd\n\nrecords = [\n    {"name": "Ada", "score": 92},\n    {"name": "Grace", "score": 88},\n]\nprint(pd.DataFrame(records))',
              },
              {
                heading: 'From a JSON string',
                prose: 'When the JSON arrives as text, parse it first and build from the result. <code>read_json</code> exists too, but going through <code>json.loads</code> keeps the parsing and the table-building as two steps you can inspect separately.',
                code: 'import json\nimport pandas as pd\n\ntext = \'[{"name": "Ada", "score": 92}]\'\nprint(pd.DataFrame(json.loads(text)))',
              },
            ],
          },
          {
            heading: 'Missing keys become missing values',
            intro: 'A record without a key does not break the table. That column simply has a gap on that row.',
            steps: [
              {
                heading: 'The gap',
                prose: 'The column exists because some record had it. The rows that did not get NaN, and the column widens to float if it was holding whole numbers.',
                code: 'import pandas as pd\n\nrecords = [{"name": "Ada", "score": 92}, {"name": "Grace"}]\ndf = pd.DataFrame(records)\nprint(df)\nprint(df.dtypes)',
              },
              {
                heading: 'Nesting does not flatten itself',
                prose: 'A value that is itself a dictionary becomes a column of dictionaries, which is almost never what you want. <code>json_normalize</code> flattens it into real columns.',
                code: 'import pandas as pd\n\nrecords = [{"name": "Ada", "at": {"city": "Leeds", "year": 1843}}]\nprint(pd.DataFrame(records))\nprint()\nprint(pd.json_normalize(records))',
                note: 'The flattened names are joined with a dot: <code>at.city</code>. Rename them if a dot in a column name is going to be awkward later.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Records to table',
            prompt: 'Build a table from these records and print its shape and columns.',
            starter: 'import pandas as pd\n\nrecords = [\n    {"name": "Ada", "score": 92},\n    {"name": "Grace", "score": 88},\n    {"name": "Alan", "score": 79},\n]\n\ndf = pd.DataFrame(records)\nprint(df.shape)\nprint(list(df.columns))\n',
          },
          {
            after: 1,
            title: 'Flatten the nesting',
            prompt: 'Build this twice — with <code>DataFrame</code> and with <code>json_normalize</code> — and compare the columns.',
            starter: 'import pandas as pd\n\nrecords = [{"name": "Ada", "at": {"city": "Leeds"}}]\n\nprint(list(pd.DataFrame(records).columns))\nprint(None)   # the flattened version\n',
          },
        ],
        use: {
          cards: [
            { title: 'A list of records', text: 'JSON from an API is often a list of objects, which becomes a table with one call.', code: 'pd.DataFrame(records)' },
            { title: 'Nested objects', text: 'json_normalize flattens nested fields into columns with dotted names.' },
          ],
          avoid: 'Do not load deeply nested JSON straight into a DataFrame and expect columns. Cells full of dictionaries need flattening first.',
        },
        exercises: [
          {
            title: 'Columns from records',
            prompt: 'Write <code>from_records(rows)</code> that turns a list of dictionaries into a table and returns its column names, sorted.',
            starter: 'import pandas as pd\n\ndef from_records(rows):\n    # Build a table, return sorted column names.\n    return []\n\nprint(from_records([{"name": "Ada", "score": 92}]))\n',
            call: 'from_records([{"name": "Ada", "score": 92}, {"name": "Grace", "score": 88}])',
            expectValue: "['name', 'score']",
            hidden: [
              { name: 'a key only some records have still becomes a column', call: 'from_records([{"a": 1}, {"a": 2, "b": 3}])', expect: "['a', 'b']" },
              { name: 'no records means no columns', call: 'from_records([])', expect: '[]' },
              { name: 'pandas builds the table', kind: 'ast', requires: { imports: ['pandas'] }, describe: 'a DataFrame built from the records' },
            ],
            hint: 'pd.DataFrame takes the list of dictionaries directly. sorted(df.columns) then gives plain strings in a predictable order.',
            correct: 'import pandas as pd\n\ndef from_records(rows):\n    return sorted(pd.DataFrame(rows).columns)\n',
            wrong: 'import pandas as pd\n\ndef from_records(rows):\n    return sorted(rows[0].keys())\n',
          },
          {
            title: 'How complete is each record',
            prompt: 'Write <code>completeness(rows)</code> that builds a table from the records and returns a dictionary mapping each column name to how many rows actually have a value for it.',
            starter: 'import pandas as pd\n\ndef completeness(rows):\n    # column name -> how many rows have a value\n    return {}\n\nprint(completeness([{"a": 1}, {"a": 2, "b": 3}]))\n',
            call: 'completeness([{"a": 1}, {"a": 2, "b": 3}])',
            expectValue: "{'a': 2, 'b': 1}",
            hidden: [
              { name: 'a fully populated table counts every row', call: 'completeness([{"a": 1, "b": 2}, {"a": 3, "b": 4}])', expect: "{'a': 2, 'b': 2}" },
              { name: 'no records give no columns', call: 'completeness([])', expect: '{}' },
              { name: 'an explicit None counts as missing', call: 'completeness([{"a": None}, {"a": 1}])', expect: "{'a': 1}" },
              { name: 'the counts are plain integers', call: 'all(type(v).__name__ == "int" for v in completeness([{"a": 1}]).values())', expect: 'True' },
            ],
            hint: 'df.notna().sum() gives a Series of counts per column. Turn it into a dict and make the values plain ints with a comprehension.',
            correct: 'import pandas as pd\n\ndef completeness(rows):\n    df = pd.DataFrame(rows)\n    return {c: int(n) for c, n in df.notna().sum().items()}\n',
            wrong: 'import pandas as pd\n\ndef completeness(rows):\n    df = pd.DataFrame(rows)\n    return {c: int(n) for c, n in df.isna().sum().items()}\n',
          },
        ],
        questions: [
          { id: 'd5-rjd-1', prompt: 'What does pd.DataFrame(list_of_dicts) do?',
            choices: ['Raises', 'One row per dictionary, keys as columns', 'One column per dictionary', 'A Series'], answer: 1,
            explain: 'A list of records is a table waiting to happen; the union of the keys becomes the columns.' },
          { id: 'd5-rjd-2', prompt: 'A record is missing a key the others have. What goes in that cell?',
            choices: ['0', 'An empty string', 'NaN', 'The row is dropped'], answer: 2,
            explain: 'The column exists because other records have it, and this row simply has no value for it.' },
          { id: 'd5-rjd-3', prompt: 'A value is itself a dictionary. What does DataFrame give you?',
            choices: ['Flattened columns', 'A column holding dictionaries', 'An error', 'The keys as rows'], answer: 1,
            explain: 'json_normalize is what flattens one level into real columns, named with a dot.' },
          { id: 'd5-rjd-4', prompt: 'Whole-number scores with one record missing the key get which dtype?',
            choices: ['int64', 'float64', 'object', 'bool'], answer: 1,
            explain: 'NaN is a float, so the column widens to hold it — the same rule as anywhere else in pandas.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'writing-data-out',
        title: 'Writing Data Out',
        summary: 'Saving a result, and the index that gets written with it.',
        objectives: [
          'Write a table to CSV.',
          'Say what <code>to_csv</code> writes that you did not ask for.',
          'Decide when the index is worth keeping.',
          'Write only the columns a reader needs.',
        ],
        why: 'The file you write is the one someone else reads, including you next month. An unnamed index column read back as data is the most common way a saved result quietly grows a junk column every time it goes round the loop.',
        sections: [
          {
            heading: 'to_csv writes the index too',
            intro: 'By default the index becomes an unnamed first column. Reading that file back gives you a column called <code>Unnamed: 0</code>.',
            steps: [
              {
                heading: 'The extra column',
                prose: 'Nothing is wrong with the data; there is simply a column of row numbers in the file that was never part of your table.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada"], "score": [92]})\ndf.to_csv("out.csv")\nprint(open("out.csv").read())',
              },
              {
                heading: 'Round-tripping makes it worse',
                prose: 'Read it back, write it again, and you have two junk columns. This is how a file ends up with <code>Unnamed: 0</code>, <code>Unnamed: 0.1</code> and so on.',
                code: 'import pandas as pd\n\npd.DataFrame({"name": ["Ada"]}).to_csv("out.csv")\nback = pd.read_csv("out.csv")\nprint(list(back.columns))\nback.to_csv("out2.csv")\nprint(list(pd.read_csv("out2.csv").columns))',
              },
            ],
          },
          {
            heading: 'Write what you meant to write',
            intro: '<code>index=False</code> keeps the row numbers out, and <code>columns=</code> picks what goes.',
            steps: [
              {
                heading: 'Without the index',
                prose: 'When the index is just 0, 1, 2 it carries nothing and should not be written.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada"], "score": [92]})\ndf.to_csv("out.csv", index=False)\nprint(open("out.csv").read())',
              },
              {
                heading: 'When the index should be written',
                prose: 'If the index is the label for the row — a date, a name, an id — then dropping it loses information. Keep it, and give it a name so the column has a header.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [92, 88]}, index=["Ada", "Grace"])\ndf.index.name = "name"\ndf.to_csv("out.csv")\nprint(open("out.csv").read())',
              },
              {
                heading: 'Only the columns that matter',
                prose: 'A result for a reader is usually narrower than the table you worked in.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada"], "score": [92], "scratch": [0]})\ndf.to_csv("out.csv", index=False, columns=["name", "score"])\nprint(open("out.csv").read())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'See the extra column',
            prompt: 'Write this table with the default settings, read it back, and print the columns you got.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace"], "score": [92, 88]})\ndf.to_csv("out.csv")\n\nprint(open("out.csv").read())\nprint(list(pd.read_csv("out.csv").columns))\n',
          },
          {
            after: 1,
            title: 'A clean round trip',
            prompt: 'Write it again without the index, read it back, and confirm the columns match what you started with.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace"], "score": [92, 88]})\n\ndf.to_csv("out.csv", index=False)\nback = pd.read_csv("out.csv")\nprint(list(back.columns) == list(df.columns))\n',
          },
        ],
        use: {
          cards: [
            { title: 'Saving a cleaned table', text: 'to_csv with index=False writes exactly the columns a reader expects.', code: 'df.to_csv("clean.csv", index=False)' },
            { title: 'Handing results to someone else', text: 'A file they can open in a spreadsheet, with named columns and no internal index.' },
          ],
          avoid: 'Do not write the default index for a range index. Read back in, it becomes an “Unnamed: 0” column, and one more on every round trip.',
        },
        exercises: [
          {
            title: 'Save without the index',
            prompt: 'Write <code>save_scores(df, path)</code> that writes the table to <code>path</code> as CSV with no index column, then returns the first line of the file.',
            starter: 'import pandas as pd\n\ndef save_scores(df, path):\n    # Write without the index, return the header line.\n    return ""\n\nprint(save_scores(pd.DataFrame({"name": ["Ada"], "score": [92]}), "out.csv"))\n',
            call: `save_scores(${pdf('{"name": ["Ada"], "score": [92]}')}, "out.csv")`,
            expectValue: "'name,score'",
            hidden: [
              { name: 'the row is written with two fields, so no index came along',
                call: `(save_scores(${pdf('{"name": ["Ada"], "score": [92]}')}, "out.csv"), open("out.csv").read().strip().split("\\n")[1])[-1]`,
                expect: "'Ada,92'" },
              { name: 'a second table overwrites cleanly',
                call: `(save_scores(${pdf('{"name": ["Bo"], "score": [1]}')}, "out.csv"), len(open("out.csv").read().strip().split("\\n")))[-1]`,
                expect: '2' },
            ],
            hint: 'index=False is the argument that keeps the row numbers out. Reading the first line back is what proves it worked.',
            correct: 'import pandas as pd\n\ndef save_scores(df, path):\n    df.to_csv(path, index=False)\n    with open(path) as f:\n        return f.readline().strip()\n',
            wrong: 'import pandas as pd\n\ndef save_scores(df, path):\n    df.to_csv(path)\n    with open(path) as f:\n        return f.readline().strip()\n',
          },
          {
            title: 'A round trip that survives',
            prompt: 'Write <code>round_trip(df, path)</code> that writes the table out, reads it straight back, and returns the column names of what came back. Written properly, they are the names you started with.',
            starter: 'import pandas as pd\n\ndef round_trip(df, path):\n    # Write it, read it back, return the columns that returned.\n    return []\n\nprint(round_trip(pd.DataFrame({"name": ["Ada"], "score": [92]}), "out.csv"))\n',
            call: `round_trip(${pdf('{"name": ["Ada"], "score": [92]}')}, "out.csv")`,
            expectValue: "['name', 'score']",
            hidden: [
              { name: 'no Unnamed column comes back',
                call: `all(not c.startswith("Unnamed") for c in round_trip(${pdf('{"a": [1], "b": [2]}')}, "out.csv"))`,
                expect: 'True' },
              { name: 'the values survive the trip',
                call: `(round_trip(${pdf('{"a": [7]}')}, "out.csv"), int(__import__("pandas").read_csv("out.csv")["a"].iloc[0]))[-1]`,
                expect: '7' },
              { name: 'a one-column table round-trips',
                call: `round_trip(${pdf('{"only": [1, 2]}')}, "out.csv")`, expect: "['only']" },
            ],
            hint: 'to_csv(path, index=False), then pd.read_csv(path), then list(back.columns). Leaving index=False off adds an Unnamed column, which the second check is looking for.',
            correct: 'import pandas as pd\n\ndef round_trip(df, path):\n    df.to_csv(path, index=False)\n    return list(pd.read_csv(path).columns)\n',
            wrong: 'import pandas as pd\n\ndef round_trip(df, path):\n    df.to_csv(path)\n    return list(pd.read_csv(path).columns)\n',
          },
        ],
        questions: [
          { id: 'd5-wdo-1', prompt: 'What does to_csv write by default that you may not want?',
            choices: ['The dtypes', 'The index, as an unnamed first column', 'Nothing extra', 'The shape'], answer: 1,
            explain: 'Read that file back and you get a column called Unnamed: 0, and it grows every round trip.' },
          { id: 'd5-wdo-2', prompt: 'Which argument keeps the row numbers out of the file?',
            choices: ['index=False', 'header=False', 'drop_index=True', 'rows=False'], answer: 0,
            explain: 'header=False would remove the column names instead, which is almost never what you want.' },
          { id: 'd5-wdo-3', prompt: 'When should the index be written out?',
            choices: ['Always', 'Never', 'When it is meaningful, such as a date or an id', 'Only for JSON'], answer: 2,
            explain: 'If the index is the label for the row, dropping it loses information; give it a name so the column has a header.' },
          { id: 'd5-wdo-4', prompt: 'A saved file has grown Unnamed: 0 and Unnamed: 0.1. What happened?',
            choices: ['Corruption', 'It has been read and rewritten twice with the index written each time', 'Two separators', 'A merge'], answer: 1,
            explain: 'Each round trip turns the previous index into a real column and then writes a new index beside it.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'checking-what-you-loaded',
        title: 'Checking What You Loaded',
        summary: 'Four questions to ask a new table before you trust a number from it.',
        objectives: [
          'Run the same four checks on any table you did not build.',
          'Use the distinct values of a category column as a fifth check.',
          'Say what each check would have caught.',
          'Report what you found, rather than only acting on it.',
        ],
        why: 'Every silent failure in this unit is caught by one of these checks, and together they take about four lines. The reason to make them a habit rather than a debugging step is that they are cheapest before you have built an analysis on top of the table, and most expensive after you have published one.',
        sections: [
          {
            heading: 'The four questions',
            intro: 'How many rows, what are the columns, what type is each, and how much is missing. In that order, because each one can make the next pointless.',
            steps: [
              {
                heading: 'All four, in four lines',
                prose: 'Shape first — a surprise here means stop and fix the load. Then dtypes, then the gaps.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score,city\\nAda,92,Leeds\\nGrace,,York\\nAlan,79,Leeds\\n"\ndf = pd.read_csv(StringIO(text))\n\nprint(df.shape)\nprint(list(df.columns))\nprint(df.dtypes.to_dict())\nprint(df.isna().sum().to_dict())',
              },
              {
                heading: 'What each one would have caught',
                prose: 'Shape catches a wrong separator and a lost header row. dtypes catches an unnamed missing marker and a numeric column read as text. The missing counts catch a column that is mostly empty — which is a fact worth reporting rather than a problem to fix silently.',
                code: 'import pandas as pd\nfrom io import StringIO\n\n# A wrong separator: one column, and the name is the whole header line.\nprint(pd.read_csv(StringIO("a;b\\n1;2\\n")).shape)\n\n# An unnamed marker: the column is text, not numbers.\nprint(pd.read_csv(StringIO("v\\n1\\nn/a\\n"))["v"].dtype)',
              },
            ],
          },
          {
            heading: 'Distinct values catch the rest',
            intro: 'For a column that should hold a handful of categories, the set of what is actually in it is the fastest way to find the fifth problem: the same thing spelled two ways.',
            steps: [
              {
                heading: 'What is actually in there',
                prose: '<code>value_counts</code> gives the distinct values and how common each is. Two spellings of one city show up immediately, and a group-by would otherwise have split them without a word.',
                code: 'import pandas as pd\n\ncity = pd.Series(["Leeds", "leeds", "York", "Leeds "])\nprint(city.value_counts())\nprint(city.nunique())',
                note: 'Three of those four are the same city. Stripping whitespace and lowercasing before grouping is usually the fix, and knowing it was needed is the point of looking.',
              },
              {
                heading: 'A range check on the numbers',
                prose: 'For a numeric column, min and max are the cheap version of the same question: are these values possible? A score of 999 or a negative age is a sentinel or an error, and both are easier to see here than in a mean.',
                code: 'import pandas as pd\n\nscores = pd.Series([92, 88, 999])\nprint(scores.min(), scores.max(), round(scores.mean(), 2))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'All four on one table',
            prompt: 'Run all four checks on this table and say what each tells you. One of the columns is not the type it should be.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,n/a\\n"\ndf = pd.read_csv(StringIO(text))\n\nprint(df.shape)\nprint(list(df.columns))\nprint(df.dtypes.to_dict())\nprint(df.isna().sum().to_dict())\n',
          },
          {
            after: 1,
            title: 'Find the duplicate spelling',
            prompt: 'Count the distinct cities, then count them again after stripping and lowercasing. The two numbers should differ.',
            starter: 'import pandas as pd\n\ncity = pd.Series(["Leeds", "leeds", "York", "Leeds "])\n\nprint(city.nunique())\nprint(None)   # after .str.strip().str.lower()\n',
          },
        ],
        use: {
          cards: [
            { title: 'Every time a file is read', text: 'Shape, dtypes, missing counts and a look at the first rows — before any number is trusted.', code: 'print(df.shape, df.isna().sum())' },
            { title: 'When the data is updated', text: 'The same checks catch a new column, a changed marker or a doubled file.' },
          ],
          avoid: 'Do not skip the checks because the file loaded last time. Files change; the checks are cheap and the wrong answer is not.',
        },
        exercises: [
          {
            title: 'A load report',
            prompt: 'Write <code>load_report(path)</code> that reads a CSV and returns a tuple of the row count, the sorted column names, and how many values are missing in the whole table.',
            starter: 'import pandas as pd\n\ndef load_report(path):\n    # (rows, [columns], missing values)\n    return None\n\nprint(load_report("scores.csv"))\n',
            files: { 'scores.csv': 'name,score\nAda,92\nGrace,\nAlan,79\n' },
            call: 'load_report("scores.csv")',
            expectValue: "(3, ['name', 'score'], 1)",
            hidden: [
              { name: 'a complete file reports nothing missing',
                files: { 'scores.csv': 'name,score\na,1\nb,2\n' }, call: 'load_report("scores.csv")', expect: "(2, ['name', 'score'], 0)" },
              { name: 'gaps in more than one column are all counted',
                files: { 'scores.csv': 'name,score\n,1\nb,\n' }, call: 'load_report("scores.csv")', expect: "(2, ['name', 'score'], 2)" },
              READ_CSV,
            ],
            hint: 'df.isna().sum() gives a count per column; summing that again gives the total. int() at the end keeps it a plain number.',
            correct: 'import pandas as pd\n\ndef load_report(path):\n    df = pd.read_csv(path)\n    return (df.shape[0], sorted(df.columns), int(df.isna().sum().sum()))\n',
            wrong: 'import pandas as pd\n\ndef load_report(path):\n    df = pd.read_csv(path)\n    return (df.shape[0], sorted(df.columns), 0)\n',
          },
          {
            title: 'How many distinct, really',
            prompt: 'Write <code>distinct_cities(path)</code> that reads a file with a <code>city</code> column and returns how many distinct cities it holds, treating values that differ only by surrounding spaces or capitals as the same.',
            starter: 'import pandas as pd\n\ndef distinct_cities(path):\n    # Distinct cities, ignoring case and surrounding spaces.\n    return 0\n\nprint(distinct_cities("places.csv"))\n',
            files: { 'places.csv': 'city\nLeeds\nleeds\nYork\n' },
            call: 'distinct_cities("places.csv")',
            expectValue: '2',
            hidden: [
              { name: 'surrounding spaces do not make a new city',
                files: { 'places.csv': 'city\nLeeds\nLeeds \n' }, call: 'distinct_cities("places.csv")', expect: '1' },
              { name: 'genuinely different cities are all counted',
                files: { 'places.csv': 'city\nA\nB\nC\n' }, call: 'distinct_cities("places.csv")', expect: '3' },
              { name: 'a single row counts one',
                files: { 'places.csv': 'city\nSolo\n' }, call: 'distinct_cities("places.csv")', expect: '1' },
              READ_CSV,
            ],
            hint: 'Read the column, then .str.strip().str.lower() before .nunique(). Counting without normalising first is the mistake the first hidden case checks.',
            correct: 'import pandas as pd\n\ndef distinct_cities(path):\n    city = pd.read_csv(path)["city"]\n    return int(city.str.strip().str.lower().nunique())\n',
            wrong: 'import pandas as pd\n\ndef distinct_cities(path):\n    return int(pd.read_csv(path)["city"].nunique())\n',
          },
        ],
        questions: [
          { id: 'd5-cwl-1', prompt: 'Which is NOT one of the four questions to ask a new table?',
            choices: ['How many rows and columns', 'What type is each column', 'How much is missing', 'What is the mean of every column'], answer: 3,
            explain: 'A mean is a result, not a check. The fourth question is what the columns are.' },
          { id: 'd5-cwl-2', prompt: 'What does value_counts on a category column catch?',
            choices: ['Missing values only', 'The same thing spelled two ways', 'Wrong dtypes', 'Duplicate rows'], answer: 1,
            explain: '"Leeds" and "leeds" are two groups to a group-by and one city to a reader.' },
          { id: 'd5-cwl-3', prompt: 'Why check min and max on a numeric column?',
            choices: ['To sort it', 'A sentinel like 999 or a negative age shows up there and not in the mean', 'To find duplicates', 'To set the dtype'], answer: 1,
            explain: 'The extremes are where impossible values sit. A mean absorbs them and looks plausible.' },
          { id: 'd5-cwl-4', prompt: 'When are these checks cheapest?',
            choices: ['After the analysis', 'Before anything is built on the table', 'Once published', 'They cost the same whenever'], answer: 1,
            explain: 'Every downstream result built on an unchecked table has to be redone once the table turns out to be wrong.' },
        ],
      },
    ],
  },
};
