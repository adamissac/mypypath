/* PyPath — drawing the four question types question-types.js knows how to mark.
 *
 * DOM only. Every marking rule lives in question-types.js, so this file can be
 * wrong about a border and never about a score.
 *
 * One rule shaped all four: they are answered with a keyboard. Matching is a
 * select per row and ordering is a pair of move buttons, not drag and drop.
 * Drag and drop photographs better and excludes anyone on a phone, anyone using
 * a screen reader, and anyone whose hands do not do fine pointer work. A
 * Parsons problem that some learners cannot attempt is not a Parsons problem.
 *
 * Each renderer returns { node, read }. `read` collects the current answer in
 * the shape the matching scorer expects, so the caller never has to know how
 * the type was drawn.
 */
(function () {
  'use strict';

  var Q = window.PyPathQuestions;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fieldset(question, index) {
    var set = document.createElement('fieldset');
    set.className = 'quiz-q__set';
    var legend = document.createElement('legend');
    legend.className = 'quiz-q__prompt';
    legend.textContent = (index + 1) + '. ' + (question.prompt || '');
    set.appendChild(legend);
    return set;
  }

  /* ---------------------------------------------------------- multi-select */

  function renderMulti(question, index) {
    var set = fieldset(question, index);
    // Said out loud, because a checkbox that looks like a radio is a checkbox
    // a learner ticks once and moves on from.
    set.appendChild(el('p', 'quiz-q__hint', 'Choose all that apply.'));

    var name = 'q-' + question.id;
    var boxes = [];
    (question.choices || []).forEach(function (choice, i) {
      var row = el('div', 'quiz-choice');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.id = name + '-' + i;
      input.value = String(i);
      var label = document.createElement('label');
      label.setAttribute('for', input.id);
      label.textContent = choice;
      row.appendChild(input);
      row.appendChild(label);
      set.appendChild(row);
      boxes.push(input);
    });

    return {
      node: set,
      read: function () {
        return boxes
          .map(function (b, i) { return b.checked ? i : -1; })
          .filter(function (i) { return i >= 0; });
      }
    };
  }

  /* --------------------------------------------------------------- matching */

  function renderMatch(question, index) {
    var set = fieldset(question, index);
    var list = el('ol', 'quiz-match');
    var selects = [];

    (question.left || []).forEach(function (item, i) {
      var row = el('li', 'quiz-match__row');
      var id = 'q-' + question.id + '-' + i;

      var label = document.createElement('label');
      label.setAttribute('for', id);
      label.className = 'quiz-match__left';
      label.textContent = item;

      var select = document.createElement('select');
      select.id = id;
      select.className = 'quiz-match__pick';
      // An empty first option, so an unanswered row is visibly unanswered
      // rather than silently defaulting to whatever happened to be first.
      var blank = el('option', null, 'Choose...');
      blank.value = '';
      select.appendChild(blank);
      (question.right || []).forEach(function (option, j) {
        var opt = el('option', null, option);
        opt.value = String(j);
        select.appendChild(opt);
      });

      row.appendChild(label);
      row.appendChild(select);
      list.appendChild(row);
      selects.push(select);
    });

    set.appendChild(list);
    return {
      node: set,
      read: function () {
        return selects.map(function (s) { return s.value === '' ? null : Number(s.value); });
      }
    };
  }

  /* --------------------------------------------------------------- ordering */

  /* The shuffle takes its randomness as an argument, the same way
     pickQuestions in unit-test.js does, so a test can pin the starting order.
     A Parsons problem presented in the right order is not a question. */
  function shuffled(items, rand) {
    var r = typeof rand === 'function' ? rand : Math.random;
    var order = items.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      if (!(j >= 0 && j <= i)) j = 0;
      var tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    // An accidental correct shuffle hands the answer over, so nudge it.
    var same = order.every(function (v, i) { return v === i; });
    if (same && order.length > 1) {
      var head = order[0];
      order[0] = order[1];
      order[1] = head;
    }
    return order;
  }

  function renderOrder(question, index, rand) {
    var set = fieldset(question, index);
    set.appendChild(el('p', 'quiz-q__hint',
      'Put the lines in order. Use the arrows, or Tab to a line and press them.'));

    var items = question.items || [];
    var list = el('ol', 'quiz-order');
    var order = shuffled(items, rand);

    function draw() {
      list.innerHTML = '';
      order.forEach(function (itemIndex, position) {
        var row = el('li', 'quiz-order__row');
        // pre, not a span: leading whitespace is the answer in Python and a
        // normal element would collapse it away.
        var code = el('pre', 'quiz-order__code', items[itemIndex]);
        row.appendChild(code);

        var controls = el('div', 'quiz-order__moves');
        [['Move up', -1], ['Move down', 1]].forEach(function (pair) {
          var button = el('button', 'quiz-order__move', pair[1] < 0 ? '^' : 'v');
          button.type = 'button';
          button.setAttribute('aria-label', pair[0] + ': ' + items[itemIndex]);
          button.disabled = (pair[1] < 0 && position === 0)
            || (pair[1] > 0 && position === order.length - 1);
          button.addEventListener('click', function () {
            var to = position + pair[1];
            var moved = order[position];
            order[position] = order[to];
            order[to] = moved;
            draw();
            // Focus follows the line that moved, or the keyboard user loses
            // their place on every press.
            var rows = list.querySelectorAll('.quiz-order__row');
            var next = rows[to] && rows[to].querySelector('.quiz-order__move:not([disabled])');
            if (next) next.focus();
          });
          controls.appendChild(button);
        });

        row.appendChild(controls);
        list.appendChild(row);
      });
    }

    draw();
    set.appendChild(list);
    return { node: set, read: function () { return order.slice(); } };
  }

  /* ------------------------------------------------------ fill in the blank */

  function renderBlank(question, index) {
    var set = fieldset(question, index);
    var blanks = question.blanks || [];
    var inputs = [];

    // The prompt is split on ___ so the boxes sit where the gaps are, rather
    // than in a list underneath asking the learner to count.
    var body = el('pre', 'quiz-blank');
    var pieces = String(question.prompt || '').split('___');
    pieces.forEach(function (piece, i) {
      body.appendChild(document.createTextNode(piece));
      if (i >= pieces.length - 1) return;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'quiz-blank__input';
      input.size = 8;
      input.autocapitalize = 'off';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Blank ' + (i + 1) + ' of ' + (pieces.length - 1));
      body.appendChild(input);
      inputs.push(input);
    });

    // An author whose prompt has fewer gaps than blanks still gets a box for
    // every blank, rather than a question that cannot be completed.
    while (inputs.length < blanks.length) {
      var extra = document.createElement('input');
      extra.type = 'text';
      extra.className = 'quiz-blank__input';
      extra.setAttribute('aria-label', 'Blank ' + (inputs.length + 1));
      body.appendChild(extra);
      inputs.push(extra);
    }

    set.appendChild(body);
    return {
      node: set,
      read: function () { return inputs.map(function (i) { return i.value; }); }
    };
  }

  var RENDERERS = {
    multi: renderMulti,
    match: renderMatch,
    order: renderOrder,
    blank: renderBlank
  };

  function render(question, index, rand) {
    var kind = Q ? Q.kindOfQuestion(question) : 'mcq';
    var make = RENDERERS[kind];
    return make ? make(question, index, rand) : null;
  }

  window.PyPathQuestionRender = {
    render: render,
    shuffled: shuffled,
    renderMulti: renderMulti,
    renderMatch: renderMatch,
    renderOrder: renderOrder,
    renderBlank: renderBlank
  };
})();
