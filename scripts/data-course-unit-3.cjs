/* Python for Data, unit 3 — Arrays with numpy.
 *
 * Written to the richer lesson schema: objectives, a why-this-matters, stepwise
 * sections, mini practices interleaved between them, and two graded exercises.
 * scripts/build-data-course.cjs normalises both this and the older
 * [heading, prose, code] shape, so units can be rewritten one at a time.
 *
 * The subject of this unit is the bargain an array makes: give up mixed types
 * and you get arithmetic over a whole column. Every lesson here comes back to
 * that, and the two traps that catch people arriving from lists -- a slice is a
 * view, and `and` does not work on an array -- get a step of their own rather
 * than a footnote.
 */

const ASSERT_NUMPY = {
  name: 'numpy does the work',
  kind: 'ast',
  requires: { imports: ['numpy'] },
  describe: 'numpy imported and used',
};
const NO_LOOP = {
  name: 'no loop is needed',
  kind: 'ast',
  forbids: { loops: true },
  describe: 'the operation applied to the whole array at once',
};

module.exports = {
  unit3: {
    title: 'Arrays with numpy',
    blurb: 'Use numpy arrays to do maths on a whole column at once.',
    packages: ['numpy'],
    lessons: [
      /* ---------------------------------------------------------------- 1 */
      {
        slug: 'why-arrays-beat-lists',
        title: 'Why Arrays Beat Lists',
        summary: 'One type and one block of memory buys arithmetic on the whole column.',
        objectives: [
          'Say what an array gives up compared with a list, and what it buys in return.',
          'Predict what <code>* 2</code> does to a list and to an array.',
          'Replace a loop over a column with one expression over an array.',
          'Recognise when a list is still the right choice.',
        ],
        why: 'Almost every slow piece of analysis code is a Python loop doing arithmetic one row at a time. Arrays are how that loop disappears — and the rest of this course, including the whole of pandas, is built on top of them. Getting this one idea straight makes the next seven units read as variations on it rather than as new material.',
        sections: [
          {
            heading: 'A list of numbers is a list of objects',
            intro: 'A Python list is a list of references. Each element is a separate object somewhere in memory, carrying its own type tag, and the list holds a pointer to each one. That is what makes a list able to hold a number, a string and another list at once.',
            steps: [
              {
                heading: 'What an array does instead',
                prose: 'An array holds one type in one unbroken block of memory. There are no per-element objects and no type tags, because the type is a property of the array. That is what lets numpy hand the whole block to compiled code and add a million numbers without Python seeing any of them.',
                code: 'import numpy as np\n\nscores = np.array([92, 88, 79])\nprint(scores)\nprint(scores.dtype)\nprint(scores.shape)',
              },
              {
                heading: 'The bargain, stated plainly',
                prose: 'You give up mixed types. You get speed, and an arithmetic that applies to everything at once. Every other feature in this unit follows from that single trade.',
                code: 'import numpy as np\n\n# One type wins. The int is widened, not kept alongside the float.\nprint(np.array([1, 2, 3.0]).dtype)\n\n# A list has no such rule, because it never made the bargain.\nprint([1, 2, 3.0])',
              },
            ],
          },
          {
            heading: 'Arithmetic applies to the whole array',
            intro: 'This is the difference you will feel first, and it is the one that catches people. The same operator means two completely different things depending on what is on the left of it.',
            steps: [
              {
                heading: 'Multiplying a list repeats it',
                prose: 'On a list, <code>*</code> is repetition — it is the same operator that makes <code>"ab" * 3</code> give <code>"ababab"</code>. On an array it is multiplication, applied to every element.',
                code: 'import numpy as np\n\nprint([1, 2, 3] * 2)\nprint(np.array([1, 2, 3]) * 2)',
              },
              {
                heading: 'The loop you no longer write',
                prose: 'Both of these give the same answer. The second one is the one that stays readable when there are three operations rather than one, and it is the one that does not slow down as the column grows.',
                code: 'import numpy as np\n\nscores = [92, 88, 79]\n\n# One row at a time, in Python.\nprint([s + 5 for s in scores])\n\n# All of it at once, in compiled code.\nprint(np.array(scores) + 5)',
              },
            ],
            note: 'A comprehension is not wrong. It is the right tool for a handful of values, and for anything where the elements are not all the same kind of thing. The argument for arrays is about columns of numbers, which is what a data set is made of.',
          },
          {
            heading: 'When a list is still the right answer',
            intro: 'Arrays are not a replacement for lists. They are a replacement for one specific use of lists.',
            steps: [
              {
                heading: 'Mixed types, or things that are not numbers',
                prose: 'A row of a table — a name, a city and a score — is a genuinely mixed thing, and forcing it into an array turns every element into a Python object anyway, losing the whole advantage. Keep those as lists, dicts, or (from unit 4) a DataFrame, which is built to hold a different type per column.',
                code: 'import numpy as np\n\n# Every element becomes an object, and the speed is gone.\nmixed = np.array(["Ada", 92, True])\nprint(mixed.dtype)\nprint(mixed)',
              },
              {
                heading: 'Growing a collection item by item',
                prose: 'Appending to an array copies the whole block each time, because the block has to stay unbroken. Build with a list and convert once at the end.',
                code: 'import numpy as np\n\nrows = []\nfor n in range(5):\n    rows.append(n * n)\n\nsquares = np.array(rows)\nprint(squares)',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Watch the dtype settle',
            prompt: 'Print the <code>dtype</code> of each of these three arrays before you run it, then check. The third one is the interesting case.',
            starter: 'import numpy as np\n\nprint(np.array([1, 2, 3]).dtype)\nprint(np.array([1.0, 2.0]).dtype)\nprint(np.array([1, 2, 3.0]).dtype)\n',
          },
          {
            after: 1,
            title: 'The same sum, two ways',
            prompt: 'Below is a loop that doubles every score. Rewrite the marked line as one expression on an array, and check the two agree.',
            starter: 'import numpy as np\n\nscores = [92, 88, 79]\n\nby_loop = [s * 2 for s in scores]\n\n# Replace None with an array expression that gives the same numbers.\nby_array = None\n\nprint(by_loop)\nprint(by_array)\n',
          },
        ],
        use: {
          cards: [
            { title: 'Columns of numbers', text: 'Any calculation applied to every value — scaling, offsets, comparisons — is one expression on an array.', code: 'np.array(scores) * 1.1' },
            { title: 'Data sets with many rows', text: 'Arrays stay fast as the column grows, where a Python loop slows down row by row.' },
          ],
          avoid: 'Do not use an array for mixed values like a name, a score and a flag, or for a collection you build up one item at a time. Use lists, then convert once.',
        },
        exercises: [
          {
            title: 'Raise every score',
            prompt: 'Turn <code>scores</code> into a numpy array and print every score raised by 5, using no loop.',
            starter: 'import numpy as np\n\nscores = [92, 88, 79]\n# Make an array, add 5 to all of it, and print the result.\n',
            expect_stdout: '[97 93 84]',
            hidden: [ASSERT_NUMPY, NO_LOOP],
            hint: 'np.array(scores) + 5. The addition reaches every element on its own, which is the point of the array.',
            correct: 'import numpy as np\n\nscores = [92, 88, 79]\nprint(np.array(scores) + 5)\n',
            wrong: 'scores = [92, 88, 79]\nprint([s + 5 for s in scores])\n',
          },
          {
            title: 'Scale to a percentage',
            prompt: 'Write <code>as_percent(marks, total)</code> that takes a list of marks and the total they were out of, and returns a numpy array of percentages rounded to one decimal place. Do the arithmetic on the whole array, not a mark at a time.',
            starter: 'import numpy as np\n\ndef as_percent(marks, total):\n    # An array of marks / total * 100, rounded to one place.\n    return None\n\nprint(as_percent([45, 30], 50))\n',
            call: 'as_percent([45, 30], 50).tolist()',
            expectValue: '[90.0, 60.0]',
            hidden: [
              { name: 'a different total rescales everything',
                call: 'as_percent([10, 20], 40).tolist()', expect: '[25.0, 50.0]' },
              { name: 'an empty list gives an empty array',
                call: 'as_percent([], 50).tolist()', expect: '[]' },
              { name: 'the result really is an array',
                call: 'type(as_percent([1], 2)).__name__', expect: "'ndarray'" },
              { name: 'it rounds rather than truncates',
                call: 'as_percent([1], 3).tolist()', expect: '[33.3]' },
              ASSERT_NUMPY,
              NO_LOOP,
            ],
            hint: 'np.array(marks) / total * 100, then np.round(..., 1). Every step applies to the whole array, so no loop appears anywhere.',
            correct: 'import numpy as np\n\ndef as_percent(marks, total):\n    return np.round(np.array(marks) / total * 100, 1)\n',
            wrong: 'import numpy as np\n\ndef as_percent(marks, total):\n    return np.array([round(m / total * 100) for m in marks])\n',
          },
        ],
        questions: [
          { id: 'd3-wab-1', prompt: 'What does [1, 2, 3] * 2 give you in plain Python?',
            choices: ['[2, 4, 6]', '[1, 2, 3, 1, 2, 3]', 'An error', '[1, 2, 3]'],
            answer: 1,
            explain: 'Multiplying a list repeats it. Only an array reads * 2 as "double every element", which is the first thing that surprises people coming from lists.' },
          { id: 'd3-wab-2', prompt: 'Why can numpy add a large array faster than a Python loop can?',
            choices: ['It uses more memory', 'One type in one block of memory, handed to compiled code', 'It skips some elements', 'It caches the answer'],
            answer: 1,
            explain: 'No per-element objects and no type checks per element, so the addition happens below Python entirely.' },
          { id: 'd3-wab-3', prompt: 'When is a list still the better choice?',
            choices: ['For any numbers', 'When the elements are of mixed types, or you are growing the collection item by item', 'Never', 'Only for text'],
            answer: 1,
            explain: 'An array of mixed types falls back to Python objects and loses the advantage, and appending to an array copies the whole block.' },
          { id: 'd3-wab-4', prompt: 'What is scores.shape for np.array([92, 88, 79])?',
            choices: ['3', '(3,)', '(1, 3)', '(3, 1)'],
            answer: 1,
            explain: 'A one-dimensional array has a one-element shape tuple. The trailing comma is what makes it a tuple rather than a number in brackets.' },
        ],
      },
      /* ---------------------------------------------------------------- 2 */
      {
        slug: 'creating-arrays-and-dtypes',
        title: 'Creating Arrays and dtypes',
        summary: 'Where an array comes from, and the type it settles on.',
        objectives: [
          'Build an array from a list, from a range, and from a fill value.',
          'Choose between <code>arange</code> and <code>linspace</code> for the job in front of you.',
          'Explain why one float in a list of ints changes the whole array.',
          'Set a dtype deliberately instead of accepting the one you were given.',
        ],
        why: 'The dtype is decided at the moment the array is made, and it is decided silently. A column that should be whole numbers arriving as floats, or an integer array quietly truncating the decimals you assign into it, both start here. Two minutes on where arrays come from saves a long afternoon later.',
        sections: [
          {
            heading: 'Several ways in',
            intro: 'Most arrays come from one of four places: an existing list, a range of numbers, a fill value, or a file. The first three are here; files arrive in unit 5.',
            steps: [
              {
                heading: 'From a list, and from a count',
                prose: '<code>np.array</code> converts what you already have. <code>np.zeros</code> and <code>np.ones</code> make an array of a given size to fill in later, which is useful when you know the shape before you know the values.',
                code: 'import numpy as np\n\nprint(np.array([1, 2, 3]))\nprint(np.zeros(3))\nprint(np.ones(3))\nprint(np.full(3, 7))',
              },
              {
                heading: 'arange steps, linspace divides',
                prose: '<code>arange</code> takes a start, a stop and a step, and the stop is exclusive — exactly like <code>range</code>. <code>linspace</code> takes a start, a stop and a <em>count</em>, and the stop is included. Use arange when you know the step, linspace when you know how many points you want.',
                code: 'import numpy as np\n\n# step of 2, stopping below 10\nprint(np.arange(0, 10, 2))\n\n# five points from 0 to 1, both ends included\nprint(np.linspace(0, 1, 5))',
                note: 'The exclusive stop on arange is the single most common off-by-one in numpy. <code>np.arange(0, 10, 2)</code> has five elements, not six.',
              },
            ],
          },
          {
            heading: 'The dtype is chosen for you, until it is not',
            intro: 'Everything in an array shares one type. When you build from a list, numpy picks the narrowest type that can hold all of it.',
            steps: [
              {
                heading: 'One float widens everything',
                prose: 'A single decimal in a list of whole numbers makes the entire array float, because there is no way to keep one element different from the rest. This is why an id column read from a messy file sometimes prints as <code>3.0</code>.',
                code: 'import numpy as np\n\nprint(np.array([1, 2, 3]).dtype)\nprint(np.array([1, 2, 3.0]).dtype)\nprint(np.array([1, 2, 3.0]))',
              },
              {
                heading: 'Saying what you want',
                prose: 'Pass <code>dtype</code> to decide rather than discover. It converts, so asking for float gives you floats even from whole numbers.',
                code: 'import numpy as np\n\nprint(np.array([1, 2, 3], dtype=float))\nprint(np.array([1.9, 2.9], dtype=int))',
                note: 'Converting to int truncates towards zero — it does not round. <code>1.9</code> becomes <code>1</code>.',
              },
              {
                heading: 'The trap on the way back in',
                prose: 'The dtype belongs to the array, not to the value you assign. Writing a float into an int array truncates it, silently, with nothing raised.',
                code: 'import numpy as np\n\na = np.array([1, 2, 3])\na[0] = 3.7\nprint(a)        # the 3.7 became 3\nprint(a.dtype)',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'arange or linspace',
            prompt: 'Produce the numbers 0, 0.25, 0.5, 0.75, 1 twice — once with <code>arange</code> and once with <code>linspace</code>. Notice which one needed you to think about the exclusive stop.',
            starter: 'import numpy as np\n\n# With a step you choose:\nprint(np.arange(0, 1.25, 0.25))\n\n# With a count you choose — fill this one in:\nprint(None)\n',
          },
          {
            after: 1,
            title: 'Predict the dtype',
            prompt: 'Before running, write down what each line will print. The last two are the ones worth getting wrong once.',
            starter: 'import numpy as np\n\nprint(np.array([1, 2]).dtype)\nprint(np.array([1, 2.5]).dtype)\nprint(np.array([1, 2], dtype=float).dtype)\nprint(np.array([1.9, 2.9], dtype=int))\n',
          },
        ],
        use: {
          cards: [
            { title: 'Converting data you already have', text: 'np.array on a list of numbers, then check dtype so you know what arithmetic will do.', code: 'arr = np.array(values, dtype=float)' },
            { title: 'Generating ranges and placeholders', text: 'arange, linspace, zeros and ones for sequences and blank arrays of a known size.' },
          ],
          avoid: 'Do not ignore the dtype. A column that settled on an integer type truncates when you store a fraction into it, and one that settled on object has lost the speed entirely.',
        },
        exercises: [
          {
            title: 'Even numbers below a stop',
            prompt: 'Write <code>even_numbers(stop)</code> that returns a numpy array of the even numbers from 0 up to but not including <code>stop</code>.',
            starter: 'import numpy as np\n\ndef even_numbers(stop):\n    # A numpy array of 0, 2, 4, ... below stop.\n    return None\n\nprint(even_numbers(10))\n',
            call: 'even_numbers(10).tolist()',
            expectValue: '[0, 2, 4, 6, 8]',
            hidden: [
              { name: 'stopping at zero gives an empty array', call: 'even_numbers(0).tolist()', expect: '[]' },
              { name: 'an odd stop still stops below it', call: 'even_numbers(7).tolist()', expect: '[0, 2, 4, 6]' },
              { name: 'the result really is an array', call: 'type(even_numbers(4)).__name__', expect: "'ndarray'" },
              { name: 'numpy does the stepping', kind: 'ast', requires: { imports: ['numpy'] }, forbids: { loops: true }, describe: 'arange rather than a loop' },
            ],
            hint: 'np.arange takes a start, a stop and a step. The stop is exclusive, the same way range works.',
            correct: 'import numpy as np\n\ndef even_numbers(stop):\n    return np.arange(0, stop, 2)\n',
            wrong: 'import numpy as np\n\ndef even_numbers(stop):\n    return np.arange(0, stop + 1, 2)\n',
          },
          {
            title: 'Evenly spaced readings',
            prompt: 'Write <code>readings(start, end, count)</code> that returns a numpy array of <code>count</code> evenly spaced values from <code>start</code> to <code>end</code>, with both ends included, as a float array.',
            starter: 'import numpy as np\n\ndef readings(start, end, count):\n    # count points, evenly spaced, both ends included.\n    return None\n\nprint(readings(0, 1, 5))\n',
            call: 'readings(0, 1, 5).tolist()',
            expectValue: '[0.0, 0.25, 0.5, 0.75, 1.0]',
            hidden: [
              { name: 'both ends are included', call: 'readings(2, 4, 3).tolist()', expect: '[2.0, 3.0, 4.0]' },
              { name: 'asking for two gives just the ends', call: 'readings(0, 10, 2).tolist()', expect: '[0.0, 10.0]' },
              { name: 'asking for one gives the start', call: 'readings(5, 9, 1).tolist()', expect: '[5.0]' },
              { name: 'the values are floats', call: 'readings(0, 1, 2).dtype.kind', expect: "'f'" },
              { name: 'linspace rather than a loop', kind: 'ast', requires: { imports: ['numpy'] }, forbids: { loops: true }, describe: 'linspace doing the spacing' },
            ],
            hint: 'This is exactly what np.linspace is for: it takes the count, not the step, and includes the end.',
            correct: 'import numpy as np\n\ndef readings(start, end, count):\n    return np.linspace(start, end, count)\n',
            wrong: 'import numpy as np\n\ndef readings(start, end, count):\n    return np.arange(start, end, (end - start) / count)\n',
          },
        ],
        questions: [
          { id: 'd3-cad-1', prompt: 'What dtype does np.array([1, 2, 3.0]) have?',
            choices: ['int64', 'float64', 'object', 'It raises an error'], answer: 1,
            explain: 'Everything in an array shares one type, so a single float widens all of it. This is why a column read from a messy file can quietly become float.' },
          { id: 'd3-cad-2', prompt: 'How many elements does np.arange(0, 10, 2) have?',
            choices: ['Four', 'Five', 'Six', 'Ten'], answer: 1,
            explain: '0, 2, 4, 6, 8. The stop is exclusive, so 10 is not included — the same rule as range.' },
          { id: 'd3-cad-blank', prompt: 'Which makes five values from 0 to 1 with both ends included?',
            choices: ['np.arange(0, 1, 5)', 'np.linspace(0, 1, 5)', 'np.zeros(5)', 'np.full(5, 1)'], answer: 1,
            explain: 'linspace takes a count and includes the end; arange takes a step and excludes it.' },
          { id: 'd3-cad-4', prompt: 'a = np.array([1, 2, 3]); a[0] = 3.7. What does a[0] hold?',
            choices: ['3.7', '3', '4', 'It raises TypeError'], answer: 1,
            explain: "The array's dtype wins over the value being assigned, and the decimal is truncated with no warning." },
        ],
      },
      /* ---------------------------------------------------------------- 3 */
      {
        slug: 'indexing-and-slicing-arrays',
        title: 'Indexing and Slicing Arrays',
        summary: 'Slices look like list slices and behave differently in one important way.',
        objectives: [
          'Index and slice a one-dimensional array the way you already index a list.',
          'Explain what a view is, and why writing into one changes the original.',
          'Use <code>.copy()</code> when you need the array left alone.',
          'Index a two-dimensional array with one pair of brackets.',
        ],
        why: 'Array slicing looks identical to list slicing and behaves differently in exactly one respect — it does not copy. That single difference is behind a whole class of bug where a function quietly edits its caller\'s data. It is worth meeting deliberately, once, rather than discovering it in an analysis you have already published.',
        sections: [
          {
            heading: 'Indexing reads the same as a list',
            intro: 'Positions from zero, negatives from the end, and a slice for a run of them. Everything you know from lists transfers.',
            steps: [
              {
                heading: 'Positions and ranges',
                prose: 'A single index gives one element. A slice gives a run, with the stop exclusive, exactly as in a list.',
                code: 'import numpy as np\n\na = np.array([10, 20, 30, 40, 50])\nprint(a[0])\nprint(a[-1])\nprint(a[1:4])\nprint(a[:2])\nprint(a[::2])',
              },
              {
                heading: 'Two dimensions, one pair of brackets',
                prose: 'For a 2-D array you can write <code>a[1][2]</code> as you would with nested lists, but <code>a[1, 2]</code> is the numpy way and it is what lets you slice both directions at once.',
                code: 'import numpy as np\n\ntable = np.array([[1, 2, 3], [4, 5, 6]])\nprint(table[1, 2])      # row 1, column 2\nprint(table[0])         # a whole row\nprint(table[:, 1])      # a whole column',
                note: '<code>table[:, 1]</code> reads as "every row, column 1". Pulling a column out of a list of lists took a comprehension; here it is a slice.',
              },
            ],
          },
          {
            heading: 'A slice is a view, not a copy',
            intro: 'This is the difference that catches people. Slicing a list gives you a new list; slicing an array gives you a window onto the same memory.',
            steps: [
              {
                heading: 'Writing through the window',
                prose: 'Assigning into a slice changes the array it came from. Nothing warns you, because as far as numpy is concerned you asked for a view and then wrote into it.',
                code: 'import numpy as np\n\na = np.array([1, 2, 3, 4])\npart = a[1:3]\npart[0] = 99\nprint(part)\nprint(a)          # the 99 is in here too',
              },
              {
                heading: 'The same code with a list does not do this',
                prose: 'Worth running side by side once, so the difference is a thing you have seen rather than a thing you were told.',
                code: "values = [1, 2, 3, 4]\npart = values[1:3]\npart[0] = 99\nprint(part)\nprint(values)     # untouched",
              },
              {
                heading: 'Ask for a copy when you want one',
                prose: 'If a function is going to modify what it was handed, take a copy first — or return something new instead of editing in place. The cost of the copy is almost always smaller than the cost of the bug.',
                code: 'import numpy as np\n\na = np.array([1, 2, 3, 4])\npart = a[1:3].copy()\npart[0] = 99\nprint(part)\nprint(a)          # safe',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Take a column',
            prompt: 'From the table below, print the second column, then the last row, then the single value in the bottom right — each in one expression.',
            starter: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6],\n                  [7, 8, 9]])\n\nprint(table[:, 1])\nprint(None)   # the last row\nprint(None)   # bottom right\n',
          },
          {
            after: 1,
            title: 'Prove it to yourself',
            prompt: 'Run this as it stands and note what <code>a</code> prints. Then add <code>.copy()</code> to the slice and run it again.',
            starter: 'import numpy as np\n\na = np.array([1, 2, 3, 4, 5])\nwindow = a[1:4]\nwindow[:] = 0\n\nprint(window)\nprint(a)\n',
          },
        ],
        use: {
          cards: [
            { title: 'Reading part of an array', text: 'A slice is a cheap view: ideal for looking at, summarising or passing along a range of values.', code: 'first_week = daily[:7]' },
            { title: 'Changing part of an array on purpose', text: 'Assigning into a slice updates the original — useful when that is exactly what you mean.' },
          ],
          avoid: 'Do not modify a slice you meant to be a separate copy. Call .copy() first, or a change to the “copy” quietly rewrites the original data.',
        },
        exercises: [
          {
            title: 'Everything but the ends',
            prompt: 'Write <code>middle(values)</code> that returns a list of everything except the first and last item.',
            starter: 'import numpy as np\n\ndef middle(values):\n    # Everything but the ends, as a list.\n    return []\n\nprint(middle(np.array([1, 2, 3, 4, 5])))\n',
            call: 'middle(__import__("numpy").array([1, 2, 3, 4, 5]))',
            expectValue: '[2, 3, 4]',
            hidden: [
              { name: 'three items leave one in the middle', call: 'middle(__import__("numpy").array([1, 2, 3]))', expect: '[2]' },
              { name: 'two items leave nothing', call: 'middle(__import__("numpy").array([1, 2]))', expect: '[]' },
              { name: 'an empty array stays empty', call: 'middle(__import__("numpy").array([]))', expect: '[]' },
            ],
            hint: 'A slice from 1 to -1 drops one from each end, and slices clamp rather than raise when there is nothing left to take.',
            correct: 'import numpy as np\n\ndef middle(values):\n    return values[1:-1].tolist()\n',
            wrong: 'import numpy as np\n\ndef middle(values):\n    return values[1:len(values)].tolist()\n',
          },
          {
            title: 'Zero a range without touching the original',
            prompt: 'Write <code>blanked(values, start, stop)</code> that returns a new array with the elements from <code>start</code> up to (not including) <code>stop</code> set to 0. The array you were given must come back unchanged.',
            starter: 'import numpy as np\n\ndef blanked(values, start, stop):\n    # A new array, that range zeroed, the original untouched.\n    return None\n\na = np.array([1, 2, 3, 4])\nprint(blanked(a, 1, 3))\nprint(a)\n',
            call: 'blanked(__import__("numpy").array([1, 2, 3, 4]), 1, 3).tolist()',
            expectValue: '[1, 0, 0, 4]',
            hidden: [
              { name: 'the original is left alone',
                call: '(lambda np: (lambda a: (blanked(a, 0, 2), a.tolist())[1])(np.array([5, 6, 7])))(__import__("numpy"))',
                expect: '[5, 6, 7]' },
              { name: 'an empty range changes nothing', call: 'blanked(__import__("numpy").array([1, 2]), 1, 1).tolist()', expect: '[1, 2]' },
              { name: 'the whole array can be zeroed', call: 'blanked(__import__("numpy").array([1, 2]), 0, 2).tolist()', expect: '[0, 0]' },
              { name: 'the result is an array', call: 'type(blanked(__import__("numpy").array([1]), 0, 0)).__name__', expect: "'ndarray'" },
            ],
            hint: 'Take a .copy() first, then assign 0 into the slice of the copy. Assigning into a slice of the original would change the caller\'s array, which is the thing this exercise is checking.',
            correct: 'import numpy as np\n\ndef blanked(values, start, stop):\n    out = values.copy()\n    out[start:stop] = 0\n    return out\n',
            wrong: 'import numpy as np\n\ndef blanked(values, start, stop):\n    values[start:stop] = 0\n    return values\n',
          },
        ],
        questions: [
          { id: 'd3-ias-1', prompt: 'How does slicing an array differ from slicing a list?',
            choices: ['It does not', 'The array slice is a view, so writing to it changes the original', 'The array slice is always shorter', 'Array slices cannot use negatives'], answer: 1,
            explain: 'No copy is made. This is efficient and it is also the source of a whole class of accidental edits.' },
          { id: 'd3-ias-2', prompt: 'What does table[:, 1] give you?',
            choices: ['Row 1', 'Column 1', 'The element at 0,1', 'An error'], answer: 1,
            explain: '"Every row, column 1" — which is how you take a column out of a two-dimensional array in one expression.' },
          { id: 'd3-ias-3', prompt: 'How do you take a slice you can safely modify?',
            choices: ['a[1:3].copy()', 'a[1:3].view()', 'list(a[1:3])', 'a.slice(1, 3)'], answer: 0,
            explain: 'copy() makes the new block of memory that a list slice would have given you anyway.' },
          { id: 'd3-ias-4', prompt: 'a = np.array([1,2,3,4]); a[1:3] = 0. What is a?',
            choices: ['[1, 0, 3, 4]', '[1, 0, 0, 4]', '[0, 0, 0, 0]', 'It raises'], answer: 1,
            explain: 'Assigning a single number into a slice broadcasts it across every position in that slice.' },
        ],
      },
      /* ---------------------------------------------------------------- 4 */
      {
        slug: 'boolean-masks',
        title: 'Boolean Masks',
        summary: 'A comparison over an array gives an array of answers, and that array selects.',
        objectives: [
          'Read a comparison on an array as producing one answer per element.',
          'Use a mask inside square brackets to select the elements you want.',
          'Combine conditions with <code>&amp;</code> and <code>|</code>, and say why <code>and</code> fails.',
          'Count matches without selecting them.',
        ],
        why: 'This is filtering, and it is the same idea you will use for the rest of the course — a mask over a numpy array in this unit, a mask over a whole DataFrame in unit 6. It also contains the single most common numpy error message people meet, and knowing why it happens turns it from a mystery into a typo.',
        sections: [
          {
            heading: 'A comparison produces an array',
            intro: '<code>scores &gt; 85</code> is not one True or False. It is one per element — which is what makes the next section work.',
            steps: [
              {
                heading: 'One answer per element',
                prose: 'The comparison is elementwise, like every other numpy operation. What comes back is an array of booleans the same shape as the one you started with.',
                code: 'import numpy as np\n\nscores = np.array([92, 88, 79])\nprint(scores > 85)\nprint((scores > 85).dtype)',
              },
              {
                heading: 'Counting without selecting',
                prose: 'Because True counts as 1, summing a mask counts the matches. <code>.any()</code> and <code>.all()</code> answer the two other questions you usually have.',
                code: 'import numpy as np\n\nscores = np.array([92, 88, 79])\nmask = scores > 85\n\nprint(mask.sum())     # how many\nprint(mask.any())     # is there at least one\nprint(mask.all())     # are they all',
              },
            ],
          },
          {
            heading: 'Index with the mask to select',
            intro: 'Putting the mask inside the brackets keeps only the elements it marked. This is filtering, and it is the same shape of operation you will use on tables later.',
            steps: [
              {
                heading: 'Selecting',
                prose: 'The result is a new array holding just the elements where the mask was True. Its length is the number of matches, not the length of the original.',
                code: 'import numpy as np\n\nscores = np.array([92, 88, 79])\nprint(scores[scores > 85])\nprint(len(scores[scores > 85]))',
              },
              {
                heading: 'Two conditions, and the error everybody hits',
                prose: 'Use <code>&amp;</code> for and, <code>|</code> for or, and bracket each condition. Python\'s own <code>and</code> needs to reduce each side to a single True or False, and an array refuses — which is exactly what the error says.',
                code: 'import numpy as np\n\nscores = np.array([92, 88, 79, 60])\n\nprint(scores[(scores > 70) & (scores < 90)])\nprint(scores[(scores < 70) | (scores > 90)])',
                note: 'Leaving the brackets off gives a confusing error, because <code>&amp;</code> binds tighter than <code>&gt;</code>. <code>scores &gt; 70 &amp; scores &lt; 90</code> is parsed as <code>scores &gt; (70 &amp; scores) &lt; 90</code>.',
              },
              {
                heading: 'What "and" actually says',
                prose: 'Run this deliberately once. The message — the truth value of an array with more than one element is ambiguous — is numpy telling you it cannot answer a yes/no question about a whole array, and pointing you at <code>&amp;</code>.',
                code: 'import numpy as np\n\nscores = np.array([92, 88])\ntry:\n    scores[(scores > 70) and (scores < 90)]\nexcept ValueError as exc:\n    print("ValueError:", exc)',
              },
            ],
          },
          {
            heading: 'Assigning through a mask',
            intro: 'A mask works on the left of an assignment too, which is how you fix a set of values in one line.',
            steps: [
              {
                heading: 'Capping outliers',
                prose: 'Everything the mask marks gets the new value. The rest is untouched.',
                code: 'import numpy as np\n\nscores = np.array([92, 105, 79])\nscores[scores > 100] = 100\nprint(scores)',
                note: 'Remember the previous lesson: this edits in place. Take a <code>.copy()</code> first if the caller still needs the original.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Count before you select',
            prompt: 'Print how many scores are below 80, whether any are, and whether all are — without selecting a single element.',
            starter: 'import numpy as np\n\nscores = np.array([92, 88, 79, 60, 71])\nlow = scores < 80\n\nprint(low.sum())\nprint(None)   # is there at least one\nprint(None)   # are they all\n',
          },
          {
            after: 1,
            title: 'Two conditions',
            prompt: 'Select the scores that are at least 70 and at most 90. Then try it once with <code>and</code> instead of <code>&amp;</code> and read the error.',
            starter: 'import numpy as np\n\nscores = np.array([92, 88, 79, 60])\n\nprint(scores[(scores >= 70) & (scores <= 90)])\n',
          },
        ],
        use: {
          cards: [
            { title: 'Selecting values by a condition', text: 'A comparison gives a mask, and indexing with it keeps the matching values — no loop.', code: 'passed = scores[scores >= 60]' },
            { title: 'Counting and replacing', text: '(mask).sum() counts matches; np.where builds a new array from a condition.' },
          ],
          avoid: 'Do not combine masks with and, or or not — they raise on arrays. Use &, | and ~, with each comparison in parentheses.',
        },
        exercises: [
          {
            title: 'The scores that passed',
            prompt: 'Write <code>passing(scores, mark)</code> that returns a list of the scores that are at least <code>mark</code>, using a mask rather than a loop.',
            starter: 'import numpy as np\n\ndef passing(scores, mark):\n    # The scores at or above mark, as a list.\n    return []\n\nprint(passing(np.array([92, 88, 79]), 85))\n',
            call: 'passing(__import__("numpy").array([92, 88, 79]), 85)',
            expectValue: '[92, 88]',
            hidden: [
              { name: 'a score exactly on the mark is kept', call: 'passing(__import__("numpy").array([85]), 85)', expect: '[85]' },
              { name: 'nothing qualifying gives an empty list', call: 'passing(__import__("numpy").array([10, 20]), 85)', expect: '[]' },
              { name: 'the mask does the selecting, not a loop', kind: 'ast', forbids: { loops: true }, describe: 'a boolean mask rather than a loop or comprehension' },
            ],
            hint: 'scores >= mark gives you an array of True and False. Put that inside the square brackets.',
            correct: 'import numpy as np\n\ndef passing(scores, mark):\n    return scores[scores >= mark].tolist()\n',
            wrong: 'import numpy as np\n\ndef passing(scores, mark):\n    return list(scores[scores > mark])\n',
          },
          {
            title: 'How many in the band',
            prompt: 'Write <code>in_band(scores, low, high)</code> that returns how many scores are between <code>low</code> and <code>high</code> inclusive. Count the mask; do not select the elements and measure the result.',
            starter: 'import numpy as np\n\ndef in_band(scores, low, high):\n    # How many scores sit between low and high, both included.\n    return 0\n\nprint(in_band(np.array([92, 88, 79, 60]), 70, 90))\n',
            call: 'in_band(__import__("numpy").array([92, 88, 79, 60]), 70, 90)',
            expectValue: '2',
            hidden: [
              { name: 'both ends are included', call: 'in_band(__import__("numpy").array([70, 90]), 70, 90)', expect: '2' },
              { name: 'nothing in range counts zero', call: 'in_band(__import__("numpy").array([1, 2]), 70, 90)', expect: '0' },
              { name: 'an empty array counts zero', call: 'in_band(__import__("numpy").array([]), 70, 90)', expect: '0' },
              { name: 'it returns a plain int, not an array', call: 'type(in_band(__import__("numpy").array([80]), 70, 90)).__name__ in ("int", "int64")', expect: 'True' },
              { name: 'no loop counts the elements', kind: 'ast', forbids: { loops: true }, describe: 'the mask summed rather than counted in Python' },
            ],
            hint: 'Build one mask with (scores >= low) & (scores <= high), then .sum() it. Wrap the result in int() so it comes back as a plain number.',
            correct: 'import numpy as np\n\ndef in_band(scores, low, high):\n    return int(((scores >= low) & (scores <= high)).sum())\n',
            wrong: 'import numpy as np\n\ndef in_band(scores, low, high):\n    return int(((scores > low) & (scores < high)).sum())\n',
          },
        ],
        questions: [
          { id: 'd3-bm-1', prompt: 'What does scores > 85 evaluate to when scores is an array?',
            choices: ['A single True or False', 'An array of True and False, one per element', 'The matching scores', 'The number of matches'], answer: 1,
            explain: 'Elementwise, like every other numpy operation. That array of answers is what does the selecting.' },
          { id: 'd3-bm-2', prompt: 'How do you write "over 70 and under 90" as a mask?',
            choices: ['(a > 70) and (a < 90)', '(a > 70) & (a < 90)', 'a > 70 && a < 90', 'both(a > 70, a < 90)'], answer: 1,
            explain: "Python's `and` needs one truth value per side and an array refuses to give one. The brackets matter because & binds tighter than the comparisons." },
          { id: 'd3-bm-3', prompt: 'What does mask.sum() give you?',
            choices: ['The matching values', 'How many are True', 'True or False', 'The mask again'], answer: 1,
            explain: 'True counts as 1, so summing a boolean array counts the matches without selecting anything.' },
          { id: 'd3-bm-4', prompt: 'a[a > 100] = 100 does what?',
            choices: ['Returns the capped array', 'Sets every element over 100 to 100, in place', 'Raises', 'Removes those elements'], answer: 1,
            explain: 'A mask works on the left of an assignment too. Note "in place" — the array you were handed is the one that changed.' },
        ],
      },
      /* ---------------------------------------------------------------- 5 */
      {
        slug: 'array-maths-and-broadcasting',
        title: 'Array Maths and Broadcasting',
        summary: 'Arrays of different shapes can still meet, under one clear rule.',
        objectives: [
          'Combine two arrays of the same shape without a loop or a zip.',
          'State the broadcasting rule and apply it to a scalar and a row.',
          'Predict which pairs of shapes cannot be combined.',
          'Centre and scale a column in one expression.',
        ],
        why: 'Broadcasting is why <code>+ 5</code> worked in the first lesson, and it is the reason a per-column adjustment does not need a loop. It is also the source of the shape errors that stop a script dead — and those errors are readable once you know the rule they are enforcing.',
        sections: [
          {
            heading: 'Elementwise by default',
            intro: 'Two arrays of the same shape combine position by position. No loop, no zip.',
            steps: [
              {
                heading: 'Same shape, straightforward',
                prose: 'Every arithmetic operator works this way, and so do the comparisons you met in the last lesson.',
                code: 'import numpy as np\n\nmarks = np.array([45, 30, 50])\nbonus = np.array([5, 10, 0])\n\nprint(marks + bonus)\nprint(marks * 2)\nprint(marks / 50)',
              },
              {
                heading: 'The methods that reduce',
                prose: 'Alongside the operators, an array carries its own summaries. Each collapses the array to one number, unless you say otherwise — which is the next lesson.',
                code: 'import numpy as np\n\nmarks = np.array([45, 30, 50])\nprint(marks.sum(), marks.mean(), marks.min(), marks.max())\nprint(round(marks.std(), 3))',
              },
            ],
          },
          {
            heading: 'Broadcasting stretches the smaller one',
            intro: 'A single number is treated as if repeated to fit. That is why <code>+ 5</code> worked, and the same rule extends to whole rows and columns.',
            steps: [
              {
                heading: 'The rule',
                prose: 'Line the shapes up from the right. Two dimensions are compatible if they are equal, or if one of them is 1. Anything else has no defined meaning and numpy says so rather than guessing.',
                code: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6]])      # shape (2, 3)\nper_column = np.array([10, 20, 30]) # shape (3,)\n\n# (2, 3) and (3,) line up on the right: 3 == 3, and the missing\n# dimension is treated as 1. The row is applied to every row.\nprint(table + per_column)',
              },
              {
                heading: 'When it refuses',
                prose: 'A shape mismatch is a real error, not a numpy quirk — there is no single sensible answer for adding three numbers to rows of four.',
                code: 'import numpy as np\n\ntry:\n    np.array([1, 2, 3]) + np.array([1, 2, 3, 4])\nexcept ValueError as exc:\n    print("ValueError:", exc)',
              },
              {
                heading: 'Centring, the everyday use',
                prose: 'Subtracting the mean is broadcasting a single number across the whole array. Dividing by the standard deviation as well gives you a standardised column, which is the form most models want.',
                code: 'import numpy as np\n\nvalues = np.array([2.0, 4.0, 6.0])\ncentred = values - values.mean()\nprint(centred)\nprint(centred / values.std())',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Weighted total',
            prompt: 'Two tests carry different weights. Multiply each column by its weight and total each student, in two expressions and no loop.',
            starter: 'import numpy as np\n\nmarks = np.array([[80, 60],\n                  [50, 90]])\nweights = np.array([0.7, 0.3])\n\nweighted = marks * weights\nprint(weighted)\nprint(None)   # one total per student\n',
          },
          {
            after: 1,
            title: 'Read the shape error',
            prompt: 'This raises. Read the message, then change the second array so the shapes line up.',
            starter: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6]])\nadjust = np.array([1, 2])\n\ntry:\n    print(table + adjust)\nexcept ValueError as exc:\n    print("ValueError:", exc)\n',
          },
        ],
        use: {
          cards: [
            { title: 'Applying one value to everything', text: 'A scalar broadcasts across the whole array: offsets, scaling, unit conversions.', code: 'celsius = (fahrenheit - 32) * 5 / 9' },
            { title: 'A row or column against a table', text: 'Subtract a per-column mean from every row, where the shapes line up from the right.' },
          ],
          avoid: 'Do not rely on broadcasting when you are not sure of the shapes. Print .shape first — a silent broadcast between the wrong axes gives a result of the wrong size, not an error.',
        },
        exercises: [
          {
            title: 'Centre on the mean',
            prompt: 'Write <code>centred(values)</code> that returns a list of each value minus the mean of them all, rounded to two decimal places.',
            starter: 'import numpy as np\n\ndef centred(values):\n    # Each value minus the average, rounded to 2dp.\n    return []\n\nprint(centred(np.array([1.0, 2.0, 3.0])))\n',
            call: 'centred(__import__("numpy").array([1.0, 2.0, 3.0]))',
            expectValue: '[-1.0, 0.0, 1.0]',
            hidden: [
              { name: 'identical values centre on zero', call: 'centred(__import__("numpy").array([5.0, 5.0]))', expect: '[0.0, 0.0]' },
              { name: 'one value is its own mean', call: 'centred(__import__("numpy").array([7.0]))', expect: '[0.0]' },
              { name: 'the subtraction reaches the whole array at once', kind: 'ast', forbids: { loops: true }, describe: 'broadcasting rather than a loop' },
            ],
            hint: 'values - values.mean() does the whole thing. np.round then rounds the array, and tolist() turns it back into plain numbers.',
            correct: 'import numpy as np\n\ndef centred(values):\n    return np.round(values - values.mean(), 2).tolist()\n',
            wrong: 'import numpy as np\n\ndef centred(values):\n    return np.round(values, 2).tolist()\n',
          },
          {
            title: 'Apply a weight to every column',
            prompt: 'Write <code>weighted_totals(table, weights)</code> that multiplies each column of a 2-D array by the matching weight and returns one total per row, as a list. Let broadcasting apply the weights; do not loop over the columns.',
            starter: 'import numpy as np\n\ndef weighted_totals(table, weights):\n    # Each column scaled by its weight, then one total per row.\n    return []\n\nprint(weighted_totals(np.array([[80, 60], [50, 90]]), np.array([0.5, 0.5])))\n',
            call: 'weighted_totals(__import__("numpy").array([[80, 60], [50, 90]]), __import__("numpy").array([0.5, 0.5]))',
            expectValue: '[70.0, 70.0]',
            hidden: [
              { name: 'uneven weights favour the right column',
                call: 'weighted_totals(__import__("numpy").array([[100, 0]]), __import__("numpy").array([0.25, 0.75]))', expect: '[25.0]' },
              { name: 'a single row still works',
                call: 'weighted_totals(__import__("numpy").array([[10, 10]]), __import__("numpy").array([1.0, 1.0]))', expect: '[20.0]' },
              { name: 'three rows give three totals',
                call: 'len(weighted_totals(__import__("numpy").array([[1, 1], [2, 2], [3, 3]]), __import__("numpy").array([1.0, 1.0])))', expect: '3' },
              { name: 'broadcasting applies the weights', kind: 'ast', forbids: { loops: true }, describe: 'the weights broadcast across the rows' },
            ],
            hint: '(table * weights) scales every row by the weights, because the shapes line up on the right. Then sum along axis=1 for one total per row.',
            correct: 'import numpy as np\n\ndef weighted_totals(table, weights):\n    return (table * weights).sum(axis=1).tolist()\n',
            wrong: 'import numpy as np\n\ndef weighted_totals(table, weights):\n    return (table * weights).sum(axis=0).tolist()\n',
          },
        ],
        questions: [
          { id: 'd3-amb-1', prompt: 'Why does np.array([1, 2, 3]) + 5 work?',
            choices: ['numpy loops for you', 'The 5 is broadcast to the array’s shape', 'It raises a warning first', 'Only because they are integers'], answer: 1,
            explain: 'The scalar is treated as though repeated to fit, without a real array of fives ever being built.' },
          { id: 'd3-amb-2', prompt: 'Which pair of shapes cannot broadcast?',
            choices: ['(3,) and (1,)', '(3,) and (3,)', '(3,) and (4,)', '(2, 3) and (3,)'], answer: 2,
            explain: 'Lined up from the right, dimensions must be equal or one of them must be 1. 3 and 4 are neither.' },
          { id: 'd3-amb-3', prompt: 'What does values - values.mean() give you?',
            choices: ['A single number', 'Each value’s distance from the average', 'The sorted values', 'The standard deviation'], answer: 1,
            explain: 'Centring a column, and the first half of standardising it.' },
          { id: 'd3-amb-4', prompt: 'table has shape (2, 3). Which array can be added to it row-wise?',
            choices: ['shape (2,)', 'shape (3,)', 'shape (6,)', 'shape (3, 2)'], answer: 1,
            explain: 'Shapes line up from the right, so the (3,) matches the 3 columns and is applied to every row.' },
        ],
      },
      /* ---------------------------------------------------------------- 6 */
      {
        slug: 'summing-and-axes',
        title: 'Summing and Axes',
        summary: 'In two dimensions, the question is always which way you are collapsing.',
        objectives: [
          'Reduce a whole array to a single number.',
          'Say what <code>axis=0</code> and <code>axis=1</code> collapse, in words, before writing either.',
          'Check an answer by its shape rather than by reading the numbers.',
          'Choose the axis from the question being asked.',
        ],
        why: 'Getting the axis backwards is the most common error in this unit, and it is dangerous because it does not raise — you get a plausible-looking list of the wrong length. Learning to say "I am collapsing the rows, so I keep one value per column" out loud, and then checking the shape, is what stops it.',
        sections: [
          {
            heading: 'Aggregating the whole array',
            intro: '<code>sum</code>, <code>mean</code>, <code>min</code>, <code>max</code> and <code>std</code> each reduce an array to one number when you do not say otherwise.',
            steps: [
              {
                heading: 'Everything at once',
                prose: 'With no axis named, there is nothing left to keep, so the whole array collapses — including a two-dimensional one.',
                code: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6]])\n\nprint(table.sum())\nprint(table.mean())\nprint(table.max())',
              },
            ],
          },
          {
            heading: 'axis picks the direction',
            intro: 'The name is the confusing part. <code>axis</code> says which dimension is being <em>removed</em>, not which one is kept.',
            steps: [
              {
                heading: 'axis=0 collapses the rows',
                prose: 'Running down through the rows leaves one value per column. For a table of students by test, that is one number per test.',
                code: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6]])\n\nprint(table.sum(axis=0))      # one per column\nprint(table.sum(axis=0).shape)',
              },
              {
                heading: 'axis=1 collapses the columns',
                prose: 'Running across the columns leaves one value per row — one number per student.',
                code: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6]])\n\nprint(table.sum(axis=1))      # one per row\nprint(table.sum(axis=1).shape)',
              },
              {
                heading: 'Check the shape, not the numbers',
                prose: 'A 2&times;3 table summed along the wrong axis gives three numbers where you wanted two. On a real table both are plausible lists, so the length is the check that catches it.',
                code: 'import numpy as np\n\ntable = np.array([[1, 2, 3],\n                  [4, 5, 6]])\n\nprint("students:", table.shape[0], "tests:", table.shape[1])\nprint("per student:", table.sum(axis=1))   # length 2\nprint("per test:   ", table.sum(axis=0))   # length 3',
                note: 'A sentence that always works: <em>axis=0 is down, axis=1 is across.</em> Say which you mean in words first, then write it.',
              },
            ],
          },
        ],
        practices: [
          {
            after: 0,
            title: 'Say it before you write it',
            prompt: 'This table is students down, tests across. Print the average per test, then the average per student — and predict the length of each before you run it.',
            starter: 'import numpy as np\n\nmarks = np.array([[80, 60, 70],\n                  [50, 90, 65]])\n\nprint(marks.mean(axis=0))   # per test — how many numbers?\nprint(None)                 # per student\n',
          },
          {
            after: 1,
            title: 'Best in each test',
            prompt: 'Print the highest mark in each test, and then which student got it. <code>argmax</code> takes an axis too.',
            starter: 'import numpy as np\n\nmarks = np.array([[80, 60, 70],\n                  [50, 90, 65]])\n\nprint(marks.max(axis=0))\nprint(marks.argmax(axis=0))\n',
          },
        ],
        use: {
          cards: [
            { title: 'Totals per row or per column', text: 'axis=0 collapses rows to give one value per column; axis=1 gives one value per row.', code: 'per_student = marks.sum(axis=1)' },
            { title: 'Whole-table summaries', text: 'No axis gives one number for everything — a grand total or overall mean.' },
          ],
          avoid: 'Do not guess the axis. Check the shape of the result: if you wanted one value per student and got one per test, the axis is the other one.',
        },
        exercises: [
          {
            title: 'One total per student',
            prompt: 'A table has one row per student and one column per test. Write <code>student_totals(table)</code> returning each student’s total as a list.',
            starter: 'import numpy as np\n\ndef student_totals(table):\n    # One total per row, as a list.\n    return []\n\nprint(student_totals(np.array([[1, 2], [3, 4]])))\n',
            call: 'student_totals(__import__("numpy").array([[1, 2], [3, 4]]))',
            expectValue: '[3, 7]',
            hidden: [
              { name: 'a single row totals on its own', call: 'student_totals(__import__("numpy").array([[5, 5, 5]]))', expect: '[15]' },
              { name: 'three students give three totals', call: 'len(student_totals(__import__("numpy").array([[1], [2], [3]])))', expect: '3' },
              { name: 'the totals are per row, not per column', call: 'student_totals(__import__("numpy").array([[1, 100], [2, 200]]))', expect: '[101, 202]' },
            ],
            hint: 'One total per student means one per row, so the sum has to collapse across the columns. That is axis=1.',
            correct: 'import numpy as np\n\ndef student_totals(table):\n    return table.sum(axis=1).tolist()\n',
            wrong: 'import numpy as np\n\ndef student_totals(table):\n    return table.sum(axis=0).tolist()\n',
          },
          {
            title: 'The hardest test',
            prompt: 'Write <code>hardest_test(table)</code> that returns the position of the test with the lowest average mark, where the table is students down and tests across. Collapse the rows to get an average per test, then take the position of the smallest.',
            starter: 'import numpy as np\n\ndef hardest_test(table):\n    # The index of the column with the lowest mean.\n    return 0\n\nprint(hardest_test(np.array([[80, 60], [90, 50]])))\n',
            call: 'hardest_test(__import__("numpy").array([[80, 60], [90, 50]]))',
            expectValue: '1',
            hidden: [
              { name: 'the first column can be the hardest', call: 'hardest_test(__import__("numpy").array([[10, 90], [20, 80]]))', expect: '0' },
              { name: 'a single test is the answer by default', call: 'hardest_test(__import__("numpy").array([[5], [6]]))', expect: '0' },
              { name: 'it averages rather than totals', call: 'hardest_test(__import__("numpy").array([[0, 1], [0, 1], [100, 1]]))', expect: '1' },
              { name: 'it returns a plain int', call: 'int(hardest_test(__import__("numpy").array([[1, 2]])))', expect: '0' },
            ],
            hint: 'table.mean(axis=0) gives one mean per test. argmin on that gives the position of the smallest. Wrap it in int() so the answer is a plain number.',
            correct: 'import numpy as np\n\ndef hardest_test(table):\n    return int(table.mean(axis=0).argmin())\n',
            wrong: 'import numpy as np\n\ndef hardest_test(table):\n    return int(table.mean(axis=1).argmin())\n',
          },
        ],
        questions: [
          { id: 'd3-sa-1', prompt: 'For a table of students down and tests across, which gives one total per student?',
            choices: ['table.sum()', 'table.sum(axis=0)', 'table.sum(axis=1)', 'table.sum(axis=2)'], answer: 2,
            explain: 'One per student means one per row, so the columns are what collapses. axis=1 is across.' },
          { id: 'd3-sa-2', prompt: 'What does axis name?',
            choices: ['The dimension that is kept', 'The dimension that is collapsed', 'The order of the result', 'The dtype'], answer: 1,
            explain: 'It names what is removed, which is why axis=0 — the row dimension — leaves one value per column.' },
          { id: 'd3-sa-3', prompt: 'table.sum() with no axis on a 2-D array gives what?',
            choices: ['One number per row', 'One number per column', 'A single number', 'An error'], answer: 2,
            explain: 'With no axis named there is nothing left to keep, so everything collapses.' },
          { id: 'd3-sa-4', prompt: 'You expected two numbers and got three. What is the quickest diagnosis?',
            choices: ['The data is wrong', 'The axis is the wrong way round', 'numpy has a bug', 'The dtype is wrong'], answer: 1,
            explain: 'The length of the result tells you which dimension survived. This is why checking the shape beats reading the numbers.' },
        ],
      },
    ],
  },
};
