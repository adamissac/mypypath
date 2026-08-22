/* PyPath — "what your teacher can see", rendered before anyone joins a class.
 *
 * The list comes from classroom-core.js rather than being written into the
 * page, so this panel, privacy.html and the dashboard cannot end up describing
 * three different things. If the feature starts collecting something new, the
 * only way to ship it is to add it here too, where a joining student reads it.
 */
(function () {
  'use strict';

  var CORE = window.PyPathClassroom;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function list(items, className) {
    var ul = el('ul', className);
    items.forEach(function (item) { ul.appendChild(el('li', null, item)); });
    return ul;
  }

  function render(host) {
    if (!CORE || !host || host.querySelector('.disclosure')) return;

    var panel = el('section', 'disclosure');
    panel.setAttribute('aria-labelledby', 'disclosure-heading');

    var heading = el('h3', 'disclosure__title', 'What your teacher will be able to see');
    heading.id = 'disclosure-heading';
    panel.appendChild(heading);

    panel.appendChild(list(CORE.TEACHER_CAN_SEE, 'disclosure__list disclosure__list--yes'));

    panel.appendChild(el('h3', 'disclosure__title', 'What they cannot see'));
    panel.appendChild(list(CORE.TEACHER_CANNOT_SEE, 'disclosure__list disclosure__list--no'));

    panel.appendChild(el(
      'p', 'disclosure__note',
      'Nothing is shared until you enter a join code. If you leave the class, '
      + 'the class copy of your work is deleted, and your own progress is untouched. '
      + 'Class records are deleted after ' + CORE.RETENTION.EVENT_DAYS + ' days.'
    ));

    host.appendChild(panel);
  }

  function init() {
    document.querySelectorAll('[data-join-disclosure]').forEach(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PyPathDisclosure = { render: render };
})();
