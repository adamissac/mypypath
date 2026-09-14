/* Python for Data, unit 8 — Combining Tables.
 *
 * Rich lesson schema; see scripts/data-course-unit-3.cjs for the shape.
 *
 * Joins are where silent wrongness is cheapest to produce. A duplicate key
 * multiplies rows and the total goes up; a type mismatch matches nothing and
 * the result is empty; neither raises. So every lesson here pairs the operation
 * with the check that catches its failure: compare the row count with what you
 * predicted, and compare the key columns before you join on them.
 */

const pdf = (literal) => `__import__("pandas").DataFrame(${literal})`;
const CALLS = (calls, describe) => ({
  name: 'pandas does the work', kind: 'ast', requires: { calls }, describe,
});

module.exports = {
  unit8: {
    title: 'Combining Tables',
    blurb: 'Stacking, joining and reshaping, with the checks that keep a join honest.',
    packages: ['pandas'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'concat-stacking-tables',
        title: 'Stacking Tables with concat',
        summary: 'Two tables of the same shape, one after the other.',
        objectives: [
          'Stack several tables into one.',
          'Say why <code>ignore_index=True</code> is usually wanted.',
          'Predict what happens when the columns do not line up.',
          'Keep track of which table a row came from.',
        ],
        why: 'Twelve monthly exports that should be one table is the commonest shape of real work. concat is straightforward; the two things worth knowing are that the index repeats unless you say otherwise, and that a column present in one file and absent from another fills with NaN rather than complaining.',
        sections: [
          {
            heading: 'Rows end to end',
            intro: '<code>concat</code> takes a list of tables and stacks them, lining the columns up by name.',
            steps: [
              {
                heading: 'The basic stack',
                prose: 'Order is the order of the list. The columns are matched by name, not by position.',
                code: 'import pandas as pd\n\njan = pd.DataFrame({"name": ["Ada"], "score": [90]})\nfeb = pd.DataFrame({"score": [80], "name": ["Bo"]})\nprint(pd.concat([jan, feb]))',
              },
              {
                heading: 'The index repeats',
                prose: 'Each table brought its own 0, 1, 2. <code>ignore_index=True</code> renumbers the result, which is what you want unless the index meant something.',
                code: 'import pandas as pd\n\na = pd.DataFrame({"v": [1]})\nb = pd.DataFrame({"v": [2]})\nprint(pd.concat([a, b]).index.tolist())\nprint(pd.concat([a, b], ignore_index=True).index.tolist())',
                note: 'A repeated index is not an error, but <code>.loc[0]</code> then returns two rows, and that surprise usually surfaces a long way from here.',
              },
              {
                heading: 'Remembering where a row came from',
                prose: 'Add the column before stacking. Once the tables are one table there is no way to tell.',
                code: 'import pandas as pd\n\njan = pd.DataFrame({"score": [90]}).assign(month="jan")\nfeb = pd.DataFrame({"score": [80]}).assign(month="feb")\nprint(pd.concat([jan, feb], ignore_index=True))',
              },
            ],
          },
          {
            heading: 'Columns that do not line up',
            intro: 'A column one table has and another does not is filled with NaN rather than dropped, and nothing warns you.',
            steps: [
              {
                heading: 'The union of the columns',
                prose: 'This is usually what you want and occasionally a sign that one export had a column renamed. Comparing the column sets first is the cheap check.',
                code: 'import pandas as pd\n\na = pd.DataFrame({"name": ["Ada"], "score": [90]})\nb = pd.DataFrame({"name": ["Bo"], "grade": ["B"]})\nprint(pd.concat([a, b], ignore_index=True))\nprint(set(a.columns) ^ set(b.columns))',
              },
              {
                heading: 'The row count is predictable, so predict it',
                prose: 'Stacking is the one combine whose result size you know in advance. Checking it costs one line and catches a file that failed to load.',
                code: 'import pandas as pd\n\ntables = [pd.DataFrame({"v": [1, 2]}), pd.DataFrame({"v": [3]})]\nexpected = sum(len(t) for t in tables)\nout = pd.concat(tables, ignore_index=True)\nprint(len(out) == expected, len(out))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Stack and renumber',
            prompt: 'Stack these two tables, once as-is and once with a fresh index, and print both index lists.',
            starter: 'import pandas as pd\n\na = pd.DataFrame({"v": [1, 2]})\nb = pd.DataFrame({"v": [3]})\n\nprint(pd.concat([a, b]).index.tolist())\nprint(None)   # renumbered\n',
          },
          {
            after: 1,
            title: 'Mismatched columns',
            prompt: 'Stack these two and print the result, then print which columns only one of them had.',
            starter: 'import pandas as pd\n\na = pd.DataFrame({"name": ["Ada"], "score": [90]})\nb = pd.DataFrame({"name": ["Bo"], "grade": ["B"]})\n\nprint(pd.concat([a, b], ignore_index=True))\nprint(None)   # columns present in only one\n',
          },
        ],
        exercises: [
          {
            title: 'Stack a list of tables',
            prompt: 'Write <code>stack(tables)</code> that stacks a list of tables into one with a fresh index, and returns the number of rows.',
            starter: 'import pandas as pd\n\ndef stack(tables):\n    # One table from many, renumbered. Return the row count.\n    return 0\n\nprint(stack([pd.DataFrame({"a": [1]}), pd.DataFrame({"a": [2]})]))\n',
            call: `stack([${pdf('{"a": [1, 2]}')}, ${pdf('{"a": [3]}')}])`,
            expectValue: '3',
            hidden: [
              { name: 'one table stacks to itself', call: `stack([${pdf('{"a": [1]}')}])`, expect: '1' },
              { name: 'the index is renumbered rather than repeated',
                call: `(lambda t: __import__("pandas").concat(t, ignore_index=True).index.tolist())([${pdf('{"a": [1]}')}, ${pdf('{"a": [2]}')}])`,
                expect: '[0, 1]' },
              CALLS(['concat'], 'pd.concat'),
            ],
            hint: 'pd.concat takes the list. ignore_index=True is what stops two rows both being numbered 0.',
            correct: 'import pandas as pd\n\ndef stack(tables):\n    return len(pd.concat(tables, ignore_index=True))\n',
            wrong: 'import pandas as pd\n\ndef stack(tables):\n    return len(tables)\n',
          },
          {
            title: 'Label each row with its source',
            prompt: 'Write <code>stack_labelled(tables, labels)</code> that stacks the tables, adding a <code>source</code> column holding the matching label for every row from that table, and returns the <code>source</code> column as a list.',
            starter: 'import pandas as pd\n\ndef stack_labelled(tables, labels):\n    # Stack them, tagging each row with where it came from.\n    return []\n\nprint(stack_labelled([pd.DataFrame({"v": [1, 2]}), pd.DataFrame({"v": [3]})], ["jan", "feb"]))\n',
            call: `stack_labelled([${pdf('{"v": [1, 2]}')}, ${pdf('{"v": [3]}')}], ["jan", "feb"])`,
            expectValue: "['jan', 'jan', 'feb']",
            hidden: [
              { name: 'a one-row table gets one label', call: `stack_labelled([${pdf('{"v": [1]}')}], ["only"])`, expect: "['only']" },
              { name: 'an empty table contributes no rows', call: `stack_labelled([${pdf('{"v": []}')}, ${pdf('{"v": [1]}')}], ["a", "b"])`, expect: "['b']" },
              { name: 'three tables keep their own labels',
                call: `stack_labelled([${pdf('{"v": [1]}')}, ${pdf('{"v": [2]}')}, ${pdf('{"v": [3]}')}], ["a", "b", "c"])`,
                expect: "['a', 'b', 'c']" },
              CALLS(['concat'], 'pd.concat'),
            ],
            hint: 'Tag each table before stacking — assign(source=label) on a copy of each — then concat. Once they are one table there is no way to tell them apart.',
            correct: 'import pandas as pd\n\ndef stack_labelled(tables, labels):\n    tagged = [t.assign(source=l) for t, l in zip(tables, labels)]\n    return pd.concat(tagged, ignore_index=True)["source"].tolist()\n',
            wrong: 'import pandas as pd\n\ndef stack_labelled(tables, labels):\n    out = pd.concat(tables, ignore_index=True)\n    out["source"] = labels[0]\n    return out["source"].tolist()\n',
          },
        ],
        questions: [
          { id: 'd8-cst-1', prompt: 'What does pd.concat([a, b]) do by default?',
            choices: ['Joins on a key', 'Stacks the rows', 'Adds the columns', 'Raises on different indexes'], answer: 1,
            explain: 'axis=0 is the default, and columns are lined up by name rather than by position.' },
          { id: 'd8-cst-2', prompt: 'Why pass ignore_index=True?',
            choices: ['For speed', 'Otherwise both tables keep their own 0, 1, 2', 'To drop duplicates', 'To sort'], answer: 1,
            explain: 'A repeated index is legal, and then .loc[0] returns two rows somewhere a long way from here.' },
          { id: 'd8-cst-3', prompt: 'One table has a column the other does not. What happens?',
            choices: ['It is dropped', 'It is kept, with NaN for the rows that lacked it', 'It raises', 'Only the first table’s columns survive'], answer: 1,
            explain: 'The union of the columns, filled in. Comparing the column sets first is the cheap check.' },
          { id: 'd8-cst-4', prompt: 'How do you know which table a row came from after stacking?',
            choices: ['The index', 'You cannot, unless you added a column before stacking', 'concat adds one', 'The dtype'], answer: 1,
            explain: 'Tag each table first. Once they are one table the information is gone.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'merging-on-a-key',
        title: 'Merging on a Key',
        summary: 'Bringing two tables together on the column they share.',
        objectives: [
          'Join two tables on a shared column.',
          'Choose between inner, left, right and outer.',
          'Say what happens to a row that matches nothing.',
          'Check the row count against what you expected.',
        ],
        why: 'A join is how two files become one answer, and the choice of <code>how</code> is a decision about whose rows matter. Getting it wrong does not raise — it silently drops the people you were asked about, and the summary that follows is computed over the wrong population.',
        sections: [
          {
            heading: 'An inner join keeps the matches',
            intro: 'The default keeps only the rows whose key appears in both tables.',
            steps: [
              {
                heading: 'Joining on a shared column',
                prose: 'The key column appears once in the result; the other columns come from both sides.',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2], "name": ["Ada", "Bo"]})\nscores = pd.DataFrame({"id": [1], "score": [92]})\nprint(pd.merge(people, scores, on="id"))',
              },
              {
                heading: 'What an inner join costs you',
                prose: 'Bo is gone. If the question was "what did each person score", an inner join has quietly answered a different one: "what did each person who has a score score".',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2], "name": ["Ada", "Bo"]})\nscores = pd.DataFrame({"id": [1], "score": [92]})\ninner = pd.merge(people, scores, on="id")\nprint(len(people), "people ->", len(inner), "rows")',
              },
            ],
          },
          {
            heading: 'how= decides what happens to the rest',
            intro: 'Four choices, and the right one depends on whose rows the question is about.',
            steps: [
              {
                heading: 'left keeps everyone on the left',
                prose: 'Rows with no match get NaN in the columns that came from the right. This is the one you want when the left table is the population you were asked about.',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2], "name": ["Ada", "Bo"]})\nscores = pd.DataFrame({"id": [1], "score": [92]})\nprint(pd.merge(people, scores, on="id", how="left"))',
              },
              {
                heading: 'And the other two',
                prose: '<code>right</code> is the mirror image; <code>outer</code> keeps everything from both sides and fills the gaps on each.',
                code: 'import pandas as pd\n\na = pd.DataFrame({"id": [1, 2], "x": ["a", "b"]})\nb = pd.DataFrame({"id": [2, 3], "y": ["c", "d"]})\nprint(pd.merge(a, b, on="id", how="outer"))',
              },
              {
                heading: 'Counting what did not match',
                prose: 'After a left join, the rows with NaN in a right-hand column are exactly the ones that found no partner. That number is usually worth reporting, not just fixing.',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2, 3], "name": ["a", "b", "c"]})\nscores = pd.DataFrame({"id": [1], "score": [92]})\nout = pd.merge(people, scores, on="id", how="left")\nprint(int(out["score"].isna().sum()), "of", len(people), "had no score")',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Inner against left',
            prompt: 'Join these two both ways and print the row count each gives.',
            starter: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2, 3], "name": ["a", "b", "c"]})\nscores = pd.DataFrame({"id": [1, 2], "score": [90, 80]})\n\nprint(len(pd.merge(people, scores, on="id")))\nprint(None)   # the left join\n',
          },
          {
            after: 1,
            title: 'Who is missing',
            prompt: 'Left join, then print the names of the people who had no score.',
            starter: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2, 3], "name": ["a", "b", "c"]})\nscores = pd.DataFrame({"id": [1], "score": [90]})\n\nout = pd.merge(people, scores, on="id", how="left")\nprint(out[out["score"].isna()]["name"].tolist())\n',
          },
        ],
        exercises: [
          {
            title: 'Keep everyone, count the gaps',
            prompt: 'Write <code>with_scores(people, scores)</code> that joins on <code>id</code>, keeping every person even when they have no score, and returns the number of people with no score.',
            starter: 'import pandas as pd\n\ndef with_scores(people, scores):\n    # Keep everyone. Return how many have no score.\n    return 0\n\nprint(with_scores(pd.DataFrame({"id": [1, 2], "name": ["Ada", "Bo"]}),\n                  pd.DataFrame({"id": [1], "score": [92]})))\n',
            call: `with_scores(${pdf('{"id": [1, 2, 3], "name": ["a", "b", "c"]}')}, ${pdf('{"id": [1], "score": [92]}')})`,
            expectValue: '2',
            hidden: [
              { name: 'everyone matched leaves nobody missing', call: `with_scores(${pdf('{"id": [1], "name": ["a"]}')}, ${pdf('{"id": [1], "score": [1]}')})`, expect: '0' },
              { name: 'nobody matched leaves everyone missing', call: `with_scores(${pdf('{"id": [1, 2], "name": ["a", "b"]}')}, ${pdf('{"id": [9], "score": [1]}')})`, expect: '2' },
              CALLS(['merge'], 'a merge with how="left"'),
            ],
            hint: 'how="left" keeps every person. The people who matched nothing have a missing score, and isna().sum() counts them.',
            correct: 'import pandas as pd\n\ndef with_scores(people, scores):\n    out = pd.merge(people, scores, on="id", how="left")\n    return int(out["score"].isna().sum())\n',
            wrong: 'import pandas as pd\n\ndef with_scores(people, scores):\n    out = pd.merge(people, scores, on="id")\n    return int(out["score"].isna().sum())\n',
          },
          {
            title: 'Inner against left, as a pair',
            prompt: 'Write <code>join_counts(left, right)</code> returning a two-element list of [rows in an inner join on <code>id</code>, rows in a left join]. The pair is what tells you whether every left row found a partner.',
            starter: 'import pandas as pd\n\ndef join_counts(left, right):\n    # [inner rows, left rows]\n    return [0, 0]\n\nprint(join_counts(pd.DataFrame({"id": [1, 2]}), pd.DataFrame({"id": [1], "v": [9]})))\n',
            call: `join_counts(${pdf('{"id": [1, 2]}')}, ${pdf('{"id": [1], "v": [9]}')})`,
            expectValue: '[1, 2]',
            hidden: [
              { name: 'a complete match makes the two equal', call: `join_counts(${pdf('{"id": [1]}')}, ${pdf('{"id": [1], "v": [9]}')})`, expect: '[1, 1]' },
              { name: 'a duplicate on the right multiplies both', call: `join_counts(${pdf('{"id": [1]}')}, ${pdf('{"id": [1, 1], "v": [9, 8]}')})`, expect: '[2, 2]' },
              { name: 'no matches at all', call: `join_counts(${pdf('{"id": [1]}')}, ${pdf('{"id": [2], "v": [9]}')})`, expect: '[0, 1]' },
              CALLS(['merge'], 'two merges'),
            ],
            hint: 'Two merges, one with the default how and one with how="left", and len() on each. When the two numbers differ, the difference is how many left rows matched nothing.',
            correct: 'import pandas as pd\n\ndef join_counts(left, right):\n    inner = pd.merge(left, right, on="id")\n    outer = pd.merge(left, right, on="id", how="left")\n    return [len(inner), len(outer)]\n',
            wrong: 'import pandas as pd\n\ndef join_counts(left, right):\n    inner = pd.merge(left, right, on="id")\n    return [len(inner), len(inner)]\n',
          },
        ],
        questions: [
          { id: 'd8-mok-1', prompt: 'What does an inner join keep?',
            choices: ['Every row of the left', 'Only rows whose key is in both tables', 'Everything from both', 'The first match only'], answer: 1,
            explain: 'Which quietly changes the question from "each person" to "each person who also appears in the other file".' },
          { id: 'd8-mok-2', prompt: 'Which join keeps every row of the left table?',
            choices: ['inner', 'left', 'right', 'outer'], answer: 1,
            explain: 'Rows with no partner get NaN in the columns that came from the right.' },
          { id: 'd8-mok-3', prompt: 'After a left join, what identifies the rows that matched nothing?',
            choices: ['They are dropped', 'NaN in a column that came from the right', 'A flag column', 'Nothing'], answer: 1,
            explain: 'isna().sum() on one of those columns counts them, and that number is usually worth reporting.' },
          { id: 'd8-mok-4', prompt: 'An inner join returns fewer rows than the left table. What does that mean?',
            choices: ['A bug in pandas', 'Some keys did not match', 'The tables were sorted', 'Duplicates were removed'], answer: 1,
            explain: 'Worth checking rather than accepting — the cause is often a type mismatch rather than genuinely absent data.' },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'when-a-merge-goes-wrong',
        title: 'When a Merge Goes Wrong',
        summary: 'Duplicate keys multiply rows, and mismatched types match nothing.',
        objectives: [
          'Predict the row count of a join before running it.',
          'Explain why a duplicate key multiplies rows.',
          'Spot a type mismatch that makes a join match nothing.',
          'Have pandas check your assumption with <code>validate</code>.',
        ],
        why: 'These are the two failures that produce a wrong number rather than an error. A duplicated key inflates a total silently; a type mismatch empties the result silently. Both are cheap to check for and expensive to discover later, which is the whole argument of this lesson.',
        sections: [
          {
            heading: 'A key that repeats multiplies',
            intro: 'Every matching row on the left pairs with every matching row on the right. Two and two make four, not two.',
            steps: [
              {
                heading: 'The multiplication',
                prose: 'One person, two score rows, two output rows. Sum the scores now and the person counts twice.',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1], "name": ["Ada"]})\nscores = pd.DataFrame({"id": [1, 1], "score": [90, 80]})\nout = pd.merge(people, scores, on="id")\nprint(out)\nprint(len(people), "x duplicated key ->", len(out), "rows")',
              },
              {
                heading: 'Check the key before you join',
                prose: 'One line, and it answers the question the row count would otherwise raise afterwards.',
                code: 'import pandas as pd\n\nscores = pd.DataFrame({"id": [1, 1, 2], "score": [90, 80, 70]})\nprint("duplicated keys:", int(scores["id"].duplicated().sum()))\nprint(scores["id"].value_counts())',
              },
              {
                heading: 'Let pandas hold you to it',
                prose: '<code>validate</code> states the relationship you believe you have, and raises when the data disagrees — instead of silently multiplying.',
                code: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1], "name": ["Ada"]})\nscores = pd.DataFrame({"id": [1, 1], "score": [90, 80]})\ntry:\n    pd.merge(people, scores, on="id", validate="one_to_one")\nexcept Exception as exc:\n    print(type(exc).__name__ + ":", exc)',
                note: '"one_to_one", "one_to_many" and "many_to_one" are the useful three. Writing down which one you expect is also documentation for the next reader.',
              },
            ],
          },
          {
            heading: 'Types have to match too',
            intro: 'An id read as a number in one file and as text in another matches nothing, and the merge succeeds with an empty result.',
            steps: [
              {
                heading: 'The quietest failure in the unit',
                prose: '<code>1</code> and <code>"1"</code> are different keys. No error, no warning, no rows.',
                code: 'import pandas as pd\n\na = pd.DataFrame({"id": ["1"], "name": ["Ada"]})\nb = pd.DataFrame({"id": [1], "score": [90]})\nprint(len(pd.merge(a, b, on="id")), "rows")\nprint(a["id"].dtype, "vs", b["id"].dtype)',
              },
              {
                heading: 'Compare the dtypes first',
                prose: 'The fix is to make both sides the same type before joining. Converting only one side leaves the mismatch where it was.',
                code: 'import pandas as pd\n\na = pd.DataFrame({"id": ["1"], "name": ["Ada"]})\nb = pd.DataFrame({"id": [1], "score": [90]})\n\na2, b2 = a.copy(), b.copy()\na2["id"] = a2["id"].astype(str)\nb2["id"] = b2["id"].astype(str)\nprint(len(pd.merge(a2, b2, on="id")), "rows")',
              },
              {
                heading: 'Whitespace does the same thing',
                prose: '<code>"1 "</code> and <code>"1"</code> are also different keys. Stripping both sides is part of the same preparation.',
                code: 'import pandas as pd\n\na = pd.DataFrame({"id": ["1 "], "name": ["Ada"]})\nb = pd.DataFrame({"id": ["1"], "score": [90]})\nprint(len(pd.merge(a, b, on="id")), "rows")\n\na["id"] = a["id"].str.strip()\nprint(len(pd.merge(a, b, on="id")), "rows")',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Predict, then count',
            prompt: 'Write down how many rows you expect before you run this. The right-hand table has a duplicate.',
            starter: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2], "name": ["Ada", "Bo"]})\nscores = pd.DataFrame({"id": [1, 1, 2], "score": [90, 80, 70]})\n\nprint("duplicated keys:", int(scores["id"].duplicated().sum()))\nprint(len(pd.merge(people, scores, on="id")))\n',
          },
          {
            after: 1,
            title: 'Empty for no reason',
            prompt: 'This join returns nothing. Print both dtypes to see why, then fix it.',
            starter: 'import pandas as pd\n\na = pd.DataFrame({"id": ["1", "2"], "name": ["Ada", "Bo"]})\nb = pd.DataFrame({"id": [1, 2], "score": [90, 80]})\n\nprint(len(pd.merge(a, b, on="id")))\nprint(a["id"].dtype, b["id"].dtype)\n',
          },
        ],
        exercises: [
          {
            title: 'Join whatever type the ids arrived as',
            prompt: 'Write <code>safe_merge(left, right)</code> that joins on <code>id</code> after making both id columns text, and returns the number of rows in the result.',
            starter: 'import pandas as pd\n\ndef safe_merge(left, right):\n    # Match on id whatever type it arrived as.\n    return 0\n\nprint(safe_merge(pd.DataFrame({"id": ["1"], "name": ["Ada"]}),\n                 pd.DataFrame({"id": [1], "score": [90]})))\n',
            call: `safe_merge(${pdf('{"id": ["1"], "name": ["Ada"]}')}, ${pdf('{"id": [1], "score": [90]}')})`,
            expectValue: '1',
            hidden: [
              { name: 'matching types still match', call: `safe_merge(${pdf('{"id": [1, 2], "name": ["a", "b"]}')}, ${pdf('{"id": [1, 2], "score": [1, 2]}')})`, expect: '2' },
              { name: 'a genuinely absent key still matches nothing', call: `safe_merge(${pdf('{"id": [1], "name": ["a"]}')}, ${pdf('{"id": [9], "score": [1]}')})`, expect: '0' },
              CALLS(['astype'], 'astype(str) on both id columns'),
            ],
            hint: 'Convert both id columns with astype(str) on copies, then merge. Converting only one side leaves the mismatch exactly where it was.',
            correct: 'import pandas as pd\n\ndef safe_merge(left, right):\n    a = left.copy()\n    b = right.copy()\n    a["id"] = a["id"].astype(str)\n    b["id"] = b["id"].astype(str)\n    return len(pd.merge(a, b, on="id"))\n',
            wrong: 'import pandas as pd\n\ndef safe_merge(left, right):\n    return len(pd.merge(left, right, on="id"))\n',
          },
          {
            title: 'Count the duplicate keys first',
            prompt: 'Write <code>key_report(left, right)</code> returning a three-element list of [duplicated ids on the left, duplicated ids on the right, rows an inner join would produce]. Checking before joining is the point.',
            starter: 'import pandas as pd\n\ndef key_report(left, right):\n    # [left dupes, right dupes, joined rows]\n    return [0, 0, 0]\n\nprint(key_report(pd.DataFrame({"id": [1]}), pd.DataFrame({"id": [1, 1]})))\n',
            call: `key_report(${pdf('{"id": [1]}')}, ${pdf('{"id": [1, 1]}')})`,
            expectValue: '[0, 1, 2]',
            hidden: [
              { name: 'clean keys on both sides', call: `key_report(${pdf('{"id": [1, 2]}')}, ${pdf('{"id": [1, 2]}')})`, expect: '[0, 0, 2]' },
              { name: 'duplicates on both sides multiply', call: `key_report(${pdf('{"id": [1, 1]}')}, ${pdf('{"id": [1, 1]}')})`, expect: '[1, 1, 4]' },
              { name: 'no overlap gives no rows', call: `key_report(${pdf('{"id": [1]}')}, ${pdf('{"id": [2]}')})`, expect: '[0, 0, 0]' },
              CALLS(['merge'], 'the join actually performed'),
            ],
            hint: 'df["id"].duplicated().sum() counts the repeats on each side. Then merge and take len() — two duplicates each side give four rows, which is the multiplication this exercise is about.',
            correct: 'import pandas as pd\n\ndef key_report(left, right):\n    return [\n        int(left["id"].duplicated().sum()),\n        int(right["id"].duplicated().sum()),\n        len(pd.merge(left, right, on="id")),\n    ]\n',
            wrong: 'import pandas as pd\n\ndef key_report(left, right):\n    return [\n        int(left["id"].duplicated().sum()),\n        int(right["id"].duplicated().sum()),\n        min(len(left), len(right)),\n    ]\n',
          },
        ],
        questions: [
          { id: 'd8-wmgw-1', prompt: 'Duplicate keys on both sides of a merge do what to the row count?',
            choices: ['Nothing', 'Multiply — every left match pairs with every right match', 'Halve it', 'Raise'], answer: 1,
            explain: 'Two and two make four. This is how a join quietly inflates a total.' },
          { id: 'd8-wmgw-2', prompt: 'A key is int in one table and str in the other. What happens?',
            choices: ['pandas converts', 'Nothing matches, and no error is raised', 'It raises TypeError', 'Only the first row matches'], answer: 1,
            explain: '1 and "1" are different keys, and the merge succeeds with an empty result.' },
          { id: 'd8-wmgw-3', prompt: 'Which argument makes pandas check the relationship you assumed?',
            choices: ['check=True', 'validate="one_to_one"', 'strict=True', 'assert_keys=True'], answer: 1,
            explain: 'It raises when the data disagrees, instead of silently multiplying rows.' },
          { id: 'd8-wmgw-4', prompt: 'What is the cheapest check before a join?',
            choices: ['Sorting both', 'Compare the key dtypes and count duplicates on each side', 'Count the columns', 'Reset both indexes'], answer: 1,
            explain: 'Those two lines catch both of this lesson’s failures before they become a wrong number.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'wide-to-long-with-melt',
        title: 'Wide to Long with melt',
        summary: 'Turning a column per month into a column that says which month.',
        objectives: [
          'Say what wide and long mean.',
          'Melt a set of columns down into two.',
          'Choose what stays put with <code>id_vars</code>.',
          'Predict the row count after a melt.',
        ],
        why: 'A spreadsheet is usually wide — a column per month — because that is readable. Every pandas operation you have learned wants long: one row per observation, with the thing that varies in a column of its own. You cannot group by month when month is twelve column headings.',
        sections: [
          {
            heading: 'Why long is easier to work with',
            intro: 'In a wide table the month is metadata — it lives in the column name, where no operation can reach it. In a long table it is data.',
            steps: [
              {
                heading: 'The same numbers, two shapes',
                prose: 'Wide is easier to read; long is the only one you can group, filter or plot by month.',
                code: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]})\nprint(wide)\nprint()\nprint(wide.melt(id_vars=["name"], var_name="month", value_name="score"))',
              },
              {
                heading: 'And now the question is answerable',
                prose: 'Grouping by month is impossible in the wide shape and one line in the long one.',
                code: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]})\nlong = wide.melt(id_vars=["name"], var_name="month", value_name="score")\nprint(long.groupby("month")["score"].mean())',
              },
            ],
          },
          {
            heading: 'id_vars are what stays put',
            intro: 'Everything named in <code>id_vars</code> is repeated down the rows; everything else is folded into the two new columns.',
            steps: [
              {
                heading: 'Naming the new columns',
                prose: '<code>var_name</code> is where the old column headings go; <code>value_name</code> is where their values go. Naming both is worth the keystrokes.',
                code: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada"], "jan": [90], "feb": [80]})\nprint(wide.melt(id_vars=["name"]))\nprint()\nprint(wide.melt(id_vars=["name"], var_name="month", value_name="score"))',
              },
              {
                heading: 'The row count is predictable',
                prose: 'Rows times melted columns. Checking it catches an id_vars list that accidentally left something out.',
                code: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]})\nlong = wide.melt(id_vars=["name"], var_name="month", value_name="score")\nprint(len(wide), "rows x 2 months =", len(long))',
                note: 'Forget to list a column in <code>id_vars</code> and it gets melted too, which usually shows up as a row count twice what you predicted.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Melt and group',
            prompt: 'Melt this table and then take the mean score per month — the question the wide shape cannot answer.',
            starter: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]})\n\nlong = wide.melt(id_vars=["name"], var_name="month", value_name="score")\nprint(long)\nprint(None)   # mean per month\n',
          },
          {
            after: 1,
            title: 'Predict the row count',
            prompt: 'Three people, four months. Say how many rows the melt gives before you run it.',
            starter: 'import pandas as pd\n\nwide = pd.DataFrame({\n    "name": ["a", "b", "c"],\n    "q1": [1, 2, 3], "q2": [4, 5, 6], "q3": [7, 8, 9], "q4": [10, 11, 12],\n})\n\nprint(len(wide.melt(id_vars=["name"])))\n',
          },
        ],
        exercises: [
          {
            title: 'Melt the months down',
            prompt: 'Write <code>to_long(df)</code> that melts a table with a <code>name</code> column and one column per month into columns <code>name</code>, <code>month</code>, <code>score</code>, and returns the row count.',
            starter: 'import pandas as pd\n\ndef to_long(df):\n    # Melt the month columns down. Return the row count.\n    return 0\n\nprint(to_long(pd.DataFrame({"name": ["Ada"], "jan": [90], "feb": [80]})))\n',
            call: `to_long(${pdf('{"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]}')})`,
            expectValue: '4',
            hidden: [
              { name: 'one person and two months gives two rows', call: `to_long(${pdf('{"name": ["Ada"], "jan": [1], "feb": [2]}')})`, expect: '2' },
              { name: 'the month names land in a column',
                call: `sorted(${pdf('{"name": ["Ada"], "jan": [1], "feb": [2]}')}.melt(id_vars=["name"], var_name="month", value_name="score")["month"].tolist())`,
                expect: "['feb', 'jan']" },
              CALLS(['melt'], 'melt rather than a hand-built table'),
            ],
            hint: 'id_vars=["name"] keeps the name and folds every other column down. The row count is people times months.',
            correct: 'import pandas as pd\n\ndef to_long(df):\n    return len(df.melt(id_vars=["name"], var_name="month", value_name="score"))\n',
            wrong: 'import pandas as pd\n\ndef to_long(df):\n    return len(df)\n',
          },
          {
            title: 'The best month, once it is a column',
            prompt: 'Write <code>best_month(df)</code> that melts a wide table with <code>name</code> and a column per month, and returns the month with the highest mean score. This is the question the wide shape cannot answer at all.',
            starter: 'import pandas as pd\n\ndef best_month(df):\n    # Melt, then find the month with the highest average.\n    return None\n\nprint(best_month(pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [50, 40]})))\n',
            call: `best_month(${pdf('{"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [50, 40]}')})`,
            expectValue: "'jan'",
            hidden: [
              { name: 'the later month can win', call: `best_month(${pdf('{"name": ["Ada"], "jan": [10], "feb": [90]}')})`, expect: "'feb'" },
              { name: 'it averages rather than totals',
                call: `best_month(${pdf('{"name": ["a", "b"], "jan": [100, 0], "feb": [60, 60]}')})`, expect: "'feb'" },
              { name: 'one month wins by default', call: `best_month(${pdf('{"name": ["Ada"], "jan": [5]}')})`, expect: "'jan'" },
              CALLS(['melt'], 'melt then group'),
            ],
            hint: 'Melt with id_vars=["name"], group by the month column, take the mean of the score column, then idxmax for the label.',
            correct: 'import pandas as pd\n\ndef best_month(df):\n    long = df.melt(id_vars=["name"], var_name="month", value_name="score")\n    return long.groupby("month")["score"].mean().idxmax()\n',
            wrong: 'import pandas as pd\n\ndef best_month(df):\n    long = df.melt(id_vars=["name"], var_name="month", value_name="score")\n    return long.groupby("month")["score"].sum().idxmin()\n',
          },
        ],
        questions: [
          { id: 'd8-wtl-1', prompt: 'What does melt do?',
            choices: ['Long into wide', 'Wide into long — column headings become values', 'Joins tables', 'Sorts columns'], answer: 1,
            explain: 'The month stops being metadata in a column name and becomes data you can group by.' },
          { id: 'd8-wtl-2', prompt: 'What does id_vars name?',
            choices: ['The columns to melt', 'The columns that stay put', 'The new column names', 'The index'], answer: 1,
            explain: 'Everything not listed gets folded down into the two new columns.' },
          { id: 'd8-wtl-3', prompt: 'Melting 50 rows with 12 month columns gives how many rows?',
            choices: ['50', '62', '600', '12'], answer: 2,
            explain: 'Rows times melted columns. Checking that number catches an id_vars list that left something out.' },
          { id: 'd8-wtl-4', prompt: 'Why can you not group a wide table by month?',
            choices: ['pandas forbids it', 'The month is a column heading, not a value', 'It is too slow', 'You can'], answer: 1,
            explain: 'No operation can reach into a column name. That is what the melt fixes.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'long-to-wide-with-pivot',
        title: 'Long to Wide with pivot',
        summary: 'The other direction, for when a person should be one row.',
        objectives: [
          'Spread a long table back into a grid.',
          'Name what stays down the side and what goes across the top.',
          'Explain the duplicate-entries error and fix it.',
          'Choose between <code>pivot</code> and <code>pivot_table</code>.',
        ],
        why: 'Long is the shape for computing; wide is the shape for reading. The final table in a report almost always wants one row per person and a column per period, and pivot is the trip back. Its one error message is unhelpful until you know what it means, at which point it is precise.',
        sections: [
          {
            heading: 'pivot spreads a column across the top',
            intro: '<code>index</code> stays down the side, <code>columns</code> spreads across the top, <code>values</code> fills the cells. The exact inverse of melt.',
            steps: [
              {
                heading: 'The round trip',
                prose: 'Melt then pivot gets you back where you started, which is a useful way to convince yourself what each one does.',
                code: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]})\nlong = wide.melt(id_vars=["name"], var_name="month", value_name="score")\nback = long.pivot(index="name", columns="month", values="score")\nprint(back)',
              },
              {
                heading: 'The index is the thing you kept',
                prose: 'The name is now the index rather than a column. <code>reset_index()</code> puts it back if you want a plain table.',
                code: 'import pandas as pd\n\nlong = pd.DataFrame({"name": ["Ada", "Ada"], "month": ["jan", "feb"], "score": [90, 80]})\nwide = long.pivot(index="name", columns="month", values="score")\nprint(list(wide.columns))\nprint(wide.reset_index())',
              },
            ],
          },
          {
            heading: 'It needs the pairs to be unique',
            intro: 'A grid cell holds one value. If two rows claim the same index and column, pivot cannot choose between them and says so.',
            steps: [
              {
                heading: 'The error, and what it means',
                prose: '"Index contains duplicate entries, cannot reshape" means two rows want the same cell. It is not a corrupt table; it is a question pivot cannot answer on its own.',
                code: 'import pandas as pd\n\nlong = pd.DataFrame({"name": ["Ada", "Ada"], "month": ["jan", "jan"], "score": [90, 80]})\ntry:\n    long.pivot(index="name", columns="month", values="score")\nexcept ValueError as exc:\n    print("ValueError:", exc)',
              },
              {
                heading: 'pivot_table answers it',
                prose: 'Supplying an <code>aggfunc</code> tells pandas what to do with the two values. That is a decision you should be making anyway.',
                code: 'import pandas as pd\n\nlong = pd.DataFrame({"name": ["Ada", "Ada"], "month": ["jan", "jan"], "score": [90, 80]})\nprint(pd.pivot_table(long, index="name", columns="month", values="score", aggfunc="mean"))',
                note: 'If the duplicates are not legitimate — the same reading recorded twice — the honest fix is upstream, with <code>drop_duplicates</code>, rather than averaging a mistake.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'There and back',
            prompt: 'Melt this table and pivot it back, then check the result has the columns you started with.',
            starter: 'import pandas as pd\n\nwide = pd.DataFrame({"name": ["Ada", "Bo"], "jan": [90, 70], "feb": [80, 60]})\n\nlong = wide.melt(id_vars=["name"], var_name="month", value_name="score")\nback = long.pivot(index="name", columns="month", values="score")\nprint(sorted(back.columns.tolist()))\n',
          },
          {
            after: 1,
            title: 'Two rows, one cell',
            prompt: 'Run this to see the error, then get an answer out of it with <code>pivot_table</code>.',
            starter: 'import pandas as pd\n\nlong = pd.DataFrame({"name": ["Ada", "Ada"], "month": ["jan", "jan"], "score": [90, 80]})\n\ntry:\n    print(long.pivot(index="name", columns="month", values="score"))\nexcept ValueError as exc:\n    print("ValueError:", exc)\n',
          },
        ],
        exercises: [
          {
            title: 'Spread the months across',
            prompt: 'Write <code>month_columns(df)</code> that spreads a long table with <code>name</code>, <code>month</code> and <code>score</code> into one row per name, and returns the sorted column names.',
            starter: 'import pandas as pd\n\ndef month_columns(df):\n    # One row per name, a column per month.\n    return []\n\nprint(month_columns(pd.DataFrame({"name": ["Ada"], "month": ["jan"], "score": [90]})))\n',
            call: `month_columns(${pdf('{"name": ["Ada", "Ada"], "month": ["jan", "feb"], "score": [90, 80]}')})`,
            expectValue: "['feb', 'jan']",
            hidden: [
              { name: 'a single month gives a single column', call: `month_columns(${pdf('{"name": ["Ada"], "month": ["jan"], "score": [1]}')})`, expect: "['jan']" },
              { name: 'several people share the same columns', call: `month_columns(${pdf('{"name": ["a", "b"], "month": ["jan", "jan"], "score": [1, 2]}')})`, expect: "['jan']" },
              CALLS(['pivot'], 'pivot or pivot_table'),
            ],
            hint: 'index is what stays down the side, columns is what spreads across the top, values fills the cells. sorted() on the result keeps the answer stable.',
            correct: 'import pandas as pd\n\ndef month_columns(df):\n    wide = df.pivot(index="name", columns="month", values="score")\n    return sorted(wide.columns.tolist())\n',
            wrong: 'import pandas as pd\n\ndef month_columns(df):\n    wide = df.pivot(index="month", columns="name", values="score")\n    return sorted(wide.columns.tolist())\n',
          },
          {
            title: 'Spread a table that has duplicates',
            prompt: 'Write <code>wide_mean(df)</code> that spreads the same long shape into one row per name, averaging where a name has more than one score for a month, and returns the shape of the result. A plain <code>pivot</code> cannot do this.',
            starter: 'import pandas as pd\n\ndef wide_mean(df):\n    # One row per name, a column per month, averaging duplicates.\n    return None\n\nprint(wide_mean(pd.DataFrame({"name": ["Ada", "Ada"], "month": ["jan", "jan"], "score": [90, 80]})))\n',
            call: `wide_mean(${pdf('{"name": ["Ada", "Ada"], "month": ["jan", "jan"], "score": [90, 80]}')})`,
            expectValue: '(1, 1)',
            hidden: [
              { name: 'names become the rows and months the columns',
                call: `wide_mean(${pdf('{"name": ["a", "b", "c", "a"], "month": ["jan", "jan", "feb", "feb"], "score": [1, 2, 3, 4]}')})`,
                expect: '(3, 2)' },
              { name: 'two names and two months make a 2x2 grid',
                call: `wide_mean(${pdf('{"name": ["a", "a", "b", "b"], "month": ["jan", "feb", "jan", "feb"], "score": [1, 2, 3, 4]}')})`,
                expect: '(2, 2)' },
              { name: 'a table with no duplicates still works',
                call: `wide_mean(${pdf('{"name": ["a"], "month": ["jan"], "score": [1]}')})`, expect: '(1, 1)' },
              CALLS(['pivot_table'], 'pivot_table with an aggfunc'),
            ],
            hint: 'pivot raises on duplicate index/column pairs. pivot_table with aggfunc="mean" answers the question pivot could not, then .shape gives the grid size.',
            correct: 'import pandas as pd\n\ndef wide_mean(df):\n    out = pd.pivot_table(df, index="name", columns="month",\n                         values="score", aggfunc="mean")\n    return out.shape\n',
            wrong: 'import pandas as pd\n\ndef wide_mean(df):\n    out = pd.pivot_table(df, index="month", columns="name",\n                         values="score", aggfunc="mean")\n    return out.shape\n',
          },
        ],
        questions: [
          { id: 'd8-ltw-1', prompt: 'What is pivot for?',
            choices: ['Stacking tables', 'Long back to wide — one row per entity again', 'Filtering', 'Sorting'], answer: 1,
            explain: 'The inverse of melt, and the shape a report table usually wants.' },
          { id: 'd8-ltw-2', prompt: 'pivot raises "Index contains duplicate entries". Why?',
            choices: ['The file is corrupt', 'Two rows want the same cell, and a cell holds one value', 'The columns are numeric', 'The table is empty'], answer: 1,
            explain: 'It is a question pivot cannot answer on its own, not a broken table.' },
          { id: 'd8-ltw-3', prompt: 'What fixes that, when the duplicates are legitimate?',
            choices: ['drop_duplicates', 'pivot_table with an aggfunc', 'reset_index', 'melt again'], answer: 1,
            explain: 'The aggfunc says what to do with the two values — a decision you should be making anyway.' },
          { id: 'd8-ltw-4', prompt: 'After pivot, where is the index column?',
            choices: ['Still a column', 'It is the index', 'Dropped', 'Duplicated'], answer: 1,
            explain: 'reset_index() puts it back as a column when you want a plain table.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'putting-a-join-to-work',
        title: 'Putting a Join to Work',
        summary: 'Two files, one question, and the checks that keep the answer honest.',
        objectives: [
          'Take two files through to one summarised answer.',
          'Put the checks in the right places.',
          'Summarise last, after the joining and the cleaning.',
          'Report the size of what you summarised.',
        ],
        why: 'This is the unit assembled: read, check the keys, join, check the row count, then summarise. The order matters, because every check is cheap before the join and expensive afterwards — once a duplicate key has multiplied your rows, the total is wrong and nothing in the output says so.',
        sections: [
          {
            heading: 'The shape of a real answer',
            intro: 'Read both. Check the keys. Join with the <code>how</code> the question implies. Check the row count. Only then summarise.',
            steps: [
              {
                heading: 'Read, and look',
                prose: 'Two files, four checks each — the habit from unit 5. The key columns get one extra look, because they are what the join depends on.',
                code: 'import pandas as pd\nfrom io import StringIO\n\npeople = pd.read_csv(StringIO("id,team\\n1,red\\n2,red\\n3,blue\\n"))\nscores = pd.read_csv(StringIO("id,score\\n1,90\\n2,80\\n3,70\\n"))\n\nprint(people.shape, scores.shape)\nprint(people["id"].dtype, scores["id"].dtype)\nprint("dupes:", int(people["id"].duplicated().sum()), int(scores["id"].duplicated().sum()))',
              },
              {
                heading: 'Join, and check the count',
                prose: 'You predicted one row per person. If the join gives more, a key was duplicated; if fewer, some did not match. Either way you want to know now.',
                code: 'import pandas as pd\nfrom io import StringIO\n\npeople = pd.read_csv(StringIO("id,team\\n1,red\\n2,red\\n3,blue\\n"))\nscores = pd.read_csv(StringIO("id,score\\n1,90\\n2,80\\n3,70\\n"))\n\nout = pd.merge(people, scores, on="id", how="left")\nprint(len(out), "rows for", len(people), "people")',
              },
            ],
          },
          {
            heading: 'Summarise last',
            intro: 'Group only once the table is the one you meant. A mean over multiplied rows is wrong in a way that looks entirely reasonable.',
            steps: [
              {
                heading: 'The answer, with its size',
                prose: 'The team means, and the number of people behind each — because a team of one is not a comparison.',
                code: 'import pandas as pd\nfrom io import StringIO\n\npeople = pd.read_csv(StringIO("id,team\\n1,red\\n2,red\\n3,blue\\n"))\nscores = pd.read_csv(StringIO("id,score\\n1,90\\n2,80\\n3,70\\n"))\n\nout = pd.merge(people, scores, on="id", how="left")\nprint(out.groupby("team")["score"].agg(["mean", "size"]))',
              },
              {
                heading: 'What a duplicate would have done',
                prose: 'The same code with one duplicated score row. The red mean has not changed much, the size has doubled, and nothing raised.',
                code: 'import pandas as pd\nfrom io import StringIO\n\npeople = pd.read_csv(StringIO("id,team\\n1,red\\n2,red\\n3,blue\\n"))\nbad = pd.read_csv(StringIO("id,score\\n1,90\\n1,90\\n2,80\\n3,70\\n"))\n\nout = pd.merge(people, bad, on="id", how="left")\nprint(len(out), "rows for 3 people")\nprint(out.groupby("team")["score"].agg(["mean", "size"]))',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Check before joining',
            prompt: 'Print the dtypes and the duplicate counts for both key columns before you join anything.',
            starter: 'import pandas as pd\nfrom io import StringIO\n\npeople = pd.read_csv(StringIO("id,team\\n1,red\\n2,blue\\n"))\nscores = pd.read_csv(StringIO("id,score\\n1,90\\n2,80\\n"))\n\nprint(people["id"].dtype, scores["id"].dtype)\nprint(int(people["id"].duplicated().sum()), int(scores["id"].duplicated().sum()))\n',
          },
          {
            after: 1,
            title: 'The answer and its size',
            prompt: 'Join these and produce the mean and the count per team in one result.',
            starter: 'import pandas as pd\n\npeople = pd.DataFrame({"id": [1, 2, 3], "team": ["red", "red", "blue"]})\nscores = pd.DataFrame({"id": [1, 2, 3], "score": [90, 80, 70]})\n\nout = pd.merge(people, scores, on="id", how="left")\nprint(out.groupby("team")["score"].agg(["mean", "size"]))\n',
          },
        ],
        exercises: [
          {
            title: 'Mean score per team, from two files',
            prompt: 'Two files are supplied: <code>people.csv</code> with <code>id</code> and <code>team</code>, and <code>scores.csv</code> with <code>id</code> and <code>score</code>. Write <code>team_means(people_path, scores_path)</code> returning a dictionary of team to mean score, rounded to one decimal place.',
            starter: 'import pandas as pd\n\ndef team_means(people_path, scores_path):\n    # Join on id, then average the score per team.\n    return {}\n\nprint(team_means("people.csv", "scores.csv"))\n',
            files: {
              'people.csv': 'id,team\n1,red\n2,red\n3,blue\n',
              'scores.csv': 'id,score\n1,90\n2,80\n3,70\n',
            },
            call: 'team_means("people.csv", "scores.csv")',
            expectValue: "{'blue': 70.0, 'red': 85.0}",
            hidden: [
              { name: 'different files give a different answer',
                files: { 'people.csv': 'id,team\n1,solo\n', 'scores.csv': 'id,score\n1,50\n' },
                call: 'team_means("people.csv", "scores.csv")', expect: "{'solo': 50.0}" },
              CALLS(['merge', 'read_csv'], 'both files read and merged on id'),
            ],
            hint: 'Read both, merge on id, group by team, take the mean of score, round it, then to_dict(). The second file set is different, so a typed-in answer fails.',
            correct: 'import pandas as pd\n\ndef team_means(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    out = pd.merge(people, scores, on="id")\n    return out.groupby("team")["score"].mean().round(1).to_dict()\n',
            wrong: 'import pandas as pd\n\ndef team_means(people_path, scores_path):\n    return {"blue": 70.0, "red": 85.0}\n',
          },
          {
            title: 'Report the join, not just its result',
            prompt: 'Write <code>join_report(people_path, scores_path)</code> returning a three-element list of [people read, rows after a left join, people with no score]. The middle number differing from the first is how a duplicated key announces itself.',
            starter: 'import pandas as pd\n\ndef join_report(people_path, scores_path):\n    # [people, joined rows, people with no score]\n    return [0, 0, 0]\n\nprint(join_report("people.csv", "scores.csv"))\n',
            files: {
              'people.csv': 'id,team\n1,red\n2,red\n3,blue\n',
              'scores.csv': 'id,score\n1,90\n2,80\n',
            },
            call: 'join_report("people.csv", "scores.csv")',
            expectValue: '[3, 3, 1]',
            hidden: [
              { name: 'a duplicated key shows up as extra rows',
                files: { 'people.csv': 'id,team\n1,red\n', 'scores.csv': 'id,score\n1,90\n1,80\n' },
                call: 'join_report("people.csv", "scores.csv")', expect: '[1, 2, 0]' },
              { name: 'everyone matched leaves nobody missing',
                files: { 'people.csv': 'id,team\n1,red\n2,red\n', 'scores.csv': 'id,score\n1,90\n2,80\n' },
                call: 'join_report("people.csv", "scores.csv")', expect: '[2, 2, 0]' },
              { name: 'nobody matched',
                files: { 'people.csv': 'id,team\n1,red\n', 'scores.csv': 'id,score\n9,90\n' },
                call: 'join_report("people.csv", "scores.csv")', expect: '[1, 1, 1]' },
              CALLS(['merge', 'read_csv'], 'both files read and joined'),
            ],
            hint: 'Read both, left join, and report len(people), len(joined) and the count of NaN in the score column. A left join cannot lose rows, so more rows than people means a key was duplicated.',
            correct: 'import pandas as pd\n\ndef join_report(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    out = pd.merge(people, scores, on="id", how="left")\n    return [len(people), len(out), int(out["score"].isna().sum())]\n',
            wrong: 'import pandas as pd\n\ndef join_report(people_path, scores_path):\n    people = pd.read_csv(people_path)\n    scores = pd.read_csv(scores_path)\n    out = pd.merge(people, scores, on="id")\n    return [len(people), len(out), int(out["score"].isna().sum())]\n',
          },
        ],
        questions: [
          { id: 'd8-pjw-1', prompt: 'When should the key checks happen?',
            choices: ['After the join', 'Before the join', 'After summarising', 'They are not needed'], answer: 1,
            explain: 'Every one of them is cheap before and expensive after, once the totals are already wrong.' },
          { id: 'd8-pjw-2', prompt: 'A left join gives more rows than the left table had. What happened?',
            choices: ['Impossible', 'The right table had a duplicated key', 'The join failed', 'Rows were dropped'], answer: 1,
            explain: 'A left join cannot lose rows, so more rows than you started with means the right side multiplied them.' },
          { id: 'd8-pjw-3', prompt: 'Why summarise last?',
            choices: ['It is faster', 'A mean over multiplied rows looks entirely reasonable and is wrong', 'pandas requires it', 'It does not matter'], answer: 1,
            explain: 'Nothing about the summary reveals that the table underneath it was the wrong one.' },
          { id: 'd8-pjw-4', prompt: 'What belongs beside a group mean in the report?',
            choices: ['The dtype', 'The number of rows behind it', 'The file size', 'The column count'], answer: 1,
            explain: 'A team of one is not a comparison, and the reader cannot tell without the count.' },
        ],
      },
    ],
  },
};
