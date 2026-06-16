(function () {
  'use strict';

  var UNIT_NAMES = [
    'Foundations',
    'Control Flow',
    'Functions',
    'Data Structures',
    'Modules & Packages',
    'OOP',
    'Files & Errors',
    'Testing',
    'APIs',
    'Certification Prep'
  ];

  var CHEVRON =
    '<svg class="dd-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function isActive(re) {
    return re.test(window.location.pathname);
  }

  function unitsActive() {
    return /\/units\//.test(window.location.pathname);
  }

  function currentUnitNum() {
    var m = window.location.pathname.match(/\/units\/unit-(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function unitMenuItems() {
    var current = currentUnitNum();
    var html = '';
    for (var i = 0; i < 10; i++) {
      var num = i + 1;
      var href = '/units/unit-' + num + '.html';
      var active = current === num ? ' is-current' : '';
      html +=
        '<li role="none">' +
          '<a role="menuitem" href="' + href + '" class="dd-item route' + active + '">' +
            '<span class="dd-item__num">' + num + '</span>' +
            '<span class="dd-item__body">' +
              '<span class="dd-item__title">' + UNIT_NAMES[i] + '</span>' +
              '<span class="dd-item__meta">Unit ' + num + '</span>' +
            '</span>' +
          '</a>' +
        '</li>';
    }
    return html;
  }

  function unitsDropdown() {
    var btnActive = unitsActive() ? ' aria-current="page"' : '';
    return (
      '<li class="dd dd--nav" data-dd>' +
        '<button type="button" class="dd-trigger" id="nav-units-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="nav-units-panel"' + btnActive + '>' +
          '<span>Units</span>' + CHEVRON +
        '</button>' +
        '<div class="dd-panel" id="nav-units-panel" role="menu" aria-labelledby="nav-units-btn" hidden>' +
          '<div class="dd-panel__head">' +
            '<span class="dd-panel__label">Curriculum</span>' +
            '<span class="dd-panel__hint">10 units</span>' +
          '</div>' +
          '<ul class="dd-panel__list dd-panel__list--grid">' +
            unitMenuItems() +
          '</ul>' +
        '</div>' +
      '</li>'
    );
  }

  function headerHtml(showProgress) {
    var homeActive = isActive(/^\/$|\/index\.html$/) ? ' active' : '';
    var sandboxActive = isActive(/sandbox\.html$/) ? ' active' : '';
    var certsActive = isActive(/certifications\.html$/) ? ' active' : '';
    var aboutActive = isActive(/about\.html$/) ? ' active' : '';
    var settingsActive = isActive(/settings\.html$/) ? ' active' : '';

    var progress = showProgress
      ? '<div class="container"><div class="progress-global" aria-label="Course progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar"></div></div></div>'
      : '';

    return (
      '<header class="site-header">' +
        '<div class="container nav">' +
          '<a class="brand route" href="/">' +
            '<img src="/assets/img/pyPathLogo.png" alt="PyPath Logo" class="logo" width="36" height="36">' +
            '<span class="brand-text">PyPath</span>' +
          '</a>' +
          '<nav class="primary-nav" aria-label="Primary" aria-expanded="false">' +
            '<button type="button" class="mobile-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-menu">' +
              '<span class="mobile-toggle-bar" aria-hidden="true"></span>' +
              '<span class="mobile-toggle-bar" aria-hidden="true"></span>' +
              '<span class="mobile-toggle-bar" aria-hidden="true"></span>' +
            '</button>' +
            '<ul class="menu" id="primary-menu">' +
              '<li><a href="/" class="route' + homeActive + '">Home</a></li>' +
              unitsDropdown() +
              '<li><a href="/sandbox.html" class="route' + sandboxActive + '">Sandbox</a></li>' +
              '<li><a href="/certifications.html" class="route' + certsActive + '">Certifications</a></li>' +
              '<li><a href="/about.html" class="route' + aboutActive + '">About</a></li>' +
              '<li><a href="/settings.html" class="route' + settingsActive + '">Settings</a></li>' +
            '</ul>' +
          '</nav>' +
        '</div>' +
        progress +
      '</header>'
    );
  }

  function footerHtml() {
    return (
      '<footer class="site-footer">' +
        '<div class="container footer-grid">' +
          '<div>' +
            '<a class="brand small route" href="/">' +
              '<img src="/assets/img/pyPathLogo.png" alt="" class="logo small" width="28" height="28">' +
              '<span class="brand-text">PyPath</span>' +
            '</a>' +
            '<p class="muted">&copy; <span id="year"></span> PyPath. All rights reserved.</p>' +
          '</div>' +
          '<nav aria-label="Footer">' +
            '<ul class="footer-links">' +
              '<li><a href="/curriculum.html" class="route">Curriculum</a></li>' +
              '<li><a href="/certifications.html" class="route">Certifications</a></li>' +
              '<li><a href="/about.html" class="route">About</a></li>' +
              '<li><a href="/settings.html" class="route">Settings</a></li>' +
              '<li><a href="/" class="route">Home</a></li>' +
            '</ul>' +
          '</nav>' +
        '</div>' +
      '</footer>'
    );
  }

  function inject() {
    var showProgress = document.body.classList.contains('page-home');
    var header = document.querySelector('header.site-header');
    var footer = document.querySelector('footer.site-footer');

    if (header && !(header.querySelector('[data-dd]') || header.querySelector('#nav-units-btn'))) {
      header.outerHTML = headerHtml(showProgress);
    }
    if (footer && !footer.querySelector('#year')) {
      footer.outerHTML = footerHtml();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    inject();
    document.dispatchEvent(new CustomEvent('pypath:layout-ready'));
  });
  window.PyLayout = { inject: inject };
})();
