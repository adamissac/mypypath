/* PyPath — end-of-unit test questions, drawn for a teacher.
 *
 * Two places on the dashboard show test questions, and they must show them
 * the same way: the question pool for a unit (every question a test can draw)
 * and one student's actual paper (the ten it did draw, with what they
 * answered). Both come through here.
 *
 * Read-only, and teacher-facing only. Nothing here is loaded on a page a
 * student sits a test on. The pools themselves are public files the test page
 * already fetches, so showing their answers to a teacher reveals nothing a
 * student could not already read; it is simply the first time the teacher can
 * read them without opening JSON.
 */

const DATA_DIR = '/assets/data/unit-tests/';
const cache = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

// Same tolerance as unit-test-page.js: a pool file may be a bare array or an
// object wrapping one.
function questionList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['questions', 'items', 'mcq', 'frq', 'pool']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [];
}

async function fetchList(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return questionList(await res.json());
}

/* Both pools for one unit of one course. `course` is 'units' (Foundations) or
   'data' (Python for Data), matching unit-test-page.js's COURSES. */
export function loadPools(unit, course) {
  const dir = DATA_DIR + (course === 'data' ? 'data/' : '');
  const key = dir + unit;
  if (!cache.has(key)) {
    const loading = Promise.all([
      fetchList(dir + 'unit-' + unit + '-mcq.json'),
      fetchList(dir + 'unit-' + unit + '-frq.json'),
    ]).then(([mcq, frq]) => ({ mcq, frq }));
    // A failed fetch is not remembered, so the next try can succeed.
    loading.catch(() => cache.delete(key));
    cache.set(key, loading);
  }
  return cache.get(key);
}

export function byId(pool, id) {
  return (pool || []).filter((q) => q && q.id === id)[0] || null;
}

function code(source) {
  const pre = el('pre', 'sd-code');
  pre.appendChild(el('code', null, source));
  return pre;
}

/* One multiple choice question with its answer marked.
 *
 * `given` is undefined for the pool view (no student), null for a question the
 * student skipped, or the index they chose. The right answer is named in
 * words, never by colour alone, so it survives a printout. */
export function mcqNode(question, number, given) {
  const item = el('li', 'tp-q');
  const answered = given !== undefined;
  const right = answered && given !== null && Number(given) === Number(question.answer);
  if (answered) item.classList.add(right ? 'is-right' : 'is-wrong');

  const head = el('p', 'tp-q__prompt');
  head.appendChild(el('strong', null, 'Q' + number + '. '));
  head.appendChild(document.createTextNode(question.prompt || ''));
  item.appendChild(head);
  if (typeof question.code === 'string' && question.code) item.appendChild(code(question.code));

  const choices = el('ol', 'tp-choices');
  (question.choices || []).forEach((choice, i) => {
    const li = el('li', 'tp-choice');
    li.appendChild(document.createTextNode(choice));
    const tags = [];
    if (i === Number(question.answer)) {
      li.classList.add('is-answer');
      tags.push('correct answer');
    }
    if (answered && given !== null && i === Number(given)) {
      li.classList.add('is-given');
      tags.push('student chose this');
    }
    if (tags.length) li.appendChild(el('span', 'tp-tag', ' (' + tags.join(', ') + ')'));
    choices.appendChild(li);
  });
  item.appendChild(choices);

  if (answered) {
    item.appendChild(el('p', 'tp-q__verdict',
      given === null ? 'Skipped.' : right ? 'Right.' : 'Wrong.'));
  }
  if (question.explain) item.appendChild(el('p', 'tp-q__explain', question.explain));
  return item;
}

function formatArg(value) {
  try { return JSON.stringify(value); } catch (e) { return String(value); }
}

/* The free response question. With a student's paper it also shows their code
   and how many cases it passed; the code is exactly what they submitted, cut at
   the same length the record keeps. */
export function frqNode(frq, paper) {
  const box = el('section', 'tp-frq');
  box.appendChild(el('p', 'tp-q__prompt', 'Free response: ' + (frq.title || frq.id)));
  box.appendChild(el('p', null, frq.prompt || ''));
  if (frq.entry) box.appendChild(el('p', null, 'Must define a function named ' + frq.entry + '.'));

  const cases = (frq.cases || []);
  if (cases.length) {
    const list = el('ul', 'tp-cases');
    for (const c of cases) {
      list.appendChild(el('li', null,
        (frq.entry || 'f') + '(' + (c.args || []).map(formatArg).join(', ') + ') returns '
        + formatArg(c.expect) + (c.hidden === true ? ' (hidden from students)' : '')));
    }
    box.appendChild(list);
  }

  if (paper) {
    box.appendChild(el('p', 'tp-q__verdict',
      'Passed ' + paper.frqPassed + ' of ' + paper.frqTotal + ' cases.'));
    box.appendChild(el('p', null, 'The student\'s answer:'));
    box.appendChild(code(paper.frqCode || '(nothing submitted)'));
  } else if (frq.starter) {
    box.appendChild(el('p', null, 'Starter code students are given:'));
    box.appendChild(code(frq.starter));
  }
  return box;
}

/* A whole pool, for the dashboard's "Test questions" picker. */
export function poolNode(pools) {
  const wrap = el('div', 'tp-pool');
  const mcq = el('ol', 'tp-list');
  pools.mcq.forEach((q, i) => mcq.appendChild(mcqNode(q, i + 1)));
  wrap.appendChild(el('h3', null, pools.mcq.length + ' multiple choice questions'));
  wrap.appendChild(mcq);
  wrap.appendChild(el('h3', null, pools.frq.length + ' coding questions'));
  for (const frq of pools.frq) wrap.appendChild(frqNode(frq));
  return wrap;
}

/* One student's sitting. Questions that have since left the pool are said to
   be missing rather than silently dropped, so the numbering still matches the
   paper the student saw. */
export function paperNode(pools, paper, label) {
  const details = document.createElement('details');
  details.className = 'tp-paper';
  const summary = document.createElement('summary');
  summary.textContent = label;
  details.appendChild(summary);

  const list = el('ol', 'tp-list');
  paper.mcqIds.forEach((id, i) => {
    const q = byId(pools.mcq, id);
    if (q) list.appendChild(mcqNode(q, i + 1, paper.answers[i] === undefined ? null : paper.answers[i]));
    else list.appendChild(el('li', 'tp-q', 'Q' + (i + 1) + '. Question ' + id + ' is no longer in the pool.'));
  });
  details.appendChild(list);

  const frq = byId(pools.frq, paper.frqId);
  if (frq) details.appendChild(frqNode(frq, paper));
  return details;
}
