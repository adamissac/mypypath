/* PyPath — a dropdown whose open list we actually control.

   `appearance: none` styles the closed box of a <select> and nothing else: the
   list that drops down is drawn by the operating system, so on the teacher
   dashboard a carefully styled control opened into a grey platform menu. This
   replaces that list with markup, and leaves the <select> itself in the DOM as
   the source of truth.

   That last part is deliberate. classroom-dashboard.js reads and writes
   `.value` on these selects and rebuilds their <option> lists as classes and
   assignments load; none of it knows this file exists, and none of it had to
   change. The menu observes the select and repaints. If this script never
   runs, the native control is still sitting there, still working. */
(function () {
  'use strict';

  var openMenu = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var uid = 0;
  function nextId(prefix) {
    uid += 1;
    return prefix + '-' + uid;
  }

  function build(select) {
    if (select.dataset.selMenu === 'on') return;
    // A multiple-select is a different control with a different affordance;
    // collapsing one into a single-value trigger would lie about it.
    if (select.multiple || select.size > 1) return;
    select.dataset.selMenu = 'on';

    var wrap = el('div', 'sel');
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    // The native control stays for its value and its form behaviour, out of
    // the tab order so the page does not offer two stops for one choice.
    select.classList.add('sel__native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    var panelId = nextId('sel-panel');
    var trigger = el('button', 'sel__trigger');
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panelId);

    var value = el('span', 'sel__value');
    trigger.appendChild(value);
    trigger.appendChild(el('span', 'sel__chevron'));

    // Whatever named the select has to name the button now, or the control
    // loses its label to a hidden element.
    var labelled = select.id && document.querySelector('label[for="' + select.id + '"]');
    if (labelled) {
      if (!labelled.id) labelled.id = nextId('sel-label');
      trigger.setAttribute('aria-labelledby', labelled.id);
    } else if (select.getAttribute('aria-label')) {
      trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    }

    var panel = el('div', 'sel__panel');
    panel.id = panelId;
    panel.setAttribute('role', 'listbox');
    panel.hidden = true;

    var list = el('div', 'sel__list');
    panel.appendChild(list);

    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    var active = -1;
    var typed = '';
    var typedAt = 0;

    function options() {
      return Array.prototype.slice.call(list.children);
    }

    function paint() {
      list.innerHTML = '';
      var opts = Array.prototype.slice.call(select.options);
      opts.forEach(function (opt, i) {
        var row = el('div', 'sel__option', opt.textContent);
        row.id = panelId + '-o' + i;
        row.setAttribute('role', 'option');
        row.dataset.value = opt.value;
        row.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
        if (opt.disabled) row.setAttribute('aria-disabled', 'true');
        list.appendChild(row);
      });

      var current = select.options[select.selectedIndex];
      value.textContent = current ? current.textContent : '';
      wrap.classList.toggle('is-empty', opts.length === 0);

      // A disabled lens is still a control; it says so rather than vanishing.
      trigger.disabled = select.disabled;
      wrap.classList.toggle('is-disabled', select.disabled);
    }

    function markActive(i) {
      var rows = options();
      if (!rows.length) return;
      if (i < 0) i = 0;
      if (i > rows.length - 1) i = rows.length - 1;
      active = i;
      rows.forEach(function (row, n) {
        row.classList.toggle('is-active', n === i);
      });
      trigger.setAttribute('aria-activedescendant', rows[i].id);
      var row = rows[i];
      var top = row.offsetTop;
      var bottom = top + row.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    }

    function open() {
      if (select.disabled || !select.options.length) return;
      if (openMenu && openMenu !== close) openMenu();
      openMenu = close;
      panel.hidden = false;
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      markActive(select.selectedIndex < 0 ? 0 : select.selectedIndex);
    }

    function close(focus) {
      panel.hidden = true;
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      if (openMenu === close) openMenu = null;
      if (focus) trigger.focus();
    }

    function choose(i) {
      var opt = select.options[i];
      if (!opt || opt.disabled) return;
      select.selectedIndex = i;
      paint();
      // The rest of the dashboard listens on the select, not on this menu.
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    }

    trigger.addEventListener('click', function () {
      if (panel.hidden) open();
      else close(true);
    });

    trigger.addEventListener('keydown', function (ev) {
      var key = ev.key;
      if (key === 'Escape') {
        if (!panel.hidden) { ev.preventDefault(); close(true); }
        return;
      }
      if (key === 'Tab') {
        if (!panel.hidden) close(false);
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        ev.preventDefault();
        if (panel.hidden) { open(); return; }
        if (key === 'ArrowDown') markActive(active + 1);
        else if (key === 'ArrowUp') markActive(active - 1);
        else if (key === 'Home') markActive(0);
        else markActive(options().length - 1);
        return;
      }
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        ev.preventDefault();
        if (panel.hidden) open();
        else choose(active);
        return;
      }
      // Typeahead, the one thing a native select does that people miss.
      if (key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        var now = Date.now();
        typed = now - typedAt > 900 ? key : typed + key;
        typedAt = now;
        var want = typed.toLowerCase();
        for (var i = 0; i < select.options.length; i++) {
          if (select.options[i].textContent.toLowerCase().indexOf(want) === 0) {
            if (panel.hidden) choose(i);
            else markActive(i);
            break;
          }
        }
      }
    });

    list.addEventListener('mousemove', function (ev) {
      var row = ev.target.closest('.sel__option');
      if (row) markActive(options().indexOf(row));
    });

    list.addEventListener('click', function (ev) {
      var row = ev.target.closest('.sel__option');
      if (row) choose(options().indexOf(row));
    });

    document.addEventListener('mousedown', function (ev) {
      if (!panel.hidden && !wrap.contains(ev.target)) close(false);
    });

    // Options arrive later: the class list, the lesson list for a unit, and
    // the assignment list are all filled once Firestore answers. The menu
    // follows the select rather than being told about any of it.
    new MutationObserver(function () {
      paint();
      if (!panel.hidden) markActive(select.selectedIndex < 0 ? 0 : select.selectedIndex);
    }).observe(select, { childList: true, subtree: true, attributes: true,
                         attributeFilter: ['disabled', 'value'] });

    select.addEventListener('change', paint);
    paint();
  }

  function scan(root) {
    (root || document).querySelectorAll('.cr select').forEach(build);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }

  // The dashboard swaps whole views in and out; a select can appear after the
  // first scan.
  new MutationObserver(function () { scan(); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.PyPathSelectMenu = { scan: scan };
})();
