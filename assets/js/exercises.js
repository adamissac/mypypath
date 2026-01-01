(function() {
  'use strict';

  // Store correct answers for each exercise
  // Format: { "page-url": { "exercise-id": "correct answer text" } }
  const correctAnswers = {
    '/units/unit-8/what-is-debugging.html': {
      'reflection-exercise1': 'Debugging is important because it helps improve code quality, saves time by catching errors early, builds understanding of how code works, prevents future bugs, and is an essential skill for all programmers. It allows you to systematically find and fix problems.',
      'reflection-exercise2': 'The debugging process involves: 1) Reproduce the bug consistently, 2) Understand what should happen vs what actually happens, 3) Isolate the problem by testing smaller parts, 4) Fix the issue, and 5) Verify the fix works and doesn\'t break anything else.'
    },
    '/units/unit-8/common-types-errors.html': {
      'reflection-exercise1': 'The three main types of errors are: 1) Syntax errors - code structure mistakes caught before execution (e.g., missing colon, typo in keyword), 2) Runtime errors - occur during execution and stop the program (e.g., ZeroDivisionError, NameError), 3) Logical errors - code runs but produces wrong results (hardest to find). Syntax errors are easiest to fix, runtime errors show error messages, logical errors require careful debugging.',
      'reflection-exercise2': 'Common runtime errors: ZeroDivisionError (dividing by zero), NameError (undefined variable), TypeError (wrong data type operation), IndexError (list index out of range), KeyError (dictionary key doesn\'t exist), ValueError (wrong value for conversion). Prevent by validating input, checking bounds, handling edge cases, and using try-except blocks.'
    },
    '/units/unit-8/print-statements-debugging.html': {
      'reflection-exercise1': 'Print statements help debug by showing variable values at specific points, tracing program flow, confirming functions are called, and revealing what\'s happening inside code. Print variable values, function entry/exit points, loop iterations, conditional branches, and intermediate calculations to understand program behavior.',
      'reflection-exercise2': 'Place print statements at: function entry/exit to confirm calls, before/after key operations to see values change, inside loops to see iterations, at conditional branches to see which path executes, and around calculations to check intermediate results. Use prefixes like "DEBUG:" to easily find and remove them later.'
    },
    '/units/unit-8/breakpoints-debuggers.html': {
      'reflection-exercise1': 'A breakpoint is a marker that pauses program execution at a specific line. It helps by allowing you to inspect variable values without modifying code, step through code line-by-line, see the call stack, and understand program state at that moment. More powerful than print debugging because you can interactively explore code.',
      'reflection-exercise2': 'Debugger features include: variable inspection (see all variable values), call stack (see function call chain), watch expressions (monitor specific values), conditional breakpoints (pause only when condition is true), step over/into (control execution flow), and evaluate expressions (run code in debugger console). They\'re more powerful than print debugging because you can explore code interactively without modifying it.'
    },
    '/units/unit-8/understanding-tracebacks.html': {
      'reflection-exercise1': 'A traceback is Python\'s error report showing where an error occurred. It provides: error type and message (bottom line), file name and line number where error happened, function name where error occurred, the call stack showing which functions called which, and the exact code line that caused the error. Read from bottom (error) to top (call chain).',
      'reflection-exercise2': 'Common error types: NameError (undefined variable - check for typos), TypeError (wrong data type - check types match), IndexError (list index out of range - check list length), KeyError (dictionary key missing - check key exists), ValueError (wrong value - check input format), ZeroDivisionError (divide by zero - check denominator). Fix by reading error message, checking the line number, verifying variable values, and handling edge cases.'
    },
    '/units/unit-8/writing-running-tests.html': {
      'reflection-exercise1': 'Testing verifies code works correctly. It\'s important because it catches bugs before users do, verifies code works after changes, documents expected behavior, saves time long-term, and builds confidence. Assertions check if conditions are true - if false, they raise AssertionError, helping verify results match expectations.',
      'reflection-exercise2': 'Steps: 1) Name test function starting with test_, 2) Call function with test inputs, 3) Use assert to check results match expectations, 4) Run test to verify. Example: def test_add(): assert add(2,3) == 5. Test normal cases, edge cases (empty lists, zero values), and error cases.'
    },
    '/units/unit-8/introduction-unittest.html': {
      'reflection-exercise1': 'The unittest module is Python\'s built-in testing framework. It helps organize tests by providing: test classes (organize related tests), test methods (automatically discover tests starting with test_), assertion methods (assertEqual, assertTrue, etc.), test discovery (finds tests automatically), setup/teardown methods, and detailed test reports.',
      'reflection-exercise2': 'Structure: Create test class inheriting from unittest.TestCase, write test methods starting with test_, use assertion methods like self.assertEqual(), self.assertTrue(), self.assertIn(), run with unittest.main() or python -m unittest. Test classes group related tests, test methods are individual test cases that run automatically.'
    },
    '/units/unit-8/test-driven-development.html': {
      'reflection-exercise1': 'Test-Driven Development (TDD) is writing tests before code. The TDD cycle is: 1) RED - write failing test, 2) GREEN - write minimal code to pass test, 3) REFACTOR - improve code while keeping tests passing. Repeat for each feature. This ensures code is testable and tests define requirements.',
      'reflection-exercise2': 'Benefits: better design (forces thinking about interfaces), fewer bugs (catch errors immediately), confidence (tests prove code works), documentation (tests show how code should work), faster development (catch bugs early), regression prevention (tests prevent old bugs from returning). TDD improves code quality and development speed.'
    },
    '/units/unit-8/debugging-logical-runtime-errors.html': {
      'reflection-exercise1': 'Logical errors: code runs but produces wrong results (hardest to find). Runtime errors: code crashes with error messages (easier to find). Logical errors are harder because they don\'t announce themselves - you must compare expected vs actual results and trace through code to find the issue.',
      'reflection-exercise2': 'Strategies: 1) Identify expected vs actual results, 2) Trace through code step-by-step with test input, 3) Check assumptions about how code works, 4) Test edge cases (empty lists, zero, negative numbers), 5) Use print statements or debugger to see variable values at each step. Common patterns: off-by-one errors, wrong operators, missing edge cases, wrong order of operations.'
    },
    '/units/unit-8/maintaining-code-quality.html': {
      'reflection-exercise1': 'Continuous testing means running tests regularly during development, not just at the end. It\'s important because it catches bugs immediately when introduced, prevents bugs from accumulating, maintains code quality as project grows, builds confidence in codebase, and enables safe refactoring. It keeps codebase stable and reliable.',
      'reflection-exercise2': 'Maintain tests by: keeping them updated when code changes, running tests frequently after changes, fixing failing tests immediately, adding tests when bugs are found, and ensuring tests cover new features. If tests become outdated, they lose value and may give false confidence. Update tests to match current code behavior or requirements.'
    },
    '/units/unit-10/project-planning-brainstorming.html': {
      'reflection-exercise1': 'Planning is important because it clarifies goals, identifies required resources, helps plan development steps, documents project ideas, and guides decision-making. Without planning, projects have unclear direction, features don\'t fit together, projects grow out of control, time is wasted on unnecessary features, and projects are hard to finish.',
      'reflection-exercise2': 'Brainstorming techniques: identify problems you face daily, consider your interests (games, data, automation), start simple and achievable, combine concepts you\'ve learned. Example: Task Manager - Core features: add/view/complete tasks, save to file. Nice-to-have: categories, due dates. Out of scope: mobile app, cloud sync.'
    },
    '/units/unit-10/writing-project-proposal.html': {
      'reflection-exercise1': 'Key components: project title, purpose (what problem it solves), features (core functionality), technical requirements (modules/libraries needed), inputs/outputs (data flow), target users. Each component is important because it clarifies different aspects: purpose explains why, features explain what, requirements explain how, inputs/outputs explain data flow, users explain who.',
      'reflection-exercise2': 'Purpose section: start with clear problem statement, be specific about value provided. Features section: list in order of importance, start with must-have core features, then nice-to-haves. Be specific and clear. Effective proposals are well-organized, specific about requirements, and clearly explain the project\'s value.'
    },
    '/units/unit-10/structuring-python-project.html': {
      'reflection-exercise1': 'Project structure is important because it makes code easier to navigate (find code quickly), easier to maintain (changes localized), easier to test (test modules separately), and more professional (shows good practices). As projects grow, structure becomes essential for managing complexity.',
      'reflection-exercise2': 'Modules are Python files containing related functions. Create by: 1) Create .py file with related functions, 2) Write functions that work together, 3) Import in main file using import statement. Use modules to organize code, make it reusable, and separate concerns. Example: utils.py with helper functions, imported in main.py.'
    },
    '/units/unit-10/implementing-core-features.html': {
      'reflection-exercise1': 'Core features are essential functionality that makes project work - features project doesn\'t work without. Implement them first because they define what project does, ensure project is functional, allow testing of main functionality, and provide foundation for enhancements. Get core features working well before adding nice-to-haves.',
      'reflection-exercise2': 'Good strategy: start with simplest feature, test each feature before moving on, build incrementally (one feature at a time), refactor as needed. Functions help by breaking code into manageable pieces, making code reusable, making code testable, and making code easier to understand. Each function should do one thing well.'
    },
    '/units/unit-10/adding-user-interaction.html': {
      'reflection-exercise1': 'User interaction is important because it makes programs usable (users understand what to do), reliable (invalid input handled), professional (shows attention to detail), and enjoyable (better experience). Get input with input(), validate by checking input meets requirements, handle invalid input with error messages and retry, provide feedback with clear messages.',
      'reflection-exercise2': 'Good feedback: confirms actions ("Task added!"), shows results (display what happened), explains errors (what went wrong and how to fix), provides instructions (what to do next). Effective feedback is clear, helpful, and timely. Use confirmation messages, status updates, and helpful error messages.'
    },
    '/units/unit-10/error-handling-testing-code.html': {
      'reflection-exercise1': 'Error handling is important because programs don\'t crash unexpectedly, users get helpful feedback, programs work with unexpected input, and projects are more professional. Use try-except blocks: try contains code that might fail, except handles specific errors, provide helpful error messages, allow program to continue or exit gracefully.',
      'reflection-exercise2': 'Test: normal cases (expected input), edge cases (empty input, very long input, boundary values), error cases (invalid input, missing files). Edge cases are unusual but valid inputs that might cause problems. Thorough testing ensures project works reliably in all situations.'
    },
    '/units/unit-10/polishing-visuals-output-formatting.html': {
      'reflection-exercise1': 'Output formatting is important because it makes output readable (users understand quickly), professional (shows attention to detail), enjoyable (better experience), and impressive (demonstrates quality). Use f-strings for formatting, alignment for tables, separators for sections, and consistent spacing.',
      'reflection-exercise2': 'Formatting techniques: f-strings with alignment ({name:<20} for left, {age:>10} for right), tables with consistent column widths, separators (="*50) for visual breaks, numbered lists with enumerate(), consistent spacing and indentation. Good formatting makes output clear and professional without fancy libraries.'
    },
    '/units/unit-10/writing-documentation-comments.html': {
      'reflection-exercise1': 'Documentation is important because you remember your own code later, others can understand and use your code, it shows professionalism, and saves time explaining code. Comments explain why code does something (not what - code should be self-documenting). Docstrings document functions/modules with purpose, parameters, return values, and examples.',
      'reflection-exercise2': 'README should include: project title and description, features list, installation instructions, usage instructions, requirements. It\'s important because it explains project to users, helps others understand and use your project, shows professionalism, and serves as project documentation. Clear README makes project accessible.'
    },
    '/units/unit-10/presenting-your-project.html': {
      'reflection-exercise1': 'Presentation structure: 1) Introduction (what project is, problem it solves), 2) Demo (show project running, demonstrate features), 3) Technical details (briefly explain how it works, highlight interesting code), 4) Conclusion (what you learned, what\'s next). This structure clearly communicates your work.',
      'reflection-exercise2': 'Key points: problem (what problem does it solve?), solution (how does it solve it?), features (what can users do?), technology (what Python concepts used?), challenges (what was difficult, how overcome?), learning (what did you learn?). Covering these points gives complete picture of your project.'
    },
    '/units/unit-10/reflection-next-steps.html': {
      'reflection-exercise1': 'Reflection helps recognize growth, identify what worked well, understand what to improve, and plan next steps. Growth includes: skills developed (problem-solving, debugging), knowledge gained (Python concepts), confidence built (can build programs), experience earned (completed real project). Reflection is valuable for continued learning.',
      'reflection-exercise2': 'Next steps: expand project (add features, improve code), build more projects (apply learning to new challenges), learn advanced topics (web dev, data science), share work (GitHub, get feedback). Continue learning by building projects, exploring new Python areas, and practicing regularly. Keep growing as a programmer!'
    },
    '/units/unit-9/recursion-problem-decomposition.html': {
      'reflection-exercise1': 'The two essential components are: 1) Base case - the stopping condition that prevents infinite recursion, and 2) Recursive case - the part that calls the function again with a smaller problem. The base case is crucial to stop recursion, and the recursive case breaks the problem into smaller subproblems.',
      'reflection-exercise2': 'Recursion helps with problem decomposition by breaking big problems into smaller, similar problems. For example, to sum a list, you can think: sum of [1,2,3] = 1 + sum of [2,3], and sum of [2,3] = 2 + sum of [3], continuing until the base case of an empty list.'
    },
    '/units/unit-9/working-with-external-libraries.html': {
      'reflection-exercise1': 'Built-in libraries come with Python and work immediately (like math, random, datetime). External libraries need to be installed with pip first (like requests, matplotlib). Examples: math is built-in, requests is external.',
      'reflection-exercise2': 'Ways to import: 1) Full import: import math (use as math.sqrt), 2) Specific import: from math import sqrt (use directly as sqrt), 3) Alias: import math as m (use as m.sqrt), 4) Multiple: from math import sqrt, pi. Use full import for clarity, specific import to avoid namespace pollution.'
    },
    '/units/unit-9/introduction-json-data-parsing.html': {
      'reflection-exercise1': 'JSON is a lightweight data format for exchanging data between programs. It\'s commonly used because it\'s human-readable, easy to parse, language-independent, and widely supported. Main data types: strings, numbers, booleans, objects, arrays, and null.',
      'reflection-exercise2': 'json.loads() parses a JSON string to a Python object. json.load() reads JSON from a file and parses it. Use loads() for strings, load() for files. Similarly, dumps() converts to string, dump() writes to file.'
    },
    '/units/unit-9/working-with-dates-times.html': {
      'reflection-exercise1': 'Main classes: datetime (date and time together), date (just date), time (just time), timedelta (time differences). datetime represents full timestamps, date represents calendar dates, time represents time of day, timedelta represents durations.',
      'reflection-exercise2': '30 days from now: datetime.now() + timedelta(days=30). Format as "January 15, 2024": date.strftime("%B %d, %Y") where %B is full month name, %d is day, %Y is 4-digit year.'
    },
    '/units/unit-9/apis-data-retrieval.html': {
      'reflection-exercise1': 'An API (Application Programming Interface) is a way for programs to communicate. It works by: 1) Your program sends a request to an API endpoint, 2) The API processes the request, 3) The API sends back data (usually JSON), 4) Your program uses the data. Basic steps: import requests library, use requests.get() with the API URL, check status_code, and parse JSON response.',
      'reflection-exercise2': 'A GET request retrieves data from a server. It\'s used to fetch information without modifying anything. Status code 200 indicates success. Other codes: 404 (not found), 400 (bad request), 500 (server error).'
    },
    '/units/unit-9/efficiency-big-o-basics.html': {
      'reflection-exercise1': 'Big-O notation describes how algorithm performance changes as input size grows. It shows the worst-case time complexity. Examples: O(1) - accessing a list element (constant time), O(n) - looping through a list (linear time, grows with input size).',
      'reflection-exercise2': 'Efficiency is important because faster programs provide better user experience, efficient code uses less memory, scales better with larger data, can handle more users or data, and saves computational resources. Writing efficient code is crucial for production applications.'
    },
    '/units/unit-9/data-visualization-matplotlib.html': {
      'reflection-exercise1': 'Data visualization is important because it makes data easier to understand, helps spot trends and patterns, communicates findings effectively, and enables data-driven decisions. Use line plots for trends over time, bar charts for comparing categories, scatter plots for relationships between variables, and histograms for distributions.',
      'reflection-exercise2': 'Basic steps: 1) Import matplotlib.pyplot as plt, 2) Prepare your data (x and y values), 3) Create plot with plt.plot(), plt.bar(), or plt.scatter(), 4) Add labels with plt.xlabel() and plt.ylabel(), 5) Add title with plt.title(), 6) Display with plt.show().'
    },
    '/units/unit-9/basic-automation-python.html': {
      'reflection-exercise1': 'Automation is using code to perform repetitive tasks automatically. It\'s useful because it saves time, reduces errors, handles repetitive work, works 24/7, and provides consistent results. Examples: renaming files, cleaning data, sending emails, processing reports, backing up files.',
      'reflection-exercise2': 'Repetitive tasks that could be automated: file organization, data entry, report generation, email sending, web scraping, data processing, backup tasks, bulk file operations, scheduled tasks, and data cleaning.'
    },
    '/units/unit-9/introduction-file-formats.html': {
      'reflection-exercise1': 'CSV files store tabular data with comma-separated values - simple, text-based, good for spreadsheets. JSON files store structured data as text - hierarchical, good for APIs and configs. Excel files (.xlsx) are binary spreadsheet files - complex formatting, good for rich spreadsheets. Use CSV for simple tables, JSON for structured data exchange, Excel for complex spreadsheets with formatting.',
      'reflection-exercise2': 'Read CSV: import csv, use csv.reader() or csv.DictReader(). Write CSV: use csv.writer() or csv.DictWriter(). For Excel files, use pandas library: pd.read_excel() to read, df.to_excel() to write. Install with: pip install pandas openpyxl.'
    },
    '/units/unit-9/applying-advanced-concepts.html': {
      'reflection-exercise1': 'To build a data collection system: 1) Use requests library to send GET requests to APIs, 2) Parse JSON responses with json.loads(), 3) Process and clean the data, 4) Save to files using csv or json modules, 5) Automate with loops and error handling. This combines API calls, JSON parsing, and file handling into one integrated system.',
      'reflection-exercise2': 'Project idea: Weather data collector - Use APIs to fetch weather data, parse JSON responses, store in CSV files, visualize with matplotlib, automate daily collection, and handle errors with try-except. This combines APIs, JSON, file handling, visualization, automation, and error handling.'
    }
  };

  function qs(sel, parent) { return (parent || document).querySelector(sel); }
  function qsa(sel, parent) { return Array.from((parent || document).querySelectorAll(sel)); }

  function getCurrentPagePath() {
    return window.location.pathname;
  }

  function getExerciseAnswers() {
    const pagePath = getCurrentPagePath();
    return correctAnswers[pagePath] || {};
  }

  function saveAnswer(exerciseId, answer) {
    const pagePath = getCurrentPagePath();
    const key = `exercise_${pagePath}_${exerciseId}`;
    try {
      localStorage.setItem(key, answer);
    } catch (e) {
      console.warn('Could not save answer:', e);
    }
  }

  function loadAnswer(exerciseId) {
    const pagePath = getCurrentPagePath();
    const key = `exercise_${pagePath}_${exerciseId}`;
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      console.warn('Could not load answer:', e);
      return '';
    }
  }

  function showSavedIndicator(button) {
    const indicator = button.querySelector('.saved-indicator') || document.createElement('span');
    if (!indicator.classList.contains('saved-indicator')) {
      indicator.className = 'saved-indicator';
      button.appendChild(indicator);
    }
    indicator.textContent = 'Saved!';
    indicator.classList.add('show');
    setTimeout(() => {
      indicator.classList.remove('show');
      setTimeout(() => {
        indicator.textContent = '';
      }, 300);
    }, 2000);
  }

  function compareAnswers(userAnswer, correctAnswer) {
    if (!userAnswer.trim() || !correctAnswer.trim()) {
      return false;
    }
    
    // Normalize answers for comparison
    const normalize = (str) => {
      return str.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    const userNormalized = normalize(userAnswer);
    const correctNormalized = normalize(correctAnswer);
    
    // Check if user answer contains key concepts (at least 60% similarity)
    const userWords = userNormalized.split(' ');
    const correctWords = correctNormalized.split(' ');
    const commonWords = userWords.filter(word => correctWords.includes(word) && word.length > 3);
    const similarity = commonWords.length / Math.max(userWords.length, correctWords.length);
    
    return similarity >= 0.6 || userNormalized.includes(correctNormalized.substring(0, Math.min(50, correctNormalized.length)));
  }

  // Alias for consistency
  function initExercises() {
    return initializeExercises();
  }

  function initializeExercises() {
    const exerciseItems = document.querySelectorAll('.exercise-item');
    
    exerciseItems.forEach((item, index) => {
      const textarea = item.querySelector('.reflection-input');
      if (!textarea) return;
      
      const exerciseId = textarea.id;
      if (!exerciseId) return;
      
      // Load saved answer
      const savedAnswer = loadAnswer(exerciseId);
      if (savedAnswer) {
        textarea.value = savedAnswer;
      }
      
      // Create action buttons container
      let actionsContainer = item.querySelector('.exercise-actions');
      if (!actionsContainer) {
        actionsContainer = document.createElement('div');
        actionsContainer.className = 'exercise-actions';
        textarea.parentNode.insertBefore(actionsContainer, textarea.nextSibling);
      }
      
      // Create submit button
      let submitBtn = actionsContainer.querySelector('.submit-btn');
      if (!submitBtn) {
        submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary btn-save submit-btn';
        submitBtn.textContent = 'Save Answer';
        submitBtn.type = 'button';
        actionsContainer.appendChild(submitBtn);
      }
      
      // Create show answer button
      let showAnswerBtn = actionsContainer.querySelector('.show-answer-btn');
      if (!showAnswerBtn) {
        showAnswerBtn = document.createElement('button');
        showAnswerBtn.className = 'btn btn-ghost btn-show-answer show-answer-btn';
        showAnswerBtn.textContent = 'Show Answer';
        showAnswerBtn.type = 'button';
        actionsContainer.appendChild(showAnswerBtn);
      }
      
      // Create correct answer display
      let answerDisplay = item.querySelector('.correct-answer');
      if (!answerDisplay) {
        answerDisplay = document.createElement('div');
        answerDisplay.className = 'correct-answer';
        const answerTitle = document.createElement('h4');
        answerTitle.textContent = 'Correct Answer:';
        answerDisplay.appendChild(answerTitle);
        const answerContent = document.createElement('div');
        answerContent.className = 'correct-answer-content';
        answerDisplay.appendChild(answerContent);
        actionsContainer.parentNode.insertBefore(answerDisplay, actionsContainer.nextSibling);
      }
      
      // Create feedback display
      let feedbackDisplay = item.querySelector('.answer-feedback');
      if (!feedbackDisplay) {
        feedbackDisplay = document.createElement('div');
        feedbackDisplay.className = 'answer-feedback';
        answerDisplay.parentNode.insertBefore(feedbackDisplay, answerDisplay.nextSibling);
      }
      
      const answers = getExerciseAnswers();
      const correctAnswer = answers[exerciseId];
      
      // If no specific answer exists, still show the button but with a generic message
      if (!correctAnswer) {
        showAnswerBtn.textContent = 'View Sample Answer';
        const answerContent = answerDisplay.querySelector('.correct-answer-content');
        answerContent.textContent = 'Answers may vary. Review the lesson content and compare your understanding with the key concepts covered.';
      }
      
      // Submit button handler
      submitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const userAnswer = textarea.value.trim();
        if (!userAnswer) {
          alert('Please enter an answer before saving.');
          return;
        }
        
        saveAnswer(exerciseId, userAnswer);
        showSavedIndicator(submitBtn);
        
        // Show comparison feedback if answer is available
        if (correctAnswer) {
          const matches = compareAnswers(userAnswer, correctAnswer);
          feedbackDisplay.textContent = matches 
            ? 'Your answer matches well with the correct answer!'
            : 'Your answer is saved. Compare it with the correct answer to see how you did.';
          feedbackDisplay.className = `answer-feedback show ${matches ? 'match' : 'no-match'}`;
        }
      });
      
      // Show answer button handler (always available)
      showAnswerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const answerContent = answerDisplay.querySelector('.correct-answer-content');
        if (correctAnswer) {
          answerContent.textContent = correctAnswer;
        } else {
          answerContent.textContent = 'Answers may vary. Review the lesson content and compare your understanding with the key concepts covered. Focus on demonstrating your understanding of the key points discussed in the lesson.';
        }
        answerDisplay.classList.add('show');
        
        // Compare if user has an answer and correct answer exists
        const userAnswer = textarea.value.trim();
        if (userAnswer && correctAnswer) {
          const matches = compareAnswers(userAnswer, correctAnswer);
          feedbackDisplay.textContent = matches 
            ? 'Great job! Your answer matches well with the correct answer.'
            : 'Compare your answer with the correct answer above. Both approaches may be valid!';
          feedbackDisplay.className = `answer-feedback show ${matches ? 'match' : 'no-match'}`;
        } else if (userAnswer) {
          feedbackDisplay.textContent = 'Your answer is saved. Review the lesson content to ensure you\'ve covered the key concepts.';
          feedbackDisplay.className = 'answer-feedback show no-match';
        }
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExercises);
  } else {
    initializeExercises();
  }
})();

