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
      explain: entry.pairs.map(pair => `${pair[0]}: ${pair[1]}.`).join(' ')},
    {id: `${prefix}-order`, kind: 'order', prompt: 'Arrange these steps in the intended order.',
      items: entry.order, answer: entry.order.map((_, i) => i), explain: entry.orderwhy},
    {id: `${prefix}-predict`, kind: 'blank', label: 'Predict the first line of output (without surrounding quotes).',
      prompt: `${entry.code}\n\nFirst output line: ___`,
      blanks: [{accept: [entry.output.split('\n')[0]], caseSensitive: true}], explain: entry.trace}
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
<p>Try your solution in a lesson editor before opening the worked answer. This practice is ungraded.</p>
<details class="worked-answer"><summary>Compare with a worked solution</summary>
<pre class="code"><code>${esc(entry.solution)}</code></pre>
<p>Run both versions. Explain any difference in their output, then change one input and predict the new result.</p></details>
</section>`;
}
module.exports = {entries, questions, markup};
