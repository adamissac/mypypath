const excluded = 'script,style,pre,code,kbd,samp,textarea,svg,option:not([value]),[contenteditable]:not([contenteditable="false"]),[data-no-translate],[translate="no"],[data-account-username],[data-account-photo],.cm-editor,.CodeMirror';
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readable = value => /\p{L}/u.test(value);

function selectorFor(element) {
  const parts = [];
  for (let node = element; node && node.tagName !== 'HTML'; node = node.parentElement) {
    const siblings = Array.from(node.parentElement.children).filter(sibling => sibling.tagName === node.tagName);
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
  }
  return 'html > ' + parts.join(' > ');
}

function sentence(element) {
  let token = 0;
  let source = '';
  for (const node of element.childNodes) {
    if (node.nodeType === 3) source += escape(node.nodeValue);
    else source += `<span id="t${token++}" class="notranslate">${escape(node.nodeType === 1 ? normalize(node.textContent) : '')}</span>`;
  }
  return { source: `<div>${source}</div>`, tokens: token };
}

export function collectPageContent(document) {
  const entries = [];
  for (const element of document.querySelectorAll('body *, head > title')) {
    if (element.closest(excluded)) continue;
    const selector = selectorFor(element);
    const directText = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.nodeValue).join('');
    if (!element.hasAttribute('data-i18n') && readable(directText)) {
      entries.push({ selector, ...sentence(element) });
    }
    for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = element.getAttribute(attribute);
      if (value && readable(value) && !element.hasAttribute(`data-i18n-${attribute}`)) {
        entries.push({ selector, attribute, source: `<div>${escape(value)}</div>`, tokens: 0, original: value });
      }
    }
  }
  return entries;
}

// Azure markup is parsed, never inserted into the live document. Only strings
// and references to existing nodes survive validation.
export function parseTranslatedUnit(document, html, entry) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const outer = Array.from(template.content.childNodes).filter(node => node.nodeType !== 3 || node.textContent.trim());
  if (outer.length !== 1 || outer[0].nodeName !== 'DIV' || outer[0].attributes.length) throw new Error('Invalid translation wrapper');
  const parts = [], seen = new Set();
  for (const node of outer[0].childNodes) {
    if (node.nodeType === 3) { parts.push(node.nodeValue); continue; }
    if (node.nodeName !== 'SPAN' || !/^t\d+$/.test(node.id) || Array.from(node.attributes).some(a => !['id','class'].includes(a.name))) throw new Error('Unexpected translated markup');
    const index = Number(node.id.slice(1));
    if (index >= entry.tokens || seen.has(index)) throw new Error('Invalid inline token');
    seen.add(index);
    parts.push({ token: index });
  }
  if (seen.size !== entry.tokens) throw new Error('Missing inline token');
  return parts;
}

export function bindPageContent(document, entries) {
  const bindings = [];
  for (const entry of entries) {
    const element = document.querySelector(entry.selector);
    if (!element || element.closest(excluded)) continue;
    if (entry.attribute) {
      if (element.getAttribute(entry.attribute) !== entry.original) continue;
      bindings.push({ entry, element, last: entry.original });
    } else {
      if (sentence(element).source !== entry.source) continue;
      const originals = Array.from(element.childNodes).map(node => ({ node, value: node.nodeValue }));
      bindings.push({ entry, element, originals, tokens: originals.filter(item => item.node.nodeType !== 3).map(item => item.node), last: Array.from(element.childNodes), lastText: originals.map(item => item.value) });
    }
  }
  return {
    apply(translations, locale = 'en') {
      for (const binding of bindings) {
        const { entry, element, originals, tokens } = binding;
        const translated = translations[entry.key || entry.source];
        if (entry.attribute) {
          if (element.getAttribute(entry.attribute) !== binding.last) continue;
          if (translated && (!Array.isArray(translated) || translated.some(part => typeof part !== 'string'))) continue;
          binding.last = translated ? translated.join('') : entry.original;
          element.setAttribute(entry.attribute, binding.last);
          element.lang = translated ? locale : 'en';
          continue;
        }
        const current = Array.from(element.childNodes);
        if (current.length !== binding.last.length || current.some((node, i) => node !== binding.last[i] || (node.nodeType === 3 && node.nodeValue !== binding.lastText[i]))) continue;
        if (translated) {
          if (!Array.isArray(translated)) continue;
          const refs = translated.filter(part => typeof part !== 'string');
          if (refs.length !== tokens.length || new Set(refs.map(part => part?.token)).size !== tokens.length || refs.some(part => !Number.isInteger(part?.token) || part.token < 0 || part.token >= tokens.length)) continue;
          element.replaceChildren(...translated.map(part => typeof part === 'string' ? document.createTextNode(part) : tokens[part.token]));
        } else {
          for (const item of originals) if (item.node.nodeType === 3) item.node.nodeValue = item.value;
          element.replaceChildren(...originals.map(item => item.node));
        }
        binding.last = Array.from(element.childNodes);
        binding.lastText = binding.last.map(node => node.nodeValue);
        element.lang = translated ? locale : 'en';
      }
    }
  };
}
