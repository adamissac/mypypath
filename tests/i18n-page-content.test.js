import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { collectPageContent, parseTranslatedUnit, bindPageContent } from '../assets/i18n/page-content.js';

describe('page translation without changing application state', () => {
  it('translates sentences around inline code and restores the same interactive nodes', () => {
    const dom = new JSDOM('<html><head><title>Python lesson</title></head><body><p>Use <code>print()</code> to display text.</p><input value="My work"><pre>print("Hello")</pre></body></html>');
    const d = dom.window.document;
    const entries = collectPageContent(d);
    const paragraph = entries.find(x => x.source.includes('to display'));
    expect(paragraph.source).toContain('class="notranslate"');
    const code = d.querySelector('code');
    const binding = bindPageContent(d, entries);
    const translations = {};
    translations[paragraph.source] = parseTranslatedUnit(d, '<div>Pour afficher du texte, utilisez <span id="t0" class="notranslate">print()</span>.</div>', paragraph);
    binding.apply(translations);
    expect(d.querySelector('p').textContent).toBe('Pour afficher du texte, utilisez print().');
    expect(d.querySelector('code')).toBe(code);
    expect(d.querySelector('input').value).toBe('My work');
    expect(d.querySelector('pre').textContent).toBe('print("Hello")');
    binding.apply({});
    expect(d.querySelector('p').textContent).toBe('Use print() to display text.');
  });

  it('rejects injected markup and lost or duplicate inline placeholders', () => {
    const d = new JSDOM('<p>Use <code>print()</code> now.</p>').window.document;
    const unit = collectPageContent(d)[0];
    for (const html of ['<div><img src=x onerror=alert(1)></div>', '<div>Missing token</div>', '<div><span id="t0">x</span><span id="t0">x</span></div>']) {
      expect(() => parseTranslatedUnit(d, html, unit)).toThrow();
    }
  });

  it('leaves user content and runtime changes alone', () => {
    const d = new JSDOM('<p>Loading status</p><div contenteditable>My essay</div><textarea>My code</textarea><span data-account-username>Adam</span>').window.document;
    const entries = collectPageContent(d);
    expect(entries).toHaveLength(1);
    const binding = bindPageContent(d, entries);
    d.querySelector('p').textContent = 'Student supplied title';
    binding.apply({[entries[0].source]: ['Translated']});
    expect(d.querySelector('p').textContent).toBe('Student supplied title');
  });

  it('translates attributes as plain text and never modifies input values or URLs', () => {
    const d = new JSDOM('<input placeholder="Your email" value="me@example.com"><a href="/lesson.html" title="Open lesson">Lesson</a>').window.document;
    const entries = collectPageContent(d);
    const placeholder = entries.find(x => x.attribute === 'placeholder');
    bindPageContent(d, entries).apply({[placeholder.source]: ['Votre adresse']});
    expect(d.querySelector('input').placeholder).toBe('Votre adresse');
    expect(d.querySelector('input').value).toBe('me@example.com');
    expect(d.querySelector('a').getAttribute('href')).toBe('/lesson.html');
  });
});
