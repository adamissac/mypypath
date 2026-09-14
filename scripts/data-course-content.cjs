/* Lesson content for Python for Data, one file per unit.
 *
 * scripts/build-data-course.cjs turns this into pages, check files and the
 * manifest; the lesson schema is documented at the top of that file and in
 * .claude/skills/pypath-lesson-authoring. Every lesson carries objectives, a
 * why-this-matters, stepwise sections, mini practices placed between them, and
 * two or more graded exercises, each with a correct and a wrong answer that
 * tests/checks-data-course.test.js runs against real Python.
 *
 * Units 1 and 2 are pure standard library on purpose: they are free, and a
 * signed-out visitor should never pay for the numpy and pandas wheels. Units 3
 * onward use numpy and pandas, which the Run button loads on demand
 * (assets/js/pyodide-loader.js).
 */
module.exports = {
  ...require('./data-course-unit-1.cjs'),
  ...require('./data-course-unit-2.cjs'),
  ...require('./data-course-unit-3.cjs'),
  ...require('./data-course-unit-4.cjs'),
  ...require('./data-course-unit-5.cjs'),
  ...require('./data-course-unit-6.cjs'),
  ...require('./data-course-unit-7.cjs'),
  ...require('./data-course-unit-8.cjs'),
  ...require('./data-course-unit-9.cjs'),
  ...require('./data-course-unit-10.cjs'),
};
