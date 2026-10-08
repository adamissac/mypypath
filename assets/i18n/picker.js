export function startLanguagePicker() {
  'use strict';

  var api = window.PyPathI18n;
  if (!api) return;
  var dialog;
  var search;
  var list;
  var status;
  var closeButton;
  var opener;
  var firstVisit = false;
  var lastFocus = null;
  var backgroundStates = [];

  function fold(value) {
    return String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
  }

  function makeDialog() {
    if (document.querySelector('#language-dialog')) return document.querySelector('#language-dialog');
    var shell = document.createElement('div');
    shell.id = 'language-dialog';
    shell.className = 'language-dialog';
    shell.hidden = true;
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-labelledby', 'language-title');
    shell.innerHTML =
      '<div class="language-dialog__scrim" data-language-scrim></div>' +
      '<section class="language-dialog__panel" role="document">' +
        '<button class="language-dialog__close" type="button" data-language-close></button>' +
        '<p class="language-dialog__eyebrow">PyPath</p>' +
        '<h2 id="language-title" data-i18n="picker.title"></h2>' +
        '<p class="language-dialog__description" data-i18n="picker.description"></p>' +
        '<label class="language-dialog__search-label" for="language-search" data-i18n="picker.search"></label>' +
        '<input id="language-search" type="search" autocomplete="off" aria-controls="language-list" />' +
        '<p class="language-dialog__status" data-language-status aria-live="polite"></p>' +
        '<div id="language-list" class="language-dialog__list" role="listbox" aria-labelledby="language-title"></div>' +
        '<p class="language-dialog__error" data-language-error role="status" hidden></p>' +
        '<button class="language-dialog__continue" type="button" data-language-continue></button>' +
      '</section>';
    document.body.appendChild(shell);
    return shell;
  }

  function localized(key) {
    return api.t(key);
  }

  function countryMatches(locale, query) {
    return api.getCountryAliases().some(function (country) {
      return country.locales.indexOf(locale.tag) >= 0 && fold(country.name).indexOf(query) >= 0;
    });
  }

  function matches(locale, query) {
    if (!query) return true;
    var own = [locale.nativeName, locale.englishName, locale.tag].concat(locale.aliases || []);
    return own.some(function (value) { return fold(value).indexOf(query) >= 0; }) || countryMatches(locale, query);
  }

  function render() {
    var query = fold(search.value.trim());
    var locales = api.getLocales().filter(function (locale) { return matches(locale, query); });
    var active = api.getLocale();
    list.textContent = '';
    locales.forEach(function (locale) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'language-option';
      button.dataset.languageOption = '';
      button.dataset.locale = locale.tag;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', locale.tag === active ? 'true' : 'false');
      button.disabled = locale.status !== 'ready';
      var names = document.createElement('span');
      names.className = 'language-option__names';
      names.textContent = locale.nativeName + (locale.nativeName === locale.englishName ? '' : ' · ' + locale.englishName);
      var availability = document.createElement('span');
      availability.className = 'language-option__availability';
      availability.textContent = locale.status !== 'ready'
        ? localized('picker.comingSoon')
        : locale.tag === api.getSuggestedLocale() ? localized('picker.recommended')
          : locale.tag === active ? '✓' : '';
      button.appendChild(names);
      button.appendChild(availability);
      list.appendChild(button);
    });
    status.textContent = api.t('picker.searchStatus', { count: locales.length });
    if (locales.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'language-dialog__empty';
      empty.textContent = localized('picker.noResults');
      list.appendChild(empty);
    }
  }

  function setBackgroundInert(disabled) {
    if (disabled) {
      backgroundStates = [];
      Array.from(document.body.children).forEach(function (element) {
        if (element === dialog) return;
        backgroundStates.push({ element: element, inert: element.hasAttribute('inert'), ariaHidden: element.getAttribute('aria-hidden') });
        element.setAttribute('inert', '');
        element.setAttribute('aria-hidden', 'true');
      });
      return;
    }
    backgroundStates.forEach(function (state) {
      if (!state.inert) state.element.removeAttribute('inert');
      if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
      else state.element.setAttribute('aria-hidden', state.ariaHidden);
    });
    backgroundStates = [];
  }

  function hasSavedLocale() {
    try { return !!window.localStorage.getItem('pypath.locale'); } catch (_) { return false; }
  }

  function show(opening) {
    if (!dialog || !opener) return;
    lastFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('language-dialog-open');
    setBackgroundInert(true);
    closeButton.hidden = firstVisit;
    opener.setAttribute('aria-expanded', 'true');
    search.value = '';
    render();
    search.focus();
    if (!opening) dialog.dataset.returnFocus = 'true';
  }

  function hide() {
    if (!dialog || firstVisit || !hasSavedLocale()) return;
    dialog.hidden = true;
    document.body.classList.remove('language-dialog-open');
    setBackgroundInert(false);
    opener.setAttribute('aria-expanded', 'false');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function choose(tag) {
    api.setLocale(tag).then(function (success) {
      if (!success) {
        var error = dialog.querySelector('[data-language-error]');
        error.textContent = localized('status.translationFallback');
        error.hidden = false;
        return;
      }
      firstVisit = false;
      closeButton.hidden = false;
      dialog.hidden = true;
      document.body.classList.remove('language-dialog-open');
      setBackgroundInert(false);
      opener.setAttribute('aria-expanded', 'false');
      render();
      if (opener && typeof opener.focus === 'function') opener.focus();
    });
  }

  function init() {
    opener = document.querySelector('[data-language-open]');
    if (!opener) {
      var header = document.querySelector('.header-end');
      if (header) {
        opener = document.createElement('button');
        opener.type = 'button';
        opener.className = 'language-trigger';
        opener.dataset.languageOpen = '';
        opener.setAttribute('aria-haspopup', 'dialog');
        opener.setAttribute('aria-expanded', 'false');
        opener.dataset.i18n = 'picker.open';
        header.insertBefore(opener, header.firstChild);
      }
    }
    if (!opener) return;
    opener.setAttribute('aria-haspopup', 'dialog');
    opener.setAttribute('aria-expanded', 'false');
    opener.setAttribute('aria-label', localized('picker.openLabel'));
    opener.setAttribute('title', localized('picker.openLabel'));
    if (!opener.querySelector('.language-trigger__icon')) {
      opener.textContent = '';
      var icon = document.createElement('span');
      icon.className = 'language-trigger__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '文A';
      var label = document.createElement('span');
      label.className = 'language-trigger__label';
      label.dataset.i18n = 'picker.open';
      label.textContent = localized('picker.open');
      opener.appendChild(icon);
      opener.appendChild(label);
    }
    dialog = makeDialog();
    search = dialog.querySelector('#language-search');
    list = dialog.querySelector('#language-list');
    status = dialog.querySelector('[data-language-status]');
    closeButton = dialog.querySelector('[data-language-close]');
    closeButton.textContent = localized('picker.close');
    closeButton.setAttribute('aria-label', localized('picker.close'));
    dialog.querySelector('[data-language-continue]').textContent = localized('picker.continueEnglish');
    firstVisit = !hasSavedLocale();
    opener.addEventListener('click', function () { show(false); });
    closeButton.addEventListener('click', hide);
    dialog.querySelector('[data-language-scrim]').addEventListener('click', hide);
    dialog.querySelector('[data-language-continue]').addEventListener('click', function () { choose('en'); });
    search.addEventListener('input', render);
    list.addEventListener('click', function (event) {
      var button = event.target.closest('[data-language-option]');
      if (button && !button.disabled) choose(button.dataset.locale);
    });
    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
      }
      if (event.key === 'Tab') {
        var focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')).filter(function (item) { return !item.hidden; });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    render();
    if (firstVisit) show(true);
  }

  var picker = { ready: Promise.resolve() };
  window.PyPathLanguagePicker = picker;
  picker.ready = api.ready.then(function () {
    return new Promise(function (resolve) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); resolve(); }, { once: true });
      else { init(); resolve(); }
    });
  });
  return picker;
}
