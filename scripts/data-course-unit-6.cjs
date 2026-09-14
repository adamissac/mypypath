/* Python for Data, unit 6 — Filtering and Deriving.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * Two ideas run through this unit. The first is that a mask over a table is the
 * same object as a mask over an array, so unit 3 already taught the hard part.
 * The second is that the column answering your question is usually not in the
 * file, and deriving it is one line -- as long as you reach for the vectorised
 * form rather than apply.
 */

const NO_APPLY = {
  name: 'the vectorised form does the work',
  kind: 'ast',
  forbids: { loops: true },
  describe: 'column operations rather than a loop',
};
const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;
const pds = (literal) => `__import__("pandas").Series(${literal})`;

module.exports = {
  unit6: {
    title: 'Filtering and Deriving',
    blurb: 'Selecting the rows you meant, and building the column that answers the question.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'filtering-with-masks',
        title: 'Filtering with Masks',
        summary: 'The same idea as numpy, applied to whole rows.',
        objectives: [
          'Filter a table with a condition on one of its columns.',
          'Combine conditions with <code>&amp;</code> and <code>|</code>, bracketed.',
          'Say what happens to rows whose value is missing.',
          'Notice how many rows a filter dropped.',
        ],
        why: 'Filtering is the operation you will reach for more than any other, and it has exactly two traps: <code>and</code> does not work, and rows with NaN fall out of both a condition and its opposite. Both are worth meeting on purpose here rather than in an analysis whose totals do not add up.',
        sections: [
          {
            heading: 'A condition on a column selects rows',
            intro: 'The mask is one True or False per row, and putting it in the brackets keeps the rows it marked — the whole row, not just the column you tested.',
            steps: [
              {
                heading: 'Mask, then select',
                prose: 'Exactly the numpy idea from unit 3, with the difference that the unit of selection is a row.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace", "Alan"], "score": [92, 88, 79]})\nmask = df["score"] > 85\nprint(mask)\nprint(df[mask])',
              },
              {
                heading: 'Count what you dropped',
                prose: 'A filter that leaves three rows out of five hundred is either the answer or a bug, and the only way to tell is to look at the number.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [92, 88, 79, 60]})\nkept = df[df["score"] > 85]\nprint(f"{len(kept)} of {len(df)} rows kept")',
              },
            ],
          },
          {
            heading: 'Combining conditions',
            intro: 'Use <code>&amp;</code> and <code>|</code> rather than <code>and</code> and <code>or</code>, and bracket each condition.',
            steps: [
              {
                heading: 'Two conditions',
                prose: 'The brackets are required because <code>&amp;</code> binds more tightly than the comparison operators.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [92, 88, 79, 60], "city": ["L", "Y", "L", "Y"]})\nprint(df[(df["score"] > 70) & (df["city"] == "L")])',
              },
              {
                heading: 'Negating one',
                prose: '<code>~</code> flips a mask. It is the readable way to say "everything except", and it is easier to check than rewriting the condition backwards.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"city": ["L", "Y", "L"]})\nprint(df[~(df["city"] == "L")])',
              },
              {
                heading: 'Where the missing rows go',
                prose: 'A comparison with NaN is never True, so a row with a missing value falls out of the filter <em>and</em> out of its opposite. The two halves do not add up to the whole table, and nothing says so.',
                code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"score": [92, np.nan, 60]})\nhigh = df[df["score"] > 80]\nlow = df[df["score"] <= 80]\nprint(len(high), "+", len(low), "=", len(high) + len(low), "of", len(df))',
                note: 'If the two halves have to account for every row, filter on <code>.notna()</code> first and report the missing ones separately, rather than letting them vanish.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'How many survived',
            prompt: 'Filter to scores above 70 and print how many rows you kept out of how many you started with.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [92, 88, 79, 60, 45]})\n\nkept = df[df["score"] > 70]\nprint(len(kept), "of", len(df))\n',
          },
          {
            after: 1,
            title: 'The rows that vanish',
            prompt: 'Run this and check whether the two halves add up to the whole table. Then fix it so they do.',
            starter: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"score": [92, np.nan, 60]})\n\nhigh = df[df["score"] > 80]\nlow = df[df["score"] <= 80]\nprint(len(high) + len(low), "of", len(df))\n',
          },
        ],
        exercises: [
          {
            title: 'The names that passed',
            prompt: 'Write <code>passing_names(df, mark)</code> returning a list of names whose score is at least <code>mark</code>, in the order they appear.',
            starter: 'import pandas as pd\n\ndef passing_names(df, mark):\n    # Names at or above the mark.\n    return []\n\nprint(passing_names(pd.DataFrame({"name": ["Ada"], "score": [92]}), 85))\n',
            call: `passing_names(${pdf('{"name": ["Ada", "Grace", "Alan"], "score": [92, 88, 79]}')}, 85)`,
            expectValue: "['Ada', 'Grace']",
            hidden: [
              { name: 'a score exactly on the mark passes', call: `passing_names(${pdf('{"name": ["Bo"], "score": [85]}')}, 85)`, expect: "['Bo']" },
              { name: 'nobody passing gives an empty list', call: `passing_names(${pdf('{"name": ["Bo"], "score": [10]}')}, 85)`, expect: '[]' },
            ],
            hint: 'Mask the table, then take the name column of what survives and turn it into a list with .tolist().',
            correct: 'import pandas as pd\n\ndef passing_names(df, mark):\n    return df[df["score"] >= mark]["name"].tolist()\n',
            wrong: 'import pandas as pd\n\ndef passing_names(df, mark):\n    return df[df["score"] > mark]["name"].tolist()\n',
          },
          {
            title: 'Account for every row',
            prompt: 'Write <code>split_counts(df, mark)</code> returning a three-element list of [at or above the mark, below it, missing a score]. The three must add up to the number of rows.',
            starter: 'import pandas as pd\n\ndef split_counts(df, mark):\n    # [passed, failed, unknown] -- and they must total len(df).\n    return [0, 0, 0]\n\nprint(split_counts(pd.DataFrame({"score": [92, 60, None]}), 85))\n',
            call: `split_counts(${pdf('{"score": [92, 60, None]}')}, 85)`,
            expectValue: '[1, 1, 1]',
            hidden: [
              { name: 'with nothing missing the third is zero', call: `split_counts(${pdf('{"score": [90, 10]}')}, 85)`, expect: '[1, 1, 0]' },
              { name: 'the three always total the row count',
                call: `sum(split_counts(${pdf('{"score": [1, None, 3, None]}')}, 2)) == 4`, expect: 'True' },
              { name: 'a score on the mark counts as passed', call: `split_counts(${pdf('{"score": [85]}')}, 85)`, expect: '[1, 0, 0]' },
              { name: 'an empty table counts nothing', call: `split_counts(${pdf('{"score": []}')}, 85)`, expect: '[0, 0, 0]' },
            ],
            hint: 'Count the missing ones with .isna().sum() first, then the two comparisons. A comparison is never True for NaN, so those rows fall out of both and have to be counted separately.',
            correct: 'import pandas as pd\n\ndef split_counts(df, mark):\n    s = df["score"]\n    return [int((s >= mark).sum()), int((s < mark).sum()), int(s.isna().sum())]\n',
            wrong: 'import pandas as pd\n\ndef split_counts(df, mark):\n    s = df["score"]\n    return [int((s >= mark).sum()), int(len(s) - (s >= mark).sum()), 0]\n',
          },
        ],
        questions: [
          { id: 'd6-fwm-1', prompt: 'df[df["score"] > 80] returns what?',
            choices: ['The score column', 'The rows where the condition is True', 'A boolean frame', 'The first 80 rows'], answer: 1,
            explain: 'The mask is per row, so the whole row survives or none of it does.' },
          { id: 'd6-fwm-2', prompt: 'Which operators combine two conditions on a DataFrame?',
            choices: ['and / or', '& / | with each condition bracketed', '&& / ||', 'AND / OR'], answer: 1,
            explain: 'Python’s and wants a single truth value; the brackets are needed because & binds tighter than the comparisons.' },
          { id: 'd6-fwm-3', prompt: 'A row has NaN in the column you are filtering on. Where does it end up?',
            choices: ['In the result', 'In neither the filter nor its opposite', 'It raises', 'It is filled with 0'], answer: 1,
            explain: 'A comparison with NaN is never True, so the two halves do not add up to the whole table.' },
          { id: 'd6-fwm-4', prompt: 'What does ~mask do?',
            choices: ['Sorts it', 'Flips every True and False', 'Counts it', 'Drops it'], answer: 1,
            explain: 'The readable way to say "everything except", and easier to check than rewriting the condition backwards.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'isin-between-and-query',
        title: 'isin, between and query',
        summary: 'Three ways to say a condition that reads like the question.',
        objectives: [
          'Test membership of a set with <code>isin</code>.',
          'Test a range with <code>between</code>, and know which ends it includes.',
          'Write a condition as a sentence with <code>query</code>.',
          'Pick the form that reads closest to the question being asked.',
        ],
        why: 'All three of these do things you could already do with masks. They matter because a filter you can read is a filter you can check, and a chain of six <code>|</code>s is not one. Choosing the clearest form is a correctness decision, not a style one.',
        sections: [
          {
            heading: 'isin for a set of values',
            intro: 'Testing against several values with a chain of <code>==</code> and <code>|</code> works and reads badly. <code>isin</code> takes the list.',
            steps: [
              {
                heading: 'The readable form',
                prose: 'And it does not get longer as the list grows, which matters when the list comes from somewhere else.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "computing"]})\nprint(df[df["subject"].isin(["maths", "computing"])])',
              },
              {
                heading: 'Negating it',
                prose: '"Everything except these" is <code>~</code> in front of the whole thing.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "computing"]})\nprint(df[~df["subject"].isin(["art"])])',
              },
            ],
          },
          {
            heading: 'between for a range',
            intro: '<code>between</code> is inclusive at both ends by default, which is usually what a question means by "between 60 and 80".',
            steps: [
              {
                heading: 'Both ends included',
                prose: 'One call instead of two comparisons and a pair of brackets.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [55, 60, 70, 80, 85]})\nprint(df[df["score"].between(60, 80)])',
              },
              {
                heading: 'When you meant something else',
                prose: 'Pass <code>inclusive</code> to change it. Saying so explicitly is better than writing two comparisons and hoping the reader checks them.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [55, 60, 70, 80, 85]})\nprint(df[df["score"].between(60, 80, inclusive="neither")])',
              },
            ],
          },
          {
            heading: 'query for a condition that reads as a sentence',
            intro: 'Inside <code>query</code> the string is parsed by pandas, so the ordinary words work and the brackets go away.',
            steps: [
              {
                heading: 'Plain and, plain or',
                prose: 'Column names are bare, and a Python variable is reachable with an <code>@</code> in front of it.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [92, 88, 60], "city": ["L", "Y", "L"]})\nprint(df.query("score > 80 and city == \'L\'"))\n\nmark = 85\nprint(df.query("score > @mark"))',
                note: 'query is not faster in any way that matters at this size. The argument for it is that the filter reads like the question, which is what makes it checkable.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'A list of subjects',
            prompt: 'Select the rows in maths or computing twice — once with <code>|</code> and once with <code>isin</code> — and compare which you would rather read.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "computing", "art"]})\n\nprint(df[(df["subject"] == "maths") | (df["subject"] == "computing")])\nprint(None)   # the same thing with isin\n',
          },
          {
            after: 2,
            title: 'The same filter, three ways',
            prompt: 'Select scores from 60 to 80 inclusive with a pair of comparisons, with <code>between</code>, and with <code>query</code>.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [55, 60, 70, 80, 85]})\n\nprint(len(df[(df["score"] >= 60) & (df["score"] <= 80)]))\nprint(None)   # between\nprint(None)   # query\n',
          },
        ],
        exercises: [
          {
            title: 'Count the rows in a set of subjects',
            prompt: 'Write <code>in_subjects(df, subjects)</code> returning the number of rows whose <code>subject</code> is one of <code>subjects</code>.',
            starter: 'import pandas as pd\n\ndef in_subjects(df, subjects):\n    # How many rows are in one of these subjects?\n    return 0\n\nprint(in_subjects(pd.DataFrame({"subject": ["maths"]}), ["maths"]))\n',
            call: `in_subjects(${pdf('{"subject": ["maths", "art", "computing"]}')}, ["maths", "computing"])`,
            expectValue: '2',
            hidden: [
              { name: 'nothing matching counts zero', call: `in_subjects(${pdf('{"subject": ["art"]}')}, ["maths"])`, expect: '0' },
              { name: 'an empty list of subjects matches nothing', call: `in_subjects(${pdf('{"subject": ["art"]}')}, [])`, expect: '0' },
              { name: 'isin does the matching', kind: 'ast', forbids: { loops: true }, describe: 'isin rather than a loop over the rows' },
            ],
            hint: 'df["subject"].isin(subjects) is the mask. Its sum is the count, and int() makes it a plain number.',
            correct: 'import pandas as pd\n\ndef in_subjects(df, subjects):\n    return int(df["subject"].isin(subjects).sum())\n',
            wrong: 'import pandas as pd\n\ndef in_subjects(df, subjects):\n    return len(df)\n',
          },
          {
            title: 'Names in a band',
            prompt: 'Write <code>band_names(df, low, high)</code> returning the names whose score is between <code>low</code> and <code>high</code> inclusive, in the order they appear. Say the range once rather than as two comparisons.',
            starter: 'import pandas as pd\n\ndef band_names(df, low, high):\n    # Names scoring between low and high, both ends included.\n    return []\n\nprint(band_names(pd.DataFrame({"name": ["Ada"], "score": [92]}), 60, 80))\n',
            call: `band_names(${pdf('{"name": ["Ada", "Grace", "Alan"], "score": [92, 70, 60]}')}, 60, 80)`,
            expectValue: "['Grace', 'Alan']",
            hidden: [
              { name: 'both ends are included', call: `band_names(${pdf('{"name": ["lo", "hi"], "score": [60, 80]}')}, 60, 80)`, expect: "['lo', 'hi']" },
              { name: 'nothing in the band gives an empty list', call: `band_names(${pdf('{"name": ["x"], "score": [5]}')}, 60, 80)`, expect: '[]' },
              { name: 'the original order is kept', call: `band_names(${pdf('{"name": ["b", "a"], "score": [70, 65]}')}, 60, 80)`, expect: "['b', 'a']" },
              NO_APPLY,
            ],
            hint: 'df["score"].between(low, high) is inclusive at both ends by default. Mask the table with it, then take the name column.',
            correct: 'import pandas as pd\n\ndef band_names(df, low, high):\n    return df[df["score"].between(low, high)]["name"].tolist()\n',
            wrong: 'import pandas as pd\n\ndef band_names(df, low, high):\n    return df[df["score"].between(low, high, inclusive="neither")]["name"].tolist()\n',
          },
        ],
        questions: [
          { id: 'd6-ibq-1', prompt: 'What does df["city"].isin(["Leeds", "York"]) replace?',
            choices: ['A group-by', 'A chain of == joined with |', 'A sort', 'A merge'], answer: 1,
            explain: 'And it does not get longer as the list grows, which is the point.' },
          { id: 'd6-ibq-2', prompt: 'Does between include its endpoints?',
            choices: ['Neither', 'Both, by default', 'Only the lower', 'Only the upper'], answer: 1,
            explain: 'inclusive= changes it; saying so explicitly beats writing two comparisons and hoping the reader checks them.' },
          { id: 'd6-ibq-3', prompt: 'What does query let you write?',
            choices: ['SQL', 'A condition as a sentence, with plain and/or and bare column names', 'A faster filter', 'A join'], answer: 1,
            explain: 'A Python variable is reachable inside it with an @ in front. The argument for query is legibility, not speed.' },
          { id: 'd6-ibq-4', prompt: 'Why does a filter you can read matter?',
            choices: ['It runs faster', 'A filter you can read is one you can check', 'It uses less memory', 'It does not matter'], answer: 1,
            explain: 'A chain of six | conditions is where an accidental wrong comparison hides.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'derived-columns',
        title: 'Derived Columns',
        summary: 'The column that answers your question usually is not in the file.',
        objectives: [
          'Build a column from arithmetic between other columns.',
          'Divide a column by one of its own summaries.',
          'Use <code>assign</code> when you want to keep a chain going.',
          'Say why a rate is usually more comparable than a total.',
        ],
        why: 'Files hold what was recorded; questions are about rates, shares and differences. "Which region sells most" and "which region sells most per head" are different questions with different answers, and only one of them is in the file.',
        sections: [
          {
            heading: 'Arithmetic between columns',
            intro: 'Columns combine row by row, so a rate, a total or a difference is one expression.',
            steps: [
              {
                heading: 'Two columns in, one out',
                prose: 'The alignment is by index, so the rows always line up with themselves.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"sales": [100.0, 90.0], "people": [4, 3]})\ndf["per_person"] = df["sales"] / df["people"]\nprint(df)',
              },
              {
                heading: 'A column against its own total',
                prose: 'Dividing a column by its sum broadcasts the single total across every row, giving each row\'s share.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"amount": [25.0, 75.0]})\ndf["share"] = df["amount"] / df["amount"].sum() * 100\nprint(df)',
              },
              {
                heading: 'Why the rate is the fairer comparison',
                prose: 'The biggest total is often just the biggest region. Per head, the ranking can reverse entirely — and that reversal is usually the finding.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"region": ["A", "B"], "sales": [1000.0, 300.0], "people": [500, 50]})\ndf["per_person"] = df["sales"] / df["people"]\nprint(df)',
              },
            ],
          },
          {
            heading: 'assign keeps the chain going',
            intro: '<code>assign</code> returns a new table with the column added, which is useful when you are building a pipeline rather than editing a variable.',
            steps: [
              {
                heading: 'One expression, several steps',
                prose: 'Each step hands a table to the next, and nothing in between needs a name. It also leaves the original alone, which the plain assignment form does not.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"sales": [1000.0, 300.0], "people": [500, 50]})\n\nresult = (df\n          .assign(per_person=lambda d: d["sales"] / d["people"])\n          .sort_values("per_person", ascending=False))\nprint(result)\nprint(list(df.columns))   # untouched',
                note: 'The lambda receives the table as it is at that point in the chain, which is what lets a later assign use a column an earlier one just made.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Total against rate',
            prompt: 'Add a <code>per_person</code> column, then print the region with the highest total and the region with the highest rate. They are not the same.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"region": ["A", "B"], "sales": [1000.0, 300.0], "people": [500, 50]})\n\ndf["per_person"] = df["sales"] / df["people"]\nprint(df.loc[df["sales"].idxmax(), "region"])\nprint(None)   # highest per_person\n',
          },
          {
            after: 1,
            title: 'A chain with assign',
            prompt: 'Build the same per-person column with <code>assign</code>, sort by it, and confirm the original table is unchanged.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"sales": [1000.0, 300.0], "people": [500, 50]})\n\nresult = df.assign(per_person=lambda d: d["sales"] / d["people"])\nprint(result)\nprint(list(df.columns))\n',
          },
        ],
        exercises: [
          {
            title: 'Each row as a share of the total',
            prompt: 'Write <code>percent_of_total(df)</code> returning each row\'s <code>amount</code> as a percentage of the column total, rounded to one decimal place.',
            starter: 'import pandas as pd\n\ndef percent_of_total(df):\n    # Each amount as a percentage of the total, 1dp.\n    return []\n\nprint(percent_of_total(pd.DataFrame({"amount": [25.0, 75.0]})))\n',
            call: `percent_of_total(${pdf('{"amount": [25.0, 75.0]}')})`,
            expectValue: '[25.0, 75.0]',
            hidden: [
              { name: 'a single row is all of the total', call: `percent_of_total(${pdf('{"amount": [8.0]}')})`, expect: '[100.0]' },
              { name: 'equal amounts split evenly', call: `percent_of_total(${pdf('{"amount": [1.0, 1.0, 2.0]}')})`, expect: '[25.0, 25.0, 50.0]' },
              { name: 'the total comes from the column', kind: 'ast', forbids: { loops: true }, describe: 'the column divided by its own sum' },
            ],
            hint: 'Divide the column by its own sum and multiply by 100. The division broadcasts the single total across every row.',
            correct: 'import pandas as pd\n\ndef percent_of_total(df):\n    return (df["amount"] / df["amount"].sum() * 100).round(1).tolist()\n',
            wrong: 'import pandas as pd\n\ndef percent_of_total(df):\n    return (df["amount"] / 100 * 100).round(1).tolist()\n',
          },
          {
            title: 'The best rate, not the biggest total',
            prompt: 'Write <code>best_rate(df)</code> returning the <code>region</code> with the highest sales per person, where the table has <code>region</code>, <code>sales</code> and <code>people</code> columns.',
            starter: 'import pandas as pd\n\ndef best_rate(df):\n    # The region with the highest sales per person.\n    return None\n\nprint(best_rate(pd.DataFrame({"region": ["A", "B"], "sales": [1000.0, 300.0], "people": [500, 50]})))\n',
            call: `best_rate(${pdf('{"region": ["A", "B"], "sales": [1000.0, 300.0], "people": [500, 50]}')})`,
            expectValue: "'B'",
            hidden: [
              { name: 'the biggest total can also be the best rate',
                call: `best_rate(${pdf('{"region": ["A", "B"], "sales": [900.0, 100.0], "people": [10, 10]}')})`, expect: "'A'" },
              { name: 'one region wins by default', call: `best_rate(${pdf('{"region": ["Solo"], "sales": [5.0], "people": [1]}')})`, expect: "'Solo'" },
              { name: 'the rate, not the total, decides',
                call: `best_rate(${pdf('{"region": ["big", "small"], "sales": [1000.0, 10.0], "people": [1000, 1]}')})`, expect: "'small'" },
              NO_APPLY,
            ],
            hint: 'Build the rate as a column, then use idxmax to get the row label of the highest and read the region off it. Ranking on sales alone is what the third hidden case catches.',
            correct: 'import pandas as pd\n\ndef best_rate(df):\n    rate = df["sales"] / df["people"]\n    return df.loc[rate.idxmax(), "region"]\n',
            wrong: 'import pandas as pd\n\ndef best_rate(df):\n    return df.loc[df["sales"].idxmax(), "region"]\n',
          },
        ],
        questions: [
          { id: 'd6-dc-1', prompt: 'How do you build a rate column from two existing columns?',
            choices: ['df.rate("a", "b")', 'df["rate"] = df["a"] / df["b"]', 'df.apply(rate)', 'df.derive("rate")'], answer: 1,
            explain: 'Ordinary column arithmetic, aligned by index and applied to the whole column at once.' },
          { id: 'd6-dc-2', prompt: 'What does df["x"] / df["x"].sum() give you?',
            choices: ['The total', 'Each row’s share of the total', 'The mean', 'An error'], answer: 1,
            explain: 'The single total is broadcast across every row, which is where a share or a percentage comes from.' },
          { id: 'd6-dc-3', prompt: 'What does assign return?',
            choices: ['None', 'A new table with the column added', 'The column', 'The original, modified'], answer: 1,
            explain: 'Which is what lets it sit in the middle of a chain and leave the original alone.' },
          { id: 'd6-dc-4', prompt: 'Why prefer a rate to a total when comparing regions?',
            choices: ['It is easier to compute', 'The biggest total is often just the biggest region', 'Totals are inaccurate', 'There is no reason'], answer: 1,
            explain: 'Per head the ranking can reverse, and that reversal is usually the finding.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'apply-and-when-not-to',
        title: 'apply, and When Not To',
        summary: 'A general escape hatch that is slower than the thing it usually replaces.',
        objectives: [
          'Say what <code>apply</code> does and what it costs.',
          'Reach for <code>.str</code> and <code>.dt</code> methods before reaching for apply.',
          'Recognise the cases where apply genuinely is the answer.',
          'Rewrite an apply as a vectorised expression.',
        ],
        why: 'apply is the first thing people find, because it lets you write ordinary Python over a column. It is also a Python loop wearing a pandas coat, and on a large table it can be a hundred times slower than the built-in it replaced. Knowing what it costs is what makes reaching for it a choice rather than a habit.',
        sections: [
          {
            heading: 'apply runs your function per value',
            intro: 'It is flexible and it is a Python loop underneath, so it costs far more than the vectorised operation it usually replaces.',
            steps: [
              {
                heading: 'What it does',
                prose: 'Your function is called once per element, in Python, and the results are collected into a new Series.',
                code: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79])\nprint(scores.apply(lambda s: s + 5))\nprint(scores + 5)          # the same answer, without the loop',
              },
              {
                heading: 'axis=1 is the expensive one',
                prose: 'Applying across rows builds a Series object per row and calls your function with it. On a large table this is the slowest thing in this course.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"a": [1, 2], "b": [10, 20]})\nprint(df.apply(lambda r: r["a"] + r["b"], axis=1))\nprint(df["a"] + df["b"])   # the same answer, vectorised',
              },
            ],
          },
          {
            heading: 'Reach for the built-in first',
            intro: 'Arithmetic, comparisons, <code>.str</code> methods and <code>.dt</code> methods all have vectorised forms. Almost every apply people write is one of these.',
            steps: [
              {
                heading: 'The .str accessor',
                prose: 'Every string method you know, applied to a whole column, without a loop and without apply.',
                code: 'import pandas as pd\n\nnames = pd.Series([" Ada ", "GRACE"])\nprint(names.str.strip().str.lower())\nprint(names.str.len())\nprint(names.str.contains("A"))',
              },
              {
                heading: 'Choosing between values',
                prose: '<code>np.where</code> and <code>.map</code> cover the two cases people usually reach for apply to solve: a two-way choice, and a lookup.',
                code: 'import pandas as pd\nimport numpy as np\n\nscores = pd.Series([92, 60])\nprint(np.where(scores >= 70, "pass", "fail"))\n\ncodes = pd.Series(["L", "Y"])\nprint(codes.map({"L": "Leeds", "Y": "York"}))',
              },
              {
                heading: 'When apply really is the answer',
                prose: 'When the operation genuinely has no vectorised form — parsing an awkward string format, calling an external function, anything with real branching per row — apply is the right tool and there is nothing to feel bad about. It is the unconsidered apply that costs.',
                code: 'import pandas as pd\n\ndef band(row):\n    if row["score"] > 90 and row["city"] == "L":\n        return "local star"\n    return "other"\n\ndf = pd.DataFrame({"score": [92, 92], "city": ["L", "Y"]})\nprint(df.apply(band, axis=1).tolist())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'The same answer, two ways',
            prompt: 'Double this column with <code>apply</code> and then without it, and check the results match.',
            starter: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79])\n\nby_apply = scores.apply(lambda s: s * 2)\nby_column = None\n\nprint(by_apply.tolist())\nprint(by_column)\n',
          },
          {
            after: 1,
            title: 'Rewrite without apply',
            prompt: 'Each of these uses apply for something with a built-in. Rewrite all three.',
            starter: 'import pandas as pd\n\nnames = pd.Series([" Ada ", "GRACE"])\n\nprint(names.apply(lambda n: n.strip()).tolist())\nprint(names.apply(lambda n: len(n)).tolist())\nprint(names.apply(lambda n: n.lower()).tolist())\n',
          },
        ],
        exercises: [
          {
            title: 'Clean a column of names',
            prompt: 'Write <code>clean_names(names)</code> that takes a Series of names and returns a list with the spaces trimmed and everything lowercased. Use the vectorised string methods rather than apply.',
            starter: 'import pandas as pd\n\ndef clean_names(names):\n    # Trimmed and lowercased, as a list.\n    return []\n\nprint(clean_names(pd.Series([" Ada ", "GRACE"])))\n',
            call: `clean_names(${pds('[" Ada ", "GRACE"]')})`,
            expectValue: "['ada', 'grace']",
            hidden: [
              { name: 'already clean names are unchanged', call: `clean_names(${pds('["bo"]')})`, expect: "['bo']" },
              { name: 'an empty Series stays empty', call: `clean_names(${pds('[], dtype="object"')})`, expect: '[]' },
              { name: 'the vectorised string methods do the work', kind: 'ast', forbids: { loops: true }, describe: '.str methods rather than apply or a loop' },
            ],
            hint: 'names.str.strip().str.lower() does both steps to the whole column, and .tolist() hands back plain strings.',
            correct: 'import pandas as pd\n\ndef clean_names(names):\n    return names.str.strip().str.lower().tolist()\n',
            wrong: 'import pandas as pd\n\ndef clean_names(names):\n    return names.apply(lambda n: n.strip()).tolist()\n',
          },
          {
            title: 'Pass or fail, without a loop',
            prompt: 'Write <code>verdicts(scores, mark)</code> returning a list of <code>"pass"</code> or <code>"fail"</code> for each score, using a vectorised two-way choice rather than apply.',
            starter: 'import pandas as pd\nimport numpy as np\n\ndef verdicts(scores, mark):\n    # "pass" at or above the mark, "fail" below.\n    return []\n\nprint(verdicts(pd.Series([92, 60]), 70))\n',
            call: `verdicts(${pds('[92, 60]')}, 70)`,
            expectValue: "['pass', 'fail']",
            hidden: [
              { name: 'a score on the mark passes', call: `verdicts(${pds('[70]')}, 70)`, expect: "['pass']" },
              { name: 'everyone can fail', call: `verdicts(${pds('[1, 2]')}, 70)`, expect: "['fail', 'fail']" },
              { name: 'an empty Series gives an empty list', call: `verdicts(${pds('[], dtype="float64"')}, 70)`, expect: '[]' },
              { name: 'no loop and no apply', kind: 'ast', forbids: { loops: true }, describe: 'np.where rather than apply or a comprehension' },
            ],
            hint: 'np.where(scores >= mark, "pass", "fail") makes the whole column at once. Finish with .tolist() so the result is plain Python strings rather than numpy ones.',
            correct: 'import pandas as pd\nimport numpy as np\n\ndef verdicts(scores, mark):\n    return np.where(scores >= mark, "pass", "fail").tolist()\n',
            wrong: 'import pandas as pd\nimport numpy as np\n\ndef verdicts(scores, mark):\n    return np.where(scores > mark, "pass", "fail").tolist()\n',
          },
        ],
        questions: [
          { id: 'd6-awn-1', prompt: 'What is apply doing underneath?',
            choices: ['Compiled vectorised code', 'A Python loop over the values', 'A group-by', 'Nothing, it is lazy'], answer: 1,
            explain: 'Which is why it costs far more than the built-in it usually replaces.' },
          { id: 'd6-awn-2', prompt: 'Which is the better way to add two columns?',
            choices: ['df.apply(lambda r: r["a"] + r["b"], axis=1)', 'df["a"] + df["b"]', 'A for loop', 'df.map(add)'], answer: 1,
            explain: 'Column arithmetic is vectorised; apply with axis=1 builds a Series per row and is the slowest option here.' },
          { id: 'd6-awn-3', prompt: 'What does .str give you?',
            choices: ['The column as text', 'Vectorised string methods over the whole column', 'A single string', 'An error on numbers'], answer: 1,
            explain: 'strip, lower, contains, len and the rest, applied to every value without a loop.' },
          { id: 'd6-awn-4', prompt: 'When is apply genuinely the right tool?',
            choices: ['For any arithmetic', 'When the operation has no vectorised form', 'For speed', 'Never'], answer: 1,
            explain: 'Real branching per row, an awkward parse, an external call. It is the unconsidered apply that costs.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'binning-values',
        title: 'Binning Values',
        summary: 'Turning a measurement into a band you can count.',
        objectives: [
          'Divide a numeric range into labelled bands with <code>cut</code>.',
          'Say which side of a boundary a value falls on.',
          'Choose between equal-width and equal-frequency bands.',
          'Count how many landed in each band.',
        ],
        why: 'You cannot count a continuous measurement — every value is its own group. Binning is what turns "age" into "age group" and "score" into "grade", and the edges you choose are an argument you are making about the data, which is why cut makes you write them down.',
        sections: [
          {
            heading: 'cut divides a range into labelled bands',
            intro: 'Grades, age groups and price brackets are all the same operation: choose the edges, name the bands.',
            steps: [
              {
                heading: 'Edges and labels',
                prose: 'There is always one more edge than there are labels, because each band sits between two edges.',
                code: 'import pandas as pd\n\nscores = pd.Series([95, 85, 75, 60])\nbands = pd.cut(scores, bins=[-1, 69, 79, 89, 100],\n               labels=["F", "C", "B", "A"])\nprint(bands.tolist())',
              },
              {
                heading: 'Counting the bands',
                prose: 'This is what the binning was for. <code>value_counts</code> on the banded column gives the distribution.',
                code: 'import pandas as pd\n\nscores = pd.Series([95, 85, 75, 60, 92])\nbands = pd.cut(scores, bins=[-1, 69, 79, 89, 100],\n               labels=["F", "C", "B", "A"])\nprint(bands.value_counts().sort_index())',
              },
            ],
          },
          {
            heading: 'The edges are a decision',
            intro: 'Whether 89 is a B or an A is your call, and <code>cut</code> makes you write it down rather than leaving it implied.',
            steps: [
              {
                heading: 'Which side a boundary falls on',
                prose: 'By default each band includes its right-hand edge and excludes its left. So with an edge at 89, a score of 89 is in the band ending at 89 — and 90 starts the next one.',
                code: 'import pandas as pd\n\nedges = [-1, 69, 79, 89, 100]\nlabels = ["F", "C", "B", "A"]\nprint(pd.cut(pd.Series([89, 90]), bins=edges, labels=labels).tolist())',
                note: 'The lowest edge is -1 rather than 0 so that a score of exactly 0 has a band. An edge equal to the lowest possible value excludes it, and the result is NaN.',
              },
              {
                heading: 'Anything outside the edges is NaN',
                prose: 'Not an error — a value with no band. Worth counting, because it usually means the edges did not cover the real range.',
                code: 'import pandas as pd\n\nbanded = pd.cut(pd.Series([50, 150]), bins=[0, 100], labels=["in range"])\nprint(banded.tolist())\nprint("unbanded:", int(banded.isna().sum()))',
              },
              {
                heading: 'Equal width, or equal counts',
                prose: '<code>cut</code> with a number makes bands of equal width. <code>qcut</code> makes bands holding roughly equal numbers of rows. They answer different questions and can look very different on skewed data.',
                code: 'import pandas as pd\n\nvalues = pd.Series([1, 2, 3, 4, 100])\nprint(pd.cut(values, bins=2).value_counts().tolist())\nprint(pd.qcut(values, q=2).value_counts().tolist())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Band and count',
            prompt: 'Band these scores into the four grades and print how many are in each.',
            starter: 'import pandas as pd\n\nscores = pd.Series([95, 85, 75, 60, 92, 88])\nbands = pd.cut(scores, bins=[-1, 69, 79, 89, 100], labels=["F", "C", "B", "A"])\n\nprint(bands.tolist())\nprint(None)   # how many in each band\n',
          },
          {
            after: 1,
            title: 'Equal width against equal counts',
            prompt: 'This column has one large outlier. Band it both ways and compare how many land in each band.',
            starter: 'import pandas as pd\n\nvalues = pd.Series([1, 2, 3, 4, 100])\n\nprint(pd.cut(values, bins=2).value_counts().tolist())\nprint(pd.qcut(values, q=2).value_counts().tolist())\n',
          },
        ],
        exercises: [
          {
            title: 'Letter grades',
            prompt: 'Write <code>grade(scores)</code> that returns a list of letter grades: 90 and above is an A, 80 to 89 a B, 70 to 79 a C, and anything below 70 an F.',
            starter: 'import pandas as pd\n\ndef grade(scores):\n    # A, B, C or F for each score.\n    return []\n\nprint(grade(pd.Series([95, 85, 75, 60])))\n',
            call: `grade(${pds('[95, 85, 75, 60]')})`,
            expectValue: "['A', 'B', 'C', 'F']",
            hidden: [
              { name: 'the boundaries land in the right band', call: `grade(${pds('[90, 80, 70]')})`, expect: "['A', 'B', 'C']" },
              { name: 'a perfect score is still an A', call: `grade(${pds('[100]')})`, expect: "['A']" },
              { name: 'the bottom of the range is an F', call: `grade(${pds('[0]')})`, expect: "['F']" },
            ],
            hint: 'cut with edges at -1, 69, 79, 89 and 100 puts each boundary score in the band above it, because the right-hand edge belongs to its band.',
            correct: 'import pandas as pd\n\ndef grade(scores):\n    return pd.cut(scores, bins=[-1, 69, 79, 89, 100],\n                  labels=["F", "C", "B", "A"]).tolist()\n',
            wrong: 'import pandas as pd\n\ndef grade(scores):\n    return pd.cut(scores, bins=[-1, 70, 80, 90, 100],\n                  labels=["F", "C", "B", "A"]).tolist()\n',
          },
          {
            title: 'How many in each band',
            prompt: 'Write <code>band_counts(scores)</code> that bands the scores into the same four grades and returns a dictionary from grade to how many scored it. A grade nobody reached still appears, with 0.',
            starter: 'import pandas as pd\n\ndef band_counts(scores):\n    # {"F": n, "C": n, "B": n, "A": n}\n    return {}\n\nprint(band_counts(pd.Series([95, 85, 60])))\n',
            call: `band_counts(${pds('[95, 85, 60]')})`,
            expectValue: "{'F': 1, 'C': 0, 'B': 1, 'A': 1}",
            hidden: [
              { name: 'a grade nobody reached is still reported', call: `band_counts(${pds('[100]')})`, expect: "{'F': 0, 'C': 0, 'B': 0, 'A': 1}" },
              { name: 'everyone in one band', call: `band_counts(${pds('[95, 92]')})`, expect: "{'F': 0, 'C': 0, 'B': 0, 'A': 2}" },
              { name: 'the counts are plain integers', call: `all(type(v).__name__ == "int" for v in band_counts(${pds('[95]')}).values())`, expect: 'True' },
            ],
            hint: 'cut gives a categorical column, and value_counts on it keeps every category including the empty ones. Sort by the category order and build the dict with int() values.',
            correct: 'import pandas as pd\n\ndef band_counts(scores):\n    bands = pd.cut(scores, bins=[-1, 69, 79, 89, 100],\n                   labels=["F", "C", "B", "A"])\n    counts = bands.value_counts().sort_index()\n    return {str(k): int(v) for k, v in counts.items()}\n',
            wrong: 'import pandas as pd\n\ndef band_counts(scores):\n    bands = pd.cut(scores, bins=[-1, 69, 79, 89, 100],\n                   labels=["F", "C", "B", "A"])\n    counts = bands.value_counts()\n    return {str(k): int(v) for k, v in counts.items() if v > 0}\n',
          },
        ],
        questions: [
          { id: 'd6-bv-1', prompt: 'What does pd.cut do?',
            choices: ['Removes rows', 'Turns a numeric column into labelled bands', 'Sorts the values', 'Splits the table'], answer: 1,
            explain: 'Which is what lets you count a continuous measurement, where every raw value would otherwise be its own group.' },
          { id: 'd6-bv-2', prompt: 'How many edges do four bands need?',
            choices: ['Four', 'Five', 'Three', 'Eight'], answer: 1,
            explain: 'Each band sits between two edges, so there is always one more edge than label.' },
          { id: 'd6-bv-3', prompt: 'Which side of a band does a boundary value fall on, by default?',
            choices: ['The lower band — the right edge belongs to its band', 'The upper band', 'Neither, it is NaN', 'It raises'], answer: 0,
            explain: 'Bands are right-inclusive by default, which is why grade edges are written at 69, 79 and 89 rather than 70, 80 and 90.' },
          { id: 'd6-bv-4', prompt: 'What is the difference between cut and qcut?',
            choices: ['None', 'cut makes equal-width bands; qcut makes bands with roughly equal counts', 'qcut is faster', 'cut only takes integers'], answer: 1,
            explain: 'They answer different questions, and on skewed data they look very different.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'sorting-and-top-n',
        title: 'Sorting and Top N',
        summary: 'Ordering a table, and taking the few rows that matter.',
        objectives: [
          'Sort a table by one column, and by several.',
          'Say what <code>sort_values</code> returns.',
          'Take the top few rows with <code>nlargest</code>.',
          'Decide what happens to ties and to missing values.',
        ],
        why: 'Sorting is where the "returns a new table" rule bites hardest, because a sort you forget to assign looks like a sort that did not work. And "the top five" is a question worth asking directly rather than by sorting everything and slicing.',
        sections: [
          {
            heading: 'sort_values returns a new table',
            intro: '<code>by</code> names the column, <code>ascending</code> chooses the direction, and the original is untouched unless you reassign.',
            steps: [
              {
                heading: 'The result is the point',
                prose: 'Same rule as <code>drop</code> and <code>rename</code>. Calling it and ignoring the return is a no-op.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Alan"], "score": [92, 79]})\ndf.sort_values("score")\nprint(df)                 # unchanged\nprint(df.sort_values("score"))',
              },
              {
                heading: 'Several columns, and ties',
                prose: 'A list of columns sorts by the first, then breaks ties with the second. Without a tiebreaker the order among equal values is whatever it was — stable, but not meaningful.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"city": ["Y", "L", "L"], "name": ["Bo", "Zoe", "Ada"], "score": [88, 88, 92]})\nprint(df.sort_values(["score", "name"], ascending=[False, True]))',
              },
              {
                heading: 'Where missing values go',
                prose: 'NaN sorts to the end by default, whichever direction you chose. <code>na_position="first"</code> changes it — and if the missing rows matter, saying so beats letting them sit quietly at the bottom.',
                code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"score": [92, np.nan, 79]})\nprint(df.sort_values("score")["score"].tolist())\nprint(df.sort_values("score", na_position="first")["score"].tolist())',
              },
            ],
          },
          {
            heading: 'nlargest says what you meant',
            intro: 'Sorting the whole table to look at three rows is more work than the question needs, and reads less clearly.',
            steps: [
              {
                heading: 'The top few, directly',
                prose: 'It takes the count and the column, and does both the ordering and the slice. Asking for more rows than exist gives you all of them rather than an error.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace", "Alan"], "score": [92, 88, 79]})\nprint(df.nlargest(2, "score"))\nprint(df.nlargest(10, "score").shape)',
              },
              {
                heading: 'And the bottom few',
                prose: '<code>nsmallest</code> is the same idea the other way up, and is clearer than sorting ascending and taking the head.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace", "Alan"], "score": [92, 88, 79]})\nprint(df.nsmallest(1, "score")["name"].tolist())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'The sort that did nothing',
            prompt: 'Run this as it stands, then fix it so the table actually comes back sorted.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Alan"], "score": [92, 79]})\n\ndf.sort_values("score")\nprint(df)\n',
          },
          {
            after: 1,
            title: 'Top three, two ways',
            prompt: 'Take the three highest scores by sorting and slicing, and then with <code>nlargest</code>. Check they agree.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"name": list("abcde"), "score": [5, 1, 9, 3, 7]})\n\nprint(df.sort_values("score", ascending=False).head(3)["name"].tolist())\nprint(None)   # the same, with nlargest\n',
          },
        ],
        exercises: [
          {
            title: 'The top scorers',
            prompt: 'Write <code>top_names(df, n)</code> returning the names of the <code>n</code> highest scorers, best first.',
            starter: 'import pandas as pd\n\ndef top_names(df, n):\n    # The n best, highest first.\n    return []\n\nprint(top_names(pd.DataFrame({"name": ["Ada", "Alan"], "score": [92, 79]}), 1))\n',
            call: `top_names(${pdf('{"name": ["Ada", "Grace", "Alan"], "score": [92, 88, 79]}')}, 2)`,
            expectValue: "['Ada', 'Grace']",
            hidden: [
              { name: 'asking for none gives none', call: `top_names(${pdf('{"name": ["Ada"], "score": [92]}')}, 0)`, expect: '[]' },
              { name: 'asking for more than there is gives everyone', call: `top_names(${pdf('{"name": ["Ada"], "score": [92]}')}, 5)`, expect: "['Ada']" },
              { name: 'the order is highest first', call: `top_names(${pdf('{"name": ["Low", "High"], "score": [1, 9]}')}, 2)`, expect: "['High', 'Low']" },
            ],
            hint: 'nlargest takes the count and the column and does both the sort and the slice. Sorting ascending and taking the head gives you the worst, not the best.',
            correct: 'import pandas as pd\n\ndef top_names(df, n):\n    return df.nlargest(n, "score")["name"].tolist()\n',
            wrong: 'import pandas as pd\n\ndef top_names(df, n):\n    return df.sort_values("score")["name"].head(n).tolist()\n',
          },
          {
            title: 'Break the tie on purpose',
            prompt: 'Write <code>ranked(df)</code> returning every name ordered by score highest first, with ties broken by name alphabetically. Without the tiebreaker the order among equal scores is not meaningful.',
            starter: 'import pandas as pd\n\ndef ranked(df):\n    # Highest score first; equal scores in alphabetical order.\n    return []\n\nprint(ranked(pd.DataFrame({"name": ["Zoe", "Ada"], "score": [88, 88]})))\n',
            call: `ranked(${pdf('{"name": ["Zoe", "Ada"], "score": [88, 88]}')})`,
            expectValue: "['Ada', 'Zoe']",
            hidden: [
              { name: 'score still wins over name', call: `ranked(${pdf('{"name": ["Zoe", "Ada"], "score": [92, 88]}')})`, expect: "['Zoe', 'Ada']" },
              { name: 'a three-way tie sorts alphabetically', call: `ranked(${pdf('{"name": ["c", "a", "b"], "score": [1, 1, 1]}')})`, expect: "['a', 'b', 'c']" },
              { name: 'one row is already ranked', call: `ranked(${pdf('{"name": ["solo"], "score": [1]}')})`, expect: "['solo']" },
            ],
            hint: 'sort_values takes a list of columns and a matching list of directions: ["score", "name"] with ascending=[False, True].',
            correct: 'import pandas as pd\n\ndef ranked(df):\n    return df.sort_values(["score", "name"], ascending=[False, True])["name"].tolist()\n',
            wrong: 'import pandas as pd\n\ndef ranked(df):\n    return df.sort_values("score", ascending=False)["name"].tolist()\n',
          },
        ],
        questions: [
          { id: 'd6-stn-1', prompt: 'What does df.sort_values("score") return?',
            choices: ['None, it sorts in place', 'A new sorted table', 'The score column', 'The top row'], answer: 1,
            explain: 'Assign it or pass inplace=True. A sort you forget to assign looks like a sort that did not work.' },
          { id: 'd6-stn-2', prompt: 'What is the clearest way to get the five highest rows?',
            choices: ['Sort then head(5)', 'nlargest(5, "score")', 'Both work; nlargest states the intent', 'max() five times'], answer: 2,
            explain: 'Both are correct; nlargest does not order the rows you were never going to look at.' },
          { id: 'd6-stn-3', prompt: 'Where do NaN values sort to by default?',
            choices: ['The start', 'The end, whichever direction you chose', 'They are dropped', 'It raises'], answer: 1,
            explain: 'na_position="first" changes it. If the missing rows matter, say so rather than letting them sit at the bottom.' },
          { id: 'd6-stn-4', prompt: 'How do you break ties on a second column?',
            choices: ['Sort twice', 'Pass a list of columns to by', 'It is not possible', 'Use nlargest'], answer: 1,
            explain: 'With a matching list for ascending, so each column can have its own direction.' },
        ],
      },
    ],
  },
};
