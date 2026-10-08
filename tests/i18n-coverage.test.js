import { describe, expect, it } from 'vitest';
import { inventoryHtml, inventoryJson, assessCoverage } from '../scripts/lib/i18n-coverage.mjs';

describe('whole-site translation coverage', () => {
  it('exports prose and accessibility text without executable code or user input', () => {
    const entries = inventoryHtml(`<title>Learn Python</title><p>Use <code>print()</code> to display text.</p>
      <button aria-label="Run example">Run</button><pre>print('hello')</pre>
      <textarea>student answer</textarea><div contenteditable>student name</div>
      <script>const secret = 'not prose';</script><div data-no-translate>class code</div>`, 'lesson.html');
    const texts = entries.map(x => x.text);
    expect(texts).toEqual(['Learn Python', 'Use', 'to display text.', 'Run example', 'Run']);
    expect(entries.every(x => x.file === 'lesson.html' && x.line > 0)).toBe(true);
  });

  it('does not mistake a marked parent with inline elements for runtime coverage', () => {
    const entries = inventoryHtml('<p data-i18n="intro">Use <code>print()</code> now.</p><span data-i18n="run">Run</span>', 'lesson.html');
    expect(entries.filter(x => x.key).map(x => x.key)).toEqual(['run']);
    expect(entries.filter(x => !x.key).map(x => x.text)).toEqual(['Use', 'now.']);
  });

  it('records quiz prose separately from ambiguous answers and never exports grading state', () => {
    const entries = inventoryJson([{ id: 'q1', prompt: 'What is a list?', choices: ['A collection', 'list()'], answer: 0, code: 'print(1)', explain: 'Lists store items.' }], 'quiz.json');
    expect(entries.filter(x => x.kind === 'prose').map(x => x.text)).toEqual(['What is a list?', 'Lists store items.']);
    expect(entries.filter(x => x.kind === 'needs-classification').map(x => x.text)).toEqual(['A collection', 'list()']);
    expect(entries.map(x => x.text)).not.toContain('q1');
    expect(entries.map(x => x.text)).not.toContain('print(1)');
  });

  it('rejects a ready language with only shell translations and missing lesson hooks', () => {
    const entries = inventoryHtml('<p>Lesson content</p><button data-i18n="run">Run</button>', 'lesson.html');
    const result = assessCoverage(entries, { run: 'Run' }, { run: 'Exécuter' });
    expect(result.unwired).toBe(1);
    expect(result.ready).toBe(false);
  });

  it('rejects missing translations, source drift, and lost interpolation tokens', () => {
    const entries = inventoryHtml('<span data-i18n="greeting">Hello {name}</span>', 'account.html');
    expect(assessCoverage(entries, { greeting: 'Hello {name}' }, {}).ready).toBe(false);
    expect(assessCoverage(entries, { greeting: 'Hello {name}' }, { greeting: 'Bonjour' }).ready).toBe(false);
    expect(assessCoverage(entries, { greeting: 'Old text' }, { greeting: 'Bonjour {name}' }).ready).toBe(false);
    expect(assessCoverage(entries, { greeting: 'Hello {name}' }, { greeting: 'Bonjour {name}' }).ready).toBe(true);
  });
});
