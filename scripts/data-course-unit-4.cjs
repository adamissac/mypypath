/* Python for Data, unit 4 — Series and DataFrames.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * The through-line of this unit is the index. It is what a Series has that an
 * array does not, it is what makes loc and iloc different, and it is what
 * aligns two columns when you combine them. Every lesson comes back to it.
 */

const PANDAS = (name = 'pandas does the work') => ({
  name, kind: 'ast', requires: { imports: ['pandas'] }, describe: 'pandas rather than plain Python',
});
const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;
const pds = (literal) => `__import__("pandas").Series(${literal})`;

module.exports = {
  unit4: {
    title: 'Series and DataFrames',
    blurb: 'The two pandas objects, and the labels that make them different from arrays.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'the-series',
        title: 'The Series',
        summary: 'A column with labels attached, and the labels travel with the data.',
        objectives: [
          'Build a Series with an index and read a value by its label.',
          'Say what a Series has that a numpy array does not.',
          'Use the numpy operations you already know on a Series.',
          'Tell <code>max</code> from <code>idxmax</code>, and know which question each answers.',
        ],
        why: 'A DataFrame is a collection of Series, so everything here is the foundation for the next six units. The index in particular is not decoration: it is what survives a filter, what lines two columns up when you add them, and what turns "the highest score" into "who got the highest score".',
        sections: [
          {
            heading: 'A labelled column',
            intro: 'A Series is one column of values plus an index. Build one from a list and pandas supplies 0, 1, 2 as the index; supply your own and the labels become how you reach the values.',
            steps: [
              {
                heading: 'Values and labels together',
                prose: 'The index is printed down the left. Reaching for a label gives you the value beside it, in the same way a dictionary key would.',
                code: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79], index=["Ada", "Grace", "Alan"])\nprint(scores)\nprint(scores["Grace"])',
              },
              {
                heading: 'The labels survive what you do to it',
                prose: 'This is the part that matters. Filter the Series and the surviving values keep their own labels, so you never have to track which position belonged to whom.',
                code: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79], index=["Ada", "Grace", "Alan"])\nhigh = scores[scores > 85]\nprint(high)\nprint(list(high.index))',
              },
            ],
          },
          {
            heading: 'Everything numpy did, a Series does too',
            intro: 'Masks, arithmetic and aggregation all carry over unchanged. What is added is that the labels come with them.',
            steps: [
              {
                heading: 'The familiar operations',
                prose: 'If unit 3 made sense, none of this is new. A Series is an array with an index bolted on.',
                code: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79], index=["Ada", "Grace", "Alan"])\nprint(scores.mean())\nprint(scores + 5)\nprint(scores[scores > 85])',
              },
              {
                heading: 'Two different questions',
                prose: '<code>max</code> gives the value. <code>idxmax</code> gives the label of the row it was on. Confusing them is easy and the wrong one is never an error, just a wrong answer.',
                code: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79], index=["Ada", "Grace", "Alan"])\nprint(scores.max())      # what the best score was\nprint(scores.idxmax())   # who got it',
              },
              {
                heading: 'Alignment, and where NaN comes from',
                prose: 'Adding two Series matches them on their labels, not their positions. A label present in one and missing from the other gives NaN — which is either exactly what you wanted or the quietest bug in pandas.',
                code: 'import pandas as pd\n\nterm1 = pd.Series([90, 80], index=["Ada", "Grace"])\nterm2 = pd.Series([70, 60], index=["Grace", "Alan"])\nprint(term1 + term2)',
                note: 'Nothing is out of order and nothing raised. Ada and Alan are NaN because each appears in only one of the two terms.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Reach by label',
            prompt: 'Print Alan’s score, then every score above 80 with its label, then the list of labels that survived.',
            starter: 'import pandas as pd\n\nscores = pd.Series([92, 88, 79], index=["Ada", "Grace", "Alan"])\n\nprint(scores["Alan"])\nprint(None)   # the scores above 80\nprint(None)   # just their labels\n',
          },
          {
            after: 1,
            title: 'Watch the alignment',
            prompt: 'Predict what this prints before you run it. Then reorder the second Series and confirm the answer does not change.',
            starter: 'import pandas as pd\n\na = pd.Series([1, 2, 3], index=["x", "y", "z"])\nb = pd.Series([10, 20, 30], index=["z", "y", "x"])\n\nprint(a + b)\n',
          },
        ],
        exercises: [
          {
            title: 'Who scored highest',
            prompt: 'Write <code>top_scorer(scores)</code> that takes a Series of scores indexed by name and returns the name of the highest scorer.',
            starter: 'import pandas as pd\n\ndef top_scorer(scores):\n    # The label of the largest value.\n    return None\n\nprint(top_scorer(pd.Series([92, 88], index=["Ada", "Grace"])))\n',
            call: `top_scorer(${pds('[92, 88, 79], index=["Ada", "Grace", "Alan"]')})`,
            expectValue: "'Ada'",
            hidden: [
              { name: 'the winner can be anywhere in the Series', call: `top_scorer(${pds('[70, 99, 80], index=["a", "b", "c"]')})`, expect: "'b'" },
              { name: 'one entry wins by default', call: `top_scorer(${pds('[5], index=["solo"]')})`, expect: "'solo'" },
              { name: 'the label is returned, not the score', call: `type(top_scorer(${pds('[1], index=["x"]')})).__name__`, expect: "'str'" },
            ],
            hint: 'idxmax gives the label of the largest value; max would give you the value itself, which is the other question.',
            correct: 'import pandas as pd\n\ndef top_scorer(scores):\n    return scores.idxmax()\n',
            wrong: 'import pandas as pd\n\ndef top_scorer(scores):\n    return scores.max()\n',
          },
          {
            title: 'Above their own average',
            prompt: 'Write <code>above_average(scores)</code> that takes a Series indexed by name and returns a list of the names whose score is strictly above the mean of the Series. Keep the labels; do not work with positions.',
            starter: 'import pandas as pd\n\ndef above_average(scores):\n    # The names scoring above the mean, as a list.\n    return []\n\nprint(above_average(pd.Series([90, 80, 70], index=["Ada", "Grace", "Alan"])))\n',
            call: `above_average(${pds('[90, 80, 70], index=["Ada", "Grace", "Alan"]')})`,
            expectValue: "['Ada']",
            hidden: [
              { name: 'more than one name can qualify', call: `above_average(${pds('[10, 10, 1], index=["a", "b", "c"]')})`, expect: "['a', 'b']" },
              { name: 'identical scores put nobody above the mean', call: `above_average(${pds('[5, 5], index=["x", "y"]')})`, expect: '[]' },
              { name: 'a single entry is its own mean', call: `above_average(${pds('[7], index=["solo"]')})`, expect: '[]' },
              { name: 'the labels come from the index', call: `above_average(${pds('[1, 9], index=["low", "high"]')})`, expect: "['high']" },
            ],
            hint: 'Mask the Series with scores > scores.mean(), then read .index off what survives and turn it into a list.',
            correct: 'import pandas as pd\n\ndef above_average(scores):\n    return list(scores[scores > scores.mean()].index)\n',
            wrong: 'import pandas as pd\n\ndef above_average(scores):\n    return list(scores[scores >= scores.mean()].index)\n',
          },
        ],
        questions: [
          { id: 'd4-ser-1', prompt: 'What does a Series have that a numpy array does not?',
            choices: ['A dtype', 'An index of labels', 'Elementwise arithmetic', 'A length'], answer: 1,
            explain: 'The labels are the addition, and they survive filtering and align on arithmetic.' },
          { id: 'd4-ser-2', prompt: 'What is the difference between s.max() and s.idxmax()?',
            choices: ['None', 'max gives the value, idxmax gives its label', 'idxmax is faster', 'max only works on numbers'], answer: 1,
            explain: '"What was the best score" and "who got it" are different questions, and neither call errors when you pick the wrong one.' },
          { id: 'd4-ser-3', prompt: 'What does scores[scores > 85] return?',
            choices: ['True or False', 'The scores above 85, with their labels', 'The labels only', 'The count'], answer: 1,
            explain: 'The same mask idea as numpy, except the index comes along with the values that survive.' },
          { id: 'd4-ser-4', prompt: 'Adding two Series with partly different indexes gives what for a label in only one?',
            choices: ['0', 'NaN', 'The value it does have', 'An error'], answer: 1,
            explain: 'Alignment is by label. A label with no partner has nothing to add, so the result is missing rather than wrong.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'building-a-dataframe',
        title: 'Building a DataFrame',
        summary: 'A table is a dictionary of columns that share one index.',
        objectives: [
          'Build a DataFrame from a dictionary of columns and from a list of records.',
          'Read <code>shape</code>, <code>columns</code>, <code>head</code> and <code>info</code> as the first four questions.',
          'Explain why every column shares one index.',
          'Spot a load that went wrong from its shape alone.',
        ],
        why: 'Every table you meet for the rest of this course is a DataFrame, and almost every confusing result comes from not having looked at it first. The four checks in this lesson take two lines and catch a wrong separator, a missing header and a numeric column read as text.',
        sections: [
          {
            heading: 'From a dictionary of columns',
            intro: 'The keys become column names and the values become the columns. Every column shares the same index, which is what makes a row a row.',
            steps: [
              {
                heading: 'Columns first',
                prose: 'This is the shape pandas thinks in. A DataFrame is not a list of rows that happens to be rectangular; it is a set of columns that happen to line up.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "name": ["Ada", "Grace", "Alan"],\n    "score": [92, 88, 79],\n})\nprint(df)\nprint(df.shape)',
              },
              {
                heading: 'From records, when that is what you have',
                prose: 'A list of dictionaries works too, and it is what an API usually hands you. The union of the keys becomes the columns, and a record missing a key gets NaN.',
                code: 'import pandas as pd\n\nrecords = [{"name": "Ada", "score": 92}, {"name": "Grace"}]\nprint(pd.DataFrame(records))',
              },
              {
                heading: 'One index, shared',
                prose: 'Both columns are Series over the same index. Pull one out and the index comes with it — which is why a filtered column still knows which rows it came from.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace"], "score": [92, 88]})\nprint(df["score"].index)\nprint(df.index)',
              },
            ],
          },
          {
            heading: 'The first four things to ask it',
            intro: '<code>shape</code>, <code>columns</code>, <code>head</code> and <code>info</code> answer "what am I holding" before you do anything else. Skipping them is where most confusing results begin.',
            steps: [
              {
                heading: 'How much, and what of',
                prose: 'Shape first, because a number you did not expect here means the rest is not worth reading yet.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada"], "score": [92]})\nprint(df.shape)\nprint(list(df.columns))\nprint(df.head())',
              },
              {
                heading: 'info answers two questions at once',
                prose: 'It gives the dtype of every column and how many non-null values each holds, which is the fastest way to see both a text column that should be numeric and a column full of holes.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": ["92", "88"], "n": [1, None]})\ndf.info()',
              },
            ],
            note: 'A one-column DataFrame where you expected six is the signature of the wrong separator. The shape told you before any of the numbers did.',
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two ways in',
            prompt: 'Build the same table twice — once from a dictionary of columns and once from a list of records — and check the shapes match.',
            starter: 'import pandas as pd\n\nby_column = pd.DataFrame({"name": ["Ada", "Grace"], "score": [92, 88]})\nby_record = None   # the same table, from a list of dicts\n\nprint(by_column.shape)\nprint(by_record)\n',
          },
          {
            after: 1,
            title: 'Four questions',
            prompt: 'Ask this table all four questions in turn. One of the columns is not the type you would want.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace"], "score": ["92", "88"]})\n\nprint(df.shape)\nprint(list(df.columns))\nprint(df.head())\nprint(df.dtypes)\n',
          },
        ],
        exercises: [
          {
            title: 'Describe a table',
            prompt: 'Write <code>describe_table(df)</code> that returns a tuple of the number of rows, the number of columns, and the column names as a list.',
            starter: 'import pandas as pd\n\ndef describe_table(df):\n    # (rows, columns, [names])\n    return None\n\nprint(describe_table(pd.DataFrame({"a": [1, 2]})))\n',
            call: `describe_table(${pdf('{"name": ["Ada", "Grace"], "score": [92, 88]}')})`,
            expectValue: "(2, 2, ['name', 'score'])",
            hidden: [
              { name: 'one column is still counted', call: `describe_table(${pdf('{"a": [1, 2, 3]}')})`, expect: "(3, 1, ['a'])" },
              { name: 'the counts are measured, not assumed', call: `describe_table(${pdf('{"x": [1], "y": [2], "z": [3]}')})`, expect: "(1, 3, ['x', 'y', 'z'])" },
              { name: 'shape is asked for rather than counted by hand', kind: 'ast', forbids: { loops: true }, describe: 'df.shape rather than a loop over the columns' },
            ],
            hint: 'df.shape is a tuple of rows and columns. list(df.columns) turns the column index into plain names.',
            correct: 'import pandas as pd\n\ndef describe_table(df):\n    return (df.shape[0], df.shape[1], list(df.columns))\n',
            wrong: 'import pandas as pd\n\ndef describe_table(df):\n    return (df.shape[1], df.shape[0], list(df.columns))\n',
          },
          {
            title: 'One index, shared by every column',
            prompt: 'Write <code>labelled(columns, labels)</code> that builds a DataFrame from a dictionary of columns, using <code>labels</code> as the index, and returns the index labels as a list. Every column shares that one index.',
            starter: 'import pandas as pd\n\ndef labelled(columns, labels):\n    # Build the table with labels as its index, return the labels.\n    return []\n\nprint(labelled({"score": [92, 88]}, ["Ada", "Grace"]))\n',
            call: 'labelled({"score": [92, 88]}, ["Ada", "Grace"])',
            expectValue: "['Ada', 'Grace']",
            hidden: [
              { name: 'every column gets the same index',
                call: 'labelled({"a": [1, 2], "b": [3, 4]}, ["x", "y"])', expect: "['x', 'y']" },
              { name: 'the index really is on the table',
                call: 'list(__import__("pandas").DataFrame({"s": [1, 2]}, index=["p", "q"]).index) == labelled({"s": [1, 2]}, ["p", "q"])',
                expect: 'True' },
              { name: 'one row is a valid table', call: 'labelled({"a": [7]}, ["solo"])', expect: "['solo']" },
              PANDAS('the table is built with pandas'),
            ],
            hint: 'pd.DataFrame takes an index= argument. Build the table with it, then return list(df.index) rather than handing back the labels you were given.',
            correct: 'import pandas as pd\n\ndef labelled(columns, labels):\n    df = pd.DataFrame(columns, index=labels)\n    return list(df.index)\n',
            wrong: 'import pandas as pd\n\ndef labelled(columns, labels):\n    pd.DataFrame(columns)\n    return sorted(labels)\n',
          },
        ],
        questions: [
          { id: 'd4-bdf-1', prompt: 'What does df.shape give you?',
            choices: ['The column names', 'A (rows, columns) tuple', 'The dtypes', 'The number of cells'], answer: 1,
            explain: 'Rows first, the same order as indexing.' },
          { id: 'd4-bdf-2', prompt: 'In pd.DataFrame({"score": [92, 88]}), what does the key become?',
            choices: ['A row label', 'The column name', 'The index', 'A dtype'], answer: 1,
            explain: 'A DataFrame is a dictionary of columns, so the keys are the column names.' },
          { id: 'd4-bdf-3', prompt: 'Which are worth doing before you summarise a table?',
            choices: ['Nothing, just summarise', 'shape, columns, head and dtypes', 'Sort it', 'Drop the index'], answer: 1,
            explain: 'Two lines that catch a wrong separator, a missing header and a numeric column read as text.' },
          { id: 'd4-bdf-4', prompt: 'You expected six columns and shape says (1000, 1). What happened?',
            choices: ['The file is empty', 'The separator was wrong, so each line became one value', 'The header is missing', 'The dtypes are wrong'], answer: 1,
            explain: 'Every line arrived as a single unsplit string. The shape said so before any of the values did.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'selecting-columns-and-rows',
        title: 'Selecting Columns and Rows',
        summary: 'loc goes by label, iloc goes by position, and the difference matters.',
        objectives: [
          'Take one column as a Series and several as a smaller table.',
          'Say what <code>loc</code> and <code>iloc</code> each read.',
          'Explain why they stop agreeing after a filter or a sort.',
          'Find a row by what it contains rather than by where it sits.',
        ],
        why: 'Almost every "why is this the wrong row" question comes from reaching for a position when you meant a label, or the reverse. The two look interchangeable on a freshly loaded table and stop being interchangeable the moment you sort or filter it — which is to say, immediately.',
        sections: [
          {
            heading: 'Columns by name',
            intro: 'One name gives a Series; a list of names gives a smaller DataFrame. The double brackets are not a typo — the inner pair is the list.',
            steps: [
              {
                heading: 'One column, or several',
                prose: 'Single brackets with one name give the column itself. Wrap the name in a list and you get a table back, with one column in it.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada", "Grace"], "score": [92, 88]})\nprint(type(df["score"]).__name__)\nprint(type(df[["score"]]).__name__)\nprint(df[["name", "score"]])',
              },
            ],
          },
          {
            heading: 'Rows by label or by position',
            intro: '<code>loc</code> reads the index label; <code>iloc</code> reads the position. They agree on a default index and disagree the moment it changes.',
            steps: [
              {
                heading: 'The two accessors',
                prose: 'Both take a row and optionally a column. loc names them; iloc counts them.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [92, 88, 79]}, index=["a", "b", "c"])\nprint(df.loc["b", "score"])    # by label\nprint(df.iloc[1]["score"])     # by position',
              },
              {
                heading: 'Where they part company',
                prose: 'Sort the table and the labels travel with their rows while the positions do not. After this sort, position 0 and label 0 are different rows.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [70, 99, 80]})\nbest = df.sort_values("score", ascending=False)\nprint(best)\nprint("iloc[0]:", best.iloc[0]["score"])   # the top score\nprint("loc[0]:", best.loc[0]["score"])     # still the original row 0',
                note: 'Neither is wrong. They are answering different questions, and a filtered or sorted table is where the difference becomes visible.',
              },
              {
                heading: 'One more asymmetry',
                prose: 'A loc slice includes its end label; an iloc slice excludes its end position, like every other slice in Python. This is worth knowing once rather than debugging twice.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [10, 20, 30, 40]})\nprint(len(df.loc[0:2]))    # 3 -- inclusive\nprint(len(df.iloc[0:2]))   # 2 -- exclusive',
              },
            ],
          },
          {
            heading: 'Finding a row by what is in it',
            intro: 'Usually you do not know either the label or the position — you know a value. Mask first, then read off what survives.',
            steps: [
              {
                heading: 'Mask, then take',
                prose: 'The mask keeps the rows you meant. <code>.iloc[0]</code> on the survivors takes the first of them, which is safe because you are indexing into the filtered result, not the original table.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Zoe", "Ada"], "score": [10, 92]})\nmatch = df[df["name"] == "Ada"]\nprint(match)\nprint(int(match["score"].iloc[0]))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Series or table',
            prompt: 'Print the type of each of these three. Two of them are the same and one is not.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"name": ["Ada"], "score": [92]})\n\nprint(type(df["score"]).__name__)\nprint(type(df[["score"]]).__name__)\nprint(type(df[["name", "score"]]).__name__)\n',
          },
          {
            after: 1,
            title: 'After a sort they disagree',
            prompt: 'Sort this table by score descending, then print <code>iloc[0]</code> and <code>loc[0]</code>. Say which one is "the best score" before you run it.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"score": [70, 99, 80]})\nbest = df.sort_values("score", ascending=False)\n\nprint(best.iloc[0]["score"])\nprint(best.loc[0]["score"])\n',
          },
        ],
        exercises: [
          {
            title: 'The score belonging to a name',
            prompt: 'Write <code>score_for(df, name)</code> that returns the score belonging to <code>name</code>, where the table has a <code>name</code> column and a <code>score</code> column.',
            starter: 'import pandas as pd\n\ndef score_for(df, name):\n    # The score on the row whose name matches.\n    return None\n\ndf = pd.DataFrame({"name": ["Ada", "Grace"], "score": [92, 88]})\nprint(score_for(df, "Grace"))\n',
            call: `score_for(${pdf('{"name": ["Ada", "Grace", "Alan"], "score": [92, 88, 79]}')}, "Alan")`,
            expectValue: '79',
            hidden: [
              { name: 'the first row is found too', call: `score_for(${pdf('{"name": ["Ada", "Grace"], "score": [92, 88]}')}, "Ada")`, expect: '92' },
              { name: 'the row is found by name, not by position', call: `score_for(${pdf('{"name": ["Zoe", "Ada"], "score": [10, 92]}')}, "Ada")`, expect: '92' },
            ],
            hint: 'Mask on the name column, then read the score off what survives. Assuming a position is the bug the second hidden case is looking for.',
            correct: 'import pandas as pd\n\ndef score_for(df, name):\n    return int(df[df["name"] == name]["score"].iloc[0])\n',
            wrong: 'import pandas as pd\n\ndef score_for(df, name):\n    return int(df["score"].iloc[0])\n',
          },
          {
            title: 'The top row, by position',
            prompt: 'Write <code>best_name(df)</code> that sorts the table by score descending and returns the name on the top row. Take the row by position on the sorted table, not by label.',
            starter: 'import pandas as pd\n\ndef best_name(df):\n    # Sort by score, return the name at the top.\n    return None\n\nprint(best_name(pd.DataFrame({"name": ["Zoe", "Ada"], "score": [10, 92]})))\n',
            call: `best_name(${pdf('{"name": ["Zoe", "Ada"], "score": [10, 92]}')})`,
            expectValue: "'Ada'",
            hidden: [
              { name: 'the winner is not assumed to be first', call: `best_name(${pdf('{"name": ["a", "b", "c"], "score": [1, 50, 2]}')})`, expect: "'b'" },
              { name: 'an already-sorted table still works', call: `best_name(${pdf('{"name": ["x", "y"], "score": [9, 1]}')})`, expect: "'x'" },
              { name: 'one row is its own winner', call: `best_name(${pdf('{"name": ["solo"], "score": [3]}')})`, expect: "'solo'" },
            ],
            hint: 'sort_values("score", ascending=False) then .iloc[0]["name"]. Using .loc[0] would give you the original row 0, which the first hidden case is checking.',
            correct: 'import pandas as pd\n\ndef best_name(df):\n    return df.sort_values("score", ascending=False).iloc[0]["name"]\n',
            wrong: 'import pandas as pd\n\ndef best_name(df):\n    return df.sort_values("score", ascending=False).loc[0]["name"]\n',
          },
        ],
        questions: [
          { id: 'd4-scr-1', prompt: 'What is the difference between loc and iloc?',
            choices: ['loc is faster', 'loc goes by label, iloc by position', 'loc is for columns', 'There is none'], answer: 1,
            explain: 'They agree on a default index and stop agreeing the moment you sort or filter.' },
          { id: 'd4-scr-2', prompt: 'What does df[["name", "score"]] return?',
            choices: ['A Series', 'A DataFrame with those two columns', 'A list', 'An error'], answer: 1,
            explain: 'The inner brackets are a list of names, and asking for a list of columns gives a table back.' },
          { id: 'd4-scr-3', prompt: 'After sorting a table, what does df.iloc[0] give you?',
            choices: ['The original first row', 'The row now at the top', 'An error', 'The index'], answer: 1,
            explain: 'Positions follow the new order; labels stay with their rows. That is precisely the difference.' },
          { id: 'd4-scr-4', prompt: 'How many rows does df.loc[0:2] return on a default index?',
            choices: ['Two', 'Three', 'Zero', 'It raises'], answer: 1,
            explain: 'A loc slice includes its end label, unlike every other slice in Python.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'adding-and-dropping-columns',
        title: 'Adding and Dropping Columns',
        summary: 'A new column is an assignment, and drop returns a new table by default.',
        objectives: [
          'Create a derived column from the columns you already have.',
          'Say what <code>drop</code> returns, and what it leaves behind.',
          'Take a copy before modifying a table a caller still owns.',
          'Rename a column without rebuilding the table.',
        ],
        why: 'The column that answers your question is usually not in the file — it is a rate, a difference, a share. Deriving one is a single assignment, and the only real trap is that half of these operations return a new table while the other half change yours, and the difference is not visible until something downstream is wrong.',
        sections: [
          {
            heading: 'A derived column',
            intro: 'Assigning to a name that does not exist creates it. The right-hand side is ordinary column arithmetic, applied to the whole column at once.',
            steps: [
              {
                heading: 'Create by assigning',
                prose: 'No method call and no declaration. If the name exists it is replaced; if not, it is added at the end.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"price": [10.0, 20.0]})\ndf["with_tax"] = df["price"] * 1.08\nprint(df)',
              },
              {
                heading: 'From two columns',
                prose: 'The arithmetic aligns on the index, so the rows always line up with themselves. This is the everyday case: a total, a rate, a difference from a target.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"price": [2.0, 5.0], "quantity": [3, 2]})\ndf["total"] = df["price"] * df["quantity"]\nprint(df)',
              },
              {
                heading: 'Renaming',
                prose: '<code>rename</code> takes a mapping and, like drop, hands back a new table unless you tell it otherwise.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"n": [1, 2]})\nprint(df.rename(columns={"n": "count"}).columns.tolist())\nprint(df.columns.tolist())   # unchanged',
              },
            ],
          },
          {
            heading: 'Dropping returns a copy',
            intro: '<code>drop</code> hands back a new table and leaves yours alone unless you reassign. This surprises people who expect it to behave like a list method.',
            steps: [
              {
                heading: 'The result is the point',
                prose: 'Calling drop and ignoring what it returns looks exactly like a no-op, because it is one.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"a": [1], "b": [2]})\nsmaller = df.drop(columns=["b"])\nprint(list(smaller.columns))\nprint(list(df.columns))      # still both',
              },
              {
                heading: 'Assignment is not a copy',
                prose: 'Two names for the same table are still one table. A function that assigns a column onto the DataFrame it was handed has changed its caller\'s data, and nothing says so.',
                code: 'import pandas as pd\n\ndef add_flag(table):\n    table["flag"] = True        # edits the caller\'s table\n    return table\n\ndf = pd.DataFrame({"a": [1]})\nadd_flag(df)\nprint(list(df.columns))',
              },
              {
                heading: 'Copy first',
                prose: 'One extra line makes the function honest: it returns something new and leaves what it was given alone.',
                code: 'import pandas as pd\n\ndef add_flag(table):\n    out = table.copy()\n    out["flag"] = True\n    return out\n\ndf = pd.DataFrame({"a": [1]})\nadd_flag(df)\nprint(list(df.columns))      # untouched',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'A rate per head',
            prompt: 'Add a <code>per_person</code> column equal to total divided by people, then a <code>rounded</code> column holding it to one decimal place.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"total": [100.0, 90.0], "people": [4, 3]})\n\ndf["per_person"] = df["total"] / df["people"]\ndf["rounded"] = None\nprint(df)\n',
          },
          {
            after: 1,
            title: 'Which one changed',
            prompt: 'Run this and note which of the two prints shows the extra column. Then add <code>.copy()</code> and run it again.',
            starter: 'import pandas as pd\n\ndef add_flag(table):\n    table["flag"] = True\n    return table\n\ndf = pd.DataFrame({"a": [1]})\nresult = add_flag(df)\n\nprint(list(result.columns))\nprint(list(df.columns))\n',
          },
        ],
        exercises: [
          {
            title: 'Add a total, leave the original alone',
            prompt: 'Write <code>add_total(df)</code> that returns a new table with a <code>total</code> column equal to <code>price</code> times <code>quantity</code>, leaving the table it was given unchanged.',
            starter: 'import pandas as pd\n\ndef add_total(df):\n    # A new table with a total column.\n    return df\n\nprint(add_total(pd.DataFrame({"price": [2.0], "quantity": [3]})))\n',
            call: `add_total(${pdf('{"price": [2.0, 5.0], "quantity": [3, 2]}')})["total"].tolist()`,
            expectValue: '[6.0, 10.0]',
            hidden: [
              { name: 'the original table is left alone',
                call: `(lambda d: (add_total(d), list(d.columns))[-1])(${pdf('{"price": [1.0], "quantity": [1]}')})`,
                expect: "['price', 'quantity']" },
              { name: 'the other columns survive', call: `sorted(add_total(${pdf('{"price": [1.0], "quantity": [2]}')}).columns)`, expect: "['price', 'quantity', 'total']" },
              { name: 'the total is computed from the two columns', kind: 'ast', requires: { binop: [{ op: 'Mult' }] }, describe: 'price multiplied by quantity' },
            ],
            hint: 'Take a copy first, then assign the new column onto the copy. Assigning straight onto df would change the caller\'s table, which the hidden case checks.',
            correct: 'import pandas as pd\n\ndef add_total(df):\n    out = df.copy()\n    out["total"] = out["price"] * out["quantity"]\n    return out\n',
            wrong: 'import pandas as pd\n\ndef add_total(df):\n    df["total"] = df["price"] * df["quantity"]\n    return df\n',
          },
          {
            title: 'Keep only what you need',
            prompt: 'Write <code>only(df, keep)</code> that returns a new table holding just the columns named in <code>keep</code>, in that order, without changing the table it was given.',
            starter: 'import pandas as pd\n\ndef only(df, keep):\n    # A new table with just those columns, in that order.\n    return df\n\nprint(only(pd.DataFrame({"a": [1], "b": [2], "c": [3]}), ["c", "a"]))\n',
            call: `list(only(${pdf('{"a": [1], "b": [2], "c": [3]}')}, ["c", "a"]).columns)`,
            expectValue: "['c', 'a']",
            hidden: [
              { name: 'the original keeps all its columns',
                call: `(lambda d: (only(d, ["a"]), list(d.columns))[-1])(${pdf('{"a": [1], "b": [2]}')})`,
                expect: "['a', 'b']" },
              { name: 'one column is a valid request', call: `list(only(${pdf('{"a": [1], "b": [2]}')}, ["b"]).columns)`, expect: "['b']" },
              { name: 'the rows come with the columns', call: `only(${pdf('{"a": [1, 2], "b": [3, 4]}')}, ["b"])["b"].tolist()`, expect: '[3, 4]' },
              { name: 'the result is a table, not a Series', call: `type(only(${pdf('{"a": [1]}')}, ["a"])).__name__`, expect: "'DataFrame'" },
            ],
            hint: 'df[keep] with a list of names already gives a new table in the order you asked for. Add .copy() so later edits to the result cannot reach back.',
            correct: 'import pandas as pd\n\ndef only(df, keep):\n    return df[keep].copy()\n',
            wrong: 'import pandas as pd\n\ndef only(df, keep):\n    return df.drop(columns=[c for c in df.columns if c not in keep])\n',
          },
        ],
        questions: [
          { id: 'd4-adc-1', prompt: 'What does df.drop(columns=["b"]) do to df?',
            choices: ['Removes b from df', 'Nothing — it returns a new table', 'Raises', 'Renames b'], answer: 1,
            explain: 'Assign the result or pass inplace=True. Calling it and ignoring the return is a no-op that looks like a bug elsewhere.' },
          { id: 'd4-adc-2', prompt: 'How do you create a new column?',
            choices: ['df.add("x", values)', 'df["x"] = values', 'df.insert_column("x")', 'df.new("x")'], answer: 1,
            explain: 'Assignment to a name that does not exist yet creates it.' },
          { id: 'd4-adc-3', prompt: 'Why take a copy before adding a column inside a function?',
            choices: ['For speed', 'Otherwise you change the caller’s table', 'To fix the dtype', 'copy() is never needed'], answer: 1,
            explain: 'A DataFrame passed in is the same object, not a copy, so assigning onto it is visible to whoever handed it over.' },
          { id: 'd4-adc-4', prompt: 'What does df.rename(columns={"n": "count"}) return?',
            choices: ['None', 'A new table with the column renamed', 'The renamed column', 'The old name'], answer: 1,
            explain: 'Like drop, it hands back a new table and leaves yours alone unless you reassign or pass inplace.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'dtypes-in-pandas',
        title: 'dtypes in pandas',
        summary: 'What each column is holding, and how to change it on purpose.',
        objectives: [
          'Read <code>dtypes</code> and say what each answer means.',
          'Explain why one bad value turns a numeric column into <code>object</code>.',
          'Convert with <code>astype</code>, and with <code>to_numeric</code> when the data is messy.',
          'Find the values that would not convert, rather than guessing.',
        ],
        why: 'A numeric column read as text sorts alphabetically, sums by concatenating and compares wrongly — and none of that raises. The dtype is the single cheapest thing to check after a load, and this lesson is the one that makes the rest of the course\'s numbers trustworthy.',
        sections: [
          {
            heading: 'Ask before you calculate',
            intro: '<code>dtypes</code> tells you what every column is. A column of numbers read from a file is very often text, and nothing about printing it will show you that.',
            steps: [
              {
                heading: 'What the answers mean',
                prose: '<code>int64</code> and <code>float64</code> are numbers. <code>object</code> means Python objects, which for a data file almost always means strings. <code>bool</code> and <code>datetime64</code> say what they look like.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": ["92", "88"], "n": [1, 2]})\nprint(df.dtypes)\nprint(df)',
                note: 'Printed, the two columns look identical. Only the dtypes line tells you one of them is text.',
              },
              {
                heading: 'What text does to arithmetic',
                prose: 'Summing a text column concatenates it. Sorting it puts "100" before "20". Neither raises, and both are wrong.',
                code: 'import pandas as pd\n\ntext = pd.Series(["92", "88"])\nnums = pd.Series([92, 88])\nprint(text.sum())\nprint(nums.sum())\nprint(sorted(["100", "20"]))',
              },
              {
                heading: 'Why one bad value spoils the column',
                prose: 'A column has one dtype. If a single value cannot be a number, the whole column falls back to object — so one stray "n/a" in ten thousand rows costs you the entire column.',
                code: 'import pandas as pd\n\nprint(pd.Series([1, 2, 3]).dtype)\nprint(pd.Series([1, 2, "n/a"]).dtype)',
              },
            ],
          },
          {
            heading: 'Converting a column',
            intro: '<code>astype</code> changes a column\'s type when every value can make the trip. <code>to_numeric</code> with <code>errors="coerce"</code> is for when they cannot.',
            steps: [
              {
                heading: 'astype, when the data is clean',
                prose: 'Direct and strict. If anything in the column cannot convert, it raises — which is the right behaviour when you believe the column is clean and want to be told if it is not.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"score": ["92", "88"]})\ndf["score"] = df["score"].astype(int)\nprint(df["score"].sum())',
              },
              {
                heading: 'to_numeric, when it is not',
                prose: '<code>errors="coerce"</code> turns anything unconvertible into NaN instead of raising. You then decide what the NaN means — dropped, or filled — rather than having the decision made for you.',
                code: 'import pandas as pd\n\nmessy = pd.Series(["10", "n/a", "5"])\nnumbers = pd.to_numeric(messy, errors="coerce")\nprint(numbers)\nprint(numbers.sum())        # NaN is skipped by sum\nprint(numbers.fillna(0).sum())',
              },
              {
                heading: 'Find what would not convert',
                prose: 'Before filling anything, look at what failed. Coerce, then mask for the new NaNs against the original column — that is the list of values worth reading with your own eyes.',
                code: 'import pandas as pd\n\nmessy = pd.Series(["10", "n/a", "5", ""])\nbad = messy[pd.to_numeric(messy, errors="coerce").isna()]\nprint(bad.tolist())',
                note: 'Usually this is a short list of two or three markers — "n/a", "-", a stray header repeated mid-file — and knowing them lets you name them at load time with na_values instead.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two columns that print the same',
            prompt: 'These two columns look identical printed. Show that they are not, three different ways.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"a": ["1", "2"], "b": [1, 2]})\n\nprint(df)\nprint(df.dtypes)\nprint(df["a"].sum())\nprint(df["b"].sum())\n',
          },
          {
            after: 1,
            title: 'Which values failed',
            prompt: 'Coerce this column to numbers and print the values that did not survive, before deciding what to do about them.',
            starter: 'import pandas as pd\n\nmessy = pd.Series(["10", "n/a", "5", "-", "7"])\nnumbers = pd.to_numeric(messy, errors="coerce")\n\nprint(numbers.tolist())\nprint(None)   # the original values that became NaN\n',
          },
        ],
        exercises: [
          {
            title: 'Total a messy column',
            prompt: 'Write <code>numeric_total(df)</code> that returns the sum of the <code>score</code> column, where the scores arrived as text and anything that is not a number counts as zero.',
            starter: 'import pandas as pd\n\ndef numeric_total(df):\n    # Sum the score column, treating junk as 0.\n    return 0\n\nprint(numeric_total(pd.DataFrame({"score": ["92", "88"]})))\n',
            call: `numeric_total(${pdf('{"score": ["92", "88", "79"]}')})`,
            expectValue: '259',
            hidden: [
              { name: 'text that is not a number counts as zero', call: `numeric_total(${pdf('{"score": ["10", "n/a", "5"]}')})`, expect: '15' },
              { name: 'an empty string counts as zero', call: `numeric_total(${pdf('{"score": ["7", ""]}')})`, expect: '7' },
              { name: 'an empty table totals zero', call: `numeric_total(${pdf('{"score": []}')})`, expect: '0' },
            ],
            hint: 'to_numeric with errors="coerce" turns the junk into missing values, and fillna(0) then makes them zero before you sum.',
            correct: 'import pandas as pd\n\ndef numeric_total(df):\n    return int(pd.to_numeric(df["score"], errors="coerce").fillna(0).sum())\n',
            wrong: 'import pandas as pd\n\ndef numeric_total(df):\n    return int(df["score"].astype(int).sum())\n',
          },
          {
            title: 'Report what would not convert',
            prompt: 'Write <code>unconvertible(df)</code> that returns a list of the values in the <code>score</code> column that cannot be read as numbers, in the order they appear. Report them rather than silently replacing them.',
            starter: 'import pandas as pd\n\ndef unconvertible(df):\n    # The original values that fail to become numbers.\n    return []\n\nprint(unconvertible(pd.DataFrame({"score": ["10", "n/a", "5"]})))\n',
            call: `unconvertible(${pdf('{"score": ["10", "n/a", "5", "-"]}')})`,
            expectValue: "['n/a', '-']",
            hidden: [
              { name: 'a clean column reports nothing', call: `unconvertible(${pdf('{"score": ["1", "2"]}')})`, expect: '[]' },
              { name: 'an empty string does not convert', call: `unconvertible(${pdf('{"score": ["", "3"]}')})`, expect: "['']" },
              { name: 'the original order is kept', call: `unconvertible(${pdf('{"score": ["x", "1", "y"]}')})`, expect: "['x', 'y']" },
              { name: 'an empty table reports nothing', call: `unconvertible(${pdf('{"score": []}')})`, expect: '[]' },
            ],
            hint: 'Coerce the column, ask which results are NaN with .isna(), and use that mask on the original column rather than on the converted one.',
            correct: 'import pandas as pd\n\ndef unconvertible(df):\n    bad = pd.to_numeric(df["score"], errors="coerce").isna()\n    return df["score"][bad].tolist()\n',
            wrong: 'import pandas as pd\n\ndef unconvertible(df):\n    return pd.to_numeric(df["score"], errors="coerce").dropna().tolist()\n',
          },
        ],
        questions: [
          { id: 'd4-dt-1', prompt: 'A column read from a CSV shows dtype object. What does that usually mean?',
            choices: ['It is empty', 'It is holding strings', 'It is a date', 'It is boolean'], answer: 1,
            explain: 'object means Python objects, and for a data file that is almost always text — often because one value would not parse.' },
          { id: 'd4-dt-2', prompt: 'What does pd.to_numeric(s, errors="coerce") do with "n/a"?',
            choices: ['Raises', 'Makes it NaN', 'Makes it 0', 'Leaves it as text'], answer: 1,
            explain: 'Which lets you count the failures and decide, rather than having the decision made by an exception.' },
          { id: 'd4-dt-3', prompt: 'Why does astype(int) fail on a column containing "n/a"?',
            choices: ['It is too long', 'There is no integer for it, and astype does not skip', 'astype only takes floats', 'It does not fail'], answer: 1,
            explain: 'astype is strict on purpose. That strictness is useful when you believe the column is clean.' },
          { id: 'd4-dt-4', prompt: 'What does pd.Series(["92", "88"]).sum() give you?',
            choices: ['180', '"9288"', 'An error', 'NaN'], answer: 1,
            explain: 'Summing strings concatenates them. The answer is wrong and nothing raises, which is why the dtype check matters.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'reading-a-csv-into-pandas',
        title: 'Reading a CSV into pandas',
        summary: 'One line replaces the whole of unit 1, and then you check what you got.',
        objectives: [
          'Read a CSV into a DataFrame in one call.',
          'Say what <code>read_csv</code> decides for you, and what it cannot know.',
          'Run the same four checks on every table you load.',
          'Recognise the shape of a load that went wrong.',
        ],
        why: 'Unit 1 built a table out of lists and dicts by hand so that you know what a table is. This lesson replaces all of it with one line — and the point of having done it by hand is that you now know what that line is deciding on your behalf, and which of those decisions to check.',
        sections: [
          {
            heading: 'read_csv',
            intro: 'It reads the header, splits the rows, and guesses each column\'s type. What it cannot do is know what your file means.',
            steps: [
              {
                heading: 'The whole of unit 1, in one call',
                prose: 'Opening the file, reading the header, splitting each line, converting the numbers — all of it, in the one call.',
                code: 'import pandas as pd\n\ndf = pd.read_csv("scores.csv")\nprint(df.shape)\nprint(df.dtypes)',
              },
              {
                heading: 'What it decided for you',
                prose: 'Three decisions, every time: the first line is column names, the separator is a comma, and each column\'s type is inferred from what it saw. Each is usually right and each is occasionally wrong.',
                code: 'import pandas as pd\n\n# Each of these overrides one of those three decisions.\n# df = pd.read_csv("f.csv", header=None)\n# df = pd.read_csv("f.csv", sep=";")\n# df = pd.read_csv("f.csv", dtype={"id": str})\nprint("the defaults are decisions, not facts")',
                note: 'Keeping an id column as text with <code>dtype={"id": str}</code> is the common one. An id that looks numeric loses its leading zeros the moment pandas reads it as a number.',
              },
            ],
          },
          {
            heading: 'Check before you trust',
            intro: '<code>head</code> shows you the first rows and <code>dtypes</code> shows you what pandas decided. Two lines, and they catch most of what goes wrong.',
            steps: [
              {
                heading: 'The four questions again',
                prose: 'The same four from lesson two, now on a table you did not build. This is the habit worth keeping for the rest of the course.',
                code: 'import pandas as pd\n\ndf = pd.read_csv("scores.csv")\nprint(df.shape)            # how much\nprint(df.dtypes)           # what kind\nprint(df.head(2))          # does it line up\nprint(df.isna().sum())     # how much is missing',
              },
              {
                heading: 'What a failed load looks like',
                prose: 'A wrong separator does not raise. Every line arrives as one long string, so you get one column and a shape that tells you immediately.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name;score\\nAda;92\\nGrace;88\\n"\nwrong = pd.read_csv(StringIO(text))\nprint(wrong.shape)\nprint(list(wrong.columns))\n\nright = pd.read_csv(StringIO(text), sep=";")\nprint(right.shape)\nprint(list(right.columns))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Read from a string',
            prompt: '<code>StringIO</code> lets you practise read_csv without a file. Read this text and print its shape and dtypes.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name,score\\nAda,92\\nGrace,88\\n"\ndf = pd.read_csv(StringIO(text))\n\nprint(df)\nprint(df.shape)\nprint(df.dtypes)\n',
          },
          {
            after: 1,
            title: 'Diagnose the load',
            prompt: 'This load produces one column where there should be three. Fix it with one argument.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\ntext = "name;city;score\\nAda;Leeds;92\\n"\ndf = pd.read_csv(StringIO(text))\n\nprint(df.shape)\nprint(list(df.columns))\n',
          },
        ],
        exercises: [
          {
            title: 'The average from a file',
            prompt: 'A file <code>scores.csv</code> is supplied when your work is checked, with <code>name</code> and <code>score</code> columns. Write <code>average_score(path)</code> that reads it and returns the mean score, rounded to two decimal places.',
            starter: 'import pandas as pd\n\ndef average_score(path):\n    # Read the file, return the mean score to 2dp.\n    return 0.0\n\nprint(average_score("scores.csv"))\n',
            files: { 'scores.csv': 'name,score\nAda,92\nGrace,88\nAlan,79\n' },
            call: 'average_score("scores.csv")',
            expectValue: '86.33',
            hidden: [
              { name: 'a different file gives a different answer',
                files: { 'scores.csv': 'name,score\nKatherine,100\nDorothy,90\n' },
                call: 'average_score("scores.csv")', expect: '95.0' },
              { name: 'pandas does the reading', kind: 'ast', requires: { imports: ['pandas'], calls: ['read_csv'] }, describe: 'pd.read_csv rather than the answer typed in' },
            ],
            hint: 'pd.read_csv(path), then the mean of the score column, then round to two places. The second check swaps the file, so a typed-in answer fails.',
            correct: 'import pandas as pd\n\ndef average_score(path):\n    return round(float(pd.read_csv(path)["score"].mean()), 2)\n',
            wrong: 'import pandas as pd\n\ndef average_score(path):\n    return 86.33\n',
          },
          {
            title: 'Report on a loaded file',
            prompt: 'Write <code>load_report(path)</code> that reads the file and returns a tuple of (row count, column count, sorted column names). Read it rather than assuming what is in it.',
            starter: 'import pandas as pd\n\ndef load_report(path):\n    # (rows, columns, [sorted names])\n    return None\n\nprint(load_report("scores.csv"))\n',
            files: { 'scores.csv': 'name,score\nAda,92\nGrace,88\nAlan,79\n' },
            call: 'load_report("scores.csv")',
            expectValue: "(3, 2, ['name', 'score'])",
            hidden: [
              { name: 'a wider file is reported as it is',
                files: { 'scores.csv': 'a,b,c\n1,2,3\n' },
                call: 'load_report("scores.csv")', expect: "(1, 3, ['a', 'b', 'c'])" },
              { name: 'a header-only file has no rows',
                files: { 'scores.csv': 'name,score\n' },
                call: 'load_report("scores.csv")', expect: "(0, 2, ['name', 'score'])" },
              { name: 'pandas does the reading', kind: 'ast', requires: { imports: ['pandas'], calls: ['read_csv'] }, describe: 'pd.read_csv rather than open() and split()' },
            ],
            hint: 'Read once into a variable, then take shape[0], shape[1] and sorted(df.columns) off it.',
            correct: 'import pandas as pd\n\ndef load_report(path):\n    df = pd.read_csv(path)\n    return (df.shape[0], df.shape[1], sorted(df.columns))\n',
            wrong: 'import pandas as pd\n\ndef load_report(path):\n    df = pd.read_csv(path)\n    return (df.shape[1], df.shape[0], sorted(df.columns))\n',
          },
        ],
        questions: [
          { id: 'd4-rcp-1', prompt: 'What does read_csv do with the first line of the file by default?',
            choices: ['Treats it as data', 'Treats it as the column names', 'Skips it', 'Uses it as the index'], answer: 1,
            explain: 'header=0 is the default. Pass header=None when the file genuinely has no header row.' },
          { id: 'd4-rcp-2', prompt: 'What is worth checking straight after read_csv?',
            choices: ['Nothing', 'shape, dtypes and the first few rows', 'The file size', 'The index name'], answer: 1,
            explain: 'Two lines that catch a wrong separator, a missing header and a numeric column read as text.' },
          { id: 'd4-rcp-3', prompt: 'read_csv guessed a numeric column as object. What is the likely cause?',
            choices: ['The file is too big', 'At least one value in it is not a number', 'The header is wrong', 'It always does this'], answer: 1,
            explain: 'A column has one dtype, so a single unparseable value takes the whole column to object.' },
          { id: 'd4-rcp-4', prompt: 'You read a file and shape says (1000, 1) instead of (1000, 6). What now?',
            choices: ['Nothing, carry on', 'Check the separator', 'Drop the index', 'Convert the dtypes'], answer: 1,
            explain: 'Each line arrived unsplit as a single value. sep= is the argument that fixes it, and nothing raised to tell you.' },
        ],
      },
    ],
  },
};
