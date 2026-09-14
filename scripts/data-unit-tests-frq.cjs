/* Python for Data — one free-response problem per unit.
 *
 * Same contract as the Foundations FRQs: an `entry` function name, a starter,
 * and cases of {args, expect}. The grader calls entry(*args) and compares.
 *
 * Units 1 and 2 are standard library, so a signed-out visitor can sit them.
 * From unit 3 the problems use the unit's library, and `packages` tells the
 * page what to load before it runs anything -- the same field the lesson
 * checks use.
 */
module.exports = {
  1: [{
    id: 'u1d-f1',
    title: 'Average by group',
    prompt: 'Write a function named average_by_city that takes a list of dictionaries, each with a "city" key and a "score" key, and returns a dictionary mapping each city to the mean of its scores. A city with no rows does not appear. Return the dictionary, do not print it.',
    starter: 'def average_by_city(rows):\n    # your code here\n    pass\n',
    entry: 'average_by_city',
    cases: [
      { args: [[{ city: 'Leeds', score: 90 }, { city: 'Leeds', score: 70 }, { city: 'York', score: 80 }]],
        expect: { Leeds: 80.0, York: 80.0 } },
      { args: [[{ city: 'Hull', score: 50 }]], expect: { Hull: 50.0 } },
      { args: [[]], expect: {} },
      { args: [[{ city: 'A', score: 1 }, { city: 'B', score: 2 }, { city: 'A', score: 4 }]],
        expect: { A: 2.5, B: 2.0 } },
    ],
  }],
  2: [{
    id: 'u2d-f1',
    title: 'Clean a score column',
    prompt: 'Write a function named clean_scores that takes a list of strings and returns a list of floats, skipping any entry that is empty, whitespace only, or not a number. Negative numbers and decimals are valid. Return the list, do not print it.',
    starter: 'def clean_scores(values):\n    # your code here\n    pass\n',
    entry: 'clean_scores',
    cases: [
      { args: [['90', '', '  ', 'n/a', '72.5']], expect: [90.0, 72.5] },
      { args: [['-5', '3']], expect: [-5.0, 3.0] },
      { args: [[]], expect: [] },
      { args: [['abc']], expect: [] },
      { args: [[' 4 ']], expect: [4.0] },
    ],
  }],
  3: [{
    id: 'u3d-f1',
    title: 'Column means above a threshold',
    prompt: 'Write a function named tall_column_means that takes a list of equal-length lists of numbers and a threshold. Build a numpy array from the rows, take the mean of each column, and return a plain Python list of the means greater than the threshold, in column order. Collapse the rows, not the columns.',
    starter: 'import numpy as np\n\ndef tall_column_means(rows, threshold):\n    # your code here\n    pass\n',
    entry: 'tall_column_means',
    packages: ['numpy'],
    cases: [
      { args: [[[1, 10], [3, 20]], 2], expect: [15.0] },
      { args: [[[1, 2], [3, 4]], 0], expect: [2.0, 3.0] },
      { args: [[[1, 2], [3, 4]], 100], expect: [] },
      { args: [[[5]], 0], expect: [5.0] },
    ],
  }],
  4: [{
    id: 'u4d-f1',
    title: 'What each column is holding',
    prompt: 'Write a function named column_types that takes a list of dictionaries, builds a pandas DataFrame from it, and returns a dictionary mapping each column name to the name of its dtype as a string, for example "int64" or "object". Return the dictionary, do not print it.',
    starter: 'import pandas as pd\n\ndef column_types(records):\n    # your code here\n    pass\n',
    entry: 'column_types',
    packages: ['pandas'],
    cases: [
      { args: [[{ a: 1, b: 'x' }, { a: 2, b: 'y' }]], expect: { a: 'int64', b: 'object' } },
      { args: [[{ a: 1.5 }]], expect: { a: 'float64' } },
      { args: [[{ a: 1 }, {}]], expect: { a: 'float64' } },
    ],
  }],
  5: [{
    id: 'u5d-f1',
    title: 'Count what is missing',
    prompt: 'Write a function named missing_counts that takes a list of dictionaries, builds a pandas DataFrame, and returns a dictionary mapping each column name to the number of missing values in it, as plain integers. A key absent from a record counts as missing.',
    starter: 'import pandas as pd\n\ndef missing_counts(records):\n    # your code here\n    pass\n',
    entry: 'missing_counts',
    packages: ['pandas'],
    cases: [
      { args: [[{ a: 1, b: 2 }, { a: 3 }]], expect: { a: 0, b: 1 } },
      { args: [[{ a: 1 }, { a: 2 }]], expect: { a: 0 } },
      { args: [[{ a: 1 }, {}, {}]], expect: { a: 2 } },
    ],
  }],
  6: [{
    id: 'u6d-f1',
    title: 'Filter, then report the rate',
    prompt: 'Write a function named pass_rate that takes a list of dictionaries each with a "score" key and a pass mark, builds a pandas DataFrame, and returns the proportion of rows scoring greater than or equal to the mark, as a float between 0 and 1. An empty list returns 0.0.',
    starter: 'import pandas as pd\n\ndef pass_rate(records, mark):\n    # your code here\n    pass\n',
    entry: 'pass_rate',
    packages: ['pandas'],
    cases: [
      { args: [[{ score: 50 }, { score: 70 }, { score: 90 }], 70], expect: 0.6666666666666666 },
      { args: [[{ score: 70 }], 70], expect: 1.0 },
      { args: [[], 70], expect: 0.0 },
      { args: [[{ score: 10 }], 70], expect: 0.0 },
    ],
  }],
  7: [{
    id: 'u7d-f1',
    title: 'Summarise each group, with its size',
    prompt: 'Write a function named group_report that takes a list of dictionaries with "city" and "score" keys and returns a dictionary mapping each city to a two-element list of [row count, mean score]. Report the count beside the mean, so a group of two is not read as a group of two hundred.',
    starter: 'import pandas as pd\n\ndef group_report(records):\n    # your code here\n    pass\n',
    entry: 'group_report',
    packages: ['pandas'],
    cases: [
      { args: [[{ city: 'A', score: 10 }, { city: 'A', score: 20 }, { city: 'B', score: 30 }]],
        expect: { A: [2, 15.0], B: [1, 30.0] } },
      { args: [[{ city: 'X', score: 5 }]], expect: { X: [1, 5.0] } },
    ],
  }],
  8: [{
    id: 'u8d-f1',
    title: 'Did every row find a match?',
    prompt: 'Write a function named join_counts that takes two lists of dictionaries sharing an "id" key, builds a DataFrame from each, and returns a two-element list of [rows in an inner join, rows in a left join]. The pair is what tells you whether every left row matched.',
    starter: 'import pandas as pd\n\ndef join_counts(left, right):\n    # your code here\n    pass\n',
    entry: 'join_counts',
    packages: ['pandas'],
    cases: [
      { args: [[{ id: 1 }, { id: 2 }], [{ id: 1, v: 9 }]], expect: [1, 2] },
      { args: [[{ id: 1 }], [{ id: 1, v: 9 }]], expect: [1, 1] },
      { args: [[{ id: 1 }], [{ id: 1, v: 9 }, { id: 1, v: 8 }]], expect: [2, 2] },
    ],
  }],
  9: [{
    id: 'u9d-f1',
    title: 'Monthly totals',
    prompt: 'Write a function named monthly_totals that takes a list of two-element lists, each a date string and an amount, and returns a dictionary mapping each "YYYY-MM" string to the total for that month. Parse the dates rather than slicing the strings.',
    starter: 'import pandas as pd\n\ndef monthly_totals(pairs):\n    # your code here\n    pass\n',
    entry: 'monthly_totals',
    packages: ['pandas'],
    cases: [
      { args: [[['2024-01-05', 10], ['2024-01-20', 5], ['2024-02-01', 7]]],
        expect: { '2024-01': 15, '2024-02': 7 } },
      { args: [[['2023-12-31', 1]]], expect: { '2023-12': 1 } },
      { args: [[]], expect: {} },
    ],
  }],
  10: [{
    id: 'u10d-f1',
    title: 'A finding, rounded honestly',
    prompt: 'Write a function named finding that takes a list of dictionaries with "city" and "score" keys and returns a string of the form "<city> leads on <mean> across <n> rows", where city is the group with the highest mean, mean is that mean rounded to one decimal place, and n is that group\'s row count. Round at the end, not as you go.',
    starter: 'import pandas as pd\n\ndef finding(records):\n    # your code here\n    pass\n',
    entry: 'finding',
    packages: ['pandas'],
    cases: [
      { args: [[{ city: 'A', score: 90 }, { city: 'A', score: 80 }, { city: 'B', score: 70 }]],
        expect: 'A leads on 85.0 across 2 rows' },
      { args: [[{ city: 'Z', score: 1 }]], expect: 'Z leads on 1.0 across 1 rows' },
    ],
  }],
};
