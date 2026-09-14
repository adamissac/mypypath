/* Python for Data, unit 10 — Visualising and Reporting.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * The last unit is about the step where the analysis meets a reader, and almost
 * all of it is about honesty rather than technique: a chart shape that matches
 * the question, a label that says what the number is, a precision that matches
 * what the data supports, and a claim that says what it does not prove.
 *
 * The exercises stay in pandas rather than a plotting library, because the
 * table behind a chart is the part that can be checked -- and because a wrong
 * table makes a beautiful chart.
 */

const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;
const pds = (literal) => `__import__("pandas").Series(${literal})`;
const CALLS = (calls, describe) => ({
  name: 'the summary is computed, not typed', kind: 'ast', requires: { calls }, describe,
});

module.exports = {
  unit10: {
    title: 'Visualising and Reporting',
    blurb: 'The chart the question asks for, and the write-up that survives a reader.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'choosing-a-chart',
        title: 'Choosing a Chart',
        summary: 'The shape of the question decides the shape of the picture.',
        objectives: [
          'Match four common question shapes to four chart types.',
          'Say what the table behind each chart looks like.',
          'Explain why a pie chart is usually the wrong answer.',
          'Build the summary table before thinking about the picture.',
        ],
        why: 'Choosing the chart is not a decoration step — it is the last analysis decision. A bar chart and a line chart of the same numbers make different claims, and picking the one that matches your question is what stops the picture saying something the data does not.',
        sections: [
          {
            heading: 'Four questions, four charts',
            intro: 'Almost every chart you need is one of these, and the question tells you which.',
            steps: [
              {
                heading: 'The mapping',
                prose: 'Comparison across categories is a bar. Change over time is a line. The distribution of one column is a histogram. The relationship between two numbers is a scatter.',
                code: '# Comparison  -> bar        mean score per team\n# Over time   -> line       sales per month\n# Distribution-> histogram  how scores are spread\n# Relationship-> scatter    hours against score\nprint("the question decides, not the tool")',
              },
              {
                heading: 'Why bars work',
                prose: 'Bars share a baseline and encode value as length, which is the comparison people read most accurately. A pie encodes it as angle, which they read worst — and it can only ever show parts of one whole.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["red", "red", "blue"], "score": [90, 80, 70]})\nprint(df.groupby("team")["score"].mean().round(1))',
              },
            ],
          },
          {
            heading: 'What the code looks like',
            intro: 'The chart is one call. The table behind it is the part worth getting right, and the part you can check.',
            steps: [
              {
                heading: 'Table first',
                prose: 'Every chart in this lesson is a summary table plus a <code>.plot</code>. If the table is wrong, the chart is wrong and much more convincing.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["red", "red", "blue"], "score": [90, 80, 70]})\nsummary = df.groupby("team")["score"].mean().round(1)\nprint(summary)\n# summary.plot(kind="bar")   # the picture, once the table is right',
              },
              {
                heading: 'Sort a bar chart by value',
                prose: 'Alphabetical order carries no information. Ordering the bars by the thing being compared is what makes the ranking readable at a glance.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["zeta", "alpha", "mu"], "score": [70.0, 90.0, 80.0]})\nmeans = df.groupby("team")["score"].mean()\nprint(means)\nprint(means.sort_values(ascending=False))',
                note: 'The exception is a category with a natural order — months, age bands, school years. Sorting those by value destroys the thing the reader is using to navigate.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Name the chart',
            prompt: 'For each question, write down which of the four charts it asks for before reading on.',
            starter: '# 1. How does revenue change across the twelve months?\n# 2. Which of our five regions sells most per head?\n# 3. Are longer study hours associated with higher marks?\n# 4. What do the marks look like -- clustered, or spread out?\n\nprint("line, bar, scatter, histogram")\n',
          },
          {
            after: 1,
            title: 'Order the bars',
            prompt: 'Produce the mean per team and then the same table ordered so the ranking is readable.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["zeta", "alpha", "mu"], "score": [70.0, 90.0, 80.0]})\n\nmeans = df.groupby("team")["score"].mean()\nprint(means)\nprint(None)   # ordered by value\n',
          },
        ],
        use: {
          cards: [
            { title: 'Comparing categories', text: 'A bar chart of one summary per group, sorted by value.', code: 'df.groupby("team")["score"].mean().sort_values()' },
            { title: 'Showing change over time', text: 'A line chart of a series with dates on the index.' },
          ],
          avoid: 'Do not use a pie chart to compare more than two or three parts, or a line chart to connect categories that have no order.',
        },
        exercises: [
          {
            title: 'The table behind a bar chart',
            prompt: 'Write <code>chart_data(df)</code> that returns the table behind a bar chart of mean score per team, as a dictionary of team to mean rounded to one decimal place.',
            starter: 'import pandas as pd\n\ndef chart_data(df):\n    # {team: mean score} -- the table a bar chart would draw.\n    return {}\n\nprint(chart_data(pd.DataFrame({"team": ["red"], "score": [90]})))\n',
            call: `chart_data(${pdf('{"team": ["red", "red", "blue"], "score": [90, 80, 70]}')})`,
            expectValue: "{'blue': 70.0, 'red': 85.0}",
            hidden: [
              { name: 'one team gives one bar', call: `chart_data(${pdf('{"team": ["solo"], "score": [50]}')})`, expect: "{'solo': 50.0}" },
              { name: "each bar is its own team's mean", call: `chart_data(${pdf('{"team": ["a", "a", "b"], "score": [0, 100, 50]}')})`, expect: "{'a': 50.0, 'b': 50.0}" },
              CALLS(['groupby'], 'a group-by behind the chart'),
            ],
            hint: 'A bar chart of "mean by team" is a group-by with the means rounded for display. Get that table right and the chart is one more line.',
            correct: 'import pandas as pd\n\ndef chart_data(df):\n    return df.groupby("team")["score"].mean().round(1).to_dict()\n',
            wrong: 'import pandas as pd\n\ndef chart_data(df):\n    return df.groupby("team")["score"].sum().round(1).to_dict()\n',
          },
          {
            title: 'Bars in a readable order',
            prompt: 'Write <code>ranked_bars(df)</code> returning a list of <code>(team, mean)</code> pairs ordered highest mean first, with the means to one decimal place. Alphabetical order carries no information.',
            starter: 'import pandas as pd\n\ndef ranked_bars(df):\n    # [(team, mean)] highest first.\n    return []\n\nprint(ranked_bars(pd.DataFrame({"team": ["zeta", "alpha"], "score": [70.0, 90.0]})))\n',
            call: `ranked_bars(${pdf('{"team": ["zeta", "alpha", "mu"], "score": [70.0, 90.0, 80.0]}')})`,
            expectValue: "[('alpha', 90.0), ('mu', 80.0), ('zeta', 70.0)]",
            hidden: [
              { name: 'one team is already ranked', call: `ranked_bars(${pdf('{"team": ["solo"], "score": [5.0]}')})`, expect: "[('solo', 5.0)]" },
              { name: 'the order is by value, not by name', call: `[t for t, _ in ranked_bars(${pdf('{"team": ["a", "z"], "score": [1.0, 9.0]}')})]`, expect: "['z', 'a']" },
              { name: 'the means are per team', call: `ranked_bars(${pdf('{"team": ["a", "a"], "score": [0.0, 100.0]}')})`, expect: "[('a', 50.0)]" },
              CALLS(['groupby'], 'a group-by behind the chart'),
            ],
            hint: 'Group to a mean per team, round, sort_values(ascending=False), then build plain (name, value) tuples with str() and float().',
            correct: 'import pandas as pd\n\ndef ranked_bars(df):\n    means = df.groupby("team")["score"].mean().round(1).sort_values(ascending=False)\n    return [(str(k), float(v)) for k, v in means.items()]\n',
            wrong: 'import pandas as pd\n\ndef ranked_bars(df):\n    means = df.groupby("team")["score"].mean().round(1).sort_index()\n    return [(str(k), float(v)) for k, v in means.items()]\n',
          },
        ],
        questions: [
          { id: 'd10-cc-1', prompt: 'Which chart suits comparing one value across a handful of categories?',
            choices: ['A line chart', 'A bar chart', 'A scatter plot', 'A pie chart'], answer: 1,
            explain: 'Bars share a baseline and encode value as length, which people compare most accurately.' },
          { id: 'd10-cc-2', prompt: 'Which suits the distribution of a single numeric column?',
            choices: ['A histogram', 'A pie chart', 'A line chart', 'A stacked bar'], answer: 0,
            explain: 'It answers "what do the values look like", which no summary statistic does on its own.' },
          { id: 'd10-cc-3', prompt: 'Why is a pie chart usually the wrong choice?',
            choices: ['It is ugly', 'Angle is read less accurately than length, and it only shows parts of one whole', 'It is slow', 'pandas cannot draw one'], answer: 1,
            explain: 'Any comparison it makes, a bar chart makes more precisely.' },
          { id: 'd10-cc-4', prompt: 'When should bars NOT be sorted by value?',
            choices: ['Never sort', 'When the category has a natural order, like months', 'When there are more than five', 'Always sort'], answer: 1,
            explain: 'Sorting months by value destroys the thing the reader is using to navigate.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'labels-and-honesty',
        title: 'Labels and Honesty',
        summary: 'A chart without units is a decoration, and a cut axis is an argument.',
        objectives: [
          'Say what every chart needs before it is readable.',
          'Explain what a truncated axis does to a comparison.',
          'State a comparison in words, with its size.',
          'Recognise a choice that is making an argument for you.',
        ],
        why: 'Every chart makes a claim. The labels are what let a reader check it, and the axis is what decides how big the claim looks. Neither is a styling question: a chart with no units and a zoomed axis can make a one per cent difference look like a crisis, without a single number being wrong.',
        sections: [
          {
            heading: 'The label is part of the answer',
            intro: 'A number with no unit is not information. The reader cannot tell pounds from thousands of pounds from a percentage.',
            steps: [
              {
                heading: 'What a chart needs',
                prose: 'A title saying what it shows, both axes labelled with units, and a note of how many observations are behind it. Four things, and a chart missing any of them is asking the reader to guess.',
                code: '# title:  "Mean exam score by team, 2024"\n# y axis: "Mean score (out of 100)"\n# x axis: "Team"\n# note:   "n = 48 students"\nprint("the units are half the claim")',
              },
              {
                heading: 'The claim in words',
                prose: 'If you cannot write the sentence, the chart is not finished. The sentence needs the direction, the size and the comparison.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["red", "red", "blue"], "score": [90.0, 80.0, 70.0]})\nmeans = df.groupby("team")["score"].mean().round(1)\ngap = round(float(means.max() - means.min()), 1)\nprint(f"{means.idxmax()} leads on {means.max()}, {gap} ahead of {means.idxmin()}")',
              },
            ],
          },
          {
            heading: 'A truncated axis exaggerates',
            intro: 'Starting a bar chart\'s axis at 80 rather than 0 makes a small difference fill the frame. It can be defensible; it is never neutral.',
            steps: [
              {
                heading: 'The same numbers, two impressions',
                prose: '85 and 82 differ by three and a half per cent. On an axis from 80 to 90 one bar is more than twice the other.',
                code: 'import pandas as pd\n\nmeans = pd.Series({"red": 85.0, "blue": 82.0})\nprint(means)\nprint("real difference:", round(float(means.max() - means.min()), 1))\nprint("as a share of the smaller:", f"{(means.max() - means.min()) / means.min():.1%}")\n\nfull = means / 100\nzoomed = (means - 80) / 10\nprint("bar heights on a 0-100 axis:", full.round(2).to_dict())\nprint("bar heights on an 80-90 axis:", zoomed.round(2).to_dict())',
                note: 'The numbers did not change. The picture did. If you truncate an axis, say so on the chart — and be sure the reason is that the detail matters, not that the difference looked small.',
              },
              {
                heading: 'The other quiet arguments',
                prose: 'A colour scale with an off-centre midpoint, a y-axis that is a rate in one panel and a total in the next, a time axis with uneven gaps. Each is a decision the reader will not see you make.',
                code: 'import pandas as pd\n\n# Totals favour the big region; rates favour the small one.\ndf = pd.DataFrame({"region": ["big", "small"], "sales": [1000.0, 300.0], "people": [500, 50]})\ndf["per_person"] = df["sales"] / df["people"]\nprint(df)\nprint("by total:", df.loc[df["sales"].idxmax(), "region"])\nprint("by rate: ", df.loc[df["per_person"].idxmax(), "region"])',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Write the sentence',
            prompt: 'Produce the means, then print a sentence naming the leader, its value and the gap.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["red", "red", "blue"], "score": [90.0, 80.0, 70.0]})\n\nmeans = df.groupby("team")["score"].mean().round(1)\ngap = round(float(means.max() - means.min()), 1)\nprint(f"{means.idxmax()} leads on {means.max()}, {gap} ahead of {means.idxmin()}")\n',
          },
          {
            after: 1,
            title: 'How big is the difference, really',
            prompt: 'Print the absolute gap and the gap as a share of the smaller value, then decide whether it deserves a zoomed axis.',
            starter: 'import pandas as pd\n\nmeans = pd.Series({"red": 85.0, "blue": 82.0})\n\nprint(round(float(means.max() - means.min()), 1))\nprint(f"{(means.max() - means.min()) / means.min():.1%}")\n',
          },
        ],
        use: {
          cards: [
            { title: 'Every chart you share', text: 'A title that states the finding, axis labels with units, and the data source.' },
            { title: 'Small differences that matter', text: 'A cut axis is acceptable when it is labelled clearly and the difference is the point.' },
          ],
          avoid: 'Do not start a bar chart’s axis above zero. Bar length is the value, and a cut axis turns a 2% gap into what looks like double.',
        },
        exercises: [
          {
            title: 'The headline sentence',
            prompt: 'Write <code>headline(df)</code> that returns a sentence of the form <code>"red leads on 85.0, 15.0 ahead of blue"</code>, using the highest and lowest mean score per team.',
            starter: 'import pandas as pd\n\ndef headline(df):\n    # "<top> leads on <mean>, <gap> ahead of <bottom>"\n    return ""\n\nprint(headline(pd.DataFrame({"team": ["red", "blue"], "score": [85.0, 70.0]})))\n',
            call: `headline(${pdf('{"team": ["red", "red", "blue"], "score": [90.0, 80.0, 70.0]}')})`,
            expectValue: "'red leads on 85.0, 15.0 ahead of blue'",
            hidden: [
              { name: 'the gap is measured, not assumed', call: `headline(${pdf('{"team": ["a", "b"], "score": [10.0, 4.0]}')})`, expect: "'a leads on 10.0, 6.0 ahead of b'" },
              { name: 'the leader is whichever team is actually highest', call: `headline(${pdf('{"team": ["low", "high"], "score": [1.0, 9.0]}')})`, expect: "'high leads on 9.0, 8.0 ahead of low'" },
              CALLS(['groupby'], 'the means come from a group-by'),
            ],
            hint: 'Group to a mean per team, round to one place, then use idxmax and idxmin for the names. The gap is the difference between the two means.',
            correct: 'import pandas as pd\n\ndef headline(df):\n    means = df.groupby("team")["score"].mean().round(1)\n    top = means.idxmax()\n    bottom = means.idxmin()\n    gap = round(float(means.max() - means.min()), 1)\n    return f"{top} leads on {means.max()}, {gap} ahead of {bottom}"\n',
            wrong: 'import pandas as pd\n\ndef headline(df):\n    means = df.groupby("team")["score"].mean().round(1)\n    return f"{means.idxmax()} leads on {means.max()}, 15.0 ahead of {means.idxmin()}"\n',
          },
          {
            title: 'How big is the gap, in context',
            prompt: 'Write <code>gap_size(df)</code> returning a two-element list of [the absolute gap between the highest and lowest team mean, that gap as a percentage of the lowest mean], both to one decimal place. The second number is what says whether the first one matters.',
            starter: 'import pandas as pd\n\ndef gap_size(df):\n    # [absolute gap, gap as % of the smaller mean]\n    return [0.0, 0.0]\n\nprint(gap_size(pd.DataFrame({"team": ["a", "b"], "score": [85.0, 82.0]})))\n',
            call: `gap_size(${pdf('{"team": ["a", "b"], "score": [85.0, 82.0]}')})`,
            expectValue: '[3.0, 3.7]',
            hidden: [
              { name: 'a large gap reads large both ways', call: `gap_size(${pdf('{"team": ["a", "b"], "score": [100.0, 50.0]}')})`, expect: '[50.0, 100.0]' },
              { name: 'identical teams have no gap', call: `gap_size(${pdf('{"team": ["a", "b"], "score": [70.0, 70.0]}')})`, expect: '[0.0, 0.0]' },
              { name: 'the gap is between group means, not rows', call: `gap_size(${pdf('{"team": ["a", "a", "b"], "score": [90.0, 70.0, 40.0]}')})`, expect: '[40.0, 100.0]' },
              CALLS(['groupby'], 'the means come from a group-by'),
            ],
            hint: 'Group to means, take max and min, subtract for the gap, then divide the gap by the minimum and multiply by 100. Round both at the end.',
            correct: 'import pandas as pd\n\ndef gap_size(df):\n    means = df.groupby("team")["score"].mean()\n    gap = float(means.max() - means.min())\n    share = gap / float(means.min()) * 100 if float(means.min()) else 0.0\n    return [round(gap, 1), round(share, 1)]\n',
            wrong: 'import pandas as pd\n\ndef gap_size(df):\n    means = df.groupby("team")["score"].mean()\n    gap = float(means.max() - means.min())\n    share = gap / float(means.max()) * 100 if float(means.max()) else 0.0\n    return [round(gap, 1), round(share, 1)]\n',
          },
        ],
        questions: [
          { id: 'd10-lh-1', prompt: 'A chart without units is what?',
            choices: ['Fine if the title is clear', 'A decoration', 'Automatically wrong', 'Only a problem in print'], answer: 1,
            explain: 'The reader cannot tell pounds from thousands of pounds from a percentage.' },
          { id: 'd10-lh-2', prompt: 'A bar chart whose y-axis starts at 80 rather than 0 does what?',
            choices: ['Nothing', 'Exaggerates the differences between the bars', 'Is always wrong', 'Fixes the scale'], answer: 1,
            explain: 'It can be defensible, but it is an argument and it has to be labelled as one.' },
          { id: 'd10-lh-3', prompt: 'What belongs in a chart alongside the title and axis labels?',
            choices: ['The code', 'How many observations it rests on', 'The file name', 'The date you made it'], answer: 1,
            explain: 'A difference between two rows and a difference between two thousand look identical on a chart.' },
          { id: 'd10-lh-4', prompt: 'Reporting totals rather than rates is what kind of decision?',
            choices: ['Purely technical', 'One that can change which group looks best', 'Irrelevant', 'Always wrong'], answer: 1,
            explain: 'Totals favour the big region and rates favour the small one, and the reader will not see you choose.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'formatting-numbers',
        title: 'Formatting Numbers',
        summary: 'Round at the end, and show the precision you actually have.',
        objectives: [
          'Round for display without rounding during the calculation.',
          'Say what a number of decimal places claims.',
          'Format a percentage and a large number readably.',
          'Report the middle with the spread beside it.',
        ],
        why: 'Rounding early puts error into every step that follows; rounding late and too finely claims a precision the data never had. Nine observations do not support four decimal places, and printing them anyway tells a reader the answer is more certain than it is.',
        sections: [
          {
            heading: 'Round for the reader, not for the maths',
            intro: 'Keep full precision through the calculation and round once, at the point where a person sees it.',
            steps: [
              {
                heading: 'What early rounding costs',
                prose: 'Rounding each value before averaging is a different calculation from averaging then rounding, and on enough rows the difference is visible.',
                code: 'import pandas as pd\n\ns = pd.Series([1.25, 1.25, 1.25, 1.25])\nprint(round(float(s.mean()), 1))\nprint(round(float(s.round(1).mean()), 1))',
              },
              {
                heading: 'Formatting, which is not rounding',
                prose: 'An f-string formats for display and leaves the value alone. That is usually what you want: the stored number stays exact and only the printed one is shortened.',
                code: 'import pandas as pd\n\nvalue = 1234567.891\nprint(f"{value:,.0f}")\nprint(f"{value:.2f}")\n\nshare = 0.0734\nprint(f"{share:.1%}")',
              },
            ],
          },
          {
            heading: 'Precision is a claim',
            intro: 'Each decimal place you print says "I know the answer this precisely". With nine observations, you do not.',
            steps: [
              {
                heading: 'What the extra digits mean',
                prose: '72.4183 over nine rows is noise dressed as certainty. One decimal place is usually generous for a mean of a small sample.',
                code: 'import pandas as pd\n\nsmall = pd.Series([70, 72, 75, 68, 80, 71, 73, 69, 74])\nprint(len(small), "observations")\nprint(small.mean())\nprint(round(float(small.mean()), 1))',
              },
              {
                heading: 'The middle needs its spread',
                prose: 'A mean on its own hides how much the values vary. Reporting the minimum and maximum beside it costs one line and stops a wide spread being read as a tight one.',
                code: 'import pandas as pd\n\ntight = pd.Series([70.0, 71.0, 72.0])\nwide = pd.Series([10.0, 71.0, 132.0])\nfor s in (tight, wide):\n    print(f"mean {s.mean():.1f} (min {s.min():.1f}, max {s.max():.1f})")',
                note: 'Both have a mean of 71. Only one of them supports the sentence "they scored about 71".',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Round late',
            prompt: 'Average these both ways — rounding first, and rounding last — and see which one is right.',
            starter: 'import pandas as pd\n\ns = pd.Series([1.25, 1.25, 1.25, 1.25])\n\nprint(round(float(s.mean()), 1))\nprint(round(float(s.round(1).mean()), 1))\n',
          },
          {
            after: 1,
            title: 'Two series, one mean',
            prompt: 'Print the mean, minimum and maximum of both. They share a mean and should not share a sentence.',
            starter: 'import pandas as pd\n\ntight = pd.Series([70.0, 71.0, 72.0])\nwide = pd.Series([10.0, 71.0, 132.0])\n\nfor s in (tight, wide):\n    print(f"mean {s.mean():.1f} (min {s.min():.1f}, max {s.max():.1f})")\n',
          },
        ],
        use: {
          cards: [
            { title: 'The number a reader sees', text: 'Round once, at the end, to the precision the data supports.', code: 'f"{mean:.1f}%"' },
            { title: 'Large and small values', text: 'Thousands separators and percentages make a figure readable at a glance.' },
          ],
          avoid: 'Do not round values on the way in and then compute with them. Small rounding errors add up — round only the final answer.',
        },
        exercises: [
          {
            title: 'The middle, with its ends',
            prompt: 'Write <code>summary_line(s)</code> returning <code>"mean 82.0 (min 70.0, max 95.0)"</code> for a Series, every number to one decimal place.',
            starter: 'import pandas as pd\n\ndef summary_line(s):\n    # "mean M (min L, max H)" to one decimal place.\n    return ""\n\nprint(summary_line(pd.Series([70.0, 95.0])))\n',
            call: `summary_line(${pds('[70.0, 81.0, 95.0]')})`,
            expectValue: "'mean 82.0 (min 70.0, max 95.0)'",
            hidden: [
              { name: 'a single value is its own mean and both ends', call: `summary_line(${pds('[5.0]')})`, expect: "'mean 5.0 (min 5.0, max 5.0)'" },
              { name: 'the mean is computed, not copied from an end', call: `summary_line(${pds('[0.0, 10.0]')})`, expect: "'mean 5.0 (min 0.0, max 10.0)'" },
              CALLS(['min', 'max'], 'the smallest and largest values alongside the mean'),
            ],
            hint: 'Compute all three, round each to one place with float() so they print as plain numbers, and build the sentence with an f-string.',
            correct: 'import pandas as pd\n\ndef summary_line(s):\n    mean = round(float(s.mean()), 1)\n    low = round(float(s.min()), 1)\n    high = round(float(s.max()), 1)\n    return f"mean {mean} (min {low}, max {high})"\n',
            wrong: 'import pandas as pd\n\ndef summary_line(s):\n    mean = round(float(s.mean()), 1)\n    return f"mean {mean} (min {mean}, max {mean})"\n',
          },
          {
            title: 'Round once, at the end',
            prompt: 'Write <code>mean_to(s, places)</code> returning the mean of the Series rounded to <code>places</code> decimal places — rounding only the final answer, never the values on the way in.',
            starter: 'import pandas as pd\n\ndef mean_to(s, places):\n    # The mean, rounded once at the end.\n    return 0.0\n\nprint(mean_to(pd.Series([1.25, 1.25, 1.25, 1.25]), 1))\n',
            call: `mean_to(${pds('[1.26, 1.26, 1.26, 1.26]')}, 1)`,
            expectValue: '1.3',
            hidden: [
              { name: 'rounding the inputs first would give a different answer', call: `mean_to(${pds('[0.6, 0.6, 0.0]')}, 0)`, expect: '0.0' },
              { name: 'more places keep more of the answer', call: `mean_to(${pds('[1.0, 2.0]')}, 2)`, expect: '1.5' },
              { name: 'zero places gives a whole number', call: `mean_to(${pds('[1.4, 1.4]')}, 0)`, expect: '1.0' },
              { name: 'a single value rounds to itself', call: `mean_to(${pds('[3.14159]')}, 2)`, expect: '3.14' },
            ],
            hint: 'Take s.mean() at full precision, then round once. Calling s.round(places) first would round every value before averaging, which is a different calculation.',
            correct: 'import pandas as pd\n\ndef mean_to(s, places):\n    return round(float(s.mean()), places)\n',
            wrong: 'import pandas as pd\n\ndef mean_to(s, places):\n    return round(float(s.round(places).mean()), places)\n',
          },
        ],
        questions: [
          { id: 'd10-fn-1', prompt: 'When should you round?',
            choices: ['As early as possible', 'At the end, for display only', 'Never', 'After every step'], answer: 1,
            explain: 'Rounding early puts the error into every calculation that follows.' },
          { id: 'd10-fn-2', prompt: 'Reporting a mean as 72.4183 from nine observations does what?',
            choices: ['Nothing', 'Claims precision the data does not support', 'Is more accurate', 'Is required'], answer: 1,
            explain: 'The extra digits are noise dressed as certainty.' },
          { id: 'd10-fn-3', prompt: 'What does f"{0.0734:.1%}" print?',
            choices: ['0.1%', '7.3%', '73.4%', '0.07'], answer: 1,
            explain: 'The percent format multiplies by 100 and appends the sign, formatting without changing the stored value.' },
          { id: 'd10-fn-4', prompt: 'Why report min and max beside a mean?',
            choices: ['Convention', 'Two very different columns can share a mean', 'It is faster', 'To find duplicates'], answer: 1,
            explain: '70/71/72 and 10/71/132 both average 71, and only one supports "they scored about 71".' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'a-summary-table',
        title: 'A Summary Table',
        summary: 'The small table that goes under the chart.',
        objectives: [
          'Build a table with one row per thing and one column per fact.',
          'Order it by the thing being compared.',
          'Include the group size.',
          'Say what the table does that the chart cannot.',
        ],
        why: 'A chart shows the shape; the table pins the values. Together they answer both "what is the pattern" and "what exactly was the number", and the group size in the table is what stops a reader over-reading a bar built from two rows.',
        sections: [
          {
            heading: 'One row per thing, one column per fact',
            intro: 'The table under a chart is small on purpose: the few numbers the picture cannot state exactly, and the counts behind them.',
            steps: [
              {
                heading: 'Count and mean together',
                prose: 'One group-by gives both. The count is not optional — it is what makes the mean interpretable.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 95.0]})\nprint(df.groupby("team")["score"].agg(["count", "mean"]).round(1))',
              },
              {
                heading: 'Name the columns for a reader',
                prose: '"count" and "mean" are how it was computed. "students" and "mean score" are what it means.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 95.0]})\nout = df.groupby("team").agg(\n    students=("score", "count"),\n    mean_score=("score", "mean"),\n).round(1)\nprint(out)',
              },
            ],
          },
          {
            heading: 'Order it by the thing being compared',
            intro: 'The first row should be the one the reader is looking for. Alphabetical order almost never is.',
            steps: [
              {
                heading: 'Sort by the value',
                prose: 'Best first, so the ranking is visible without reading every row.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 95.0]})\nout = df.groupby("team")["score"].agg(["count", "mean"]).round(1)\nprint(out.sort_values("mean", ascending=False))',
              },
              {
                heading: 'And match the chart',
                prose: 'If the bars are ordered by value, the table should be too. A reader moving between the two should not have to re-find each row.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["zeta", "alpha", "mu"], "score": [70.0, 90.0, 80.0]})\norder = df.groupby("team")["score"].mean().sort_values(ascending=False).index\nprint(list(order))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Count and mean, named',
            prompt: 'Produce a summary with the columns named <code>students</code> and <code>mean_score</code>.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 95.0]})\n\nprint(df.groupby("team").agg(\n    students=("score", "count"),\n    mean_score=("score", "mean"),\n).round(1))\n',
          },
          {
            after: 1,
            title: 'Best first',
            prompt: 'Sort the same summary so the highest mean is the first row.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 95.0]})\n\nout = df.groupby("team")["score"].agg(["count", "mean"]).round(1)\nprint(None)   # sorted by mean, best first\n',
          },
        ],
        use: {
          cards: [
            { title: 'Under a chart', text: 'The exact values the picture only shows approximately, with the group sizes.', code: 'df.groupby("team").agg(students=("score", "count"), mean_score=("score", "mean"))' },
            { title: 'When readers need to look things up', text: 'A short, sorted table answers “what exactly was it for my group”.' },
          ],
          avoid: 'Do not paste the whole grouped output. A summary table that needs scrolling is data, not a summary — keep the few columns the question needs.',
        },
        exercises: [
          {
            title: 'The table under the chart',
            prompt: 'Write <code>summary_table(df)</code> returning a list of <code>(team, count, mean)</code> tuples, highest mean first, with the mean to one decimal place.',
            starter: 'import pandas as pd\n\ndef summary_table(df):\n    # [(team, count, mean)] sorted by mean, best first.\n    return []\n\nprint(summary_table(pd.DataFrame({"team": ["a"], "score": [90.0]})))\n',
            call: `summary_table(${pdf('{"team": ["a", "a", "b"], "score": [90.0, 80.0, 95.0]}')})`,
            expectValue: "[('b', 1, 95.0), ('a', 2, 85.0)]",
            hidden: [
              { name: 'a single group is a single row', call: `summary_table(${pdf('{"team": ["solo"], "score": [7.0]}')})`, expect: "[('solo', 1, 7.0)]" },
              { name: 'the counts are per group', call: `[row[1] for row in summary_table(${pdf('{"team": ["a", "a", "b"], "score": [1.0, 2.0, 3.0]}')})]`, expect: '[1, 2]' },
              { name: 'the order is by mean, not by name', call: `[row[0] for row in summary_table(${pdf('{"team": ["z", "a"], "score": [9.0, 1.0]}')})]`, expect: "['z', 'a']" },
              CALLS(['groupby'], 'one group-by behind the table'),
            ],
            hint: 'Group once and ask for count and mean together, sort by the mean descending, then build plain tuples so the result is easy to compare.',
            correct: 'import pandas as pd\n\ndef summary_table(df):\n    out = df.groupby("team")["score"].agg(["count", "mean"])\n    out = out.sort_values("mean", ascending=False)\n    return [(str(k), int(r["count"]), round(float(r["mean"]), 1))\n            for k, r in out.iterrows()]\n',
            wrong: 'import pandas as pd\n\ndef summary_table(df):\n    out = df.groupby("team")["score"].agg(["count", "mean"]).sort_index()\n    return [(str(k), int(r["count"]), round(float(r["mean"]), 1))\n            for k, r in out.iterrows()]\n',
          },
          {
            title: 'Groups too small to compare',
            prompt: 'Write <code>thin_groups(df, least)</code> returning the names of the teams with fewer than <code>least</code> rows, best mean first. These are the bars a reader should be warned about.',
            starter: 'import pandas as pd\n\ndef thin_groups(df, least):\n    # Teams with fewer than `least` rows behind them.\n    return []\n\nprint(thin_groups(pd.DataFrame({"team": ["a", "a", "b"], "score": [1.0, 2.0, 9.0]}), 2))\n',
            call: `thin_groups(${pdf('{"team": ["a", "a", "b"], "score": [1.0, 2.0, 9.0]}')}, 2)`,
            expectValue: "['b']",
            hidden: [
              { name: 'a group on the threshold is not thin', call: `thin_groups(${pdf('{"team": ["a", "a"], "score": [1.0, 2.0]}')}, 2)`, expect: '[]' },
              { name: 'every group can be thin', call: `thin_groups(${pdf('{"team": ["a", "b"], "score": [1.0, 2.0]}')}, 5)`, expect: "['b', 'a']" },
              { name: 'the order is by mean, best first', call: `thin_groups(${pdf('{"team": ["low", "high"], "score": [1.0, 9.0]}')}, 2)`, expect: "['high', 'low']" },
              CALLS(['groupby'], 'one group-by behind the table'),
            ],
            hint: 'Group for count and mean, keep the rows whose count is below the threshold, sort what is left by mean descending, and return the index as a list.',
            correct: 'import pandas as pd\n\ndef thin_groups(df, least):\n    out = df.groupby("team")["score"].agg(["count", "mean"])\n    thin = out[out["count"] < least].sort_values("mean", ascending=False)\n    return [str(k) for k in thin.index]\n',
            wrong: 'import pandas as pd\n\ndef thin_groups(df, least):\n    out = df.groupby("team")["score"].agg(["count", "mean"])\n    thin = out[out["count"] <= least].sort_values("mean", ascending=False)\n    return [str(k) for k in thin.index]\n',
          },
        ],
        questions: [
          { id: 'd10-ast-1', prompt: 'What should the small table under a chart carry?',
            choices: ['Every row', 'The few numbers the chart cannot show exactly, and the group sizes', 'The raw file', 'The code'], answer: 1,
            explain: 'The chart shows the shape; the table pins the values and says how much is behind each one.' },
          { id: 'd10-ast-2', prompt: 'How should the rows be ordered?',
            choices: ['Alphabetically', 'By the value being compared', 'By group size', 'At random'], answer: 1,
            explain: 'And in the same order as the bars, so a reader moving between the two does not have to re-find each row.' },
          { id: 'd10-ast-3', prompt: 'Why name the columns "students" and "mean score" rather than "count" and "mean"?',
            choices: ['It is shorter', '"count" says how it was computed; "students" says what it means', 'pandas requires it', 'It changes the numbers'], answer: 1,
            explain: 'The reader did not write the group-by and should not have to infer it.' },
          { id: 'd10-ast-4', prompt: 'What does the count column protect the reader from?',
            choices: ['Nothing', 'Over-reading a bar built from two rows', 'Rounding errors', 'Missing values'], answer: 1,
            explain: 'A striking average over three rows looks identical on a chart to one over three thousand.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'writing-up-a-finding',
        title: 'Writing Up a Finding',
        summary: 'A number, what it is compared with, and what it does not prove.',
        objectives: [
          'Write a claim in three parts: the number, the comparison, and the limit.',
          'Report the sample size next to every difference between groups.',
          'Tell an observed correlation apart from a causal claim.',
          'Build the sentence from the data, so it cannot drift from the numbers.',
        ],
        why: 'The write-up is the only part of an analysis most people ever see. A correct table under an overstated sentence is still a wrong analysis, because the sentence is what gets repeated. Writing the claim from the data, with its size and its limits attached, is what makes the number something you can defend when somebody asks.',
        sections: [
          {
            heading: 'Three parts to a claim',
            intro: 'A finding that survives a reader has three parts. Leave out the second and it is trivia; leave out the third and it is overstated.',
            steps: [
              {
                heading: 'The number',
                prose: 'Start with the value, at a precision the data supports. "Team a averages 85.0" is a number; it is not yet a finding, because nothing says whether 85 is good.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 70.0]})\nmeans = df.groupby("team")["score"].mean()\nprint(means.round(1))',
              },
              {
                heading: 'The comparison',
                prose: 'A number means something next to another number: the other team, last term, the target. The gap is usually the thing the reader actually wants, so compute it rather than making them subtract.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 70.0]})\nmeans = df.groupby("team")["score"].mean()\ngap = means.max() - means.min()\nprint(f"{means.idxmax()} leads {means.idxmin()} by {gap:.1f} points")',
              },
              {
                heading: 'The limit',
                prose: 'Say how much data the claim rests on and what period it covers. This is not modesty; it is the information a reader needs to decide how far to trust it.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "a", "b"], "score": [90.0, 80.0, 70.0]})\nsizes = df["team"].value_counts()\nprint(f"based on {len(df)} scores: a has {sizes[\'a\']}, b has {sizes[\'b\']}")',
              },
            ],
          },
          {
            heading: 'Build the sentence from the data',
            intro: 'A sentence typed by hand is a second copy of the result, and second copies drift. The next time the data changes the table updates and the sentence does not.',
            steps: [
              {
                heading: 'An f-string over the computed values',
                prose: 'Every number in the sentence comes from a variable. If the data changes, the sentence changes with it, and nobody has to remember to edit the report.',
                code: 'import pandas as pd\n\ndef headline(df):\n    means = df.groupby("team")["score"].mean()\n    gap = float(means.max() - means.min())\n    return f"{means.idxmax()} scores {gap:.1f} above {means.idxmin()} (n={len(df)})"\n\nprint(headline(pd.DataFrame({"team": ["a", "b"], "score": [85.0, 70.0]})))',
              },
              {
                heading: 'Which n is the right n',
                prose: 'The number of rows and the number of groups are both counts, and they say very different things. "n=2" after a comparison of two teams reads as two data points. Report the rows the means were built from.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "b", "b", "b"], "score": [10.0, 4.0, 4.0, 4.0]})\nmeans = df.groupby("team")["score"].mean()\nprint("groups:", len(means))\nprint("rows:", len(df))',
              },
            ],
            note: 'When one group is far smaller than the other, say so in the sentence. "a leads b (a: 1 score, b: 300)" is honest; "a leads b (n=301)" hides the problem inside a big number.',
          },
          {
            heading: 'Moving together is not causing',
            intro: 'The most common overstatement in a write-up is turning "these two go up together" into "this one makes that one go up".',
            steps: [
              {
                heading: 'Measure the correlation',
                prose: '<code>Series.corr</code> gives a number between -1 and 1 for how closely two columns move together. Close to 1 means they rise together in this data. That is the whole of what it says.',
                code: 'import pandas as pd\n\nhours = pd.Series([1.0, 2.0, 3.0, 4.0])\nscore = pd.Series([60.0, 68.0, 81.0, 88.0])\nprint(round(float(hours.corr(score)), 2))',
              },
              {
                heading: 'Say what it does not show',
                prose: 'Students who study more may also sleep more, attend more, or already be stronger. The table cannot separate those. The honest sentence reports the association and names that it is one.',
                code: 'import pandas as pd\n\nhours = pd.Series([1.0, 2.0, 3.0, 4.0])\nscore = pd.Series([60.0, 68.0, 81.0, 88.0])\nr = float(hours.corr(score))\nprint(f"hours and score move together (r={r:.2f}); this data cannot say whether one causes the other")',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Add the comparison',
            prompt: 'The code prints the top team\'s mean on its own. Change the print so it also says which team it beats and by how many points.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["red", "red", "blue"], "score": [88.0, 92.0, 81.0]})\nmeans = df.groupby("team")["score"].mean()\n\nprint(f"{means.idxmax()} averages {means.max():.1f}")\n# Now say who it beats, and by how much.\n',
          },
          {
            after: 1,
            title: 'The right n',
            prompt: 'Print the sentence twice: once with the number of groups as n, once with the number of rows. Read both aloud and decide which one a reader would misunderstand.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({"team": ["a", "b", "b", "b", "b"], "score": [9.0, 5.0, 6.0, 5.0, 6.0]})\nmeans = df.groupby("team")["score"].mean()\ngap = float(means.max() - means.min())\n\nprint(f"a scores {gap:.1f} above b (n={len(means)})")\n# Print it again with the row count as n.\n',
          },
        ],
        use: {
          cards: [
            { title: 'Reporting a comparison', text: 'The number, what it is compared with, and how much data it rests on, built from the values.', code: 'f"{top} scores {gap:.1f} above {bottom} (n={len(df)})"' },
            { title: 'Describing an association', text: 'Say the columns move together, give r, and say what the data cannot show.' },
          ],
          avoid: 'Do not write “causes”, “drives” or “leads to” about a correlation, and do not type numbers into a sentence by hand. Both drift from what the data says.',
        },
        exercises: [
          {
            title: 'A finding with its n',
            prompt: 'Write <code>finding(df)</code> returning a sentence of the form <code>"a scores 15.0 above b (n=3)"</code>, comparing the highest and lowest team means and reporting how many rows the whole comparison rests on.',
            starter: 'import pandas as pd\n\ndef finding(df):\n    # "<top> scores <gap> above <bottom> (n=<rows>)"\n    return ""\n\nprint(finding(pd.DataFrame({"team": ["a", "b"], "score": [85.0, 70.0]})))\n',
            call: `finding(${pdf('{"team": ["a", "a", "b"], "score": [90.0, 80.0, 70.0]}')})`,
            expectValue: "'a scores 15.0 above b (n=3)'",
            hidden: [
              { name: 'the sample size is the row count, not the group count', call: `finding(${pdf('{"team": ["a", "b", "b", "b"], "score": [10.0, 4.0, 4.0, 4.0]}')})`, expect: "'a scores 6.0 above b (n=4)'" },
              { name: 'the gap is between the group means', call: `finding(${pdf('{"team": ["x", "y"], "score": [1.0, 3.0]}')})`, expect: "'y scores 2.0 above x (n=2)'" },
              { name: 'the sample size is counted', kind: 'ast', requires: { calls: ['len'] }, describe: 'the row count reported alongside the claim' },
            ],
            hint: 'Group to means, take idxmax and idxmin, subtract for the gap, and len(df) for n. Reporting n is what stops a difference between two rows reading like a result.',
            correct: 'import pandas as pd\n\ndef finding(df):\n    means = df.groupby("team")["score"].mean()\n    gap = round(float(means.max() - means.min()), 1)\n    return f"{means.idxmax()} scores {gap} above {means.idxmin()} (n={len(df)})"\n',
            wrong: 'import pandas as pd\n\ndef finding(df):\n    means = df.groupby("team")["score"].mean()\n    gap = round(float(means.max() - means.min()), 1)\n    return f"{means.idxmax()} scores {gap} above {means.idxmin()} (n={len(means)})"\n',
          },
          {
            title: 'An association, stated honestly',
            prompt: 'Write <code>association(df, x, y)</code> that returns <code>"x and y move together (r=0.99)"</code> when the correlation between the two columns is at least 0.5, <code>"x and y move in opposite directions (r=-0.99)"</code> when it is at most -0.5, and <code>"no clear link between x and y (r=0.10)"</code> otherwise. Use the column names given, and two decimal places for r.',
            starter: 'import pandas as pd\n\ndef association(df, x, y):\n    # Describe the correlation between columns x and y without claiming a cause.\n    return ""\n\nprint(association(pd.DataFrame({"hours": [1, 2, 3], "score": [60, 70, 80]}), "hours", "score"))\n',
            call: `association(${pdf('{"hours": [1.0, 2.0, 3.0, 4.0], "score": [60.0, 68.0, 81.0, 88.0]}')}, "hours", "score")`,
            expectValue: "'hours and score move together (r=0.99)'",
            hidden: [
              { name: 'a negative link is described as opposite', call: `association(${pdf('{"absences": [0.0, 2.0, 4.0, 6.0], "score": [90.0, 80.0, 72.0, 60.0]}')}, "absences", "score")`, expect: "'absences and score move in opposite directions (r=-1.00)'" },
              { name: 'a weak link is not a finding', call: `association(${pdf('{"a": [1.0, 2.0, 3.0, 4.0], "b": [2.0, 1.0, 2.0, 1.5]}')}, "a", "b")`, expect: "'no clear link between a and b (r=-0.13)'" },
              { name: 'exactly 0.5 counts as moving together', call: `association(${pdf('{"a": [1.0, 2.0, 3.0], "b": [1.0, 3.0, 2.0]}')}, "a", "b")`, expect: "'a and b move together (r=0.50)'" },
              CALLS(['corr'], 'the correlation computed by pandas'),
            ],
            hint: 'r = float(df[x].corr(df[y])). Compare with 0.5 and -0.5 using >= and <=, and format r with :.2f inside each sentence. None of the three sentences says "causes".',
            correct: 'import pandas as pd\n\ndef association(df, x, y):\n    r = float(df[x].corr(df[y]))\n    if r >= 0.5:\n        return f"{x} and {y} move together (r={r:.2f})"\n    if r <= -0.5:\n        return f"{x} and {y} move in opposite directions (r={r:.2f})"\n    return f"no clear link between {x} and {y} (r={r:.2f})"\n',
            wrong: 'import pandas as pd\n\ndef association(df, x, y):\n    r = float(df[x].corr(df[y]))\n    if r > 0.5:\n        return f"{x} and {y} move together (r={r:.2f})"\n    if r < -0.5:\n        return f"{x} and {y} move in opposite directions (r={r:.2f})"\n    return f"no clear link between {x} and {y} (r={r:.2f})"\n',
          },
        ],
        questions: [
          { id: 'd10-wuf-1', kind: 'multi',
            prompt: 'What does a finding need beyond the number itself?',
            choices: ['What it is being compared with', 'How much data it rests on', 'What it does not prove', 'The code that produced it'],
            answers: [0, 1, 2],
            explain: 'Comparison, sample size and limits. The code belongs in the repository, not in the sentence.' },
          { id: 'd10-wuf-2', prompt: 'Two columns correlate strongly. What have you shown?',
            choices: ['One causes the other', 'That they move together in this data', 'Nothing', 'That the data is wrong'],
            answer: 1,
            explain: 'Movement together is the observation. Cause is a separate claim needing evidence this table does not contain.' },
          { id: 'd10-wuf-3', prompt: 'Why report n alongside a difference between groups?',
            choices: ['Convention', 'A gap between two rows and a gap between two thousand are different claims', 'It fills space', 'For sorting'],
            answer: 1,
            explain: 'Sample size is how a reader decides how much to believe. Leaving it out lets a coincidence read as a result.' },
          { id: 'd10-wuf-4', prompt: 'Why build the sentence with an f-string over computed values instead of typing it?',
            choices: ['It runs faster', 'A typed sentence is a second copy of the result that does not update when the data does', 'f-strings round automatically', 'Reports must be code'],
            answer: 1,
            explain: 'The table and the sentence should have one source. Otherwise the next data refresh leaves a report that contradicts its own table.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'the-whole-analysis',
        title: 'The Whole Analysis',
        summary: 'Load, clean, join, summarise, report — in one function, from files.',
        objectives: [
          'Put the steps from this course in the order that keeps each one correct.',
          'Clean types and missing values before joining, not after.',
          'Check row counts between steps, so a silent loss shows up.',
          'Return a result a reader can use, from two raw files.',
        ],
        why: 'Every unit so far taught one step on its own, on data that arrived ready for it. Real work is the chain, and the chain fails at the joints: an id kept as "007" in one file meets "7" in another and matches nothing, a missing marker survives into a mean. Doing the whole thing once, with checks between the steps, is what turns the separate skills into an analysis.',
        sections: [
          {
            heading: 'The order matters',
            intro: 'The steps are the ones you already know. What is new is that each one depends on the one before it being right.',
            steps: [
              {
                heading: 'Read, then look',
                prose: 'Read each file and check its shape and dtypes before doing anything else. A score column that comes back as <code>object</code> is the first sign of a missing marker, and it is far cheaper to notice here than after a join.',
                code: 'import io\nimport pandas as pd\n\nscores = pd.read_csv(io.StringIO("id,score\\n1,90\\n2,n/a\\n3,70\\n"))\nprint(scores.shape)\nprint(scores.dtypes)',
              },
              {
                heading: 'Clean before you join',
                prose: 'Convert types and deal with missing values on each table while it is still small and on its own. After a merge the bad rows are mixed in with good ones from the other file, and it is much harder to say which table they came from.',
                code: 'import io\nimport pandas as pd\n\nscores = pd.read_csv(io.StringIO("id,score\\n1,90\\n2,n/a\\n3,70\\n"))\nscores["score"] = pd.to_numeric(scores["score"], errors="coerce")\nprint(scores.dtypes)\nprint(int(scores["score"].isna().sum()), "missing")',
              },
              {
                heading: 'Then join, then summarise',
                prose: 'Merge on the key, group, and take the summary. Rounding comes last, at the moment the number is shown, so no step downstream computes with a rounded value.',
                code: 'import io\nimport pandas as pd\n\npeople = pd.read_csv(io.StringIO("id,team\\n1,red\\n2,red\\n3,blue\\n"))\nscores = pd.read_csv(io.StringIO("id,score\\n1,90\\n2,80\\n3,70\\n"))\nout = pd.merge(people, scores, on="id")\nprint(out.groupby("team")["score"].mean().round(1))',
              },
            ],
          },
          {
            heading: 'Check between the steps',
            intro: 'Each step can lose rows without raising anything. A check is one line that prints what you expect to be true.',
            steps: [
              {
                heading: 'How much did cleaning drop?',
                prose: 'Count before and after. If a third of the rows vanished at the cleaning step, that belongs in the write-up, not in a surprise later.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"id": [1, 2, 3], "score": ["90", "n/a", "70"]})\ndf["score"] = pd.to_numeric(df["score"], errors="coerce")\nkept = df.dropna(subset=["score"])\nprint(len(df) - len(kept), "dropped of", len(df))',
              },
              {
                heading: 'Did the join keep what it should?',
                prose: 'An inner join drops every row whose key has no partner. Compare the row count after the merge with the table you expected it to match.',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2, 3], "team": ["red", "red", "blue"]})\nscores = pd.DataFrame({"id": [1, 2, 4], "score": [90.0, 80.0, 70.0]})\nout = pd.merge(people, scores, on="id")\nprint("people:", len(people), "joined:", len(out))',
              },
            ],
            note: 'The checks are not the analysis, and they do not need to stay in the final function as prints. What matters is that you ran them and know the answers, because "how many rows did that rest on" is the first question anyone asks.',
          },
          {
            heading: 'One function, two files',
            intro: 'Wrapping the chain in a function with the file paths as arguments makes it rerunnable, which is the point: next term\'s files should go through the same steps without anybody copying code.',
            steps: [
              {
                heading: 'Paths in, answer out',
                prose: 'The function reads, cleans, joins and summarises, and returns plain Python values. A caller does not need to know pandas was involved.',
                code: 'import pandas as pd\n\nopen("people.csv", "w").write("id,team\\n1,red\\n2,blue\\n")\nopen("scores.csv", "w").write("id,score\\n1,90\\n2,70\\n")\n\ndef best_team(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    means = pd.merge(people, scores, on="id").groupby("team")["score"].mean()\n    return str(means.idxmax())\n\nprint(best_team("people.csv", "scores.csv"))',
              },
              {
                heading: 'The same function on different data',
                prose: 'Run it again on a second pair of files. If the answer changes when the data does and nothing else had to change, the analysis is finished.',
                code: 'import pandas as pd\n\ndef best_team(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    means = pd.merge(people, scores, on="id").groupby("team")["score"].mean()\n    return str(means.idxmax())\n\nopen("people.csv", "w").write("id,team\\n1,red\\n2,blue\\n")\nopen("scores.csv", "w").write("id,score\\n1,40\\n2,95\\n")\nprint(best_team("people.csv", "scores.csv"))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Spot the missing marker',
            prompt: 'Run this and look at the dtype. Then add <code>na_values=["n/a"]</code> to <code>read_csv</code> and run it again. What changed, and why would the first version have broken a mean?',
            starter: 'import io\nimport pandas as pd\n\ntext = "id,score\\n1,90\\n2,n/a\\n3,70\\n"\nscores = pd.read_csv(io.StringIO(text))\nprint(scores.dtypes)\n',
          },
          {
            after: 1,
            title: 'Find the lost row',
            prompt: 'The join below loses a row. Print which <code>id</code> from <code>people</code> has no score, using <code>isin</code>.',
            starter: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2, 3], "team": ["red", "red", "blue"]})\nscores = pd.DataFrame({"id": [1, 3], "score": [90.0, 70.0]})\n\nout = pd.merge(people, scores, on="id")\nprint(len(people), "->", len(out))\n# Which ids in people are not in scores?\n',
          },
        ],
        use: {
          cards: [
            { title: 'A question that needs several files', text: 'Read, clean each table, join, summarise, report — in that order.', code: 'report("people.csv", "scores.csv")' },
            { title: 'Analyses you will rerun', text: 'A function over the file paths, with checks between the steps, handles next term’s data unchanged.' },
          ],
          avoid: 'Do not skip the checks between steps because the final number looks plausible. Rows lost at a join or a clean are exactly what makes a plausible number wrong.',
        },
        exercises: [
          {
            title: 'The best team, from two files',
            prompt: 'Two files are supplied. <code>people.csv</code> has <code>id</code> and <code>team</code>; <code>scores.csv</code> has <code>id</code> and <code>score</code>, where some scores are <code>n/a</code>. Write <code>report(people_path, scores_path)</code> returning <code>(team, mean)</code> for the highest-scoring team, ignoring rows with no score, with the mean to one decimal place.',
            starter: 'import pandas as pd\n\ndef report(people_path, scores_path):\n    # (best team, its mean score)\n    return None\n\nprint(report("people.csv", "scores.csv"))\n',
            files: {
              'people.csv': 'id,team\n1,red\n2,red\n3,blue\n4,blue\n',
              'scores.csv': 'id,score\n1,90\n2,80\n3,70\n4,n/a\n',
            },
            call: 'report("people.csv", "scores.csv")', expectValue: "('red', 85.0)",
            hidden: [
              { name: 'different files give a different winner',
                files: { 'people.csv': 'id,team\n1,alpha\n2,beta\n', 'scores.csv': 'id,score\n1,10\n2,90\n' },
                call: 'report("people.csv", "scores.csv")', expect: "('beta', 90.0)" },
              { name: 'a team whose only score is missing does not win on nothing',
                files: { 'people.csv': 'id,team\n1,ghost\n2,real\n', 'scores.csv': 'id,score\n1,n/a\n2,50\n' },
                call: 'report("people.csv", "scores.csv")', expect: "('real', 50.0)" },
              { name: 'the files are read and joined', kind: 'ast', requires: { calls: ['read_csv', 'merge', 'groupby'] }, describe: 'both files read, joined and grouped' },
            ],
            hint: 'Read both, convert the score with to_numeric(errors="coerce"), drop the missing rows, merge on id, group by team, take the mean, and pick the highest with idxmax.',
            correct: 'import pandas as pd\n\ndef report(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    scores["score"] = pd.to_numeric(scores["score"], errors="coerce")\n    scores = scores.dropna(subset=["score"])\n    out = pd.merge(people, scores, on="id")\n    means = out.groupby("team")["score"].mean()\n    return (str(means.idxmax()), round(float(means.max()), 1))\n',
            wrong: 'import pandas as pd\n\ndef report(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    out = pd.merge(people, scores, on="id")\n    means = out.groupby("team")["score"].count()\n    return (str(means.idxmax()), round(float(means.max()), 1))\n',
          },
          {
            title: 'The checks between the steps',
            prompt: 'Same two files. Write <code>audit(people_path, scores_path)</code> returning a dict with three counts: <code>"missing"</code>, the scores that were <code>n/a</code>; <code>"unmatched"</code>, the people whose <code>id</code> does not appear in <code>scores.csv</code> at all; and <code>"used"</code>, the rows left after dropping missing scores and joining.',
            starter: 'import pandas as pd\n\ndef audit(people_path, scores_path):\n    # {"missing": ..., "unmatched": ..., "used": ...}\n    return {}\n\nprint(audit("people.csv", "scores.csv"))\n',
            files: {
              'people.csv': 'id,team\n1,red\n2,red\n3,blue\n4,blue\n5,green\n',
              'scores.csv': 'id,score\n1,90\n2,80\n3,70\n4,n/a\n',
            },
            call: 'audit("people.csv", "scores.csv")', expectValue: "{'missing': 1, 'unmatched': 1, 'used': 3}",
            hidden: [
              { name: 'clean files lose nothing',
                files: { 'people.csv': 'id,team\n1,a\n2,b\n', 'scores.csv': 'id,score\n1,10\n2,20\n' },
                call: 'audit("people.csv", "scores.csv")', expect: "{'missing': 0, 'unmatched': 0, 'used': 2}" },
              { name: 'a missing score is not the same as an unmatched person',
                files: { 'people.csv': 'id,team\n1,a\n2,b\n3,c\n', 'scores.csv': 'id,score\n1,n/a\n2,n/a\n' },
                call: 'audit("people.csv", "scores.csv")', expect: "{'missing': 2, 'unmatched': 1, 'used': 0}" },
              { name: 'scores for people who are not listed are not used',
                files: { 'people.csv': 'id,team\n1,a\n', 'scores.csv': 'id,score\n1,5\n9,99\n' },
                call: 'audit("people.csv", "scores.csv")', expect: "{'missing': 0, 'unmatched': 0, 'used': 1}" },
              { name: 'the counts come from pandas', kind: 'ast', requires: { calls: ['read_csv', 'merge'] }, describe: 'both files read and joined' },
            ],
            hint: 'missing: to_numeric(errors="coerce") then isna().sum(). unmatched: ~people["id"].isin(scores["id"]), summed. used: len of the merge after dropna. Wrap each count in int() so the dict holds plain numbers.',
            correct: 'import pandas as pd\n\ndef audit(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    scores["score"] = pd.to_numeric(scores["score"], errors="coerce")\n    missing = int(scores["score"].isna().sum())\n    unmatched = int((~people["id"].isin(scores["id"])).sum())\n    used = len(pd.merge(people, scores.dropna(subset=["score"]), on="id"))\n    return {"missing": missing, "unmatched": unmatched, "used": used}\n',
            wrong: 'import pandas as pd\n\ndef audit(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    scores["score"] = pd.to_numeric(scores["score"], errors="coerce")\n    missing = int(scores["score"].isna().sum())\n    unmatched = int((~people["id"].isin(scores["id"])).sum())\n    used = len(pd.merge(people, scores, on="id"))\n    return {"missing": missing, "unmatched": unmatched, "used": used}\n',
          },
        ],
        questions: [
          { id: 'd10-twa-1', kind: 'order',
            prompt: 'Put a two-file analysis in order.',
            items: ['Join on the key', 'Read both files', 'Report the result', 'Group and summarise', 'Fix the types and the missing values'],
            answer: [1, 4, 0, 3, 2],
            explain: 'Clean before joining: ids written differently on each side match nothing, and a missing value dropped after grouping has already moved the mean.' },
          { id: 'd10-twa-2', prompt: 'Why clean each table before the merge rather than after?',
            choices: ['It is the same', 'Each table is small and on its own, so you can still tell which file a bad row came from', 'merge refuses dirty data', 'It changes the join type'],
            answer: 1,
            explain: 'After a merge the problem rows are mixed with the other file\'s columns, and ids written two ways may already have silently matched nothing.' },
          { id: 'd10-twa-3', prompt: 'What is the last thing to do before showing the number to somebody?',
            choices: ['Round it', 'Check the steps between: row counts and how much was dropped', 'Make a chart', 'Save the file'],
            answer: 1,
            explain: 'The checks are what let you answer "how do you know". A number without them is a number you are hoping about.' },
          { id: 'd10-twa-4', prompt: 'An inner join turns 5 people into 3 rows. What has happened?',
            choices: ['pandas has a bug', 'Two people have no matching key in the other table, and were dropped without an error', 'The join averaged them', 'Duplicates were removed'],
            answer: 1,
            explain: 'An inner join keeps only keys present in both tables. Counting before and after is how you notice.' },
        ],
      },
    ],
  },
};
