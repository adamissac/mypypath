/* PyPath — drawing the four question types question-types.js knows how to mark.
 *
 * DOM only. Every marking rule lives in question-types.js, so this file can be
 * wrong about a border and never about a score.
 *
 * Dragging progressively enhances matching and ordering. Native selects,
 * tap-to-place buttons and move controls keep every answer keyboard accessible.
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

  /* The legend, which is the question as a screen reader announces it and as a
     sighted learner reads the heading.

     `label` wins where an author gave one, and a fill-the-blank question needs
     to: its prompt IS the code, gaps and all, and renderBlank draws that code
     underneath. Without a separate label the legend repeated the whole snippet
     above the boxes -- "3. Fill the blank so the loop counts 0, 1, 2: for i in
     ___(5): print(i)" -- which reads as a stutter and announces the gaps twice.
     Falling back to the first line keeps every question authored before this
     working unchanged. */
  function legendText(question) {
    if (question.label) return String(question.label);
    return String(question.prompt || '').split('\n')[0];
  }

  function fieldset(question, index) {
    var set = document.createElement('fieldset');
    set.className = 'quiz-q__set';
    var legend = document.createElement('legend');
    legend.className = 'quiz-q__prompt';
    legend.textContent = (index + 1) + '. ' + legendText(question);
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
    var selected = null;
    var dragging = null;
    var bank = el('div', 'quiz-match__bank');
    var status = el('p', 'quiz-activity-status');
    status.setAttribute('role', 'status');
    set.appendChild(el('p', 'quiz-q__hint', 'Drag an answer onto a row, or tap an answer then Place answer. You can also use each dropdown.'));
    (question.right || []).forEach(function (answer, j) {
      var chip = el('button', 'quiz-match__chip', answer);
      chip.type = 'button';
      chip.draggable = true;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        selected = j;
        Array.from(bank.children).forEach(function (button, n) {
          button.setAttribute('aria-pressed', String(n === j));
        });
        status.textContent = 'Selected ' + answer + '. Choose a row to place it.';
      });
      chip.addEventListener('dragstart', function (event) {
        dragging = j;
        if (event.dataTransfer) {
          event.dataTransfer.setData('text/plain', answer);
          event.dataTransfer.effectAllowed = 'copy';
        }
      });
      chip.addEventListener('dragend', function () { dragging = null; });
      bank.appendChild(chip);
    });
    set.appendChild(bank);

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

      function place(value) {
        if (value === null) {
          status.textContent = 'Choose an answer from the bank first.';
          return;
        }
        select.value = String(value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        status.textContent = item + ': ' + question.right[value] + '.';
      }
      var target = el('button', 'quiz-match__place', 'Drop or place answer');
      target.type = 'button';
      target.setAttribute('aria-label', 'Place selected answer for ' + item);
      target.addEventListener('click', function () { place(selected); });
      row.addEventListener('dragover', function (event) {
        if (dragging !== null) event.preventDefault();
      }, true);
      row.addEventListener('drop', function (event) {
        if (dragging === null) return;
        event.preventDefault();
        place(dragging);
        dragging = null;
      }, true);
      row.appendChild(label);
      row.appendChild(select);
      row.appendChild(target);
      list.appendChild(row);
      selects.push(select);
    });

    set.appendChild(list);
    set.appendChild(status);
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
      'Drag the lines into order, or use the Move up and Move down buttons.'));

    var items = question.items || [];
    var list = el('ol', 'quiz-order');
    var order = shuffled(items, rand);
    if (question.answer && order.length > 1 && order.every(function (v, i) { return v === question.answer[i]; })) {
      order.push(order.shift());
    }
    var dragging = null;
    var status = el('p', 'quiz-activity-status');
    status.setAttribute('role', 'status');
    function move(from, to) {
      var moved = order.splice(from, 1)[0];
      order.splice(to, 0, moved);
      draw();
      status.textContent = 'Moved line to position ' + (to + 1) + ' of ' + order.length + '.';
      set.dispatchEvent(new Event('change', { bubbles: true }));
      var next = list.children[to].querySelector('.quiz-order__move:not([disabled])');
      if (next) next.focus();
    }

    function draw() {
      list.innerHTML = '';
      order.forEach(function (itemIndex, position) {
        var row = el('li', 'quiz-order__row');
        row.draggable = true;
        row.addEventListener('dragstart', function (event) {
          dragging = position;
          if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', items[itemIndex]);
            event.dataTransfer.effectAllowed = 'move';
          }
        });
        row.addEventListener('dragend', function () { dragging = null; });
        row.addEventListener('dragover', function (event) {
          if (dragging !== null) event.preventDefault();
        });
        row.addEventListener('drop', function (event) {
          if (dragging === null) return;
          event.preventDefault();
          var from = dragging;
          dragging = null;
          move(from, position);
        });
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
            move(position, position + pair[1]);
          });
          controls.appendChild(button);
        });

        row.appendChild(controls);
        list.appendChild(row);
      });
    }

    draw();
    set.appendChild(list);
    set.appendChild(status);
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
    // The code half only: the sentence before it is the legend's job, and
    // printing it twice is what `label` exists to avoid.
    var source = question.code != null ? String(question.code) : String(question.prompt || '');
    var pieces = source.split('___');
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
    renderBlank: renderBlank,
    legendText: legendText
  };
})();
