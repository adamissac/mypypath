/* Python for Data, unit 9 — Time Series.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * Time is the dimension where a wrong answer looks most convincing, because a
 * chart of it always looks like something. The unit is built round three
 * failures that produce a plausible picture: dates left as text sort
 * alphabetically, a group-by skips periods with no data so a gap becomes a
 * straight line, and the first row of any change calculation has nothing before
 * it and must be reported rather than filled.
 */

const pd_ = (expr) => `__import__("pandas").${expr}`;
const pds = (literal) => pd_(`Series(${literal})`);
const pdf = (literal) => pd_(`DataFrame(${literal})`);
const dt = (literal) => pd_(`to_datetime(${literal})`);
const CALLS = (calls, describe) => ({
  name: 'the right tool does the work', kind: 'ast', requires: { calls }, describe,
});

module.exports = {
  unit9: {
    title: 'Time Series',
    blurb: 'Turn text into pandas dates, then track totals by week or month.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'parsing-dates',
        title: 'Parsing Dates',
        summary: 'A date read from a file is text until you say otherwise.',
        objectives: [
          'Convert a column of date text into real datetimes.',
          'Parse at load time rather than afterwards.',
          'Handle a value that will not parse.',
          'Say why day-first and month-first matter.',
        ],
        why: 'Text that looks like a date sorts alphabetically and compares alphabetically, so "02/2024" comes before "1/2023" and every ordering you build on it is wrong. Worse, an ambiguous format can be parsed the wrong way round and still succeed, giving you a year of data where every day up to the twelfth is a different date than you think.',
        sections: [
          {
            heading: 'to_datetime turns text into dates',
            intro: 'Until it does, sorting is alphabetical and "greater than" means something other than "later".',
            steps: [
              {
                heading: 'What text does to order',
                prose: 'Run this once. The text ordering is not an approximation of the date ordering; it is unrelated to it.',
                code: 'import pandas as pd\n\ntext = pd.Series(["10/01/2024", "02/01/2024", "1/03/2023"])\nprint(sorted(text.tolist()))\nprint(pd.to_datetime(text, dayfirst=True).sort_values().dt.strftime("%Y-%m-%d").tolist())',
              },
              {
                heading: 'The conversion',
                prose: 'Once converted, the column has a datetime dtype and every comparison means what you expect.',
                code: 'import pandas as pd\n\ndays = pd.to_datetime(pd.Series(["2024-03-01", "2024-01-15"]))\nprint(days.dtype)\nprint(days.min(), days.max())\nprint(days.max() - days.min())',
              },
            ],
          },
          {
            heading: 'Parsing on the way in',
            intro: '<code>parse_dates</code> on <code>read_csv</code> does it at load time, which is one fewer step to forget.',
            steps: [
              {
                heading: 'At load time',
                prose: 'Cheaper than converting afterwards, and it means the column is never text long enough for you to sort it by accident.',
                code: 'import pandas as pd\nfrom io import StringIO\n\ntext = "day,n\\n2024-01-05,1\\n2024-02-01,2\\n"\ndf = pd.read_csv(StringIO(text), parse_dates=["day"])\nprint(df.dtypes)',
              },
              {
                heading: 'When a value will not parse',
                prose: '<code>errors="coerce"</code> gives NaT — the datetime version of NaN — instead of raising. Counting them tells you how bad the column is before you decide what to do.',
                code: 'import pandas as pd\n\nmessy = pd.Series(["2024-01-05", "not a date", "2024-02-01"])\ndays = pd.to_datetime(messy, errors="coerce")\nprint(days.tolist())\nprint("unparseable:", int(days.isna().sum()))',
              },
              {
                heading: 'The ambiguity that does not raise',
                prose: '03/04/2024 is the third of April or the fourth of March, and both readings succeed. If the file is British, say so — otherwise every date whose day is 12 or under is silently wrong.',
                code: 'import pandas as pd\n\nvalue = pd.Series(["03/04/2024"])\nprint(pd.to_datetime(value, dayfirst=False).dt.strftime("%d %B %Y").iloc[0])\nprint(pd.to_datetime(value, dayfirst=True).dt.strftime("%d %B %Y").iloc[0])',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Text order against date order',
            prompt: 'Sort these as text and as dates, and compare the two answers.',
            starter: 'import pandas as pd\n\ntext = pd.Series(["10/01/2024", "02/01/2024", "1/03/2023"])\n\nprint(sorted(text.tolist()))\nprint(None)   # parsed, then sorted\n',
          },
          {
            after: 1,
            title: 'Count what will not parse',
            prompt: 'Coerce this column and report how many values failed, before deciding anything.',
            starter: 'import pandas as pd\n\nmessy = pd.Series(["2024-01-05", "n/a", "2024-02-01", ""])\n\ndays = pd.to_datetime(messy, errors="coerce")\nprint(int(days.isna().sum()))\n',
          },
        ],
        use: {
          cards: [
            { title: 'Any date column from a file', text: 'to_datetime turns text into real dates that sort, compare and subtract correctly.', code: 'df["date"] = pd.to_datetime(df["date"])' },
            { title: 'Known formats', text: 'Pass format= when you know it; it is faster and refuses dates that do not fit.' },
          ],
          avoid: 'Do not let an ambiguous date like 03/04/2024 be guessed. Say the format or dayfirst=True, or March and April swap silently.',
        },
        exercises: [
          {
            title: 'The earliest date',
            prompt: 'Write <code>earliest(dates)</code> that takes a Series of date strings and returns the earliest as a string in <code>YYYY-MM-DD</code> form.',
            starter: 'import pandas as pd\n\ndef earliest(dates):\n    # The earliest date, as YYYY-MM-DD.\n    return ""\n\nprint(earliest(pd.Series(["2024-03-01", "2024-01-15"])))\n',
            call: `earliest(${pds('["2024-03-01", "2024-01-15", "2024-02-20"]')})`,
            expectValue: "'2024-01-15'",
            hidden: [
              { name: 'a single date is its own earliest', call: `earliest(${pds('["2024-05-05"]')})`, expect: "'2024-05-05'" },
              { name: 'dates across a year boundary are ordered by time', call: `earliest(${pds('["2024-01-01", "2023-12-31"]')})`, expect: "'2023-12-31'" },
              CALLS(['to_datetime'], 'pd.to_datetime'),
            ],
            hint: 'Parse first, then take the minimum, then format it back. On ISO-formatted text the alphabetical answer happens to agree, which is exactly why the habit matters when the format changes.',
            correct: 'import pandas as pd\n\ndef earliest(dates):\n    return pd.to_datetime(dates).min().strftime("%Y-%m-%d")\n',
            wrong: 'import pandas as pd\n\ndef earliest(dates):\n    return sorted(dates.tolist())[0]\n',
          },
          {
            title: 'How many dates are usable',
            prompt: 'Write <code>usable_dates(values)</code> that takes a Series of date strings and returns a two-element list of [how many parsed, how many did not]. Report the bad ones rather than dropping them quietly.',
            starter: 'import pandas as pd\n\ndef usable_dates(values):\n    # [parsed, unparseable]\n    return [0, 0]\n\nprint(usable_dates(pd.Series(["2024-01-05", "n/a"])))\n',
            call: `usable_dates(${pds('["2024-01-05", "n/a", "2024-02-01"]')})`,
            expectValue: '[2, 1]',
            hidden: [
              { name: 'a clean column has nothing unusable', call: `usable_dates(${pds('["2024-01-01", "2024-01-02"]')})`, expect: '[2, 0]' },
              { name: 'a column of junk parses nothing', call: `usable_dates(${pds('["x", "y"]')})`, expect: '[0, 2]' },
              { name: 'the two always total the column length', call: `sum(usable_dates(${pds('["2024-01-01", "x", "y"]')})) == 3`, expect: 'True' },
              CALLS(['to_datetime'], 'pd.to_datetime with errors="coerce"'),
            ],
            hint: 'to_datetime with errors="coerce" turns the failures into NaT instead of raising. notna() counts the good ones and isna() the bad.',
            correct: 'import pandas as pd\n\ndef usable_dates(values):\n    days = pd.to_datetime(values, errors="coerce")\n    return [int(days.notna().sum()), int(days.isna().sum())]\n',
            wrong: 'import pandas as pd\n\ndef usable_dates(values):\n    days = pd.to_datetime(values, errors="coerce").dropna()\n    return [int(len(days)), 0]\n',
          },
        ],
        questions: [
          { id: 'd9-pd-1', prompt: 'A date column read from a CSV is what, until you convert it?',
            choices: ['A datetime', 'Text', 'An integer', 'The index'], answer: 1,
            explain: 'And text sorts alphabetically, so "02/2024" comes before "1/2023".' },
          { id: 'd9-pd-2', prompt: 'What does errors="coerce" do to an unparseable date?',
            choices: ['Raises', 'Makes it NaT', 'Leaves it as text', 'Drops the row'], answer: 1,
            explain: 'NaT is the datetime equivalent of NaN, and counting them tells you how bad the column is.' },
          { id: 'd9-pd-3', prompt: 'A British file writes 03/04/2024 for 3 April. What do you need?',
            choices: ['dayfirst=True', 'monthfirst=False', 'format="auto"', 'utc=True'], answer: 0,
            explain: 'Both readings succeed, so nothing warns you — every date whose day is 12 or under is silently wrong.' },
          { id: 'd9-pd-4', prompt: 'Which is cheaper than converting after the load?',
            choices: ['astype("datetime64")', 'parse_dates= on read_csv', 'sort_values first', 'There is no difference'], answer: 1,
            explain: 'And it means the column is never text long enough for you to sort it by accident.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'date-parts',
        title: 'Date Parts',
        summary: 'Year, month and weekday are columns you can group by.',
        objectives: [
          'Pull the year, month, day and weekday out of a datetime column.',
          'Group by a date part.',
          'Say why month alone is not enough across years.',
          'Name a period so that it sorts correctly.',
        ],
        why: '"Which month is busiest" and "how did each month go" are different questions, and the difference is whether the year is part of the key. Grouping by month alone silently pools every January together, which is sometimes exactly right and sometimes the reason a chart makes no sense.',
        sections: [
          {
            heading: 'Pulling a part out',
            intro: 'Once a column is really a date, its parts are one attribute away through the <code>.dt</code> accessor.',
            steps: [
              {
                heading: 'The parts',
                prose: 'Each is a whole column, computed for every row at once.',
                code: 'import pandas as pd\n\ndays = pd.to_datetime(pd.Series(["2024-01-05", "2024-06-18"]))\nprint(days.dt.year.tolist())\nprint(days.dt.month.tolist())\nprint(days.dt.day.tolist())\nprint(days.dt.day_name().tolist())',
              },
              {
                heading: 'A period that sorts',
                prose: '<code>to_period("M")</code> gives a year-and-month value that orders correctly, unlike the number 1 which is shared by every January you have.',
                code: 'import pandas as pd\n\ndays = pd.to_datetime(pd.Series(["2023-12-31", "2024-01-01"]))\nprint(days.dt.month.tolist())\nprint(days.dt.to_period("M").astype(str).tolist())',
              },
            ],
          },
          {
            heading: 'Grouping by a part',
            intro: '"How many per month" is a group-by on a derived column, which you already know how to do.',
            steps: [
              {
                heading: 'Group on the accessor directly',
                prose: 'No need to create the column first, though creating it is clearer when you want it in the output too.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-01"]),\n    "n": [1, 2, 5],\n})\nprint(df.groupby(df["day"].dt.month)["n"].sum())',
              },
              {
                heading: 'Month alone pools the years',
                prose: 'Two Januaries from different years land in the same bucket. Group on the period when the years are meant to stay apart.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2023-01-05", "2024-01-20"]),\n    "n": [1, 9],\n})\nprint(df.groupby(df["day"].dt.month)["n"].sum())\nprint(df.groupby(df["day"].dt.to_period("M"))["n"].sum())',
                note: 'Pooling is the right answer for "which month of the year is busiest" and the wrong one for "how has each month gone". The code looks almost identical, which is why it is worth stating which question you are asking.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Every part',
            prompt: 'Print the year, month, day and weekday name for these two dates.',
            starter: 'import pandas as pd\n\ndays = pd.to_datetime(pd.Series(["2024-01-05", "2024-06-18"]))\n\nprint(days.dt.year.tolist())\nprint(days.dt.month.tolist())\nprint(None)   # weekday names\n',
          },
          {
            after: 1,
            title: 'With and without the year',
            prompt: 'Group these by month and then by period, and satisfy yourself about which answers which question.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2023-01-05", "2024-01-20", "2024-02-01"]),\n    "n": [1, 9, 4],\n})\n\nprint(df.groupby(df["day"].dt.month)["n"].sum())\nprint(df.groupby(df["day"].dt.to_period("M"))["n"].sum())\n',
          },
        ],
        use: {
          cards: [
            { title: 'Grouping by calendar', text: 'dt.year, dt.month and dt.day_name give keys for “per month” and “per weekday” questions.', code: 'df.groupby(df["date"].dt.day_name())["sales"].sum()' },
            { title: 'Filtering to a period', text: 'Compare a part — all Mondays, all of 2024 — without building strings.' },
          ],
          avoid: 'Do not group by month number alone across several years. January 2023 and January 2024 end up in one group.',
        },
        exercises: [
          {
            title: 'Totals by month number',
            prompt: 'Write <code>by_month(df)</code> that takes a table with a datetime <code>day</code> column and a numeric <code>n</code>, and returns a dictionary of month number to the total of <code>n</code>.',
            starter: 'import pandas as pd\n\ndef by_month(df):\n    # {month number: total n}\n    return {}\n\nprint(by_month(pd.DataFrame({"day": pd.to_datetime(["2024-01-05"]), "n": [1]})))\n',
            call: `by_month(${pdf(`{"day": ${dt('["2024-01-05", "2024-01-20", "2024-02-01"]')}, "n": [1, 2, 5]}`)})`,
            expectValue: '{1: 3, 2: 5}',
            hidden: [
              { name: 'a single month gives a single entry', call: `by_month(${pdf(`{"day": ${dt('["2024-06-01"]')}, "n": [7]}`)})`, expect: '{6: 7}' },
              { name: 'the same month in different years still shares a bucket', call: `by_month(${pdf(`{"day": ${dt('["2023-03-01", "2024-03-01"]')}, "n": [1, 1]}`)})`, expect: '{3: 2}' },
            ],
            hint: 'Group by df["day"].dt.month and sum n. The second hidden case is a warning about that: month alone ignores the year, which is sometimes what you want and sometimes a bug.',
            correct: 'import pandas as pd\n\ndef by_month(df):\n    out = df.groupby(df["day"].dt.month)["n"].sum().to_dict()\n    return {int(k): int(v) for k, v in out.items()}\n',
            wrong: 'import pandas as pd\n\ndef by_month(df):\n    out = df.groupby(df["day"])["n"].sum().to_dict()\n    return {int(k.month): int(v) for k, v in out.items()}\n',
          },
          {
            title: 'Totals that keep the year',
            prompt: 'Write <code>by_period(df)</code> returning a dictionary of <code>"YYYY-MM"</code> to the total of <code>n</code> — the same summary, with the years kept apart.',
            starter: 'import pandas as pd\n\ndef by_period(df):\n    # {"YYYY-MM": total n}\n    return {}\n\nprint(by_period(pd.DataFrame({"day": pd.to_datetime(["2024-01-05"]), "n": [1]})))\n',
            call: `by_period(${pdf(`{"day": ${dt('["2023-01-05", "2024-01-20"]')}, "n": [1, 9]}`)})`,
            expectValue: "{'2023-01': 1, '2024-01': 9}",
            hidden: [
              { name: 'two months in one year stay separate', call: `by_period(${pdf(`{"day": ${dt('["2024-01-01", "2024-02-01"]')}, "n": [1, 2]}`)})`, expect: "{'2024-01': 1, '2024-02': 2}" },
              { name: 'rows in the same month are totalled', call: `by_period(${pdf(`{"day": ${dt('["2024-01-01", "2024-01-31"]')}, "n": [3, 4]}`)})`, expect: "{'2024-01': 7}" },
              { name: 'the keys are plain strings', call: `all(type(k).__name__ == "str" for k in by_period(${pdf(`{"day": ${dt('["2024-01-01"]')}, "n": [1]}`)}))`, expect: 'True' },
            ],
            hint: 'Group on df["day"].dt.to_period("M"), which orders correctly and keeps the year. str() each key on the way into the dictionary.',
            correct: 'import pandas as pd\n\ndef by_period(df):\n    out = df.groupby(df["day"].dt.to_period("M"))["n"].sum().to_dict()\n    return {str(k): int(v) for k, v in out.items()}\n',
            wrong: 'import pandas as pd\n\ndef by_period(df):\n    out = df.groupby(df["day"].dt.month)["n"].sum().to_dict()\n    return {str(k): int(v) for k, v in out.items()}\n',
          },
        ],
        questions: [
          { id: 'd9-dp-1', prompt: 'What does days.dt.year give you?',
            choices: ['One number', 'A column of years', 'The index', 'A string'], answer: 1,
            explain: 'The .dt accessor reaches the datetime parts of every value at once.' },
          { id: 'd9-dp-2', prompt: 'Grouping by .dt.month across two years does what?',
            choices: ['Keeps the years separate', 'Pools both Januaries into one bucket', 'Raises', 'Sorts by year'], answer: 1,
            explain: 'Right for "which month is busiest", wrong for "how has each month gone".' },
          { id: 'd9-dp-3', prompt: 'What keeps the year and still sorts correctly?',
            choices: ['.dt.month', '.dt.to_period("M")', '.dt.day_name()', '.dt.year alone'], answer: 1,
            explain: 'It gives a year-and-month value that orders properly, unlike the bare month number.' },
          { id: 'd9-dp-4', prompt: 'What does .dt.day_name() return?',
            choices: ['A number', 'The weekday as text', 'The date', 'The month'], answer: 1,
            explain: 'Useful for grouping, though remember text sorts alphabetically — Friday before Monday.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'a-datetime-index',
        title: 'A Datetime Index',
        summary: 'Putting time on the index unlocks slicing by period.',
        objectives: [
          'Move a date column onto the index.',
          'Select a period with a string.',
          'Say why the index must be sorted.',
          'Get the column back when you need it.',
        ],
        why: 'A DatetimeIndex is what makes the rest of this unit possible: partial-string selection, resampling and rolling windows all read the index. It is also the one place in pandas where an unsorted index gives you a wrong answer rather than an error.',
        sections: [
          {
            heading: 'set_index on a date column',
            intro: 'With time on the index, a string is enough to select a period.',
            steps: [
              {
                heading: 'Partial string selection',
                prose: 'The string names a period rather than an instant. <code>"2024"</code> is a year, <code>"2024-01"</code> is a month.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-01"]),\n    "n": [1, 2, 5],\n}).set_index("day")\n\nprint(df.loc["2024-01"])\nprint(df.loc["2024-01"]["n"].sum())',
              },
              {
                heading: 'A range between two dates',
                prose: 'A slice on a DatetimeIndex includes both ends, like every other <code>loc</code> slice.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-01"]),\n    "n": [1, 2, 5],\n}).set_index("day")\n\nprint(df.loc["2024-01-05":"2024-01-20"])',
              },
            ],
          },
          {
            heading: 'Order matters',
            intro: 'Slicing a time index expects it sorted. Sorting once after setting it is the habit worth keeping.',
            steps: [
              {
                heading: 'Sort it and forget about it',
                prose: 'A file is often already in date order, and often not. One call removes the question.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2024-02-01", "2024-01-05"]),\n    "n": [5, 1],\n}).set_index("day").sort_index()\n\nprint(df)\nprint(df.index.is_monotonic_increasing)',
              },
              {
                heading: 'And getting the column back',
                prose: '<code>reset_index()</code> is the way out, for when you want a plain table again — to write to a file, or to join.',
                code: 'import pandas as pd\n\ndf = pd.DataFrame({"day": pd.to_datetime(["2024-01-05"]), "n": [1]}).set_index("day")\nprint(list(df.reset_index().columns))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Select a month',
            prompt: 'Put the day on the index and print just January, then just its total.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-01"]),\n    "n": [1, 2, 5],\n}).set_index("day")\n\nprint(df.loc["2024-01"])\nprint(None)   # the January total\n',
          },
          {
            after: 1,
            title: 'Sort before slicing',
            prompt: 'Set the index on this out-of-order table, sort it, and confirm the index is now increasing.',
            starter: 'import pandas as pd\n\ndf = pd.DataFrame({\n    "day": pd.to_datetime(["2024-03-01", "2024-01-05", "2024-02-01"]),\n    "n": [3, 1, 2],\n}).set_index("day")\n\nprint(df.index.is_monotonic_increasing)\nprint(None)   # after sorting\n',
          },
        ],
        use: {
          cards: [
            { title: 'A series measured over time', text: 'With dates on the index, df.loc["2024-03"] selects a whole month.', code: 'df = df.set_index("date").sort_index()' },
            { title: 'Before resampling or rolling', text: 'Both need time on the index to know how far apart the rows are.' },
          ],
          avoid: 'Do not slice a date index that is not sorted. Partial-string selection on an unsorted index can raise or return the wrong rows.',
        },
        exercises: [
          {
            title: 'The total in a month',
            prompt: 'Write <code>month_total(df, month)</code> where <code>df</code> has a datetime <code>day</code> column and a numeric <code>n</code>, and <code>month</code> is a string like <code>"2024-01"</code>. Return the total of <code>n</code> in that month.',
            starter: 'import pandas as pd\n\ndef month_total(df, month):\n    # Total n within the given YYYY-MM.\n    return 0\n\nprint(month_total(pd.DataFrame({"day": pd.to_datetime(["2024-01-05"]), "n": [1]}), "2024-01"))\n',
            call: `month_total(${pdf(`{"day": ${dt('["2024-01-05", "2024-01-20", "2024-02-01"]')}, "n": [1, 2, 5]}`)}, "2024-01")`,
            expectValue: '3',
            hidden: [
              { name: 'a month with nothing in it totals zero', call: `month_total(${pdf(`{"day": ${dt('["2024-01-05"]')}, "n": [1]}`)}, "2024-09")`, expect: '0' },
              { name: 'the year is respected, not just the month', call: `month_total(${pdf(`{"day": ${dt('["2023-01-05", "2024-01-05"]')}, "n": [1, 9]}`)}, "2024-01")`, expect: '9' },
            ],
            hint: 'Set the day as the index and sort it, then select the month string. An empty selection sums to 0, which is the answer the first hidden case wants.',
            correct: 'import pandas as pd\n\ndef month_total(df, month):\n    s = df.set_index("day").sort_index()\n    picked = s[s.index.strftime("%Y-%m") == month]\n    return int(picked["n"].sum())\n',
            wrong: 'import pandas as pd\n\ndef month_total(df, month):\n    s = df.set_index("day").sort_index()\n    picked = s[s.index.strftime("%m") == month.split("-")[1]]\n    return int(picked["n"].sum())\n',
          },
          {
            title: 'The span the data covers',
            prompt: 'Write <code>date_span(df)</code> that puts the <code>day</code> column on a sorted index and returns a two-element list of [first date, last date] as <code>YYYY-MM-DD</code> strings. Reporting the span is part of describing any time series.',
            starter: 'import pandas as pd\n\ndef date_span(df):\n    # ["first", "last"] as YYYY-MM-DD\n    return []\n\nprint(date_span(pd.DataFrame({"day": pd.to_datetime(["2024-02-01", "2024-01-05"]), "n": [2, 1]})))\n',
            call: `date_span(${pdf(`{"day": ${dt('["2024-02-01", "2024-01-05"]')}, "n": [2, 1]}`)})`,
            expectValue: "['2024-01-05', '2024-02-01']",
            hidden: [
              { name: 'one row is both ends', call: `date_span(${pdf(`{"day": ${dt('["2024-05-05"]')}, "n": [1]}`)})`, expect: "['2024-05-05', '2024-05-05']" },
              { name: 'the file order does not decide the answer', call: `date_span(${pdf(`{"day": ${dt('["2024-12-31", "2024-01-01", "2024-06-01"]')}, "n": [1, 2, 3]}`)})`, expect: "['2024-01-01', '2024-12-31']" },
              { name: 'a year boundary is ordered by time', call: `date_span(${pdf(`{"day": ${dt('["2024-01-01", "2023-12-31"]')}, "n": [1, 2]}`)})`, expect: "['2023-12-31', '2024-01-01']" },
            ],
            hint: 'set_index("day").sort_index(), then the first and last index entries. strftime("%Y-%m-%d") turns each back into a plain string.',
            correct: 'import pandas as pd\n\ndef date_span(df):\n    s = df.set_index("day").sort_index()\n    return [s.index[0].strftime("%Y-%m-%d"), s.index[-1].strftime("%Y-%m-%d")]\n',
            wrong: 'import pandas as pd\n\ndef date_span(df):\n    s = df.set_index("day")\n    return [s.index[0].strftime("%Y-%m-%d"), s.index[-1].strftime("%Y-%m-%d")]\n',
          },
        ],
        questions: [
          { id: 'd9-dti-1', prompt: 'What does a DatetimeIndex unlock?',
            choices: ['Faster sorting', 'Selecting a period with a string, and resampling', 'Smaller memory', 'Automatic parsing'], answer: 1,
            explain: 'df.loc["2024-03"] is a whole month, and resample and rolling both read the index.' },
          { id: 'd9-dti-2', prompt: 'df.loc["2024"] on a DatetimeIndex returns what?',
            choices: ['One row', 'Every row in 2024', 'An error', 'The first row of 2024'], answer: 1,
            explain: 'Partial string indexing: the string names a period, not an instant.' },
          { id: 'd9-dti-3', prompt: 'Why sort after set_index?',
            choices: ['It looks tidier', 'Slicing a time index expects it sorted', 'It is required by pandas', 'To remove duplicates'], answer: 1,
            explain: 'This is the one place where an unsorted index gives a wrong answer rather than an error.' },
          { id: 'd9-dti-4', prompt: 'How do you get the date back as an ordinary column?',
            choices: ['set_index(None)', 'reset_index()', 'to_frame()', 'It cannot be done'], answer: 1,
            explain: 'Which is what you want before writing to a file or joining on the date.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'resampling',
        title: 'Resampling',
        summary: 'Group by time period without building the key yourself.',
        objectives: [
          'Bucket rows into time periods.',
          'Say why a period with no rows still appears.',
          'Pick the right frequency string.',
          'Explain why that matters for a chart.',
        ],
        why: 'A group-by on a month key omits months with no data. Plotted, that gap becomes a straight line between two points that were never adjacent, and the chart shows a trend that did not happen. resample produces every period in the range, so a quiet month is visible as a zero rather than invisible.',
        sections: [
          {
            heading: 'resample is group-by for time',
            intro: 'With a datetime index, <code>resample</code> buckets rows into periods — monthly, weekly, daily — and then you name the summary, exactly as with a group-by.',
            steps: [
              {
                heading: 'The call',
                prose: 'A frequency string and a summary. <code>"MS"</code> is month start, <code>"W"</code> weekly, <code>"D"</code> daily, <code>"YE"</code> year end.',
                code: 'import pandas as pd\n\nidx = pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-01"])\ns = pd.Series([1, 2, 5], index=idx)\nprint(s.resample("MS").sum())',
              },
              {
                heading: 'Any summary, not just sum',
                prose: 'Mean, max, count — whatever you would ask a group for.',
                code: 'import pandas as pd\n\nidx = pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-01"])\ns = pd.Series([1, 2, 5], index=idx)\nprint(s.resample("MS").agg(["sum", "mean", "size"]))',
              },
            ],
          },
          {
            heading: 'Empty periods appear',
            intro: 'Unlike a group-by, <code>resample</code> produces every period in the range, including the ones with no rows.',
            steps: [
              {
                heading: 'The quiet month',
                prose: 'January and March have data; February does not. resample reports it as 0; a group-by would leave it out entirely.',
                code: 'import pandas as pd\n\nidx = pd.to_datetime(["2024-01-01", "2024-03-01"])\ns = pd.Series([1, 1], index=idx)\n\nprint(s.resample("MS").sum())\nprint(s.groupby(s.index.month).sum())',
                note: 'Two points on a chart from the group-by, three from the resample. The two-point version draws a line straight through a month that had nothing in it.',
              },
              {
                heading: 'Zero is not always the honest fill',
                prose: 'For a count, an empty period really is zero. For a mean it is unknown, and <code>sum()</code> quietly turning it into 0 would claim a month averaged nothing.',
                code: 'import pandas as pd\n\nidx = pd.to_datetime(["2024-01-01", "2024-03-01"])\ns = pd.Series([10.0, 30.0], index=idx)\nprint(s.resample("MS").sum())    # February reads 0\nprint(s.resample("MS").mean())   # February reads NaN, which is true',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Monthly and weekly',
            prompt: 'Resample this series by month and then by week, and compare how many buckets each gives.',
            starter: 'import pandas as pd\n\nidx = pd.to_datetime(["2024-01-01", "2024-01-15", "2024-02-01"])\ns = pd.Series([1, 2, 5], index=idx)\n\nprint(s.resample("MS").sum())\nprint(None)   # weekly\n',
          },
          {
            after: 1,
            title: 'The missing month',
            prompt: 'Compare the resample with the group-by and count the buckets each produces.',
            starter: 'import pandas as pd\n\nidx = pd.to_datetime(["2024-01-01", "2024-03-01"])\ns = pd.Series([1, 1], index=idx)\n\nprint(len(s.resample("MS").sum()))\nprint(len(s.groupby(s.index.month).sum()))\n',
          },
        ],
        use: {
          cards: [
            { title: 'Totals per period', text: 'Daily rows to weekly or monthly totals without building a period column.', code: 'df["sales"].resample("MS").sum()' },
            { title: 'Finding gaps', text: 'resample includes periods with no rows, so size() shows where data is missing.' },
          ],
          avoid: 'Do not read a zero in a resampled sum as “nothing happened”. An empty period also sums to zero — check size() to tell them apart.',
        },
        exercises: [
          {
            title: 'Monthly totals, gaps included',
            prompt: 'Write <code>monthly_totals(s)</code> that takes a Series indexed by date and returns a list of monthly totals, including months with nothing in them.',
            starter: 'import pandas as pd\n\ndef monthly_totals(s):\n    # One total per month across the range.\n    return []\n\nidx = pd.to_datetime(["2024-01-01", "2024-03-01"])\nprint(monthly_totals(pd.Series([1, 1], index=idx)))\n',
            call: `monthly_totals(${pd_(`Series([1, 1], index=${dt('["2024-01-01", "2024-03-01"]')})`)})`,
            expectValue: '[1, 0, 1]',
            hidden: [
              { name: 'two rows in one month make one bucket', call: `monthly_totals(${pd_(`Series([1, 2], index=${dt('["2024-01-01", "2024-01-15"]')})`)})`, expect: '[3]' },
              { name: 'a single row is a single month', call: `monthly_totals(${pd_(`Series([7], index=${dt('["2024-05-05"]')})`)})`, expect: '[7]' },
              CALLS(['resample'], 'resample rather than a group-by on the month'),
            ],
            hint: 'resample("MS") buckets by month start. The quiet month in the middle is the whole point: a group-by would skip it and the timeline would lie.',
            correct: 'import pandas as pd\n\ndef monthly_totals(s):\n    return [int(x) for x in s.resample("MS").sum().tolist()]\n',
            wrong: 'import pandas as pd\n\ndef monthly_totals(s):\n    return [int(x) for x in s.groupby(s.index.month).sum().tolist()]\n',
          },
          {
            title: 'How many periods were empty',
            prompt: 'Write <code>quiet_months(s)</code> returning how many months in the range had no rows at all. Use a summary where an empty period is distinguishable from a period that summed to zero.',
            starter: 'import pandas as pd\n\ndef quiet_months(s):\n    # Months in the range with nothing recorded.\n    return 0\n\nidx = pd.to_datetime(["2024-01-01", "2024-03-01"])\nprint(quiet_months(pd.Series([1, 1], index=idx)))\n',
            call: `quiet_months(${pd_(`Series([1, 1], index=${dt('["2024-01-01", "2024-03-01"]')})`)})`,
            expectValue: '1',
            hidden: [
              { name: 'consecutive months leave no gaps', call: `quiet_months(${pd_(`Series([1, 1], index=${dt('["2024-01-01", "2024-02-01"]')})`)})`, expect: '0' },
              { name: 'a single row has no gaps either side', call: `quiet_months(${pd_(`Series([1], index=${dt('["2024-05-05"]')})`)})`, expect: '0' },
              { name: 'a month that sums to zero still had rows', call: `quiet_months(${pd_(`Series([5, -5, 2], index=${dt('["2024-01-01", "2024-01-15", "2024-02-01"]')})`)})`, expect: '0' },
              { name: 'a longer gap counts every empty month', call: `quiet_months(${pd_(`Series([1, 1], index=${dt('["2024-01-01", "2024-05-01"]')})`)})`, expect: '3' },
              CALLS(['resample'], 'resample, which produces the empty periods'),
            ],
            hint: 'resample("MS").size() gives the row count per period, and the empty ones are the zeros. Using sum() instead would confuse a quiet month with one whose values happened to cancel out.',
            correct: 'import pandas as pd\n\ndef quiet_months(s):\n    return int((s.resample("MS").size() == 0).sum())\n',
            wrong: 'import pandas as pd\n\ndef quiet_months(s):\n    return int((s.resample("MS").sum() == 0).sum())\n',
          },
        ],
        questions: [
          { id: 'd9-rs-1', prompt: 'What is resample, in terms of what you already know?',
            choices: ['A sort', 'A group-by where the key is a time period', 'A filter', 'A join'], answer: 1,
            explain: 'df.resample("MS").sum() is a monthly total without you building the month key.' },
          { id: 'd9-rs-2', prompt: 'What does resample need in place first?',
            choices: ['A sorted frame', 'A datetime index', 'No missing values', 'A group-by'], answer: 1,
            explain: 'It works off the index, which is why set_index is the step before.' },
          { id: 'd9-rs-3', prompt: 'How does resample differ from grouping on the month?',
            choices: ['It is faster', 'It produces every period in the range, including the empty ones', 'It sorts', 'It drops NaN'], answer: 1,
            explain: 'A group-by omits a quiet month, and a chart then draws a line straight through it.' },
          { id: 'd9-rs-4', prompt: 'An empty month under .mean() reads as what?',
            choices: ['0', 'NaN', 'The previous month', 'It is omitted'], answer: 1,
            explain: 'Which is the honest answer — unlike sum(), where 0 would claim the month averaged nothing.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'rolling-windows',
        title: 'Rolling Windows',
        summary: 'Smoothing a noisy series to see the shape underneath.',
        objectives: [
          'Take a moving average over a window.',
          'Say why the first values are missing.',
          'Choose a window length deliberately.',
          'State the smoothing when you report the result.',
        ],
        why: 'Daily numbers are noisy enough that the shape is invisible; a seven-day mean makes it legible. The trade is real, though: you are showing something that never happened, so the window length is a choice you have to declare rather than tune until the chart looks good.',
        sections: [
          {
            heading: 'A moving average',
            intro: '<code>rolling</code> takes a window and a summary. A seven-day mean of daily data is the standard way to make a weekly pattern stop drowning the trend.',
            steps: [
              {
                heading: 'The call',
                prose: 'Each output value is the summary of that row and the ones before it, within the window.',
                code: 'import pandas as pd\n\ns = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])\nprint(s.rolling(3).mean().tolist())',
              },
              {
                heading: 'Choosing the window',
                prose: 'A window of 7 on daily data removes the day-of-week pattern because every window contains one of each day. That is a reason, and reasons are what a window length should have.',
                code: 'import pandas as pd\n\ns = pd.Series([10.0, 2.0, 11.0, 3.0, 12.0, 4.0, 13.0, 5.0])\nprint([round(x, 1) for x in s.rolling(2).mean().dropna().tolist()])\nprint([round(x, 1) for x in s.rolling(4).mean().dropna().tolist()])',
                note: 'The wider the window, the smoother the line and the later it reacts to a real change. Smoothing is a trade between legibility and responsiveness, not a free improvement.',
              },
            ],
          },
          {
            heading: 'The first values have no window',
            intro: 'A window of three has nothing to average until the third value, so the first two are NaN. This is correct, and it is why a smoothed series is shorter than the one it came from.',
            steps: [
              {
                heading: 'The gap at the front',
                prose: 'Not an error — there genuinely is no three-day average on day one.',
                code: 'import pandas as pd\n\ns = pd.Series([1.0, 2.0, 3.0, 4.0])\nprint(s.rolling(3).mean().tolist())\nprint(s.rolling(3).mean().dropna().tolist())',
              },
              {
                heading: 'min_periods, and what it costs',
                prose: 'It fills the front by averaging over fewer points. That is defensible for a chart and dishonest in a table, because the early values are computed differently from the rest.',
                code: 'import pandas as pd\n\ns = pd.Series([1.0, 2.0, 3.0, 4.0])\nprint(s.rolling(3, min_periods=1).mean().tolist())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Two window lengths',
            prompt: 'Smooth this noisy series with a window of 2 and then 4, and see which one shows the trend.',
            starter: 'import pandas as pd\n\ns = pd.Series([10.0, 2.0, 11.0, 3.0, 12.0, 4.0, 13.0, 5.0])\n\nprint([round(x, 1) for x in s.rolling(2).mean().dropna().tolist()])\nprint(None)   # window of 4\n',
          },
          {
            after: 1,
            title: 'The gap at the front',
            prompt: 'Print the rolling mean with and without the leading gaps, and count how many were dropped.',
            starter: 'import pandas as pd\n\ns = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])\n\nrolled = s.rolling(3).mean()\nprint(rolled.tolist())\nprint(int(rolled.isna().sum()), "dropped")\n',
          },
        ],
        use: {
          cards: [
            { title: 'Smoothing a noisy series', text: 'A 7-day rolling mean shows the trend under daily ups and downs.', code: 'df["sales"].rolling(7).mean()' },
            { title: 'Recent-window checks', text: 'A rolling max or sum over the last n rows for alerts and running totals.' },
          ],
          avoid: 'Do not forget the first window-minus-one rows are NaN, and do not use a row-count window on data with gaps. Use a time window like "7D" instead.',
        },
        exercises: [
          {
            title: 'Smooth a series',
            prompt: 'Write <code>smoothed(s, window)</code> returning the rolling mean as a list, with the leading gaps dropped.',
            starter: 'import pandas as pd\n\ndef smoothed(s, window):\n    # Rolling mean, gaps at the start removed.\n    return []\n\nprint(smoothed(pd.Series([1.0, 2.0, 3.0]), 2))\n',
            call: `smoothed(${pds('[1.0, 2.0, 3.0]')}, 2)`,
            expectValue: '[1.5, 2.5]',
            hidden: [
              { name: 'a window of one changes nothing', call: `smoothed(${pds('[1.0, 2.0]')}, 1)`, expect: '[1.0, 2.0]' },
              { name: 'a window as long as the series gives one value', call: `smoothed(${pds('[1.0, 3.0]')}, 2)`, expect: '[2.0]' },
              CALLS(['rolling'], 'a rolling window'),
            ],
            hint: 's.rolling(window).mean() gives the smoothed series with gaps at the front; dropna() removes them and tolist() hands back plain floats.',
            correct: 'import pandas as pd\n\ndef smoothed(s, window):\n    return s.rolling(window).mean().dropna().tolist()\n',
            wrong: 'import pandas as pd\n\ndef smoothed(s, window):\n    return s.rolling(window).mean().fillna(0).tolist()\n',
          },
          {
            title: 'What the smoothing cost',
            prompt: 'Write <code>smoothing_cost(s, window)</code> returning a two-element list of [values in, values out after dropping the leading gaps]. The difference is how much of the start you gave up, and it is worth stating alongside a smoothed chart.',
            starter: 'import pandas as pd\n\ndef smoothing_cost(s, window):\n    # [original length, smoothed length]\n    return [0, 0]\n\nprint(smoothing_cost(pd.Series([1.0, 2.0, 3.0]), 2))\n',
            call: `smoothing_cost(${pds('[1.0, 2.0, 3.0]')}, 2)`,
            expectValue: '[3, 2]',
            hidden: [
              { name: 'a window of one loses nothing', call: `smoothing_cost(${pds('[1.0, 2.0, 3.0]')}, 1)`, expect: '[3, 3]' },
              { name: 'a wider window costs more', call: `smoothing_cost(${pds('[1.0, 2.0, 3.0, 4.0]')}, 3)`, expect: '[4, 2]' },
              { name: 'a window as long as the series leaves one value', call: `smoothing_cost(${pds('[1.0, 2.0]')}, 2)`, expect: '[2, 1]' },
              CALLS(['rolling'], 'a rolling window'),
            ],
            hint: 'len(s) for the first, then the length of s.rolling(window).mean().dropna() for the second. The gap is window - 1 whenever the series is long enough.',
            correct: 'import pandas as pd\n\ndef smoothing_cost(s, window):\n    out = s.rolling(window).mean().dropna()\n    return [len(s), len(out)]\n',
            wrong: 'import pandas as pd\n\ndef smoothing_cost(s, window):\n    out = s.rolling(window, min_periods=1).mean().dropna()\n    return [len(s), len(out)]\n',
          },
        ],
        questions: [
          { id: 'd9-rw-1', prompt: 'What is a rolling window for?',
            choices: ['Removing outliers', 'Smoothing a noisy series so the shape is visible', 'Filling gaps', 'Joining tables'], answer: 1,
            explain: 'It trades responsiveness for legibility, which is a choice you should state.' },
          { id: 'd9-rw-2', prompt: 'Why are the first values of s.rolling(7).mean() NaN?',
            choices: ['A bug', 'There is no seven-day window yet', 'The data is missing', 'It rounds'], answer: 1,
            explain: 'Correct rather than broken, and the reason a smoothed series is shorter than its source.' },
          { id: 'd9-rw-3', prompt: 'What does min_periods=1 do, and what does it cost?',
            choices: ['Nothing', 'Fills the front by averaging fewer points, so early values are computed differently', 'Widens the window', 'Drops the gaps'], answer: 1,
            explain: 'Defensible on a chart, dishonest in a table where the numbers are meant to be comparable.' },
          { id: 'd9-rw-4', prompt: 'What does a wider window trade away?',
            choices: ['Accuracy', 'Responsiveness — it reacts later to a real change', 'Memory', 'Nothing'], answer: 1,
            explain: 'Smoothing is a trade, not a free improvement, which is why the length needs a reason.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'change-over-time',
        title: 'Change Over Time',
        summary: 'Differences and growth rates, and the row that has neither.',
        objectives: [
          'Compare a row with the one before it.',
          'Compute a growth rate and read it correctly.',
          'Say what happens to the first row.',
          'Recognise when a percentage change is undefined.',
        ],
        why: 'Change is what most time-series questions are actually about, and both ways of measuring it have a row that cannot be answered — the first one, which has nothing before it. Filling that row with zero is the commonest quiet lie in a growth table.',
        sections: [
          {
            heading: 'shift compares a row with its neighbour',
            intro: '<code>diff</code> is the difference from the previous row and <code>pct_change</code> is that difference as a proportion. Both are built on <code>shift</code>, which simply moves the column down by one.',
            steps: [
              {
                heading: 'The three of them',
                prose: 'Seeing shift beside diff makes it obvious where the missing first row comes from.',
                code: 'import pandas as pd\n\ns = pd.Series([100.0, 120.0, 90.0])\nprint(s.shift().tolist())\nprint(s.diff().tolist())\nprint(s.pct_change().tolist())',
              },
              {
                heading: 'A proportion, not a percentage',
                prose: '<code>pct_change</code> returns 0.2 for a rise of a fifth. Multiply by 100 only when you format it for a reader, not while you are still calculating.',
                code: 'import pandas as pd\n\ns = pd.Series([100.0, 120.0])\nchange = s.pct_change()\nprint(change.tolist())\nprint([f"{x:.1%}" for x in change.dropna()])',
              },
            ],
          },
          {
            heading: 'A percentage needs a base',
            intro: 'Growth from zero is undefined, and pandas says so with an infinity rather than an error.',
            steps: [
              {
                heading: 'Division by zero',
                prose: '<code>inf</code> is not a number you can put in a report. It means "grew from nothing", which is a sentence, not a percentage.',
                code: 'import pandas as pd\n\ns = pd.Series([0.0, 5.0])\nprint(s.pct_change().tolist())',
              },
              {
                heading: 'The first row, and what to do with it',
                prose: 'It has no predecessor, so it has no change. Drop it or report it as unknown; filling it with 0 claims a flat first period that was never measured.',
                code: 'import pandas as pd\n\ns = pd.Series([100.0, 120.0, 90.0])\nchanges = s.diff()\nprint(changes.tolist())\nprint(changes.dropna().tolist())\nprint(changes.fillna(0).tolist(), "<- claims no change in period one")',
              },
              {
                heading: 'Counting the rises',
                prose: 'A useful summary that sidesteps the whole problem: a missing first difference is not greater than zero, so it excludes itself.',
                code: 'import pandas as pd\n\ns = pd.Series([1, 2, 1, 3])\nprint(s.diff().tolist())\nprint("rises:", int((s.diff() > 0).sum()))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Three views of the same change',
            prompt: 'Print the shift, the diff and the percentage change, and line up where each one is missing.',
            starter: 'import pandas as pd\n\ns = pd.Series([100.0, 120.0, 90.0])\n\nprint(s.shift().tolist())\nprint(s.diff().tolist())\nprint(None)   # pct_change\n',
          },
          {
            after: 1,
            title: 'The undefined row',
            prompt: 'Run this and look at both awkward values — the missing first one and the infinite second.',
            starter: 'import pandas as pd\n\ns = pd.Series([0.0, 5.0, 10.0])\n\nprint(s.pct_change().tolist())\nprint(s.pct_change().dropna().tolist())\n',
          },
        ],
        use: {
          cards: [
            { title: 'Step-by-step change', text: 'diff gives the change from one row to the next; pct_change the growth rate.', code: 'df["growth"] = df["sales"].pct_change()' },
            { title: 'Comparing with a year ago', text: 'shift(12) on monthly data lines each month up with the same month last year.' },
          ],
          avoid: 'Do not report a percentage change from zero or near zero. It is infinite or huge, and a sentence about the absolute change says more.',
        },
        exercises: [
          {
            title: 'Count the rises',
            prompt: 'Write <code>rises(s)</code> that returns how many times the value went up compared with the row before it.',
            starter: 'import pandas as pd\n\ndef rises(s):\n    # How many steps were increases?\n    return 0\n\nprint(rises(pd.Series([1, 2, 1, 3])))\n',
            call: `rises(${pds('[1, 2, 1, 3]')})`,
            expectValue: '2',
            hidden: [
              { name: 'a series that only falls has no rises', call: `rises(${pds('[3, 2, 1]')})`, expect: '0' },
              { name: 'a single value has no step to judge', call: `rises(${pds('[5]')})`, expect: '0' },
              { name: 'a flat step is not a rise', call: `rises(${pds('[1, 1]')})`, expect: '0' },
              CALLS(['diff'], 'diff or shift'),
            ],
            hint: 'diff() gives the change at each step, with the first one missing. Count how many of those are above zero — a missing value is not, so it takes care of itself.',
            correct: 'import pandas as pd\n\ndef rises(s):\n    return int((s.diff() > 0).sum())\n',
            wrong: 'import pandas as pd\n\ndef rises(s):\n    return int((s.diff() >= 0).sum())\n',
          },
          {
            title: 'Growth, honestly reported',
            prompt: 'Write <code>growth(s)</code> returning the percentage change at each step as a list rounded to one decimal place, with the undefined first step dropped rather than filled. The values are percentages, so 0.2 is reported as 20.0.',
            starter: 'import pandas as pd\n\ndef growth(s):\n    # Percentage change per step, first step omitted.\n    return []\n\nprint(growth(pd.Series([100.0, 120.0])))\n',
            call: `growth(${pds('[100.0, 120.0, 90.0]')})`,
            expectValue: '[20.0, -25.0]',
            hidden: [
              { name: 'the first step is dropped, not zeroed', call: `len(growth(${pds('[100.0, 110.0]')}))`, expect: '1' },
              { name: 'a single value has no growth at all', call: `growth(${pds('[100.0]')})`, expect: '[]' },
              { name: 'a flat series grows by nothing', call: `growth(${pds('[50.0, 50.0]')})`, expect: '[0.0]' },
              { name: 'a fall is reported as negative', call: `growth(${pds('[100.0, 50.0]')})`, expect: '[-50.0]' },
            ],
            hint: 'pct_change() gives proportions with the first row missing. Multiply by 100, round to one place, dropna() and tolist(). Filling the first row with 0 would claim a flat period nobody measured.',
            correct: 'import pandas as pd\n\ndef growth(s):\n    return (s.pct_change() * 100).round(1).dropna().tolist()\n',
            wrong: 'import pandas as pd\n\ndef growth(s):\n    return (s.pct_change() * 100).round(1).fillna(0).tolist()\n',
          },
        ],
        questions: [
          { id: 'd9-cot-1', prompt: 'What does .diff() give you?',
            choices: ['The percentage change', 'The difference from the previous row', 'The cumulative sum', 'The distance from the mean'], answer: 1,
            explain: 'And the first row has nothing before it, so it is NaN.' },
          { id: 'd9-cot-2', prompt: '.pct_change() returns 0.5. What does that mean?',
            choices: ['A rise of 0.5 units', 'A rise of 50 per cent', 'Half the total', 'A fall'], answer: 1,
            explain: 'It is a proportion, so multiply by 100 only when formatting for a reader.' },
          { id: 'd9-cot-3', prompt: 'Which row has neither a difference nor a growth rate?',
            choices: ['The last', 'The first', 'Every row has both', 'The middle'], answer: 1,
            explain: 'Nothing precedes it. Dropping it or reporting it as unknown are both honest; filling it with 0 is not.' },
          { id: 'd9-cot-4', prompt: 'pct_change from 0 to 5 gives what?',
            choices: ['5.0', 'inf', '0', 'An error'], answer: 1,
            explain: '"Grew from nothing" is a sentence, not a percentage, and inf is pandas saying exactly that.' },
        ],
      },
    ],
  },
};
