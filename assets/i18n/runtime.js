export function startI18n(bootstrap) {
  'use strict';

  var STORAGE_KEY = 'pypath.locale';
  var ENGLISH = 'en';
  var registry = bootstrap.registry;
  var catalogs = Object.create(null);
  catalogs[ENGLISH] = bootstrap.english;
  var activeLocale = ENGLISH;
  var suggestedLocale = ENGLISH;
  var activeCatalog = Object.create(null);
  var observer = null;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* locale still applies for this visit */ }
  }

  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (_) { /* ignore unavailable storage */ }
  }

  function localeUrl(file) {
    return '/assets/i18n/' + file + '?v=1';
  }

  function fetchJson(url) {
    return window.fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load ' + url);
      return response.json();
    });
  }

  function localeByTag(tag) {
    if (!registry || !tag) return null;
    var normalized = String(tag).toLowerCase();
    return registry.locales.find(function (locale) {
      return locale.tag.toLowerCase() === normalized;
    }) || null;
  }

  function supportedBrowserLocale() {
    var candidates = Array.isArray(window.navigator.languages) && window.navigator.languages.length
      ? window.navigator.languages
      : [window.navigator.language || ''];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = String(candidates[i]).toLowerCase();
      var exact = registry.locales.find(function (locale) {
        return locale.status === 'ready' && locale.tag.toLowerCase() === candidate;
      });
      if (exact) return exact.tag;
      var base = candidate.split('-')[0];
      var matching = registry.locales.find(function (locale) {
        return locale.status === 'ready' && locale.tag.toLowerCase().split('-')[0] === base;
      });
      if (matching) return matching.tag;
    }
    return ENGLISH;
  }

  function substitute(template, params) {
    return String(template).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, function (whole, key) {
      return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole;
    });
  }

  function t(key, params) {
    var value = activeCatalog[key] || catalogs[ENGLISH] && catalogs[ENGLISH][key] || key;
    return substitute(value, params);
  }

  function applyValue(element, attribute, key, params) {
    if (!element.hasAttribute(attribute)) return;
    var value = t(element.getAttribute(attribute), params);
    if (attribute === 'data-i18n') {
      if (element.closest('pre, code, script, style, [contenteditable="true"], [data-no-translate]')) return;
      if (element.children.length === 0 && element.textContent !== value) element.textContent = value;
    } else {
      var target = attribute === 'data-i18n-aria-label' ? 'aria-label'
        : attribute === 'data-i18n-title' ? 'title'
          : attribute === 'data-i18n-placeholder' ? 'placeholder' : null;
      if (target) element.setAttribute(target, value);
    }
  }

  function translateElement(element) {
    if (!element || element.nodeType !== 1) return;
    var params = {};
    if (element.hasAttribute('data-i18n-params')) {
      try { params = JSON.parse(element.getAttribute('data-i18n-params')); } catch (_) { params = {}; }
    }
    ['data-i18n', 'data-i18n-aria-label', 'data-i18n-title', 'data-i18n-placeholder'].forEach(function (attribute) {
      applyValue(element, attribute, element.getAttribute(attribute), params);
    });
    element.querySelectorAll('[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-placeholder]').forEach(function (child) {
      translateElement(child);
    });
  }

  function applyLocale(tag, catalog) {
    activeLocale = tag;
    activeCatalog = catalog;
    document.documentElement.lang = tag;
    var item = localeByTag(tag);
    var direction = item && item.direction === 'rtl' ? 'rtl' : 'ltr';
    document.documentElement.dir = direction;
    document.querySelectorAll('pre, code, [data-code], .code-block').forEach(function (element) {
      element.dir = 'ltr';
    });
    translateElement(document.body);
    window.dispatchEvent(new CustomEvent('pypath:localechange', { detail: { locale: tag, direction: direction } }));
  }

  function loadCatalog(tag) {
    if (catalogs[tag]) return Promise.resolve(catalogs[tag]);
    return fetchJson(localeUrl(tag + '.json')).then(function (catalog) {
      if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('Invalid locale catalog');
      catalogs[tag] = catalog;
      return catalog;
    });
  }

  function activate(tag, persist) {
    var item = localeByTag(tag);
    if (!item || item.status !== 'ready') return Promise.resolve(false);
    return loadCatalog(item.tag).then(function (catalog) {
      if (item.tag !== ENGLISH && !catalogs[ENGLISH]) throw new Error('English fallback catalog unavailable');
      applyLocale(item.tag, catalog);
      if (persist) storageSet(STORAGE_KEY, item.tag);
      return true;
    }).catch(function () {
      if (item.tag !== ENGLISH && catalogs[ENGLISH]) {
        applyLocale(ENGLISH, catalogs[ENGLISH]);
        storageRemove(STORAGE_KEY);
      }
      return false;
    });
  }

  function init() {
    suggestedLocale = supportedBrowserLocale();
    var saved = storageGet(STORAGE_KEY);
    var savedItem = localeByTag(saved);
    var target = savedItem && savedItem.status === 'ready' ? savedItem.tag : suggestedLocale;
    if (saved && (!savedItem || savedItem.status !== 'ready')) storageRemove(STORAGE_KEY);
    return activate(target, false).then(function (activated) {
      if (!activated) applyLocale(ENGLISH, catalogs[ENGLISH]);
    }).then(function () {
      if (observer || !document.body || !window.MutationObserver) return;
      observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) translateElement(node);
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  var api = {
    ready: Promise.resolve(),
    getLocale: function () { return activeLocale; },
    setLocale: function (tag) { return activate(tag, true); },
    t: t,
    getLocales: function () { return registry ? registry.locales.slice() : []; },
    getCountryAliases: function () { return registry && Array.isArray(registry.countryAliases) ? registry.countryAliases.slice() : []; },
    getSuggestedLocale: function () { return suggestedLocale; }
  };
  window.PyPathI18n = api;
  api.ready = document.readyState === 'loading'
    ? new Promise(function (resolve) { document.addEventListener('DOMContentLoaded', function () { init().then(resolve); }, { once: true }); })
    : init();
  return api;
}
