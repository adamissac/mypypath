/* Shared authored Unit 1 material. Data lessons consume this during their build;
 * Foundations uses build-intro-lessons.cjs to update its marked HTML section. */
const entries = require('./intro-lesson-enrichment.json');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function questions(entry) {
  const prefix = `intro-${entry.course}-${entry.slug}`;
  const right = entry.pairs.map(pair => pair[1]);
  right.push(right.shift());
  return [
    {id: `${prefix}-match`, kind: 'match', prompt: 'Match each idea to its meaning.',
      left: entry.pairs.map(pair => pair[0]), right,
      answer: entry.pairs.map((_, i) => (i + right.length - 1) % right.length),
      hint: entry.hint, afterSection: entry.placements[entry.placements.length - 1],
      explain: entry.pairs.map(pair => `${pair[0]}: ${pair[1]}.`).join(' ')},
    {id: `${prefix}-order`, kind: 'order', prompt: 'Arrange these steps in the intended order.',
      items: entry.order, answer: entry.order.map((_, i) => i), hint: 'Find the first step that does not depend on any earlier result. Then follow each dependency.', explain: entry.orderwhy},
    {id: `${prefix}-predict`, kind: 'blank', label: 'Predict the first line of output (without surrounding quotes).',
      prompt: `${entry.code}\n\nFirst output line: ___`,
      blanks: [{accept: [entry.output.split('\n')[0]], caseSensitive: true}], hint: 'Trace each line in order and write down the current values. Stop at the first print call.', explain: entry.trace}
  ];
}
function markup(entry) {
  return `<section class="content-section lesson-deep-dive">
<h2>Go deeper: ${esc(entry.title)}</h2>
<p>${esc(entry.model)}</p>
<h3>Trace the example</h3>
<p>Predict the output before opening the explanation.</p>
<pre class="code"><code>${esc(entry.code)}</code></pre>
<details class="worked-answer"><summary>Show the output and trace</summary>
<pre class="checkpoint-output" aria-label="Expected output">${esc(entry.output)}</pre>
<p>${esc(entry.trace)}</p></details>
<h3>A mistake to watch for</h3>
<p>${esc(entry.mistake)}</p>
<h3>Transfer challenge</h3>
<p>${esc(entry.challenge)}</p>
<p>Change the example below to solve the challenge. Predict the result, run your code, and compare. This practice is ungraded.</p>
<div class="interactive-editor" data-editor-id="practice-transfer">
<div class="editor-toolbar-small">
<button class="btn-run" onclick="runEditorCode('practice-transfer')">Run code</button>
<button class="btn-reset" onclick="resetEditor('practice-transfer', ${esc(JSON.stringify(entry.code))})">Reset code</button>
<button class="btn-clear" onclick="clearSaved('practice-transfer')">Clear saved code</button>
</div>
<textarea class="code-editor-small" id="editor-practice-transfer">${esc(entry.code)}</textarea>
<div class="editor-output" id="output-practice-transfer"><div class="output-placeholder">Press Run to see output</div></div>
</div>
<details class="worked-answer"><summary>Compare with a worked solution</summary>
<pre class="code"><code>${esc(entry.solution)}</code></pre>
<p>Run both versions. Explain any difference in their output, then change one input and predict the new result.</p></details>
</section>`;
}
module.exports = {entries, questions, markup};
