/* Python for Data, unit 7 — Grouping and Aggregating.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * Split, apply, combine is named in the first lesson and then every other
 * lesson is a variation on it: what you count, how many answers per group, how
 * many keys, whether the answer comes back per group or per row, and how it is
 * laid out. The count beside the mean is a running theme, because a striking
 * average over three rows is the commonest way a group-by misleads.
 */

const GROUPBY = {
  name: 'the grouping is done by pandas',
  kind: 'ast',
  requires: { calls: ['groupby'] },
  describe: 'a groupby rather than a hand-written loop',
};
const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;

module.exports = {
  unit7: {
    title: 'Grouping and Aggregating',
    blurb: 'Split the table by a key, summarise each piece, and put the answers back together.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'split-apply-combine',
        title: 'Split, Apply, Combine',
        summary: 'The shape of every group-by, named once so the rest makes sense.',
        objectives: [
          'Name the three steps of a group-by.',
          'Say why <code>df.groupby("x")</code> on its own computes nothing.',
          'Read the result, and get the key back as a column.',
          'Report the group size beside the group summary.',
        ],
        why: 'Every question of the form "per region", "by month", "for each subject" is this one operation. Naming its three steps once means the rest of the unit is variations rather than new material — and it makes the error messages legible, because they nearly always come from the apply step.',
        sections: [
          {
            heading: 'Three steps in one call',
            intro: 'Split the table into groups by a key, apply a summary to each group, combine the answers into one result. pandas does all three in one expression, which is why it helps to be able to name them separately.',
            steps: [
              {
                heading: 'Nothing happens until you name the summary',
                prose: 'The grouped object is a plan, not a result. Printing it tells you almost nothing, which is confusing until you know it is deliberate.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "maths"], "score": [90, 70, 80]})\ngrouped = df.groupby("subject")\nprint(grouped)\nprint(grouped["score"].mean())',
              },
              {
                heading: 'The three steps, visible',
                prose: 'You will not write it this way, but seeing the split makes the rest concrete.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "maths"], "score": [90, 70, 80]})\n\nfor key, piece in df.groupby("subject"):\n    print(key, "->", piece["score"].tolist(), "-> mean", piece["score"].mean())',
              },
            ],
          },
          {
            heading: 'The key becomes the index',
            intro: 'The result is labelled by the group key, which is a Series indexed by whatever you grouped on.',
            steps: [
              {
                heading: 'Getting the key back as a column',
                prose: 'Sometimes you want a plain table rather than an indexed Series. <code>reset_index</code> turns the key back into a column, and <code>as_index=False</code> asks for that from the start.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "maths"], "score": [90, 70, 80]})\nprint(df.groupby("subject")["score"].mean().reset_index())\nprint(df.groupby("subject", as_index=False)["score"].mean())',
              },
              {
                heading: 'Always report the size',
                prose: 'A mean over two rows and a mean over two thousand are not comparable, and the group with the striking average is very often the group with three rows in it. Putting the count beside the summary is the cheapest honesty there is.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["maths", "art", "maths"], "score": [90, 70, 80]})\nout = df.groupby("subject")["score"].agg(["mean", "size"])\nprint(out)',
              },
              {
                heading: 'Where rows with a missing key go',
                prose: 'A row whose key is NaN is dropped from the result by default, so your groups can silently fail to account for the whole table. <code>dropna=False</code> keeps them as their own group.',
                code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"subject": ["maths", np.nan], "score": [90, 70]})\nprint(df.groupby("subject")["score"].size().sum(), "of", len(df))\nprint(df.groupby("subject", dropna=False)["score"].size().sum(), "of", len(df))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Watch the split',
            prompt: 'Loop over the groups and print each key with the rows it holds, then get the same answer in one expression.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"city": ["L", "Y", "L"], "score": [90, 70, 80]})\n\nfor key, piece in df.groupby("city"):\n    print(key, piece["score"].tolist())\n\nprint(None)   # the means, in one expression\n',
          },
          {
            after: 1,
            title: 'Mean and size together',
            prompt: 'Produce the mean and the row count per city in one result, and notice which group you would be wary of.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"city": ["L", "L", "L", "Y"], "score": [80, 82, 78, 100]})\n\nprint(df.groupby("city")["score"].agg(["mean", "size"]))\n',
          },
        ],
        exercises: [
          {
            title: 'Mean score per subject',
            prompt: 'Write <code>mean_by_subject(df)</code> returning a dictionary of subject to mean score, each mean rounded to one decimal place.',
            starter: 'import pandas as pd\n\ndef mean_by_subject(df):\n    # {subject: mean score}\n    return {}\n\nprint(mean_by_subject(pd.DataFrame({"subject": ["maths"], "score": [90]})))\n',
            call: `mean_by_subject(${pdf('{"subject": ["maths", "art", "maths"], "score": [90, 70, 80]}')})`,
            expectValue: "{'art': 70.0, 'maths': 85.0}",
            hidden: [
              { name: 'one subject gives one entry', call: `mean_by_subject(${pdf('{"subject": ["art"], "score": [70]}')})`, expect: "{'art': 70.0}" },
              { name: 'the mean is of the group, not the whole table', call: `mean_by_subject(${pdf('{"subject": ["a", "a", "b"], "score": [0, 100, 50]}')})`, expect: "{'a': 50.0, 'b': 50.0}" },
              GROUPBY,
            ],
            hint: 'groupby the subject, take the score column, ask for the mean, round it, and to_dict() at the end gives plain keys and values.',
            correct: 'import pandas as pd\n\ndef mean_by_subject(df):\n    return df.groupby("subject")["score"].mean().round(1).to_dict()\n',
            wrong: 'import pandas as pd\n\ndef mean_by_subject(df):\n    return {s: round(df["score"].mean(), 1) for s in df["subject"].unique()}\n',
          },
          {
            title: 'The mean, with the size beside it',
            prompt: 'Write <code>summary_by(df)</code> returning a dictionary of subject to a two-element list of [mean score rounded to one place, number of rows]. Reporting the size is what stops a group of two being read like a group of two thousand.',
            starter: 'import pandas as pd\n\ndef summary_by(df):\n    # {subject: [mean, rows]}\n    return {}\n\nprint(summary_by(pd.DataFrame({"subject": ["m", "m", "a"], "score": [90, 80, 70]})))\n',
            call: `summary_by(${pdf('{"subject": ["m", "m", "a"], "score": [90, 80, 70]}')})`,
            expectValue: "{'a': [70.0, 1], 'm': [85.0, 2]}",
            hidden: [
              { name: 'a single row group reports a size of one', call: `summary_by(${pdf('{"subject": ["solo"], "score": [5]}')})`, expect: "{'solo': [5.0, 1]}" },
              { name: 'the size counts rows, not subjects', call: `summary_by(${pdf('{"subject": ["a", "a", "a"], "score": [1, 2, 3]}')})`, expect: "{'a': [2.0, 3]}" },
              { name: 'the counts are plain integers', call: `all(type(v[1]).__name__ == "int" for v in summary_by(${pdf('{"subject": ["a"], "score": [1]}')}).values())`, expect: 'True' },
              GROUPBY,
            ],
            hint: 'Group once and take both the mean and the size off the same grouped object, then build the dictionary with round() and int() so the values are plain Python.',
            correct: 'import pandas as pd\n\ndef summary_by(df):\n    g = df.groupby("subject")["score"]\n    means, sizes = g.mean().round(1), g.size()\n    return {k: [float(means[k]), int(sizes[k])] for k in means.index}\n',
            wrong: 'import pandas as pd\n\ndef summary_by(df):\n    g = df.groupby("subject")["score"]\n    means = g.mean().round(1)\n    return {k: [float(means[k]), len(df)] for k in means.index}\n',
          },
        ],
        questions: [
          { id: 'd7-sac-1', prompt: 'What are the three steps of a group-by?',
            choices: ['Sort, filter, count', 'Split, apply, combine', 'Load, clean, report', 'Index, slice, sum'], answer: 1,
            explain: 'Split the table by key, apply a summary to each piece, combine the answers into one result.' },
          { id: 'd7-sac-2', prompt: 'What does df.groupby("city") on its own return?',
            choices: ['A DataFrame', 'A grouped object that has computed nothing yet', 'A Series of counts', 'A list'], answer: 1,
            explain: 'Nothing happens until you name the summary, which is why printing it is unhelpful.' },
          { id: 'd7-sac-3', prompt: 'After groupby(...).mean(), where is the group key?',
            choices: ['A column', 'The index', 'Dropped', 'Duplicated'], answer: 1,
            explain: 'reset_index() or as_index=False puts it back as a column when you want a plain table.' },
          { id: 'd7-sac-4', prompt: 'Why report the group size next to the group mean?',
            choices: ['It is not needed', 'A mean over two rows and one over two thousand are not comparable', 'It sorts the groups', 'It fills NaN'], answer: 1,
            explain: 'The group with the striking average is very often the group with three rows in it.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'counting-groups',
        title: 'Counting Groups',
        summary: 'How many of each, and the difference between size and count.',
        objectives: [
          'Count the distinct values in a column with <code>value_counts</code>.',
          'Say the difference between <code>size</code> and <code>count</code>.',
          'Turn counts into proportions.',
          'Choose which one answers the question you were asked.',
        ],
        why: '"How many of each" is the most common question anyone asks of a table, and there are two right answers to it depending on whether you mean rows or values. On a column with gaps in it the two differ, and picking the wrong one gives a number that is plausible and wrong.',
        sections: [
          {
            heading: 'value_counts for one column',
            intro: 'For a single column this is the shortest path: distinct values and how often each appears, already sorted by frequency.',
            steps: [
              {
                heading: 'Counts, and shares',
                prose: '<code>normalize=True</code> turns the counts into proportions of the whole, which is usually what a reader wants beside them.',
                code: 'import pandas as pd\n\ncity = pd.Series(["L", "Y", "L", "L"])\nprint(city.value_counts())\nprint(city.value_counts(normalize=True))',
              },
              {
                heading: 'Missing values are not counted by default',
                prose: 'So the counts can sum to less than the length of the column. <code>dropna=False</code> makes the gaps a category of their own.',
                code: 'import pandas as pd\nimport numpy as np\n\ncity = pd.Series(["L", np.nan, "Y"])\nprint(city.value_counts().sum(), "of", len(city))\nprint(city.value_counts(dropna=False))',
              },
            ],
          },
          {
            heading: 'size counts rows, count counts values',
            intro: 'On a group, <code>size</code> is how many rows are in it. <code>count</code> is how many non-missing values a column has in it. They differ exactly where the data has holes.',
            steps: [
              {
                heading: 'The difference, shown',
                prose: 'Ten rows with three missing scores give a size of 10 and a count of 7. Which one you want depends on whether you are asking "how many students" or "how many marked papers".',
                code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"k": ["a", "a", "a"], "v": [1, np.nan, 3]})\ng = df.groupby("k")\nprint("size:", g.size().to_dict())\nprint("count:", g["v"].count().to_dict())',
              },
              {
                heading: 'Both at once',
                prose: 'Asking for both is usually the honest answer, because the gap between them is itself information about the data.',
                code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"k": ["a", "a", "b"], "v": [1, np.nan, 3]})\nprint(df.groupby("k")["v"].agg(["size", "count", "mean"]))',
                note: 'Note the mean: it is computed over the <em>count</em>, not the size. A group of three rows with one missing value has its mean taken over two.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Counts and shares',
            prompt: 'Print the counts for this column and then the same thing as proportions.',
            starter: 'import pandas as pd\n\ncity = pd.Series(["L", "Y", "L", "L", "Y", "B"])\n\nprint(city.value_counts())\nprint(None)   # as proportions\n',
          },
          {
            after: 1,
            title: 'Where they differ',
            prompt: 'Print size, count and mean for each group and explain to yourself why the mean is what it is.',
            starter: 'import pandas as pd\nimport numpy as np\n\ndf = pd.DataFrame({"k": ["a", "a", "a", "b"], "v": [10, np.nan, 20, 5]})\n\nprint(df.groupby("k")["v"].agg(["size", "count", "mean"]))\n',
          },
        ],
        exercises: [
          {
            title: 'How many of each',
            prompt: 'Write <code>counts_by(df, column)</code> returning a dictionary of each distinct value in that column to how many rows have it.',
            starter: 'import pandas as pd\n\ndef counts_by(df, column):\n    # {value: how many rows}\n    return {}\n\nprint(counts_by(pd.DataFrame({"s": ["a", "a", "b"]}), "s"))\n',
            call: `counts_by(${pdf('{"s": ["a", "a", "b"]}')}, "s")`,
            expectValue: "{'a': 2, 'b': 1}",
            hidden: [
              { name: 'a single row counts once', call: `counts_by(${pdf('{"s": ["z"]}')}, "s")`, expect: "{'z': 1}" },
              { name: 'it works on whichever column is named', call: `counts_by(${pdf('{"s": ["a"], "t": ["x"]}')}, "t")`, expect: "{'x': 1}" },
              { name: 'the counts are plain numbers', call: `type(list(counts_by(${pdf('{"s": ["a"]}')}, "s").values())[0]).__name__`, expect: "'int'" },
            ],
            hint: 'value_counts on the column gives exactly this. to_dict() makes the keys and values plain, though the counts may need int() to shed their numpy type.',
            correct: 'import pandas as pd\n\ndef counts_by(df, column):\n    counts = df[column].value_counts().to_dict()\n    return {k: int(v) for k, v in counts.items()}\n',
            wrong: 'import pandas as pd\n\ndef counts_by(df, column):\n    return {v: len(df) for v in df[column].unique()}\n',
          },
          {
            title: 'Rows against marked papers',
            prompt: 'Write <code>size_and_count(df)</code> returning a dictionary of each key to a two-element list of [rows in the group, rows whose <code>v</code> is not missing]. Where a group has gaps the two numbers differ, and that difference is the point.',
            starter: 'import pandas as pd\n\ndef size_and_count(df):\n    # {key: [rows, non-missing values]}\n    return {}\n\nprint(size_and_count(pd.DataFrame({"k": ["a", "a"], "v": [1, None]})))\n',
            call: `size_and_count(${pdf('{"k": ["a", "a"], "v": [1, None]}')})`,
            expectValue: "{'a': [2, 1]}",
            hidden: [
              { name: 'a complete group has the two equal', call: `size_and_count(${pdf('{"k": ["a", "a"], "v": [1, 2]}')})`, expect: "{'a': [2, 2]}" },
              { name: 'a group with nothing recorded counts zero values', call: `size_and_count(${pdf('{"k": ["a"], "v": [None]}')})`, expect: "{'a': [1, 0]}" },
              { name: 'separate groups are reported separately', call: `size_and_count(${pdf('{"k": ["a", "b"], "v": [1, None]}')})`, expect: "{'a': [1, 1], 'b': [1, 0]}" },
              GROUPBY,
            ],
            hint: 'Group once, then ask the grouped object for .size() and the column for .count(). size counts rows; count counts values that are not missing.',
            correct: 'import pandas as pd\n\ndef size_and_count(df):\n    g = df.groupby("k")\n    sizes, counts = g.size(), g["v"].count()\n    return {k: [int(sizes[k]), int(counts[k])] for k in sizes.index}\n',
            wrong: 'import pandas as pd\n\ndef size_and_count(df):\n    g = df.groupby("k")\n    sizes = g.size()\n    return {k: [int(sizes[k]), int(sizes[k])] for k in sizes.index}\n',
          },
        ],
        questions: [
          { id: 'd7-cg-1', prompt: 'What is the difference between size() and count() on a group?',
            choices: ['None', 'size counts rows; count counts non-missing values', 'count is faster', 'size only works on numbers'], answer: 1,
            explain: 'Ten rows with three missing scores give size 10 and count 7.' },
          { id: 'd7-cg-2', prompt: 'What does value_counts(normalize=True) give you?',
            choices: ['Sorted values', 'Each value’s share of the whole', 'The counts as integers', 'The distinct values'], answer: 1,
            explain: 'Proportions rather than counts, which is usually what a reader wants beside the raw numbers.' },
          { id: 'd7-cg-3', prompt: 'Why might value_counts sum to less than the column length?',
            choices: ['A bug', 'Missing values are not counted by default', 'It samples', 'It rounds'], answer: 1,
            explain: 'dropna=False makes the gaps a category of their own.' },
          { id: 'd7-cg-4', prompt: 'A group has 3 rows and one missing value. Its mean is taken over how many?',
            choices: ['3', '2', '1', 'It is NaN'], answer: 1,
            explain: 'The mean is computed over the count, not the size — which is another reason to report both.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'agg-with-several-summaries',
        title: 'agg with Several Summaries',
        summary: 'More than one answer per group, named as you want them.',
        objectives: [
          'Ask for several summaries in one pass.',
          'Name the output columns rather than accepting the defaults.',
          'Apply different summaries to different columns.',
          'Build a summary that is not a built-in.',
        ],
        why: 'One group-by per statistic means walking the table three times and then stitching the results together. <code>agg</code> does it in one pass and, more importantly, lets you name the columns — so the result is a table a reader can understand without you standing next to it.',
        sections: [
          {
            heading: 'A list of functions',
            intro: 'Pass a list and you get a column per summary, named after the function.',
            steps: [
              {
                heading: 'Several at once',
                prose: 'One pass over the data, one table out.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b"], "v": [1, 4, 7]})\nprint(df.groupby("k")["v"].agg(["min", "max", "mean", "size"]))',
              },
              {
                heading: 'Different summaries per column',
                prose: 'A dictionary maps each column to what you want from it, which is how a real summary table usually looks.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a"], "score": [90, 80], "hours": [2, 5]})\nprint(df.groupby("k").agg({"score": "mean", "hours": "sum"}))',
              },
            ],
          },
          {
            heading: 'Naming the outputs',
            intro: 'Named aggregation gives you the columns you want with the names you want, and it is the form worth defaulting to.',
            steps: [
              {
                heading: 'Say what each column is',
                prose: 'Each keyword becomes a column name, and the tuple says which column to summarise and how.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b"], "v": [1, 4, 7]})\nprint(df.groupby("k").agg(\n    lowest=("v", "min"),\n    highest=("v", "max"),\n    rows=("v", "size"),\n))',
                note: 'Compare this with the default names from a list of functions. The difference is whether the person reading your output has to ask you what a column means.',
              },
              {
                heading: 'A summary of your own',
                prose: 'Anything that reduces a Series to one value works, including a lambda. The range — highest minus lowest — is the obvious example, and it has no built-in.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b"], "v": [1, 4, 7]})\nprint(df.groupby("k")["v"].agg(spread=lambda s: s.max() - s.min()))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Four summaries, one pass',
            prompt: 'Produce the minimum, maximum, mean and row count per key in a single call.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b", "b"], "v": [1, 4, 7, 9]})\n\nprint(df.groupby("k")["v"].agg(["min", "max", "mean", "size"]))\n',
          },
          {
            after: 1,
            title: 'Name them yourself',
            prompt: 'Produce the same table again, with the columns named <code>lowest</code>, <code>highest</code> and <code>rows</code>.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b", "b"], "v": [1, 4, 7, 9]})\n\nprint(df.groupby("k").agg(\n    lowest=("v", "min"),\n    highest=("v", "max"),\n    rows=("v", "size"),\n))\n',
          },
        ],
        exercises: [
          {
            title: 'The spread within each group',
            prompt: 'Write <code>range_by(df)</code> returning a dictionary of each key to the difference between its highest and lowest <code>v</code>.',
            starter: 'import pandas as pd\n\ndef range_by(df):\n    # {key: highest - lowest}\n    return {}\n\nprint(range_by(pd.DataFrame({"k": ["a", "a"], "v": [1, 4]})))\n',
            call: `range_by(${pdf('{"k": ["a", "a", "b"], "v": [1, 4, 7]}')})`,
            expectValue: "{'a': 3, 'b': 0}",
            hidden: [
              { name: 'a single row has no range', call: `range_by(${pdf('{"k": ["z"], "v": [5]}')})`, expect: "{'z': 0}" },
              { name: 'the range is within the group, not across the table', call: `range_by(${pdf('{"k": ["a", "b"], "v": [0, 100]}')})`, expect: "{'a': 0, 'b': 0}" },
              GROUPBY,
            ],
            hint: 'Group, take max and min of v for each group, subtract one from the other, then to_dict(). The second hidden case is the whole point: the range is per group.',
            correct: 'import pandas as pd\n\ndef range_by(df):\n    g = df.groupby("k")["v"]\n    return {k: int(v) for k, v in (g.max() - g.min()).to_dict().items()}\n',
            wrong: 'import pandas as pd\n\ndef range_by(df):\n    span = int(df["v"].max() - df["v"].min())\n    return {k: span for k in df["k"].unique()}\n',
          },
          {
            title: 'A named summary table',
            prompt: 'Write <code>summary_table(df)</code> that returns the column names of a grouped summary carrying, in this order, <code>lowest</code>, <code>highest</code> and <code>rows</code> per key. Name the columns rather than accepting the defaults.',
            starter: 'import pandas as pd\n\ndef summary_table(df):\n    # Return list(result.columns) for the named summary.\n    return []\n\nprint(summary_table(pd.DataFrame({"k": ["a", "a"], "v": [1, 4]})))\n',
            call: `summary_table(${pdf('{"k": ["a", "a", "b"], "v": [1, 4, 7]}')})`,
            expectValue: "['lowest', 'highest', 'rows']",
            hidden: [
              { name: 'the names do not depend on the data', call: `summary_table(${pdf('{"k": ["z"], "v": [9]}')})`, expect: "['lowest', 'highest', 'rows']" },
              { name: 'no default function names leak through',
                call: `all(c not in summary_table(${pdf('{"k": ["a"], "v": [1]}')}) for c in ("min", "max", "size"))`, expect: 'True' },
              GROUPBY,
            ],
            hint: 'df.groupby("k").agg(lowest=("v", "min"), highest=("v", "max"), rows=("v", "size")) then list(...columns). Passing a list of function names instead would give you min, max and size as the names.',
            correct: 'import pandas as pd\n\ndef summary_table(df):\n    out = df.groupby("k").agg(\n        lowest=("v", "min"),\n        highest=("v", "max"),\n        rows=("v", "size"),\n    )\n    return list(out.columns)\n',
            wrong: 'import pandas as pd\n\ndef summary_table(df):\n    out = df.groupby("k")["v"].agg(["min", "max", "size"])\n    return list(out.columns)\n',
          },
        ],
        questions: [
          { id: 'd7-agg-1', prompt: 'How do you get the mean and the max per group in one pass?',
            choices: ['Two group-bys', '.agg(["mean", "max"])', '.mean().max()', 'It is not possible'], answer: 1,
            explain: 'One walk over the data instead of two, and one table out.' },
          { id: 'd7-agg-2', prompt: 'What does .agg(lowest=("v", "min")) do?',
            choices: ['Raises', 'Makes a column called lowest holding the minimum of v', 'Renames v', 'Sorts by v'], answer: 1,
            explain: 'Named aggregation: the keyword is the output column, the tuple says which column and which summary.' },
          { id: 'd7-agg-3', prompt: 'How do you apply different summaries to different columns?',
            choices: ['You cannot', 'Pass a dictionary of column to function', 'Group twice', 'Use transform'], answer: 1,
            explain: '{"score": "mean", "hours": "sum"} is how a real summary table usually looks.' },
          { id: 'd7-agg-4', prompt: 'Why name the output columns?',
            choices: ['It is faster', 'So the result is readable without you explaining it', 'It is required', 'It changes the numbers'], answer: 1,
            explain: 'The default names come from the functions, which says how it was computed rather than what it means.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'grouping-by-several-keys',
        title: 'Grouping by Several Keys',
        summary: 'Two keys give a row per combination, and an index with two levels.',
        objectives: [
          'Group by more than one column.',
          'Read a two-level index.',
          'Flatten the result back into a plain table.',
          'Say what happens to combinations that never occur.',
        ],
        why: '"Per subject per year" is one group-by, not two. The result carries an index with two levels, which is the first genuinely unfamiliar object in pandas — and knowing how to flatten it is most of what you need.',
        sections: [
          {
            heading: 'A list of columns',
            intro: 'Pass a list and you get a row per combination that actually occurs in the data.',
            steps: [
              {
                heading: 'One row per combination',
                prose: 'The index now has two levels, printed as two columns down the left.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a"], "year": [10, 11, 10], "score": [90, 80, 70]})\nout = df.groupby(["subject", "year"])["score"].mean()\nprint(out)\nprint(out.index.nlevels)',
              },
              {
                heading: 'Reaching into it',
                prose: 'A tuple indexes both levels at once; naming just the first gives you everything under it.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a"], "year": [10, 11, 10], "score": [90, 80, 70]})\nout = df.groupby(["subject", "year"])["score"].mean()\nprint(out[("m", 10)])\nprint(out["m"])',
              },
            ],
          },
          {
            heading: 'Flattening the result',
            intro: 'Most of the time you want a plain table with the keys as ordinary columns, which is one call away.',
            steps: [
              {
                heading: 'reset_index',
                prose: 'Both levels become columns and the index goes back to 0, 1, 2. This is the form you would write to a file or hand to a chart.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a"], "year": [10, 11, 10], "score": [90, 80, 70]})\nflat = df.groupby(["subject", "year"])["score"].mean().reset_index()\nprint(flat)\nprint(list(flat.columns))',
              },
              {
                heading: 'Combinations that never happened',
                prose: 'A pair with no rows does not appear — the result has one row per combination that exists, not per combination that is possible. If the missing ones matter, <code>unstack</code> lays the grid out and shows them as NaN.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "a"], "year": [10, 11], "score": [90, 70]})\nout = df.groupby(["subject", "year"])["score"].mean()\nprint(len(out), "rows for", df["subject"].nunique() * df["year"].nunique(), "possible pairs")\nprint(out.unstack())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two keys',
            prompt: 'Group by both columns, print the result, and print how many levels its index has.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a", "a"], "year": [10, 11, 10, 11], "score": [90, 80, 70, 60]})\n\nout = df.groupby(["subject", "year"])["score"].mean()\nprint(out)\nprint(out.index.nlevels)\n',
          },
          {
            after: 1,
            title: 'Flatten it',
            prompt: 'Turn the same result into a plain table with three ordinary columns.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a"], "year": [10, 11, 10], "score": [90, 80, 70]})\n\nout = df.groupby(["subject", "year"])["score"].mean()\nprint(None)   # the same thing, flattened\n',
          },
        ],
        exercises: [
          {
            title: 'Count every pair',
            prompt: 'Write <code>pairs_counted(df)</code> returning a dictionary keyed by the <code>(subject, year)</code> tuple, holding how many rows each pair has.',
            starter: 'import pandas as pd\n\ndef pairs_counted(df):\n    # {(subject, year): rows}\n    return {}\n\nprint(pairs_counted(pd.DataFrame({"subject": ["m"], "year": [10]})))\n',
            call: `pairs_counted(${pdf('{"subject": ["m", "m", "a"], "year": [10, 10, 11]}')})`,
            expectValue: "{('a', 11): 1, ('m', 10): 2}",
            hidden: [
              { name: 'each distinct pair gets its own entry', call: `len(pairs_counted(${pdf('{"subject": ["m", "m"], "year": [10, 11]}')}))`, expect: '2' },
              { name: 'pairs that never occur are absent', call: `len(pairs_counted(${pdf('{"subject": ["m"], "year": [10]}')}))`, expect: '1' },
            ],
            hint: 'Group by both columns and ask for size. to_dict() on a two-level index gives tuple keys, and the counts want int() to shed their numpy type.',
            correct: 'import pandas as pd\n\ndef pairs_counted(df):\n    counts = df.groupby(["subject", "year"]).size().to_dict()\n    return {k: int(v) for k, v in counts.items()}\n',
            wrong: 'import pandas as pd\n\ndef pairs_counted(df):\n    counts = df.groupby("subject").size().to_dict()\n    return {k: int(v) for k, v in counts.items()}\n',
          },
          {
            title: 'Flatten it back to a table',
            prompt: 'Write <code>flat_means(df)</code> that groups by <code>subject</code> and <code>year</code>, takes the mean score, and returns the column names of the result as a plain table — keys as ordinary columns, not as an index.',
            starter: 'import pandas as pd\n\ndef flat_means(df):\n    # Return list(result.columns) for the flattened summary.\n    return []\n\nprint(flat_means(pd.DataFrame({"subject": ["m"], "year": [10], "score": [90]})))\n',
            call: `flat_means(${pdf('{"subject": ["m", "a"], "year": [10, 11], "score": [90, 70]}')})`,
            expectValue: "['subject', 'year', 'score']",
            hidden: [
              { name: 'the keys are columns, not an index',
                call: `all(c in flat_means(${pdf('{"subject": ["m"], "year": [10], "score": [9]}')}) for c in ("subject", "year"))`, expect: 'True' },
              { name: 'the summarised column keeps its name',
                call: `"score" in flat_means(${pdf('{"subject": ["m"], "year": [10], "score": [9]}')})`, expect: 'True' },
              GROUPBY,
            ],
            hint: 'Group by the two columns, take the mean of score, then reset_index() to push both levels back out as columns. Without it the keys stay in the index and the columns list is just ["score"].',
            correct: 'import pandas as pd\n\ndef flat_means(df):\n    out = df.groupby(["subject", "year"])["score"].mean().reset_index()\n    return list(out.columns)\n',
            wrong: 'import pandas as pd\n\ndef flat_means(df):\n    out = df.groupby(["subject", "year"])[["score"]].mean()\n    return list(out.columns)\n',
          },
        ],
        questions: [
          { id: 'd7-gsk-1', prompt: 'What does grouping by two keys give you?',
            choices: ['Two tables', 'A row per combination, with a two-level index', 'An error', 'The first key only'], answer: 1,
            explain: 'One group-by, not two, and the index carries both keys.' },
          { id: 'd7-gsk-2', prompt: 'How do you turn the two index levels back into columns?',
            choices: ['flatten()', 'reset_index()', 'to_frame()', 'unstack()'], answer: 1,
            explain: 'unstack lays the grid out instead, which is a different and also useful shape.' },
          { id: 'd7-gsk-3', prompt: 'A subject/year pair has no rows. What appears in the result?',
            choices: ['A row with 0', 'A row with NaN', 'Nothing — it is absent', 'An error'], answer: 2,
            explain: 'You get one row per combination that occurs, not per combination that is possible. unstack shows the gaps as NaN.' },
          { id: 'd7-gsk-4', prompt: 'How do you read one cell out of a two-level result?',
            choices: ['out["m"]["10"]', 'out[("m", 10)]', 'out.loc["m", 10].value', 'Both of the first two work'], answer: 3,
            explain: 'A tuple indexes both levels at once; naming just the first gives you everything underneath it.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'transform-versus-aggregate',
        title: 'transform versus aggregate',
        summary: 'One answer per group, or one answer per row.',
        objectives: [
          'Say what shape an aggregate returns and what shape a transform returns.',
          'Put a group summary beside every row.',
          'Compare a row with its own group rather than with the table.',
          'Choose between the two from the question being asked.',
        ],
        why: 'Questions like "which rows beat their own group average" cannot be answered by an aggregate, because an aggregate throws away the rows. transform is what keeps the shape, and it is the piece people are missing when they fall back to a loop over the groups.',
        sections: [
          {
            heading: 'aggregate collapses',
            intro: 'One value per group. The rows are gone, which is usually what you wanted.',
            steps: [
              {
                heading: 'The shape of an aggregate',
                prose: 'Four rows in, two groups out. Nothing here lines up with the original table any more.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b", "b"], "v": [1, 3, 10, 20]})\nmeans = df.groupby("k")["v"].mean()\nprint(means)\nprint(len(df), "rows ->", len(means), "groups")',
              },
            ],
          },
          {
            heading: 'transform keeps the shape',
            intro: 'One value per <em>row</em> — each row gets its own group\'s answer. The result lines up with the table, so you can put it straight into a column or compare against it.',
            steps: [
              {
                heading: 'The group answer, beside every row',
                prose: 'Same length as the table, same index, so it can sit alongside the data it describes.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b", "b"], "v": [1, 3, 10, 20]})\ndf["group_mean"] = df.groupby("k")["v"].transform("mean")\nprint(df)',
              },
              {
                heading: 'Comparing a row with its own group',
                prose: 'This is the question an aggregate cannot answer. Note how different it is from comparing against the whole table\'s mean.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["low", "low", "high"], "v": [1, 2, 100]})\ngroup_mean = df.groupby("k")["v"].transform("mean")\n\nprint("above own group:", int((df["v"] > group_mean).sum()))\nprint("above table mean:", int((df["v"] > df["v"].mean()).sum()))',
                note: 'The row with 100 is above the table mean and is exactly its own group\'s mean, because it is alone in its group. Which of those two numbers you report is the difference between two quite different claims.',
              },
              {
                heading: 'Standardising within a group',
                prose: 'The same idea with two transforms: each value\'s distance from its group mean, in units of its group\'s spread.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "a", "b"], "v": [10.0, 20.0, 30.0, 5.0]})\ng = df.groupby("k")["v"]\ndf["z"] = (df["v"] - g.transform("mean")) / g.transform("std")\nprint(df)',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two shapes',
            prompt: 'Print the length of the aggregate and the length of the transform, next to the length of the table.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["a", "a", "b", "b"], "v": [1, 3, 10, 20]})\n\nprint(len(df))\nprint(len(df.groupby("k")["v"].mean()))\nprint(None)   # the transform\n',
          },
          {
            after: 1,
            title: 'Beat your own group',
            prompt: 'Add a column holding each row\'s group mean, then count the rows above it. Compare that with the count above the whole table\'s mean.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"k": ["low", "low", "high"], "v": [1, 2, 100]})\n\ndf["group_mean"] = df.groupby("k")["v"].transform("mean")\nprint(df)\nprint(int((df["v"] > df["group_mean"]).sum()))\nprint(int((df["v"] > df["v"].mean()).sum()))\n',
          },
        ],
        exercises: [
          {
            title: 'Rows above their own group',
            prompt: 'Write <code>above_group_mean(df)</code> returning the number of rows whose <code>v</code> is above the mean of their own group.',
            starter: 'import pandas as pd\n\ndef above_group_mean(df):\n    # Rows beating their own group average.\n    return 0\n\nprint(above_group_mean(pd.DataFrame({"k": ["a", "a"], "v": [1, 3]})))\n',
            call: `above_group_mean(${pdf('{"k": ["a", "a", "b", "b"], "v": [1, 3, 10, 20]}')})`,
            expectValue: '2',
            hidden: [
              { name: 'a group of one is never above its own mean', call: `above_group_mean(${pdf('{"k": ["a"], "v": [5]}')})`, expect: '0' },
              { name: 'the comparison is against the group, not the table', call: `above_group_mean(${pdf('{"k": ["low", "low", "high"], "v": [1, 2, 100]}')})`, expect: '1' },
              { name: 'transform keeps the row count', kind: 'ast', requires: { calls: ['transform'] }, describe: 'transform rather than an aggregate' },
            ],
            hint: 'transform("mean") gives each row its group average, which lines up with the table so you can compare row by row. An aggregate would collapse the groups and leave you nothing to compare against.',
            correct: 'import pandas as pd\n\ndef above_group_mean(df):\n    means = df.groupby("k")["v"].transform("mean")\n    return int((df["v"] > means).sum())\n',
            wrong: 'import pandas as pd\n\ndef above_group_mean(df):\n    return int((df["v"] > df["v"].mean()).sum())\n',
          },
          {
            title: 'Each row as a share of its group',
            prompt: 'Write <code>share_of_group(df)</code> returning a list of each row\'s <code>v</code> as a percentage of its own group\'s total, rounded to one decimal place, in the original row order.',
            starter: 'import pandas as pd\n\ndef share_of_group(df):\n    # Each v as a percentage of its own group total.\n    return []\n\nprint(share_of_group(pd.DataFrame({"k": ["a", "a"], "v": [1.0, 3.0]})))\n',
            call: `share_of_group(${pdf('{"k": ["a", "a", "b"], "v": [1.0, 3.0, 5.0]}')})`,
            expectValue: '[25.0, 75.0, 100.0]',
            hidden: [
              { name: 'a row alone in its group is all of it', call: `share_of_group(${pdf('{"k": ["a", "b"], "v": [2.0, 8.0]}')})`, expect: '[100.0, 100.0]' },
              { name: 'the total is the group’s, not the table’s', call: `share_of_group(${pdf('{"k": ["a", "a", "b"], "v": [1.0, 1.0, 98.0]}')})`, expect: '[50.0, 50.0, 100.0]' },
              { name: 'the row order is preserved', call: `share_of_group(${pdf('{"k": ["b", "a", "a"], "v": [10.0, 1.0, 1.0]}')})`, expect: '[100.0, 50.0, 50.0]' },
              { name: 'transform keeps the row count', kind: 'ast', requires: { calls: ['transform'] }, describe: 'transform rather than an aggregate' },
            ],
            hint: 'transform("sum") gives each row its group total, lined up with the table. Divide, multiply by 100, round, and tolist().',
            correct: 'import pandas as pd\n\ndef share_of_group(df):\n    totals = df.groupby("k")["v"].transform("sum")\n    return (df["v"] / totals * 100).round(1).tolist()\n',
            wrong: 'import pandas as pd\n\ndef share_of_group(df):\n    return (df["v"] / df["v"].sum() * 100).round(1).tolist()\n',
          },
        ],
        questions: [
          { id: 'd7-tva-1', prompt: 'How does transform differ from agg?',
            choices: ['transform is faster', 'transform returns one value per row; agg returns one per group', 'transform only works on strings', 'They are the same'], answer: 1,
            explain: 'Which is what makes transform the way to put a group mean beside every row.' },
          { id: 'd7-tva-2', prompt: 'You want each row compared with its own group’s mean. What do you use?',
            choices: ['agg', 'transform', 'apply(axis=1)', 'merge'], answer: 1,
            explain: 'An aggregate throws away the rows, leaving nothing to compare against.' },
          { id: 'd7-tva-3', prompt: 'A 4-row table with 2 groups. How long is the transform result?',
            choices: ['2', '4', '1', '8'], answer: 1,
            explain: 'Same length and same index as the table, which is what lets it become a column.' },
          { id: 'd7-tva-4', prompt: 'Why is "above own group mean" different from "above table mean"?',
            choices: ['They are the same', 'A group with high values has a high bar of its own', 'transform rounds', 'agg drops rows'], answer: 1,
            explain: 'A row can beat the table and not beat its own group, and reporting one as the other is a different claim.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'pivot-tables',
        title: 'Pivot Tables',
        summary: 'A grouped summary laid out as a grid.',
        objectives: [
          'Lay a two-key summary out as a grid.',
          'Name what goes down, what goes across, and what fills the cells.',
          'Say what <code>aggfunc</code> defaults to.',
          'Read the gaps in the grid.',
        ],
        why: 'A pivot table is the same computation as a two-key group-by, arranged so a person can read it. That arrangement is the whole value: a grid with subjects down and years across is scannable in a way a 40-row two-level index is not.',
        sections: [
          {
            heading: 'Rows, columns and a value',
            intro: '<code>index</code> is what goes down the side, <code>columns</code> is what goes across the top, <code>values</code> is what fills the cells.',
            steps: [
              {
                heading: 'The same numbers, laid out',
                prose: 'Compare it with the group-by beneath. Identical arithmetic, different shape.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a"], "year": [10, 11, 10], "score": [90, 80, 70]})\n\nprint(pd.pivot_table(df, index="subject", columns="year", values="score", aggfunc="mean"))\nprint()\nprint(df.groupby(["subject", "year"])["score"].mean())',
              },
              {
                heading: 'aggfunc is not count',
                prose: 'It defaults to <code>mean</code>, which surprises people expecting a spreadsheet pivot\'s count. Name it whenever you mean something else.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m"], "year": [10, 10], "score": [90, 80]})\nprint(pd.pivot_table(df, index="subject", columns="year", values="score"))\nprint(pd.pivot_table(df, index="subject", columns="year", values="score", aggfunc="size"))',
              },
            ],
          },
          {
            heading: 'Combinations with no rows',
            intro: 'A grid has a cell for every combination, including the ones the data never had. Those cells are NaN, and that is information.',
            steps: [
              {
                heading: 'The gaps',
                prose: 'Unlike a group-by, which simply omits an absent pair, the grid shows it as an empty cell — which is often exactly what you wanted to see.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "a"], "year": [10, 11], "score": [90, 70]})\nprint(pd.pivot_table(df, index="subject", columns="year", values="score", aggfunc="mean"))',
              },
              {
                heading: 'Filling them, if a zero is honest',
                prose: '<code>fill_value</code> replaces the gaps. Use it only when "no rows" really does mean zero — for a count it usually does, for a mean it never does.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "a"], "year": [10, 11], "score": [90, 70]})\nprint(pd.pivot_table(df, index="subject", columns="year", values="score",\n                     aggfunc="size", fill_value=0))',
                note: 'Filling a missing <em>mean</em> with 0 claims a group scored nothing, when the truth is that nobody sat it. The gap was the honest answer.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Grid and group-by',
            prompt: 'Produce the same summary both ways and satisfy yourself the numbers match.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a", "a"], "year": [10, 11, 10, 11], "score": [90, 80, 70, 60]})\n\nprint(pd.pivot_table(df, index="subject", columns="year", values="score", aggfunc="mean"))\nprint(df.groupby(["subject", "year"])["score"].mean())\n',
          },
          {
            after: 1,
            title: 'Count, not mean',
            prompt: 'Make a grid of how many rows each subject/year pair has, with empty pairs shown as 0.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"subject": ["m", "m", "a"], "year": [10, 10, 11], "score": [90, 80, 70]})\n\nprint(pd.pivot_table(df, index="subject", columns="year", values="score", aggfunc="size", fill_value=0))\n',
          },
        ],
        exercises: [
          {
            title: 'The shape of the grid',
            prompt: 'Write <code>grid_shape(df)</code> that pivots <code>score</code> with <code>subject</code> down the rows and <code>year</code> across the columns, and returns the shape of the result.',
            starter: 'import pandas as pd\n\ndef grid_shape(df):\n    # (rows, columns) of the pivoted grid\n    return None\n\nprint(grid_shape(pd.DataFrame({"subject": ["m"], "year": [10], "score": [90]})))\n',
            call: `grid_shape(${pdf('{"subject": ["m", "m", "a"], "year": [10, 11, 10], "score": [90, 80, 70]}')})`,
            expectValue: '(2, 2)',
            hidden: [
              { name: 'one subject and one year is a single cell', call: `grid_shape(${pdf('{"subject": ["m"], "year": [10], "score": [5]}')})`, expect: '(1, 1)' },
              { name: 'the grid has a column per distinct year', call: `grid_shape(${pdf('{"subject": ["m", "m"], "year": [10, 11], "score": [5, 6]}')})`, expect: '(1, 2)' },
              { name: 'pandas does the pivoting', kind: 'ast', requires: { calls: ['pivot_table'] }, describe: 'pivot_table' },
            ],
            hint: 'index is what goes down the side, columns is what goes across the top, values is what fills the cells. The shape is distinct subjects by distinct years.',
            correct: 'import pandas as pd\n\ndef grid_shape(df):\n    out = pd.pivot_table(df, index="subject", columns="year",\n                        values="score", aggfunc="mean")\n    return (out.shape[0], out.shape[1])\n',
            wrong: 'import pandas as pd\n\ndef grid_shape(df):\n    out = pd.pivot_table(df, index="year", columns="subject",\n                        values="score", aggfunc="mean")\n    return (out.shape[0], out.shape[1])\n',
          },
          {
            title: 'How many pairs never happened',
            prompt: 'Write <code>empty_cells(df)</code> that pivots the same way and returns how many cells of the grid are empty — combinations of subject and year with no rows behind them.',
            starter: 'import pandas as pd\n\ndef empty_cells(df):\n    # How many grid cells have no rows behind them.\n    return 0\n\nprint(empty_cells(pd.DataFrame({"subject": ["m", "a"], "year": [10, 11], "score": [90, 70]})))\n',
            call: `empty_cells(${pdf('{"subject": ["m", "a"], "year": [10, 11], "score": [90, 70]}')})`,
            expectValue: '2',
            hidden: [
              { name: 'a full grid has no gaps',
                call: `empty_cells(${pdf('{"subject": ["m", "m"], "year": [10, 11], "score": [1, 2]}')})`, expect: '0' },
              { name: 'a single cell grid is full', call: `empty_cells(${pdf('{"subject": ["m"], "year": [10], "score": [1]}')})`, expect: '0' },
              { name: 'the count is a plain int', call: `type(empty_cells(${pdf('{"subject": ["m"], "year": [10], "score": [1]}')})).__name__`, expect: "'int'" },
              { name: 'pandas does the pivoting', kind: 'ast', requires: { calls: ['pivot_table'] }, describe: 'pivot_table' },
            ],
            hint: 'Pivot with aggfunc="mean" and leave the gaps as NaN, then count them with .isna().sum().sum(). Passing fill_value would remove the very thing you are counting.',
            correct: 'import pandas as pd\n\ndef empty_cells(df):\n    out = pd.pivot_table(df, index="subject", columns="year",\n                        values="score", aggfunc="mean")\n    return int(out.isna().sum().sum())\n',
            wrong: 'import pandas as pd\n\ndef empty_cells(df):\n    out = pd.pivot_table(df, index="subject", columns="year",\n                        values="score", aggfunc="mean", fill_value=0)\n    return int(out.isna().sum().sum())\n',
          },
        ],
        questions: [
          { id: 'd7-pt-1', prompt: 'What is a pivot table, in terms of what you already know?',
            choices: ['A merge', 'A two-key group-by laid out as a grid', 'A filter', 'A sort'], answer: 1,
            explain: 'Identical arithmetic, different shape — and the shape is the value, because a grid is scannable.' },
          { id: 'd7-pt-2', prompt: 'What does aggfunc default to?',
            choices: ['sum', 'mean', 'count', 'first'], answer: 1,
            explain: 'Which surprises people expecting a spreadsheet pivot’s count. Name it when you mean something else.' },
          { id: 'd7-pt-3', prompt: 'A subject/year pair has no rows. What is in that cell?',
            choices: ['0', 'NaN', 'The cell is absent', 'An error'], answer: 1,
            explain: 'Unlike a group-by, which omits the pair entirely, a grid has a cell for every combination.' },
          { id: 'd7-pt-4', prompt: 'When is fill_value=0 the wrong choice?',
            choices: ['For a count', 'For a mean', 'Always', 'Never'], answer: 1,
            explain: 'It claims a group scored nothing when the truth is that nobody sat it. For a count, zero usually is the honest answer.' },
        ],
      },
    ],
  },
};
